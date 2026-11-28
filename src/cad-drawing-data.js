import { cadGeometryDigest, cadSourceGeometryDigest } from './cad-geometry-digest.js';
import { CAD_DRAWING_POINT_ROLES, cadDrawingCurvePoint } from './cad-drawing-measure.js';
import { partRowIdentity, validateExplosion } from './cad-part-properties.js';

const projectionViews = ['front', 'side', 'top', 'section', 'exploded'];

export const cadDrawingPaperPoint = (view, scale, p) => [view.position[0] + p[0] * scale, view.position[1] - p[1] * scale];

// Drawing data is deliberately kernel-free. Validation, paper layout and text
// movement never schedule a projection or alter a confirmed source body.
const fail = (message) => {
  const error = Error('Zeichnung: ' + message);
  error.code = 'INVALID_CAD_DRAWING';
  throw error;
};
const record = (v, keys) => {
  if (
    !v ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(v)) ||
    Object.keys(v).some((k) => !keys.includes(k))
  )
    fail('Unbekannte oder ungültige Felder.');
};
const number = (v, min = -1e6, max = 1e6) => {
  if (!Number.isFinite(v) || v < min || v > max) fail('Zahl außerhalb des zulässigen Bereichs.');
  return v === 0 ? 0 : v;
};
const integer = (v, min, max) => {
  if (!Number.isSafeInteger(v) || v < min || v > max) fail('Ganze Zahl außerhalb des zulässigen Bereichs.');
  return v === 0 ? 0 : v;
};
const text = (v, max = 200) => {
  if (typeof v !== 'string' || v.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))
    fail('Ungültiger Text.');
  return v;
};
const id = (v) => {
  text(v, 200);
  if (!v || /[\r\n]/.test(v)) fail('Ungültige Kennung.');
  return v;
};
const point = (v) => {
  if (!Array.isArray(v) || v.length !== 2) fail('2D-Punkt erforderlich.');
  return v.map((n) => number(n));
};
const list = (v, max, label) => {
  if (!Array.isArray(v) || v.length > max) fail(label + ' überschreitet die Grenze.');
  return v;
};
const enumeration = (v, values) => {
  if (!values.includes(v)) fail('Unbekannter Wert.');
  return v;
};
const unique = (values, label) => {
  if (new Set(values).size !== values.length) fail('Doppelte ' + label + '.');
};
const boolean = (v) => {
  if (typeof v !== 'boolean') fail('Wahrheitswert erforderlich.');
  return v;
};
const signatures = (value) => {
  const out = list(value, 128, 'Quellenbezüge').map((s) => {
    record(s, ['id', 'signature']);
    if (typeof s.signature !== 'string' || !/^[a-f0-9]{64}$/.test(s.signature)) fail('Ungültige Quellensignatur.');
    return { id: id(s.id), signature: s.signature };
  });
  unique(
    out.map((s) => s.id),
    'Quellenkennungen',
  );
  return out;
};
const sourceReferences = (value) => {
  const out = list(value, 8, 'Stabile Kantenbezüge').map((reference) => {
    record(reference, ['source', 'role', 'elementId', 'geometrySignature']);
    record(reference.source, ['rootId', 'path']);
    const out = {
      source: { rootId: id(reference.source.rootId), path: list(reference.source.path, 12, 'Quellenpfad').map(id) },
      role: text(reference.role, 300),
    };
    if (!out.role || /[\r\n]/.test(out.role)) fail('Stabile Kantenrolle erforderlich.');
    if (reference.elementId !== undefined) out.elementId = text(reference.elementId, 100);
    if (reference.geometrySignature !== undefined) {
      if (!/^[a-f0-9]{64}$/.test(reference.geometrySignature)) fail('Ungültige STEP-Geometriesignatur.');
      out.geometrySignature = reference.geometrySignature;
    }
    if (/^(step|screw)\.edge\.exact\./.test(out.role) && !out.geometrySignature)
      fail('Exakte Kantenbezüge benötigen den unveränderten Originalkörper.');
    return out;
  });
  if (!out.length) fail('Mindestens ein stabiler Kantenbezug erforderlich.');
  unique(
    out.map((reference) => JSON.stringify(reference)),
    'Kantenbezüge',
  );
  return out;
};
const referenceKey = (references) =>
  JSON.stringify(
    references
      .map((reference) =>
        JSON.stringify({
          source: { rootId: reference.source.rootId, path: reference.source.path },
          role: reference.role,
          ...(reference.elementId !== undefined ? { elementId: reference.elementId } : {}),
          ...(reference.geometrySignature !== undefined ? { geometrySignature: reference.geometrySignature } : {}),
        }),
      )
      .sort(),
  );
export const CAD_DRAWING_LIMITS = Object.freeze({
  sheets: 16,
  views: 32,
  annotations: 1000,
  curves: 20000,
  points: 200000,
  partsRows: 500,
  partsRetained: 2000,
});
export const cadDrawingId = (prefix) => prefix + '-' + globalThis.crypto.randomUUID();

// A drawing parts list is B04's grouped BOM placed as paper geometry. Column
// widths and row heights are paper millimetres so SVG, PDF and DXF share one
// compact table. `position` is the lower-left table corner; the default
// placement anchors the top edge below the upper margin and grows toward the
// existing title block.
export const CAD_DRAWING_PARTS_LIST_COLUMNS = Object.freeze([
  Object.freeze({ key: 'position', label: 'Pos.', width: 12, align: 'middle' }),
  Object.freeze({ key: 'partNumber', label: 'Teilenummer', width: 34, align: 'start' }),
  Object.freeze({ key: 'name', label: 'Benennung', width: 60, align: 'start' }),
  Object.freeze({ key: 'quantity', label: 'Menge', width: 14, align: 'middle' }),
  Object.freeze({ key: 'material', label: 'Werkstoff', width: 30, align: 'start' }),
]);
export const CAD_DRAWING_PARTS_LIST_STYLE = Object.freeze({
  titleHeight: 7,
  headerHeight: 6,
  rowHeight: 5.5,
});
export function cadDrawingPartsListSize(value) {
  const rows = Array.isArray(value) ? value.length : (value?.rows?.length ?? 0),
    width = CAD_DRAWING_PARTS_LIST_COLUMNS.reduce((sum, column) => sum + column.width, 0);
  return [
    width,
    CAD_DRAWING_PARTS_LIST_STYLE.titleHeight +
      CAD_DRAWING_PARTS_LIST_STYLE.headerHeight +
      rows * CAD_DRAWING_PARTS_LIST_STYLE.rowHeight,
  ];
}
export function cadDrawingPartsListDefaultPosition(sheet, rowCount = 0) {
  const [paperWidth, paperHeight] = cadDrawingPaperSize(sheet),
    [width, height] = cadDrawingPartsListSize(Array.from({ length: rowCount })),
    margin = 10,
    // Same title block as the SVG/DXF paper layout: 30 mm high, 10 mm above
    // the lower paper edge. Keep the table in the free area above it.
    availableHeight = paperHeight - 40 - margin;
  if (width > paperWidth - 2 * margin || height > availableHeight)
    fail(
      `Stückliste mit ${rowCount} Zeilen passt nicht auf das Zeichenblatt (${sheet.paper} ${sheet.orientation === 'landscape' ? 'quer' : 'hoch'}): ${width} mm × ${height} mm benötigt, ${paperWidth - 2 * margin} mm × ${availableHeight} mm verfügbar.`,
    );
  return [paperWidth - margin - width, margin + height];
}
const partsIdentityKey = (value) => {
  if (typeof value !== 'string' || !value || value.length > 4000 || /[\r\n]/.test(value))
    fail('Ungültige Stücklistenidentität.');
  return value;
};
const partsInstanceIds = (value) => {
  const instanceIds = list(value, CAD_DRAWING_LIMITS.partsRows, 'Stücklisten-Instanzen').map(id);
  if (!instanceIds.length) fail('Stücklistenposition benötigt mindestens eine Instanz.');
  unique(instanceIds, 'Stücklisten-Instanzen');
  return instanceIds;
};
export function validateCadDrawingPartsList(value) {
  record(value, ['id', 'title', 'position', 'rows', 'retainedPositions']);
  const out = {
      id: id(value.id),
      title: text(value.title, 200),
      position: point(value.position),
      rows: list(value.rows, CAD_DRAWING_LIMITS.partsRows, 'Stücklistenpositionen').map((row) => {
        record(row, [
          'position',
          'identityKey',
          'definitionId',
          'instanceIds',
          'name',
          'partNumber',
          'material',
          'quantity',
        ]);
        const optional = (entry, max) => (entry === null || entry === undefined ? null : text(entry, max));
        return {
          position: integer(row.position, 1, 1e6),
          identityKey: partsIdentityKey(row.identityKey),
          definitionId: row.definitionId === null || row.definitionId === undefined ? null : id(row.definitionId),
          instanceIds: partsInstanceIds(row.instanceIds),
          name: text(row.name, 200),
          partNumber: optional(row.partNumber, 120),
          material: optional(row.material, 120),
          quantity: integer(row.quantity, 1, 1e6),
        };
      }),
    },
    ordered = out.rows.sort((a, b) => a.position - b.position);
  out.rows = ordered;
  // A number that was once assigned stays attached to its B04 identity even
  // while the part is hidden or deleted. Such reservations are stored apart
  // from `rows`, so no export or sheet report can mistake them for an active
  // table position. The field is optional: format-39 sheets from before this
  // extension remain readable and simply carry no reservations.
  if (value.retainedPositions !== undefined) {
    out.retainedPositions = list(
      value.retainedPositions,
      CAD_DRAWING_LIMITS.partsRetained,
      'Zurückbehaltene Stücklistenpositionen',
    )
      .map((row) => {
        record(row, ['position', 'identityKey', 'instanceIds']);
        return {
          position: integer(row.position, 1, 1e6),
          identityKey: partsIdentityKey(row.identityKey),
          instanceIds: partsInstanceIds(row.instanceIds),
        };
      })
      .sort((a, b) => a.position - b.position);
  }
  const reserved = [...out.rows, ...(out.retainedPositions ?? [])];
  unique(
    reserved.map((row) => row.position),
    'Stücklisten-Positionsnummern',
  );
  unique(
    reserved.map((row) => row.identityKey),
    'Stücklistenidentitäten',
  );
  return out;
}
/** Rebuild the paper table from B04 grouped rows. Existing definition/execution
 * identities keep their stored position number even when the incoming row order
 * changes; new identities receive the next free number. Identities that are no
 * longer present are kept as non-exported reservations so hiding and showing
 * the same part again never assigns a different number. */
