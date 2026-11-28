import { meshContourGeometry as geometry } from './mesh-lid.js';
import { meshPlanarPatches } from './mesh-features.js';
import { meshSectionContours } from './mesh-section-contours.js';

const MAX_AXES = 3;
const MAX_PLANES = 12;
const MAX_RESULTS = 16;
const CENTER_TOLERANCE_MM = 0.08;
const { dot, sub } = geometry;
const rounded = (value) => Number(value.toFixed(5));

function onSameAxis(a, b, normal) {
  const delta = sub(a.center, b.center);
  const along = dot(delta, normal);
  return Math.hypot(...delta.map((value, i) => value - normal[i] * along)) <= CENTER_TOLERANCE_MM;
}

function sameDiameter(a, b) {
  return Math.abs(a.diameter - b.diameter) <= 2 * (a.fitErrorBound + b.fitErrorBound) + 0.004;
}

function uniqueMatch(circle, others, normal, matches) {
  const candidates = others.filter((other) => onSameAxis(circle, other, normal) && matches(circle, other));
  return candidates.length === 1 ? candidates[0] : undefined;
}

function measureBands(node, frame, levels) {
  const measure = (t) => {
    try {
      const section = meshSectionContours(node, {
        normal: frame.n, planePoint: frame.world([0, 0, t]), summaryOnly: true,
      });
      return section.measurements.filter(({ kind, role }) => kind === 'circle' && role !== 'outer');
    } catch (error) {
      if (!['MESH_LID_SECTION', 'MESH_SECTION_CONTOURS'].includes(error.code)) throw error;
      return [];
    }
  };
  return levels.slice(1).map((end, index) => {
    const start = levels[index], inset = Math.min(0.04, (end - start) / 4);
    if (end - start < 0.08) return [];
    const low = measure(start + inset), middle = measure((start + end) / 2), high = measure(end - inset);
    return middle.flatMap((circle) => {
      const first = uniqueMatch(circle, low, frame.n, sameDiameter);
      const last = uniqueMatch(circle, high, frame.n, sameDiameter);
      if (!first || !last || !sameDiameter(first, last)) return [];
      const confirmed = [first, circle, last].filter((sample) => sample.role === 'hole').length;
      return [{ ...circle, start, end, inset, confirmed,
        fitErrorBound: Math.max(first.fitErrorBound, circle.fitErrorBound, last.fitErrorBound) }];
    });
  });
}

function stageInfo(circle, bands, index, direction, frame) {
  let edge = circle;
  let partial = circle.confirmed !== 3;
  for (let i = index + direction; bands[i]; i += direction) {
    const match = uniqueMatch(circle, bands[i], frame.n, sameDiameter);
    if (!match) break;
    partial ||= match.confirmed !== 3;
    edge = match;
  }
  const first = direction < 0 ? edge : circle, last = direction > 0 ? edge : circle;
  const centerProjection = dot(sub(circle.center, frame.anchor), frame.n);
  const worldPoint = (t) => circle.center.map((value, i) => rounded(value + frame.n[i] * (t - centerProjection)));
  return {
    diameterMM: rounded(circle.diameter),
    diameterFitBoundMM: rounded(2 * circle.fitErrorBound),
    from: worldPoint(first.start),
    to: worldPoint(last.end),
    depthBetweenPlanesMM: rounded(last.end - first.start),
    sampleInsetFromEndsMM: [rounded(first.inset), rounded(last.inset)],
    ...(partial ? { includesUnclassifiedSections: true } : {}),
  };
}

// Evidence for abrupt diameter changes. Only closed hole loops on both sides
// seed a step. Open sections can extend an already identified diameter band.
export function measuredSteppedBores(node) {
  if (!node.mesh?.triangles?.length || node.mesh.triangles.length / 3 > 100000) return [];
  const source = geometry.source(node);
  const axes = [];
  for (const patch of meshPlanarPatches(source)) {
    let axis = axes.find(({ normal }) => Math.abs(dot(normal, patch.normal)) > 1 - 1e-6);
    if (!axis) {
      axis = { normal: patch.normal, levels: [], area: 0 };
      axes.push(axis);
    }
    axis.area += patch.area;
    const t = dot(sub(patch.point, source.anchor), axis.normal);
    if (axis.levels.length < MAX_PLANES && !axis.levels.some((other) => Math.abs(other - t) < 0.008)) axis.levels.push(t);
  }
  const results = [];
  const differs = (a, b) => a.confirmed >= 2 && b.confirmed >= 2 &&
    Math.abs(a.diameter - b.diameter) >= 0.18 && !sameDiameter(a, b);
  const relevant = axes.filter(({ levels }) => levels.length >= 3).sort((a, b) => b.area - a.area).slice(0, MAX_AXES);
  for (const { normal, levels } of relevant) {
    const frame = geometry.frame(source, normal);
    const bands = measureBands(node, frame, levels.sort((a, b) => a - b));
    for (let i = 1; i < bands.length; i++) {
      for (const before of bands[i - 1]) {
        const after = uniqueMatch(before, bands[i], normal, differs);
        if (!after || uniqueMatch(after, bands[i - 1], normal, differs) !== before) continue;
        results.push({
          axis: normal.map(rounded),
          stages: [stageInfo(before, bands, i - 1, -1, frame), stageInfo(after, bands, i, 1, frame)],
        });
      }
    }
  }
  const diameterChange = ({ stages: [a, b] }) => Math.abs(a.diameterMM - b.diameterMM);
  return results.sort((a, b) => diameterChange(b) - diameterChange(a)).slice(0, MAX_RESULTS);
}

