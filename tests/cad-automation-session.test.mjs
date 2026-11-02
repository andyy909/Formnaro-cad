import test from 'node:test';import assert from 'node:assert/strict';import {createCadAutomationSession} from '../src/cad-automation-session.js';
test('Only the matching external preview can cancel native work, and a late result is discarded',async()=>{
 let finish,cancelled=0,discarded=[];const session=createCadAutomationSession({dispatch:()=>new Promise(r=>{finish=r;}),cancel:()=>cancelled++,discard:id=>discarded.push(id)});
 const pending=session.run('preview',{},17);assert.equal(session.cancel(16),false);assert.equal(session.cancel(17),true);assert.equal(session.cancel(17),false);finish({previewId:'late'});await assert.rejects(pending,{name:'AbortError',code:'ABORTED'});assert.equal(cancelled,1);assert.deepEqual(discarded,['late']);assert.equal(session.cancel(17),false);
});
test('Disconnecting an Apply never cancels or repeats the committing transaction',async()=>{
 let finish,cancelled=0;const session=createCadAutomationSession({dispatch:()=>new Promise(r=>{finish=r;}),cancel:()=>cancelled++});const pending=session.run('apply',{},2);assert.equal(session.cancel(2),false);finish({applied:true});assert.deepEqual(await pending,{applied:true});assert.equal(cancelled,0);
});

test('Completed external preview is handed to its own display before returning and remains cancellable during display',async()=>{
 let finishDisplay,displayed=[],discarded=[],cancelled=0;const session=createCadAutomationSession({dispatch:async()=>({previewId:'completed'}),cancel:()=>cancelled++,discard:id=>discarded.push(id),completedPreview:async(result,id)=>{displayed.push([result.previewId,id]);await new Promise(r=>{finishDisplay=r;});}});
 const pending=session.run('preview',{},19);await new Promise(r=>setImmediate(r));assert.deepEqual(displayed,[['completed',19]]);assert.equal(session.cancel(18),false);assert.equal(session.cancel(19),true);finishDisplay();await assert.rejects(pending,{code:'ABORTED'});assert.deepEqual(discarded,['completed']);assert.equal(cancelled,1);
});

test('A cancelled native result is never displayed as a completed preview',async()=>{
 let finish,shown=0;const session=createCadAutomationSession({dispatch:()=>new Promise(r=>{finish=r;}),cancel:()=>{},completedPreview:()=>shown++});const pending=session.run('preview',{},20);session.cancel(20);finish({previewId:'late'});await assert.rejects(pending,{code:'ABORTED'});assert.equal(shown,0);
});

test('start progress runs inside the owning request before export dispatch',async()=>{
 const calls=[];let session;session=createCadAutomationSession({onStart:(method,id)=>calls.push([method,id,session.currentRequestId()]),dispatch:async()=>{calls.push('dispatch');return {ok:true};},cancel:()=>{}});await session.run('export',{},41);assert.deepEqual(calls,[['export',41,41],'dispatch']);
});
