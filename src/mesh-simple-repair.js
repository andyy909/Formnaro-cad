import { cadExportTriangleNormal } from './cad-export-triangles.js';
import { detectDefectPlane, repairPlanarSeam } from './mesh-planar-seam-repair.js';
import { boundaryRings, fillPlanarHole } from './mesh-hole-fill.js';
import { inspectMeshTopology } from './mesh-inspector.js';

export { detectDefectPlane, repairPlanarSeam };

function buildLocalTopology(mesh) {
  const verts = mesh.verts,
    triangles = mesh.triangles,
    vertexCount = verts.length / 3,
    faceCount = triangles.length / 3;
  const representatives = new Uint32Array(vertexCount);
  const posMap = new Map();
  for (let i = 0; i < vertexCount; i++) {
    const key = `${verts[i * 3]},${verts[i * 3 + 1]},${verts[i * 3 + 2]}`;
    let rep = posMap.get(key);
    if (rep === undefined) {
      rep = i;
      posMap.set(key, rep);
    }
    representatives[i] = rep;
  }
  const edges = new Map();
  for (let face = 0; face < faceCount; face++) {
    const base = face * 3;
    const vs = [representatives[triangles[base]], representatives[triangles[base + 1]], representatives[triangles[base + 2]]];
    for (let k = 0; k < 3; k++) {
      const a = vs[k],
        b = vs[(k + 1) % 3];
      if (a === b) continue;
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      let edge = edges.get(key);
      if (!edge) {
        edge = { a: Math.min(a, b), b: Math.max(a, b), incidents: [] };
        edges.set(key, edge);
      }
      edge.incidents.push({ face, dir: a < b ? 1 : -1 });
    }
  }
  return { mesh, triangles: faceCount, representatives, edges };
}

