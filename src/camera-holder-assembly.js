// R05: measured R02 arm, R03 base plate and R04 bore sources are joined into one
// regular rebuilt body. The module never invents geometry: every source keeps
// its measurement record, the STL groove becomes a named cutting source, and the
// admission compares the candidate with the unchanged original STL in both
// directions (outer skin decides, raw value is reported).
import {
  OUTER_SKIN_BUDGET_MM,
  OUTER_SKIN_EXCLUDED_NEIGHBOURHOOD_MM,
  OUTER_SKIN_SEED,
  buildOuterSkinReference,
  createExcludedNeighbourhood,
  evaluateOuterSkin,
  measureSurfaceDeviation,
} from './mesh-outer-skin.js';
import { validateBoreSource } from './mesh-stepped-bores.js';

export const ASSEMBLY_LIMITS = Object.freeze({
  budgetMM: OUTER_SKIN_BUDGET_MM,
  boundToleranceMM: 0.12,
  grooveMinDepthMM: 0.01,
  grooveDepthToleranceMM: 0.05,
  grooveSamplesPerEdge: 400,
  maximumBoreSources: 32,
});

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const fail = (message, code = 'CAMERA_HOLDER_ASSEMBLY') => {
  throw Object.assign(Error(message), { code });
};
const round = (value, digits = 4) => Number(Number(value).toFixed(digits));
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
function unit(value, what) {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite))
    fail(`${what}: endlicher Richtungsvektor erforderlich.`, 'CAMERA_HOLDER_INPUT');
  const length = norm(value);
  if (length < 1e-9) fail(`${what}: Richtung fehlt.`, 'CAMERA_HOLDER_INPUT');
  return value.map((entry) => entry / length);
}
function point3(value, what) {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite))
    fail(`${what}: endlicher Punkt in mm erforderlich.`, 'CAMERA_HOLDER_INPUT');
  return [...value];
}

function validateMesh(mesh, what) {
  const count = mesh?.triangles?.length / 3,
    list = (value) => Array.isArray(value) || ArrayBuffer.isView(value);
  if (
    !list(mesh?.verts) ||
    !list(mesh?.triangles) ||
    !Number.isInteger(count) ||
    count < 1 ||
    mesh.verts.length % 3
  )
    fail(`${what}: geschlossenes Dreiecksnetz erforderlich.`, 'CAMERA_HOLDER_INPUT');
  return count;
}

export function meshBounds(mesh) {
  validateMesh(mesh, 'Netz');
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.verts.length; i += 3)
    for (let k = 0; k < 3; k++) {
      const value = mesh.verts[i + k];
      min[k] = Math.min(min[k], value);
      max[k] = Math.max(max[k], value);
    }
  return { min, max };
}

function meshToManifold(kernel, mesh, what) {
  validateMesh(mesh, what);
  const shape = kernel.Manifold.ofMesh(
    new kernel.Mesh({
      numProp: 3,
      vertProperties: Float32Array.from(mesh.verts),
      triVerts: Uint32Array.from(mesh.triangles),
    }),
  );
  if (shape.isEmpty() || shape.status() !== 'NoError' || !(shape.volume() > 0)) {
    shape.delete();
    fail(`${what}: Netz ergibt keinen geschlossenen Volumenkörper.`, 'CAMERA_HOLDER_BODY');
  }
  return shape;
}

function manifoldToMesh(shape) {
  const raw = shape.getMesh(),
    numProp = raw.numProp ?? 3,
    verts = [];
  for (let i = 0; i < raw.vertProperties.length; i += numProp)
    verts.push(raw.vertProperties[i], raw.vertProperties[i + 1], raw.vertProperties[i + 2]);
  return { verts, triangles: Array.from(raw.triVerts) };
}

