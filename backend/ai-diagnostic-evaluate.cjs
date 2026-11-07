const near=(a,b,t=.02)=>Number.isFinite(a)&&Math.abs(a-b)<=t;
const vector=(a,b)=>Array.isArray(a)&&a.length===b.length&&a.every((v,i)=>near(v,b[i]));
async function evaluate(caseId,before,after,lookup,geometry={}){
 const scale=geometry.scale??1,origin=geometry.origin??[0,0,0],scaled=v=>v.map(n=>n*scale),placed=v=>v.map((n,i)=>n*scale+origin[i]);
 const checks=[];const check=(name,passed,actual)=>checks.push({name,passed:!!passed,actual});
 const fixed=before.project.nodes.find(n=>n.name==='Unbeteiligtes Teil');
 check('Unbeteiligtes Teil vollständig erhalten',JSON.stringify(fixed)===JSON.stringify(after.project.nodes.find(n=>n.id===fixed.id)));
 const roots=after.scene.objects.filter(n=>!n.target.path.length&&n.id!==fixed.id&&!n.suppressed);
 check('Nur native sichtbare Volumenkörper',roots.length>0&&roots.every(n=>n.kind==='cad'&&n.solid&&!n.hidden&&n.solids===1));
 const size=(n,s)=>vector(n?.worldBounds?.size,s),center=(n,p)=>vector(n?.worldBounds?.center,p);
 if(caseId==='thread'){
  check('Drei koaxiale Abschnitte',roots.length===3&&[20,40,20].every((length,i)=>{const n=[...roots].sort((a,b)=>a.worldBounds.min[2]-b.worldBounds.min[2])[i];return size(n,scaled([16,16,length]))&&center(n,placed([0,0,[10,40,70][i]]));}));
  check('Zwei echte glatte Zapfen',roots.filter(n=>n.recipe?.type==='cylinder'&&near(n.volume,Math.PI*64*20*scale**3,.1)).length===2);
  const thread=roots.find(n=>n.recipe?.type==='thread'),p=thread?.recipe?.params;
  check('Native Trapezgewindequelle Ø16 ×40, Steigung4, rechts',p?.profile==='trapezoid'&&p?.hand==='right'&&near(p?.diameter,16*scale)&&near(p?.length,40*scale)&&near(p?.pitch,4*scale)&&p?.kind==='external',p);
 }else if(caseId==='pattern'){
  const original=before.project.nodes.find(n=>n.id!==fixed.id);check('Ausgangsteil vollständig erhalten',JSON.stringify(original)===JSON.stringify(after.project.nodes.find(n=>n.id===original.id)));
  check('Sechs gleichmäßig verteilte Zylinder',roots.length===6&&roots.every(n=>size(n,scaled([6,6,10]))&&near(n.worldBounds.center[2],5*scale+origin[2])&&near(Math.hypot(n.worldBounds.center[0]-origin[0],n.worldBounds.center[1]-origin[1]),20*scale)&&near(n.volume,Math.PI*90*scale**3))&&new Set(roots.map(n=>Math.round((Math.atan2(n.worldBounds.center[1]-origin[1],n.worldBounds.center[0]-origin[0])*180/Math.PI+360)%360))).size===6);
  const angles=roots.map(n=>(Math.atan2(n.worldBounds.center[1]-origin[1],n.worldBounds.center[0]-origin[0])*180/Math.PI+360)%360).sort((a,b)=>a-b);check('Winkelabstände60°',angles.length===6&&angles.every((a,i)=>near(((angles[(i+1)%6]-a)+360)%360,60,.1)));
 }else if(caseId==='drawing'){
  const original=before.project.nodes.find(n=>n.id!==fixed.id);check('Zeichnungskörper unverändert',JSON.stringify(original)===JSON.stringify(after.project.nodes.find(n=>n.id===original.id)));
  const drawings=after.project.drawings??[];const sheets=Array.isArray(drawings)?drawings:drawings.sheets??[];
  const sheet=sheets.find(s=>s.titleBlock?.title===(geometry.title??'Diagnosekörper'));check('A4 und Titelblock',sheet?.paper==='A4');
  check('Drei berechnete Ansichten des richtigen Körpers',['front','top','side'].every(kind=>sheet?.views?.some(v=>v.kind===kind&&v.sourceIds?.length===1&&v.sourceIds[0]===original.id&&v.projection?.kind==='cad-drawing-projection')));
 }else{
  const n=roots[0],dims=scaled(caseId==='drill'?[40,30,8]:caseId==='sketch'?[40,30,5]:[40,30,20]);
  check('Ein Körper mit geforderten Außenmaßen und Lage',roots.length===1&&size(n,dims)&&center(n,[origin[0],origin[1],origin[2]+dims[2]/2]));
  const volume=(caseId==='drill'?9600-Math.PI*9*8:caseId==='sketch'?6000-Math.PI*25*5:24000-36*26*18)*scale**3;
  check('Unabhängig erwartetes Materialvolumen',near(n?.volume,volume,.1),{actual:n?.volume,expected:volume});
  if(caseId!=='shell'&&n){try{const diameter=(caseId==='drill'?6:10)*scale;const result=await lookup('analysis',{revision:after.scene.revision,queries:[{id:'independentBore',engine:'cad',kind:'bore',options:{target:n.id,from:origin,to:[origin[0],origin[1],origin[2]+dims[2]],diameter}}]});const v=result.results?.[0]?.value;check('Native mittige Durchgangsbohrung',v?.clear===true&&v?.surroundingMaterial===true&&near(v?.diameter,diameter)&&near(v?.depth,dims[2])&&near(v?.endpointError,0)&&near(v?.axisOffset,0)&&v?.bottomPresent!==false,result);}catch(e){check('Native Bohrungsprüfung verfügbar',false,e.message);}}
  if(caseId==='sketch')check('Bearbeitbare Skizzenquelle',after.project.nodes.filter(n=>n.id!==fixed.id).some(n=>{const r=n.recipe,s=r?.sketch;return r?.type==='sketch'&&s?.kind==='profile'&&s.version===2&&Array.isArray(s.elements)&&s.elements.length>=2&&s.loops?.some(l=>l.role==='outer')&&s.loops?.some(l=>l.role==='hole');}));
  if(caseId==='shell'&&n){try{const r=await lookup('analysis',{revision:after.scene.revision,queries:[{id:'bottom',engine:'cad',kind:'rayPick',options:{ray:{origin:placed([0,0,40]),direction:[0,0,-1]},ids:[n.id]}},...[ [1,0,0],[-1,0,0],[0,1,0],[0,-1,0] ].map((direction,i)=>({id:'wall'+i,engine:'cad',kind:'rayPick',options:{ids:[n.id],ray:{origin:placed([0,0,10]),direction}}}))]});const v=r.results?.[0]?.value;check('Oben offen, Boden bei Z2',near(v?.point?.[2]??v?.hit?.point?.[2],2*scale+origin[2]),r);check('Vier Seitenwände2 mm',r.results?.slice(1).length===4&&r.results.slice(1).every((v,i)=>near(v.value?.t,(i<2?18:13)*scale)),r.results?.slice(1));}catch(e){check('Bodenprüfung verfügbar',false,e.message);}}
 }
 return {passed:checks.every(c=>c.passed),checks,scope:'Diskrete native Maße und erhaltene Quellen; keine Fertigungs- oder kontinuierliche Kollisionsfreigabe.'};
}
module.exports={evaluate};
