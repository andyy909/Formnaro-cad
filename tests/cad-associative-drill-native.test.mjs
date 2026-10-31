import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {mkdtemp,rm,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCadService} from '../src/cad-service.js';
import {cadBounds,cadVolume,cadClassifyPoint} from '../src/cad-native-kernel.js';
import {buildAssociativeBoxDrill} from '../src/cad-associative-drill.js';
import {createCadProject,parseCadProject,serializeCadProject} from '../src/cad-project.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {createCadToolsNative} from '../src/cad-tools-native.js';
import {cloneCadSources} from '../src/cad-source-clone.js';
import {dissolveCadGroup} from '../src/cad-affine.js';
import {cadSourceGeometryDigest,cadSourceGeometryKey} from '../src/cad-geometry-digest.js';
import {projectObjectGeometryDigest,projectObjectGeometryKey} from '../src/project-objects.js';
import {encodeFnpackProject,createFnpackResolver,stripGeometryIdentity} from '../src/cad-fnpack-data.js';

const moduleUrl=process.env.FORMNARO_CAD_MODULE?pathToFileURL(process.env.FORMNARO_CAD_MODULE):new URL('../cad-kernel-build/runtime/formnaro_cad.js',import.meta.url),loader=(await import(moduleUrl.href)).default,oc=await loader({print:()=>{},printErr:()=>{}});
const {writeFnpack,openFnpack}=createRequire(import.meta.url)('../backend/fnpack.cjs');
test('Native Quaderbohrung wächst bei Änderung 4 auf 12 mm mit',()=>{
 const service=createCadService({oc});try{
  const drill={sourceId:'body',boxId:'body',feature:'box-face-top',anchor:{point:[5,3,2],normal:[0,0,1]},sourceBounds:{min:[-20,-10,-2],max:[20,10,2]},termination:'through',kind:'plain',diameter:4,gap:0};
  for(const height of [4,12]){const body=service.nativeNode({type:'box',size:[40,20,height]},{id:'body'}),shape=buildAssociativeBoxDrill(oc,body,drill);try{assert.ok(Math.abs(cadVolume(oc,shape)-(800*height-4*Math.PI*height))<1e-5);assert.ok(Math.abs(cadBounds(oc,shape).size[2]-height)<1e-7);}finally{shape.delete();}}
 }finally{service.dispose();}
});
test('Verlorene oder nicht eindeutige Bezugsfläche blockiert native Bohrung',()=>{
 const service=createCadService({oc});try{const body=service.nativeNode({type:'box',size:[40,20,12]},{id:'body'}),drill={sourceId:'body',boxId:'body',feature:'box-face-top',anchor:{point:[20,3,2],normal:[0,0,1]},sourceBounds:{min:[-20,-10,-2],max:[20,10,2]},termination:'through',kind:'plain',diameter:4,gap:0};assert.throws(()=>buildAssociativeBoxDrill(oc,body,drill),{code:'CAD_DRILL_REFERENCE_CHANGED'});}finally{service.dispose();}
});

test('Bohrvorschau, Übernahme, Quelländerung, Undo und Speicherrundlauf',async()=>{
 const service=createCadService({oc});try{
  const body=service.nativeNode({type:'box',size:[40,20,4]},{id:'body'}),initial=createCadProject({nodes:[body]}),transactions=createCadTransactions({initial,build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions});
  const drill=await tools.previewDrill({id:'body',resultId:'part',reference:{ray:{origin:[5,3,30],direction:[0,0,-1]}},associative:true,diameter:4,revision:transactions.revision()});
  assert.equal(transactions.snapshot().nodes[0].id,'body');transactions.apply(drill);let result=transactions.snapshot();assert.equal(result.version,27);assert.equal(result.nodes[0].drill.sourceId,'body');
  assert.deepEqual(parseCadProject(serializeCadProject(result)),result);const cloned=cloneCadSources(result.nodes[0]);assert.equal(cloned.drill.sourceId,cloned.children[0].id);
  transactions.apply(await tools.previewEditSource({groupId:'part',path:['body'],patch:{recipe:{type:'box',size:[40,20,12]}},revision:transactions.revision()}));result=transactions.snapshot();assert.ok(Math.abs(result.nodes[0].stats.volume-(9600-48*Math.PI))<1e-5);
  transactions.undo();assert.ok(Math.abs(transactions.snapshot().nodes[0].stats.volume-(3200-16*Math.PI))<1e-5);transactions.redo();assert.ok(Math.abs(transactions.snapshot().nodes[0].stats.volume-(9600-48*Math.PI))<1e-5);
  const edit=await tools.previewEditDrill({id:'part',patch:{diameter:6},revision:transactions.revision()});assert.ok(Math.abs(edit.project.nodes[0].stats.volume-(9600-108*Math.PI))<1e-5);transactions.apply(edit);transactions.undo();assert.ok(Math.abs(transactions.snapshot().nodes[0].stats.volume-(9600-48*Math.PI))<1e-5);
 }finally{service.dispose();}
});

