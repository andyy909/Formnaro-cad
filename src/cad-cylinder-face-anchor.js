// Semantic end faces of an unrounded native circular cylinder.  Bounds are
// local to its retained source; no topological face number is persisted.
const faces={'cylinder-face-bottom':{side:'min',sign:-1},'cylinder-face-top':{side:'max',sign:1}};
const vector=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
function circle(b,tolerance){if(!b||!vector(b.min)||!vector(b.max)||b.min.some((v,i)=>v>=b.max[i]))return null;const rx=(b.max[0]-b.min[0])/2,ry=(b.max[1]-b.min[1])/2;if(Math.abs(rx-ry)>tolerance||Math.abs(b.max[0]+b.min[0])>tolerance||Math.abs(b.max[1]+b.min[1])>tolerance)return null;return Math.min(rx,ry);}
export function remapCadCylinderFaceAnchor({feature,anchor,previousBounds,currentBounds,tolerance=1e-6}={}){
 const face=faces[feature],oldRadius=circle(previousBounds,tolerance),newRadius=circle(currentBounds,tolerance);if(!face||!oldRadius||!newRadius||!vector(anchor?.point)||!vector(anchor?.normal)||!Number.isFinite(tolerance)||tolerance<=0||tolerance>1e-4)return null;
 const length=Math.hypot(...anchor.normal);if(!length||anchor.normal.some((v,i)=>Math.abs(v/length-(i===2?face.sign:0))>1e-8)||Math.abs(anchor.point[2]-previousBounds[face.side][2])>tolerance)return null;
 const radial=Math.hypot(anchor.point[0],anchor.point[1]);if(radial>=oldRadius-tolerance||radial>=newRadius-tolerance)return null;
 return {point:[anchor.point[0],anchor.point[1],currentBounds[face.side][2]],normal:[0,0,face.sign]};
}
export function identifyCadCylinderFaceAnchor(anchor,bounds){const result=Object.keys(faces).filter(feature=>remapCadCylinderFaceAnchor({feature,anchor,previousBounds:bounds,currentBounds:bounds}));return result.length===1?result[0]:null;}
