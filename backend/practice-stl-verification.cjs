const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');

async function verifyPracticeStl({js,directory,checks,before,parentSnapshot,liveDomain,livePractice,comparisonPolicy,variant}){
  const vertices=[[0,0,0],[20,0,0],[20,12,0],[0,12,0],[0,0,6],[20,0,6],[20,12,6],[0,12,6]];
  const triangles=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
  const faces=(variant==='open'?triangles.filter((_,i)=>i!==2&&i!==3):triangles)
   .map(triangle=>triangle.map(vertex=>vertices[vertex]));
  if(variant==='multi')faces.push(...faces.map(face=>face.map(([x,y,z])=>[x+35,y,z])));
  const bytes=Buffer.alloc(84+faces.length*50);
  bytes.writeUInt32LE(faces.length,80);
  faces.forEach((face,i)=>face.forEach((vertex,j)=>vertex.forEach((value,k)=>bytes.writeFloatLE(value,96+i*50+j*12+k*4))));
  const base64=bytes.toString('base64');
  const fixtureSha256=createHash('sha256').update(bytes).digest('hex');
  const click=id=>({kind:'ui',action:'click',target:'ui:id:'+id});
  const plan={version:1,title:'STL im Konverter prüfen und übernehmen',actions:[
   click('practice-file-1'),
   ...(variant==='open'?[click('converter-repair'),click('converter-run')]:
    [click('converter-run'),click('converter-import'),click('converter-apply'),click('stl-close')])
  ]};
  const quality=comparisonPolicy([
   {id:'solids',source:'Bekannte Anzahl getrennter STL-Volumenkörper',check:{kind:'solids',target:'$new',expected:variant==='multi'?2:1}},
   {id:'size',source:'Analytische Grenzen der Netzfixture',check:{kind:'size',target:'$new',space:'worldAxes',expected:[variant==='multi'?55:20,12,6],tolerance:.001}},
   {id:'volume',source:'Analytisches Volumen der STL-Quader',check:{kind:'volume',target:'$new',expected:variant==='multi'?2880:1440,tolerance:.001}},
   ...(variant==='multi'?[{id:'gap',source:'Bekannter freier Abstand zwischen den beiden STL-Quadern',check:{kind:'clearance',target:'$new',from:[27,6,-1],to:[27,6,7],diameter:5,tolerance:.001}}]:[])
  ],['solids','size']);
  const stlPrompt=variant==='multi'?'Konvertiere die beiden Teile dieser STL im sichtbaren Konverter in bearbeitbare CAD-Geometrie, ohne sie zusammenzukleben. Erhalte ihre Lage.':
   variant==='open'?'Warum lässt sich dieses STL-Netz nicht sauber konvertieren? Prüfe es im sichtbaren Konverter. Zeig die Reparatur, falls möglich, oder erkläre den tatsächlich gemeldeten Fehler.':
    'Zeig mir, wie ich diese STL im Konverter prüfe und in einen bearbeitbaren CAD-Körper umwandle.';
  const result=liveDomain==='stl'?await livePractice(stlPrompt,[
   {kind:'stl',name:'Quader.stl',mimeType:'model/stl',base64}
  ],{quality,allowNoResult:variant==='open'}):await js(`(async()=>{
   const controller=window.__cadTest.controller;
   const revision=controller.revision(),project=await controller.transactions.materialize();
   return window.offlinecadDesktop.startPractice({plan:${JSON.stringify(plan)},quality:${JSON.stringify(quality)},projectCopy:{revision,project,selection:[]},
    files:[{kind:'stl',name:'Quader.stl',mimeType:'model/stl',base64:${JSON.stringify(base64)}}]});
  })()`);
  fs.writeFileSync(path.join(directory,'stl-steps.json'),JSON.stringify(result,null,2));
  if(variant==='open'&&(liveDomain!=='stl'||!result.resultRef)){
   if(liveDomain!=='stl')assert.equal(result.ok,false);
   const diagnostic=liveDomain==='stl'?result.attempts.find(attempt=>attempt.report?.failedAction?.target==='ui:id:converter-run')?.reason:result.reason;
   assert.match(diagnostic??'',/open|closed|watertight|geschlossen|offen|repair|repar|Solid|topolog/i);
   if(liveDomain==='stl'){
    const reply=JSON.parse(result.reply.trim().replace(/^```(?:json)?\s*|\s*```$/g,''));
    assert.deepEqual(Object.keys(reply),['message'],'A diagnosis concludes without another practice plan');
    if(/6 mm.*0\.15 mm/.test(diagnostic)){
     assert.match(reply.message,/\b6(?:[.,]0+)?\s*mm\b/);
     assert.match(reply.message,/\b0[.,]15\s*mm\b/);
    }else assert.match(reply.message,/open|closed|watertight|geschlossen|offen|repair|repar|Solid|topolog/i);
   }
   assert.equal(result.resultRef,undefined);
   const after=await js(parentSnapshot);
   assert.equal(after.serialized,before.serialized);
   assert.deepEqual(after.visiblePreviewRoots,before.visiblePreviewRoots);
   for(const key of ['undo','redo','previews','revision'])assert.equal(after.state[key],before.state[key],key);
   checks.push('Known open STL is rejected with a real converter diagnostic',
    'The failed run yields no adoptable project result and preserves the parent');
   return {ok:true,checks,diagnostic};
  }
  assert(result.ok,result.reason);
  if(variant==='open')assert(result.attempts.some(attempt=>attempt.steps?.some(step=>step.target==='ui:id:converter-run'&&step.feedback)),
   'The actual local converter provides a successful repair result');
  if(liveDomain!=='stl')assert.equal(result.steps.length,plan.actions.length);
  if(quality&&liveDomain!=='stl')assert(result.report.quality?.items.every(item=>item.status==='passed'),'Every fixed STL criterion must run and pass');
  const verified=await js(`window.offlinecadDesktop.practiceProjectResult({action:'read',id:${JSON.stringify(result.resultRef)}})`);
  const originals=JSON.parse(before.serialized).nodes;
  const added=verified.nodes.filter(node=>!originals.some(original=>original.id===node.id));
  assert.equal(added.length,1);
  assert.equal(added[0].kind,'cad');
  const solids=variant==='multi'?2:1;
  assert.equal(added[0].stats.solids,solids);
  assert(Math.abs(added[0].stats.volume-1440*solids)<.001,'Analytical volume of the rectangular solids');
  const scene=await js(`window.__cadTest.controller.describe(${JSON.stringify(verified)})`);
  const bounds=scene.objects.find(object=>object.id===added[0].id).worldBounds;
  const expected=[variant==='multi'?55:20,12,6],size=bounds.size;
  assert(bounds.min.every(value=>Math.abs(value)<.001),'Preserved placement origin');
  assert(size.every((value,i)=>Math.abs(value-expected[i])<.001),'Independent native CAD bounds');
  let sections;
  if(variant==='multi'){
   const {default:load}=await import('../cad-kernel-build/runtime/formnaro_cad.js');
   const {readCadBrep,transformCad,cadRayHits}=await import('../src/cad-native-kernel.js');
   const oc=await load({print:()=>{},printErr:()=>{}}),source=readCadBrep(oc,added[0].brep.data);
   let world;
   try{
    world=transformCad(oc,source,added[0].transform);
    sections=cadRayHits(oc,world,{origin:[-2,6,3],direction:[1,0,0],far:60}).map(hit=>hit.point[0]).sort((a,b)=>a-b);
    assert.equal(sections.length,4);
    assert(sections.every((value,index)=>Math.abs(value-[0,20,35,55][index])<.001),'Native ray enters and exits both separated solids at their original positions');
   }finally{world?.delete();source.delete();}
  }
  const after=await js(parentSnapshot);
  assert.equal(after.serialized,before.serialized);
  assert.deepEqual(after.selection,before.selection);
  assert.deepEqual(after.visiblePreviewRoots,before.visiblePreviewRoots);
  for(const key of ['undo','redo','previews','revision'])assert.equal(after.state[key],before.state[key],key);
  checks.push('Explicit STL opened in the real local converter and analysed',
   'Native conversion, import preview and approval create a CAD solid in the child',
   'Native bounds and analytical volume independently verified',
   'Parent model, selection, history and visible preview preserved');
  return {ok:true,checks,size,solids,volume:added[0].stats.volume,fixtureSha256,...(sections?{sections}:{}),...(result.report.quality?{quality:result.report.quality}:{})};
}
module.exports={verifyPracticeStl};
