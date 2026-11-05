const svgNS = 'http://www.w3.org/2000/svg';
const polygon = (points, face = 'top') => `<polygon points="${points}" class="si-${face}"/>`;
const line = (d, style = 'line') => `<path d="${d}" class="si-${style}"/>`;
const circle = (x, y, r, face = 'paper') => `<circle cx="${x}" cy="${y}" r="${r}" class="si-${face}"/>`;
const ellipse = (x, y, rx, ry, face = 'paper') => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" class="si-${face}"/>`;
const translate = (x, y, art, scale = 1) => `<g transform="translate(${x} ${y}) scale(${scale})">${art}</g>`;

function block(top = 'top', front = 'front', side = 'side') {
  return polygon('4,12 16,6 28,12 16,18', top) +
    polygon('4,12 16,18 16,29 4,23', front) + polygon('16,18 28,12 28,23 16,29', side);
}
const tile = polygon('4,15 16,9 28,15 16,21', 'ref') + line('M4 15v3l12 6 12-6v-3 M16 21v3');
const paper = polygon('7,4 21,4 26,9 26,28 7,28', 'paper') + line('M21 4v5h5');
const mini = translate(0, 1, block(), .57);
const mesh = block('mesh', 'mesh', 'mesh') + line('M4 12l12 17 12-17 M10 15l6-9 6 9 M4 23l12-5 12 5 M10 15v11m12-11v11', 'fine');
const pin = circle(16, 15, 4, 'accent') + circle(16, 15, 1.1, 'paper');
const arrow = line('M16 18V5m-4 4 4-4 4 4', 'blue-line');
const filePair = translate(-1, 0, paper, .8) + translate(10, 7, paper, .8);
const network = line('M9 9l14 2-6 13-8-15') + circle(9, 9, 2.5, 'ref') +
  circle(23, 11, 2.5, 'accent') + circle(17, 24, 2.5, 'ref');