// R04: each measured bore stage keeps its own centre. A stepped bore is not
// forced onto one axis: the r7 measurement shows a lateral offset between the
// stages, and that offset is part of the editable source.
export const BORE_SOURCE_LIMITS = Object.freeze({
  measurementToleranceMM: 0.005,
  pointToleranceMM: 0.05,
  diameterToleranceMM: 0.05,
  depthToleranceMM: 0.15,
  offsetToleranceMM: 0.02,
  axisTolerance: 1e-4,
  scanStepMM: 0.1,
  maximumStages: 4,
});

function failBore(message, code = 'BORE_SOURCE') {
  throw Object.assign(Error(message), { code });
}
const boreFinite = (value) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e6;
function borePoint(value, what) {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(boreFinite))
    failBore(`${what}: endlicher Punkt in mm erforderlich.`, 'BORE_SOURCE_INPUT');
  return [...value];
}
function boreAxis(value, what) {
  const point = borePoint(value, what),
    length = Math.hypot(...point);
  if (length < 1e-9) failBore(`${what}: Richtung fehlt.`, 'BORE_SOURCE_INPUT');
  return point.map((entry) => entry / length);
}
const boreAdd = (a, b) => a.map((value, i) => value + b[i]);
const boreScale = (a, factor) => a.map((value) => value * factor);
const boreDistance = (a, b) => Math.hypot(...sub(a, b));
const boreMidpoint = (a, b) => a.map((value, i) => (value + b[i]) / 2);
function boreLateralDistance(point, origin, axis) {
  const delta = sub(point, origin),
    along = dot(delta, axis);
  return Math.hypot(...delta.map((value, i) => value - axis[i] * along));
}
function boreProjection(point, origin, axis) {
  return dot(sub(point, origin), axis);
}

// The r7 evidence stores circles either as section measurements or as the R01
// profile records. Both name the same measured opening.
function sectionHoles(section) {
  const list = Array.isArray(section?.innerCircles)
    ? section.innerCircles
    : Array.isArray(section?.measurements)
      ? section.measurements
      : null;
  if (!list) failBore('Schnittmessung mit gemessenen Kreisen erforderlich.', 'BORE_SOURCE_SECTION');
  return list.filter(
    (entry) =>
      (entry.kind === undefined || entry.kind === 'circle') &&
      entry.role !== 'outer' &&
      Array.isArray(entry.center) &&
      entry.center.every(boreFinite) &&
      boreFinite(entry.diameter),
  );
}
function sectionNormal(section) {
  return boreAxis(section?.normal ?? section?.cut?.normal, 'Schnittnormale');
}
function sectionPlanePoint(section) {
  return section?.measurementPlanePoint ?? section?.cut?.planePoint ?? null;
}

function openingFromSection(section, { id, label, side }, toleranceMM) {
  const holes = sectionHoles(section);
  if (holes.length !== 1)
    failBore(
      `${label}: genau eine gemessene Öffnung erforderlich, gefunden ${holes.length}.`,
      'BORE_SOURCE_MEASUREMENT',
    );
  const hole = holes[0],
    axis = sectionNormal(section),
    planePoint = sectionPlanePoint(section),
    offPlane = planePoint ? Math.abs(boreProjection(hole.center, planePoint, axis)) : 0;
  if (offPlane > toleranceMM)
    failBore(`${label}: Mittelpunkt liegt ${rounded(offPlane)} mm neben dem gemessenen Schnitt.`, 'BORE_SOURCE_MEASUREMENT');
  return {
    id,
    label,
    side,
    point: [...hole.center],
    center: [...hole.center],
    axis,
    diameterMM: rounded(hole.diameter),
    radiusFitErrorBoundMM: boreFinite(hole.fitErrorBound) ? hole.fitErrorBound : 0,
    diameterFitBoundMM: rounded(2 * (boreFinite(hole.fitErrorBound) ? hole.fitErrorBound : 0)),
    cut: {
      normal: [...axis],
      planePoint: planePoint ? [...planePoint] : [...hole.center],
      ...(section.cut?.sectionShift !== undefined ? { sectionShift: section.cut.sectionShift } : {}),
    },
  };
}