/** Column-major Mat4 that maps local +Z onto `axis` and places the origin at `center`. */
function axisFrame(axis, center) {
  const z = unit(axis, 'Achse'),
    helper = Math.abs(z[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0],
    x = unit(cross(helper, z), 'Achsenhilfe'),
    y = cross(z, x);
  return [
    x[0], x[1], x[2], 0,
    y[0], y[1], y[2], 0,
    z[0], z[1], z[2], 0,
    center[0], center[1], center[2], 1,
  ];
}

function cylinderBetween(kernel, from, to, diameterMM) {
  const delta = sub(to, from),
    length = norm(delta);
  if (!(length > 0.05)) fail('Schneidquelle benötigt eine positive Länge.', 'CAMERA_HOLDER_BORE');
  const shape = kernel.Manifold.cylinder(length, diameterMM / 2, diameterMM / 2, 64, true);
  return shape.transform(axisFrame(delta, scale(add(from, to), 0.5)));
}

function assemblyAxisSpan(bounds, point, axis) {
  let min = Infinity,
    max = -Infinity;
  for (const x of [bounds.min[0], bounds.max[0]])
    for (const y of [bounds.min[1], bounds.max[1]])
      for (const z of [bounds.min[2], bounds.max[2]]) {
        const t = dot([x, y, z], axis);
        min = Math.min(min, t);
        max = Math.max(max, t);
      }
  const along = dot(point, axis);
  return { from: add(point, scale(axis, min - along - 2)), to: add(point, scale(axis, max - along + 2)) };
}

/**
 * One cutting cylinder per measured bore stage. Open axial ends are bounded by
 * the measured body extent along their own axis, never by an assumed depth.
 */
function boreCutterShapes(kernel, source, bounds) {
  validateBoreSource(source);
  const axis = unit(source.axis, 'Bohrquellenachse');
  return source.stages.map((stage) => {
    const from = stage.from ? point3(stage.from, 'Stufenanfang') : null,
      to = stage.to ? point3(stage.to, 'Stufenende') : null,
      ends = from && to ? { from, to } : assemblyAxisSpan(bounds, point3(source.point, 'Bohrquellenpunkt'), axis);
    return {
      stage: stage.index,
      diameterMM: stage.diameterMM,
      from: ends.from,
      to: ends.to,
      shape: cylinderBetween(kernel, ends.from, ends.to, stage.diameterMM),
    };
  });
}

function polygonArea(points) {
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    twice += a[0] * b[1] - b[0] * a[1];
  }
  return twice / 2;
}

function insidePolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i],
      [xj, yj] = polygon[j];
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

/** World XY outline of a measured section. Only plane cuts (normal Z) are accepted. */
export function sectionOutlineWorldXY(section, what = 'Schnitt') {
  // R01 evidence stores a named frame; a fresh mesh section stores the frame
  // matrix plus origin/uAxis/vAxis beside it. Both name the same measured plane.
  const frame = Array.isArray(section?.frame) ? null : section?.frame,
    origin = frame?.origin ?? section?.origin,
    uAxis = frame?.uAxis ?? section?.uAxis,
    vAxis = frame?.vAxis ?? section?.vAxis;
  if (!origin || !uAxis || !vAxis)
    fail(`${what}: gemessener Rahmen erforderlich.`, 'CAMERA_HOLDER_SECTION');
  const normal = unit(section.normal ?? frame?.normal ?? [0, 0, 1], `${what}-Normale`);
  if (Math.abs(Math.abs(dot(normal, [0, 0, 1])) - 1) > 1e-6)
    fail(`${what}: die Nut wird nur in einer Z-Ebene gemessen.`, 'CAMERA_HOLDER_SECTION');
  const points =
    section.outerProfile?.points2D ??
    section.outerProfile?.points ??
    section.outerProfile?.elements?.map((element) => element.start) ??
    section.points2D;
  if (!Array.isArray(points) || points.length < 3)
    fail(`${what}: geschlossene Außenkontur erforderlich.`, 'CAMERA_HOLDER_SECTION');
  return points.map((point) => {
    const world = add(add(origin, scale(uAxis, point[0])), scale(vAxis, point[1]));
    return [world[0], world[1]];
  });
}

const edgeSample = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const distance2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function inwardNormal(plate, edgeIndex) {
  const a = plate[edgeIndex],
    b = plate[(edgeIndex + 1) % plate.length],
    delta = [b[0] - a[0], b[1] - a[1]],
    length = Math.hypot(...delta);
  if (!(length > 1e-9)) return null;
  const normal = [-delta[1] / length, delta[0] / length],
    middle = edgeSample(a, b, 0.5);
  return insidePolygon([middle[0] + normal[0] * 0.05, middle[1] + normal[1] * 0.05], plate) ? normal : [-normal[0], -normal[1]];
}

function nearestPolygonHit(origin, direction, polygon) {
  let best = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length],
      edge = [b[0] - a[0], b[1] - a[1]],
      denominator = direction[0] * edge[1] - direction[1] * edge[0];
    if (Math.abs(denominator) < 1e-12) continue;
    const delta = [a[0] - origin[0], a[1] - origin[1]],
      t = (delta[0] * edge[1] - delta[1] * edge[0]) / denominator,
      u = (delta[0] * direction[1] - delta[1] * direction[0]) / denominator;
    if (t > 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) best = Math.min(best, t);
  }
  return best === Infinity ? null : best;
}