const compare = translate(0, 0, block('ref','front','side'), .61) + translate(13, 10, block('accent','gold','ochre'), .61);
const surface = line('M4 15Q10 6 17 11t11 2v9Q21 27 15 21T4 25Z', 'ref');
const art = {
  extrude: block() + polygon('10,11 16,8 22,11 16,14', 'shadow') +
    polygon('10,7 16,4 22,7 16,10', 'accent') + polygon('10,7 16,10 16,16 10,13', 'gold') + polygon('16,10 22,7 22,13 16,16', 'ochre'),
  cut: block() + polygon('9,12 16,8.5 23,12 16,15.5', 'shadow') +
    polygon('10,12 16,9 22,12 16,14.8', 'ref') + line('M16 2v10m-3-3 3 3 3-3', 'blue-line'),
  round: line('M5 13 15 7Q21 4 26 8L29 11v10l-13 8L5 23Z', 'front') +
    line('M5 13l11 5 13-7 M16 18v11 M15 7q-1 5 4 8', 'line') + line('M16 7q5-3 10 1l3 3-10 5q-5-3-3-9Z', 'accent'),
  chamfer: polygon('5,12 15,6 24,7 29,12 16,19', 'top') + polygon('5,12 16,19 16,29 5,23', 'front') +
    polygon('16,19 29,12 29,22 16,29', 'side') + polygon('15,6 24,7 29,12 20,13', 'accent'),
  drill: block() + ellipse(16, 12, 4.6, 2.3, 'shadow') + line('M16 2v9m-2-7 4 2-4 2 4 2', 'blue-line'),
  'cad-shell': block() + polygon('8,12 16,8 24,12 16,16', 'shadow') + polygon('10,13 16,10 22,13 16,16', 'side'),
  'cad-loft': line('M5 21 12 8h8l7 13v3Q16 30 5 24Z', 'ref') +
    ellipse(16, 8, 4, 2.4, 'accent') + ellipse(16, 22, 11, 4.1, 'front') + line('M16 11v6', 'fine'),
  'cad-sweep': line('M5 24Q7 12 17 11q7 0 10-6', 'sweep') +
    line('M5 24Q7 12 17 11q7 0 10-6', 'sweep-light') + ellipse(6, 24, 3.2, 2.6, 'accent') + circle(27, 5, 2, 'ref'),
  'cad-draft': polygon('7,11 16,5 25,11 16,16', 'top') + polygon('7,11 16,16 16,29 3,22', 'gold') +
    polygon('16,16 25,11 29,22 16,29', 'side') + line('M27 7v14', 'dash'),
  'cad-defeature': block() + line('M9 10V5l5-2 5 2v5', 'dash') + line('M20 5h8', 'blue-line'),
  'cad-revolution': ellipse(16, 23, 10, 4, 'side') +
    line('M6 23V17q0-4 5-7V6q5-3 10 0v4q5 3 5 7v6Q16 31 6 23Z', 'front') +
    ellipse(16, 6, 5, 2, 'accent') + line('M3 19c-2-7 17-9 25-3l-4-1m4 1-2 3', 'blue-line'),
  'cad-helix': line('M16 3v26', 'dash') + line('M8 26c0 4 16 2 16-2s-16-1-16-5 16-2 16-6-16-1-16-5 16-2 16-5', 'blue-line'),
  'cad-surface-fill': surface + line('M8 14q4-1 8 2t8 2 M9 20q4-1 8 2t7 1', 'fine') + circle(17, 16, 2.1, 'accent'),
  'cad-surface-transition': line('M3 23V8l9 5v12Z', 'ref') + line('M20 11l9-6v15l-9 4Z', 'mesh') +
    line('M12 13q4 1 8-2v13q-4 3-8 1Z', 'accent'),
  'cad-surface-sew': line('M3 13l10-7 5 12-11 7Z', 'ref') + line('M14 6l12 2 4 12-12-2Z', 'mesh') +
    line('M14 8l4 9m-6-6 6-3m-5 7 6-3m-4 7 6-3', 'gold-line'),
  'cad-surface-relief': surface + line('M15 24V10m-4 4 4-4 4 4', 'gold-line'),
  array: translate(1, 0, mini) + translate(14, 0, mini) + translate(1, 12, mini) + translate(14, 12, mini),
  mirror: polygon('4,25 4,10 12,17', 'ref') + polygon('28,25 28,10 20,17', 'accent') + line('M16 4v25', 'dash'),
  'cad-face-offset': block('ref') + polygon('4,7 16,1 28,7 16,13', 'accent') + line('M4 8v4m24-4v4 M16 14v4', 'dash'),
  'cad-edit-modeling': translate(0, 6, block(), .78) + polygon('14,18 15,13 24,4 28,8 19,17', 'accent') + line('M22 6l4 4'),
  'project-parameters': paper + line('M11 12h11 M11 17h11 M11 22h11') + circle(14, 12, 1.6, 'accent') + circle(20, 17, 1.6, 'ref') + circle(16, 22, 1.6, 'accent'),
  sketch: tile + line('M9 20l1-4L23 3l4 4-13 13-5 1Z', 'accent') + line('M21 5l4 4'),
  'sketch-on-part': block('ref') + line('M12 13l1-4L22 1l4 4-10 9-4 1Z', 'accent'),
  'cad-contour': line('M6 23V8h13v5h7v10Z', 'ref') + line('M9 20v-9h7v5h7v4Z', 'blue-line'),
  'linked-contours': line('M5 23V8h13v5h8v10Z', 'dash') + line('M8 25V11h13v5h8v9Z', 'ref') + line('M3 5l5 5m0-4v4H4', 'blue-line'),
  'sketch-templates': filePair + line('M18 24v-6h8v6Z', 'blue-line'),
  'workplane-set': tile + pin,
  'workplane-top': tile + arrow,
  'reset-plane': tile + line('M9 11a7 7 0 1 1 8 4M6 9l3 2 1-4', 'blue-line'),
  measure: line('M5 23V8m22 15V8M5 15h22m-18-4-4 4 4 4m14-8 4 4-4 4', 'blue-line') + circle(5, 24, 2, 'accent') + circle(27, 24, 2, 'accent'),
  ruler: polygon('3,20 22,5 29,13 10,28', 'accent') + line('M8 17l3 4m2-8 2 2m2-5 3 4m2-8 2 2'),
  section: block() + polygon('13,8 19,5 19,26 13,29', 'ref') + line('M14 16l4-4m-4 8 4-4m-4 8 4-4', 'fine'),
  thickness: polygon('6,8 26,8 26,13 6,13', 'ref') + polygon('6,20 26,20 26,25 6,25', 'ref') +
    line('M16 13v7m-3-4 3-3 3 3m-6 1 3 3 3-3', 'gold-line'),
  inspect: translate(2, 3, block(), .73) + circle(20, 17, 5.2, 'ref') + line('M24 21l5 6', 'blue-line'),
  'model-compare': compare + line('M6 25h8m-3-3 3 3-3 3', 'blue-line'),
  drawing: paper + line('M10 13h5v6h-5Z M18 13h5v6h-5Z M10 22h5v3h-5Z', 'blue-line') + line('M18 23h5'),
  group: translate(3, 6, compare, .82) + line('M3 9V4h6m14 0h6v5m0 14v5h-6M9 28H3v-5', 'blue-line'),
  ungroup: compare + line('M8 19l-4 4m0-4v4h4 M24 11l4-4m-4 0h4v4', 'blue-line'),
  bundle: line('M4 12h10l3-4h11v17H4Z', 'accent') + translate(9, 9, block(), .56),
  align: polygon('3,10 11,10 11,20 3,20', 'accent') + polygon('16,10 26,10 26,24 16,24', 'ref') + line('M2 7h28', 'dash'),
  'reference-place': translate(3, 3, tile, .83) + pin + line('M16 5v4m0 12v5M5 15h5m12 0h5', 'blue-line'),
  'lay-on-face': tile + translate(7, 7, block('accent','gold','ochre'), .58) + line('M23 5v8m-3-3 3 3 3-3', 'blue-line'),
  joints: polygon('3,12 12,12 17,17 12,22 3,22', 'ref') + polygon('29,12 20,12 15,17 20,22 29,22', 'accent') + circle(16, 17, 3.7, 'paper'),
  'assembly-only': block() + line('M3 9V4h6m14 0h6v5m0 13v6h-6M9 28H3v-6', 'blue-line'),
  'assembly-load': line('M3 11h10l3 4h13l-4 12H3Z', 'accent') + line('M21 3v10m-4-4 4 4 4-4', 'blue-line'),
  'assembly-all': translate(0, 0, block('ref'), .57) + translate(14, 2, block('accent'), .57) + translate(7, 13, block(), .57),
  'mesh-tools': mesh + line('M18 23l7-7m-3-2 3 2 4-4 1 4-4 4-4-1-5 7', 'gold-line'),
  'mesh-select': mesh + polygon('16,18 28,12 16,29', 'accent'),
  'mesh-inspector': translate(1, 3, mesh, .75) + circle(20, 16, 5, 'ref') + line('M24 20l5 6', 'blue-line'),
  'mesh-repair': mesh + line('M18 23l4 4 7-9', 'gold-line'),
  'mesh-close-hole': mesh + polygon('4,12 16,18 16,6', 'accent') + line('M11 10v7m-3-3h6', 'blue-line'),
  'mesh-reduce': mesh + line('M28 3l-5 5m0-4v4h4', 'gold-line'),
  'mesh-curved-reduce': line('M4 24Q4 7 16 7T28 24Z', 'mesh') +
    line('M4 24l12-17 12 17 M10 13l6 11 6-11', 'fine') + line('M28 3l-5 5m0-4v4h4', 'gold-line'),
  'mesh-sculpt': line('M4 24Q7 12 17 13t11 11Z', 'mesh') +
    line('M5 23l8-9 3 10 6-10 5 10', 'fine') + line('M17 15l5-9 3 2-5 8Z', 'accent'),
  'mesh-hollow': mesh + polygon('8,12 16,8 24,12 16,16', 'shadow') + line('M10 12l6 3 6-3', 'fine'),
  'mesh-features': mesh + circle(10, 15, 1.8, 'accent') + circle(22, 15, 1.8, 'accent') + circle(16, 23, 1.8, 'accent'),
  'cad-to-mesh': translate(0, 1, block('accent','gold','ochre'), .55) + translate(15, 12, mesh, .55) +
    line('M12 13l7 5m0-4v4h-4', 'blue-line'),
  'mesh-to-cad': translate(0, 1, mesh, .55) + translate(15, 12, block('accent','gold','ochre'), .55) +
    line('M12 13l7 5m0-4v4h-4', 'blue-line'),
  'stl-to-step': translate(-2, 1, paper, .73) + translate(13, 12, block('accent','gold','ochre'), .65) +
    line('M6 10l5 6h-9Z', 'fine') + line('M11 17h8m-3-3 3 3-3 3', 'blue-line'),
};

const fusionArt = {
  extrude: block('ref','front','side') + arrow,
  cut: block('ref','front','side') + polygon('10,11 16,8 22,11 16,14','shadow') +
    line('M16 2v10m-4-4 4 4 4-4','gold-line'),
  sketch: tile + line('M9 18V9h13v9Z','blue-line') +
    line('M19 11l6-7 3 2-6 8-4 1Z','accent'),
  measure: polygon('3,19 24,6 29,13 8,26','accent') +
    line('M8 16l3 4m1-7 2 2m2-5 3 4m1-7 2 2'),
  functions: paper + line('M11 13l4 4-4 4m7 0h5','blue-line'),
};

function commandIcon(drawing,variant) {
  if (!drawing) return null;
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('solid-command-icon');
  if(variant==='fusion')svg.classList.add('fusion-command-icon');
  svg.innerHTML = drawing;
  return svg;
}
export function createSolidCommandIcon(key) {
  return commandIcon(Object.hasOwn(art,key)?art[key]:null,'solid');
}
export function createFusionCommandIcon(key) {
  return commandIcon(Object.hasOwn(fusionArt,key)?fusionArt[key]:Object.hasOwn(art,key)?art[key]:null,'fusion');
}
