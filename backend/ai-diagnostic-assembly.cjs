const assemblyCase={id:'assembly',toolIds:['tool:mode-scale'],label:'Ein Teil aus einer Fräsbaugruppe',selectName:'X-Antrieb-Welle',prompt:'Ändere ausschließlich die ausgewählte X-Antrieb-Welle von Ø16 auf Ø14 mm. Sie steht senkrecht, ist 80 mm lang und hat ihren Mittelpunkt bei X0,Y0,Z40. Länge und Lage erhalten. Alle übrigen Teile der Fräsbaugruppe unverändert erhalten.',fixture:[
 {op:'create',type:'cylinder',name:'X-Antrieb-Welle',size:[16,16,80],pos:[0,0,40]},
 {op:'create',type:'box',name:'Maschinenbett',size:[300,200,15],pos:[0,0,-20]},
 ...Array.from({length:20},(_,i)=>({op:'create',type:i%3===0?'cylinder':'box',name:['Lagerbock','Schlitten','Motorhalter','Querstrebe'][i%4]+' '+(i+1),size:[12+i%4*3,12+i%4*3,15],pos:[-130+(i%5)*65,-90+Math.floor(i/5)*60,12]})),
 {op:'create',type:'box',name:'Unbeteiligtes Teil',size:[7,9,11],pos:[180,0,5.5]}
]};
function assemblyMatrix(full=false){
 const rows=[];for(const effort of ['low','high','max'])for(const workflow of ['agent','practice']){
  if(full)rows.push({caseId:'assembly',variant:'C',effort,stage:'full',workflow,sceneScope:'selection',startImage:true,experiment:'assembly',repeat:0});
  else for(const sceneScope of ['full','selection'])for(const startImage of [false,true]){
   if(workflow==='practice'&&sceneScope==='full'&&!startImage)continue;
   rows.push({caseId:'assembly',variant:'C',effort,stage:'start',workflow,sceneScope,startImage,experiment:'assembly',repeat:0});
  }
 }return rows;
}
function evaluateAssembly(before,after,geometry={}){
 const scale=geometry.scale??1,origin=geometry.origin??[0,0,0];
 const target=before.scene.selectionTargets[0].rootId,others=before.project.nodes.filter(n=>n.id!==target),part=after.scene.objects.find(n=>n.id===target&&!n.target.path.length);
 const near=(a,b)=>Number.isFinite(a)&&Math.abs(a-b)<.02;
 const checks=[{name:'Alle unbeteiligten Baugruppenteile vollständig erhalten',passed:others.every(n=>JSON.stringify(n)===JSON.stringify(after.project.nodes.find(x=>x.id===n.id)))},{name:'Keine zusätzlichen oder entfernten Teile',passed:before.project.nodes.length===after.project.nodes.length},{name:'Ausgewählte Welle nativ maßhaltig, Lage unverändert',passed:part?.kind==='cad'&&part.recipe?.type==='cylinder'&&part.solids===1&&part.solid&&!part.hidden&&[14,14,80].every((n,i)=>near(part.worldBounds.size[i],n*scale))&&[0,0,40].every((n,i)=>near(part.worldBounds.center[i],n*scale+origin[i]))&&near(part.volume,Math.PI*49*80*scale**3)}];
 return {passed:checks.every(c=>c.passed),checks,scope:'Native Abmessungen/Volumen und bytegleiche unbeteiligte Modellknoten der isolierten Baugruppe.'};
}
module.exports={assemblyCase,assemblyMatrix,evaluateAssembly};
