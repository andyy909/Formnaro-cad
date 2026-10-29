import {cadAIRequestContext} from '../src/cad-ai-program-context.js';
import {readAIModelStrictness} from '../src/ai-model-strictness.js';
import {appendAIFeatureEdits} from '../src/cad-ai-feature-report.js';
import {trackedAIAnalysis} from '../src/cad-ai-analysis-access.js';
import {createAIUsagePanel} from '../src/cad-ai-meter.js';
import {compactAIRequestContext} from '../src/cad-ai-task-evidence.js';
import {randomUUID} from 'node:crypto';
import {generateDesktopAI} from '../src/ai-desktop-client.js';
import {aiVerificationText,aiProposalWarning} from '../src/cad-ai-result-checks.js';
import {appendAIVerification} from '../src/cad-ai-result-checks.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {createCadController} from '../src/cad-controller.js';
import {createCadProject,parseCadProject} from '../src/cad-project.js';
import {createCadAutomationAccess} from '../src/cad-automation-access.js';
import {cadAIContext} from '../src/cad-ai-context.js';
import {validateMeshAICommand,MESH_AI_SHAPE_IDS} from '../src/cad-mixed-ai.js';
import {projectObjectGeometryDigest} from '../src/project-objects.js';
import {makeMeshWorkplane} from '../src/mesh-workplane.js';
import {SHAPES} from '../src/mesh-engine/geometry.js';
import {runCadAIRequest} from '../src/cad-ai-request.js';
import {exportCadProjectSvg} from '../src/cad-svg-export.js';
import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
import {createCadCommandRouter} from '../src/cad-command-router.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const cube=(id,x=0)=>({id,kind:'mesh',name:id,color:'#109ca9',opacity:.8,layerId:'default',folderId:null,transform:[1,0,0,0,0,1,0,0,0,0,1,0,x,0,0,1],mesh:{verts:[-10,-10,0,10,-10,0,10,10,0,-10,10,0,-10,-10,20,10,-10,20,10,10,20,-10,10,20],triangles:[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]}});
function factory(file,onPost=()=>{}){return ()=>{const w=new Worker(new URL(file,import.meta.url)),api={onmessage:null,onerror:null,postMessage:data=>{onPost(data);w.postMessage(data);},terminate:()=>w.terminate()};w.on('message',data=>api.onmessage?.({data}));w.on('error',error=>api.onerror?.(error));return api;};}
function fixture(options={}){return createCadController({createWorker:factory('./fixtures/cad-node-worker.mjs'),createMeshWorker:factory('./fixtures/mesh-engine-node-worker.mjs'),...options});}
const batch=commands=>({kind:'batch',commands});
const mesh=(tool,values)=>({op:'mesh',tool,...values});
const createMesh=(as='mesh',values={})=>mesh('create',{type:'box',as,size:[20,20,20],...values});
const native=()=>({op:'create',type:'box',as:'native',size:[8,6,4],pos:[40,0,2]});
const close=(a,b,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);

test('Rejected converter route is not rerun in one task; native reconstruction remains available',async()=>{
 let calls=0;const cad=fixture({initial:createCadProject({nodes:[cube('source')]}),convertModel:async()=>{calls++;throw Object.assign(Error('Rejected topology'),{code:'CAD_CONVERTER_TOPOLOGY',feedback:{retryable:true,toolFailure:{scope:'converter-only'}}});}});
 try{cad.beginAITask();const before=cad.serialize(),command={op:'tool',engine:'converter',operation:{kind:'convert',target:'source'}};
  for(let i=0;i<2;i++)await assert.rejects(cad.preview(batch([command])),e=>e.code==='CAD_CONVERTER_TOPOLOGY');
  assert.equal(calls,1);assert.equal(cad.serialize(),before);const alternative=await cad.preview(batch([native()]));assert.equal(alternative.project.nodes.length,2);assert.equal(cad.serialize(),before);
  cad.discard(alternative.previewId);cad.beginAITask();await assert.rejects(cad.preview(batch([command])));assert.equal(calls,2);
 }finally{cad.dispose();}
});

