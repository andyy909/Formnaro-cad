import test from 'node:test';
import assert from 'node:assert/strict';
import {createAITaskProgress,aiCandidateQuality,compareAIQuality,aiCandidateGeometry} from '../src/cad-ai-task-progress.js';
import {runCadAIRequest} from '../src/cad-ai-request.js';

const scene=()=>({revision:'unchanged',selectionTargets:[]});
const mismatch=actual=>({verification:{passed:false,checks:[{passed:false,expected:[60,40,6],actual:[actual,40,6],error:{code:'AI_RESULT_MISMATCH',message:'Width differs'},feedback:{checkIndex:1,checkKind:'size',expected:[60,40,6],actual:[actual,40,6]}}]}});
const failure=()=>Object.assign(Error('Native loft has the same invalid BOP'),{code:'FREECAD_FAILED',feedback:{geometryCheck:{valid:false,check:'BOPAlgo_SelfIntersect'}}});

test('A measured candidate nearer the immutable target wins; later worse or merely renamed equal candidates cannot evict it',async()=>{
 const discarded=[];let calls=0;
 const outcome=await runCadAIRequest({input:{},maxSteps:24,visualReview:false,access:{scene,context:()=>({}),preview:async()=>({previewId:'p'+calls,...mismatch([40,55,45,55,55][calls-1])}),discard:id=>discarded.push(id)},generate:async()=>({revision:'unchanged',label:'renamed-'+(++calls),commands:[]})});
 assert.equal(calls,5);assert.equal(outcome.proposal.previewId,'p2');assert.equal(outcome.proposal.verification.checks[0].actual[0],55);assert.equal(outcome.proposal.correctionError.code,'AI_TASK_STALLED');assert.equal(outcome.taskProgress.stop.reason,'repeated-failure');assert.deepEqual(discarded,['p1','p3','p4','p5']);
});
test('Three identical native failures stop an 80-step request with the concrete cause and no fourth provider or tool call',async()=>{
 let generated=0,previewed=0;const phases=[];
 await assert.rejects(runCadAIRequest({input:{},maxSteps:80,visualReview:false,onProgress:async p=>phases.push(p),access:{scene,context:()=>({}),preview:async()=>{previewed++;throw failure();}},generate:async()=>{generated++;return {revision:'unchanged',commands:[{op:'tool',engine:'freecad',operation:{kind:'build'}}]};}}),e=>e.code==='AI_TASK_STALLED'&&e.feedback.lastFailure.code==='FREECAD_FAILED'&&e.message.includes('BOP')&&e.taskProgress.usedSteps===3);
 assert.equal(generated,3);assert.equal(previewed,3);assert.equal(phases.at(-1).phase,'stopped');assert.equal(phases.at(-1).taskEvidence.failures[0].occurrences,3);
});
test('A renamed measurement with unchanged values cannot consume the whole extended budget',async()=>{
 let calls=0,measured=0;
 await assert.rejects(runCadAIRequest({input:{},maxSteps:24,access:{scene,context:()=>({}),analyze:async()=>({results:[{id:'renamed-result-'+(++measured),revision:'ephemeral',value:{size:[10,20,30]}}]})},generate:async()=>({revision:'unchanged',analysis:[{id:'renamed-'+(++calls),engine:'app',kind:'bounds',options:{}}]})}),{code:'AI_TASK_STALLED'});
 assert.equal(calls,3);assert.equal(measured,3);
});
test('An intervening useful measurement cannot erase the repeated cause of a failed construction route',()=>{
 const p=createAITaskProgress({maxSteps:24});
 for(let i=0;i<2;i++){p.claimStep();assert.equal(p.failed(failure(),{commands:[{op:'tool',engine:'freecad'}]}),null);p.claimStep();assert.equal(p.analysis([{engine:'app',kind:'bounds'}],{results:[{value:{length:i+1}}]}),null);}
 p.claimStep();assert.equal(p.failed(failure(),{commands:[{op:'tool',engine:'freecad'}]}).code,'AI_TASK_STALLED');assert.equal(p.snapshot().usedSteps,5);
});
test('Six distinct unsuccessful steps stop without a quality gain even when error wording and tool routes alternate',()=>{
 const p=createAITaskProgress({maxSteps:80});let stop;
 for(let i=0;i<6;i++){p.claimStep();stop=p.failed({code:'DIFFERENT_'+i,message:'attempt '+i},{commands:[{op:i%2?'python':'script'}]});if(i<5)assert.equal(stop,null);}
 assert.equal(stop.feedback.reason,'no-progress');assert.equal(p.snapshot().usedSteps,6);
});
test('A genuine improvement in measured checks permits further corrections within the same budget',async()=>{
 let calls=0;
 const r=await runCadAIRequest({input:{},maxSteps:24,visualReview:false,access:{scene,context:()=>({}),preview:async()=>({previewId:'p'+calls,...(calls<7?mismatch(30+calls*4):{verification:{passed:true,checks:[{expected:[60,40,6],actual:[60,40,6],passed:true}]}})})},generate:async()=>({revision:'unchanged',commands:[],label:String(++calls)})});
 assert.equal(calls,7);assert.equal(r.proposal.previewId,'p7');assert.equal(r.taskProgress.stop,null);assert.equal(r.taskProgress.usedSteps,7);
});
test('Serialized progress preserves budget and both failure and measurement repetitions across process-like reconstruction',()=>{
 let p=createAITaskProgress({maxSteps:24});p.claimStep();p.failed(failure(),{});p.claimStep();p.failed(failure(),{});
 p=createAITaskProgress({maxSteps:24,snapshot:JSON.parse(JSON.stringify(p.snapshot()))});p.claimStep();assert.equal(p.failed(failure(),{}).code,'AI_TASK_STALLED');assert.throws(()=>p.claimStep(),{code:'AI_TASK_STALLED'});
 let q=createAITaskProgress({maxSteps:7});for(let i=0;i<2;i++){q.claimStep();q.analysis([{engine:'app',kind:'bounds'}],{results:[{id:'i'+i,value:{volume:10}}]});}
 q=createAITaskProgress({maxSteps:7,snapshot:JSON.parse(JSON.stringify(q.snapshot()))});q.claimStep();assert.equal(q.analysis([{engine:'app',kind:'bounds'}],{results:[{id:'new',value:{volume:10}}]}).code,'AI_TASK_STALLED');
 const exhausted=createAITaskProgress({maxSteps:7});for(let i=0;i<7;i++)exhausted.claimStep();const loaded=createAITaskProgress({maxSteps:7,snapshot:exhausted.snapshot()});assert.throws(()=>loaded.claimStep(),{code:'AI_ANALYSIS_LIMIT'});
});
test('Snapshot budgets, purpose, counts and duplicate identities cannot be relaxed on reconstruction',()=>{
 const p=createAITaskProgress({maxSteps:7}),s=p.snapshot();
 for(const options of [{maxSteps:8},{purpose:'generative'}])assert.throws(()=>createAITaskProgress({...options,snapshot:s}),{code:'AI_TASK_PROGRESS_INVALID'});
 for(const patch of [{usedSteps:8},{withoutProgress:-1},{bestQuality:[NaN,0,0,0,0]},{injected:'secret'},{observations:[{key:'a'.repeat(64),count:1},{key:'a'.repeat(64),count:1}]}])assert.throws(()=>createAITaskProgress({snapshot:{...s,...patch}}),{code:'AI_TASK_PROGRESS_INVALID'});
});
test('Technical and generative tasks keep native validity and explicit dimensions ahead of qualitative visual approval',()=>{
 const valid=mismatch(55),invalid={...mismatch(60),independentCheck:{passed:false},visualReview:{status:'reviewed'}};
 assert(compareAIQuality(aiCandidateQuality(valid),aiCandidateQuality(invalid))<0);
 const p=createAITaskProgress({purpose:'generative'});assert.equal(p.snapshot().purpose,'generative');assert.throws(()=>createAITaskProgress({purpose:'invented'}));
});
test('A requested visual correction is reviewed on the new live candidate and does not reuse a discarded preview',async()=>{
 let calls=0;const captures=[],discarded=[],saved=[];
 const r=await runCadAIRequest({input:{},maxSteps:24,onProgress:p=>saved.push(p),access:{scene,context:()=>({}),preview:async()=>({previewId:'p'+calls,revision:'unchanged',verification:{passed:true,checks:[]}}),inspectPreview:async id=>{assert(!discarded.includes(id));captures.push(id);return {previewId:id,revision:'unchanged',views:[],images:[]};},discard:id=>discarded.push(id)},generate:async()=>{calls++;if(calls===3)return {revision:'unchanged',review:{previewId:'p2',accepted:true,observations:'Shape improved; dimensions unclaimed.'}};return {revision:'unchanged',commands:[],label:'shape'+calls};}});
 assert.equal(calls,3);assert.deepEqual(captures,['p1','p2']);assert.equal(r.proposal.previewId,'p2');assert.equal(r.proposal.visualReview.status,'reviewed');assert.deepEqual(discarded,['p1']);assert.equal(saved.at(-1).phase,'completed');assert.equal(saved.at(-1).candidate.proposal.visualReview.status,'reviewed');
});
test('A failed checkpoint stops before the next provider request and does not retry persistence as a modelling correction',async()=>{
 let calls=0,writes=0;await assert.rejects(runCadAIRequest({input:{},maxSteps:24,onProgress:async()=>{if(++writes===1)throw Error('disk full');},access:{scene,context:()=>({})},generate:async()=>{calls++;}}),{code:'AI_TASK_CHECKPOINT_FAILED'});assert.equal(calls,0);
});
test('Candidate identity ignores renamed source IDs and archive timestamps but includes actual complete mesh buffers and placement',()=>{
 const a={nodes:[{id:'a',name:'first',kind:'mesh',mesh:{verts:[0,0,0,1,0,0,0,1,0],triangles:[0,1,2]},transform:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],metadata:{archiveDate:'old'}}]},b=structuredClone(a);b.nodes[0].id='new-id';b.nodes[0].name='renamed';b.nodes[0].metadata.archiveDate='new';assert.equal(aiCandidateGeometry(a),aiCandidateGeometry(b));b.nodes[0].mesh.verts[3]=2;assert.notEqual(aiCandidateGeometry(a),aiCandidateGeometry(b));b.nodes[0].mesh.verts[3]=1;b.nodes[0].transform[12]=1;assert.notEqual(aiCandidateGeometry(a),aiCandidateGeometry(b));
});
test('A failed final checkpoint is not retried, and an unpersisted completed draft is discarded before returning control',async()=>{
 let calls=0,writes=0;const discarded=[];
 await assert.rejects(runCadAIRequest({input:{},visualReview:false,onProgress:p=>{if(p.phase==='completed'){writes++;throw Error('final disk write failed');}},access:{scene,context:()=>({}),preview:async()=>({previewId:'draft',verification:{passed:true,checks:[]}}),discard:id=>discarded.push(id)},generate:async()=>{calls++;return {revision:'unchanged',commands:[]};}}),{code:'AI_TASK_CHECKPOINT_FAILED'});
 assert.equal(calls,1);assert.equal(writes,1);assert.deepEqual(discarded,['draft']);
});
