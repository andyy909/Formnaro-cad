import test from 'node:test';import assert from 'node:assert/strict';import {createCadAutomationSession} from '../src/cad-automation-session.js';
test('Only the matching external preview can cancel native work, and a late result is discarded',async()=>{
 let finish,cancelled=0,discarded=[];const session=createCadAutomationSession({dispatch:()=>new Promise(r=>{finish=r;}),cancel:()=>cancelled++,discard:id=>discarded.push(id)});
 const pending=session.run('preview',{},17);assert.equal(session.cancel(16),false);assert.equal(session.cancel(17),true);assert.equal(session.cancel(17),false);finish({previewId:'late'});await assert.rejects(pending,{name:'AbortError',code:'ABORTED'});assert.equal(cancelled,1);assert.deepEqual(discarded,['late']);assert.equal(session.cancel(17),false);
});
test('Disconnecting an Apply never cancels or repeats the committing transaction',async()=>{
 let finish,cancelled=0;const session=createCadAutomationSession({dispatch:()=>new Promise(r=>{finish=r;}),cancel:()=>cancelled++});const pending=session.run('apply',{},2);assert.equal(session.cancel(2),false);finish({applied:true});assert.deepEqual(await pending,{applied:true});assert.equal(cancelled,0);
});
