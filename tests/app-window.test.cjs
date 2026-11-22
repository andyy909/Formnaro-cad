const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url'),{EventEmitter}=require('node:events');
const {installAppWindow}=require('../backend/app-window.cjs');
const FLUSH='window.__formnaroFlushRecovery?.() ?? true',entry=path.resolve('work/app-window fixture/日本語/dist/index.html'),entryUrl=pathToFileURL(entry).href;
const settle=()=>new Promise(resolve=>setImmediate(resolve));
class Contents extends EventEmitter{
 constructor({loading=false}={}){super();this.loading=loading;this.windowOpenHandler=null;this.flushes=[];}
 setWindowOpenHandler(handler){this.windowOpenHandler=handler;}
 isLoadingMainFrame(){return this.loading;}
 executeJavaScript(code){return new Promise((resolve,reject)=>this.flushes.push({code,resolve,reject}));}
}
class Window extends EventEmitter{
 constructor(options={}){super();this.contents=new Contents(options);this.destroyed=false;this.originalReloads=0;this.closeCalls=0;}
 get webContents(){if(this.destroyed)throw new TypeError('Object has been destroyed');return this.contents;}
 isDestroyed(){return this.destroyed;}
 reload(){this.originalReloads++;}
 close(){this.closeCalls++;return this.emitClose();}
 emitClose(){const event={defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};this.emit('close',event);return event;}
 destroy(){this.destroyed=true;this.emit('closed');}
}
function installer(options={}){const win=new Window(options);installAppWindow(win,{entry,query:options.query});return win;}
function errors(t){const entries=[];t.mock.method(console,'error',(...args)=>entries.push(args.join(' ')));return entries;}
function navigate(contents,name,target){let blocked=false;contents.emit(name,{preventDefault(){blocked=true;}},target);return blocked;}
test('Der Installierer sperrt Popups und schützt beide Navigationsevents mit normalem und Verify-Query',()=>{
 const plain=installer(),verify=installer({query:{test:'1'}});
 for(const win of [plain,verify]){assert.equal(typeof win.contents.windowOpenHandler,'function');assert.deepEqual(win.contents.windowOpenHandler(),{action:'deny'});}
 assert.notEqual(plain.contents.windowOpenHandler,verify.contents.windowOpenHandler);
 assert.equal(navigate(plain.contents,'will-navigate',entryUrl),false);
 assert.equal(navigate(plain.contents,'will-redirect',entryUrl+'#part'),false);
 for(const target of [entryUrl+'?test=1',entryUrl.replace('index.html','other.html'),'https://example.invalid','about:blank']){
  assert.equal(navigate(plain.contents,'will-navigate',target),true,target);
  assert.equal(navigate(plain.contents,'will-redirect',target),true,target);
 }
 assert.equal(navigate(verify.contents,'will-navigate',entryUrl+'?test=1#part'),false);
 assert.equal(navigate(verify.contents,'will-navigate',entryUrl),true);
 assert.equal(navigate(verify.contents,'will-redirect','https://example.invalid'),true);
});
test('Reload führt höchstens einen Flush aus und lädt nur bei striktem true',async t=>{
 const log=errors(t),win=installer();
 assert.equal(win.reload(),undefined);assert.equal(win.contents.flushes.length,1);assert.equal(win.contents.flushes[0].code,FLUSH);
 win.reload();assert.equal(win.contents.flushes.length,1);
 win.contents.flushes[0].resolve(true);await settle();
 assert.equal(win.originalReloads,1);
 win.reload();assert.equal(win.contents.flushes.length,2);
 win.contents.flushes[1].resolve(false);await settle();
 assert.equal(win.originalReloads,1);
 for(const other of ['true',1,{saved:true},null,undefined]){
  const pending=win.contents.flushes.length;win.reload();assert.equal(win.contents.flushes.length,pending+1);
  win.contents.flushes[pending].resolve(other);await settle();assert.equal(win.originalReloads,1);
 }
 const pending=win.contents.flushes.length;win.reload();assert.equal(win.contents.flushes.length,pending+1);
 win.contents.flushes[pending].resolve(true);await settle();
 assert.equal(win.originalReloads,2);
 assert.deepEqual(log,[]);
});
test('Abgelehnter Reload-Flush protokolliert den bestehenden Text und gibt das Flag frei',async t=>{
 const log=errors(t),win=installer();
 win.reload();win.contents.flushes[0].reject(Error('Speichern fehlgeschlagen'));await settle();
 assert.deepEqual(log,['Autosicherung beim Neuladen: Speichern fehlgeschlagen']);assert.equal(win.originalReloads,0);
 win.reload();assert.equal(win.contents.flushes.length,2);
 win.contents.flushes[1].resolve(true);await settle();assert.equal(win.originalReloads,1);
});
test('Zerstörtes Fenster startet keinen Reload-Flush und lädt nach keinem Flush nach',async()=>{
 const before=installer();before.destroy();before.reload();assert.equal(before.contents.flushes.length,0);assert.equal(before.originalReloads,0);
 const after=installer();after.reload();after.destroy();after.contents.flushes[0].resolve(true);await settle();assert.equal(after.originalReloads,0);
});
test('Close hält das Fenster offen, bis genau ein Flush strikt true liefert',async t=>{
 const log=errors(t),win=installer();
 assert.equal(win.emitClose().defaultPrevented,true);assert.equal(win.contents.flushes.length,1);assert.equal(win.contents.flushes[0].code,FLUSH);
 assert.equal(win.emitClose().defaultPrevented,true);assert.equal(win.contents.flushes.length,1);
 win.contents.flushes[0].resolve(false);await settle();assert.equal(win.closeCalls,0);
 assert.equal(win.emitClose().defaultPrevented,true);assert.equal(win.contents.flushes.length,2);
 win.contents.flushes[1].resolve(true);await settle();
 assert.equal(win.closeCalls,1);
 assert.equal(win.emitClose().defaultPrevented,false);assert.equal(win.contents.flushes.length,2);
 assert.deepEqual(log,[]);
});
test('Abgelehnter Close-Flush protokolliert den bestehenden Text und lässt das Fenster offen',async t=>{
 const log=errors(t),win=installer();
 win.emitClose();win.contents.flushes[0].reject(Error('Schreiben fehlgeschlagen'));await settle();
 assert.deepEqual(log,['Autosicherung beim Schließen: Schreiben fehlgeschlagen']);assert.equal(win.closeCalls,0);
 assert.equal(win.emitClose().defaultPrevented,true);assert.equal(win.contents.flushes.length,2);
 win.contents.flushes[1].resolve(1);await settle();assert.equal(win.closeCalls,0);
});
test('Ladender Mainframe und closeApproved lösen keinen Close-Flush aus',async()=>{
 const win=installer({loading:true});
 assert.equal(win.emitClose().defaultPrevented,false);assert.equal(win.contents.flushes.length,0);
 win.contents.loading=false;assert.equal(win.emitClose().defaultPrevented,true);assert.equal(win.contents.flushes.length,1);
 win.contents.flushes[0].resolve(true);await settle();assert.equal(win.closeCalls,1);
 assert.equal(win.emitClose().defaultPrevented,false);assert.equal(win.contents.flushes.length,1);
});
test('Reload und Close flushen überlappend in beiden Auflösungsreihenfolgen',async()=>{
 const reloadFirst=installer();
 reloadFirst.reload();reloadFirst.emitClose();assert.equal(reloadFirst.contents.flushes.length,2);
 reloadFirst.contents.flushes[0].resolve(true);await settle();
 assert.equal(reloadFirst.originalReloads,1);assert.equal(reloadFirst.closeCalls,0);
 assert.equal(reloadFirst.contents.flushes[1].code,FLUSH);
 reloadFirst.contents.flushes[1].resolve(true);await settle();assert.equal(reloadFirst.closeCalls,1);
 const closeFirst=installer();
 closeFirst.reload();closeFirst.emitClose();assert.equal(closeFirst.contents.flushes.length,2);
 closeFirst.contents.flushes[1].resolve(true);await settle();
 assert.equal(closeFirst.closeCalls,1);assert.equal(closeFirst.originalReloads,0);
 closeFirst.contents.flushes[0].resolve(true);await settle();assert.equal(closeFirst.originalReloads,1);
 closeFirst.reload();assert.equal(closeFirst.contents.flushes.length,3);
 closeFirst.contents.flushes[2].resolve(true);await settle();assert.equal(closeFirst.originalReloads,2);
});
test('Zerstörtes Fenster führt nach ausstehendem Reload und Close keine Aktion aus',async()=>{
 const win=installer();win.reload();win.emitClose();assert.equal(win.contents.flushes.length,2);
 win.destroy();win.contents.flushes[0].resolve(true);win.contents.flushes[1].resolve(true);await settle();
 assert.equal(win.originalReloads,0);assert.equal(win.closeCalls,0);
});
test('Getrennte Fenster teilen weder Flush-Flags noch die gebundene Reload-Funktion',async()=>{
 const first=installer(),second=installer();
 first.reload();second.emitClose();assert.equal(first.contents.flushes.length,1);assert.equal(second.contents.flushes.length,1);
 first.contents.flushes[0].resolve(true);await settle();
 assert.equal(first.originalReloads,1);assert.equal(second.closeCalls,0);assert.equal(second.contents.flushes.length,1);
 first.emitClose();assert.equal(first.contents.flushes.length,2);
 second.contents.flushes[0].resolve(true);await settle();
 assert.equal(second.closeCalls,1);assert.equal(first.closeCalls,0);assert.equal(first.contents.flushes.length,2);
 first.contents.flushes[1].resolve(true);await settle();assert.equal(first.closeCalls,1);
});
test('Vor dem Installierer gebundener Recovery-Reload bleibt der ursprüngliche Reload',async()=>{
 const win=new Window(),recoveryReload=win.reload.bind(win);
 installAppWindow(win,{entry});
 recoveryReload();assert.equal(win.originalReloads,1);assert.equal(win.contents.flushes.length,0);
 win.reload();assert.equal(win.contents.flushes.length,1);win.contents.flushes[0].resolve(true);await settle();
 assert.equal(win.originalReloads,2);
});