const fail = (message, code = 'MESH_SIMPLE_REPAIR') => {
  throw Object.assign(Error(message), { code });
};
const abort = (signal) => {
  if (signal?.aborted) throw Object.assign(Error('Netzreparatur abgebrochen.'), { name: 'AbortError' });
};
const tick = (i, signal) => {
  if (!(i % 1024)) abort(signal);
};
export function validateSimpleRepairOptions(o) {
  if (
    !o ||
    Object.getPrototypeOf(o) !== Object.prototype ||
    Object.keys(o).some(
      (k) =>
        ![
          'method',
          'geometryDigest',
          'removeDegenerate',
          'removeDuplicates',
          'orient',
          'repairPlanarSeam',
          'repairPlanarSeams',
          'smallTriangleLimit',
          'removeComponents',
        ].includes(k),
    ) ||
    o.method !== 'simple-v1' ||
    typeof o.geometryDigest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(o.geometryDigest) ||
    ['removeDegenerate', 'removeDuplicates', 'orient'].some((k) => typeof o[k] !== 'boolean') ||
    (o.repairPlanarSeam !== undefined && typeof o.repairPlanarSeam !== 'boolean') ||
    (o.repairPlanarSeams !== undefined && typeof o.repairPlanarSeams !== 'boolean') ||
    !Number.isSafeInteger(o.smallTriangleLimit) ||
    o.smallTriangleLimit < 0 ||
    o.smallTriangleLimit > 500000 ||
    !Array.isArray(o.removeComponents) ||
    o.removeComponents.length > 256 ||
    new Set(o.removeComponents).size !== o.removeComponents.length ||
    o.removeComponents.some((i) => !Number.isSafeInteger(i) || i < 0 || i >= 500000)
  )
    fail('Ungültige Optionen für die gezielte Netzreparatur.');
  return { ...o, removeComponents: [...o.removeComponents].sort((a, b) => a - b) };
}
function dsu(size) {
  const p = Uint32Array.from({ length: size }, (_, i) => i);
  const find = (i) => {
    while (p[i] !== i) {
      p[i] = p[p[i]];
      i = p[i];
    }
    return i;
  };
  return {
    find,
    join(a, b) {
      a = find(a);
      b = find(b);
      if (a !== b) p[Math.max(a, b)] = Math.min(a, b);
    },
  };
}
function components(topology, signal) {
  const links = dsu(topology.triangles);
  let i = 0;
  for (const edge of topology.edges.values()) {
    tick(i++, signal);
    const faces = edge.incidents;
    for (let j = 1; j < faces.length; j++) links.join(faces[0].face, faces[j].face);
  }
  const byRoot = new Map();
  for (let face = 0; face < topology.triangles; face++) {
    tick(face, signal);
    const id = links.find(face);
    if (!byRoot.has(id)) byRoot.set(id, []);
    byRoot.get(id).push(face);
  }
  const list = [...byRoot.values()].sort((a, b) => b.length - a.length || a[0] - b[0]),
    owners = new Map(),
    touching = new Set();
  for (let c = 0; c < list.length; c++)
    for (const face of list[c]) {
      tick(face, signal);
      for (let k = 0; k < 3; k++) {
        const v = topology.representatives[topology.mesh.triangles[face * 3 + k]],
          old = owners.get(v);
        if (old === undefined) owners.set(v, c);
        else if (old !== c) {
          touching.add(old);
          touching.add(c);
        }
      }
    }
  return { list, touching };
}
/** Bounded pages; identifiers are original first-triangle IDs, bound to SHA. */
export function simpleRepairCatalog(topology, { smallTriangleLimit = 20, offset = 0, signal } = {}) {
  if (
    !Number.isSafeInteger(smallTriangleLimit) ||
    smallTriangleLimit < 0 ||
    smallTriangleLimit > 500000 ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 500000
  )
    fail('Ungültige Grenze oder Seite für Nebenbestandteile.');
  const { list, touching } = components(topology, signal),
    candidates = [];
  for (let index = 1; index < list.length; index++)
    if (list[index].length <= smallTriangleLimit)
      candidates.push({
        id: list[index][0],
        triangleCount: list[index].length,
        touchesOther: touching.has(index),
        faces: list[index],
      });
  const page = candidates.slice(offset, offset + 128).map(({ faces, ...item }) => {
    const min = [Infinity, Infinity, Infinity],
      max = [-Infinity, -Infinity, -Infinity];
    for (const face of faces) {
      tick(face, signal);
      for (let k = 0; k < 3; k++) {
        const id = topology.mesh.triangles[face * 3 + k];
        for (let a = 0; a < 3; a++) {
          const v = topology.mesh.verts[id * 3 + a];
          min[a] = Math.min(min[a], v);
          max[a] = Math.max(max[a], v);
        }
      }
    }
    return { ...item, bounds: { min, max } };
  });
  abort(signal);
  return {
    format: 'FormnaroSimpleRepairCatalog',
    version: 1,
    geometryDigest: topology.geometryDigest,
    triangles: topology.triangles,
    componentCount: list.length,
    smallTriangleLimit,
    total: candidates.length,
    offset,
    components: page,
  };
}
/** Tolerances of the N02 seam repair: a residual rim must lie on the same
 * detected defect plane and inside the local coplanar defect patch. */
export const RESIDUAL_PLANAR_FILL = Object.freeze({
  planeToleranceMm: 1e-3,
  boundsMarginMm: 2.5,
  weldToleranceMm: 0.005,
  maxOpenings: 16,
  maxPatchFaces: 20000,
});

/**
 * Bounding box of the connected coplanar patch that carried the proven seam.
 * It is derived from the faces the seam repair removed, so the scope stays the
 * local defect region instead of the whole plane across the part.
 */
