import test from 'node:test';
import assert from 'node:assert/strict';
import {requestAITask} from '../src/cad-ai-task-desktop.js';
test('Task desktop transport reconstructs main-process conflict and stale errors with codes in the caller realm',async()=>{
 for(const code of ['BUSY','STALE_REVISION','AI_TASK_STALE','AI_TASK_BUDGET_REWIND'])await assert.rejects(requestAITask({aiTasksReply:async()=>({ok:false,error:'Concrete cause',code,feedback:{retryable:false}})},{action:'claim'}),e=>e.code===code&&e.message==='Concrete cause'&&e.feedback.retryable===false);
 const value={id:'saved',generation:2};assert.equal(await requestAITask({aiTasksReply:async()=>({ok:true,value})},{action:'read'}),value);
 await assert.rejects(requestAITask({},{}),{code:'AI_TASK_UNAVAILABLE'});await assert.rejects(requestAITask({aiTasksReply:async()=>({})},{}),{code:'AI_TASK_STORE_FAILED'});
});