/**
 * The flat STL groove between two measured Z sections becomes an explicitly
 * named cutting prism: mouth length, depth and height are measured, the area
 * difference is kept as evidence.
 */
export function grooveCutterFromSections({ plateSection, grooveSection, zFrom = null, zTo = null, name = 'STL-Nut', samples = ASSEMBLY_LIMITS.grooveSamplesPerEdge } = {}) {
  const plate = sectionOutlineWorldXY(plateSection, 'Grundplattenkontur'),
    groove = sectionOutlineWorldXY(grooveSection, 'Nutkontur'),
    plateArea = Math.abs(polygonArea(plate)),
    grooveArea = Math.abs(polygonArea(groove)),
    areaDifferenceMM2 = plateArea - grooveArea;
  if (!(areaDifferenceMM2 > 0))
    fail('Die Nutkontur ist nicht kleiner als die Grundplattenkontur.', 'CAMERA_HOLDER_GROOVE');
  const runs = [];
  let current = null;
  const closeRun = () => {
    if (current?.points?.length) runs.push(current);
    current = null;
  };
  for (let edge = 0; edge < plate.length; edge++) {
    const a = plate[edge],
      b = plate[(edge + 1) % plate.length],
      normal = inwardNormal(plate, edge);
    for (let i = 0; i < samples; i++) {
      const t = (i + 0.5) / samples,
        boundary = edgeSample(a, b, t),
        inward = [boundary[0] + normal[0] * 0.05, boundary[1] + normal[1] * 0.05];
      if (insidePolygon(inward, groove)) {
        closeRun();
        continue;
      }
      const hit = nearestPolygonHit(boundary, normal, groove),
        entry = { boundary, inward: normal, edge, depth: hit ?? null };
      if (current && current.edge === edge) current.points.push(entry);
      else {
        closeRun();
        current = { edge, points: [entry] };
      }
    }
  }
  closeRun();
  // Merge a notch that wraps around the first/last edge of the loop.
  if (runs.length > 1 && runs[0].edge === 0 && runs.at(-1).edge === plate.length - 1) {
    const last = runs.pop();
    runs[0] = { edge: 0, points: [...last.points, ...runs[0].points] };
  }
  if (!runs.length) fail('Keine Nut gegenüber der Grundplattenkontur messbar.', 'CAMERA_HOLDER_GROOVE');
  const measured = runs
    .map((run) => {
      let depth = 0,
        mouth = 0;
      for (let i = 0; i < run.points.length; i++) {
        const entry = run.points[i];
        if (entry.depth !== null) depth = Math.max(depth, entry.depth);
        if (i > 0) mouth += distance2(run.points[i - 1].boundary, entry.boundary);
      }
      return { run, depth, mouth };
    })
    .sort((a, b) => b.mouth - a.mouth || b.depth - a.depth)[0];
  if (!(measured.depth >= ASSEMBLY_LIMITS.grooveMinDepthMM))
    fail('Die gemessene Nut ist flacher als die Mindesttiefe.', 'CAMERA_HOLDER_GROOVE');
  const points = measured.run.points,
    mouth = measured.mouth,
    center2 = [
      (points[0].boundary[0] + points.at(-1).boundary[0]) / 2,
      (points[0].boundary[1] + points.at(-1).boundary[1]) / 2,
    ],
    inward = unit([...points[Math.floor(points.length / 2)].inward, 0], 'Nutrichtung').slice(0, 2),
    from = zFrom ?? grooveSection.frame.origin[2],
    to = zTo ?? plateSection.frame.origin[2];
  if (!(to > from)) fail('Die Nut liegt nicht zwischen den beiden Messebenen.', 'CAMERA_HOLDER_GROOVE');
  const center = [center2[0] + inward[0] * measured.depth / 2, center2[1] + inward[1] * measured.depth / 2, (from + to) / 2],
    along = unit([points.at(-1).boundary[0] - points[0].boundary[0], points.at(-1).boundary[1] - points[0].boundary[1], 0], 'Nutlänge'),
    upward = [0, 0, 1],
    across = cross(along, upward),
    rectangularArea = mouth * measured.depth;
  return {
    version: 1,
    kind: 'grooveCutter',
    name,
    status: 'complete',
    mouthLengthMM: round(mouth),
    depthMM: round(measured.depth),
    heightMM: round(to - from),
    zFrom: round(from),
    zTo: round(to),
    center: center.map(round),
    axes: { along, across, normal: upward },
    size: [round(mouth), round(measured.depth), round(to - from)],
    areaDifferenceMM2: round(areaDifferenceMM2),
    areaConsistency: round(Math.abs(rectangularArea - areaDifferenceMM2) / Math.max(areaDifferenceMM2, 1e-9)),
    samples: points.length,
    edge: measured.run.edge,
    method:
      'Grundplatten- und Nutkontur aus zwei gemessenen Z-Schnitten; Mundlänge und Tiefe über Randabtastung und Strahl bis zur Nutkontur, Höhe aus dem Ebenenabstand.',
    independent: true,
  };
}