test('Mixed native and mesh commands publish one preview, one Apply/Undo and retain unrelated native sources',async()=>{
 const cad=fixture();try{
  await cad.execute({kind:'create',recipe:{type:'box',size:[4,3,2]},options:{id:'retained'}});const before=cad.serialize(),original=cad.snapshot().nodes[0],undo=cad.state().undo;
  const p=await cad.preview(batch([createMesh(),native(),mesh('split',{target:'$mesh',normal:[0,0,3],distance:10,asPositive:'top',asNegative:'bottom'}),{op:'update',target:'$top',set:{color:'#123456',opacity:.6,notes:'Netzteil'}},{op:'transform',target:'$native',translate:[2,0,0]}]));
  assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,undo);assert.equal(p.project.nodes.length,4);assert.deepEqual(p.project.nodes[0],original);assert.ok(p.aliases.top&&p.aliases.bottom&&p.aliases.native);
  const top=p.project.nodes.find(n=>n.id===p.aliases.top),bottom=p.project.nodes.find(n=>n.id===p.aliases.bottom);assert.equal(top.color,'#123456');assert.equal(top.metadata.notes,'Netzteil');close((await cad.inspectMeshSolid(top)).volume,4000,.01);close((await cad.inspectMeshSolid(bottom)).volume,4000,.01);
  cad.apply(p);assert.equal(cad.state().undo,undo+1);const after=cad.serialize();cad.undo();assert.equal(cad.serialize(),before);cad.redo();assert.equal(cad.serialize(),after);assert.equal(cad.apply(p).alreadyApplied,true);
 }finally{cad.dispose();}
});

test('Native aliases remap through nested CAD groups across intervening mesh segments',async()=>{
 const cad=fixture();try{
  const p=await cad.preview(batch([{op:'create',type:'box',size:[30,20,10],as:'body'},{op:'create',type:'cylinder',size:[4,4,14],solid:false,as:'cutter'},createMesh(),{op:'group',targets:['$body','$cutter'],as:'group'},mesh('role',{target:'$mesh',role:'hole'}),{op:'update',target:'$body',set:{color:'#456789'}},{op:'transform',target:'$cutter',translate:[2,0,0]}]));
  assert.deepEqual(p.aliases.body,{rootId:p.aliases.group,path:[p.project.nodes.find(n=>n.kind==='cad').children[0].id]});const group=p.project.nodes.find(n=>n.kind==='cad');assert.equal(group.children[0].color,'#456789');assert.equal(p.project.nodes.find(n=>n.kind==='mesh').meshRole,'hole');assert.equal(cad.snapshot().nodes.length,0);
 }finally{cad.dispose();}
});

test('Existing mesh difference and drilling use the real mesh worker and preserve the CAD BRep',async()=>{
 const cad=fixture();try{
  await cad.execute(batch([native()]));const original=cad.snapshot().nodes[0];
  const p=await cad.preview(batch([createMesh('body'),createMesh('cut',{type:'cylinder',size:[6,6,24]}),mesh('group',{targets:['$body','$cut'],operation:'difference',as:'bored',name:'Gebohrtes Netz'}),mesh('drill',{target:'$bored',reference:{point:[5,0,20],normal:[0,0,1]},options:{diameter:2,termination:'through'},as:'drilled'})]));
  const output=p.project.nodes.find(n=>n.id===p.aliases.drilled);assert.deepEqual(p.project.nodes[0],original);assert.equal(output.kind,'mesh');assert.ok((await cad.inspectMeshSolid(output)).volume<8000-500);assert.equal(output.meshSource.operation.type,'drill');assert.equal(p.aliases.bored,p.aliases.drilled);assert.equal(cad.snapshot().nodes.length,1);
 }finally{cad.dispose();}
});

