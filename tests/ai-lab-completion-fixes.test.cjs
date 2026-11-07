const {test}=require('node:test'),assert=require('node:assert/strict');
const {validatePracticePlan}=require('../backend/practice-runner.cjs');
const plan=actions=>({version:1,title:'Lokale Regressionsprobe',actions});
test('Recorded harmless select caption is accepted without dropping strict action fields',()=>{
 assert.deepEqual(validatePracticePlan(plan([{kind:'select',targets:['existing-1'],text:'Aufgabenteil auswählen'}]),1).actions[0].text,'Aufgabenteil auswählen');
 assert.throws(()=>validatePracticePlan(plan([{kind:'select',targets:['existing-1'],text:'Erklärung',script:'forbidden'}]),1));
});
test('Recorded chamfer plan is rejected before it shrinks the body under an active edge editor',()=>{
 const actions=[{kind:'ui',action:'click',target:'menu:cad'},{kind:'ui',action:'click',target:'ui:tool:edges'},{kind:'set',field:'size-0',value:1},{kind:'edge',target:'existing-1',sides:['top','front']}];
 assert.throws(()=>validatePracticePlan(plan(actions),1),/Bauteil|Werkzeug|Dialog/);
});
test('Recorded shell plan is rejected before it moves the body and invalidates thickness controls',()=>{
 const actions=[{kind:'ui',action:'click',target:'ui:tool:cad-shell'},{kind:'face',target:'existing-1',side:'top'},{kind:'set',field:'pos-2',value:0},{kind:'ui',action:'set',target:'ui:id:cad-modeling-thickness',value:'2'}];
 assert.throws(()=>validatePracticePlan(plan(actions),1),/Bauteil|Werkzeug|Dialog/);
});
test('Actual isolation visibility is retained separately from persistent hidden flags',async()=>{
 const {practiceStepObservation}=await import('../src/cad-practice-observation.js');
 const observation=practiceStepObservation({action:{kind:'ui'},index:0,total:1,revision:'0123456789abcdef',ok:true,scene:{objects:[{id:'target'},{id:'protected'}]},project:{nodes:[{id:'target'},{id:'protected'}]},selected:['target'],visible:['target'],undo:1});
 assert.equal(observation.actual.objects[0].visible,true);assert.equal(observation.actual.objects[1].visible,false);assert.equal(observation.actual.objects[1].hidden,false);
});
test('Final completion is separate from a recoverable continue recommendation',async()=>{
 const {createTrialMonitor}=require('../backend/ai-test-lab-monitor.cjs'),events=[];
 const m=createTrialMonitor({settings:{mode:'shadow',model:'deepseek-flash',effort:'low'},config:{baseUrl:'https://api.deepseek.com',model:'deepseek-flash'},key:'fixture',signal:new AbortController().signal,emit:e=>events.push(e),task:'Measure',facts:[],tools:[],completeModel:async()=>({text:JSON.stringify({verdict:'continue',reasonCode:'none',confidence:.8,explanation:'View can be corrected',evidence:'No measured result'}),data:{usage:{input_tokens:1,output_tokens:1}}})});
 await m.inspectFinal({status:'failed',error:{message:'Face obscured'},verification:null,cleanExit:true});
 const out=await m.finish();assert.equal(out.final.verdict,'continue');assert.equal(out.final.completion,'not-met');
});
test('Intentional body edits remain allowed before opening or explicitly reopening the tool',()=>{
 const actions=[{kind:'ui',action:'click',target:'ui:tool:edges'},{kind:'set',field:'size-0',value:50},{kind:'ui',action:'click',target:'ui:tool:edges'},{kind:'edge',target:'existing-1',sides:['top','front']}];
 assert.doesNotThrow(()=>validatePracticePlan(plan(actions),1));
});
test('The same total time limit reserves a final review after the execution deadline',async()=>{
 const {trialBudget}=require('../backend/ai-trial-budget.cjs'),parent=new AbortController(),budget=trialBudget(parent.signal,300,{reserveMs:180});
 assert.equal(budget.reservedMs,100);await new Promise(r=>setTimeout(r,220));assert.equal(budget.executionSignal.aborted,true);assert.equal(budget.finalSignal.aborted,false);
 const {createTrialMonitor}=require('../backend/ai-test-lab-monitor.cjs');let calls=0;
 const m=createTrialMonitor({settings:{mode:'shadow',model:'deepseek-flash',effort:'low'},config:{baseUrl:'https://api.deepseek.com',model:'deepseek-flash'},key:'fixture',signal:budget.executionSignal,finalSignal:budget.finalSignal,emit:()=>{},task:'Timed exercise',facts:[],tools:[],completeModel:async()=>{calls++;return {text:JSON.stringify({verdict:'uncertain',reasonCode:'insufficient_evidence',confidence:.5,explanation:'Timed out',evidence:'No final native result'}),data:{usage:{input_tokens:1,output_tokens:1}}};}});
 await m.inspectFinal({status:'timeout',verification:null,cleanExit:true});assert.equal((await m.finish()).final.completion,'not-met');assert.equal(calls,1);
 parent.abort();assert.equal(budget.finalSignal.aborted,true);
});
test('Supervisor receives complete initial inventory in addition to selected aliases',async()=>{
 const {createTrialMonitor}=require('../backend/ai-test-lab-monitor.cjs');let seen;
 const baseline={objectCount:4,objects:[{id:'target'},{id:'other1'},{id:'other2'},{id:'protected',protected:true}]};
 const m=createTrialMonitor({settings:{mode:'shadow',model:'deepseek-flash',effort:'low'},config:{baseUrl:'https://api.deepseek.com',model:'deepseek-flash'},key:'fixture',signal:new AbortController().signal,emit:()=>{},task:'Isolate',facts:[{alias:'existing-1'}],baseline,tools:[],completeModel:async(c,k,e)=>{seen=JSON.parse(e.user);return {text:JSON.stringify({verdict:'continue',reasonCode:'none',confidence:.8,explanation:'Unchanged inventory',evidence:'Four initial bodies'}),data:{usage:{input_tokens:1,output_tokens:1}}};}});
 await m.inspectFinal({status:'completed',verification:{passed:true},cleanExit:true});await m.finish();assert.equal(seen.facts.length,1);assert.deepEqual(seen.baseline,baseline);
});
test('Activity reports are removable and cannot change successful playback when a listener fails',()=>{
 const {observePracticeActivity,notifyPracticeActivity}=require('../backend/practice-observations.cjs'),win={},seen=[];
 const stop=observePracticeActivity(win,v=>seen.push(v));observePracticeActivity(win,()=>{throw Error('optional trace');});
 assert.doesNotThrow(()=>notifyPracticeActivity(win,{phase:'paused',reason:'focus-lost'}));stop();notifyPracticeActivity(win,{phase:'resumed'});assert.equal(seen.length,1);assert.equal(seen[0].reason,'focus-lost');
});
test('Missing joint-reply closing brace produces precise feedback without repairing model text',()=>{
 const {jsonSyntaxFeedback}=require('../backend/ai-json-feedback.cjs'),text='{"revision":"r","assistant":{"kind":"practice","plan":{"actions":[]}}';
 assert.throws(()=>JSON.parse(text));assert.match(jsonSyntaxFeedback(text),/1 unclosed/);assert.match(jsonSyntaxFeedback(text),/delimiters at the end: }/);assert.throws(()=>JSON.parse(text));
 assert.match(jsonSyntaxFeedback('{"text":"literal } and \\" quote","actions":[]}'),/one complete JSON object/);
});
