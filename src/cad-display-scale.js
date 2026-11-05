// sqrt(||A^T A||infinity) bounds the largest singular value of A.
// Unlike sqrt(||A||1 ||A||infinity), this bound is invariant under world
// rotations: (R A)^T(R A)=A^T A. No CAD construction tolerance uses this value.
export function cadDisplayStretch(matrix){
  const values=[0,1,2,4,5,6,8,9,10].map(i=>matrix[i]);
  if(values.some(v=>!Number.isFinite(v)))throw Error('Ungültige CAD-Anzeigetransformation.');
  const largest=Math.max(...values.map(Math.abs));if(!largest)throw Error('Singuläre CAD-Anzeigetransformation.');
  const columns=[0,1,2].map(i=>matrix.slice(i*4,i*4+3).map(v=>v/largest));
  const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),rows=columns.map(a=>columns.reduce((n,b)=>n+Math.abs(dot(a,b)),0)),bound=largest*Math.sqrt(Math.max(...rows));
  if(!Number.isFinite(bound))throw Error('CAD-Anzeigeskalierung ist zu groß.');
  // Stable cache keys despite rigid-transform roundoff. Ten significant
  // digits round by at most 5e-10 relative; a 1e-9 upward margin exceeds that
  // loss, including arithmetic roundoff. Thus world deflection never grows.
  const rounded=Number(bound.toPrecision(10));return rounded+Math.max(1,rounded)*1e-9;
}
// A cached world-space colored partition is reusable only by an isometry.
// Real scale/shear still gets the original native, world-space partition.
export function cadDisplayIsometry(matrix){
  if(!Array.isArray(matrix)||matrix.length!==16||matrix.some(v=>!Number.isFinite(v))||matrix[3]!==0||matrix[7]!==0||matrix[11]!==0||matrix[15]!==1)return false;
  const columns=[0,1,2].map(i=>matrix.slice(i*4,i*4+3)),dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
  return columns.every((a,i)=>columns.every((b,j)=>Math.abs(dot(a,b)-(i===j?1:0))<=1e-12));
}

// A geometric tier is always at least as fine as the requested deflection.
// An already cached neighboring tier is admissible only within the 10% budget.
const DISPLAY_TIER_RATIO=1.08;
export function cadDisplayDeflectionLevels(requested){
  if(!Number.isFinite(requested)||requested<=0)throw Error('Ungültige CAD-Anzeigegenauigkeit.');
  let exponent=Math.floor(Math.log(requested)/Math.log(DISPLAY_TIER_RATIO));
  let tier=DISPLAY_TIER_RATIO**exponent;
  if(tier>requested)tier=DISPLAY_TIER_RATIO**--exponent;
  if(tier<requested/1.1||tier<=0)return [requested];
  const finer=DISPLAY_TIER_RATIO**(exponent-1);
  return finer>0&&finer>=requested/1.1?[tier,finer]:[tier];
}