function grooveCutterShape(kernel, groove) {
  if (groove?.kind !== 'grooveCutter' || !(groove.depthMM > 0) || !(groove.mouthLengthMM > 0))
    fail('Gespeicherte Nutquelle ist ungültig.', 'CAMERA_HOLDER_GROOVE');
  const [length, depth, height] = groove.size,
    { along, normal } = groove.axes,
    across = cross(along, normal),
    shape = kernel.Manifold.cube([length, depth, height], true);
  return shape.transform([
    along[0], along[1], along[2], 0,
    across[0], across[1], across[2], 0,
    normal[0], normal[1], normal[2], 0,
    groove.center[0], groove.center[1], groove.center[2], 1,
  ]);
}

function bodySummary(body) {
  if (!body?.mesh) fail('Gemessener Teilkörper fehlt.', 'CAMERA_HOLDER_SOURCE');
  return {
    kind: body.kind,
    name: body.name,
    plane: structuredClone(body.plane),
    sketch: structuredClone(body.sketch),
    extrusion: structuredClone(body.extrusion),
    measured: structuredClone(body.measured),
    ...(body.cuts ? { cuts: structuredClone(body.cuts) } : {}),
    volume: round(body.volume),
    bounds: meshBounds(body.mesh),
  };
}

/**
 * Join the accepted R02 arm and R03 plate, cut the measured R04 bore sources and
 * the named STL groove. `baseMesh` reuses an already joined measured pair when a
 * saved draft is rebuilt after a source edit.
 */
export function composeCameraHolderAssembly(
  kernel,
  { arm, plate, baseMesh = null, bores = [], groove = null, name = 'Kamerahalter' } = {},
) {
  if (!kernel?.Manifold?.union) fail('Der native CAD-Kern fehlt.', 'CAMERA_HOLDER_KERNEL');
  if (bores.length > ASSEMBLY_LIMITS.maximumBoreSources)
    fail('Zu viele Bohrquellen für eine Baugruppe.', 'CAMERA_HOLDER_INPUT');
  const owned = [];
  const own = (shape) => (owned.push(shape), shape);
  try {
    const armSource = baseMesh ? null : bodySummary(arm),
      plateSource = baseMesh ? null : bodySummary(plate);
    let body = own(
      baseMesh
        ? meshToManifold(kernel, baseMesh, 'Zusammengeführter Grundkörper')
        : kernel.Manifold.union([
            own(meshToManifold(kernel, arm.mesh, 'Armkopf')),
            own(meshToManifold(kernel, plate.mesh, 'Grundplatte')),
          ]),
    );
    if (body.isEmpty() || body.status() !== 'NoError')
      fail('Arm und Grundplatte ergeben keinen gemeinsamen Körper.', 'CAMERA_HOLDER_BODY');
    const joinedBaseMesh = manifoldToMesh(body),
      bounds = meshBounds(joinedBaseMesh),
      cuts = [],
      cutterSources = [];
    for (const source of bores) {
      for (const cutter of boreCutterShapes(kernel, source, bounds)) {
        own(cutter.shape);
        cutterSources.push({
          kind: 'bore',
          id: source.id,
          name: source.name,
          stage: cutter.stage,
          mesh: manifoldToMesh(cutter.shape),
        });
        const before = body.volume(),
          next = own(body.subtract(cutter.shape));
        if (next.isEmpty() || next.status() !== 'NoError')
          fail(`Bohrung ${source.id}: Schnitt ergibt keinen gültigen Körper.`, 'CAMERA_HOLDER_BORE');
        body = next;
        cuts.push({
          kind: 'bore',
          id: source.id,
          name: source.name,
          stage: cutter.stage,
          diameterMM: cutter.diameterMM,
          from: cutter.from.map(round),
          to: cutter.to.map(round),
          removedMM3: round(before - body.volume()),
        });
      }
    }
    if (groove) {
      const cutter = own(grooveCutterShape(kernel, groove)),
        cutterMesh = manifoldToMesh(cutter),
        before = body.volume(),
        next = own(body.subtract(cutter));
      if (next.isEmpty() || next.status() !== 'NoError')
        fail('Nutquelle ergibt keinen gültigen Körper.', 'CAMERA_HOLDER_GROOVE');
      body = next;
      cutterSources.push({ kind: 'groove', id: 'stl-nut', name: groove.name, mesh: cutterMesh });
      cuts.push({
        kind: 'groove',
        id: 'stl-nut',
        name: groove.name,
        mouthLengthMM: groove.mouthLengthMM,
        depthMM: groove.depthMM,
        heightMM: groove.heightMM,
        removedMM3: round(before - body.volume()),
      });
    }
    const volume = body.volume(),
      mesh = manifoldToMesh(body),
      solids = body.decompose().length;
    if (!(volume > 0) || solids !== 1)
      fail(`Die Baugruppe muss ein geschlossener Körper sein (gefunden: ${solids}).`, 'CAMERA_HOLDER_BODY');
    const boresOut = bores.map((source) => structuredClone(source));
    return {
      version: 1,
      kind: 'cameraHolderAssembly',
      name,
      status: 'complete',
      mesh,
      volume: round(volume),
      bounds: meshBounds(mesh),
      solids,
      baseMesh: joinedBaseMesh,
      sourceMeshes: {
        ...(baseMesh ? {} : { arm: structuredClone(arm.mesh), plate: structuredClone(plate.mesh) }),
        cutters: cutterSources,
      },
      sources: {
        arm: armSource,
        plate: plateSource,
        bores: boresOut,
        groove: groove ? structuredClone(groove) : null,
      },
      cuts,
      report: {
        volumeMM3: round(volume),
        solids,
        boreSources: boresOut.length,
        boreStages: boresOut.reduce((sum, source) => sum + source.stages.length, 0),
        grooveRemovedMM3: cuts.find((cut) => cut.kind === 'groove')?.removedMM3 ?? 0,
        boundsMM: meshBounds(mesh),
      },
    };
  } finally {
    for (const shape of owned.reverse()) shape.delete();
  }
}

