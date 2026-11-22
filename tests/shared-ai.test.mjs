import test from 'node:test';
import assert from 'node:assert/strict';
import {converterAIScene,validateConverterAIProposal,createConverterAI} from '../src/cad-converter-ai.js';
const fixture=()=>({revision:'current',selection:[2],options:{mode:'auto',unit:1,tolerance:.15},analysis:{state:{labels:[2,3]},vertices:['private mesh'],regions:[{edit_id:2,type:'PLANE',faces:[0],protected_faces:0,radius_mm:3,reason:'untrusted text'},{edit_id:3,type:'CYLINDER',faces:[1],protected_faces:1}]}});
function harness(){let source=fixture(),calls=[],shown=[],commits=[],cleared=0,cancelled=[],nativeCancelled=0;const settings={protocol:'responses',baseUrl:'https://example.invalid/v1',model:'existing-model',reasoningEffort:'high'};let response=async args=>({revision:args.scene.revision,label:'Flächen',commands:[{op:'protect',regions:[2],enabled:true}]});let calculate=async()=>({state:{labels:[2,3],protected:[0]}});const ai=createConverterAI({desktop:{getAISettings:async()=>settings,generateAI:async args=>{calls.push(args);return response(args);},cancelAI:async args=>cancelled.push(args)},snapshot:()=>source,prepare:()=>({run:()=>calculate(),cancel:()=>nativeCancelled++}),show:value=>shown.push(value),clear:()=>cleared++,commit:value=>commits.push(value)});return {ai,calls,shown,commits,cancelled,get cleared(){return cleared;},get nativeCancelled(){return nativeCancelled;},setSource:value=>source=value,setResponse:value=>response=value,setCalculate:value=>calculate=value};}
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};};
test('Converter context contains bounded selected summaries, no triangle arrays, paths or free model text',()=>{const s=converterAIScene(fixture());assert.deepEqual(s.selection,[2]);assert.equal(s.regions.length,1);assert.equal(s.regions[0].radius_mm,3);assert.ok(!/private|untrusted|vertices|faces|labels|reason/.test(JSON.stringify(s)));const many=fixture();many.selection=[];many.analysis.regions=Array.from({length:257},(_,edit_id)=>({edit_id,type:'PLANE',faces:[]}));assert.throws(()=>converterAIScene(many),/256/);many.selection=[256];assert.equal(converterAIScene(many).regions.length,1);});
test('STL region summary describes the selected face and the entire part in millimetres', () => {
  const source = fixture();
  Object.assign(source.analysis, {
    bounds_mm: [[-10, -6, 0], [12, 8, 3]],
    vertices: [[-10, -6, 0], [-9.124, -5, 0], [-8, -6, 3], [12, 8, 3]],
    faces: [[0, 1, 2], [1, 2, 3]],
  });
  const scene = JSON.parse(JSON.stringify(converterAIScene(source)));
  assert.deepEqual(scene.boundsMM, [[-10, -6, 0], [12, 8, 3]]);
  assert.deepEqual(scene.regions.map(({ id, boundsMM }) => [id, boundsMM]), [
    [2, [[-10, -6, 0], [-8, -5, 3]]],
  ]);
  assert.ok(!/vertices|faces/.test(JSON.stringify(scene)));
  source.selection = [];
  assert.deepEqual(converterAIScene(source).regions[1].boundsMM, [[-9.12, -6, 0], [12, 8, 3]]);
});

test('First manual region request has the spatial convention and measured bounds', async () => {
  const source = fixture();
  Object.assign(source.analysis, {
    bounds_mm: [[-3, -2, 0], [4, 5, 2]],
    vertices: [[-3, -2, 0], [-2, -2, 0], [-3, -1, 2]],
    faces: [[0, 1, 2]],
  });
  const h = harness();
  h.setSource(source);
  await h.ai.request('Schütze den ausgewählten Bereich');
  assert.equal(h.calls.length, 1);
  const { context, scene } = h.calls[0];
  assert.match(context.coordinateConvention, /minimum and maximum.*millimetres/);
  assert.equal(scene.units, 'mm');
  assert.deepEqual(scene.boundsMM, [[-3, -2, 0], [4, 5, 2]]);
  assert.deepEqual(scene.regions[0].boundsMM, [[-3, -2, 0], [-2, -1, 2]]);
});

