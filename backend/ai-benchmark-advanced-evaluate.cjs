const near=(a,b,t=.04)=>Number.isFinite(a)&&Math.abs(a-b)<=t;
const vec=(a,b)=>Array.isArray(a)&&a.length===b.length&&a.every((x,i)=>near(x,b[i]));
const canonical=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
async function evaluateAdvanced(task,before,after,lookup,replay){
 const checks=[],check=(name,passed,actual)=>checks.push({name,passed:!!passed,...(actual===undefined?{}:{actual})});
 const original=before.project.nodes.find(n=>n.name==='Aufgabenteil'),protectedNodes=before.project.nodes.filter(n=>n.id!==original?.id);
 check('Alle unbeteiligten Quellen und Zustände erhalten',!!original&&protectedNodes.length>0&&protectedNodes.every(n=>canonical(n)===canonical(after.project.nodes.find(a=>a.id===n.id))));
 check('Sichtbare Ausführung abgeschlossen',replay?.ok===true&&replay.steps?.some(s=>s.observation));
 const protectedIds=new Set(protectedNodes.map(n=>n.id)),roots=after.scene.objects.filter(o=>!o.target.path.length&&!o.suppressed&&!protectedIds.has(o.id));
 check('Nur sichtbare gültige native Einzelkörper',roots.length>0&&roots.every(o=>o.kind==='cad'&&o.solid&&o.solids===1&&!o.hidden));
 const body=roots[0],one=(size,center,volume)=>{
  check('Genau ein Körper mit richtigen Außenmaßen und Lage',roots.length===1&&vec(body?.worldBounds?.size,size)&&vec(body?.worldBounds?.center,center));
  check('Unabhängig berechnetes Materialvolumen',near(body?.volume,volume,.25),{actual:body?.volume,expected:volume});
 };
 const rays=async(points,direction=[0,0,-1])=>{
  if(!body)return points.map(()=>undefined);
  const r=await lookup('analysis',{revision:after.scene.revision,queries:points.map((origin,i)=>({id:'probe'+i,engine:'cad',kind:'rayPick',options:{ids:[body.id],ray:{origin,direction}}}))});
  if(r.results?.length!==points.length)throw Error('Unvollständige native Proben.');
  return r.results.map(r=>r.value?.point??r.value?.hit?.point);
 };
 const bores=async(items,bodies=[body])=>{
  if(bodies.some(b=>!b))return false;
  const queries=bodies.flatMap((b,j)=>items.map((p,i)=>({id:'bore'+j+'-'+i,engine:'cad',kind:'bore',options:{target:b.id,from:p.from,to:p.to,diameter:p.diameter}})));
  const r=await lookup('analysis',{revision:after.scene.revision,queries});
  return r.results?.length===queries.length&&r.results.every((r,i)=>{const v=r.value,p=queries[i].options;return v?.clear===true&&v.surroundingMaterial===true&&near(v.diameter,p.diameter)&&near(v.depth,Math.hypot(...p.to.map((x,k)=>x-p.from[k])))&&near(v.axisOffset,0)&&near(v.endpointError,0)&&v.bottomPresent!==false;});
 };
 try{
 if(task.id==='advanced-01'){
  one([60,40,10],[10,-5,10],24000-10*Math.PI*(16+9+25));
  check('Alle drei asymmetrischen Bohrungen nativ bestätigt',await bores([[-8,-15,8],[24,-15,6],[10,6,10]].map(([x,y,diameter])=>({from:[x,y,5],to:[x,y,15],diameter}))));
 }else if(task.id==='advanced-02'){
  one([70,50,8],[7,-9,8],28000-8*(18*12+12*20));
  const p=await rays([[-10,-14,40],[-1.1,-8.1,40],[24,-4,40],[29.9,5.9,40],[7,-9,40],[-19.1,-14,40],[30.1,-4,40]]);
  check('Zwei getrennte rechteckige Durchbrüche und Materialstege',p.slice(0,4).every(x=>!x)&&p.slice(4).every(x=>near(x?.[2],12)));
 }else if(task.id==='advanced-03'){
  const expected=Array.from({length:8},(_,i)=>[7+30*Math.cos(i*Math.PI/4),7+30*Math.sin(i*Math.PI/4),9]);
  check('Acht Hülsen an genau den acht versetzten Winkelpositionen',roots.length===8&&expected.every(p=>roots.filter(b=>vec(b.worldBounds?.center,p)).length===1)&&roots.every(b=>vec(b.worldBounds?.size,[10,10,12])&&near(b.volume,252*Math.PI,.25)));
  let okay=roots.length===8;
  for(const b of roots){const [x,y]=b.worldBounds.center;okay=(await bores([{from:[x,y,3],to:[x,y,15],diameter:4}],[b]))&&okay;}
  check('Jede Hülse mit echter koaxialer Durchgangsbohrung',okay);
 }else if(task.id==='advanced-04'){
  one([60,40,24],[10,-5,12],32000-216*Math.PI);
  const p=await rays([[-16,-5,40],[20,-5,40],[-10,-5,40]]);
  check('Stufe links Z24, Grundplatte rechts Z8, Loch offen',near(p[0]?.[2],24)&&near(p[1]?.[2],8)&&!p[2]);
  check('Ø6 durch die gesamte Stufenhöhe',await bores([{from:[-10,-5,0],to:[-10,-5,24],diameter:6}]));
 }else if(task.id==='advanced-05'){
  one([60,40,30],[10,-5,18],72000-54*34*27-10*12*3);
  const top=await rays([[10,-5,50],[-18,-5,50],[38,-5,50],[10,13,50],[10,-23,50]]);
  check('Oben offen, Boden3 mm und vier obere Wandränder erhalten',near(top[0]?.[2],6)&&top.slice(1).every(p=>near(p?.[2],33)));
  const side=await rays([[10,-40,18],[16,-40,18],[10,-40,11],[10,-40,25]],[0,1,0]);
  check('Vordere Öffnung 10×12, seitliches Material und Rückwand erhalten',near(side[0]?.[1],12)&&side.slice(1).every(p=>near(p?.[1],-25)));
 }else if(task.id==='advanced-06'){
  one([70,50,20],[10,-5,10],70000-20*16*8-16*Math.PI*12);
  const p=await rays([[-5,-5,40],[4.9,2.9,40],[28,8,40],[32.1,8,40],[5.1,-5,40]]);
  check('Taschenboden Z12, Bohrungsboden Z8 und übrige Oberseite Z20',near(p[0]?.[2],12)&&near(p[1]?.[2],12)&&near(p[2]?.[2],8)&&near(p[3]?.[2],20)&&near(p[4]?.[2],20));
 }else if(task.id==='advanced-07'){
  one([60,40,6],[7,-9,7],12600-150*Math.PI);
  const p=await rays([[27,3,40],[7,3,40],[27,-14,40]]);
  check('L-Aussparung und beide Schenkel an richtigen Weltpositionen',!p[0]&&near(p[1]?.[2],10)&&near(p[2]?.[2],10));
  check('Beide Skizzenlöcher mit richtigen Durchmessern und Weltlagen',await bores([[-8,-9,8],[22,-19,6]].map(([x,y,diameter])=>({from:[x,y,4],to:[x,y,10],diameter}))));
  const sketch=after.project.nodes.find(n=>n.id===body?.id)?.recipe;
  check('Bearbeitbare Skizzenquelle mit Außenkontur und zwei Innenkonturen',sketch?.type==='sketch'&&sketch.sketch?.kind==='profile'&&sketch.sketch.loops?.filter(l=>l.role==='outer').length===1&&sketch.sketch.loops.filter(l=>l.role==='hole').length===2);
 }else if(task.id==='advanced-08'){
  check('Vollständiger Ausgangskörper unverändert',canonical(original)===canonical(after.project.nodes.find(n=>n.id===original?.id))&&roots.length===1);
  const drawings=after.project.drawings,sheets=Array.isArray(drawings)?drawings:drawings?.sheets??[],sheet=sheets.find(s=>s.titleBlock?.title==='Aufbauhalter');
  check('A3 quer, Maßstab1:2, Nummer AB-08, Revision B',sheet?.paper==='A3'&&sheet.orientation==='landscape'&&near(sheet.scale,.5)&&sheet.titleBlock.number==='AB-08'&&sheet.titleBlock.revision==='B');
  const views=sheet?.views??[],valid=v=>v.sourceIds?.length===1&&v.sourceIds[0]===original?.id&&v.projection?.kind==='cad-drawing-projection'&&v.projection.curves?.length>0;
  check('Vier berechnete Ansichten einschließlich Schnitt Y−5',['front','top','side','section'].every(kind=>views.filter(v=>v.kind===kind&&valid(v)&&(kind!=='section'||v.section?.axis===1&&near(v.section.offset,-5))).length===1));
  const {cadDrawingDimension,cadDrawingProblems,cadDrawingSourceSignatures}=await import('../src/cad-drawing-data.js');
  const annotations=sheet?.annotations??[],measured=annotations.filter(a=>a.kind!=='label'),problems=sheet?cadDrawingProblems(sheet,{sourceSignatures:cadDrawingSourceSignatures(after.project)}):[];
  const dims=measured.map(a=>{try{return cadDrawingDimension(sheet,a);}catch{return null;}});
  check('Mindestens drei gültige geometrisch verknüpfte Maße',measured.length>=3&&measured.every(a=>!a.unresolved&&a.curveIds?.length&&a.sourceSignatures?.length)&&dims.every(d=>Number.isFinite(d?.value)&&d.value>0)&&!problems.length,{dimensions:measured.length,problems});
 }else check('Aufbau-Prüfer vorhanden',false);
 }catch(error){check('Native Gegenprüfung ausführbar',false,String(error.message));}
 return {passed:checks.every(c=>c.passed),checks,scope:'Fester Aufbau-Benchmark: native Maße, Volumen, Durchbrüche/Blindböden, erhaltene Quellen und gemessene Zeichnungen.'};
}
module.exports={evaluateAdvanced};
