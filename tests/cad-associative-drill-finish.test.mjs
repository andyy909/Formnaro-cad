import test from 'node:test';
import assert from 'node:assert/strict';
import loader from '../cad-kernel-build/runtime/formnaro_cad.js';
import {createCadProject,serializeCadProject,parseCadProject} from '../src/cad-project.js';
import {createCadService} from '../src/cad-service.js';
import {createCadToolsNative} from '../src/cad-tools-native.js';
import {createCadCommandRouter} from '../src/cad-command-router.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {createCadFinishNative,listCadEdgesNative} from '../src/cad-finish-native.js';
import {readCadBrep} from '../src/cad-native-kernel.js';
import { CAD_DRAWING_BORE_ROLE, createCadDrawingNative } from '../src/cad-drawing-native.js';
import { cadDrawingDimension, cadDrawingProblems, cadDrawingSourceSignatures, createCadDrawingSheet, updateCadDrawingProjection } from '../src/cad-drawing-data.js';

const oc=await loader({print:()=>{},printErr:()=>{}});
test('finished associative bore uses a preserved source wrapper and unwraps safely',async()=>{
 const service=createCadService({oc,finish:createCadFinishNative({oc})});try{
  const body=service.nativeNode({type:'box',size:[40,20,8]},{id:'body'}),other=service.nativeNode({type:'box',size:[4,4,4]},{id:'other'}),store=createCadTransactions({initial:createCadProject({nodes:[body,other]}),build:(p,c)=>service.rebuild(p,{baseline:c.baseline})}),tools=createCadToolsNative({oc,service,transactions:store});
  store.apply(await tools.previewDrill({id:'body',resultId:'part',reference:{ray:{origin:[0,0,30],direction:[0,0,-1]}},associative:true,diameter:4,revision:store.revision()}));let before=store.snapshot();before.nodes[0].annotations=[{id:'mark',version:1,point:[10,5,4],normal:[0,0,1],note:'Hinweis',color:'#ff0000',radius:1,status:'valid',faceSignature:'a'.repeat(64)}];before=await service.rebuild(before);const shape=readCadBrep(oc,before.nodes[0].brep.data);let edge;
  try{edge=listCadEdgesNative(oc,shape,{origin:{rootId:'part',path:[]}}).find(e=>e.geometry.kind==='line');}finally{shape.delete();}assert.ok(edge);
  const router=createCadCommandRouter({oc,service}),operation={kind:'finish',target:'part',step:{id:'round',kind:'round',amount:.5,edges:[edge.reference]}};
  const result=(await router.run(before,operation,{baseline:before})).project,wrapper=result.nodes[0];assert.equal(wrapper.source,'finish');assert.equal(wrapper.children[0].drill.sourceId,'body');assert.equal(wrapper.children[0].id,wrapper.finish.steps[0].edges[0].origin.path[0]);assert.deepEqual(result.nodes[1],before.nodes[1]);assert.ok(wrapper.stats.volume<before.nodes[0].stats.volume);
  const editStore=createCadTransactions({initial:before,build:async(p,c)=>(await router.run(p,c.operation,{baseline:c.baseline})).project}),proposal=await editStore.preview({project:editStore.snapshot(),revision:editStore.revision(),operation});assert.deepEqual(editStore.snapshot(),before);editStore.apply(proposal);const applied=editStore.snapshot();editStore.undo();assert.deepEqual(editStore.snapshot(),before);editStore.redo();assert.deepEqual(editStore.snapshot(),applied);
  assert.deepEqual(parseCadProject(serializeCadProject(result)),result);
  const changed=structuredClone(result);changed.nodes[0].children[0].children[0].recipe.size[2]=12;await assert.rejects(()=>service.rebuild(changed,{baseline:result}),{code:'CAD_SOURCE_FEATURE_LOST'});
  const restored=(await router.run(result,{kind:'editFinish',target:'part',steps:[]},{baseline:result})).project;assert.equal(restored.nodes[0].id,'part');assert.equal(restored.nodes[0].drill.sourceId,'body');assert.equal(restored.nodes[0].annotations[0].note,'Hinweis');assert.ok(Math.abs(restored.nodes[0].stats.volume-before.nodes[0].stats.volume)<1e-6);assert.deepEqual(restored.nodes[1],before.nodes[1]);
  const locked=structuredClone(before);locked.nodes[0].children[0].locked=true;await assert.rejects(()=>router.run(locked,operation,{baseline:locked}),{code:'LOCKED_CAD_OBJECT'});
  const bound=structuredClone(before);bound.projectParameters={version:1,parameters:[{id:'p',name:'Breite',value:40}],bindings:[{id:'b',parameterId:'p',target:{rootId:'part',path:[]},field:'size.0'}],variants:[],activeVariantId:null};await assert.rejects(()=>router.run(bound,operation,{baseline:bound}),{code:'CAD_DRILL_DEPENDENCIES_UNSUPPORTED'});
 }finally{service.dispose();}
});