test('Saved mesh source edits retain frame and parameters and expose geometry-free source addresses',async()=>{
 const cad=fixture();try{
  await cad.execute(batch([createMesh('made',{type:'tube',params:{wall:2},size:[20,20,20]})]));const source=cad.snapshot().nodes[0],before=cad.serialize();
  const p=await cad.preview(batch([mesh('sourceEdit',{target:source.id,path:[],set:{params:{wall:3},color:'#654321'}}),{op:'update',target:source.id,set:{pos:[10,20,30]}}]));
  assert.equal(cad.serialize(),before);const node=p.project.nodes[0];assert.equal(node.meshSource.node.params.wall,3);assert.equal(node.color,'#654321');const scene=await cad.describe(p.project),part=scene.objects[0];assert.equal(part.kind,'mesh');assert.equal(part.geometryDigest,projectObjectGeometryDigest(node));assert.deepEqual(part.meshSources[0].path,[]);assert.equal(part.meshSources[0].params.wall,3);assert.ok(part.automation.meshTools.includes('sourceEdit'));assert.equal(part.automation.meshBodyProofRequired,true);assert.equal(Object.hasOwn(part.meshSources[0],'mesh'),false);
 }finally{cad.dispose();}
});

test('Existing mesh finishing accepts only current geometry digest and observed edge identifiers',async()=>{
 const cad=fixture({initial:createCadProject({nodes:[cube('cube')]})});try{
  const analysis=await cad.meshQuery('analyzeEdges',{id:'cube'}),before=cad.serialize();assert.ok(analysis.edges.length);
  const operation=mesh('finish',{target:'cube',geometryDigest:analysis.geometryDigest,edgeIds:[analysis.edges[0].id],options:{mode:'chamfer',width:1}}),p=await cad.preview(batch([operation]));assert.ok((await cad.inspectMeshSolid(p.project.nodes[0])).volume<8000);assert.equal(cad.serialize(),before);
  await assert.rejects(cad.preview(batch([{...operation,geometryDigest:'0'.repeat(64)}])),/Kantenbezug/);assert.equal(cad.serialize(),before);
 }finally{cad.dispose();}
});

test('Disconnected mesh material bodies and dissolution route existing tools with independent result aliases',async()=>{
 const cad=fixture({initial:createCadProject({nodes:[cube('a'),cube('b',40)]})});try{
  const p=await cad.preview(batch([mesh('group',{targets:['a','b'],as:'joined'}),mesh('bodies',{target:'$joined',as:'parts'})]));assert.equal(p.aliases.parts.length,2);for(const id of p.aliases.parts)close((await cad.inspectMeshSolid(p.project.nodes.find(n=>n.id===id))).volume,8000,.01);
  const dissolved=await cad.preview(batch([mesh('group',{targets:['a','b'],as:'joined'}),mesh('dissolve',{target:'$joined',as:'parts'})]));assert.equal(dissolved.aliases.parts.length,2);assert.equal(dissolved.project.nodes.length,2);assert.equal(cad.snapshot().nodes.length,2);
 }finally{cad.dispose();}
});

test('Raw open meshes keep original points through shared position, dimensions, orientation, mirrors and circle patterns',async()=>{
 const open=cube('open');open.mesh.triangles.splice(0,3);open.transform=[-1,0,0,0,.25,1,0,0,.1,.2,1,0,5,6,7,1];const cad=fixture({initial:createCadProject({nodes:[open]})});try{
  const before=cad.serialize(),geometry=cad.snapshot().nodes[0].mesh,p=await cad.preview(batch([{op:'update',target:'open',set:{size:[30,25,20],pos:[4,5,6],rot:[15,20,25],mirror:[1,1,-1],color:'#123456'}},{op:'transform',target:'open',position:[12,13,14],space:'world'},{op:'pattern',target:'open',kind:'circle',count:3,radius:30,as:'copies'}]));
  assert.equal(p.project.nodes.length,3);for(const node of p.project.nodes)assert.deepEqual(node.mesh,geometry);assert.equal(p.aliases.copies.length,2);assert.equal(cad.serialize(),before);
  const scene=await cad.describe();assert.equal(scene.objects[0].objectType,'openMesh');assert.equal(scene.objects[0].automation.meshTools.includes('split'),false);
  await assert.rejects(cad.preview(batch([createMesh(),mesh('split',{target:'open',normal:[0,0,1],distance:10})])),/offen|beschädigt/);assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,0);
 }finally{cad.dispose();}
});