export function createCadDrawingPartsList(
  rows,
  { id: tableId, title = 'Stückliste', position, previous = null } = {},
) {
  const old = previous ? validateCadDrawingPartsList(previous) : null,
    reservations = new Map(
      [...(old?.rows ?? []), ...(old?.retainedPositions ?? [])].map((row) => [row.identityKey, row.position]),
    ),
    tableRows = list(rows, CAD_DRAWING_LIMITS.partsRows, 'Stücklistenpositionen').map((row) => {
      const identityKey = row?.identityKey ?? partRowIdentity(row);
      if (typeof identityKey !== 'string' || !identityKey || identityKey.length > 4000 || /[\r\n]/.test(identityKey))
        fail('Ungültige Stücklistenidentität.');
      const instanceIds = row?.instanceIds ?? [row?.id];
      return {
        position: reservations.get(identityKey) ?? 0,
        identityKey,
        definitionId: row?.definitionId ?? null,
        instanceIds: [...instanceIds],
        name: row?.name,
        partNumber: row?.partNumber ?? null,
        material: row?.material ?? null,
        quantity: row?.count ?? row?.quantity ?? 1,
      };
    });
  let next = Math.max(0, ...reservations.values());
  for (const row of tableRows)
    if (!row.position) {
      row.position = ++next;
      reservations.set(row.identityKey, row.position);
    }
  const active = new Set(tableRows.map((row) => row.identityKey)),
    retained = new Map();
  for (const row of [...(old?.rows ?? []), ...(old?.retainedPositions ?? [])])
    if (!active.has(row.identityKey) && !retained.has(row.identityKey))
      retained.set(row.identityKey, {
        position: row.position,
        identityKey: row.identityKey,
        instanceIds: [...row.instanceIds],
      });
  return validateCadDrawingPartsList({
    id: tableId ?? old?.id ?? cadDrawingId('parts'),
    title: old?.title ?? title,
    position: position ?? old?.position ?? [10, 100],
    rows: tableRows,
    ...(retained.size ? { retainedPositions: [...retained.values()].sort((a, b) => a.position - b.position) } : {}),
  });
}

// A detail view reuses an existing view's exact model curves inside a circular
// cutout. Nothing is re-projected: the retained analytic curves are translated
// to the cutout centre and analytically trimmed to the cutout radius. The
// detail owns its paper scale, so the underlying model millimetres stay 1:1 in
// DXF while the paper drawing can print the same hole at 2:1.
const TAU = Math.PI * 2,
  DETAIL_EPS = 1e-9;
const clean = (v) => (Math.abs(v) < 1e-12 ? 0 : v);
const localPoint = (p, center) => [clean(p[0] - center[0]), clean(p[1] - center[1])];
const pointRadius = (p, R) => p[0] * p[0] + p[1] * p[1] <= R * R + DETAIL_EPS * Math.max(1, R * R);
const detailText = (message) => {
  const error = Error('Zeichnung: ' + message);
  error.code = 'INVALID_CAD_DRAWING';
  throw error;
};
const modAngle = (value) => ((value % TAU) + TAU) % TAU;
const canonicalValue = (value) =>
  Array.isArray(value)
    ? value.map(canonicalValue)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonicalValue(value[key])]),
        )
      : value;
