import { partFaceColors, hasCurrentPartSurfaceGroups } from './cad-part-properties.js';
import {
  cadBounds,
  cadVolume,
  cadBoolean,
  readCadBrep,
  transformCad,
  validateCadSolid,
  writeCadBrep,
} from './cad-native-kernel.js';
import { cadIdentity, multiplyCadMatrices } from './cad-affine.js';
import { affineCadSketchCircle } from './cad-drill-stock-native.js';

// Analysis results may be empty (disjoint bodies or exhausted color regions).
// A nonempty volumetric result still has to pass the production solid checks.
function operation(oc, kind, left, right) {
  return cadBoolean(oc, kind, left, right, { allowEmpty: true });
}
function placed(oc, node, matrix = node.transform) {
  if (node.kind !== 'cad') throw Error('Netzreferenzen sind kein Ziel für CAD-Prüfungen.');
  const original = readCadBrep(oc, node.brep.data);
  try {
    return affineCadSketchCircle(oc, node, cadBounds(oc, original), matrix) ?? transformCad(oc, original, matrix);
  } finally {
    original.delete();
  }
}

export function cadCollisionNative(oc, left, right) {
  let a, b, common;
  try {
    a = placed(oc, left);
    b = placed(oc, right);
    common = operation(oc, 'intersection', a, b);
    return common
      ? { intersects: true, volume: cadVolume(oc, common), bounds: cadBounds(oc, common) }
      : { intersects: false, volume: 0, bounds: null };
  } finally {
    common?.delete();
    b?.delete();
    a?.delete();
  }
}

function cadColorStyle(node, inherited = { opacity: 1 }) {
  return { name: node.name, color: node.color ?? inherited.color, opacity: node.opacity ?? inherited.opacity };
}

function* cadColorSources(children, inherited, parentMatrix) {
  for (const source of children) {
    if (source.kind !== 'cad') throw Error('Referenzmesh ist keine CAD-Farbquelle.');
    if (source.suppressed || !source.solid) continue;
    const style = cadColorStyle(source, inherited);
    const matrix = parentMatrix && multiplyCadMatrices(parentMatrix, source.transform);
    if (source.multicolor && source.children) yield* cadColorSources(source.children, style, matrix);
    else yield { source, matrix, style };
  }
}

function matchesRootColor(style, rootStyle) {
  return style.color === rootStyle.color && style.opacity === rootStyle.opacity;
}

// This is a display proof. Production exports still partition material so
// independent source names survive even where every source uses one style.
export function cadUniformSourceStyle(node) {
  const rootStyle = cadColorStyle(node);
  const sources = [...cadColorSources(node.children, rootStyle)];
  const sourceStyle = sources[0]?.style ?? rootStyle;
  if (!sources.every(({ style }) => matchesRootColor(style, sourceStyle))) return null;
  if (matchesRootColor(sourceStyle, rootStyle)) return rootStyle;

  // A plain union takes all of its material from the direct solid sources.
  // Cutting tools remove material. There is no region for the root fallback
  // unless a later operation adds material or a nested group splits colors.
  const plainUnion =
    node.source === 'group' && node.operation === 'union' && !node.finish && !node.drill;
  const nestedColors = node.children.some(
    (source) => source.solid && !source.suppressed && source.multicolor && source.children,
  );
  if (!plainUnion || nestedColors) return null;
  return { ...rootStyle, color: sourceStyle.color, opacity: sourceStyle.opacity };
}

