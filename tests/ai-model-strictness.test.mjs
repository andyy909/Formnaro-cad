import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAIModelStrictness,readAIModelStrictness,aiModellingPolicy,aiStrictnessDecision} from '../src/ai-model-strictness.js';
import {runCadAIRequest} from '../src/cad-ai-request.js';
test('strictness defaults preserve existing behavior, reject invalid values and scale numeric allowances monotonically',()=>{
 assert.equal(readAIModelStrictness({getItem:()=>null}),100);for(const v of [-1,101,.5,NaN,'0'])assert.throws(()=>validateAIModelStrictness(v));
 const verification={passed:false,checks:[{kind:'size',passed:false,expected:[10,20,30],actual:[10.015,20,30],tolerance:.01}]};
 assert.equal(aiStrictnessDecision(verification,100).accepted,false);assert.equal(aiStrictnessDecision(verification,50).accepted,true);assert.equal(aiStrictnessDecision(verification,0).accepted,true);assert.equal(verification.checks[0].passed,false);
 assert.equal(aiStrictnessDecision({checks:[{kind:'solids',passed:false,expected:1,actual:2}]},1).accepted,false);
 assert.equal(aiModellingPolicy(0).toleranceScale,null);
});
test('free modelling avoids dimensional correction loops while preserving measured failures, fixed checks and explicit Apply',async()=>{
 let generated=0,previewed=0;const check={kind:'size',target:{rootId:'a',path:[]},space:'edit',expected:[10,20,30],tolerance:.01};
 const before=JSON.stringify(check),result=await runCadAIRequest({input:{modelStrictness:0},requirements:{objective:'Create a draft',purpose:'technical',assumptions:[],checks:[check],protectedTargets:[]},visualReview:false,access:{scene:()=>({revision:'r',selectionTargets:[]}),context:()=>({}),preview:async request=>{previewed++;assert.deepEqual(request.checks,[check]);return {previewId:'p',revision:'r',verification:{version:1,passed:false,checks:[{...check,actual:[20,20,30],passed:false,error:{code:'AI_RESULT_MISMATCH',message:'Different width'},feedback:{checkKind:'size',expected:10,actual:20,tolerance:.01}}]}};}},generate:async input=>{generated++;assert.equal(input.context.modellingPolicy.strictness,0);return {revision:'r',commands:[],checks:[check]};}});
 assert.equal(generated,1);assert.equal(previewed,1);assert.equal(result.proposal.verification.passed,false);assert.equal(result.proposal.verification.modellingPolicy.accepted,true);assert.equal(result.correctionAttempts,0);assert.equal(JSON.stringify(check),before);
});
test('free modelling still refuses a failed geometry computation and stale revision',async()=>{
 await assert.rejects(runCadAIRequest({input:{modelStrictness:0},access:{scene:()=>({revision:'r',selectionTargets:[]}),context:()=>({}),preview:async()=>{throw Object.assign(Error('Invalid geometry'),{code:'INVALID_GEOMETRY',feedback:{retryable:false}});}},generate:async()=>({revision:'r',commands:[]})}),/Invalid geometry/);
});