const sameDrawingValue = (a, b) => JSON.stringify(canonicalValue(a)) === JSON.stringify(canonicalValue(b));
function circleIntersections(cx, cy, radius, R) {
  const distance = Math.hypot(cx, cy);
  if (distance < DETAIL_EPS) return [];
  if (distance > radius + R + DETAIL_EPS || distance < Math.abs(radius - R) - DETAIL_EPS) return [];
  // Locate the shared chord from the aperture origin along the source-centre direction.
  const along = (R * R - radius * radius + distance * distance) / (2 * distance),
    heightSquared = R * R - along * along,
    tolerance = DETAIL_EPS * Math.max(1, R * R);
  if (heightSquared < -tolerance) return [];
  const height = Math.sqrt(Math.max(0, heightSquared)),
    ux = cx / distance,
    uy = cy / distance,
    px = ux * along,
    py = uy * along,
    rx = -uy * height,
    ry = ux * height;
  return [
    [px + rx, py + ry],
    [px - rx, py - ry],
  ];
}
function lineCircleParameters(a, b, R) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    A = dx * dx + dy * dy,
    B = 2 * (a[0] * dx + a[1] * dy),
    C = a[0] * a[0] + a[1] * a[1] - R * R;
  if (A < 1e-24) return [];
  const discriminant = B * B - 4 * A * C,
    tolerance = DETAIL_EPS * Math.max(1, Math.abs(B * B), Math.abs(4 * A * C));
  if (discriminant < -tolerance) return [];
  if (discriminant <= tolerance) return [-B / (2 * A)];
  const root = Math.sqrt(discriminant);
  return [(-B - root) / (2 * A), (-B + root) / (2 * A)];
}
const linePoint = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
function clipDetailLine(curve, R) {
  const { a, b } = curve,
    cuts = [0, ...lineCircleParameters(a, b, R).filter((t) => t > DETAIL_EPS && t < 1 - DETAIL_EPS), 1],
    out = [];
  for (let i = 1; i < cuts.length; i++) {
    const start = cuts[i - 1],
      end = cuts[i];
    if (end - start <= DETAIL_EPS) continue;
    if (pointRadius(linePoint(a, b, (start + end) / 2), R)) out.push([linePoint(a, b, start), linePoint(a, b, end)]);
  }
  return out;
}
function clipDetailCircle(curve, R) {
  const [cx, cy] = curve.center,
    radius = curve.radius,
    distance = Math.hypot(cx, cy);
  if (distance + radius <= R + DETAIL_EPS) return [{ kind: 'circle' }];
  const intersections = circleIntersections(cx, cy, radius, R),
    angles = [...new Set(intersections.map((p) => modAngle(Math.atan2(p[1] - cy, p[0] - cx))))].sort(
      (a, b) => a - b,
    );
  if (angles.length < 2) return [];
  const out = [];
  for (let i = 0; i < angles.length; i++) {
    const start = angles[i],
      end = angles[(i + 1) % angles.length] + (i === angles.length - 1 ? TAU : 0),
      middle = (start + end) / 2;
    if (pointRadius([cx + radius * Math.cos(middle), cy + radius * Math.sin(middle)], R))
      out.push({ kind: 'arc', startAngle: start, endAngle: end, clockwise: false });
  }
  return out;
}
function clipDetailArc(curve, R) {
  const [cx, cy] = curve.center,
    radius = curve.radius,
    span = curve.clockwise ? modAngle(curve.startAngle - curve.endAngle) : modAngle(curve.endAngle - curve.startAngle);
  if (span >= TAU - DETAIL_EPS) return clipDetailCircle(curve, R);
  const angleAt = (t) => curve.startAngle + (curve.clockwise ? -1 : 1) * span * t,
    cuts = [0, 1];
  for (const p of circleIntersections(cx, cy, radius, R)) {
    const angle = Math.atan2(p[1] - cy, p[0] - cx),
      delta = curve.clockwise ? modAngle(curve.startAngle - angle) : modAngle(angle - curve.startAngle);
    if (delta <= span + DETAIL_EPS) {
      const t = delta / span;
      if (t > DETAIL_EPS && t < 1 - DETAIL_EPS) cuts.push(t);
    }
  }
  cuts.sort((a, b) => a - b);
  const out = [];
  for (let i = 1; i < cuts.length; i++) {
    const start = cuts[i - 1],
      end = cuts[i];
    if (end - start <= DETAIL_EPS) continue;
    const middle = angleAt((start + end) / 2);
    if (pointRadius([cx + radius * Math.cos(middle), cy + radius * Math.sin(middle)], R))
      out.push({ kind: 'arc', startAngle: angleAt(start), endAngle: angleAt(end), clockwise: curve.clockwise });
  }
  return out;
}
function clipDetailPolyline(curve, R) {
  const runs = [];
  let current = [];
  for (let i = 1; i < curve.points.length; i++) {
    const pieces = clipDetailLine({ a: curve.points[i - 1], b: curve.points[i] }, R);
    for (const piece of pieces) {
      if (current.length && pointRadius(current.at(-1), R) && Math.hypot(current.at(-1)[0] - piece[0][0], current.at(-1)[1] - piece[0][1]) <= DETAIL_EPS)
        current.push(piece[1]);
      else {
        current = [piece[0], piece[1]];
        runs.push(current);
      }
    }
    if (!pieces.length) current = [];
  }
  return runs.filter((points) => points.length >= 2).map((points) => ({ kind: 'polyline', points }));
}
function clipDetailCurve(curve, R) {
  const parts =
    curve.kind === 'line'
      ? clipDetailLine(curve, R).map(([a, b]) => ({ kind: 'line', a, b }))
      : curve.kind === 'circle'
        ? clipDetailCircle(curve, R).map((part) => ({ ...part, center: curve.center, radius: curve.radius }))
        : curve.kind === 'arc'
          ? clipDetailArc(curve, R).map((part) => ({ ...part, center: curve.center, radius: curve.radius }))
          : curve.kind === 'polyline'
            ? clipDetailPolyline(curve, R).map((part) => ({
                ...part,
                maxDeviation: curve.maxDeviation,
                proof: curve.proof,
              }))
            : null;
  if (parts) return parts;
  if (curve.kind === 'ellipse') {
    if (Math.hypot(...curve.center) + Math.max(...curve.radii) <= R + DETAIL_EPS) return [{ ...curve }];
  } else if (curve.kind === 'bezier') {
    // A positive rational Bézier curve stays inside the convex hull of its
    // poles. A disk is convex, so poles inside the cutout prove the whole span
    // is inside. Unsupported cut spans fail visibly instead of being guessed.
    if (curve.poles.every((p) => pointRadius(p, R))) return [{ ...curve }];
  }
  detailText('Der Detailausschnitt schneidet eine nicht unterstützte Kurvenart. Unterstützt sind Gerade, Kreis, Kreisbogen, Linienzug sowie vollständig innenliegende Ellipsen und Béziers.');
}
export function validateCadDrawingCutout(value) {
  record(value, ['sourceViewId', 'center', 'radius']);
  return {
    sourceViewId: id(value.sourceViewId),
    center: point(value.center),
    radius: number(value.radius, 0, 1e6),
  };
}
export function cadDrawingDetailProjection(projection, cutout) {
  if (!projection || projection.kind !== 'cad-drawing-projection' || !Array.isArray(projection.curves))
    detailText('Detailquelle hat keine gültige Projektion.');
  const value = validateCadDrawingCutout(cutout);
  if (value.radius <= DETAIL_EPS) detailText('Der Detailausschnitt benötigt einen Radius größer als 0.');
  const center = value.center,
    R = value.radius,
    curves = [];
  for (const source of projection.curves) {
    const local =
      source.kind === 'line'
        ? { ...source, a: localPoint(source.a, center), b: localPoint(source.b, center) }
        : ['circle', 'arc', 'ellipse'].includes(source.kind)
          ? { ...source, center: localPoint(source.center, center) }
          : source.kind === 'bezier'
            ? { ...source, poles: source.poles.map((p) => localPoint(p, center)) }
            : { ...source, points: source.points.map((p) => localPoint(p, center)) };
    for (const part of clipDetailCurve(local, R)) {
      const geometry = { ...part };
      delete geometry.id;
      delete geometry.hidden;
      delete geometry.sourceReferences;
      const clipped = {
        ...geometry,
        hidden: source.hidden,
        id: 'd' + cadGeometryDigest(JSON.stringify([source.id, geometry])).slice(0, 24),
      };
      if (source.sourceReferences) clipped.sourceReferences = structuredClone(source.sourceReferences);
      curves.push(clipped);
    }
  }
  if (!curves.length) detailText('Der Detailausschnitt enthält keine darstellbaren Kurven.');
  const ids = new Set();
  for (const curve of curves) {
    let suffix = 0;
    const base = curve.id;
    while (ids.has(curve.id)) curve.id = base + '-' + ++suffix;
    ids.add(curve.id);
  }
  return {
    kind: 'cad-drawing-projection',
    view: projection.view,
    frame: [...projection.frame],
    curves,
    bounds: { min: [-R, -R], max: [R, R] },
    sourceSignatures: structuredClone(projection.sourceSignatures),
    ...(projection.explosion ? { explosion: structuredClone(projection.explosion) } : {}),
    tolerance: projection.tolerance,
    approximation: 'detail-clip',
  };
}
// First cutout for a new detail: the view centre when it hits visible curves,
// otherwise the nearest curve feature (preferring whole circles such as holes)
// so parts without an edge in the middle still get a valid detail.
export function cadDrawingDefaultDetailCutout(projection, sourceViewId) {
  const { min, max } = projection.bounds,
    middle = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2],
    radius = Math.min(max[0] - min[0], max[1] - min[1]) / 3;
  if (!(radius > 1e-6)) detailText('Die Quellansicht ist zu klein für einen Detailausschnitt.');
  const candidates = [{ point: middle, rank: 0 }];
  for (const curve of projection.curves ?? []) {
    if (curve.hidden) continue;
    if (curve.kind === 'circle' || curve.kind === 'arc') {
      if (curve.radius <= radius) candidates.push({ point: curve.center, rank: 1 });
      const angle = curve.kind === 'arc' ? curve.startAngle : 0;
      candidates.push({
        point: [curve.center[0] + curve.radius * Math.cos(angle), curve.center[1] + curve.radius * Math.sin(angle)],
        rank: 2,
      });
    } else if (curve.kind === 'line')
      candidates.push({ point: [(curve.a[0] + curve.b[0]) / 2, (curve.a[1] + curve.b[1]) / 2], rank: 2 });
    else if (curve.kind === 'polyline' && curve.points?.length) candidates.push({ point: curve.points[0], rank: 2 });
    else if (curve.kind === 'ellipse') candidates.push({ point: curve.center, rank: 2 });
    else if (curve.kind === 'bezier' && curve.poles?.length) candidates.push({ point: curve.poles[0], rank: 2 });
  }
  const distance = (p) => Math.hypot(p[0] - middle[0], p[1] - middle[1]);
  candidates.sort((a, b) => a.rank - b.rank || distance(a.point) - distance(b.point));
  let lastError;
  for (const { point } of candidates.slice(0, 64)) {
    const cutout = { sourceViewId, center: [point[0], point[1]], radius };
    try {
      if (cadDrawingDetailProjection(projection, cutout).curves.some((curve) => !curve.hidden)) return cutout;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  detailText('Der Detailausschnitt enthält keine darstellbaren Kurven.');
}
export function addCadDrawingDetailView(
  sheet,
  sourceViewId,
  cutout,
  { id: viewId = cadDrawingId('view'), scale = 2, position = [100, 100] } = {},
) {
  const out = validateCadDrawingSheet(sheet),
    parent = out.views.find((view) => view.id === sourceViewId);
  if (!parent) detailText('Die Detailquelle fehlt.');
  if (parent.kind === 'detail') detailText('Ein Detail einer Detailansicht wird nicht unterstützt.');
  if (!parent.projection) detailText('Die Detailquelle benötigt eine berechnete Projektion.');
  if (out.views.some((view) => view.id === viewId)) detailText('Doppelte Ansichtskennung.');
  const value = validateCadDrawingCutout({ ...cutout, sourceViewId });
  out.views.push({
    id: viewId,
    kind: 'detail',
    sourceIds: [...parent.sourceIds],
    position: [...position],
    scale,
    cutout: value,
    projection: cadDrawingDetailProjection(parent.projection, value),
  });
  return validateCadDrawingSheet(out);
}
export function cadDrawingViewScale(view, sheet) {
  return view?.scale ?? sheet?.scale ?? 1;
}

function curve(value) {
  const common = ['id', 'kind', 'hidden', 'sourceReferences'],
    fields = {
      line: ['a', 'b'],
      circle: ['center', 'radius'],
      arc: ['center', 'radius', 'startAngle', 'endAngle', 'clockwise'],
      ellipse: ['center', 'radii', 'xAxis', 'yAxis', 'startAngle', 'endAngle', 'clockwise', 'closed'],
      bezier: ['poles', 'weights'],
      polyline: ['points', 'maxDeviation', 'proof'],
    };
  if (!value || !Object.hasOwn(fields, value.kind)) fail('Unbekannte Projektionskurve.');
  record(value, [...common, ...fields[value.kind]]);
  const out = {
    id: id(value.id),
    kind: value.kind,
    hidden: value.hidden === undefined ? false : boolean(value.hidden),
  };
  if (value.sourceReferences !== undefined) out.sourceReferences = sourceReferences(value.sourceReferences);
  if (value.kind === 'line') {
    out.a = point(value.a);
    out.b = point(value.b);
    if (Math.hypot(...out.a.map((v, k) => v - out.b[k])) < 1e-12) fail('Leere Projektionslinie.');
  }
  if (['circle', 'arc', 'ellipse'].includes(value.kind)) out.center = point(value.center);
  if (['circle', 'arc'].includes(value.kind)) out.radius = number(value.radius, 1e-12, 1e6);
  if (['arc', 'ellipse'].includes(value.kind)) {
    out.startAngle = number(value.startAngle, -1e6, 1e6);
    out.endAngle = number(value.endAngle, -1e6, 1e6);
    out.clockwise = boolean(value.clockwise);
  }
  if (value.kind === 'ellipse') {
    if (!Array.isArray(value.radii) || value.radii.length !== 2) fail('Ellipsenradien fehlen.');
    out.radii = value.radii.map((v) => number(v, 1e-12, 1e6));
    out.xAxis = point(value.xAxis);
    out.yAxis = point(value.yAxis);
    out.closed = boolean(value.closed);
    if (
      Math.abs(Math.hypot(...out.xAxis) - 1) > 1e-7 ||
      Math.abs(Math.hypot(...out.yAxis) - 1) > 1e-7 ||
      Math.abs(out.xAxis[0] * out.yAxis[0] + out.xAxis[1] * out.yAxis[1]) > 1e-7
    )
      fail('Ellipsenachsen müssen orthonormal sein.');
  }
  if (value.kind === 'bezier') {
    out.poles = list(value.poles, 26, 'Bézierpole').map(point);
    if (out.poles.length < 2) fail('Bézierkurve benötigt mindestens zwei Pole.');
    out.weights = list(value.weights, 26, 'Béziergewichte').map((v) => number(v, 1e-14, 1e14));
    if (out.weights.length !== out.poles.length) fail('Béziergewichte passen nicht zu den Polen.');
  }
  if (value.kind === 'polyline') {
    out.points = list(value.points, CAD_DRAWING_LIMITS.points, 'Kurvenpunkte').map(point);
    if (out.points.length < 2) fail('Linienzug benötigt zwei Punkte.');
    out.maxDeviation = number(value.maxDeviation, 0, 0.1);
    out.proof = enumeration(value.proof, ['positive-rational-bezier-control-hull']);
  }
  return out;
}

export function cadDrawingExplosion(value, sourceIds, { capture = false } = {}) {
  const explosion = validateExplosion(value ?? null);
  if (!explosion?.distance) fail('Eine gespeicherte Explosionsdarstellung mit Abstand wird benötigt.');
  const ids = new Set(sourceIds),
    parts = explosion.parts.filter((part) => ids.has(part.id));
  if (!parts.length) fail('Für die gewählten Quellen sind keine Explosionsrichtungen gespeichert.');
  if (!capture && parts.length !== explosion.parts.length)
    fail('Explosionsrichtungen gehören zu einer fremden Ansichtsquelle.');
  return { ...explosion, parts };
}

export function cadDrawingProjectionOptions(view) {
  return {
    ids: view.sourceIds,
    view: view.kind,
    ...(view.kind === 'section' ? { section: view.section } : {}),
    ...(view.kind === 'exploded' ? { explosion: view.explosion } : {}),
  };
}

export function validateCadDrawingProjection(value) {
  record(value, [
    'kind',
    'view',
    'frame',
    'curves',
    'bounds',
    'sourceSignatures',
    'explosion',
    'tolerance',
    'approximation',
  ]);
  if (value.kind !== 'cad-drawing-projection') fail('Native Zeichnungsprojektion erforderlich.');
  const out = { kind: value.kind, view: enumeration(value.view, projectionViews) };
  if (!Array.isArray(value.frame) || value.frame.length !== 16) fail('Projektionsbezug fehlt.');
  out.frame = value.frame.map((v) => number(v));
  out.curves = list(value.curves, CAD_DRAWING_LIMITS.curves, 'Projektionskurven').map(curve);
  unique(
    out.curves.map((c) => c.id),
    'Kurvenkennungen',
  );
  let points = 0;
  for (const c of out.curves) points += c.points?.length ?? c.poles?.length ?? 2;
  if (points > CAD_DRAWING_LIMITS.points) fail('Gesamte Projektionspunktgrenze überschritten.');
  record(value.bounds, ['min', 'max']);
  out.bounds = { min: point(value.bounds.min), max: point(value.bounds.max) };
  if (out.bounds.max.some((v, k) => v < out.bounds.min[k])) fail('Ungültige Projektionsgrenzen.');
  out.sourceSignatures = signatures(value.sourceSignatures);
  if (value.view === 'exploded')
    out.explosion = cadDrawingExplosion(
      value.explosion,
      out.sourceSignatures.map((source) => source.id),
    );
  else if (value.explosion !== undefined) fail('Explosionsdaten nur für Explosionsansichten.');
  if (
    out.curves.some((curve) =>
      curve.sourceReferences?.some(
        (reference) => !out.sourceSignatures.some((source) => source.id === reference.source.rootId),
      ),
    )
  )
    fail('Kantenbezug gehört zu einer fremden Projektionsquelle.');
  out.tolerance = number(value.tolerance, 1e-7, 0.1);
  out.approximation = text(value.approximation, 200);
  return out;
}

export function validateCadDrawingSheet(value) {
  record(value, ['id', 'name', 'paper', 'orientation', 'scale', 'titleBlock', 'views', 'annotations', 'partsList']);
  const out = {
    id: id(value.id),
    name: text(value.name),
    paper: enumeration(value.paper, ['A4', 'A3']),
    orientation: enumeration(value.orientation, ['portrait', 'landscape']),
    scale: number(value.scale, 0.001, 1000),
  };
  record(value.titleBlock, ['title', 'number', 'revision', 'author', 'date']);
  out.titleBlock = {};
  for (const key of ['title', 'number', 'revision', 'author', 'date'])
    out.titleBlock[key] = text(value.titleBlock[key] ?? '', key === 'title' ? 500 : 200);
  out.views = list(value.views, CAD_DRAWING_LIMITS.views, 'Ansichten').map((v) => {
    record(v, ['id', 'kind', 'sourceIds', 'position', 'scale', 'section', 'cutout', 'explosion', 'assemblyViewId', 'projection']);
    const view = {
      id: id(v.id),
      kind: enumeration(v.kind, [...projectionViews, 'detail']),
      sourceIds: list(v.sourceIds, 128, 'Ansichtsquellen').map(id),
      position: point(v.position),
    };
    if (!view.sourceIds.length) fail('Ansicht benötigt mindestens ein CAD-Teil.');
    unique(view.sourceIds, 'Ansichtsquellen');
    if (v.scale !== undefined) view.scale = number(v.scale, 0.001, 1000);
    if (v.kind === 'detail') {
      view.cutout = validateCadDrawingCutout(v.cutout);
      if (view.cutout.sourceViewId === view.id) fail('Ein Detail benötigt eine andere Quellansicht.');
      if (view.scale === undefined) fail('Detailansichten benötigen einen eigenen Maßstab.');
    } else if (v.cutout !== undefined) fail('Ausschnittdaten nur für Detailansichten.');
    if (v.kind === 'section') {
      record(v.section, ['axis', 'offset']);
      view.section = {
        axis: enumeration(v.section.axis, [0, 1, 2]),
        offset: number(v.section.offset, -100000, 100000),
      };
    } else if (v.section !== undefined) fail('Schnittdaten nur für Schnittansichten.');
    if (v.kind === 'exploded') {
      view.explosion = cadDrawingExplosion(v.explosion, view.sourceIds);
      if (v.assemblyViewId !== undefined) {
        view.assemblyViewId = id(v.assemblyViewId);
        if (view.assemblyViewId === view.id) fail('Eine Explosionsansicht benötigt eine andere Montageansicht.');
      }
    } else if (v.explosion !== undefined || v.assemblyViewId !== undefined)
      fail('Explosionsdaten nur für Explosionsansichten.');
    if (v.projection !== undefined) {
      view.projection = validateCadDrawingProjection(v.projection);
      if (view.kind !== 'detail' && view.projection.view !== view.kind)
        fail('Projektion gehört zu einer anderen Ansichtsart.');
    }
    return view;
  });
  unique(
    out.views.map((v) => v.id),
    'Ansichtskennungen',
  );
  const viewById = new Map(out.views.map((view) => [view.id, view]));
  for (const view of out.views)
    if (view.kind === 'detail' && view.projection) {
      const parent = viewById.get(view.cutout.sourceViewId);
      if (parent && parent.kind === 'detail') fail('Ein Detail einer Detailansicht wird nicht unterstützt.');
      if (parent && view.projection.view !== parent.kind)
        fail('Projektion gehört zu einer anderen Ansichtsart.');
    }
  out.annotations = list(value.annotations, CAD_DRAWING_LIMITS.annotations, 'Beschriftungen').map((a) => {
    if (a?.kind === 'label') {
      record(a, ['id', 'kind', 'text', 'position']);
      return { id: id(a.id), kind: a.kind, text: text(a.text, 1000), position: point(a.position) };
    }
    if (a?.kind === 'balloon') {
      record(a, ['id', 'kind', 'viewId', 'curveId', 'instanceId', 'sourceReferences', 'position']);
      const references = sourceReferences(a.sourceReferences),
        instanceId = id(a.instanceId);
      if (balloonInstanceId(references) !== instanceId)
        fail('Ein Positionsballon benötigt einen eindeutigen Bezug zu seiner Platzierung.');
      return {
        id: id(a.id),
        kind: a.kind,
        viewId: id(a.viewId),
        curveId: id(a.curveId),
        instanceId,
        sourceReferences: references,
        position: point(a.position),
      };
    }
    record(a, [
      'id',
      'kind',
      'viewId',
      'curveIds',
      'position',
      'sourceSignatures',
      'curveReferences',
      'unresolved',
      'axis',
      'anchors',
      'overhangMm',
      'extensionStart',
      'extensionEnd',
      'tolerance',
    ]);
    const item = {
      id: id(a.id),
      kind: enumeration(a.kind, ['length', 'angle', 'radius', 'diameter', 'distance', 'centermark', 'centerline']),
      viewId: id(a.viewId),
      curveIds: list(a.curveIds, 2, 'Maßbezüge').map(id),
      position: point(a.position),
    };
    if (a.sourceSignatures !== undefined) item.sourceSignatures = signatures(a.sourceSignatures);
    if (a.unresolved !== undefined) item.unresolved = boolean(a.unresolved);
    if (a.overhangMm !== undefined) item.overhangMm = number(a.overhangMm, 0, 500);
    if (a.extensionStart !== undefined) item.extensionStart = number(a.extensionStart, 0, 500);
    if (a.extensionEnd !== undefined) item.extensionEnd = number(a.extensionEnd, 0, 500);
    if (a.tolerance !== undefined) {
      if (!['length', 'diameter', 'radius', 'distance'].includes(item.kind))
        fail('Toleranzen sind nur für Längen-, Durchmesser-, Radius- und Abstandsmaße zulässig.');
      record(a.tolerance, ['upper', 'lower', 'mode']);
      if (!Number.isFinite(a.tolerance.upper) || !Number.isFinite(a.tolerance.lower))
        fail('Toleranzgrenzen müssen endliche Zahlen sein.');
      const upper = number(a.tolerance.upper, -1e6, 1e6);
      const lower = number(a.tolerance.lower, -1e6, 1e6);
      if (lower > upper) fail('Untere Toleranzgrenze darf nicht größer als die obere sein.');
      const mode = a.tolerance.mode !== undefined ? enumeration(a.tolerance.mode, ['deviation', 'limits']) : 'deviation';
      item.tolerance = { upper, lower, mode };
    }
    if (a.curveReferences !== undefined)
      item.curveReferences = list(a.curveReferences, 2, 'Stabile Maßbezüge').map((reference) => {
        record(reference, ['sourceReferences']);
        return { sourceReferences: sourceReferences(reference.sourceReferences) };
      });
    if (item.kind === 'distance') {
      item.axis = enumeration(a.axis, ['x', 'y']);
      item.anchors = list(a.anchors, 2, 'Maßpunkte').map((anchor) => {
        record(anchor, ['curveIndex', 'point']);
        return {
          curveIndex: enumeration(anchor.curveIndex, [0, 1]),
          point: enumeration(anchor.point, CAD_DRAWING_POINT_ROLES),
        };
      });
      if (
        item.anchors.length !== 2 ||
        item.anchors.some((anchor) => anchor.curveIndex >= item.curveIds.length) ||
        item.curveIds.some((_, index) => !item.anchors.some((anchor) => anchor.curveIndex === index))
      )
        fail('Maßpunkte passen nicht zu den gewählten Kanten.');
    } else if (a.axis !== undefined || a.anchors !== undefined) fail('Maßpunkte nur für Abstandsmaße.');
    if (item.curveReferences && item.curveReferences.length !== item.curveIds.length)
      fail('Stabile Maßbezüge passen nicht zu den gewählten Kanten.');
    if (item.kind === 'distance' ? !item.curveIds.length : item.curveIds.length !== (['angle', 'centerline'].includes(item.kind) ? 2 : 1))
      fail('Unpassende Anzahl der Maßbezüge.');
    unique(item.curveIds, 'Maßbezüge');
    return item;
  });
  unique(
    out.annotations.map((a) => a.id),
    'Beschriftungskennungen',
  );
  if (value.partsList !== undefined) out.partsList = validateCadDrawingPartsList(value.partsList);
  return out;
}

export function validateCadDrawings(value) {
  record(value, ['version', 'sheets']);
  if (value.version !== 1) fail('Nur Zeichnungsversion 1 wird unterstützt.');
  const out = {
      version: 1,
      sheets: list(value.sheets, CAD_DRAWING_LIMITS.sheets, 'Zeichnungsblätter').map(validateCadDrawingSheet),
    },
    identities = out.sheets.flatMap((s) => [
      s.id,
      ...(s.partsList ? [s.partsList.id] : []),
      ...s.views.map((v) => v.id),
      ...s.annotations.map((a) => a.id),
    ]),
    sources = new Set(out.sheets.flatMap((s) => s.views.flatMap((v) => v.sourceIds)));
  unique(identities, 'Zeichnungskennungen');
  if (identities.some((id) => sources.has(id)))
    fail('Zeichnungskennungen dürfen keine Quellenkennungen überschreiben.');
  return out;
}
export function cadDrawingPaperSize(sheet) {
  const size = sheet.paper === 'A3' ? [297, 420] : [210, 297];
  return sheet.orientation === 'landscape' ? [size[1], size[0]] : size;
}
export function cadDrawingViewFrame(kind, section, explosion) {
  if (kind === 'exploded') {
    // Prefer the isometric direction that preserves the most exploded travel
    // on paper. The tie order keeps principal-axis explosions predictable.
    const a = 1 / Math.sqrt(2), b = 1 / Math.sqrt(6), c = 1 / Math.sqrt(3);
    let right = 1, front = 1, leastHidden = Infinity;
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const hidden = (explosion?.parts ?? []).reduce((sum, part) => {
        const [x, y, z] = part.direction;
        return sum + (sx * x - sy * y + z) ** 2;
      }, 0);
      if (hidden < leastHidden - 1e-12) {
        leastHidden = hidden;
        right = sx;
        front = sy;
      }
    }
    return [front * a, right * a, 0, 0, -right * b, front * b, 2 * b, 0, right * c, -front * c, c, 0, 0, 0, 0, 1];
  }
  const axis = kind === 'section' ? section.axis : kind === 'side' ? 0 : kind === 'front' ? 1 : 2,
    frame =
      axis === 0
        ? [0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1]
        : axis === 1
          ? [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1]
          : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  if (kind === 'section') frame[12 + axis] = section.offset;
  return frame;
}
export function createCadDrawingSheet({
  id: sheetId = cadDrawingId('sheet'),
  name = 'Zeichnungsblatt',
  sourceIds = [],
  paper = 'A4',
  orientation = 'landscape',
  scale = 1,
  titleBlock = {},
} = {}) {
  const sheet = {
    id: sheetId,
    name,
    paper,
    orientation,
    scale,
    titleBlock: { title: '', number: '', revision: '', author: '', date: '', ...titleBlock },
    views: [],
    annotations: [],
  };
  if (sourceIds.length)
    for (const [kind, position] of [
      ['front', [65, 100]],
      ['top', [65, 165]],
      ['side', [165, 100]],
    ])
      sheet.views.push({ id: cadDrawingId('view'), kind, sourceIds: [...sourceIds], position });
  return validateCadDrawingSheet(sheet);
}
export function cadDrawingSourceSignatures(project, ids) {
  const wanted = ids ? new Set(ids) : null,
    result = new Map();
  for (const root of project.nodes ?? [])
    if (root.kind === 'cad' && (!wanted || wanted.has(root.id))) result.set(root.id, cadSourceGeometryDigest(root));
  return result;
}
const signatureAt = (sourceSignatures, id) =>
  sourceSignatures instanceof Map ? sourceSignatures.get(id) : sourceSignatures?.[id];