test('Vier verknüpfte Durchgangslöcher folgen gemeinsamer Quelländerung',async()=>{
 const service=createCadService({oc});try{
  const body=service.nativeNode({type:'box',size:[40,20,4]},{id:'body'}),transactions=createCadTransactions({initial:createCadProject({nodes:[body]}),build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions});
  let target='body';for(const [i,[x,y]] of [[-10,-4],[10,-4],[-10,4],[10,4]].entries()){
   const resultId='part'+(i+1);transactions.apply(await tools.previewDrill({id:target,resultId,reference:{ray:{origin:[x,y,30],direction:[0,0,-1]}},associative:true,diameter:4,revision:transactions.revision()}));target=resultId;
  }
  assert.ok(Math.abs(transactions.snapshot().nodes[0].stats.volume-(3200-64*Math.PI))<1e-5);
  transactions.apply(await tools.previewEditSource({groupId:'part4',path:['part3','part2','part1','body'],patch:{recipe:{type:'box',size:[40,20,12]}},revision:transactions.revision()}));
  assert.ok(Math.abs(transactions.snapshot().nodes[0].stats.volume-(9600-192*Math.PI))<1e-5);
  transactions.undo();assert.ok(Math.abs(transactions.snapshot().nodes[0].stats.volume-(3200-64*Math.PI))<1e-5);transactions.redo();assert.ok(Math.abs(transactions.snapshot().nodes[0].stats.volume-(9600-192*Math.PI))<1e-5);
 }finally{service.dispose();}
});

