const test=require('node:test'),assert=require('node:assert/strict');
const {validatePracticePlan}=require('../backend/practice-runner.cjs');
const p=actions=>({version:1,title:'Prüfung',actions});
test('semantic actions reject script, arbitrary selectors, URLs and extra fields',()=>{
 for(const action of [{kind:'click',selector:'body'}, {kind:'shape',type:'box',as:'a',script:'evil'}, {kind:'open',url:'https://example.org'}, {kind:'set',field:'__proto__',value:1}, {kind:'shape',type:'box',as:'../../file'}])assert.throws(()=>validatePracticePlan(p([action])));
});
test('nonfinite, huge and negative dimensions are rejected after shape insertion',()=>{
 for(const v of [NaN,Infinity,10001,-1,0])assert.throws(()=>validatePracticePlan(p([{kind:'shape',type:'box',as:'part'},{kind:'set',field:'size-0',value:v}])));
});
test('grouped-away roots cannot later be selected as if still present',()=>{
 assert.throws(()=>validatePracticePlan(p([{kind:'shape',type:'box',as:'base'},{kind:'shape',type:'cylinder',as:'hole'},{kind:'select',targets:['base','hole']},{kind:'group',as:'part'},{kind:'select',targets:['base']}] )));
});