function coplanarDefectBounds(mesh, topology, plane, seedFaces, margin) {
  const onPlane = (p) =>
    Math.abs(
      plane.normal[0] * p[0] + plane.normal[1] * p[1] + plane.normal[2] * p[2] - plane.distance,
    ) <= RESIDUAL_PLANAR_FILL.planeToleranceMm;
  const faceOnPlane = (face) =>
    [0, 1, 2].every((k) => {
      const id = mesh.triangles[face * 3 + k];
      return onPlane(mesh.verts.slice(id * 3, id * 3 + 3));
    });
  const faces = (seedFaces ?? []).filter((f) => f >= 0 && f < topology.triangles && faceOnPlane(f));
  if (!faces.length) return null;
  const seen = new Set(faces),
    queue = [...faces];
  while (queue.length) {
    if (seen.size > RESIDUAL_PLANAR_FILL.maxPatchFaces) return null;
    const face = queue.pop();
    for (let k = 0; k < 3; k++) {
      const edge = topology.faceEdges?.[face * 3 + k];
      if (!edge || edge.incidents.length !== 2) continue;
      for (const { face: next } of edge.incidents)
        if (next !== face && !seen.has(next) && faceOnPlane(next)) {
          seen.add(next);
          queue.push(next);
        }
    }
  }
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (const face of seen)
    for (let k = 0; k < 3; k++) {
      const id = mesh.triangles[face * 3 + k];
      for (let a = 0; a < 3; a++) {
        const value = mesh.verts[id * 3 + a];
        if (value < min[a]) min[a] = value;
        if (value > max[a]) max[a] = value;
      }
    }
  return {
    min: min.map((v) => v - margin),
    max: max.map((v) => v + margin),
    faces: seen.size,
  };
}

const DEFECT_CATEGORIES = ['nonmanifoldEdge', 'nonmanifoldVertex', 'duplicate', 'degenerate', 'orientation'];

/**
 * Closes only rims that lie entirely on the planar defect that was just proven
 * non-manifold and inside that defect's local coplanar bounds. Every other
 * opening is left untouched. Existing coordinates are reused; nothing is moved,
 * and every weld or cap is re-inspected before it is kept.
 */