/**
 * R04-01: read the front and the rear opening of the r7 measurement as two
 * separately named world points. Each point stays bound to the section that
 * measured it, and the rear point is cross-checked against the measured
 * stepped bore.
 */
export function measuredBoreOpenings(evidence = {}, options = {}) {
  const toleranceMM = options.toleranceMM ?? BORE_SOURCE_LIMITS.measurementToleranceMM,
    front = openingFromSection(
      evidence.frontSection,
      { id: 'bohrung-vorne', label: 'Vordere Öffnung (Armkopf, gemessener Schnitt Y=14,37)', side: 'front' },
      toleranceMM,
    ),
    rear = openingFromSection(
      evidence.rearSection,
      { id: 'bohrung-hinten', label: 'Hintere Öffnung (Lagersitz, gemessener Schnitt Y=60,19)', side: 'rear' },
      toleranceMM,
    ),
    checks = [];
  if (Math.abs(dot(front.axis, rear.axis)) < 1 - BORE_SOURCE_LIMITS.axisTolerance)
    failBore('Die beiden gemessenen Öffnungen liegen nicht auf parallelen Achsen.', 'BORE_SOURCE_MEASUREMENT');
  checks.push({
    id: 'getrennte-punkte',
    ok: boreDistance(front.point, rear.point) > toleranceMM,
    expected: 'zwei verschiedene Weltpunkte',
    actual: rounded(boreDistance(front.point, rear.point)),
    detail: 'Vordere und hintere Öffnung bleiben getrennt bezeichnet.',
  });
  if (!checks[0].ok)
    failBore('Vordere und hintere Öffnung sind nicht unterscheidbar.', 'BORE_SOURCE_MEASUREMENT');

  const checkCircle = evidence.frontCheck?.measuredCircle;
  if (checkCircle) {
    const centerDistance = boreDistance(checkCircle.center, front.center),
      diameterDifference = Math.abs(checkCircle.diameter - front.diameterMM);
    checks.push({
      id: 'gegenprobe-vorne',
      ok: centerDistance <= toleranceMM && diameterDifference <= toleranceMM,
      expected: { center: checkCircle.center, diameterMM: checkCircle.diameter },
      actual: { center: front.center, diameterMM: front.diameterMM },
      centerDistanceMM: rounded(centerDistance),
      diameterDifferenceMM: rounded(diameterDifference),
    });
    if (!checks.at(-1).ok)
      failBore('Die Frontbohrung stimmt nicht mit ihrer Gegenprobe überein.', 'BORE_SOURCE_MEASUREMENT');
  }

  const steps = Array.isArray(evidence.boreSteps?.steps)
    ? evidence.boreSteps.steps
    : Array.isArray(evidence.boreSteps)
      ? evidence.boreSteps
      : [];
  if (steps.length) {
    const candidates = [];
    for (const step of steps) {
      let axis;
      try {
        axis = boreAxis(step.axis, 'gemessene Achse');
      } catch {
        continue;
      }
      if (Math.abs(dot(axis, rear.axis)) < 1 - BORE_SOURCE_LIMITS.axisTolerance) continue;
      for (const stage of step.stages ?? []) {
        if (!Array.isArray(stage.from) || !Array.isArray(stage.to)) continue;
        const bound = (stage.diameterFitBoundMM ?? 0) + rear.diameterFitBoundMM,
          diameterDifference = Math.abs(stage.diameterMM - rear.diameterMM);
        if (diameterDifference > Math.max(toleranceMM, bound)) continue;
        const lateral = boreLateralDistance(rear.point, stage.from, axis),
          axialFrom = boreProjection(stage.from, rear.point, axis),
          axialTo = boreProjection(stage.to, rear.point, axis),
          between = Math.min(axialFrom, axialTo),
          beyond = Math.max(axialFrom, axialTo);
        if (lateral > toleranceMM || between > toleranceMM || beyond < -toleranceMM) continue;
        candidates.push({ axis, stage, lateral, diameterDifference });
      }
    }
    candidates.sort((a, b) => a.lateral - b.lateral);
    if (!candidates.length)
      failBore(
        'Der hintere Mittelpunkt passt zu keiner gemessenen Bohrungsstufe.',
        'BORE_SOURCE_MEASUREMENT',
      );
    const best = candidates[0];
    rear.measuredStage = {
      diameterMM: best.stage.diameterMM,
      diameterFitBoundMM: best.stage.diameterFitBoundMM ?? 0,
      from: [...best.stage.from],
      to: [...best.stage.to],
      depthMM: best.stage.depthBetweenPlanesMM,
      axis: [...best.axis],
    };
    checks.push({
      id: 'gegenprobe-hinten',
      ok: true,
      expected: { axis: best.axis, diameterMM: best.stage.diameterMM, lateralMM: 0 },
      actual: { point: rear.point, lateralMM: rounded(best.lateral), diameterMM: rear.diameterMM },
      detail: 'Hinterer Mittelpunkt liegt auf der gemessenen Stufenachse.',
    });
  }

  const delta = sub(rear.point, front.point);
  return {
    version: 1,
    kind: 'measuredBoreOpenings',
    units: 'mm',
    openings: [front, rear],
    offsetMM: rounded(boreDistance(front.point, rear.point)),
    lateralOffsetMM: rounded(boreLateralDistance(rear.point, front.point, front.axis)),
    offsetVector: delta.map(rounded),
    checks,
    ok: checks.every((entry) => entry.ok),
  };
}