/** Serializable source record kept in the saved draft (no geometry duplication). */
export function cameraHolderSources(assembly) {
  if (assembly?.kind !== 'cameraHolderAssembly') fail('Keine gespeicherte Baugruppe.', 'CAMERA_HOLDER_OPEN');
  return structuredClone(assembly.sources);
}

export function openCameraHolderAssembly(saved) {
  if (saved?.version !== 1 || saved.kind !== 'cameraHolderAssembly' || !saved.sources)
    fail('Kein gespeicherter Kamerahalter-Entwurf.', 'CAMERA_HOLDER_OPEN');
  const sources = structuredClone(saved.sources);
  for (const source of sources.bores ?? []) validateBoreSource(source);
  return { ...structuredClone(saved), sources };
}

/** Change one measured stage diameter; the caller rebuilds from the saved base. */
export function setAssemblyBoreDiameter(assembly, boreId, stageIndex, diameterMM) {
  const opened = openCameraHolderAssembly(assembly),
    source = opened.sources.bores.find((entry) => entry.id === boreId),
    stage = source?.stages.find((entry) => entry.index === stageIndex);
  if (!stage) fail('Bohrquelle oder Stufe nicht gefunden.', 'CAMERA_HOLDER_BORE');
  if (!(diameterMM >= 0.05 && diameterMM <= 1000))
    fail('Der Durchmesser muss zwischen 0,05 und 1000 mm liegen.', 'CAMERA_HOLDER_BORE');
  stage.diameterMM = round(diameterMM);
  return opened;
}

export function rebuildCameraHolderAssembly(kernel, saved, options = {}) {
  const opened = openCameraHolderAssembly(saved);
  return composeCameraHolderAssembly(kernel, {
    baseMesh: opened.baseMesh,
    bores: opened.sources.bores ?? [],
    groove: opened.sources.groove,
    name: opened.name ?? 'Kamerahalter',
    ...options,
  });
}

const sourceNode = (id, name, notes, tags, mesh) => ({
  id,
  kind: 'mesh',
  name,
  transform: [...IDENTITY],
  meshRole: 'solid',
  color: '#8fa3b8',
  opacity: 1,
  hidden: true,
  locked: false,
  metadata: { notes, tags },
  mesh: { verts: [...mesh.verts], triangles: [...mesh.triangles] },
});