test('Strict mesh schemas reject arbitrary geometry, scripts, unknown options and cross-domain source addresses',async()=>{
 const valid=createMesh();for(const command of [{...valid,brep:'x'},{...valid,script:'x'},{...valid,params:{raw:{mesh:'x'}}},mesh('drill',{target:'a',reference:{point:[0,0,20],normal:[0,0,1],mesh:[]}}),mesh('sourceEdit',{target:'a',path:[],set:{mesh:{verts:[]}}}),mesh('split',{target:{rootId:'a',path:['native-child']},normal:[0,0,1],distance:1}),mesh('create',{type:'unknown'})])assert.throws(()=>validateMeshAICommand(command));
 const cad=fixture({initial:createCadProject({nodes:[cube('a')]})});try{
  const before=cad.serialize();await assert.rejects(cad.preview(batch([native(),{...valid,operation:{type:'mesh-create'}}])));assert.equal(cad.serialize(),before);
  const access=createCadAutomationAccess({controller:cad});await assert.rejects(access.preview({revision:cad.revision(),commands:[valid],initialAliases:{foreign:'a'}}),/Ungültige/);assert.equal(cad.serialize(),before);
 }finally{cad.dispose();}
});

test('Inherited locks reject mixed mesh and shared operations before a candidate can be published',async()=>{
 const node=cube('locked');node.folderId='child';const cad=fixture({initial:createCadProject({nodes:[node],folders:[{id:'parent',layerId:'default',parentId:null,name:'Parent',hidden:false,locked:true},{id:'child',layerId:'default',parentId:'parent',name:'Child',hidden:false,locked:false}]})});try{
  const before=cad.serialize();for(const command of [mesh('split',{target:'locked',normal:[0,0,1],distance:10}),{op:'update',target:'locked',set:{pos:[1,2,3]}}]){await assert.rejects(cad.preview(batch([createMesh(),command])),/gesperrt/);assert.equal(cad.serialize(),before);}
  const scene=await cad.describe();assert.deepEqual(scene.objects[0].automation.sharedCommands,[]);assert.deepEqual(scene.objects[0].automation.meshTools,[]);
 }finally{cad.dispose();}
});

test('A later native failure annotates the global mixed command index and preserves both geometry domains',async()=>{
 const cad=fixture({initial:createCadProject({nodes:[cube('a')]})});try{
  const before=cad.serialize();await assert.rejects(cad.preview(batch([native(),mesh('split',{target:'a',normal:[0,0,1],distance:10}),{op:'update',target:'$native',set:{size:[-1,2,3]}}])),e=>{assert.equal(e.feedback.commandIndex,3);assert.equal(e.feedback.applied,false);return true;});assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,0);assert.equal(cad.state().previews,0);
  const p=await cad.preview(batch([native(),createMesh(),{op:'update',target:'$native',set:{color:'#123456'}}]));assert.equal(p.project.nodes.length,3);
 }finally{cad.dispose();}
});

test('Cancellation during the mesh segment discards preceding native edits and supports a fresh retry',async()=>{
 let entered;const started=new Promise(resolve=>entered=resolve);const cad=fixture({createMeshWorker:factory('./fixtures/mesh-engine-node-worker.mjs',data=>{if(data.request?.job==='edit')entered();})});try{
  const before=cad.serialize(),pending=cad.preview(batch([native(),createMesh()])),rejected=assert.rejects(pending,e=>e.code==='ABORTED');await started;cad.cancel();await rejected;assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,0);assert.equal(cad.state().previews,0);const p=await cad.preview(batch([createMesh(),native()]));assert.equal(p.project.nodes.length,2);
 }finally{cad.dispose();}
});