test('Frühere Bohrung gezielt versetzen und ändern; abhängige Bohrungen bleiben geschützt',async()=>{
 const service=createCadService({oc});try{
  const body=service.nativeNode({type:'box',size:[40,20,4]},{id:'body'}),transactions=createCadTransactions({initial:createCadProject({nodes:[body]}),build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions});
  let target='body';for(const [i,[x,y]] of [[-10,-4],[10,-4],[-10,4],[10,4]].entries()){const resultId='part'+(i+1);transactions.apply(await tools.previewDrill({id:target,resultId,reference:{ray:{origin:[x,y,30],direction:[0,0,-1]}},associative:true,diameter:4,revision:transactions.revision()}));target=resultId;}
  const before=transactions.snapshot(),revision=transactions.revision(),path=['part3','part2','part1'];
  const preview=await tools.previewEditDrill({id:'part4',path,patch:{diameter:6},positionReference:{ray:{origin:[-5,-4,30],direction:[0,0,-1]}},revision});assert.deepEqual(transactions.snapshot(),before);transactions.apply(preview);const after=transactions.snapshot(),node=after.nodes[0];assert.deepEqual(node.drill,before.nodes[0].drill);assert.deepEqual(node.children[0].drill,before.nodes[0].children[0].drill);assert.equal(node.children[0].children[0].children[0].drill.diameter,6);
  const shape=service.worldShape(node);try{assert.equal(cadClassifyPoint(oc,shape,[-10,-4,0]),'inside');assert.equal(cadClassifyPoint(oc,shape,[-5,-4,0]),'outside');assert.equal(cadClassifyPoint(oc,shape,[10,-4,0]),'outside');}finally{shape.delete();}
  transactions.undo();assert.deepEqual(transactions.snapshot(),before);transactions.redo();assert.deepEqual(transactions.snapshot(),after);assert.deepEqual(parseCadProject(serializeCadProject(after)),after);
  const copied=cloneCadSources(after.nodes[0]);let cloned=copied;while(cloned.drill){assert.equal(cloned.drill.sourceId,cloned.children[0].id);let leaf=cloned;while(leaf.drill)leaf=leaf.children[0];assert.equal(cloned.drill.boxId,leaf.id);cloned=cloned.children[0];}assert.equal(cadSourceGeometryDigest(copied),cadSourceGeometryDigest(after.nodes[0]));
  const encoded=encodeFnpackProject(after),blocks=new Map(encoded.blocks.map(b=>[b.sha256,b.bytes])),loaded=await createFnpackResolver({readBlock:async hash=>blocks.get(hash)}).hydrate(encoded.project);assert.deepEqual(stripGeometryIdentity(loaded),after);
  assert.throws(()=>tools.previewEditDrill({id:'part4',path:['missing'],patch:{diameter:3},revision:transactions.revision()}),/nicht mehr vorhanden/);
  assert.throws(()=>tools.previewEditDrill({id:'part4',path,positionReference:{ray:{origin:[-5,0,-30],direction:[0,0,1]}},revision:transactions.revision()}),/ursprünglichen Quaderfläche/);
  await assert.rejects(()=>tools.previewEditDrill({id:'part4',path,patch:{diameter:6},positionReference:{ray:{origin:[7.9,-4,30],direction:[0,0,-1]}},revision:transactions.revision()}),/eindeutig|Fläche/);assert.deepEqual(transactions.snapshot(),after);
  assert.throws(()=>tools.previewEditDrill({id:'part4',path,patch:{diameter:4},revision}),{code:'STALE_REVISION'});
 }finally{service.dispose();}
});

test('Bohrposition auf gedrehter Quaderquelle folgt dem lokalen Koordinatensystem',async()=>{
 const service=createCadService({oc});try{
  const transform=[0,1,0,0,-1,0,0,0,0,0,1,0,30,20,0,1],body=service.nativeNode({type:'box',size:[40,20,4]},{id:'body',transform}),transactions=createCadTransactions({initial:createCadProject({nodes:[body]}),build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions});
  transactions.apply(await tools.previewDrill({id:'body',resultId:'part',reference:{ray:{origin:[34,10,30],direction:[0,0,-1]}},associative:true,diameter:4,revision:transactions.revision()}));
  transactions.apply(await tools.previewEditDrill({id:'part',positionReference:{ray:{origin:[34,15,30],direction:[0,0,-1]}},revision:transactions.revision()}));const anchor=transactions.snapshot().nodes[0].drill.anchor.point;assert.ok(Math.abs(anchor[0]+5)<1e-6&&Math.abs(anchor[1]+4)<1e-6);
  const shape=service.worldShape(transactions.snapshot().nodes[0]);try{assert.equal(cadClassifyPoint(oc,shape,[34,10,0]),'inside');assert.equal(cadClassifyPoint(oc,shape,[34,15,0]),'outside');}finally{shape.delete();}
 }finally{service.dispose();}
});

