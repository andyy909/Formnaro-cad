const test=require('node:test'),assert=require('node:assert/strict');
const {startContext}=require('../backend/ai-start-context.cjs'),{taskInstance}=require('../backend/ai-test-lab-cases.cjs');
test('Long real thread prompt can prepare C and D without failing reference lookup',async()=>{for(const variant of ['C','D']){const result=await startContext({variant,prompt:taskInstance('thread','holdout').prompt,scene:{objects:[],selectionTargets:[]},lookup:async()=>({commands:[]})});assert.ok(result.text);}});

