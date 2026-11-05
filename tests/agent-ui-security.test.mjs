import test from 'node:test';import assert from 'node:assert/strict';
import {validateAgentUIRequest,AGENT_UI_TARGETS} from '../src/cad-agent-ui-policy.js';
import {createAgentUIAccess} from '../src/cad-agent-ui.js';
const plan={version:1,title:'Platte',actions:[{kind:'shape',type:'box',as:'platte'},{kind:'set',field:'size-0',value:60}]};
test('MCP UI validates the whole plan and rejects OS, URLs, selectors, file/provider controls and model commits',()=>{
 const targets=['settings:ai','settings:files','tool:import','tool:export','tool:new','tool:undo','region:preview-apply','https://example.invalid','#ai-key','shell:run','window:other'];
 for(const target of targets)assert.throws(()=>validateAgentUIRequest({action:'guide',revision:'r',steps:[{action:'click',target:'menu:cad'},{action:'click',target}]}),target);
 for(const field of ['x','y','selector','key','url','path','code','command'])assert.throws(()=>validateAgentUIRequest({action:'guide',revision:'r',steps:[{action:'point',target:'region:viewport',[field]:'bad'}]}));
 for(const action of ['run','click','key','shell','openExternal','note','apply'])assert.throws(()=>validateAgentUIRequest({action}));
 assert.throws(()=>validateAgentUIRequest({action:'practice',revision:'r',plan:{...plan,actions:[{kind:'shell',command:'bad'}]}}));
 assert.throws(()=>validateAgentUIRequest({action:'practice',revision:'r',plan:{...plan,path:'C:/outside'}}));
 assert.equal(validateAgentUIRequest({action:'practice',revision:'r',plan}).plan.actions.length,2);
 assert.equal(AGENT_UI_TARGETS.find(t=>t.id==='tool:section').click,false);
});
test('Rejected UI plan executes no earlier valid step; parent revision and busy guards are enforced',async()=>{
 let calls=0;const assistant={state:()=>({targets:[]}),execute:async()=>{calls++;return {completed:true};},cancel(){}};
 const ui=createAgentUIAccess({assistant,getRevision:()=> 'current'});
 await assert.rejects(ui.request({action:'guide',revision:'current',steps:[{action:'click',target:'menu:cad'},{action:'click',target:'tool:export'}]}));assert.equal(calls,0);
 await assert.rejects(ui.request({action:'guide',revision:'old',steps:[{action:'click',target:'menu:cad'}]}),e=>e.code==='STALE_REVISION');assert.equal(calls,0);
 const busy=createAgentUIAccess({assistant,getRevision:()=> 'current',isBusy:()=>true});await assert.rejects(busy.request({action:'practice',revision:'current',plan}),/Bearbeitung/);assert.equal(calls,0);ui.dispose();busy.dispose();
});
test('A UI job reports running until real completion; cancel-before-start never executes the operation',async()=>{
 let revision='r',resolve,calls=0;const assistant={state:()=>({targets:[]}),execute:async()=>{calls++;return new Promise(r=>resolve=r);},cancel(){resolve?.({completed:false});}};
 const ui=createAgentUIAccess({assistant,getRevision:()=>revision});const job=await ui.request({action:'practice',revision:'r',plan});assert.equal(job.state,'running');await new Promise(r=>setImmediate(r));assert.equal(calls,1);assert.equal((await ui.request({action:'status',jobId:job.jobId})).state,'running');resolve({kind:'practice',ok:true,report:{objectCount:1}});await new Promise(r=>setImmediate(r));assert.equal((await ui.request({action:'status',jobId:job.jobId})).state,'completed');
 const pending=ui.request({action:'practice',revision:'r',plan});ui.cancel();await pending;await new Promise(r=>setImmediate(r));assert.equal(calls,1);ui.dispose();
});
test('Changed parent revision turns an apparently successful result into a failed job',async()=>{
 let revision='r',resolve;const assistant={execute:()=>new Promise(r=>resolve=r),cancel(){},state:()=>({targets:[]})};const ui=createAgentUIAccess({assistant,getRevision:()=>revision});const job=await ui.request({action:'practice',revision:'r',plan});await new Promise(r=>setImmediate(r));revision='changed';resolve({kind:'practice',ok:true});await new Promise(r=>setImmediate(r));const status=await ui.request({action:'status',jobId:job.jobId});assert.equal(status.state,'failed');assert.equal(status.modelChanged,true);ui.dispose();
});

test('failed exercise feedback reaches job status with the actual dialog fields',async()=>{
 const feedback={retryable:false,practice:{ok:false,report:{dialog:{controls:[{target:'ui:id:wall',value:'3'}]}}}};
 const assistant={execute:async()=>{throw Object.assign(Error('Feld fehlt'),{code:'PRACTICE_FAILED',feedback});},cancel(){}};
 const ui=createAgentUIAccess({assistant,getRevision:()=> 'r'}),job=await ui.request({action:'practice',revision:'r',plan});await new Promise(r=>setImmediate(r));
 const status=await ui.request({action:'status',jobId:job.jobId});assert.equal(status.state,'failed');assert.deepEqual(status.feedback,feedback);ui.dispose();
});