test('Mixed previews retain stale, discard, save/open and export guarantees through the same automation access',async()=>{
 const cad=fixture();try{
  let currentScene=await cad.describe();const access=createCadAutomationAccess({controller:cad,getScene:()=>currentScene,refresh:async()=>{currentScene=await cad.describe();}}),before=cad.serialize();
  const first=await access.preview({revision:cad.revision(),commands:[createMesh(),native()]});assert.equal(cad.serialize(),before);access.discard(first.previewId);assert.throws(()=>cad.apply(first));
  const p=await access.preview({revision:cad.revision(),commands:[createMesh(),native()]});await access.apply(p);const after=cad.serialize();assert.equal(cad.state().undo,1);await cad.open(parseCadProject(after));assert.equal(cad.serialize(),after);assert.ok((await cad.exportModel({format:'stl'})).data.length>100);assert.ok((await cad.exportModel({format:'step',ids:cad.snapshot().nodes.filter(n=>n.kind==='cad').map(n=>n.id)})).data.length>100);
  const stale=await access.preview({revision:cad.revision(),commands:[mesh('split',{target:cad.snapshot().nodes.find(n=>n.kind==='mesh').id,normal:[0,0,1],distance:10})]});await cad.execute(batch([{op:'transform',target:cad.snapshot().nodes.find(n=>n.kind==='cad').id,translate:[1,0,0]}]));const changed=cad.serialize();await assert.rejects(access.apply(stale),e=>e.code==='STALE_REVISION');assert.equal(cad.serialize(),changed);
 }finally{cad.dispose();}
});

test('Changing the mesh triangle structure detaches its workplane in the mixed preview and Undo restores the anchor',async()=>{
 const node=cube('a'),initial=createCadProject({nodes:[node],workplane:makeMeshWorkplane(node,2)}),cad=fixture({initial});try{
  const before=cad.serialize(),p=await cad.preview(batch([native(),mesh('split',{target:'a',normal:[0,0,1],distance:10})]));assert.equal(p.project.workplane.reference,null);assert.ok(p.warnings.some(t=>/Netzbezugsfläche/.test(t)));assert.equal(cad.serialize(),before);cad.apply(p);cad.undo();assert.equal(cad.serialize(),before);
 }finally{cad.dispose();}
});

test('Published mixed AI contract describes every existing tool without exposing internal aliases or automatic conversions',()=>{
 const context=cadAIContext(),variants=context.commandSchema.properties.commands.items.oneOf.filter(s=>s.properties.op.const==='mesh');assert.deepEqual(variants.map(s=>s.properties.tool.const),['counterpart','lid','create','group','split','drill','finish','bodies','dissolve','role','repair','sourceEdit']);assert.equal(context.commandSchema.properties.initialAliases,undefined);assert.match(context.mixedProjectContract,/one atomic preview/);assert.match(context.meshContract.precision,/never replace CAD BReps/);for(const type of MESH_AI_SHAPE_IDS)assert.ok(SHAPES.some(s=>s[0]===type));assert.equal(MESH_AI_SHAPE_IDS.includes('text'),false);
});

test('Selected mesh inspection and bounded observed edge identifiers reach the same AI request without sending mesh arrays',async()=>{
 const cad=fixture({initial:createCadProject({nodes:[cube('a')]})});try{
  let currentScene=await cad.describe();const selected=[{rootId:'a',path:[]}],access=createCadAutomationAccess({controller:cad,getScene:()=>currentScene,getSelection:()=>selected,refresh:async()=>{currentScene=await cad.describe();}});let seen;
  const before=cad.serialize(),result=await runCadAIRequest({input:{prompt:'Fase eine Kante an.'},access,generate:async args=>{seen=args.scene;assert.equal(seen.meshInspection.ok,true);assert.ok(seen.meshEdges.edges.length);assert.ok(seen.meshEdges.edges.length<=200);return {revision:seen.revision,commands:[mesh('finish',{target:'a',geometryDigest:seen.meshEdges.geometryDigest,edgeIds:[seen.meshEdges.edges[0].id],options:{mode:'chamfer',width:1}})]};}});
  assert.ok(result.proposal.previewId);assert.equal(cad.serialize(),before);assert.equal(Object.hasOwn(seen.objects[0],'mesh'),false);assert.equal(Object.hasOwn(seen.objects[0].meshSources??{},'mesh'),false);assert.equal(cad.state().undo,0);
 }finally{cad.dispose();}
});

test('Cancellation or changed selection during AI scene preparation prevents a provider request',async()=>{
 for(const kind of ['cancel','selection']){let selected=[],active=true,calls=0;const access={scene:()=>({revision:'current',selectionTargets:selected}),sceneForAI:async()=>{if(kind==='cancel')active=false;else selected=[{rootId:'other',path:[]}];return {revision:'current',selectionTargets:[]};},context:()=>({})};await assert.rejects(runCadAIRequest({input:{},access,isCurrent:()=>active,generate:async()=>{calls++;return {message:'bad'};}}),/abgebrochen|geändert/);assert.equal(calls,0);}
});