function boreStageDiameter(value, what) {
  const diameter = Number(value);
  if (!Number.isFinite(diameter) || diameter < 0.05 || diameter > 1000)
    failBore(`${what}: Durchmesser zwischen 0,05 und 1000 mm erforderlich.`, 'BORE_SOURCE_INPUT');
  return diameter;
}

/** R04-02: an editable cutting source for one measured opening. The axial ends
 * are not part of this evidence and stay explicitly open. */
export function boreSourceFromOpening(opening, { id, name } = {}) {
  if (!opening || typeof opening !== 'object')
    failBore('Gemessene Öffnung zur Bohrquelle erforderlich.', 'BORE_SOURCE_INPUT');
  const point = borePoint(opening.point ?? opening.center, 'Öffnungsmittelpunkt'),
    axis = boreAxis(opening.axis, 'gemessene Achse'),
    diameterMM = rounded(boreStageDiameter(opening.diameterMM, 'Öffnung')),
    cut = opening.cut
      ? {
          normal: boreAxis(opening.cut.normal ?? axis, 'Schnittnormale'),
          planePoint: borePoint(opening.cut.planePoint ?? point, 'Schnittpunkt'),
        }
      : { normal: [...axis], planePoint: [...point] };
  return {
    version: 1,
    kind: 'boreSource',
    id: typeof id === 'string' && id ? id : opening.id ?? 'bohrung',
    name: typeof name === 'string' && name ? name : opening.label ?? 'Gemessene Bohrung',
    point,
    axis,
    cut,
    stages: [{ index: 1, diameterMM, from: null, to: null, depthMM: null, center: [...point] }],
    open: ['axiale Enden'],
    measurement: {
      kind: 'measuredOpening',
      section: opening.side ?? null,
      center: [...(opening.center ?? point)],
      diameterMM,
      diameterFitBoundMM: opening.diameterFitBoundMM ?? 0,
    },
  };
}

/** R04-03: axial ends, diameters and the measured lateral offset of a stepped
 * bore become one editable source. Stages keep their own centres. */
export function steppedBoreSource(step, { id, name, index = 0 } = {}) {
  const axis = boreAxis(step?.axis, 'gemessene Achse'),
    raw = Array.isArray(step?.stages) ? step.stages : [];
  if (!raw.length || raw.length > BORE_SOURCE_LIMITS.maximumStages)
    failBore(`Gestufte Bohrung benötigt 1 bis ${BORE_SOURCE_LIMITS.maximumStages} gemessene Stufen.`, 'BORE_SOURCE_INPUT');
  const origin = borePoint(raw[0].from, 'Stufenanfang'),
    t = (point) => boreProjection(point, origin, axis),
    stages = raw.map((entry, position) => {
      const from = borePoint(entry.from, `Stufe ${position + 1}: Anfang`),
        to = borePoint(entry.to, `Stufe ${position + 1}: Ende`),
        lateral = boreLateralDistance(to, from, axis),
        depth = t(to) - t(from);
      if (lateral > 0.01)
        failBore(`Stufe ${position + 1} verläuft nicht entlang der gemessenen Achse.`, 'BORE_SOURCE_INPUT');
      if (!(depth > 0.05))
        failBore(`Stufe ${position + 1}: axiales Ende liegt nicht hinter dem Anfang.`, 'BORE_SOURCE_INPUT');
      return {
        index: position + 1,
        diameterMM: rounded(boreStageDiameter(entry.diameterMM, `Stufe ${position + 1}`)),
        diameterFitBoundMM: rounded(entry.diameterFitBoundMM ?? 0),
        from,
        to,
        depthMM: rounded(depth),
        center: boreMidpoint(from, to),
      };
    });
  for (let position = 1; position < stages.length; position++) {
    const gap = Math.abs(t(stages[position].from) - t(stages[position - 1].to));
    if (gap > 0.01)
      failBore(`Stufen ${position} und ${position + 1} schließen nicht aneinander an (${rounded(gap)} mm).`, 'BORE_SOURCE_INPUT');
  }
  const lateralOffsets = stages.slice(1).map((stage, position) => ({
    fromStage: position + 1,
    toStage: position + 2,
    offsetMM: rounded(boreLateralDistance(stage.center, stages[position].center, axis)),
  }));
  return {
    version: 1,
    kind: 'boreSource',
    id: typeof id === 'string' && id ? id : `bohrung-grundplatte-${index + 1}`,
    name: typeof name === 'string' && name ? name : `Gestufte Grundplattenbohrung ${index + 1}`,
    point: [...stages[0].from],
    axis,
    stages,
    lateralOffsets,
    totalDepthMM: rounded(t(stages.at(-1).to) - t(stages[0].from)),
    open: [],
    measurement: {
      kind: 'measuredSteppedBore',
      source: 'r7-Bohrungsstufen',
      stageCount: stages.length,
      lateralOffsetMM: lateralOffsets.length ? Math.max(...lateralOffsets.map((entry) => entry.offsetMM)) : 0,
    },
  };
}

