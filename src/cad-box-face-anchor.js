// Exact semantic box-face correspondence. Call only after verifying that both
// shapes come from the same retained native box source and placement chain.
// A null result requires the user to choose a new reference.
const faces=Object.freeze({
  'box-face-left':{axis:0,side:'min',sign:-1},'box-face-right':{axis:0,side:'max',sign:1},
  'box-face-front':{axis:1,side:'min',sign:-1},'box-face-back':{axis:1,side:'max',sign:1},
  'box-face-bottom':{axis:2,side:'min',sign:-1},'box-face-top':{axis:2,side:'max',sign:1}
});
const vector=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
function validBounds(b){return b&&vector(b.min)&&vector(b.max)&&b.min.every((v,i)=>v<b.max[i]);}

export function identifyCadBoxFaceAnchor(anchor,bounds,{tolerance=1e-6}={}){
  if(!validBounds(bounds)||!vector(anchor?.point)||!vector(anchor?.normal))return null;
  const candidates=Object.keys(faces).filter(feature=>remapCadBoxFaceAnchor({feature,anchor,previousBounds:bounds,currentBounds:bounds,tolerance}));
  return candidates.length===1?candidates[0]:null;
}

export function remapCadBoxFaceAnchor({feature,anchor,previousBounds,currentBounds,tolerance=1e-6}={}){
  const face=faces[feature];
  if(!face||!validBounds(previousBounds)||!validBounds(currentBounds)||!vector(anchor?.point)||!vector(anchor?.normal)||!Number.isFinite(tolerance)||tolerance<=0||tolerance>1e-4)return null;
  const {axis,side,sign}=face,normal=anchor.normal,normalLength=Math.hypot(...normal);
  if(!normalLength||normal.some((v,i)=>Math.abs(v/normalLength-(i===axis?sign:0))>1e-8))return null;
  if(Math.abs(anchor.point[axis]-previousBounds[side][axis])>tolerance)return null;
  const point=[...anchor.point];
  for(let i=0;i<3;i++)if(i!==axis){
    // A point on a boundary can belong to more than one face; require a
    // proper interior point rather than guessing between adjacent faces.
    if(point[i]<=previousBounds.min[i]+tolerance||point[i]>=previousBounds.max[i]-tolerance||point[i]<=currentBounds.min[i]+tolerance||point[i]>=currentBounds.max[i]-tolerance)return null;
  }
  point[axis]=currentBounds[side][axis];
  return {point,normal:[0,1,2].map(i=>i===axis?sign:0)};
}
