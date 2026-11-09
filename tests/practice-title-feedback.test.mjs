import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {validateAgentPracticePlan} from '../src/cad-agent-ui-policy.js';
const {validatePracticePlan}=createRequire(import.meta.url)('../backend/practice-runner.cjs');
test('both practice validators identify an overlong plan title and its actual limit',()=>{
 const plan={version:1,title:'x'.repeat(201),actions:[{kind:'shape',type:'box',as:'body'}]};
 for(const validate of [validatePracticePlan,validateAgentPracticePlan])assert.throws(()=>validate(plan),e=>/title/.test(e.message)&&/201/.test(e.message)&&/200/.test(e.message));
});
