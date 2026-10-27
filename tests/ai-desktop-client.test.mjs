import test from 'node:test';
import assert from 'node:assert/strict';
import {generateDesktopAI} from '../src/ai-desktop-client.js';
import {runCadAIRequest} from '../src/cad-ai-request.js';
test('plain desktop reply preserves retry usage and structured error evidence in the renderer',async()=>{
 const usage={inputTokens:80,outputTokens:40};
 await assert.rejects(generateDesktopAI({generateAIReply:async()=>({ok:false,error:'AI output was truncated.',code:'AI_OUTPUT_INVALID',aiRetryable:true,aiUsage:usage,feedback:{retryable:true}})},{}),e=>e.code==='AI_OUTPUT_INVALID'&&e.aiRetryable&&e.aiUsage===usage&&e.feedback.retryable);
 assert.deepEqual(await generateDesktopAI({generateAIReply:async()=>({ok:true,value:{message:'Ready'}})},{}),{message:'Ready'});
});
test('provider truncation through the plain desktop protocol is corrected by the actual bounded request loop',async()=>{
 let calls=0;const desktop={generateAIReply:async()=>++calls===1?{ok:false,error:'AI output was truncated.',code:'AI_OUTPUT_INVALID',aiRetryable:true}:{ok:true,value:{revision:'r',commands:[{op:'create',type:'box'}]}}};
 const result=await runCadAIRequest({input:{prompt:'Build'},generate:args=>generateDesktopAI(desktop,args),access:{scene:()=>({revision:'r'}),context:()=>({}),preview:async()=>({previewId:'p'})}});
 assert.equal(calls,2);assert.equal(result.correctionAttempts,1);assert.equal(result.proposal.previewId,'p');
});
test('legacy desktop providers remain usable and malformed envelopes cannot invent a success',async()=>{
 assert.equal(await generateDesktopAI({generateAI:async()=>42},{}),42);
 await assert.rejects(generateDesktopAI({generateAIReply:async()=>({value:'not confirmed'})},{}),/Ungültige/);
});