test('Unknown commands, foreign IDs, protected edits, malformed values and oversized batches are rejected',()=>{const f=fixture();f.selection=[];const scene=converterAIScene(f),check=commands=>validateConverterAIProposal({revision:'current',commands},scene);for(const command of [{op:'delete',regions:[2]},{op:'type',regions:[9],type:'PLANE'},{op:'type',regions:[3],type:'PLANE'},{op:'protect',regions:[2],enabled:1},{op:'protect',regions:[2,2],enabled:true},{op:'merge',regions:[2]},{op:'protect',regions:[2],enabled:true,path:'private'}])assert.throws(()=>check([command]));assert.throws(()=>check(Array(21).fill({op:'protect',regions:[2],enabled:true})));assert.equal(check([{op:'protect',regions:[3],enabled:false}]).length,1);assert.throws(()=>validateConverterAIProposal({revision:'old',commands:[]},scene),/älteren/);});
test('Shared provider selection travels without secrets; native preview, discard and explicit Apply are separate',async()=>{const h=harness();await h.ai.request('Schützen');assert.equal(h.calls[0].domain,'converter');assert.equal(h.calls[0].requestConfig.model,'existing-model');assert.ok(!JSON.stringify(h.calls).includes('apiKey'));assert.equal(h.shown.length,1);assert.equal(h.commits.length,0);h.ai.discard();assert.equal(h.commits.length,0);assert.equal(h.ai.state().pending,false);await h.ai.request('Schützen');h.ai.apply();assert.equal(h.commits.length,1);assert.equal(h.ai.state().pending,false);});
test('Late provider reply after cancel never invokes native preview and cancels only its own request ID',async()=>{const h=harness(),wait=deferred();h.setResponse(()=>wait.promise);const request=h.ai.request('Schützen');await new Promise(r=>setImmediate(r));const id=h.calls[0].requestId;h.ai.cancel();wait.resolve({revision:'current',commands:[{op:'protect',regions:[2],enabled:true}]});await assert.rejects(request,/geändert/);assert.deepEqual(h.cancelled,[{requestId:id}]);assert.equal(h.shown.length,0);});
test('Native late preview, changed source and stale Apply cannot commit',async()=>{const h=harness(),wait=deferred();h.setCalculate(()=>wait.promise);const request=h.ai.request('Schützen');await new Promise(r=>setImmediate(r));h.ai.cancel();wait.resolve({state:{}});await assert.rejects(request,/geändert/);assert.equal(h.nativeCancelled,1);assert.equal(h.shown.length,0);h.setCalculate(async()=>({state:{}}));await h.ai.request('Schützen');h.setSource({...fixture(),revision:'new'});assert.throws(()=>h.ai.apply(),/geändert/);assert.equal(h.commits.length,0);});
test('Questions, provider and native errors do not produce a pending proposal',async()=>{const h=harness();h.setResponse(async()=>({question:'Welcher Bereich?'}));assert.equal((await h.ai.request('Ändern')).question,'Welcher Bereich?');assert.equal(h.ai.state().pending,false);h.setResponse(async()=>{throw Error('provider failed');});await assert.rejects(h.ai.request('Ändern'),/provider failed/);h.setResponse(async()=>({revision:'current',commands:[{op:'protect',regions:[2],enabled:true}]}));h.setCalculate(async()=>{throw Error('native failed');});await assert.rejects(h.ai.request('Ändern'),/native failed/);assert.deepEqual(h.ai.state(),{busy:false,pending:false});assert.equal(h.commits.length,0);});