/** Validate the editable shape of a bore source without changing it. */
export function validateBoreSource(source) {
  if (!source || typeof source !== 'object' || source.kind !== 'boreSource' || source.version !== 1)
    failBore('Keine Bohrquelle zum Öffnen.', 'BORE_SOURCE_OPEN');
  if (typeof source.id !== 'string' || !source.id || typeof source.name !== 'string' || !source.name)
    failBore('Bohrquelle benötigt Kennung und Namen.', 'BORE_SOURCE_OPEN');
  borePoint(source.point, 'Bohrquellenpunkt');
  boreAxis(source.axis, 'Bohrquellenachse');
  if (!Array.isArray(source.stages) || !source.stages.length || source.stages.length > BORE_SOURCE_LIMITS.maximumStages)
    failBore('Bohrquelle benötigt 1 bis 4 Stufen.', 'BORE_SOURCE_OPEN');
  const indexes = new Set();
  for (const stage of source.stages) {
    if (!Number.isInteger(stage?.index) || indexes.has(stage.index))
      failBore('Bohrstufen benötigen eineindeutige Indizes.', 'BORE_SOURCE_OPEN');
    indexes.add(stage.index);
    boreStageDiameter(stage.diameterMM, 'Bohrstufe');
    borePoint(stage.center, 'Stufenmittelpunkt');
    if (stage.from !== null || stage.to !== null) {
      const from = borePoint(stage.from, 'Stufenanfang'),
        to = borePoint(stage.to, 'Stufenende');
      if (!(boreProjection(to, from, boreAxis(source.axis, 'Achse')) > 0.05))
        failBore('Bohrstufe endet nicht nach ihrem Anfang.', 'BORE_SOURCE_OPEN');
    }
    if (stage.depthMM !== null && !(boreFinite(stage.depthMM) && stage.depthMM > 0.05))
      failBore('Ungültige Stufentiefe.', 'BORE_SOURCE_OPEN');
  }
  if (!source.measurement || typeof source.measurement !== 'object')
    failBore('Bohrquelle ohne Messherkunft.', 'BORE_SOURCE_OPEN');
  return structuredClone(source);
}

function rigidMatrix(matrix) {
  if (!Array.isArray(matrix) || matrix.length !== 16 || !matrix.every(boreFinite))
    failBore('Starre Abbildung als 4×4-Matrix erforderlich.', 'BORE_SOURCE_TRANSFORM');
  const columns = [0, 1, 2].map((column) => [matrix[column * 4], matrix[column * 4 + 1], matrix[column * 4 + 2]]),
    lengths = columns.map((column) => Math.hypot(...column)),
    dots = [dot(columns[0], columns[1]), dot(columns[0], columns[2]), dot(columns[1], columns[2])];
  if (lengths.some((length) => Math.abs(length - 1) > 1e-6) || dots.some((value) => Math.abs(value) > 1e-6))
    failBore('Bohrquellen lassen sich nur starr drehen und verschieben.', 'BORE_SOURCE_TRANSFORM');
  const determinant =
    columns[0][0] * (columns[1][1] * columns[2][2] - columns[2][1] * columns[1][2]) -
    columns[0][1] * (columns[1][0] * columns[2][2] - columns[2][0] * columns[1][2]) +
    columns[0][2] * (columns[1][0] * columns[2][1] - columns[2][0] * columns[1][1]);
  if (determinant < 0)
    failBore('Eine Spiegelung ist keine Drehung der Bohrquelle.', 'BORE_SOURCE_TRANSFORM');
  const apply = (point) => [
    matrix[0] * point[0] + matrix[4] * point[1] + matrix[8] * point[2] + matrix[12],
    matrix[1] * point[0] + matrix[5] * point[1] + matrix[9] * point[2] + matrix[13],
    matrix[2] * point[0] + matrix[6] * point[1] + matrix[10] * point[2] + matrix[14],
  ];
  return {
    point: apply,
    direction: (direction) => boreAxis(apply(direction).map((value, i) => value - apply([0, 0, 0])[i]), 'gedrehte Richtung'),
  };
}

