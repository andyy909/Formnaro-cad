export const DIMENSION_TYPES = new Set(['length','distance','angle','radius']);
export function constraintAnchor(constraint, elements) {
  const map=new Map(elements.map(e=>[e.id,e]));
  const points=constraint.refs.map(ref=>{const e=map.get(ref.element);if(!e)return null;if(ref.point)return e[ref.point];if(e.type==='circle')return [e.center[0]+e.radius,e.center[1]];if(e.start&&e.end)return [(e.start[0]+e.end[0])/2,(e.start[1]+e.end[1])/2];return e.center??null;}).filter(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite));
  if(!points.length)return null;return [points.reduce((n,p)=>n+p[0],0)/points.length,points.reduce((n,p)=>n+p[1],0)/points.length];
}
export function constraintsForElements(constraints, ids) {const set=new Set(ids);return constraints.filter(c=>c.refs.some(r=>set.has(r.element))).map(c=>c.id);}
export function selectedConstraintRefs(handles, selected) {return selected.flatMap(i=>(handles[i]?.references??[]).map(r=>({element:r.id,point:r.field}))).filter((r,i,a)=>a.findIndex(x=>x.element===r.element&&x.point===r.point)===i);}
