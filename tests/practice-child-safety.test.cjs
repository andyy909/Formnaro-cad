const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {installPracticeChild}=require('../backend/practice-child.cjs');
function harness(results,{initialFocus=true}={}){
 const handlers=new Map(),channel=new EventEmitter(),sent=[],input=[],mainFrame={};channel.send=v=>sent.push(v);
 const contents={mainFrame,send:()=>{},sendInputEvent:v=>input.push(v),executeJavaScript:async()=>results.shift()};
 let focused=initialFocus;const win=Object.assign(new EventEmitter(),{webContents:contents,isDestroyed:()=>false,isFocused:()=>focused,getContentBounds:()=>({width:500,height:500}),close:()=>{}});
 installPracticeChild(win,{ipc:{handle:(n,f)=>handlers.set(n,f)},channel});const event={sender:contents,senderFrame:mainFrame};
 channel.emit('message',{type:'plan',nonce:'a'.repeat(48),plan:{version:1,title:'Test',actions:[{kind:'shape',type:'box',as:'block'}]}});
 return {handlers,event,input,win,sent,setFocused:value=>focused=value};
}
test('covered target never receives a native mouseDown',async()=>{
 const h=harness([{x:20,y:20,width:20,height:20},false]);await h.handlers.get('cad-practice:ready')(h.event);
 const r=await h.handlers.get('cad-practice:input')(h.event,{target:'shape:box',action:'click'});assert.equal(r.ok,false);assert.match(r.error,/verdeckt/);assert.deepEqual(h.input.map(v=>v.type),['mouseMove']);
});
test('lost focus stops before typing and unknown DOM targets are rejected',async()=>{
 const h=harness([{x:20,y:20,width:20,height:20},true,false]);await h.handlers.get('cad-practice:ready')(h.event);
 const r=await h.handlers.get('cad-practice:input')(h.event,{target:'size-0',action:'set',value:'42'});assert.equal(r.ok,false);assert.match(r.error,/Fokus/);assert(!h.input.some(v=>['char','keyDown','keyUp'].includes(v.type)));
 assert.equal((await h.handlers.get('cad-practice:input')(h.event,{target:'selector:#secret',action:'click'})).ok,false);
});
test('user stop before mouseDown prevents all remaining injected actions',async()=>{
 const h=harness([{x:20,y:20,width:20,height:20},true]);await h.handlers.get('cad-practice:ready')(h.event);
 const pending=h.handlers.get('cad-practice:input')(h.event,{target:'shape:box',action:'click'});await new Promise(r=>setTimeout(r,40));await h.handlers.get('cad-practice:abort')(h.event);
 const result=await pending;assert.equal(result.ok,false);assert.deepEqual(h.input.map(v=>v.type),['mouseMove']);
});
test('pause holds native input until explicit resume',async()=>{
 const h=harness([{x:20,y:20,width:20,height:20},true]);await h.handlers.get('cad-practice:ready')(h.event);
 const pending=h.handlers.get('cad-practice:input')(h.event,{target:'shape:box',action:'click'});await new Promise(r=>setTimeout(r,40));await h.handlers.get('cad-practice:status')(h.event,{paused:true});await new Promise(r=>setTimeout(r,230));assert.deepEqual(h.input.map(v=>v.type),['mouseMove']);
 await h.handlers.get('cad-practice:status')(h.event,{paused:false,generation:0});const result=await pending;assert.equal(result.ok,true);assert.deepEqual(h.input.map(v=>v.type),['mouseMove','mouseDown','mouseUp']);
});

test('unfocused startup pauses and stale resume token cannot override a newer blur',async()=>{
 const h=harness([],{initialFocus:false});await h.handlers.get('cad-practice:ready')(h.event);
 assert(h.sent.some(v=>v.type==='status'&&v.paused));
 const first=await h.handlers.get('cad-practice:status')(h.event,{paused:true});assert.equal(first.value.generation,1);
 h.setFocused(true);h.win.emit('blur');
 const stale=await h.handlers.get('cad-practice:status')(h.event,{paused:false,generation:1});assert.equal(stale.ok,false);assert.match(stale.error,/Fokus/);
 const good=await h.handlers.get('cad-practice:status')(h.event,{paused:false,generation:2});assert.equal(good.ok,true);
});

test('focus loss while typing stops before another character or Enter',async()=>{
 const h=harness([{x:20,y:20,width:20,height:20},true,true,true,false]);await h.handlers.get('cad-practice:ready')(h.event);
 const send=h.win.webContents.sendInputEvent;h.win.webContents.sendInputEvent=e=>{send(e);if(e.type==='char'){h.setFocused(false);h.win.emit('blur');}};
 const pending=h.handlers.get('cad-practice:input')(h.event,{target:'size-0',action:'set',value:'42'});await new Promise(r=>setTimeout(r,400));assert.equal(h.input.filter(e=>e.type==='char').length,1);
 h.setFocused(true);assert.equal((await h.handlers.get('cad-practice:status')(h.event,{paused:false,generation:1})).ok,true);const result=await pending;assert.equal(result.ok,false);assert.match(result.error,/Fokus/);assert.equal(h.input.filter(e=>e.type==='char').length,1);assert(!h.input.some(e=>e.keyCode==='Return'));
});
test('hit target is rechecked if blur interrupts the hit-test',async()=>{
 const h=harness([]);await h.handlers.get('cad-practice:ready')(h.event);let reads=0;
 h.win.webContents.executeJavaScript=async()=>{reads++;if(reads===1)return {x:20,y:20,width:20,height:20};if(reads===2){h.setFocused(false);h.win.emit('blur');return true;}return false;};
 const pending=h.handlers.get('cad-practice:input')(h.event,{target:'shape:box',action:'click'});await new Promise(r=>setTimeout(r,240));assert.equal(reads,2);h.setFocused(true);assert.equal((await h.handlers.get('cad-practice:status')(h.event,{paused:false,generation:1})).ok,true);
 const result=await pending;assert.equal(result.ok,false);assert.match(result.error,/verdeckt/);assert.equal(reads,3);assert(!h.input.some(e=>e.type==='mouseDown'));
});

test('model fit uses only the fixed visible product button',async()=>{
 const h=harness([]);await h.handlers.get('cad-practice:ready')(h.event);const queries=[];h.win.webContents.executeJavaScript=async script=>{queries.push(script);return queries.length===1?{x:20,y:20,width:20,height:20}:true;};
 const result=await h.handlers.get('cad-practice:input')(h.event,{target:'fit',action:'click'});assert.equal(result.ok,true);assert(queries.every(q=>q.includes(JSON.stringify('button[data-action="fit"]'))));assert.deepEqual(h.input.map(v=>v.type),['mouseMove','mouseDown','mouseUp']);
});