test('first finish on an associative bore carries the uniquely proven drawing diameter through its new source path', async () => {
  const service = createCadService({ oc, finish: createCadFinishNative({ oc }) });
  try {
    const body = service.nativeNode({ type: 'box', size: [40, 20, 8] }, { id: 'stock' });
    const source = createCadTransactions({
      initial: createCadProject({ nodes: [body] }),
      build: (project, context) => service.rebuild(project, { baseline: context.baseline }),
    });
    const tools = createCadToolsNative({ oc, service, transactions: source });
    source.apply(await tools.previewDrill({
      id: 'stock', resultId: 'part', reference: { ray: { origin: [3, -2, 25], direction: [0, 0, -1] } },
      associative: true, diameter: 4, revision: source.revision(),
    }));
    const initial = source.snapshot();
    let sheet = createCadDrawingSheet({ sourceIds: ['part'] });
    const projection = createCadDrawingNative({ oc, service });
    for (const view of sheet.views) {
      sheet = updateCadDrawingProjection(sheet, view.id, projection(initial, { ids: view.sourceIds, view: view.kind }));
    }
    const top = sheet.views.find(view => view.kind === 'top');
    const bore = top.projection.curves.find(curve => curve.kind === 'circle' && !curve.hidden);
    delete bore.sourceReferences;
    sheet.annotations.push({
      id: 'bore', kind: 'diameter', viewId: top.id, curveIds: [bore.id],
      sourceSignatures: top.projection.sourceSignatures, position: [20, 30],
    });
    initial.drawings = { version: 1, sheets: [sheet] };
    const shape = readCadBrep(oc, initial.nodes[0].brep.data);
    let edge;
    try {
      edge = listCadEdgesNative(oc, shape, { origin: { rootId: 'part', path: [] } })
        .find(({ geometry }) => geometry.kind === 'line' &&
          [geometry.start, geometry.end].every(point => point[1] === -10 && point[2] === 4));
    } finally {
      shape.delete();
    }
    assert.ok(edge);
    const router = createCadCommandRouter({ oc, service });
    const operation = {
      kind: 'finish', target: 'part', step: { id: 'first-round', kind: 'round', amount: 1, edges: [edge.reference] },
    };
    const store = createCadTransactions({
      initial,
      build: async (project, context) => (await router.run(project, context.operation, { baseline: context.baseline })).project,
    });
    const baseline = store.snapshot();
    function assertDiameter(project, path) {
      const [drawing] = project.drawings.sheets;
      const [annotation] = drawing.annotations;
      assert.deepEqual(annotation.curveReferences, [{
        sourceReferences: [{ source: { rootId: 'part', path }, role: CAD_DRAWING_BORE_ROLE }],
      }]);
      assert.equal(cadDrawingDimension(drawing, annotation).value, 4);
      assert.deepEqual(cadDrawingProblems(drawing, { sourceSignatures: cadDrawingSourceSignatures(project) }), []);
    }
    const preview = await store.preview({ project: store.snapshot(), revision: store.revision(), operation });
    const child = preview.project.nodes[0].children[0];
    assert.deepEqual(child.drill, baseline.nodes[0].drill);
    assertDiameter(preview.project, [child.id]);
    assert.deepEqual(store.snapshot(), baseline);
    store.apply(preview);
    assert.equal(store.state().undo, 1);
    const reopened = parseCadProject(serializeCadProject(store.snapshot()));
    assertDiameter(reopened, [child.id]);
    const editBore = path => router.run(reopened, {
      kind: 'tool', name: 'previewEditDrill', options: { id: 'part', path, patch: { diameter: 5 } },
    });
    await assert.rejects(() => editBore(['unknown']), { code: 'INVALID_CAD_DRILL' });
    const enlarged = await editBore([child.id]);
    assert.equal(enlarged.project.nodes[0].children[0].drill.diameter, 5);
    assert.equal(reopened.nodes[0].children[0].drill.diameter, 4);
    const changedStep = { ...reopened.nodes[0].finish.steps[0], amount: 1.5 };
    const changed = (await router.run(reopened, { kind: 'editFinish', target: 'part', steps: [changedStep] })).project;
    assert.equal(changed.nodes[0].finish.steps[0].amount, 1.5);
    assertDiameter(changed, [child.id]);
    store.undo();
    assert.deepEqual(store.snapshot(), baseline);

    const stale = structuredClone(baseline);
    stale.drawings.sheets[0].annotations[0].curveIds = ['lost'];
    await assert.rejects(() => router.run(stale, operation), { code: 'CAD_DRILL_DEPENDENCIES_UNSUPPORTED' });
    const locked = structuredClone(baseline);
    locked.nodes[0].children[0].locked = true;
    await assert.rejects(() => router.run(locked, operation), { code: 'LOCKED_CAD_OBJECT' });
    const bound = structuredClone(baseline);
    bound.projectParameters = {
      version: 1, parameters: [{ id: 'p', name: 'Width', value: 40 }],
      bindings: [{ id: 'b', parameterId: 'p', target: { rootId: 'part', path: [] }, field: 'size.0' }],
      variants: [], activeVariantId: null,
    };
    await assert.rejects(() => router.run(bound, operation), { code: 'CAD_DRILL_DEPENDENCIES_UNSUPPORTED' });
  } finally {
    service.dispose();
  }
});