// Color priority follows source order. Each region is intersected with the
// finished result, then removed from the unassigned remainder, so holes and
// overlapping sources never produce double material in colored exports.
export function cadColorPartsNative(oc, node, { display = false, regionCache } = {}) {
  // Root translation does not change material regions. Share the native
  // partition with display and repeat exports, then place owned BRep copies.
  if (regionCache && node.multicolor && node.children && node.transform.slice(12, 15).some((v) => v !== 0)) {
    const linear = [...node.transform];
    linear[12] = linear[13] = linear[14] = 0;
    const geometrySources = [];
    function visitGeometry(source, parent) {
      if (source.suppressed || !source.solid) return;
      const matrix = multiplyCadMatrices(parent, source.transform);
      if (source.multicolor && source.children) for (const child of source.children) visitGeometry(child, matrix);
      else geometrySources.push([source.brep.data, matrix]);
    }
    for (const source of node.children) visitGeometry(source, linear);
    // Normalize only when a local partition already exists (usually display).
    // A cold export retains the single-placement path and caches world regions.
    if (regionCache.get(JSON.stringify([node.brep.data, linear, geometrySources]))) {
      const parts = cadColorPartsNative(oc, { ...node, transform: linear }, { display, regionCache }),
        translation = cadIdentity(),
        placedParts = [];
      for (let k = 0; k < 3; k++) translation[12 + k] = node.transform[12 + k];
      try {
        for (const part of parts) {
          const shape = transformCad(oc, part.shape, translation),
            { displayBrep, ...style } = part;
          placedParts.push({ ...style, shape });
        }
        return placedParts;
      } catch (error) {
        placedParts.forEach((part) => part.shape.delete());
        throw error;
      } finally {
        parts.forEach((part) => part.shape.delete());
      }
    }
  }
  const output = [];
  let remainder;
  try {
    const rootStyle = cadColorStyle(node);
    if (hasCurrentPartSurfaceGroups(node) || !node.multicolor || !node.children) {
      output.push({
        shape: placed(oc, node),
        ...rootStyle,
        ...(partFaceColors(node).length ? { faceColors: partFaceColors(node) } : {}),
      });
      return output;
    }
    const sources = [...cadColorSources(node.children, rootStyle, node.transform)];
    // Display needs no internal color boundary when every region, including
    // any finish remainder, has the same style. Export retains source names.
    if (display && sources.every(({ style }) => matchesRootColor(style, rootStyle))) {
      output.push({ shape: placed(oc, node), ...rootStyle });
      return output;
    }
    const key = regionCache
        ? JSON.stringify([
            node.brep.data,
            node.transform,
            sources.map(({ source, matrix }) => [source.brep.data, matrix]),
          ])
        : null,
      cached = key && regionCache.get(key);
    if (cached) {
      for (const region of cached)
        output.push({
          shape: readCadBrep(oc, region.brep),
          displayBrep: region.brep,
          ...(region.sourceIndex < 0 ? rootStyle : sources[region.sourceIndex].style),
        });
      return output;
    }
    remainder = placed(oc, node);
    const regions = [];
    for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex++) {
      const { source, matrix, style } = sources[sourceIndex];
      if (!remainder) break;
      let body, part, next;
      try {
        body = placed(oc, source, matrix);
        part = operation(oc, 'intersection', remainder, body);
        if (!part) continue;
        next = operation(oc, 'difference', remainder, part);
        output.push({ shape: part, ...style });
        regions.push({ shape: part, sourceIndex });
        part = null;
        remainder.delete();
        remainder = next;
        next = null;
      } finally {
        next?.delete();
        part?.delete();
        body?.delete();
      }
    }
    if (remainder) {
      output.push({ shape: remainder, ...rootStyle });
      regions.push({ shape: remainder, sourceIndex: -1 });
      remainder = null;
    }
    if (regionCache) {
      const records = regions.map(({ shape, sourceIndex }) => ({ brep: writeCadBrep(oc, shape), sourceIndex })),
        bytes = new TextEncoder().encode(key).length + records.reduce((sum, r) => sum + r.brep.length * 2 + 32, 0);
      regionCache.set(key, records, Math.max(1, bytes));
      output.forEach((part, index) => {
        part.displayBrep = records[index].brep;
      });
    }
    return output;
  } catch (error) {
    output.forEach((part) => part.shape.delete());
    throw error;
  } finally {
    remainder?.delete();
  }
}

export function cadColorRecordsNative(oc, node) {
  const parts = cadColorPartsNative(oc, node);
  try {
    return parts.map((part) => {
      const stats = validateCadSolid(oc, part.shape);
      return {
        name: part.name,
        color: part.color,
        opacity: part.opacity,
        brep: writeCadBrep(oc, part.shape),
        volume: stats.volume,
        bounds: stats.bounds,
      };
    });
  } finally {
    parts.forEach((part) => part.shape.delete());
  }
}