function balloonInstanceId(references) {
  const rootId = references?.[0]?.source?.rootId;
  return rootId && references.every(({ source }) => source?.rootId === rootId && source.path?.length === 0)
    ? rootId
    : null;
}

const balloonLost = () =>
  fail('Positionsballon: Bezug verloren. Platzierung, Ansicht und Stückliste prüfen oder den Ballon entfernen.');

export function cadDrawingBalloon(sheet, annotation, { sourceSignatures } = {}) {
  const { viewId, instanceId, curveId, sourceReferences: references } = annotation,
    view = sheet.views.find((candidate) => candidate.id === viewId);
  if (
    !view?.projection ||
    !view.sourceIds.includes(instanceId) ||
    (sourceSignatures !== undefined && typeof signatureAt(sourceSignatures, instanceId) !== 'string')
  )
    balloonLost();

  const rows = sheet.partsList?.rows.filter((row) => row.instanceIds.includes(instanceId));
  if (rows?.length !== 1) balloonLost();

  const key = referenceKey(references),
    matchesReference = (curve) =>
      balloonInstanceId(curve?.sourceReferences) === instanceId && referenceKey(curve.sourceReferences) === key;
  let curve = view.projection.curves.find((candidate) => candidate.id === curveId);
  if (!matchesReference(curve)) {
    const matches = view.projection.curves.filter(matchesReference);
    if (matches.length !== 1) balloonLost();
    curve = matches[0];
  }

  // Choose a witness on the projected curve, including fitted and imported edge types.
  const target =
    curve.kind === 'line'
      ? curve.a.map((value, index) => (value + curve.b[index]) / 2)
      : curve.kind === 'polyline'
        ? curve.points[Math.floor(curve.points.length / 2)]
        : curve.kind === 'bezier'
          ? curve.poles[0]
          : cadDrawingCurvePoint(curve, 'maxX');
  return { row: rows[0], curveId: curve.id, target: cadDrawingPaperPoint(view, cadDrawingViewScale(view, sheet), target) };
}