export function cameraHolderBodyNode(assembly, { id = 'kamerahalter-koerper', name = 'Kamerahalter' } = {}) {
  if (assembly?.kind !== 'cameraHolderAssembly' || !assembly.mesh)
    fail('Kein gespeicherter Baugruppenkörper.', 'CAMERA_HOLDER_BODY');
  return {
    id,
    kind: 'mesh',
    name,
    transform: [...IDENTITY],
    meshRole: 'solid',
    color: '#7ba8bf',
    opacity: 1,
    hidden: false,
    locked: false,
    metadata: {
      notes:
        'R05 Kamerahalter aus gemessenem Arm, Grundplatte, Bohrquellen und STL-Nut. ' +
        'Die gemessenen Quellen liegen als eigene, benannte Objekte im Projekt.',
      tags: ['R05', 'Kamerahalter', 'gemessene Baugruppe'],
    },
    mesh: { verts: [...assembly.mesh.verts], triangles: [...assembly.mesh.triangles] },
  };
}

/**
 * Most recent measurement record for the draft. Project metadata is strictly
 * validated, so the editable source objects live beside the joined body and the
 * report is returned here instead of inside the project.
 */
export function cameraHolderDraftRecord(assembly) {
  if (assembly?.kind !== 'cameraHolderAssembly') fail('Keine gespeicherte Baugruppe.', 'CAMERA_HOLDER_OPEN');
  return { version: 1, kind: 'cameraHolderDraft', sources: cameraHolderSources(assembly), report: structuredClone(assembly.report) };
}

/** Joined body plus every measured source as its own hidden, named mesh object. */
export function cameraHolderProjectNodes(assembly, { id = 'kamerahalter-koerper', name = 'Kamerahalter' } = {}) {
  const body = cameraHolderBodyNode(assembly, { id, name }),
    nodes = [body],
    meshes = assembly.sourceMeshes ?? {};
  if (meshes.arm)
    nodes.push(
      sourceNode(
        'r05-quelle-armkopf',
        'Armkopf (gemessene Quelle)',
        'R02 Armkopf aus dem gemessenen Schnitt Y = 14,37.',
        ['R05', 'gemessene Quelle'],
        meshes.arm,
      ),
    );
  if (meshes.plate)
    nodes.push(
      sourceNode(
        'r05-quelle-grundplatte',
        'Grundplatte (gemessene Quelle)',
        'R03 Grundplatte aus dem gemessenen Schnitt Z = 7,33.',
        ['R05', 'gemessene Quelle'],
        meshes.plate,
      ),
    );
  for (const cutter of meshes.cutters ?? []) {
    const groove = cutter.kind === 'groove',
      note = groove
        ? 'Gemessene STL-Nut als Schneidquelle, als eigenes Objekt bearbeitbar.'
        : 'R04 gemessene Bohrquelle ' + cutter.id + ', Stufe ' + cutter.stage + ', als eigenes Objekt bearbeitbar.';
    nodes.push(
      sourceNode(
        'r05-quelle-' + (groove ? 'nut' : 'bohrung-' + cutter.id + '-stufe-' + cutter.stage),
        cutter.name + (groove ? '' : ' · Stufe ' + cutter.stage),
        note,
        ['R05', 'Schneidquelle'],
        cutter.mesh,
      ),
    );
  }
  return nodes;
}

/** Axis-aligned regions used to group the largest deviations by part area. */
export function assemblyRegions(assembly) {
  const sources = assembly?.sources,
    regions = [];
  const push = (id, label, bounds) => bounds && regions.push({ id, label, bounds });
  push('armkopf', 'Armkopf', sources?.arm?.bounds);
  push('grundplatte', 'Grundplatte', sources?.plate?.bounds);
  for (const source of sources?.bores ?? []) {
    const radius = Math.max(...source.stages.map((stage) => stage.diameterMM)) / 2 + 0.5,
      points = source.stages.flatMap((stage) => [stage.from, stage.to, stage.center].filter(Boolean));
    if (!points.length) continue;
    // An open axial end only names its measured opening. Grouping stays a small
    // box around that point instead of claiming the unknown hole length.
    const min = [Infinity, Infinity, Infinity],
      max = [-Infinity, -Infinity, -Infinity];
    for (const point of points)
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], point[k] - radius);
        max[k] = Math.max(max[k], point[k] + radius);
      }
    push(source.id, 'Bohrung ' + source.name, { min, max });
  }
  return regions;
}

