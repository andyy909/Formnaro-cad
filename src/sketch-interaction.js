// Pure sketch interaction state. Nothing here mutates model/history or loads a kernel.
export const literalCoordinate=value=>typeof value==='number'?Number.isFinite(value):typeof value==='string'&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim());
export function createSketchHistory(initial,{limit=100}={}){
 let values=[structuredClone(initial)],at=0;
 return {record(value){if(JSON.stringify(value)===JSON.stringify(values[at]))return;values=values.slice(0,at+1);values.push(structuredClone(value));if(values.length>limit)values.shift();at=values.length-1;},undo(){if(at>0)at--;return structuredClone(values[at]);},redo(){if(at<values.length-1)at++;return structuredClone(values[at]);},state:()=>({undo:at,redo:values.length-at-1})};
}
export function sketchSnap(point,{points=[],midpoints=null,grid=1,tolerance=.5,exclude=[]}={}){
 const excluded=new Set(exclude),candidates=points.flatMap((p,i)=>excluded.has(i)?[]:[{point:p,kind:'endpoint',distance:Math.hypot(...p.map((v,k)=>v-point[k]))}]);
 const mids=midpoints??points.map((p,i)=>({point:p.map((v,k)=>(v+points[(i+1)%points.length][k])/2),indices:[i,(i+1)%points.length]}));
 for(const m of mids){if(m.indices.some(i=>excluded.has(i)))continue;const p=m.point;candidates.push({point:p,kind:'midpoint',distance:Math.hypot(...p.map((v,k)=>v-point[k]))});}
 const nearest=candidates.filter(c=>c.distance<=tolerance).sort((a,b)=>a.distance-b.distance)[0];if(nearest)return {...nearest,point:[...nearest.point]};
 if(grid>0&&Number.isFinite(grid)){const p=point.map(v=>Math.round(v/grid)*grid);if(Math.hypot(...p.map((v,k)=>v-point[k]))<=tolerance)return {point:p,kind:'grid'};}
 return {point:[...point],kind:null};
}
export function moveSketchPoints(sketch,indices,delta){
 if(sketch.kind!=='polygon'||!Array.isArray(indices)||indices.some(i=>!Number.isInteger(i)||!sketch.points[i]))throw Error('Konturpunkte auswählen.');
 if(indices.some(i=>sketch.points[i].some(v=>!literalCoordinate(v))))throw Error('Formelgesteuerter Punkt: die Maßformel im Eingabefeld ändern.');
 const out=structuredClone(sketch);for(const i of indices)out.points[i]=out.points[i].map((v,k)=>String(Number((Number(v)+delta[k]).toPrecision(14))));return out;
}
export function createSketchCamera(){
 let box=null;
 return {fit(points=[],diameter=0,{minimum=50}={}){const extent=Math.max(minimum,diameter,...points.flat().filter(Number.isFinite).map(v=>Math.abs(v)*1.15));box=[-extent,-extent,extent*2,extent*2];return [...box];},view:()=>box&&[...box],pan(dx,dy){if(box){box[0]+=dx;box[1]+=dy;}return [...box];},zoom(factor,point){if(!box)return null;const width=Math.max(.02,Math.min(200000,box[2]*factor)),ratio=width/box[2];box=[point[0]+(box[0]-point[0])*ratio,point[1]+(box[1]-point[1])*ratio,width,box[3]*ratio];return [...box];}};
}
