import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {createCadController} from '../src/cad-controller.js';
import {createCadProjectParameters,cadProjectParameterProblems} from '../src/cad-project-parameters-data.js';
import {captureCadAISourceReference} from '../src/cad-ai-feature-references.js';
import {cadContourLinkProblems} from '../src/cad-linked-contours-data.js';
import {createCadDrawingSheet,cadDrawingDimension} from '../src/cad-drawing-data.js';
import {createCadJoint,cadJointProblems} from '../src/cad-joints-data.js';
import {createCadAutomationAccess} from '../src/cad-automation-access.js';
import {runCadAIRequest} from '../src/cad-ai-request.js';

const near=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`),target=(rootId,path=[])=>({rootId,path});
function controller(){return createCadController({createWorker:()=>{const worker=new Worker(new URL('./fixtures/cad-node-worker.mjs',import.meta.url)),adapter={postMessage:m=>worker.postMessage(m),terminate:()=>worker.terminate()};worker.on('message',data=>adapter.onmessage?.({data}));worker.on('error',e=>adapter.onerror?.(e));return adapter;}});}
async function bores(cad,{variant=false}={}){
 await cad.execute({kind:'batch',commands:[{op:'create',type:'box',size:[40,30,10],as:'base'},{op:'create',type:'cylinder',size:[4,4,20],pos:[-10,0,0],solid:false,as:'A'},{op:'create',type:'cylinder',size:[4,4,20],pos:[10,0,0],solid:false,as:'B'},{op:'group',targets:['$base','$A','$B'],as:'body'},{op:'create',type:'box',size:[5,6,7],pos:[80,0,0],as:'keep'}]});const root=cad.snapshot().nodes[0],holes=root.children.filter(n=>n.recipe.type==='cylinder'),data={...createCadProjectParameters(),parameters:[{id:'input',name:'input',value:2},{id:'diameter',name:'diameter',value:'2 * input'}],bindings:holes.flatMap((n,i)=>[0,1].map(axis=>({id:`d-${i}-${axis}`,parameterId:'diameter',target:target(root.id,[n.id]),field:'size.'+axis}))),...(variant?{activeVariantId:'current',variants:[{id:'current',name:'Aktuelle Variante',values:[],states:[]},{id:'other',name:'Andere Variante',values:[{parameterId:'input',value:5}],states:[]}]}:{})};cad.apply(await cad.previewProjectParameters(data));const reference=(await cad.query('featureReference',{action:'pick',kind:'bore',ids:[root.id],ray:{origin:[-10,0,0],direction:[1,1,0],far:100}})).reference;return {root,holes,reference,data};
}
const edit=(reference,field,value)=>({kind:'featureEdits',references:{version:1,items:[reference]},edits:[{referenceId:reference.id,field,value}]});

test('Shared formula-bound bores update their unique free input, preserve formulas and analytic cylinders, and require private Apply acceptance',async()=>{
 const cad=controller();try{const f=await bores(cad),before=cad.serialize(),snapshot=cad.snapshot(),depth=cad.state().undo,p=await cad.preview(edit(f.reference,'diameter',6));assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,depth);assert(p.report.featureDependencies.requiresAcceptance);assert(p.report.featureDependencies.parameters.some(p=>p.name==='input'&&p.before===2&&p.value===3));assert(p.report.featureDependencies.sources.some(s=>s.target.path.includes(f.holes[1].id)));assert(Object.values(p.report.counts).every(n=>n===1));
  const next=p.project.projectParameters;assert.equal(next.parameters.find(p=>p.id==='input').value,3);assert.equal(next.parameters.find(p=>p.id==='diameter').value,'2 * input');assert.deepEqual(next.bindings,snapshot.projectParameters.bindings);assert.deepEqual(p.project.nodes[1],snapshot.nodes[1]);assert.deepEqual(cadProjectParameterProblems(p.project),[]);for(const hole of p.project.nodes[0].children.filter(n=>n.recipe.type==='cylinder')){assert.deepEqual(hole.recipe.size,[6,6,20]);assert.deepEqual(hole.transform,f.holes.find(n=>n.id===hole.id).transform);}
  p.report.featureDependencies.requiresAcceptance=false;p.report.featureDependencies.parameters=[];assert.throws(()=>cad.apply(p),{code:'AI_FEATURE_DEPENDENCY_ACCEPTANCE_REQUIRED'});cad.apply({...p,acceptFeatureDependencies:true});assert.equal(cad.state().undo,depth+1);for(const x of [-10,10])near((await cad.query('featureReference',{action:'pick',kind:'bore',ids:[f.root.id],ray:{origin:[x,0,0],direction:[1,1,0],far:100}})).reference.selector.surface.diameter,6);const saved=cad.serialize();cad.undo();assert.equal(cad.serialize(),before);cad.redo();assert.equal(cad.serialize(),saved);await cad.open(saved);assert.deepEqual(cadProjectParameterProblems(cad.snapshot()),[]);assert((await cad.exportModel({format:'step',ids:[f.root.id]})).data.length>1000);
 }finally{cad.dispose();}
});
test('A targeted shared parameter edit changes only the active variant and retains the base and other variants',async()=>{
 const cad=controller();try{const f=await bores(cad,{variant:true}),before=cad.snapshot(),p=await cad.preview(edit(f.reference,'diameter',6)),data=p.project.projectParameters;assert.deepEqual(data.parameters,before.projectParameters.parameters);assert.equal(data.activeVariantId,'current');assert.deepEqual(data.variants.find(v=>v.id==='current').values,[{parameterId:'input',value:3}]);assert.deepEqual(data.variants.find(v=>v.id==='other'),before.projectParameters.variants.find(v=>v.id==='other'));assert.deepEqual(cadProjectParameterProblems(p.project),[]);cad.discard(p.previewId);
 }finally{cad.dispose();}
});
test('A pre-existing stale parameter on an unrelated part is preserved rather than silently synchronized by the targeted change',async()=>{
 const cad=controller();try{const f=await bores(cad),keep=cad.snapshot().nodes[1],data=cad.snapshot().projectParameters;data.parameters.push({id:'other',name:'other',value:5});data.bindings.push({id:'other-width',parameterId:'other',target:target(keep.id),field:'size.0'});cad.apply(await cad.previewProjectParameters(data));await cad.execute({kind:'batch',commands:[{op:'update',target:keep.id,set:{size:[7,6,7]}}]});const before=cad.snapshot(),reference=(await cad.query('featureReference',{action:'pick',kind:'bore',ids:[f.root.id],ray:{origin:[-10,0,0],direction:[1,1,0],far:100}})).reference,p=await cad.preview(edit(reference,'diameter',6));assert.deepEqual(p.project.nodes[1],before.nodes[1]);assert.deepEqual(p.project.projectParameters.applied.inputs.find(i=>i.bindingId==='other-width'),before.projectParameters.applied.inputs.find(i=>i.bindingId==='other-width'));assert(cadProjectParameterProblems(p.project).some(p=>p.bindingId==='other-width'));assert(!p.report.constructedIds.includes(keep.id));cad.discard(p.previewId);
 }finally{cad.dispose();}
});
test('Conflicting shared targets and nonlinear inversion are diagnosed without replacing retained formulas or committing geometry',async()=>{
 const cad=controller();try{const f=await bores(cad),second=(await cad.query('featureReference',{action:'pick',kind:'bore',ids:[f.root.id],ray:{origin:[10,0,0],direction:[1,1,0],far:100}})).reference,before=cad.serialize(),depth=cad.state().undo;await assert.rejects(cad.preview({kind:'featureEdits',references:{version:1,items:[f.reference,second]},edits:[{referenceId:f.reference.id,field:'diameter',value:6},{referenceId:second.id,field:'diameter',value:8}]}),{code:'AI_FEATURE_PARAMETER_CONFLICT'});assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,depth);const data=cad.snapshot().projectParameters;data.parameters.find(p=>p.id==='diameter').value='input * input';cad.apply(await cad.previewProjectParameters(data));const current=(await cad.query('featureReference',{action:'pick',kind:'bore',ids:[f.root.id],ray:{origin:[-10,0,0],direction:[1,1,0],far:100}})).reference,unchanged=cad.serialize();const noop=await cad.preview(edit(current,'diameter',4));assert.equal(noop.project.projectParameters.parameters.find(p=>p.id==='diameter').value,'input * input');cad.discard(noop.previewId);await assert.rejects(cad.preview(edit(current,'diameter',6)),{code:'AI_FEATURE_PARAMETER_FORMULA'});assert.equal(cad.serialize(),unchanged);
 }finally{cad.dispose();}
});
test('An unchanged requested value does not add a variant override or rewrite a literal input',async()=>{
 const cad=controller();try{const f=await bores(cad,{variant:true}),original=cad.snapshot().projectParameters,p=await cad.preview(edit(f.reference,'diameter',4));assert.deepEqual(p.project.projectParameters.parameters,original.parameters);assert.deepEqual(p.project.projectParameters.variants,original.variants);assert.deepEqual(p.report.featureDependencies.parameters,[]);cad.discard(p.previewId);
 }finally{cad.dispose();}
});
test('A restricted AI request cannot escape through program-assistant notes, UI guides or demonstrations before its typed native correction',async()=>{
 const cad=controller();try{const f=await bores(cad),scene=await cad.describe(),base=createCadAutomationAccess({controller:cad,getScene:()=>scene}),before=cad.serialize(),scope={version:1,items:[f.reference]};let calls=0,sideEffects=0;const outcome=await runCadAIRequest({input:{prompt:'Nur diese Bohrung'},visualReview:false,access:{...base,restrictedFeatures:true,programAssistant:{execute:()=>{sideEffects++;throw Error('Must not run');},demonstrate:()=>{sideEffects++;throw Error('Must not run');}},preview:(request,options)=>base.preview(request,{...options,featureScope:scope})},generate:async()=>{calls++;return {revision:cad.revision(),...(calls===1?{assistant:{kind:'note',text:'Unrequested context write'}}:calls===2?{assistant:{kind:'guide',steps:[]}}:{commands:[{op:'feature',referenceId:f.reference.id,field:'diameter',value:6}]})};}});assert.equal(calls,3);assert.equal(sideEffects,0);assert.equal(outcome.correctionAttempts,2);assert(outcome.proposal.report.featureDependencies.requiresAcceptance);assert.equal(cad.serialize(),before);cad.discard(outcome.proposal.previewId);
 }finally{cad.dispose();}
});
async function contours(cad){
 const sketch={version:1,kind:'rectangle',variables:[{name:'width',value:'20'}],dimensions:{width:'width',depth:'12',diameter:'12',height:'6'},points:[['-10','-6'],['10','-6'],['10','6'],['-10','6']]},made=await cad.execute({kind:'batch',commands:[{op:'sketch',as:'A',name:'Quellskizze',sketch},{op:'create',type:'box',size:[10,12,6],pos:[70,0,0],name:'Andere Quelle',as:'D'}]}),a=made.aliases.A,d=made.aliases.D;
 async function link(rootId,name,role='sketch.cap.max',height=3){const p=await cad.previewContourLinks({action:'create',source:target(rootId),selector:{kind:'native-role',role},name,height});cad.apply(p);return p.aliases.sketch;}
 const b=await link(a,'Kontur B','sketch.cap.max',5),c=await link(b,'Kontur C','sketch.cap.max',2),e=await link(d,'Unbeteiligte Kontur E','box.z.max');return {a,b,c,d,e};
}
test('A single source edit updates two contour generations and only their drawing views once, leaving an unrelated stale branch intact',async()=>{
 const cad=controller();try{const f=await contours(cad),sheet=createCadDrawingSheet({name:'Gemischtes Blatt',sourceIds:[f.a,f.b]}),other=createCadDrawingSheet({sourceIds:[f.e]}).views[0];sheet.views.push(other);const drawings={version:1,sheets:[sheet]};cad.apply(await cad.previewDrawings(drawings));cad.apply(await cad.previewDrawingUpdate(drawings,{sheetIds:[sheet.id]}));const annotated=cad.snapshot().drawings,top=annotated.sheets[0].views.find(v=>v.kind==='top'),curve=top.projection.curves.find(c=>c.kind==='line'&&Math.abs(c.a[1]-c.b[1])<1e-7);annotated.sheets[0].annotations.push({id:'retained-width',kind:'length',viewId:top.id,curveIds:[curve.id],position:[40,40]});near(cadDrawingDimension(annotated.sheets[0],annotated.sheets[0].annotations[0]).value,20);cad.apply(await cad.previewDrawings(annotated));
  // Make a separate branch stale before the targeted request. It must retain
  // both its old sources and its old correspondence proof.
  await cad.execute({kind:'batch',commands:[{op:'update',target:f.d,set:{size:[14,12,6]}}]});const before=cad.serialize(),snapshot=cad.snapshot(),ref=captureCadAISourceReference(snapshot,target(f.a),{kind:'sketch'}),p=await cad.preview(edit(ref,'sketch.variables.width',30));assert.equal(cad.serialize(),before);assert.deepEqual(new Set(p.report.updatedLinkIds),new Set(snapshot.contourLinks.links.filter(l=>[f.b,f.c].includes(l.target.rootId)).map(l=>l.id)));assert.deepEqual(p.report.counts,{[f.a]:1,[f.b]:1,[f.c]:1});near(p.project.nodes.find(n=>n.id===f.b).stats.volume,30*12*5);near(p.project.nodes.find(n=>n.id===f.c).stats.volume,30*12*2);
  for(const id of [f.d,f.e])assert.deepEqual(p.project.nodes.find(n=>n.id===id),snapshot.nodes.find(n=>n.id===id));assert.deepEqual(p.project.contourLinks.links.find(l=>l.target.rootId===f.e),snapshot.contourLinks.links.find(l=>l.target.rootId===f.e));assert(cadContourLinkProblems(p.project).some(p=>p.target.rootId===f.e));assert(!cadContourLinkProblems(p.project).some(p=>[f.b,f.c].includes(p.target.rootId)));assert.deepEqual(p.project.drawings.sheets[0].views.find(v=>v.id===other.id),snapshot.drawings.sheets[0].views.find(v=>v.id===other.id));assert.equal(p.report.featureDependencies.drawingViews.length,3);assert(!p.project.drawings.sheets[0].annotations[0].unresolved);near(cadDrawingDimension(p.project.drawings.sheets[0],p.project.drawings.sheets[0].annotations[0]).value,30);assert.throws(()=>cad.apply(p),{code:'AI_FEATURE_DEPENDENCY_ACCEPTANCE_REQUIRED'});cad.apply({...p,acceptFeatureDependencies:true});cad.undo();assert.equal(cad.serialize(),before);
 }finally{cad.dispose();}
});
test('Locked necessary dependents and ambiguous parameter inputs refuse the entire preview without changing any source or Undo',async()=>{
 const cad=controller();try{const f=await contours(cad),draft=cad.snapshot();draft.nodes.find(n=>n.id===f.b).locked=true;await cad.open(draft);let before=cad.serialize(),depth=cad.state().undo,reference=captureCadAISourceReference(cad.snapshot(),target(f.a));await assert.rejects(cad.preview(edit(reference,'sketch.variables.width',30)),{code:'AI_FEATURE_DEPENDENCY_LOCKED'});assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,depth);
  await cad.open(cad.snapshot());const data={...createCadProjectParameters(),parameters:[{id:'x',name:'x',value:10},{id:'y',name:'y',value:2},{id:'derived',name:'derived',value:'x * y'}],bindings:[{id:'bound-width',parameterId:'derived',target:target(f.a),field:'sketch.variables.width'}]};const unlocked=cad.snapshot();unlocked.nodes.find(n=>n.id===f.b).locked=false;await cad.open(unlocked);cad.apply(await cad.previewProjectParameters(data));before=cad.serialize();depth=cad.state().undo;reference=captureCadAISourceReference(cad.snapshot(),target(f.a));await assert.rejects(cad.preview(edit(reference,'sketch.variables.width',30)),{code:'AI_FEATURE_PARAMETER_AMBIGUOUS'});assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,depth);
 }finally{cad.dispose();}
});

test('Retained assembly frames stay exact during a diameter change; changing an attached part placement requires explicit joint reassignment',async()=>{
 const cad=controller();try{const f=await bores(cad),draft=cad.snapshot();draft.joints=createCadJoint(draft,{id:'fixed-assembly',kind:'fixed',parentId:f.root.id,childId:draft.nodes[1].id,origin:[0,0,0]});await cad.open(draft);assert.deepEqual(cadJointProblems(cad.snapshot()),[]);const reference=(await cad.query('featureReference',{action:'pick',kind:'bore',ids:[f.root.id],ray:{origin:[-10,0,0],direction:[1,1,0],far:100}})).reference,p=await cad.preview(edit(reference,'diameter',6));assert.deepEqual(p.project.joints,cad.snapshot().joints);assert.deepEqual(cadJointProblems(p.project),[]);cad.discard(p.previewId);const selected=captureCadAISourceReference(cad.snapshot(),target(f.root.id)),before=cad.serialize(),depth=cad.state().undo;await assert.rejects(cad.preview(edit(selected,'pos.0',10)),{code:'AI_FEATURE_JOINT_REASSIGN_REQUIRED'});assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,depth);
 }finally{cad.dispose();}
});


test('Everyday plate edits preserve specified bore geometry and leave the other part intact',async()=>{
 const cad=controller();
 try{
  const fixture=await bores(cad);
  const rootId=fixture.root.id;
  const baseId=fixture.root.children.find(node=>node.recipe.type==='box').id;
  const initial=cad.serialize();
  const other=cad.snapshot().nodes[1];
  const source=id=>captureCadAISourceReference(cad.snapshot(),target(rootId,[id]));
  const bore=async x=>(await cad.query('featureReference',{action:'pick',kind:'bore',ids:[rootId],ray:{origin:[x,0,5],direction:[1,1,0],far:100}})).reference;
  async function applyPrompt(prompt,items,edits){
   const before=cad.serialize();
   const featureScope={version:1,items};
   const scene=await cad.describe();
   const access=createCadAutomationAccess({controller:cad,getScene:()=>scene});
   const outcome=await runCadAIRequest({
    input:{prompt},visualReview:false,
    access:{...access,restrictedFeatures:true,preview:(request,options)=>access.preview(request,{...options,featureScope})},
    generate:async request=>{
     assert.equal(request.prompt,prompt);
     return {revision:cad.revision(),commands:edits.map(([reference,field,value])=>({op:'feature',referenceId:reference.id,field,value}))};
    },
   });
   assert.equal(cad.serialize(),before);
   assert.ok(outcome.proposal?.previewId);
   cad.apply({...outcome.proposal,acceptFeatureDependencies:true});
   assert.deepEqual(cad.snapshot().nodes[1],other);
  }
  const initialSurfaces=await Promise.all([-10,10].map(async x=>(await bore(x)).selector.surface));
  const base=source(baseId);
  await applyPrompt('Mach die Platte rechts 20 mm länger. Lass die Bohrungen, wo sie sind.',[base],[[base,'size.0',60],[base,'pos.0',10]]);
  const bounds=cad.snapshot().nodes[0].stats.bounds;
  for(const [axis,min,max] of [[0,-20,40],[1,-15,15],[2,0,10]]){
   near(bounds.min[axis],min);
   near(bounds.max[axis],max);
  }
  assert.deepEqual(await Promise.all([-10,10].map(async x=>(await bore(x)).selector.surface)),initialSurfaces);

  const left=await bore(-10);
  await applyPrompt('Mach beide Bohrungen auf 8 mm. Die Lage bleibt.',[left],[[left,'diameter',8]]);
  for(const [index,x] of [-10,10].entries()){
   const measured=(await bore(x)).selector.surface;
   assert.deepEqual(measured,{...initialSurfaces[index],diameter:8});
  }
  const afterDiameter=cad.serialize();

  const cutters=fixture.holes.map(node=>source(node.id));
  await applyPrompt('Setz die Bohrungen 30 mm auseinander. Die Mitte zwischen ihnen bleibt gleich.',cutters,[[cutters[0],'pos.0',-15],[cutters[1],'pos.0',15]]);
  const moved=await Promise.all([-15,15].map(async x=>(await bore(x)).selector.surface));
  near(moved[1].center[0]-moved[0].center[0],30);
  for(const [index,x] of [-15,15].entries()){
   assert.deepEqual(moved[index],{...initialSurfaces[index],center:[x,...initialSurfaces[index].center.slice(1)],diameter:8});
  }
  near(cad.snapshot().nodes[0].stats.volume,60*30*10-2*Math.PI*4**2*10);
  cad.undo();
  assert.equal(cad.serialize(),afterDiameter);
  cad.undo();
  cad.undo();
  assert.equal(cad.serialize(),initial);
 }finally{cad.dispose();}
});

test('Lab CAD checks exercise real edits, native drawing/STEP readback, stale Apply and the joint stop', async (t) => {
  const { runCadDevelopmentCheck } = await import('../src/cad-lab-development-checks.js');
  for (const id of ['plate-length', 'plate-diameter', 'plate-spacing', 'plate-drawing', 'plate-step', 'stale-preview', 'assembly-stop']) {
    await t.test(id, async () => {
      const result = await runCadDevelopmentCheck(id, { createController: controller });
      assert.ok(result.checks.length >= 3);
      assert.deepEqual(result.checks.filter(({ passed }) => !passed), []);
    });
  }
});

test('Lab model requests supply the short German prompt and the current native reference scope', async () => {
  const { runCadDevelopmentCheck } = await import('../src/cad-lab-development-checks.js');
  let calls = 0;
  const result = await runCadDevelopmentCheck('plate-diameter', {
    createController: controller,
    generate: async ({ prompt, scene, context }) => {
      calls++;
      assert.equal(prompt, 'Mach beide Bohrungen auf 8 mm. Die Lage bleibt.');
      const { references, restricted } = context.featureScope;
      assert.equal(restricted, true);
      assert.equal(references.length, 2);
      assert.ok(references.every((item) => item.fields[0].value === 4));
      return {
        revision: scene.revision,
        commands: references.map(({ id }) => ({ op: 'feature', referenceId: id, field: 'diameter', value: 8 })),
      };
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(result.checks.filter(({ passed }) => !passed), []);
});
