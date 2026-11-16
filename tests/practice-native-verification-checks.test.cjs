const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {checkPlateOpening}=require('../backend/practice-native-verification-checks.cjs');
const project={version:1,nodes:[{id:'body'}]},body={id:'body'},bounds={min:[0,0,0],max:[60,40,5]};
function fakeJs(result){
 const calls=[];let checksCount=0;const controller={
  restoreAITaskCandidate(value){calls.push(['restore',value]);return {previewId:'preview-1'};},
  checkPreview(previewId,checks,options){calls.push(['check',previewId,checks,options]);return typeof result==='function'?result(++checksCount):result;},
  discard(previewId){calls.push(['discard',previewId]);}
 };
 const js=script=>Promise.resolve(vm.runInNewContext(script,{window:{__cadTest:{controller}}})).then(value=>value===undefined?value:structuredClone(value));
 return {js,calls};
}
test('the helper restores the project copy, checks the centre and a shifted opening and releases the preview',async()=>{
 const {js,calls}=fakeJs(count=>({passed:count===1}));
 assert.deepEqual(await checkPlateOpening(js,project,body,bounds),{center:true,shifted:false});
 assert.equal(calls[0][0],'restore');
 assert.deepEqual(structuredClone(calls[0][1]),project);
 const recorded=calls.filter(call=>call[0]==='check').map(([,previewId,checks,options])=>[previewId,structuredClone(checks),structuredClone(options)]);
 assert.equal(recorded.length,2);
 for(const [previewId,checks,options] of recorded){
  assert.equal(previewId,'preview-1');
  assert.deepEqual(options,{collectFailures:true});
  assert.equal(checks.length,1);
  assert.deepEqual(checks[0].kind,'clearance');
  assert.equal(checks[0].target,'body');
  assert.equal(checks[0].diameter,7.99);
  assert.equal(checks[0].tolerance,.001);
  assert.deepEqual([checks[0].from[2],checks[0].to[2]],[-1,6]);
 }
 assert.deepEqual(recorded[0][1][0].from,[30,20,-1]);
 assert.deepEqual(recorded[1][1][0].from,[25,20,-1]);
 assert.deepEqual(calls.filter(call=>call[0]==='discard'),[['discard','preview-1']]);
});
test('an opening that also passes off-centre is rejected after the preview was released',async()=>{
 const {js,calls}=fakeJs(()=>({passed:true}));
 await assert.rejects(checkPlateOpening(js,project,body,bounds));
 assert.deepEqual(calls.filter(call=>call[0]==='discard'),[['discard','preview-1']]);
});
test('a failing check still releases the preview in the finally block',async()=>{
 const {js,calls}=fakeJs(()=>{throw Error('check failed');});
 await assert.rejects(checkPlateOpening(js,project,body,bounds),/check failed/);
 assert.deepEqual(calls.filter(call=>call[0]==='discard'),[['discard','preview-1']]);
});
