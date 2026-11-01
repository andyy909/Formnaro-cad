const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {installRendererRecovery}=require('../backend/renderer-recovery.cjs');
class Window extends EventEmitter {
 constructor(){super();this.contents=new EventEmitter();this.destroyed=false;}
 get webContents(){if(this.destroyed)throw new TypeError('Object has been destroyed');return this.contents;}
 isDestroyed(){return this.destroyed;}
 destroy(){this.destroyed=true;this.emit('closed');}
}
test('Closed BrowserWindow cleanup never reads its destroyed native webContents getter',()=>{
 const win=new Window(),recovery=installRendererRecovery(win,{dialog:{}});assert.equal(win.contents.listenerCount('render-process-gone'),1);
 assert.doesNotThrow(()=>win.destroy());assert.equal(win.contents.listenerCount('render-process-gone'),0);assert.doesNotThrow(()=>recovery.dispose());
});
test('An outstanding recovery response cannot reload a window closed while the prompt was open',async()=>{
 const win=new Window();let answer,reloads=0;installRendererRecovery(win,{dialog:{showMessageBox:()=>new Promise(r=>answer=r)},reload:()=>{reloads++;}});
 win.contents.emit('render-process-gone',{}, {reason:'crashed',exitCode:1});assert.equal(typeof answer,'function');assert.doesNotThrow(()=>win.destroy());answer({response:0});await new Promise(r=>setImmediate(r));assert.equal(reloads,0);assert.equal(win.contents.listenerCount('render-process-gone'),0);
});