export function groupAssemblyDeviations(worstPoints, regions = []) {
  const groups = new Map();
  for (const entry of worstPoints ?? []) {
    const point = entry.point,
      region =
        regions.find(({ bounds }) =>
          point.every((value, axis) => value >= bounds.min[axis] - 1e-6 && value <= bounds.max[axis] + 1e-6),
        ) ?? { id: 'sonstiges', label: 'Stützen und sonstiges' };
    const group = groups.get(region.id) ?? {
      id: region.id,
      label: region.label,
      count: 0,
      maximumMM: 0,
      directions: new Set(),
      worst: null,
    };
    group.count++;
    group.directions.add(entry.direction);
    if (!group.worst || entry.distance > group.worst.distance)
      group.worst = { point: entry.point, distance: entry.distance, direction: entry.direction };
    group.maximumMM = Math.max(group.maximumMM, entry.distance);
    groups.set(region.id, group);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, directions: [...group.directions] }))
    .sort((a, b) => b.maximumMM - a.maximumMM);
}

/**
 * Admission run: outer skin decides (24k/48k/96k, fixed seed), the raw
 * comparison is always reported. The worst sampled points are measured once at
 * the highest sample count so every finding keeps its world location.
 */
export function evaluateAssemblyDeviation({
  original,
  candidate,
  samples = [24000, 48000, 96000],
  budget = ASSEMBLY_LIMITS.budgetMM,
  seed = OUTER_SKIN_SEED,
  collectWorst = true,
}) {
  validateMesh(original, 'Original-STL');
  validateMesh(candidate, 'Kandidat');
  const evaluation = evaluateOuterSkin({ original, candidate, samples, seed, budget }),
    points = [];
  if (collectWorst) {
    const { report } = buildOuterSkinReference(original, { budget }),
      insideScope = report.proven
        ? createExcludedNeighbourhood(original, report.excludedFaceIds, OUTER_SKIN_EXCLUDED_NEIGHBOURHOOD_MM)
        : null,
      measured = measureSurfaceDeviation({
        reference: original,
        candidate,
        samples: Math.max(...samples),
        seed,
        budget,
        exactWorst: 50,
        skipInsideMaterial: report.proven,
        insideScope,
      });
    for (const entry of measured.referenceToCandidate.worst)
      points.push({ direction: 'reference-to-candidate', point: entry.point, distance: entry.exactMm });
    for (const entry of measured.candidateToReference.worst)
      points.push({ direction: 'candidate-to-reference', point: entry.point, distance: entry.exactMm });
  }
  const maxima = (key) => evaluation.runs.map((run) => (key === 'raw' ? run.raw : run.skin).worst),
    directionOf = (key) =>
      evaluation.runs.map((run) => ({
        samples: run.samples,
        maximumMM: round(run[key].worst),
        referenceToCandidateMM: round(run[key].maximum),
        candidateToReferenceMM: round(run[key].reverse),
        passed: run[key].worst <= budget,
      }));
  return {
    budget,
    seed,
    decidedBy: evaluation.decidedBy,
    proven: evaluation.proven,
    passed: evaluation.passed,
    outerSkin: directionOf('skin'),
    raw: directionOf('raw'),
    outerSkinMaximumMM: round(Math.max(...maxima('skin'))),
    rawMaximumMM: round(Math.max(...maxima('raw'))),
    worstPoints: points.sort((a, b) => b.distance - a.distance),
    runs: evaluation.runs.map((run) => ({ samples: run.samples, skin: round(run.skin.worst), raw: round(run.raw.worst) })),
    report: evaluation.report,
  };
}

/**
 * Draft admission: a saved candidate is admitted only when the outer skin stays
 * within budget. Otherwise the largest measured deviation keeps direction,
 * amount and world location so the error is visible for a geometric correction.
 */
export function admitCameraHolderDraft({ original, candidate, regions = [], samples, budget = ASSEMBLY_LIMITS.budgetMM, collectWorst = true }) {
  const evaluation = evaluateAssemblyDeviation({ original, candidate, samples, budget, collectWorst }),
    groups = groupAssemblyDeviations(evaluation.worstPoints, regions),
    largest = evaluation.worstPoints.find((entry) => entry.distance > budget) ?? evaluation.worstPoints[0] ?? null,
    admitted = evaluation.passed;
  return {
    admitted,
    blockedReason: admitted
      ? null
      : `Außenhaut-Abweichung ${evaluation.outerSkinMaximumMM} mm über dem Budget ${budget} mm.`,
    largest: largest
      ? {
          direction: largest.direction,
          amountMM: round(largest.distance),
          locationMM: largest.point.map(round),
          group: groups.find((group) => group.worst?.point === largest.point)?.label ?? null,
        }
      : null,
    groups,
    evaluation,
  };
}

