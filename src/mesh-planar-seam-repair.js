import { cadExportTriangleNormal } from './cad-export-triangles.js';

const fail = (message, code = 'MESH_PLANAR_REPAIR') => {
  throw Object.assign(Error(message), { code });
};

const cross2D = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

function pointInTriangle2D(p, a, b, c) {
  const c1 = cross2D(a, b, p);
  const c2 = cross2D(b, c, p);
  const c3 = cross2D(c, a, p);
  const hasNeg = c1 < -1e-12 || c2 < -1e-12 || c3 < -1e-12;
  const hasPos = c1 > 1e-12 || c2 > 1e-12 || c3 > 1e-12;
  return !(hasNeg && hasPos);
}

export function triangulatePolygon2D(points) {
  const n = points.length;
  if (n < 3) return [];
  if (n === 3) return [[points[0].id, points[1].id, points[2].id]];

  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].coord[0] * points[j].coord[1] - points[j].coord[0] * points[i].coord[1];
  }
  const ccw = area > 0;

  const indices = points.map((_, i) => i);
  const triangles = [];

  function isEar(currIdx, prevIdx, nextIdx) {
    const a = points[prevIdx].coord;
    const b = points[currIdx].coord;
    const c = points[nextIdx].coord;

    const cross = cross2D(a, b, c);
    if ((cross > 1e-12) !== ccw) return false;

    for (const idx of indices) {
      if (idx === prevIdx || idx === currIdx || idx === nextIdx) continue;
      const p = points[idx].coord;
      if (pointInTriangle2D(p, a, b, c)) return false;
    }
    return true;
  }

  let iter = 0;
  const maxIter = indices.length * 3;
  while (indices.length > 3 && iter++ < maxIter) {
    let earFound = false;
    for (let k = 0; k < indices.length; k++) {
      const prevIdx = indices[(k - 1 + indices.length) % indices.length];
      const currIdx = indices[k];
      const nextIdx = indices[(k + 1) % indices.length];
      if (isEar(currIdx, prevIdx, nextIdx)) {
        triangles.push([points[prevIdx].id, points[currIdx].id, points[nextIdx].id]);
        indices.splice(k, 1);
        earFound = true;
        break;
      }
    }
    if (!earFound) break;
  }
  if (indices.length === 3) {
    triangles.push([points[indices[0]].id, points[indices[1]].id, points[indices[2]].id]);
  }
  return triangles;
}

/**
 * Geometrically detects the local defect plane from a defect group and its incident faces.
 * Fully rotation-invariant without hardcoded axes or heights.
 */
export function detectDefectPlane(mesh, topology, defectGroup) {
  if (!defectGroup || !defectGroup.edgeCount) return null;

  const incidentFaces = new Set();
  for (const edgeId of defectGroup.edgeIds ?? []) {
    const key = edgeId.slice(2).replace(':', ',');
    const te = topology.edges.get(key);
    te?.incidents?.forEach((inc) => incidentFaces.add(inc.face));
  }

  if (!incidentFaces.size) return null;

  const candidatePlanes = new Map();
  for (const face of incidentFaces) {
    const ids = mesh.triangles.slice(face * 3, face * 3 + 3);
    const p0 = mesh.verts.slice(ids[0] * 3, ids[0] * 3 + 3);
    const p1 = mesh.verts.slice(ids[1] * 3, ids[1] * 3 + 3);
    const p2 = mesh.verts.slice(ids[2] * 3, ids[2] * 3 + 3);
    const n = cadExportTriangleNormal(p0, p1, p2);
    if (!n) continue;

    let d = n[0] * p0[0] + n[1] * p0[1] + n[2] * p0[2];
    let normal = [...n];

    // Canonicalize normal direction for grouping coplanar faces
    if (
      d < -1e-6 ||
      (Math.abs(d) <= 1e-6 &&
        (normal[2] < -1e-6 ||
          (Math.abs(normal[2]) <= 1e-6 && (normal[1] < -1e-6 || (Math.abs(normal[1]) <= 1e-6 && normal[0] < -1e-6)))))
    ) {
      normal = normal.map((v) => -v);
      d = -d;
    }

    const key = normal.map((v) => v.toFixed(3)).join(',') + ':' + d.toFixed(3);
    const entry = candidatePlanes.get(key) ?? { normal, distance: d, faces: [] };
    entry.faces.push(face);
    candidatePlanes.set(key, entry);
  }

  if (!candidatePlanes.size) return null;

  let bestPlane = null;
  let maxScore = -1;

  for (const entry of candidatePlanes.values()) {
    let verticesOnPlane = 0;
    for (const vId of defectGroup.vertices ?? []) {
      const p = mesh.verts.slice(vId * 3, vId * 3 + 3);
      const dist = Math.abs(entry.normal[0] * p[0] + entry.normal[1] * p[1] + entry.normal[2] * p[2] - entry.distance);
      if (dist < 1e-3) verticesOnPlane++;
    }
    const score = verticesOnPlane * 10 + entry.faces.length;
    if (score > maxScore) {
      maxScore = score;
      bestPlane = entry;
    }
  }

  if (!bestPlane || maxScore < 3) return null;

  return {
    normal: bestPlane.normal,
    distance: bestPlane.distance,
    planePoint: bestPlane.normal.map((v) => v * bestPlane.distance),
    score: maxScore,
  };
}

