const test=require('node:test'),assert=require('node:assert/strict');
const {validatePracticePlan}=require('../backend/practice-runner.cjs');

test('practice keeps tool effects while loading exact alignment controls on demand',async()=>{
 const {AGENT_UI_CONTRACT}=await import('../src/cad-agent-ui-policy.js');
 const text=require('../backend/ai-practice-prompt.cjs').practiceSystem({agentUI:AGENT_UI_CONTRACT});
 assert(text.includes('toolReference'));
 assert(text.includes('bottom to Z0'));
 assert((await require('../backend/ai-tool-reference.cjs').reference({tool:'align'},{practiceOnly:true})).tool.controls.some(c=>c.target==='ui:id:align-y-center'));
 assert.equal(AGENT_UI_CONTRACT.targets.find(t=>t.id==='tool:center').click,false,'live navigation stays point-only');
});
test('practice exposes native shapes and actual joint replay while rejecting hidden command routes',async()=>{
 const {CAD_SHAPES}=await import('../src/cad-shapes.js'),{validateAgentPracticePlan}=await import('../src/cad-agent-ui-policy.js');
 for(const shape of CAD_SHAPES){const plan={version:1,title:'Native Form',actions:[{kind:'shape',type:shape.type,as:'body'}]};assert.deepEqual(validatePracticePlan(plan),plan);assert.deepEqual(validateAgentPracticePlan(plan),plan);}
 const gears=require('./fixtures/practice-three-gears.json');assert.deepEqual(validatePracticePlan(gears),gears);assert.deepEqual(validateAgentPracticePlan(gears),gears);
 for(const action of [{kind:'model',commands:[],path:'outside'},{kind:'model',commands:[{op:'create'}],url:'https://example.test'},{kind:'open',command:'shell'},{kind:'click',selector:'body'},...['python','script','tool','pattern','transform','mesh','freecadRerun'].map(op=>({kind:'model',commands:[{op,code:'hidden'}]}))]){const plan={version:1,title:'Test',actions:[action]};assert.throws(()=>validatePracticePlan(plan));assert.throws(()=>validateAgentPracticePlan(plan));}
});