export function createCadDrawingBalloon(sheet, { id: annotationId, viewId, curveId, position }, options) {
  if (!sheet.partsList) fail('Zuerst eine Stückliste auf das Blatt setzen.');
  const view = sheet.views.find((candidate) => candidate.id === viewId),
    curve = view?.projection?.curves.find((candidate) => candidate.id === curveId),
    instanceId = balloonInstanceId(curve?.sourceReferences);
  if (!instanceId) fail('Eine projizierte Kante mit eindeutigem Platzierungsbezug wählen.');
  const annotation = {
    id: id(annotationId),
    kind: 'balloon',
    viewId,
    curveId,
    instanceId,
    sourceReferences: structuredClone(curve.sourceReferences),
    position: point(position),
  };
  cadDrawingBalloon(sheet, annotation, options);
  return annotation;
}

export function cadDrawingProblems(sheet, { sourceSignatures } = {}) {
  const problems = [];
  for (const v of sheet.views) {
    if (!v.projection) {
      problems.push({
        code: 'UPDATE_REQUIRED',
        viewId: v.id,
        message: 'Ansicht muss über „Blatt aktualisieren“ berechnet werden.',
      });
      continue;
    }
    const signs = v.projection.sourceSignatures;
    if (v.kind === 'detail') {
      const parent = sheet.views.find((view) => view.id === v.cutout.sourceViewId);
      if (!parent) {
        problems.push({
          code: 'DETAIL_SOURCE_MISSING',
          viewId: v.id,
          message: 'Detailquelle fehlt. Quellansicht erneut wählen oder Detail entfernen.',
        });
        continue;
      }
      if (!(v.cutout.radius > 1e-9)) {
        problems.push({
          code: 'INVALID_DETAIL_CUTOUT',
          viewId: v.id,
          message: 'Der Detailausschnitt benötigt einen Radius größer als 0.',
        });
        continue;
      }
      if (!parent.projection) {
        problems.push({
          code: 'DETAIL_SOURCE_MISSING',
          viewId: v.id,
          message: 'Die Detailquelle hat keine berechnete Projektion. Blatt aktualisieren.',
        });
        continue;
      }
      if (v.projection.frame.some((n, i) => n !== parent.projection.frame[i]))
        problems.push({
          code: 'STALE_VIEW',
          viewId: v.id,
          message: 'Detailquelle hat eine andere Ansichtsrichtung. Blatt aktualisieren.',
        });
      if (
        signs.length !== v.sourceIds.length ||
        v.sourceIds.some((id) => !signs.some((s) => s.id === id)) ||
        (sourceSignatures !== undefined && signs.some((s) => signatureAt(sourceSignatures, s.id) !== s.signature))
      )
        problems.push({
          code: 'STALE_SOURCE',
          viewId: v.id,
          message: 'Ausgangsteil geändert oder verloren. Blatt aktualisieren.',
        });
      else
        try {
          if (!sameDrawingValue(cadDrawingDetailProjection(parent.projection, v.cutout), v.projection))
            problems.push({
              code: 'STALE_DETAIL_VIEW',
              viewId: v.id,
              message: 'Detailausschnitt oder Detailquelle geändert. Blatt aktualisieren.',
            });
        } catch (error) {
          problems.push({ code: 'INVALID_DETAIL_CUTOUT', viewId: v.id, message: error.message });
        }
      continue;
    }
    if (v.assemblyViewId) {
      const assembly = sheet.views.find((view) => view.id === v.assemblyViewId);
      if (!assembly || !['front', 'side', 'top'].includes(assembly.kind) ||
          assembly.sourceIds.length !== v.sourceIds.length || v.sourceIds.some((id) => !assembly.sourceIds.includes(id)))
        problems.push({
          code: 'STALE_SOURCE',
          viewId: v.id,
          message: 'Montagequellen geändert. Explosionsansicht aus der gewünschten Montageansicht neu erstellen.',
        });
    }
    const frame = cadDrawingViewFrame(v.kind, v.section, v.explosion);
    if (v.projection.frame.some((n, i) => n !== frame[i]))
      problems.push({
        code: 'STALE_VIEW',
        viewId: v.id,
        message: 'Ansichtsrichtung oder Schnittlage geändert. Blatt aktualisieren.',
      });
    if (v.kind === 'exploded' && !sameDrawingValue(v.explosion, v.projection.explosion))
      problems.push({
        code: 'STALE_VIEW',
        viewId: v.id,
        message: 'Explosionsdarstellung geändert. Blatt aktualisieren.',
      });
    if (
      signs.length !== v.sourceIds.length ||
      v.sourceIds.some((id) => !signs.some((s) => s.id === id)) ||
      (sourceSignatures !== undefined && signs.some((s) => signatureAt(sourceSignatures, s.id) !== s.signature))
    )
      problems.push({
        code: 'STALE_SOURCE',
        viewId: v.id,
        message: 'Ausgangsteil geändert oder verloren. Blatt aktualisieren.',
      });
  }
  for (const a of sheet.annotations)
    if (a.kind !== 'label')
      try {
        if (a.kind === 'balloon') cadDrawingBalloon(sheet, a, { sourceSignatures });
        else cadDrawingDimension(sheet, a);
      } catch (error) {
        problems.push({
          code: a.kind === 'balloon' ? 'LOST_BALLOON_REFERENCE' : 'LOST_DIMENSION_REFERENCE',
          annotationId: a.id,
          viewId: a.viewId,
          message: error.message,
        });
      }
  return problems;
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const fmt = (value) => String(Number(value.toFixed(2)));
export function cadDrawingDimension(sheet, annotation) {
  const a = annotation,
    view = sheet.views.find((v) => v.id === a.viewId);
  if (a.unresolved) fail('Stabiler Maßbezug ist verloren oder mehrdeutig. Bezug erneut auswählen oder Maß entfernen.');
  if (!view?.projection) fail('Maßansicht fehlt.');
  const curves = a.curveIds.map((id) => view.projection.curves.find((c) => c.id === id));
  if (curves.some((c) => !c)) fail('Maßbezug verloren. Bezug erneut auswählen oder Maß entfernen.');
  if (
    a.curveReferences &&
    a.curveReferences.some(
      (reference, index) =>
        !curves[index].sourceReferences ||
        referenceKey(reference.sourceReferences) !== referenceKey(curves[index].sourceReferences),
    )
  )
    fail('Die gespeicherte Kantenrolle passt nicht mehr zum gewählten Maß. Bezug erneut auswählen.');
  if (
    a.sourceSignatures &&
    (a.sourceSignatures.length !== view.projection.sourceSignatures.length ||
      a.sourceSignatures.some(
        (s) => !view.projection.sourceSignatures.some((p) => p.id === s.id && p.signature === s.signature),
      ))
  )
    fail('Maßquelle geändert. Bezug erneut auswählen oder Maß entfernen.');
  let value, points;
  if (a.kind === 'distance') {
    if (!['x', 'y'].includes(a.axis) || a.anchors?.length !== 2)
      fail('Abstandsmaß benötigt Achse und zwei geometrische Maßpunkte.');
    points = a.anchors.map((anchor) => cadDrawingCurvePoint(curves[anchor.curveIndex], anchor.point));
    value = Math.abs(points[1][a.axis === 'x' ? 0 : 1] - points[0][a.axis === 'x' ? 0 : 1]);
    if (value < 1e-10) fail('Abstandsmaß hat keinen messbaren Abstand.');
  } else if (a.kind === 'length') {
    const c = curves[0];
    if (c.kind !== 'line') fail('Längenmaß benötigt eine Gerade.');
    value = dist(c.a, c.b);
    points = [c.a, c.b];
  } else if (a.kind === 'angle') {
    if (curves.some((c) => c.kind !== 'line')) fail('Winkelmaß benötigt zwei Geraden.');
    const u = curves[0].b.map((x, k) => x - curves[0].a[k]),
      v = curves[1].b.map((x, k) => x - curves[1].a[k]);
    value = (Math.atan2(Math.abs(u[0] * v[1] - u[1] * v[0]), u[0] * v[0] + u[1] * v[1]) * 180) / Math.PI;
    points = curves.flatMap((c) => [c.a, c.b]);
  } else if (['radius', 'diameter'].includes(a.kind)) {
    const c = curves[0];
    if (!['circle', 'arc'].includes(c.kind)) fail('Radius- und Durchmessermaße benötigen einen Kreis oder Kreisbogen.');
    value = c.radius * (a.kind === 'diameter' ? 2 : 1);
    points = [c.center, [c.center[0] + c.radius, c.center[1]]];
  } else if (a.kind === 'centermark') {
    const c = curves[0];
    if (!['circle', 'arc'].includes(c.kind)) fail('Mittelpunktmarken benötigen einen Kreis oder Kreisbogen.');
    value = c.radius;
    points = [c.center];
  } else if (a.kind === 'centerline') {
    if (curves.length !== 2) fail('Mittellinien benötigen zwei Kurven.');
    if (!['circle', 'arc'].includes(curves[0].kind) || !['circle', 'arc'].includes(curves[1].kind))
      fail('Mittellinien benötigen zwei Kreise oder Kreisbögen.');
    if (curves[0].id === curves[1].id) fail('Mittellinien benötigen zwei unterschiedliche Kreise oder Kreisbögen.');
    value = dist(curves[0].center, curves[1].center);
    if (value < 1e-10) fail('Mittellinie hat keinen messbaren Abstand.');
    points = [curves[0].center, curves[1].center];
  } else fail('Unbekannte Maßart.');
  let text = '';
  if (!['centermark', 'centerline'].includes(a.kind)) {
    const prefix = a.kind === 'radius' ? 'R ' : a.kind === 'diameter' ? 'Ø ' : '';
    const unit = a.kind === 'angle' ? '°' : ' mm';
    if (a.tolerance) {
      if (a.tolerance.lower > a.tolerance.upper) fail('Untere Toleranzgrenze darf nicht größer als die obere sein.');
      const upperLimit = value + a.tolerance.upper;
      const lowerLimit = value + a.tolerance.lower;
      if (['radius', 'diameter', 'length', 'distance'].includes(a.kind) && (lowerLimit < 0 || upperLimit < 0))
        fail('Grenzmaße dürfen nicht negativ sein.');
      const mode = a.tolerance.mode ?? 'deviation';
      if (mode === 'limits') {
        text = `${prefix}${upperLimit.toFixed(2)} / ${lowerLimit.toFixed(2)}${unit}`;
      } else {
        const fmtDev = (n) => (n > 0 ? '+' : '') + n.toFixed(2);
        text = `${prefix}${fmt(value)} ${fmtDev(a.tolerance.upper)} / ${fmtDev(a.tolerance.lower)}${unit}`;
      }
    } else {
      text = prefix + fmt(value) + unit;
    }
  }
  return {
    value,
    text,
    points,
    view,
    curves,
  };
}

// Only an explicitly requested projection update may carry a dimension across
// a source change. Every exact semantic reference set must match one curve.
// Fragments and ambiguous coincident-role sets retain a visible lost reference.
export function updateCadDrawingProjection(sheet, viewId, projection) {
  const out = validateCadDrawingSheet(sheet),
    view = out.views.find((view) => view.id === viewId);
  if (!view) fail('Zeichnungsansicht fehlt.');
  const previous = view.projection,
    next = validateCadDrawingProjection(projection);
  if (view.kind === 'detail') {
    const parent = out.views.find((candidate) => candidate.id === view.cutout.sourceViewId);
    if (!parent) fail('Detailquelle fehlt. Quellansicht erneut wählen oder Detail entfernen.');
    if (next.view !== parent.kind) fail('Projektion gehört zu einer anderen Ansichtsart.');
  } else if (next.view !== view.kind) fail('Projektion gehört zu einer anderen Ansichtsart.');
  if (view.kind === 'exploded' && !sameDrawingValue(view.explosion, next.explosion))
    fail('Projektion gehört zu einer anderen Explosionsdarstellung.');
  view.projection = next;
  for (const balloon of out.annotations.filter((annotation) => annotation.kind === 'balloon' && annotation.viewId === viewId))
    try {
      balloon.curveId = cadDrawingBalloon(out, balloon).curveId;
    } catch {
      // Preserve the placement reference so the sheet continues to report the loss.
    }
  for (const annotation of out.annotations.filter(
    (annotation) => !['label', 'balloon'].includes(annotation.kind) && annotation.viewId === viewId,
  )) {
    if (annotation.unresolved) continue;
    let references = annotation.curveReferences;
    if (!references && previous) {
      const old = annotation.curveIds.map((id) => previous.curves.find((curve) => curve.id === id)),
        sameInputs =
          !annotation.sourceSignatures ||
          (annotation.sourceSignatures.length === previous.sourceSignatures.length &&
            annotation.sourceSignatures.every((source) =>
              previous.sourceSignatures.some((prior) => prior.id === source.id && prior.signature === source.signature),
            ));
      if (sameInputs && old.every((curve) => curve?.sourceReferences))
        references = old.map((curve) => ({ sourceReferences: curve.sourceReferences }));
    }
    if (!references) continue;
    annotation.curveReferences = structuredClone(references);
    const matches = references.map((reference) =>
      next.curves.filter(
        (curve) =>
          curve.sourceReferences && referenceKey(curve.sourceReferences) === referenceKey(reference.sourceReferences),
      ),
    );
    if (
      matches.some((curves) => curves.length !== 1) ||
      new Set(matches.map((curves) => curves[0].id)).size !== matches.length
    ) {
      annotation.unresolved = true;
      continue;
    }
    annotation.curveIds = matches.map((curves) => curves[0].id);
    annotation.sourceSignatures = structuredClone(next.sourceSignatures);
    try {
      const dim = cadDrawingDimension(out, annotation),
        paperScale = cadDrawingViewScale(view, out);
      if (annotation.kind === 'centermark') {
        annotation.position = cadDrawingPaperPoint(view, paperScale, dim.curves[0].center);
      } else if (annotation.kind === 'centerline') {
        const p1 = cadDrawingPaperPoint(view, paperScale, dim.curves[0].center);
        const p2 = cadDrawingPaperPoint(view, paperScale, dim.curves[1].center);
        annotation.position = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
      }
    } catch {
      annotation.unresolved = true;
    }
  }
  return validateCadDrawingSheet(out);
}

/** Rebuild every detail view from its current parent projection. Details are
 * derived views: they never schedule their own native projection, so moving or
 * rescaling paper cannot add a second scale factor. */
export function updateCadDrawingDetailViews(input) {
  let sheet = validateCadDrawingSheet(input),
    changed = false;
  for (const view of sheet.views.filter((candidate) => candidate.kind === 'detail')) {
    const parent = sheet.views.find((candidate) => candidate.id === view.cutout.sourceViewId);
    if (!parent?.projection || !(view.cutout.radius > 1e-9)) continue;
    let projection;
    try {
      projection = cadDrawingDetailProjection(parent.projection, view.cutout);
    } catch {
      continue;
    }
    if (sameDrawingValue(projection, view.projection)) continue;
    sheet = updateCadDrawingProjection(sheet, view.id, projection);
    changed = true;
  }
  return { sheet, changed };
}

/** Remap only explicit object identities; curve identities encode geometry and
 * survive duplicated source IDs. Missing selected sources keep a lost reference. */
export function remapCadDrawings(value, idMap, makeId = cadDrawingId) {
  const out = validateCadDrawings(value),
    get = (id) => (idMap instanceof Map ? (idMap.get(id) ?? id) : (idMap[id] ?? id));
  const identity = (prior, prefix) => {
    const mapped = get(prior);
    return mapped === prior ? makeId(prefix) : mapped;
  };
  const remap = (references) =>
    references.map((reference) => ({
      ...reference,
      source: { rootId: get(reference.source.rootId), path: reference.source.path.map(get) },
    }));
  for (const sheet of out.sheets) {
    sheet.id = identity(sheet.id, 'sheet');
    const views = new Map();
    for (const view of sheet.views) {
      const prior = view.id;
      view.id = identity(prior, 'view');
      views.set(prior, view.id);
    }
    for (const view of sheet.views) {
      view.sourceIds = view.sourceIds.map(get);
      for (const explosion of [view.explosion, view.projection?.explosion])
        if (explosion) for (const part of explosion.parts) part.id = get(part.id);
      if (view.assemblyViewId) view.assemblyViewId = views.get(view.assemblyViewId) ?? view.assemblyViewId;
      if (view.kind === 'detail')
        view.cutout.sourceViewId = views.get(view.cutout.sourceViewId) ?? view.cutout.sourceViewId;
      if (view.projection) {
        view.projection.sourceSignatures = view.projection.sourceSignatures.map((s) => ({ ...s, id: get(s.id) }));
        for (const curve of view.projection.curves)
          if (curve.sourceReferences) curve.sourceReferences = remap(curve.sourceReferences);
      }
    }
    if (sheet.partsList) {
      sheet.partsList.id = identity(sheet.partsList.id, 'parts');
      const remapRow = (row) => {
        row.instanceIds = row.instanceIds.map(get);
        let identityValue;
        try {
          identityValue = JSON.parse(row.identityKey);
        } catch {}
        if (Array.isArray(identityValue) && identityValue[0] === 'standalone')
          row.identityKey = JSON.stringify(['standalone', row.instanceIds[0]]);
      };
      for (const row of sheet.partsList.rows) remapRow(row);
      for (const row of sheet.partsList.retainedPositions ?? []) remapRow(row);
    }
    for (const a of sheet.annotations) {
      a.id = identity(a.id, 'annotation');
      if (a.kind !== 'label') a.viewId = views.get(a.viewId) ?? a.viewId;
      if (a.kind === 'balloon') {
        a.instanceId = get(a.instanceId);
        a.sourceReferences = remap(a.sourceReferences);
      }
      if (a.sourceSignatures) a.sourceSignatures = a.sourceSignatures.map((s) => ({ ...s, id: get(s.id) }));
      for (const reference of a.curveReferences ?? []) reference.sourceReferences = remap(reference.sourceReferences);
    }
  }
  return out;
}
export function selectCadDrawings(value, ids) {
  const wanted = new Set(ids),
    out = validateCadDrawings(value),
    selected = (refs) => !refs || refs.every((s) => wanted.has(s.id)),
    owned = (references) => !references || references.every((reference) => wanted.has(reference.source.rootId));
  out.sheets = out.sheets.filter(
    (sheet) =>
      sheet.views.length &&
      sheet.views.every(
        (view) =>
          view.sourceIds.every((id) => wanted.has(id)) &&
          selected(view.projection?.sourceSignatures) &&
          view.projection?.curves.every((curve) => owned(curve.sourceReferences)) !== false,
      ) &&
      sheet.annotations.every(
        (a) =>
          (a.kind !== 'balloon' || wanted.has(a.instanceId)) &&
          selected(a.sourceSignatures) &&
          (a.curveReferences ?? []).every((reference) => owned(reference.sourceReferences)),
      ),
  );
  out.sheets = out.sheets.map((sheet) => {
    if (!sheet.partsList) return sheet;
    const { partsList: current, ...rest } = sheet,
      { retainedPositions: reserved = [], ...partsList } = current;
    const rows = partsList.rows.flatMap((row) => {
      const instanceIds = row.instanceIds.filter((id) => wanted.has(id));
      if (!instanceIds.length) return [];
      if (instanceIds.length === row.instanceIds.length) return [row];
      return [{ ...row, instanceIds, quantity: instanceIds.length }];
    });
    // A reservation belongs to a part, not to the table alone. Selecting a
    // subset keeps only reservations of selected instances; the omitted
    // identities stay untouched in the original sheet.
    const retainedPositions = reserved.flatMap((row) => {
      const instanceIds = row.instanceIds.filter((id) => wanted.has(id));
      return instanceIds.length ? [{ ...row, instanceIds }] : [];
    });
    return rows.length || retainedPositions.length
      ? {
          ...sheet,
          partsList: {
            ...partsList,
            rows,
            ...(retainedPositions.length ? { retainedPositions } : {}),
          },
        }
      : rest;
  });
  return out;
}