/** R04-04: rotate/translate a bore source. Point, axis, cut and every axial end
 * follow the same rigid placement. */
export function transformBoreSource(source, matrix) {
  const valid = validateBoreSource(source),
    rigid = rigidMatrix(matrix);
  const stages = valid.stages.map((stage) => ({
    ...stage,
    center: rigid.point(stage.center),
    from: stage.from === null ? null : rigid.point(stage.from),
    to: stage.to === null ? null : rigid.point(stage.to),
  }));
  const measurement = structuredClone(valid.measurement);
  if (measurement.center) measurement.center = rigid.point(measurement.center);
  const transformed = {
    ...valid,
    point: rigid.point(valid.point),
    axis: rigid.direction(valid.axis),
    stages,
    measurement,
    transformedBy: [...matrix],
  };
  if (valid.cut)
    transformed.cut = {
      ...valid.cut,
      normal: rigid.direction(valid.cut.normal),
      planePoint: rigid.point(valid.cut.planePoint),
    };
  return transformed;
}

/** Persist bore sources as plain JSON and reopen them as editable sources. */
export function saveBoreSources(sources) {
  const list = Array.isArray(sources) ? sources : sources?.sources;
  if (!Array.isArray(list) || !list.length) failBore('Mindestens eine Bohrquelle speichern.', 'BORE_SOURCE_SAVE');
  const checked = list.map((source) => validateBoreSource(source));
  return { version: 1, kind: 'boreSources', units: 'mm', sources: checked };
}
export function openBoreSources(saved) {
  const list = Array.isArray(saved) ? saved : saved?.sources;
  if (!Array.isArray(list) || !list.length) failBore('Keine gespeicherten Bohrquellen zum Öffnen.', 'BORE_SOURCE_OPEN');
  return {
    version: 1,
    kind: 'boreSourceLibrary',
    status: 'editable',
    sources: list.map((source) => validateBoreSource(source)),
  };
}

/** Change one stage diameter of an opened source. The measurement stays as
 * unchanged provenance; the stage is the editable design value. */
export function setBoreSourceStageDiameter(source, stageIndex, value) {
  const next = validateBoreSource(source),
    stage = next.stages.find((entry) => entry.index === stageIndex) ?? next.stages[stageIndex - 1];
  if (!stage) failBore('Unbekannte Bohrstufe: ' + String(stageIndex), 'BORE_SOURCE_DIMENSION');
  const from = stage.diameterMM,
    diameter = rounded(boreStageDiameter(value, 'Bohrstufe'));
  stage.diameterMM = diameter;
  next.edited = { stage: stage.index, name: 'durchmesser', from, to: diameter };
  return next;
}
export function setBoreSourceDiameter(source, value) {
  return setBoreSourceStageDiameter(source, source?.stages?.[0]?.index ?? 1, value);
}

function matchingStage(source, t) {
  let nearest = source.stages[0],
    nearestDistance = Infinity;
  for (const stage of source.stages) {
    if (stage.from === null || stage.to === null) return stage;
    const start = boreProjection(stage.from, source.point, source.axis),
      end = boreProjection(stage.to, source.point, source.axis),
      low = Math.min(start, end),
      high = Math.max(start, end);
    if (t >= low - 0.01 && t <= high + 0.01) return stage;
    const distance = t < low ? low - t : t - high;
    if (distance < nearestDistance) {
      nearest = stage;
      nearestDistance = distance;
    }
  }
  return nearest;
}

/** Compare one finished opening with its bore source. A swapped point or a bore
 * at the wrong centre fails; diameters are checked per stage. */