test('Automation SVG exports native and mesh material through one visible mixed projection and selected scope',async()=>{
 const previousParser=globalThis.DOMParser,previousSerializer=globalThis.XMLSerializer;globalThis.DOMParser=DOMParser;globalThis.XMLSerializer=XMLSerializer;const cad=fixture({initial:createCadProject({nodes:[cube('mesh',60),{...cube('hidden',100),hidden:true},{...cube('hole',140),meshRole:'hole'},{...cube('reference',180),kind:'referenceMesh'}]})});try{
  await cad.execute(batch([native()]));const before=cad.serialize(),access=createCadAutomationAccess({controller:cad}),all=await access.export({format:'svg'}),selected=await access.export({format:'svg',ids:['mesh']});
  assert.equal(all.mimeType,'image/svg+xml');const text=Buffer.from(all.dataBase64,'base64').toString('utf8'),meshOnly=Buffer.from(selected.dataBase64,'base64').toString('utf8'),allBox=new DOMParser().parseFromString(text,'image/svg+xml').documentElement.getAttribute('viewBox').split(/\s+/).map(Number),meshBox=new DOMParser().parseFromString(meshOnly,'image/svg+xml').documentElement.getAttribute('viewBox').split(/\s+/).map(Number);
  assert.ok(allBox[2]>meshBox[2]);assert.ok(allBox[0]+allBox[2]<100);assert.equal(cad.serialize(),before);await assert.rejects(access.export({format:'svg',ids:['missing']}));await assert.rejects(access.export({format:'svg',ids:['hole']}));await assert.rejects(access.export({format:'svg',quality:{deflection:-1}}));
 }finally{cad.dispose();globalThis.DOMParser=previousParser;globalThis.XMLSerializer=previousSerializer;}
});