function closeResidualPlanarOpenings(mesh, plane, bounds, { signal, buildTopology } = {}) {
  let current = mesh;
  const filled = [],
    welds = [];
  const onPlane = (p) =>
    Math.abs(
      plane.normal[0] * p[0] + plane.normal[1] * p[1] + plane.normal[2] * p[2] - plane.distance,
    ) <= RESIDUAL_PLANAR_FILL.planeToleranceMm;
  const inBounds = (p) => [0, 1, 2].every((k) => p[k] >= bounds.min[k] && p[k] <= bounds.max[k]);
  const worldPoints = (ring) => ring.vertices.map((v) => current.verts.slice(v * 3, v * 3 + 3));
  const eligible = (ring) => {
    if (ring.reason || ring.edgeCount < 3 || ring.edgeCount > 512) return false;
    return worldPoints(ring).every((p) => onPlane(p) && inBounds(p));
  };
  for (let round = 0; round < RESIDUAL_PLANAR_FILL.maxOpenings; round++) {
    abort(signal);
    const topo = buildTopology(current, { signal }),
      before = inspectMeshTopology(topo, { signal });
    // Only the proven planar defect loses its "damaged neighbour" taint; rims
    // elsewhere keep it. Every weld and cap still has to pass the re-inspection.
    const unsafe = new Set(topo.unsafeBoundaryVertices);
    for (const vertex of [...unsafe]) {
      const p = current.verts.slice(vertex * 3, vertex * 3 + 3);
      if (onPlane(p) && inBounds(p)) unsafe.delete(vertex);
    }
    const fillTopology =
        unsafe.size === topo.unsafeBoundaryVertices.size ? topo : { ...topo, unsafeBoundaryVertices: unsafe },
      rings = boundaryRings(fillTopology, signal);
    // A rim whose corners are only micrometres apart is not a real hole but a
    // duplicate coordinate pair. Merging those existing coordinates closes it
    // without inventing a sliver cap.
    let welded = null;
    for (const ring of rings) {
      if (!eligible(ring)) continue;
      const points = worldPoints(ring);
      let pair = null,
        distance = 0;
      for (let i = 0; i < ring.vertices.length; i++) {
        const j = (i + 1) % ring.vertices.length,
          length = Math.hypot(
            points[i][0] - points[j][0],
            points[i][1] - points[j][1],
            points[i][2] - points[j][2],
          );
        if (length > 0 && length < RESIDUAL_PLANAR_FILL.weldToleranceMm) {
          pair = [ring.vertices[i], ring.vertices[j]];
          distance = length;
          break;
        }
      }
      if (!pair) continue;
      // Ring vertices are exact-coordinate representatives. Merge every raw
      // copy of both coordinates onto one existing point, never inventing one.
      const keep = Math.min(...pair),
        target = topo.representatives.indexOf(keep),
        merge = new Map();
      if (target < 0) continue;
      for (let v = 0; v < current.verts.length / 3; v++)
        if (pair.includes(topo.representatives[v])) merge.set(v, target);
      const triangles = [];
      for (let i = 0; i < current.triangles.length; i += 3) {
        const a = merge.get(current.triangles[i]) ?? current.triangles[i],
          b = merge.get(current.triangles[i + 1]) ?? current.triangles[i + 1],
          c = merge.get(current.triangles[i + 2]) ?? current.triangles[i + 2];
        if (a === b || b === c || c === a) continue;
        triangles.push(a, b, c);
      }
      const candidate = { verts: current.verts, triangles },
        after = inspectMeshTopology(buildTopology(candidate, { signal }), { signal });
      if (
        after.categories.boundary.count >= before.categories.boundary.count ||
        DEFECT_CATEGORIES.some((key) => after.categories[key].count > before.categories[key].count)
      )
        continue;
      welded = {
        ringId: ring.id,
        mergedVertices: 1,
        distanceMm: distance,
        removedDegenerateFaces: (current.triangles.length - triangles.length) / 3,
      };
      current = candidate;
      break;
    }
    if (welded) {
      welds.push(welded);
      continue;
    }
    let closed = null;
    for (const ring of rings) {
      if (!eligible(ring)) continue;
      try {
        const result = fillPlanarHole(
          fillTopology,
          { method: 'planar-cap-v1', geometryDigest: fillTopology.geometryDigest, ringId: ring.id },
          { signal, unsafeVertices: [...unsafe] },
        );
        const after = inspectMeshTopology(buildTopology(result.mesh, { signal }), { signal });
        if (
          after.categories.boundary.count !== before.categories.boundary.count - ring.edgeCount ||
          DEFECT_CATEGORIES.some((key) => after.categories[key].count > before.categories[key].count)
        )
          continue;
        closed = {
          ringId: ring.id,
          boundaryEdgesClosed: result.report.boundaryEdgesClosed,
          addedTriangles: result.report.addedTriangles,
          maxLocalPlanarityDeviation: result.report.maxLocalPlanarityDeviation,
        };
        current = result.mesh;
      } catch {
        // A rim that cannot be capped unambiguously stays open.
      }
      if (closed) break;
    }
    if (!closed) break;
    filled.push(closed);
  }
  return { mesh: current, filled, welds };
}

/** Only remove existing faces or swap two indices, plus the bounded planar rim
 * closing above. All used coordinates are copied exactly; no T-junction split,
 * coordinate move, outward or volume guessing. */