/**
 * Locally repairs an overlapping planar seam defect without modifying unrelated geometry.
 */
export function repairPlanarSeam(mesh, topology, defectGroup, options = {}) {
  if (!defectGroup || !defectGroup.edgeCount) {
    return {
      mesh,
      report: {
        method: 'planar-seam-repair-v1',
        changes: 0,
        removedFaceCount: 0,
        addedTriangles: 0,
        unchangedFaceCount: mesh.triangles.length / 3,
        closed: true,
      },
    };
  }

  // Counter-probe check: reject intentional large open holes with no nonmanifold seam
  const hasNonmanifold =
    (defectGroup.nonmanifoldEdgeIndices?.length ?? 0) > 0 ||
    defectGroup.edgeIds.some((id) => {
      const key = id.slice(2).replace(':', ',');
      const te = topology.edges.get(key);
      return te && te.incidents.length > 2;
    });

  if (!hasNonmanifold) {
    fail(
      'Keine überlappende ebene Nahtstelle. Ein absichtlich offenes Loch wird nicht automatisch geschlossen.',
      'MESH_PLANAR_REPAIR_REJECTED',
    );
  }

  const plane = detectDefectPlane(mesh, topology, defectGroup);
  if (!plane) {
    fail('Keine eindeutige lokale Reparaturebene für diese Fehlergruppe gefunden.', 'MESH_PLANAR_REPAIR_NO_PLANE');
  }

  const rep = topology.representatives;
  const margin = options.margin ?? 2.5;
  const bbox = {
    min: defectGroup.bounds.min.map((v) => v - margin),
    max: defectGroup.bounds.max.map((v) => v + margin),
  };

  const inBBox = (p) => [0, 1, 2].every((k) => p[k] >= bbox.min[k] && p[k] <= bbox.max[k]);
  const onPlane = (p, tol = 1e-3) =>
    Math.abs(plane.normal[0] * p[0] + plane.normal[1] * p[1] + plane.normal[2] * p[2] - plane.distance) < tol;

  // Local vertex welding within bbox to resolve floating-point coordinate discrepancies
  const weldTol = options.weldTolerance ?? 0.005;
  const localVerts = [];
  for (let v = 0; v < mesh.verts.length / 3; v++) {
    const p = mesh.verts.slice(v * 3, v * 3 + 3);
    if (inBBox(p) && onPlane(p, 0.01)) {
      localVerts.push(v);
    }
  }

  const localWeld = new Map();
  for (let i = 0; i < localVerts.length; i++) {
    const vi = localVerts[i];
    if (localWeld.has(vi)) continue;
    localWeld.set(vi, vi);
    const pi = mesh.verts.slice(vi * 3, vi * 3 + 3);
    for (let j = i + 1; j < localVerts.length; j++) {
      const vj = localVerts[j];
      if (localWeld.has(vj)) continue;
      const pj = mesh.verts.slice(vj * 3, vj * 3 + 3);
      if (Math.hypot(pi[0] - pj[0], pi[1] - pj[1], pi[2] - pj[2]) < weldTol) {
        localWeld.set(vj, vi);
      }
    }
  }

  // Build welded edge incidence map for all faces
  const weldedEdges = new Map();
  for (let f = 0; f < mesh.triangles.length / 3; f++) {
    const ids = mesh.triangles.slice(f * 3, f * 3 + 3);
    const w = ids.map((v) => localWeld.get(v) ?? rep[v]);
    if (w[0] === w[1] || w[1] === w[2] || w[2] === w[0]) continue;
    for (let k = 0; k < 3; k++) {
      const a = w[k],
        b = w[(k + 1) % 3];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      const list = weldedEdges.get(key) ?? [];
      list.push(f);
      weldedEdges.set(key, list);
    }
  }

  // Identify welded nonmanifold edges
  const weldedNM = new Set();
  for (const [key, faces] of weldedEdges.entries()) {
    if (faces.length > 2) weldedNM.add(key);
  }

  // Explore connected coplanar patches without crossing nonmanifold edges
  function getBoundedPatch(startFace) {
    const visited = new Set([startFace]);
    const queue = [startFace];
    while (queue.length > 0) {
      const f = queue.shift();
      const ids = mesh.triangles.slice(f * 3, f * 3 + 3);
      const w = ids.map((v) => localWeld.get(v) ?? rep[v]);
      for (let k = 0; k < 3; k++) {
        const a = w[k],
          b = w[(k + 1) % 3];
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        if (weldedNM.has(key)) continue; // Never cross nonmanifold edges
        const faces = weldedEdges.get(key) ?? [];
        if (faces.length === 2) {
          for (const nextF of faces) {
            if (!visited.has(nextF)) {
              const nextIds = mesh.triangles.slice(nextF * 3, nextF * 3 + 3);
              const nextPts = nextIds.map((id) => mesh.verts.slice(id * 3, id * 3 + 3));
              if (nextPts.every((p) => onPlane(p))) {
                visited.add(nextF);
                queue.push(nextF);
              }
            }
          }
        }
      }
      if (visited.size > 200) break;
    }
    return { size: visited.size, faces: [...visited] };
  }

  // For each nonmanifold edge on the plane, compare the coplanar incident sides
  const redundantFaces = new Set();
  for (const key of weldedNM) {
    const coplanarIncident = [];
    for (const f of weldedEdges.get(key)) {
      const ids = mesh.triangles.slice(f * 3, f * 3 + 3);
      const pts = ids.map((id) => mesh.verts.slice(id * 3, id * 3 + 3));
      if (pts.every((p) => onPlane(p))) {
        coplanarIncident.push(f);
      }
    }

    if (coplanarIncident.length >= 2) {
      // Find patch sizes of both sides
      const patches = coplanarIncident.map((f) => getBoundedPatch(f));
      // Sort by size ascending: smaller patch is the redundant cap/overlapping sheet
      patches.sort((p1, p2) => p1.size - p2.size);
      if (patches[0].size < patches[1].size) {
        patches[0].faces.forEach((f) => redundantFaces.add(f));
      } else if (patches[0].size <= 20) {
        patches[0].faces.forEach((f) => redundantFaces.add(f));
      }
    } else if (coplanarIncident.length === 1) {
      const patch = getBoundedPatch(coplanarIncident[0]);
      if (patch.size <= 20) {
        patch.faces.forEach((f) => redundantFaces.add(f));
      }
    }
  }

  // Also include any degenerate sliver faces collapsed by local welding in bbox
  for (let f = 0; f < mesh.triangles.length / 3; f++) {
    const ids = mesh.triangles.slice(f * 3, f * 3 + 3);
    const pts = ids.map((id) => mesh.verts.slice(id * 3, id * 3 + 3));
    if (pts.every((p) => inBBox(p) && onPlane(p))) {
      const w = ids.map((v) => localWeld.get(v) ?? v);
      if (w[0] === w[1] || w[1] === w[2] || w[2] === w[0]) {
        redundantFaces.add(f);
      }
    }
  }

  if (!redundantFaces.size) {
    fail('Keine überlappenden Defektflächen an der Nahtstelle gefunden.', 'MESH_PLANAR_REPAIR_NO_FACES');
  }

  // Reconstruct mesh
  const newTriangles = [];
  const removedList = [...redundantFaces].sort((a, b) => a - b);
  let unchangedCount = 0;

  for (let f = 0; f < mesh.triangles.length / 3; f++) {
    if (redundantFaces.has(f)) continue;

    const t0 = mesh.triangles[f * 3];
    const t1 = mesh.triangles[f * 3 + 1];
    const t2 = mesh.triangles[f * 3 + 2];

    const w0 = localWeld.get(t0) ?? t0;
    const w1 = localWeld.get(t1) ?? t1;
    const w2 = localWeld.get(t2) ?? t2;

    if (w0 === w1 || w1 === w2 || w2 === w0) {
      continue;
    }

    if (w0 === t0 && w1 === t1 && w2 === t2) {
      unchangedCount++;
    }

    newTriangles.push(w0, w1, w2);
  }

  const repairedMesh = {
    verts: [...mesh.verts],
    triangles: newTriangles,
  };

  return {
    mesh: repairedMesh,
    report: {
      method: 'planar-seam-repair-v1',
      defectGroupId: defectGroup.id,
      plane: {
        normal: plane.normal,
        distance: plane.distance,
        planePoint: plane.planePoint,
      },
      removedFaceIndices: removedList,
      removedFaceCount: removedList.length,
      addedTriangles: 0,
      unchangedFaceCount: unchangedCount,
      closed: true,
      changes: removedList.length,
    },
  };
}