test('SVG projection uses the saved workplane and rejects intervening project changes before combining domains',async()=>{
 let revision='a',queries=[];const project={coordinateMode:'plane',workplane:{origin:[3,4,5],orientation:[0,0,0,1]},nodes:[{id:'cad',kind:'cad',solid:true,layerId:'default',folderId:null},{...cube('mesh'),id:'mesh',kind:'mesh',layerId:'default',folderId:null}],layers:[{id:'default'}],folders:[]},controller={revision:()=>revision,readSnapshot:()=>project,query:async(_kind,options)=>{queries.push(options);revision='b';return {svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"/>'};},meshQuery:async()=>{throw Error('Must not query a later mesh revision');}};
 await assert.rejects(exportCadProjectSvg(controller),e=>e.code==='STALE_REVISION');assert.deepEqual(queries[0].frame.slice(12,15),[3,4,5]);assert.deepEqual(queries[0].ids,['cad']);
});

test('The explicit existing repair wrapper archives the damaged mesh and leaves unrelated native BRep unchanged',async()=>{
 const damaged=cube('damaged');damaged.mesh.triangles.push(...damaged.mesh.triangles.slice(0,3));const cad=fixture({initial:createCadProject({nodes:[damaged]})});try{
  await cad.execute(batch([native()]));const before=cad.serialize(),original=cad.snapshot(),p=await cad.preview(batch([mesh('repair',{target:'damaged'})]));
  assert.equal(cad.serialize(),before);assert.equal(p.project.nodes[0].meshSource.version,3);assert.deepEqual(p.project.nodes[0].meshSource.sources,[original.nodes[0]]);assert.deepEqual(p.project.nodes[1],original.nodes[1]);assert.equal(p.project.nodes[0].meshSource.operation.options.fillSmallHoles,false);assert.ok((await cad.inspectMeshSolid(p.project.nodes[0])).ok);
 }finally{cad.dispose();}
});

test('Internal native segments accept the bounded two-split-alias budget while public schemas expose no seed field',async()=>{
 const router=createCadCommandRouter({oc:{},service:{rebuild:async project=>project}}),seeds=Object.fromEntries(Array.from({length:400},(_,i)=>['part'+i,'root'+i])),project=createCadProject();
 const result=await router.run(project,{kind:'batch',initialAliases:seeds,commands:[{op:'layer',name:'Test'}]});assert.deepEqual(result.aliases,seeds);await assert.rejects(router.run(project,{kind:'batch',initialAliases:{...seeds,overflow:'root'},commands:[{op:'layer',name:'Test'}]}),e=>e.code==='INVALID_ALIAS');assert.equal(Object.hasOwn(cadAIContext().requestSchema.properties,'initialAliases'),false);
});

test('The actual chat UI wrapper forwards bound scene preparation and its workshop accepts an unproven mesh volume',async()=>{
 // Execute the actual UI factory with a minimal document and intercepted chat
 // callbacks. Static imports/CSS are supplied explicitly by this Node harness;
 // the packaged-browser verification additionally exercises the bundled file.
 const node=tag=>({tag,children:[],dataset:{},classList:{toggle(){}},querySelector(){return node('button');},querySelectorAll(){return [];},textContent:'',append(...children){this.children.push(...children);},replaceChildren(...children){this.children=[...children];}}),root=node('result');let chatCallbacks,prepared=0,providerCalls=0;
 const scene={revision:'current',selectionTargets:[],objects:[]},proposal={previewId:'checked',revision:'current',label:'Gemischte Vorschau',changes:[{op:'mesh'}],warnings:[],after:[{id:'mesh',name:'Netzteil',kind:'mesh'}],scene:{objects:[{id:'mesh',worldBounds:{size:[20,20,20]}}]}},access={scene:()=>scene,context:()=>({}),sceneForAI(){assert.equal(this,access);prepared++;return {...scene,meshInspection:{ok:true},meshEdges:{geometryDigest:'a'.repeat(64),edges:[{id:'observed'}]}};},preview:async()=>proposal},desktop={getAISettings:async()=>({protocol:'responses',baseUrl:'http://127.0.0.1',model:'mock'}),generateAI:async args=>{providerCalls++;assert.equal(args.scene.meshInspection.ok,true);assert.equal(args.scene.meshEdges.edges[0].id,'observed');return {revision:'current',commands:[mesh('create',{type:'box'})]};}},context={structuredClone,readAIModelStrictness,cadAIRequestContext,mountAITaskUI:()=>({requirements:prompt=>({purpose:'technical',objective:prompt,assumptions:[],checks:[],protectedTargets:[]}),setBusy(){},dispose(){}}),createAITaskJournal:()=>({begin:async()=>{},checkpoint:async()=>{},close:async()=>null,lastCheckpoint:()=>null}),appendAIFeatureEdits,createAIUsagePanel,compactAIRequestContext,crypto:{randomUUID},window:{offlinecadDesktop:desktop},document:{getElementById:id=>id==='ai-result'?root:null,querySelector:()=>null,createElement:node},runCadAIRequest,trackedAIAnalysis,generateDesktopAI,aiVerificationText,aiProposalWarning,appendAIIndependentCheck:()=>{},appendPhotoComparison:()=>{},appendPythonResults:()=>{},appendMeshLidReports:()=>{},appendAIVerification:(...args)=>appendAIVerification(...args,context.document),aiContext:cadAIContext,formatAIUsage:()=>'',createCadAIChat:options=>{chatCallbacks=options;return {state:()=>({featureReferences:[]}),setBusy(){},setUsage(){},setProposal(){},status(){},open(){},dispose(){}};},access};
 const source=readFileSync(new URL('../src/cad-ai-ui.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export function createCadAIUI','function createCadAIUI');vm.runInNewContext(source+'\nui=createCadAIUI({access,language:()=>"de",showPreview:()=>{},clearPreview:()=>{}});',context);
 const answer=await chatCallbacks.onSend({prompt:'Netz erstellen'});assert.equal(answer.commands[0].op,'mesh');assert.equal(prepared,1);assert.equal(providerCalls,1);const texts=[];function collect(value){if(value?.textContent)texts.push(value.textContent);for(const child of value?.children??[])collect(child);}collect(root);assert.ok(texts.includes('Netzteil'));assert.ok(texts.includes('—'));assert.ok(root.children.some(child=>child.tag==='table'));
});