test('Verknüpftes Bohrungsraster aktualisiert alle Löcher und weist Überlappung ab',async()=>{
 const service=createCadService({oc});try{
  const body=service.nativeNode({type:'box',size:[40,20,4]},{id:'body'}),transactions=createCadTransactions({initial:createCadProject({nodes:[body]}),build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions});
  transactions.apply(await tools.previewDrill({id:'body',resultId:'part',reference:{ray:{origin:[-10,-4,30],direction:[0,0,-1]}},associative:true,diameter:4,revision:transactions.revision()}));
  const pattern={version:1,kind:'grid',columns:2,rows:2,step:[20,0],rowStep:[0,8],skip:[]},before=transactions.snapshot();transactions.apply(await tools.previewEditDrill({id:'part',patch:{pattern},revision:transactions.revision()}));
  assert.ok(Math.abs(transactions.snapshot().nodes[0].stats.volume-(3200-64*Math.PI))<1e-5);const shape=service.worldShape(transactions.snapshot().nodes[0]);try{for(const [x,y]of [[-10,-4],[10,-4],[-10,4],[10,4]])assert.equal(cadClassifyPoint(oc,shape,[x,y,0]),'outside');}finally{shape.delete();}
  const four=transactions.snapshot();transactions.undo();assert.deepEqual(transactions.snapshot(),before);transactions.redo();assert.deepEqual(transactions.snapshot(),four);
  transactions.apply(await tools.previewEditSource({groupId:'part',path:['body'],patch:{recipe:{type:'box',size:[40,20,12]}},revision:transactions.revision()}));assert.ok(Math.abs(transactions.snapshot().nodes[0].stats.volume-(9600-192*Math.PI))<1e-5);
  transactions.apply(await tools.previewEditDrill({id:'part',patch:{pattern:{...pattern,skip:[2]}},revision:transactions.revision()}));assert.ok(Math.abs(transactions.snapshot().nodes[0].stats.volume-(9600-144*Math.PI))<1e-5);
  const stable=transactions.snapshot();await assert.rejects(()=>tools.previewEditDrill({id:'part',patch:{pattern:{...pattern,step:[2,0]}},revision:transactions.revision()}),/überlappen/);assert.deepEqual(transactions.snapshot(),stable);
  await assert.rejects(()=>tools.previewEditDrill({id:'part',patch:{pattern:{...pattern,rowStep:[0,12]}},revision:transactions.revision()}),/rand/i);assert.deepEqual(transactions.snapshot(),stable);
  assert.deepEqual(parseCadProject(serializeCadProject(stable)),stable);const clone=cloneCadSources(stable.nodes[0]);assert.deepEqual(clone.drill.pattern,stable.nodes[0].drill.pattern);assert.equal(clone.drill.boxId,clone.children[0].id);
 }finally{service.dispose();}
});

test('Reihe, Lochkreis und Spiegelung erzeugen die vorgesehenen nativen Bohrungen',async()=>{
 const service=createCadService({oc});try{
  for(const [pattern,positions]of [
   [{version:1,kind:'line',count:3,step:[8,0],skip:[]},[[-10,0],[-2,0],[6,0]]],
   [{version:1,kind:'circle',count:4,center:[5,0],skip:[]},[[-10,0],[-5,-5],[0,0],[-5,5]]],
   [{version:1,kind:'mirror',axis:'u',offset:10,skip:[]},[[-10,0],[10,0]]]
  ]){
   const body=service.nativeNode({type:'box',size:[40,20,4]},{id:'body'}),transactions=createCadTransactions({initial:createCadProject({nodes:[body]}),build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions});
   transactions.apply(await tools.previewDrill({id:'body',resultId:'part',reference:{ray:{origin:[-10,0,30],direction:[0,0,-1]}},associative:true,diameter:4,revision:transactions.revision()}));transactions.apply(await tools.previewEditDrill({id:'part',patch:{pattern},revision:transactions.revision()}));
   const n=transactions.snapshot().nodes[0],shape=service.worldShape(n);try{for(const [x,y]of positions)assert.equal(cadClassifyPoint(oc,shape,[x,y,0]),'outside');assert.ok(Math.abs(cadVolume(oc,shape)-(3200-16*Math.PI*positions.length))<1e-5);}finally{shape.delete();}
  }
 }finally{service.dispose();}
});

