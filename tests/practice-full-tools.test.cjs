const test=require('node:test'),assert=require('node:assert/strict');
const {validatePracticePlan}=require('../backend/practice-runner.cjs');
test('practice exposes every registered native shape and the complete modelling command route',async()=>{
 const {CAD_SHAPES}=await import('../src/cad-shapes.js'),{validateAgentPracticePlan}=await import('../src/cad-agent-ui-policy.js');
 for(const shape of CAD_SHAPES){const plan={version:1,title:'Native Form',actions:[{kind:'shape',type:shape.type,as:'body'}]};assert.deepEqual(validatePracticePlan(plan),plan);assert.deepEqual(validateAgentPracticePlan(plan),plan);}
 const gears=require('./fixtures/practice-three-gears.json');assert.deepEqual(validatePracticePlan(gears),gears);assert.deepEqual(validateAgentPracticePlan(gears),gears);
 for(const action of [{kind:'model',commands:[],path:'outside'},{kind:'model',commands:[{op:'create'}],url:'https://example.test'},{kind:'open',command:'shell'},{kind:'click',selector:'body'}])assert.throws(()=>validatePracticePlan({version:1,title:'Test',actions:[action]}));
});