export function checkBoreSourceSection(source, section, options = {}) {
  const valid = validateBoreSource(source),
    pointTolerance = options.pointToleranceMM ?? BORE_SOURCE_LIMITS.pointToleranceMM,
    diameterTolerance = options.diameterToleranceMM ?? BORE_SOURCE_LIMITS.diameterToleranceMM,
    holes = sectionHoles(section),
    axis = sectionNormal(section),
    normalAgreement = Math.abs(dot(axis, valid.axis)),
    problems = [];
  const nearest = holes
    .map((hole) => ({ hole, distance: boreDistance(hole.center, valid.point) }))
    .sort((a, b) => a.distance - b.distance)[0];
  const checks = [];
  if (!nearest) {
    checks.push({ id: 'bohrung', ok: false, expected: valid.point, actual: null, distanceMM: null });
    problems.push({ id: 'bohrung', message: 'Kein geschlossener Bohrkreis im Schnitt.' });
  } else {
    const { hole, distance } = nearest,
      t = boreProjection(hole.center, valid.point, valid.axis),
      stage = matchingStage(valid, t),
      diameterDifference = Math.abs(hole.diameter - stage.diameterMM),
      segment = hole.center.map((value, i) => value - valid.point[i]);
    checks.push({
      id: 'mitte',
      ok: distance <= pointTolerance,
      expected: valid.point,
      actual: hole.center,
      distanceMM: rounded(distance),
      toleranceMM: pointTolerance,
    });
    if (distance > pointTolerance)
      problems.push({
        id: 'mitte',
        message: `Öffnung liegt ${rounded(distance)} mm neben dem Messpunkt ${valid.point.join(' / ')}.`,
        actual: hole.center,
      });
    checks.push({
      id: 'durchmesser',
      ok: diameterDifference <= diameterTolerance,
      stage: stage.index,
      expectedMM: stage.diameterMM,
      actualMM: hole.diameter,
      differenceMM: rounded(diameterDifference),
      toleranceMM: diameterTolerance,
    });
    if (diameterDifference > diameterTolerance)
      problems.push({
        id: 'durchmesser',
        message: `Stufe ${stage.index}: ${rounded(diameterDifference)} mm Durchmesserabweichung.`,
      });
    // The measured centre must stay in the plane of its own cut.
    const offPlane = Math.abs(dot(segment, valid.axis));
    checks.push({
      id: 'schnittebene',
      ok: offPlane <= pointTolerance,
      actualMM: rounded(offPlane),
      toleranceMM: pointTolerance,
    });
    if (offPlane > pointTolerance)
      problems.push({ id: 'schnittebene', message: `Mittelpunkt liegt ${rounded(offPlane)} mm neben der Schnittebene.` });
  }
  checks.push({
    id: 'achse',
    ok: normalAgreement >= 1 - BORE_SOURCE_LIMITS.axisTolerance,
    expected: valid.axis,
    actual: axis,
    agreement: Number(normalAgreement.toFixed(9)),
  });
  if (normalAgreement < 1 - BORE_SOURCE_LIMITS.axisTolerance)
    problems.push({ id: 'achse', message: 'Schnittnormale folgt nicht der gemessenen Bohrungsachse.' });
  return {
    version: 1,
    kind: 'boreSourceSectionCheck',
    units: 'mm',
    sourceId: valid.id,
    ok: problems.length === 0,
    checks,
    problems,
  };
}

function safeSection(node, planePoint, normal) {
  try {
    return meshSectionContours(node, { normal, planePoint, summaryOnly: true });
  } catch (error) {
    if (['MESH_LID_SECTION', 'MESH_SECTION_CONTOURS', 'MESH_SECTION_STALE'].includes(error.code)) return null;
    throw error;
  }
}

/**
 * R04-03/R04-04: measure every stage of a stepped bore in the finished mesh.
 * Diameter and depth come from sections along the source axis; the lateral
 * offset is measured between the stage centres instead of being assumed zero.
 */
