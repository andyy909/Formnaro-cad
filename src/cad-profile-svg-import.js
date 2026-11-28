import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

const MM_PER_UNIT = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, q: 0.25 };
const MAX_SVG_LENGTH = 4 * 1024 * 1024;

function sizeInMm(value) {
  if (!value) return null;
  const match = /^([+]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(mm|cm|in|pt|pc|px|q)?$/i.exec(value.trim());
  if (!match || !(Number(match[1]) > 0)) throw Error('SVG benötigt eine absolute Breite und Höhe.');
  return Number(match[1]) * MM_PER_UNIT[(match[2] ?? 'px').toLowerCase()];
}

function viewport(root) {
  const width = sizeInMm(root.getAttribute('width'));
  const height = sizeInMm(root.getAttribute('height'));
  if (!root.hasAttribute('viewBox')) return { sx: MM_PER_UNIT.px, sy: MM_PER_UNIT.px, x: 0, y: height ?? 0 };
  const box = root
    .getAttribute('viewBox')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0)
    throw Error('Ungültige SVG-viewBox.');
  const [left, top, spanX, spanY] = box;
  const viewportWidth = width ?? spanX * (height ? height / spanY : MM_PER_UNIT.px);
  const viewportHeight = height ?? spanY * (width ? width / spanX : MM_PER_UNIT.px);
  const sx = viewportWidth / spanX,
    sy = viewportHeight / spanY;
  const [align = 'xMidYMid', meet = 'meet'] = (root.getAttribute('preserveAspectRatio') ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (align === 'none') return { sx, sy, x: -left * sx, y: viewportHeight + top * sy };
  const alignment = /^x(Min|Mid|Max)Y(Min|Mid|Max)$/.exec(align);
  if (!alignment || !['meet', 'slice'].includes(meet)) throw Error('Ungültige SVG-Seitenverhältniseinstellung.');
  const scale = meet === 'slice' ? Math.max(sx, sy) : Math.min(sx, sy);
  const ratio = { Min: 0, Mid: 0.5, Max: 1 };
  return {
    sx: scale,
    sy: scale,
    x: -left * scale + (viewportWidth - spanX * scale) * ratio[alignment[1]],
    y: viewportHeight + top * scale - (viewportHeight - spanY * scale) * ratio[alignment[2]],
  };
}

/** Read analytic 2D geometry from a detached SVG document. */
export function cadSvgEntities(text) {
  if (text.length > MAX_SVG_LENGTH || /<!DOCTYPE/i.test(text))
    throw Error('SVG-Datei ist zu groß oder enthält einen Dokumenttyp.');
  const document = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = document.documentElement;
  if (
    root.localName !== 'svg' ||
    document.getElementsByTagName('parsererror').length ||
    root.querySelector('svg, use, clipPath, mask')
  )
    throw Error('Ungültiges SVG oder nicht unterstützte SVG-Referenz, Maske oder verschachtelte Ansicht.');
  const { sx, sy, x, y } = viewport(root);
  const point = (vector) => [vector.x * sx + x, y - vector.y * sy];
  const loader = new SVGLoader();
  loader.defaultDPI = 96;
  const { paths } = loader.parse(text);
  const entities = [];
  for (const path of paths) {
    if (path.userData?.style?.visibility === 'hidden' || path.userData?.style?.display === 'none') continue;
    for (const subpath of path.subPaths) {
      for (const curve of subpath.curves) {
        if (curve.isLineCurve) {
          const start = point(curve.v1),
            end = point(curve.v2);
          if (Math.hypot(start[0] - end[0], start[1] - end[1]) > 1e-7) entities.push({ type: 'line', start, end });
        } else if (curve.isEllipseCurve) {
          const c = Math.cos(curve.aRotation),
            s = Math.sin(curve.aRotation);
          const a = [curve.xRadius * c * sx, curve.xRadius * s * sy];
          const b = [-curve.yRadius * s * sx, curve.yRadius * c * sy];
          const radius = Math.hypot(...a),
            other = Math.hypot(...b);
          if (
            Math.abs(radius - other) > 1e-8 * Math.max(1, radius, other) ||
            Math.abs(a[0] * b[0] + a[1] * b[1]) > 1e-8 * radius * other
          )
            throw Error('Ellipse oder nicht kreisförmig transformierter SVG-Bogen.');
          const start = point(curve.getPoint(0)),
            end = point(curve.getPoint(1)),
            through = point(curve.getPoint(0.5)),
            center = point({ x: curve.aX, y: curve.aY });
          if (Math.hypot(start[0] - end[0], start[1] - end[1]) <= 1e-7)
            entities.push({
              type: 'circle',
              center,
              diameter: 2 * Math.hypot(start[0] - center[0], start[1] - center[1]),
            });
          else entities.push({ type: 'arc', start, through, end });
        } else throw Error('SVG-Skizzen unterstützen Linien, Kreise und Kreisbögen.');
      }
      if (subpath.autoClose && subpath.curves.length) {
        const start = point(subpath.curves.at(-1).getPoint(1)),
          end = point(subpath.curves[0].getPoint(0));
        if (Math.hypot(start[0] - end[0], start[1] - end[1]) > 1e-7) entities.push({ type: 'line', start, end });
      }
    }
  }
  return entities;
}