// buildTopology (selection topology builder) is injected by the caller so this
// module stays free of mesh-selection-data and its dynamic imports; workers
// bundle it as a single IIFE. Without it, residual openings stay open (pre-B1).
export function repairSimpleTopology(topology, options, { signal, buildTopology } = {}) {
  const o = validateSimpleRepairOptions(options);
  abort(signal);
  if (o.geometryDigest !== topology.geometryDigest)
    fail('Der Reparaturbezug ist veraltet. Das aktuelle Netz erneut prüfen.', 'MESH_REPAIR_STALE');

  let baseTopology = topology;
  let baseMesh = topology.mesh;
  let planarSeamReport = null;

  if (o.repairPlanarSeam || o.repairPlanarSeams) {
    const insp = inspectMeshTopology(baseTopology);
    for (const group of insp.defectGroups ?? []) {
      const hasNM =
        (group.nonmanifoldEdgeIndices?.length ?? 0) > 0 ||
        group.edgeIds.some((id) => {
          const key = id.slice(2).replace(':', ',');
          const te = baseTopology.edges.get(key);
          return te && te.incidents.length > 2;
        });
      if (hasNM) {
        try {
          const res = repairPlanarSeam(baseMesh, baseTopology, group);
          if (res.report.changes > 0) {
            baseMesh = res.mesh;
            baseTopology = buildLocalTopology(baseMesh);
            planarSeamReport = res.report;
            break;
          }
        } catch {
          // If group is not an overlapping planar seam, continue
        }
      }
    }
  }

  // B1: only after a proven non-manifold seam repair may rims on that same
  // detected plane and inside the seam's local coplanar patch be capped.
  const residualBounds =
    planarSeamReport && planarSeamReport.plane
      ? coplanarDefectBounds(
          topology.mesh,
          topology,
          planarSeamReport.plane,
          planarSeamReport.removedFaceIndices,
          RESIDUAL_PLANAR_FILL.boundsMarginMm,
        )
      : null;
  const residualFill = residualBounds && typeof buildTopology === 'function'
    ? closeResidualPlanarOpenings(baseMesh, planarSeamReport.plane, residualBounds, { signal, buildTopology })
    : null;
  if (residualFill && (residualFill.filled.length || residualFill.welds.length)) {
    baseMesh = residualFill.mesh;
    baseTopology = buildLocalTopology(baseMesh);
  }

  const { mesh, representatives } = baseTopology,
    { list, touching } = components(baseTopology, signal),
    removed = new Set(),
    selected = new Set(o.removeComponents);
  for (let index = 0; index < list.length; index++)
    if (selected.has(list[index][0])) {
      if (index === 0 || list[index].length > o.smallTriangleLimit || touching.has(index))
        fail(
          'Nur ausdrücklich gewählte kleine, vollständig getrennte Nebenbestandteile entfernen. Der Hauptbestandteil bleibt erhalten.',
        );
      selected.delete(list[index][0]);
      for (const face of list[index]) removed.add(face);
    }
  if (selected.size) fail('Ein gewählter Nebenbestandteil ist nicht mehr vorhanden. Erneut auswählen.');
  const removedPartFaces = removed.size,
    faces = [],
    originalIds = [],
    seen = new Set(),
    bad = [];
  let removedDegenerate = 0,
    removedDuplicates = 0;
  for (let face = 0; face < baseTopology.triangles; face++) {
    tick(face, signal);
    if (removed.has(face)) continue;
    const ids = mesh.triangles.slice(face * 3, face * 3 + 3),
      logical = ids.map((i) => representatives[i]),
      normal = cadExportTriangleNormal(...ids.map((i) => mesh.verts.slice(i * 3, i * 3 + 3))),
      key = [...logical].sort((a, b) => a - b).join(',');
    if (!normal && o.removeDegenerate) {
      removedDegenerate++;
      continue;
    }
    if (normal && o.removeDuplicates && seen.has(key)) {
      removedDuplicates++;
      continue;
    }
    if (normal) seen.add(key);
    faces.push(ids);
    originalIds.push(face);
    bad.push(!normal);
  }
  if (!faces.length) fail('Die Reparatur würde alle Flächen entfernen. Das Original bleibt erhalten.');
  const edges = new Map(),
    faceLinks = dsu(faces.length),
    duplicateOwners = new Map();
  for (let i = 0; i < faces.length; i++) {
    tick(i, signal);
    const ids = faces[i].map((v) => representatives[v]),
      key = [...ids].sort((a, b) => a - b).join(',');
    if (duplicateOwners.has(key)) {
      bad[i] = bad[duplicateOwners.get(key)] = true;
    } else duplicateOwners.set(key, i);
    for (let k = 0; k < 3; k++) {
      const a = ids[k],
        b = ids[(k + 1) % 3];
      if (a === b) continue;
      const key = a < b ? a + ':' + b : b + ':' + a;
      if (!edges.has(key)) edges.set(key, []);
      edges.get(key).push({ face: i, direction: a < b ? 1 : -1 });
    }
  }
  const neighbors = Array.from({ length: faces.length }, () => []);
  let step = 0;
  for (const edge of edges.values()) {
    tick(step++, signal);
    for (let j = 1; j < edge.length; j++) faceLinks.join(edge[0].face, edge[j].face);
    if (edge.length > 2) for (const e of edge) bad[e.face] = true;
    else if (edge.length === 2) {
      const [a, b] = edge,
        same = a.direction === b.direction;
      neighbors[a.face].push([b.face, same]);
      neighbors[b.face].push([a.face, same]);
    }
  }
  const groups = new Map();
  for (let i = 0; i < faces.length; i++) {
    tick(i, signal);
    const root = faceLinks.find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(i);
  }
  const flippedOriginalIds = [];
  let skippedOrientationComponents = 0;
  if (o.orient) {
    const parity = new Int8Array(faces.length).fill(-1);
    for (const group of groups.values()) {
      abort(signal);
      if (group.some((i) => bad[i])) {
        skippedOrientationComponents++;
        continue;
      }
      const queue = [group[0]];
      parity[group[0]] = 0;
      let conflict = false,
        ones = 0;
      for (let head = 0; head < queue.length; head++) {
        tick(head, signal);
        const face = queue[head];
        ones += parity[face];
        for (const [next, same] of neighbors[face]) {
          const want = parity[face] ^ (same ? 1 : 0);
          if (parity[next] !== -1) {
            if (parity[next] !== want) conflict = true;
          } else {
            parity[next] = want;
            queue.push(next);
          }
        }
      }
      if (conflict || queue.length !== group.length) {
        skippedOrientationComponents++;
        continue;
      }
      const invert = ones > group.length - ones;
      for (const face of group)
        if (parity[face] ^ (invert ? 1 : 0)) {
          [faces[face][1], faces[face][2]] = [faces[face][2], faces[face][1]];
          flippedOriginalIds.push(originalIds[face]);
        }
    }
  }
  if (!planarSeamReport && !removedPartFaces && !removedDegenerate && !removedDuplicates && !flippedOriginalIds.length)
    fail(
      skippedOrientationComponents
        ? 'Keine geeignete Änderung. Die betroffenen Orientierungsbereiche sind mehrdeutig oder enthalten weitere Fehler.'
        : 'Keine Änderung für die gewählten Reparaturschritte gefunden.',
      'MESH_REPAIR_NO_CHANGE',
    );
  const used = new Uint8Array(mesh.verts.length / 3);
  for (let i = 0; i < faces.length; i++) {
    tick(i, signal);
    for (const id of faces[i]) used[id] = 1;
  }
  const verts = [],
    map = new Uint32Array(used.length);
  for (let i = 0; i < used.length; i++) {
    tick(i, signal);
    if (used[i]) {
      map[i] = verts.length / 3;
      verts.push(...mesh.verts.slice(i * 3, i * 3 + 3));
    }
  }
  const triangles = [];
  for (let i = 0; i < faces.length; i++) {
    tick(i, signal);
    for (const id of faces[i]) triangles.push(map[id]);
  }
  abort(signal);
  return {
    mesh: { verts, triangles },
    report: {
      removedDegenerate,
      removedDuplicates,
      removedComponents: o.removeComponents.length,
      removedComponentFaces: removedPartFaces,
      flippedFaces: flippedOriginalIds.length,
      skippedOrientationComponents,
      removedUnusedVertices: used.length - verts.length / 3,
      beforeTriangles: topology.triangles,
      afterTriangles: faces.length,
      repairedPlanarSeams: planarSeamReport ? 1 : 0,
      planarSeamChanges: planarSeamReport?.changes ?? 0,
      planarSeamReport: planarSeamReport ?? null,
      coordinatesMoved: false,
      holesFilled: residualFill?.filled.length ?? 0,
      residualOpeningsClosed: residualFill?.filled ?? [],
      residualWelds: residualFill?.welds ?? [],
      planarResidualScope: planarSeamReport
        ? 'only the detected defect plane and its local bounds'
        : 'none',
      scope: 'existing-faces-only',
    },
  };
}