test('Einzelne Musterbohrung wird ohne Geometrieänderung gelöst und unabhängig bearbeitet',async()=>{
 const service=createCadService({oc});try{
  const body=service.nativeNode({type:'box',size:[40,20,4]},{id:'body'}),transactions=createCadTransactions({initial:createCadProject({nodes:[body]}),build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions});
  transactions.apply(await tools.previewDrill({id:'body',resultId:'part',reference:{ray:{origin:[-10,0,30],direction:[0,0,-1]}},associative:true,diameter:4,revision:transactions.revision()}));const pattern={version:1,kind:'line',count:3,step:[8,0],skip:[]};transactions.apply(await tools.previewEditDrill({id:'part',patch:{pattern},revision:transactions.revision()}));const before=transactions.snapshot(),volume=before.nodes[0].stats.volume;
  assert.throws(()=>tools.previewDetachDrillPattern({id:'part',index:0,revision:transactions.revision()}),/Ursprung/);
  const preview=await tools.previewDetachDrillPattern({id:'part',index:1,revision:transactions.revision()});assert.deepEqual(transactions.snapshot(),before);assert.ok(Math.abs(preview.project.nodes[0].stats.volume-volume)<1e-5);transactions.apply(preview);const detached=transactions.snapshot(),root=detached.nodes[0];assert.equal(root.id,'part');assert.equal(root.drill.pattern,undefined);assert.deepEqual(root.drill.anchor.point,[-2,0,2]);assert.deepEqual(root.children[0].drill.pattern.skip,[1]);
  transactions.apply(await tools.previewEditDrill({id:'part',patch:{diameter:6},revision:transactions.revision()}));assert.ok(Math.abs(transactions.snapshot().nodes[0].stats.volume-(3200-68*Math.PI))<1e-5);assert.equal(transactions.snapshot().nodes[0].children[0].drill.diameter,4);
  transactions.undo();assert.deepEqual(transactions.snapshot(),detached);transactions.undo();assert.deepEqual(transactions.snapshot(),before);transactions.redo();assert.deepEqual(transactions.snapshot(),detached);assert.deepEqual(parseCadProject(serializeCadProject(detached)),detached);
  const encoded=encodeFnpackProject(detached),blocks=new Map(encoded.blocks.map(b=>[b.sha256,b.bytes])),loaded=await createFnpackResolver({readBlock:async hash=>blocks.get(hash)}).hydrate(encoded.project);assert.deepEqual(stripGeometryIdentity(loaded),detached);assert.ok(Math.abs((await service.rebuild(loaded)).nodes[0].stats.volume-volume)<1e-5);
 }finally{service.dispose();}
});

test('Durchgang mit Kopfaufnahme behält bei Dickenänderung die feste Kopftiefe',async()=>{
 const service=createCadService({oc});try{
  const body=service.nativeNode({type:'box',size:[40,20,4]},{id:'body'}),transactions=createCadTransactions({initial:createCadProject({nodes:[body]}),build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions});
  transactions.apply(await tools.previewDrill({id:'body',resultId:'part',reference:{ray:{origin:[5,3,30],direction:[0,0,-1]}},associative:true,kind:'counterbore',diameter:4,headDiameter:8,headDepth:2,revision:transactions.revision()}));
  assert.ok(Math.abs(transactions.snapshot().nodes[0].stats.volume-(3200-40*Math.PI))<1e-5);
  transactions.apply(await tools.previewEditSource({groupId:'part',path:['body'],patch:{recipe:{type:'box',size:[40,20,12]}},revision:transactions.revision()}));
  assert.ok(Math.abs(transactions.snapshot().nodes[0].stats.volume-(9600-72*Math.PI))<1e-5);
  assert.equal(transactions.snapshot().nodes[0].drill.headDepth,2);
 }finally{service.dispose();}
});

