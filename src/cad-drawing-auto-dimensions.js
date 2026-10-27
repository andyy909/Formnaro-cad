import {validateCadDrawingSheet,cadDrawingProblems,cadDrawingDimension,cadDrawingPaperSize,cadDrawingId,CAD_DRAWING_LIMITS} from './cad-drawing-data.js';
import {cadDrawingCurveBounds,cadDrawingCurvePoint} from './cad-drawing-measure.js';
import {cadDrawingAnnotationGeometry} from './cad-drawing-export.js';

const EPS=1e-7,near=(a,b)=>Math.abs(a-b)<=EPS,round=n=>Math.round(n/EPS),clone=value=>structuredClone(value);
const paper=(sheet,view,p)=>[view.position[0]+p[0]*sheet.scale,view.position[1]-p[1]*sheet.scale];
const overlaps=(a,b)=>a.min.every((v,k)=>v<b.max[k]&&a.max[k]>b.min[k]);
function crossesBox([a,b],box){let lo=0,hi=1;for(let k=0;k<2;k++){const d=b[k]-a[k];if(Math.abs(d)<1e-12){if(a[k]<=box.min[k]||a[k]>=box.max[k])return false;}else{const p=(box.min[k]-a[k])/d,q=(box.max[k]-a[k])/d;lo=Math.max(lo,Math.min(p,q));hi=Math.min(hi,Math.max(p,q));if(lo>=hi)return false;}}return true;}
const textBox=(text,position)=>{const w=Math.max(8,text.length*1.9+3);return {min:[position[0]-w/2,position[1]-5.2],max:[position[0]+w/2,position[1]+1.2]};};
const viewBox=(sheet,view)=>{const {min,max}=view.projection.bounds;return {min:paper(sheet,view,[min[0],max[1]]),max:paper(sheet,view,[max[0],min[1]])};};
function linearKey(view,axis,points){const k=axis==='x'?0:1,frame=view.projection.frame,direction=frame.slice(k*4,k*4+3),origin=direction.reduce((n,v,i)=>n+v*frame[12+i],0),coords=points.map(p=>round(p[k]+origin)).sort((a,b)=>a-b);return JSON.stringify(['linear',[...view.sourceIds].sort(),direction,coords,view.kind==='section'?view.section:null]);}
function key(sheet,a){
 if(a.kind==='label'||a.unresolved)return null;
 try{const d=cadDrawingDimension(sheet,a),v=d.view;if(a.kind==='distance')return linearKey(v,a.axis,d.points);
  if(a.kind==='length'){if(near(d.points[0][1],d.points[1][1]))return linearKey(v,'x',d.points);if(near(d.points[0][0],d.points[1][0]))return linearKey(v,'y',d.points);}
  return JSON.stringify([['radius','diameter'].includes(a.kind)?'round':a.kind,v.id,[...a.curveIds].sort()]);
 }catch{return null;}
}
function distance(view,axis,first,last){const curveIds=[...new Set([first.curve.id,last.curve.id])];return {kind:'distance',viewId:view.id,curveIds,axis,anchors:[first,last].map(w=>({curveIndex:curveIds.indexOf(w.curve.id),point:w.point}))};}
function boundsWitnesses(curves){
 const result={};
 for(const role of ['minX','maxX','minY','maxY']){const axis=role.endsWith('X')?0:1,low=role.startsWith('min');for(const curve of curves){const p=cadDrawingCurvePoint(curve,role),prior=result[role];if(!prior||(low?p[axis]<prior.value:p[axis]>prior.value))result[role]={curve,point:role,value:p[axis]};}}
 return result;
}
function attach(view,a){a.sourceSignatures=clone(view.projection.sourceSignatures);const curves=a.curveIds.map(id=>view.projection.curves.find(c=>c.id===id));if(curves.every(c=>c.sourceReferences))a.curveReferences=curves.map(c=>({sourceReferences:clone(c.sourceReferences)}));return a;}

/** Pure bounded suggestion pass over confirmed native 2D curves. Existing
 * annotations, source geometry and projections are preserved byte for byte.
 * Nothing is committed until the ordinary sheet Preview/Apply is accepted. */