// --- functional probes -------------------------------------------------------

/** Nearest ray/triangle hit distance; no hit yields null. */
export function rayMeshDistance(mesh, origin, direction, maxDistance = Infinity) {
  validateMesh(mesh, 'Prüfnetz');
  const o = point3(origin, 'Strahlursprung'),
    d = unit(direction, 'Strahlrichtung');
  let best = maxDistance;
  for (let f = 0; f < mesh.triangles.length; f += 3) {
    const a = [mesh.verts[mesh.triangles[f] * 3], mesh.verts[mesh.triangles[f] * 3 + 1], mesh.verts[mesh.triangles[f] * 3 + 2]],
      b = [mesh.verts[mesh.triangles[f + 1] * 3], mesh.verts[mesh.triangles[f + 1] * 3 + 1], mesh.verts[mesh.triangles[f + 1] * 3 + 2]],
      c = [mesh.verts[mesh.triangles[f + 2] * 3], mesh.verts[mesh.triangles[f + 2] * 3 + 1], mesh.verts[mesh.triangles[f + 2] * 3 + 2]],
      edge1 = sub(b, a),
      edge2 = sub(c, a),
      h = cross(d, edge2),
      determinant = dot(edge1, h);
    if (Math.abs(determinant) < 1e-12) continue;
    const inverse = 1 / determinant,
      s = sub(o, a),
      u = inverse * dot(s, h);
    if (u < -1e-9 || u > 1 + 1e-9) continue;
    const q = cross(s, edge1),
      v = inverse * dot(d, q);
    if (v < -1e-9 || u + v > 1 + 1e-9) continue;
    const t = inverse * dot(edge2, q);
    if (t > 1e-9 && t < best) best = t;
  }
  return best === maxDistance ? null : best;
}

/**
 * Each probe returns its own measured finding. Kinds:
 * bounds | clear (ray must miss within distance) | hit (ray must hit at the
 * measured distance) | thickness (two opposed rays give the measured wall).
 */
export function runFunctionalProbes(assembly, probes = []) {
  if (assembly?.kind !== 'cameraHolderAssembly') fail('Keine Baugruppe für die Funktionsproben.', 'CAMERA_HOLDER_PROBE');
  const bounds = meshBounds(assembly.mesh),
    findings = [];
  for (const probe of probes) {
    const finding = { label: probe.label, kind: probe.kind, passed: false, actual: null, expected: null };
    if (probe.kind === 'bounds') {
      const expected = probe.expected,
        tolerance = probe.toleranceMM ?? ASSEMBLY_LIMITS.boundToleranceMM,
        deviation = Math.max(
          ...['min', 'max'].flatMap((edge) => expected[edge].map((value, axis) => Math.abs(value - bounds[edge][axis]))),
        );
      finding.expected = expected;
      finding.actual = { boundsMM: bounds, deviationMM: round(deviation) };
      finding.passed = deviation <= tolerance;
    } else if (probe.kind === 'clear') {
      const hit = rayMeshDistance(assembly.mesh, probe.origin, probe.direction, probe.distanceMM);
      finding.expected = { clearanceMM: probe.distanceMM };
      finding.actual = { hitMM: hit === null ? null : round(hit) };
      finding.passed = hit === null;
    } else if (probe.kind === 'hit') {
      const hit = rayMeshDistance(assembly.mesh, probe.origin, probe.direction),
        tolerance = probe.toleranceMM ?? 0.12;
      finding.expected = { distanceMM: probe.distanceMM, toleranceMM: tolerance };
      finding.actual = { hitMM: hit === null ? null : round(hit) };
      finding.passed = hit !== null && Math.abs(hit - probe.distanceMM) <= tolerance;
    } else if (probe.kind === 'thickness') {
      const forward = rayMeshDistance(assembly.mesh, probe.origin, probe.direction),
        backward = rayMeshDistance(assembly.mesh, probe.origin, scale(probe.direction, -1)),
        tolerance = probe.toleranceMM ?? 0.12,
        thickness = forward === null || backward === null ? null : forward + backward;
      finding.expected = { thicknessMM: probe.thicknessMM, toleranceMM: tolerance };
      finding.actual = { thicknessMM: thickness === null ? null : round(thickness) };
      finding.passed = thickness !== null && Math.abs(thickness - probe.thicknessMM) <= tolerance;
    } else fail('Unbekannte Funktionsprobe.', 'CAMERA_HOLDER_PROBE');
    findings.push(finding);
  }
  return findings;
}