test('Verknüpfte Quellen und gespeicherte Referenzen bleiben geschützt',async()=>{
 const service=createCadService({oc});try{
  const body=service.nativeNode({type:'box',size:[40,20,4]},{id:'body'}),transactions=createCadTransactions({initial:createCadProject({nodes:[body]}),build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions});
  transactions.apply(await tools.previewDrill({id:'body',resultId:'part',reference:{ray:{origin:[5,3,30],direction:[0,0,-1]}},associative:true,diameter:4,revision:transactions.revision()}));const valid=transactions.snapshot();
  assert.throws(()=>dissolveCadGroup(valid.nodes[0]),/Bohrung/);
  for(const field of ['sourceId','boxId']){const corrupted=structuredClone(valid);corrupted.nodes[0].drill[field]='unknown';const text=JSON.stringify(corrupted);assert.throws(()=>parseCadProject(text),/Projektformat 30/);const repair=parseCadProject(text,{repairSources:true});assert.equal(repair.version,30);assert.equal(repair.nodes[0].drill[field],'unknown');assert.deepEqual(repair.nodes[0].brep,corrupted.nodes[0].brep);await assert.rejects(service.rebuild(repair),{code:'CAD_DRILL_REFERENCE_CHANGED'});assert.throws(()=>service.exportStep(repair),{code:'CAD_DRILL_SOURCE_REASSIGN_REQUIRED'});const invalid=structuredClone(corrupted);invalid.nodes[0].drill.diameter=-1;assert.throws(()=>parseCadProject(JSON.stringify(invalid),{repairSources:true}));}
  const old=structuredClone(valid);old.version=26;assert.throws(()=>parseCadProject(JSON.stringify(old)),/27|Format/);
  const locked=structuredClone(valid);locked.nodes[0].children[0].locked=true;const lockedStore=createCadTransactions({initial:locked,build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),lockedTools=createCadToolsNative({oc,service,transactions:lockedStore}),before=JSON.stringify(lockedStore.snapshot());
  assert.throws(()=>lockedTools.previewEditDrill({id:'part',patch:{diameter:6},revision:lockedStore.revision()}),{code:'LOCKED_CAD_OBJECT'});assert.equal(JSON.stringify(lockedStore.snapshot()),before);
  await assert.rejects(()=>lockedTools.previewDrill({id:'part',reference:{ray:{origin:[-5,3,30],direction:[0,0,-1]}},associative:true,revision:lockedStore.revision()}),{code:'LOCKED_CAD_OBJECT'});assert.equal(JSON.stringify(lockedStore.snapshot()),before);
 }finally{service.dispose();}
});

test('Bis Fläche speichert explizite gegenüberliegende Fläche und folgt Quaderänderung',async()=>{
 const service=createCadService({oc});try{
  const body=service.nativeNode({type:'box',size:[40,20,4]},{id:'body'}),transactions=createCadTransactions({initial:createCadProject({nodes:[body]}),build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions});
  const args={id:'body',resultId:'part',reference:{ray:{origin:[5,3,30],direction:[0,0,-1]}},stopReference:{ray:{origin:[-5,-3,-30],direction:[0,0,1]}},associative:true,termination:'plane',diameter:4,revision:transactions.revision()};
  await assert.rejects(()=>tools.previewDrill({...args,stopReference:undefined}),/Zielfläche/);
  transactions.apply(await tools.previewDrill(args));let node=transactions.snapshot().nodes[0];assert.equal(node.drill.stop.feature,'box-face-bottom');assert.equal(node.drill.termination,'plane');assert.ok(Math.abs(node.stats.volume-(3200-16*Math.PI))<1e-5);
  const before=transactions.snapshot();transactions.apply(await tools.previewEditSource({groupId:'part',path:['body'],patch:{recipe:{type:'box',size:[40,20,12]}},revision:transactions.revision()}));node=transactions.snapshot().nodes[0];assert.ok(Math.abs(node.stats.volume-(9600-48*Math.PI))<1e-5);transactions.undo();assert.deepEqual(transactions.snapshot(),before);transactions.redo();
  const bad={ray:{origin:[50,0,0],direction:[-1,0,0]}};await assert.rejects(()=>tools.previewEditDrill({id:'part',patch:{termination:'plane'},stopReference:bad,revision:transactions.revision()}),/parallel|Zielfläche|Bohrung/);
  const edit=await tools.previewEditDrill({id:'part',patch:{termination:'plane',diameter:6},stopReference:{ray:{origin:[-5,-3,-30],direction:[0,0,1]}},revision:transactions.revision()});transactions.apply(edit);assert.ok(Math.abs(transactions.snapshot().nodes[0].stats.volume-(9600-108*Math.PI))<1e-5);
 }finally{service.dispose();}
});

test('Nachträglicher Wechsel zu Bis Fläche erfordert expliziten Zielbezug',async()=>{
 const service=createCadService({oc});try{
  const body=service.nativeNode({type:'box',size:[40,20,4]},{id:'body'}),transactions=createCadTransactions({initial:createCadProject({nodes:[body]}),build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions});
  transactions.apply(await tools.previewDrill({id:'body',resultId:'part',reference:{ray:{origin:[5,3,30],direction:[0,0,-1]}},associative:true,through:false,depth:2,diameter:4,revision:transactions.revision()}));
  assert.throws(()=>tools.previewEditDrill({id:'part',patch:{termination:'plane'},revision:transactions.revision()}),/Zielfläche/);
  transactions.apply(await tools.previewEditDrill({id:'part',patch:{termination:'plane'},stopReference:{ray:{origin:[-5,-3,-30],direction:[0,0,1]}},revision:transactions.revision()}));assert.equal(transactions.snapshot().nodes[0].drill.stop.feature,'box-face-bottom');assert.ok(Math.abs(transactions.snapshot().nodes[0].stats.volume-(3200-16*Math.PI))<1e-5);
 }finally{service.dispose();}
});

test('Bohrungsrezept bestimmt Quellidentität, Kopie und FNPACK-Rundlauf',async()=>{
 const service=createCadService({oc});try{
  const body=service.nativeNode({type:'box',size:[40,20,4]},{id:'body'}),transactions=createCadTransactions({initial:createCadProject({nodes:[body]}),build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions});
  transactions.apply(await tools.previewDrill({id:'body',resultId:'part',reference:{ray:{origin:[5,3,30],direction:[0,0,-1]}},associative:true,diameter:4,revision:transactions.revision()}));const project=transactions.snapshot(),node=project.nodes[0],changed=structuredClone(node);changed.drill.diameter=6;
  assert.notEqual(cadSourceGeometryDigest(node),cadSourceGeometryDigest(changed));assert.notEqual(cadSourceGeometryKey(node),cadSourceGeometryKey(changed));assert.notEqual(projectObjectGeometryDigest(node),projectObjectGeometryDigest(changed));assert.notEqual(projectObjectGeometryKey(node),projectObjectGeometryKey(changed));
  const cloned=cloneCadSources(node);assert.equal(cadSourceGeometryDigest(node),cadSourceGeometryDigest(cloned));assert.equal(projectObjectGeometryDigest(node),projectObjectGeometryDigest(cloned));
  const downstream={...structuredClone(node),id:'downstream',source:'modeling',children:[changed],modeling:{version:1,kind:'shell',faceIndices:[1],thickness:1,sourceSignature:cadSourceGeometryDigest(node)}};delete downstream.drill;delete downstream.operation;
  await assert.rejects(()=>service.rebuild(createCadProject({nodes:[downstream]})),{code:'CAD_MODELING_REFERENCE_CHANGED'});
  const encoded=encodeFnpackProject(project);assert.equal(encoded.project.version,27);const blocks=new Map(encoded.blocks.map(b=>[b.sha256,b.bytes])),loaded=await createFnpackResolver({readBlock:async hash=>blocks.get(hash)}).hydrate(encoded.project);assert.deepEqual(stripGeometryIdentity(loaded),project);assert.equal(cadSourceGeometryDigest(loaded.nodes[0]),cadSourceGeometryDigest(node));
  const directory=await mkdtemp(join(tmpdir(),'formnaro-drill-fnpack-')),file=join(directory,'bohrung.fnpack');let reopened;try{await writeFnpack(file,{project:encoded.project,blocks:encoded.blocks});reopened=await openFnpack(file);const actual=await createFnpackResolver({readBlock:hash=>reopened.read(hash)}).hydrate(reopened.index.project);assert.deepEqual(stripGeometryIdentity(actual),project);assert.equal(cadSourceGeometryDigest(actual.nodes[0]),cadSourceGeometryDigest(node));}finally{await reopened?.close();await rm(file,{force:true});await rmdir(directory);}
 }finally{service.dispose();}
});