export function measureBoreSourceStages(node, source, options = {}) {
  const valid = validateBoreSource(source),
    stepMM = options.stepMM ?? BORE_SOURCE_LIMITS.scanStepMM,
    diameterTolerance = options.diameterToleranceMM ?? BORE_SOURCE_LIMITS.diameterToleranceMM,
    depthTolerance = options.depthToleranceMM ?? BORE_SOURCE_LIMITS.depthToleranceMM,
    offsetTolerance = options.offsetToleranceMM ?? BORE_SOURCE_LIMITS.offsetToleranceMM,
    searchMM = options.searchMM ?? 0.5;
  if (!(stepMM > 0.005 && stepMM <= 0.5)) failBore('Ungültige Scan-Schrittweite.', 'BORE_SOURCE_MEASURE');
  if (valid.stages.some((stage) => stage.from === null || stage.to === null))
    failBore('Für Tiefenmessungen benötigt jede Stufe gemessene axiale Enden.', 'BORE_SOURCE_MEASURE');
  const stages = valid.stages.map((stage) => {
    const t0 = boreProjection(stage.from, valid.point, valid.axis),
      t1 = boreProjection(stage.to, valid.point, valid.axis),
      length = t1 - t0;
    if (!(length > 0.1)) failBore('Stufe ist zu kurz zum Messen.', 'BORE_SOURCE_MEASURE');
    const from = t0 - searchMM,
      to = t1 + searchMM,
      count = Math.ceil((to - from) / stepMM),
      samples = [];
    for (let index = 0; index <= count; index++) {
      const t = from + index * stepMM,
        section = safeSection(node, boreAdd(valid.point, boreScale(valid.axis, t)), valid.axis);
      if (!section) continue;
      const hole = sectionHoles(section)
        .filter(
          (entry) =>
            Math.abs(entry.diameter - stage.diameterMM) <= Math.max(0.2, 4 * stage.diameterFitBoundMM) &&
            boreLateralDistance(entry.center, stage.center, valid.axis) <= 0.3,
        )
        .sort(
          (a, b) =>
            Math.abs(a.diameter - stage.diameterMM) - Math.abs(b.diameter - stage.diameterMM),
        )[0];
      if (hole) samples.push({ index, t, center: hole.center, diameter: hole.diameter });
    }
    // Keep the contiguous run around the stage centre; material outside the
    // stage must not stretch the measured depth.
    const middle = Math.round((t0 + t1) / 2 / stepMM - from / stepMM),
      run = [];
    let current = [];
    for (const sample of samples) {
      if (current.length && sample.index !== current.at(-1).index + 1) {
        run.push(current);
        current = [];
      }
      current.push(sample);
    }
    if (current.length) run.push(current);
    const chosen = run.find((entries) => entries[0].index <= middle && entries.at(-1).index >= middle);
    if (!chosen)
      failBore(`Stufe ${stage.index} ist im fertigen Körper nicht messbar.`, 'BORE_SOURCE_MEASURE');
    const first = chosen[0],
      last = chosen.at(-1),
      measuredDepth = (last.index - first.index + 1) * stepMM,
      measuredDiameter = chosen.reduce((sum, entry) => sum + entry.diameter, 0) / chosen.length,
      measuredCenter = [0, 1, 2].map(
        (k) => chosen.reduce((sum, entry) => sum + entry.center[k], 0) / chosen.length,
      );
    return {
      index: stage.index,
      expected: { diameterMM: stage.diameterMM, depthMM: stage.depthMM, center: stage.center },
      actual: {
        diameterMM: rounded(measuredDiameter),
        depthMM: rounded(measuredDepth),
        center: measuredCenter.map(rounded),
      },
      deviations: {
        diameterMM: rounded(Math.abs(measuredDiameter - stage.diameterMM)),
        depthMM: rounded(Math.abs(measuredDepth - stage.depthMM)),
      },
      samples: chosen.length,
    };
  });
  const actualOffsets = stages.slice(1).map((stage, position) => ({
    fromStage: stages[position].index,
    toStage: stage.index,
    offsetMM: rounded(boreLateralDistance(stage.actual.center, stages[position].actual.center, valid.axis)),
  }));
  const expectedOffset =
    valid.lateralOffsets?.find((entry) => entry.toStage === stages[1]?.index)?.offsetMM ?? 0;
  const checks = [];
  for (const stage of stages) {
    checks.push({
      id: `stufe-${stage.index}-durchmesser`,
      ok: stage.deviations.diameterMM <= diameterTolerance,
      expectedMM: stage.expected.diameterMM,
      actualMM: stage.actual.diameterMM,
      differenceMM: stage.deviations.diameterMM,
      toleranceMM: diameterTolerance,
    });
    checks.push({
      id: `stufe-${stage.index}-tiefe`,
      ok: stage.deviations.depthMM <= depthTolerance,
      expectedMM: stage.expected.depthMM,
      actualMM: stage.actual.depthMM,
      differenceMM: stage.deviations.depthMM,
      toleranceMM: depthTolerance,
    });
  }
  const actualOffset = actualOffsets[0]?.offsetMM ?? 0;
  checks.push({
    id: 'seitlicher-versatz',
    ok: Math.abs(actualOffset - expectedOffset) <= offsetTolerance,
    expectedMM: expectedOffset,
    actualMM: actualOffset,
    differenceMM: rounded(Math.abs(actualOffset - expectedOffset)),
    toleranceMM: offsetTolerance,
    detail: 'Der gemessene Versatz bleibt erhalten; die Stufen werden nicht koaxial erzwungen.',
  });
  return {
    version: 1,
    kind: 'boreSourceStages',
    units: 'mm',
    sourceId: valid.id,
    stages,
    lateralOffsets: actualOffsets,
    checks,
    problems: checks.filter((entry) => !entry.ok),
    ok: checks.every((entry) => entry.ok),
  };
}