export function autoDimensionCadDrawing(input,{mode='basic',sourceSignatures,makeId=()=>cadDrawingId('dimension'),maxNew=200}={}){
 if(!['basic','detailed'].includes(mode)||!Number.isInteger(maxNew)||maxNew<1||maxNew>CAD_DRAWING_LIMITS.annotations)throw Error('Ungültige automatische Bemaßung.');
 const sheet=validateCadDrawingSheet(input),issues=cadDrawingProblems(sheet,{sourceSignatures});if(issues.length)throw Error(issues[0].message+' Zuerst „Blatt aktualisieren“ ausführen.');
 const candidates=[],warnings=new Set(),report={mode,added:0,duplicates:0,noSpace:0,limited:0,unsupportedViews:0,warnings:[]};
 const addCandidate=a=>{if(candidates.length<Math.min(4000,Math.max(512,maxNew*8)))candidates.push(a);else report.limited++;};
 // Two passes give overall dimensions and diameters precedence over detail.
 const contexts=sheet.views.map(view=>{
  const visible=view.projection.curves.filter(c=>!c.hidden),analytic=visible.filter(c=>['line','circle','arc','ellipse'].includes(c.kind)),complete=analytic.length===visible.length,extrema=analytic.length?boundsWitnesses(analytic):null;
  if(!complete){report.unsupportedViews++;warnings.add('Ansichten mit Spline-Konturen erhalten keine automatischen Gesamt- oder Positionsmaße.');}
  return {view,visible,analytic,complete,extrema};
 });
 for(const {view,analytic,complete,extrema}of contexts){
  if(complete&&extrema){const concentric=analytic.every(c=>c.kind==='circle'&&near(c.center[0],analytic[0].center[0])&&near(c.center[1],analytic[0].center[1]));if(!concentric)for(const [axis,lo,hi]of [['x','minX','maxX'],['y','minY','maxY']])if(extrema[hi].value-extrema[lo].value>EPS)addCandidate(distance(view,axis,extrema[lo],extrema[hi]));}
  for(const curve of analytic)if(curve.kind==='circle')addCandidate({kind:'diameter',viewId:view.id,curveIds:[curve.id]});
 }
 if(mode==='detailed')for(const {view,analytic,complete,extrema}of contexts){
  if(complete&&extrema)for(const curve of analytic.filter(c=>c.kind==='circle')){
   const outer=near(curve.center[0]-curve.radius,extrema.minX.value)&&near(curve.center[0]+curve.radius,extrema.maxX.value)&&near(curve.center[1]-curve.radius,extrema.minY.value)&&near(curve.center[1]+curve.radius,extrema.maxY.value);if(outer)continue;
   for(const [axis,role,k]of [['x','minX',0],['y','minY',1]])if(curve.center[k]-extrema[role].value>EPS)addCandidate(distance(view,axis,extrema[role],{curve,point:'center'}));
  }
  const vertices=new Map();
  for(const curve of analytic){
   if(curve.kind==='arc')addCandidate({kind:'radius',viewId:view.id,curveIds:[curve.id]});
   if(curve.kind!=='line')continue;
   addCandidate({kind:'length',viewId:view.id,curveIds:[curve.id]});
   for(const p of [curve.a,curve.b]){const bucket=p.map(round).join(','),entries=vertices.get(bucket)??[];if(entries.length<16){for(const other of entries){if(![other.a,other.b].some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<=EPS))continue;const u=curve.b.map((x,k)=>x-curve.a[k]),v=other.b.map((x,k)=>x-other.a[k]),angle=Math.atan2(Math.abs(u[0]*v[1]-u[1]*v[0]),u[0]*v[0]+u[1]*v[1])*180/Math.PI;if(angle>.1&&angle<179.9&&Math.abs(angle-90)>.1)addCandidate({kind:'angle',viewId:view.id,curveIds:[other.id,curve.id]});}entries.push(curve);vertices.set(bucket,entries);}}
  }
 }
 const [width,height]=cadDrawingPaperSize(sheet),obstacles=sheet.views.map(v=>viewBox(sheet,v));obstacles.push({min:[width-10-Math.min(180,width-20),height-40],max:[width-10,height-10]});
 const occupied=sheet.annotations.map(a=>{try{return textBox(a.kind==='label'?a.text:cadDrawingDimension(sheet,a).text,a.position);}catch{return textBox('Bezug verloren',a.position);}}),seen=new Set(sheet.annotations.map(a=>key(sheet,a)).filter(Boolean)),ids=new Set([sheet.id,...sheet.views.map(v=>v.id),...sheet.annotations.map(a=>a.id),...sheet.views.flatMap(v=>v.sourceIds)]);
 const viewById=new Map(sheet.views.map(v=>[v.id,v]));
 const segments=sheet.annotations.flatMap(a=>cadDrawingAnnotationGeometry(sheet,a).lines);
 for(const candidate of candidates){
  const view=viewById.get(candidate.viewId),a={...candidate,position:[0,0]},identity=key(sheet,a);if(!identity)continue;if(seen.has(identity)){report.duplicates++;continue;}
  // Mark even omitted candidates so coincident topology does not repeat work.
  seen.add(identity);if(report.added>=maxNew||sheet.annotations.length>=CAD_DRAWING_LIMITS.annotations){report.limited++;continue;}
  const measured=cadDrawingDimension(sheet,a),bounds=viewBox(sheet,view),mid=measured.points.length?paper(sheet,view,measured.points.reduce((acc,p)=>acc.map((n,k)=>n+p[k]/measured.points.length),[0,0])):view.position;
  if(bounds.min.some(v=>v<10)||bounds.max[0]>width-10||bounds.max[1]>height-10){report.noSpace++;continue;}
  const positions=[];let axis=a.axis;if(a.kind==='length'){const [p,q]=measured.points;axis=Math.abs(q[0]-p[0])>=Math.abs(q[1]-p[1])?'x':'y';}
  const labelWidth=Math.max(8,measured.text.length*1.9+3);
  if(axis==='y'&&a.anchors?.some(p=>p.point==='center'))for(const shift of [0,7,-7,14,-14,21,-21])positions.push([bounds.min[0]-.5-labelWidth/2,mid[1]+shift],[bounds.max[0]+.5+labelWidth/2,mid[1]+shift]);
  for(let lane=0;lane<14;lane++){
   const gap=8+lane*7;
   if(axis==='x')for(const shift of [0,7,-7,14,-14,21,-21])positions.push([mid[0]+shift,bounds.max[1]+gap],[mid[0]+shift,bounds.min[1]-gap]);
   else if(axis==='y')for(const shift of [0,7,-7,14,-14,21,-21])positions.push([bounds.min[0]-gap-labelWidth/2,mid[1]+shift],[bounds.max[0]+gap+labelWidth/2,mid[1]+shift]);
   else for(const y of [mid[1],mid[1]+lane*7,mid[1]-lane*7])positions.push([bounds.max[0]+8+labelWidth/2,y],[bounds.min[0]-8-labelWidth/2,y]);
  }
  const barriers=obstacles.filter((_,i)=>i>=sheet.views.length||sheet.views[i].id!==view.id);
  const position=positions.find(p=>{const box=textBox(measured.text,p);if(!(box.min[0]>=12&&box.max[0]<=width-12&&box.min[1]>=12&&box.max[1]<=height-12)||obstacles.some(o=>overlaps(box,o))||occupied.some(o=>overlaps(box,o))||segments.some(line=>crossesBox(line,box)))return false;const geometry=cadDrawingAnnotationGeometry(sheet,{...a,position:p});return !geometry.lines.some(line=>[...occupied,...barriers].some(box=>crossesBox(line,box)));});
  if(!position){report.noSpace++;continue;}
  const id=makeId();if(typeof id!=='string'||!id||ids.has(id))throw Error('Automatische Maßkennungen müssen eindeutig sein.');ids.add(id);a.id=id;a.position=position;attach(view,a);sheet.annotations.push(a);occupied.push(textBox(measured.text,position));segments.push(...cadDrawingAnnotationGeometry(sheet,a).lines);report.added++;
 }
 if(report.noSpace)warnings.add('Für einige Maße fehlt freier Platz. Ansichten verschieben oder den Papiermaßstab verkleinern und erneut bemaßen.');
 if(report.limited)warnings.add('Die Maßgrenze wurde erreicht. Weitere Maße bei Bedarf manuell ergänzen.');
 report.warnings=[...warnings];return {sheet:validateCadDrawingSheet(sheet),report};
}
