const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url'),{EventEmitter}=require('node:events');
const {installNavigationGuard}=require('../backend/navigation-guard.cjs');
test('Navigation and redirects allow only the exact app file and original query, with optional fragments',()=>{
 const entry=path.resolve('work/navigation fixture/日本語/index.html'),url=pathToFileURL(entry).href,win={webContents:new EventEmitter()};
 const policy=installNavigationGuard(win,{entry});assert.equal(policy.allowed(url),true);assert.equal(policy.allowed(url+'#part'),true);
 for(const target of ['https://example.invalid',url+'/other',url.replace('index.html','other.html'),url+'?test=1','data:text/html,foreign','javascript:alert(1)','about:blank','invalid']){
  assert.equal(policy.allowed(target),false,target);
  for(const name of ['will-navigate','will-redirect']){let blocked=false;win.webContents.emit(name,{preventDefault(){blocked=true;}},target);assert.equal(blocked,true);}
 }
 let blocked=false;win.webContents.emit('will-navigate',{preventDefault(){blocked=true;}},url);assert.equal(blocked,false);
 const isolated=installNavigationGuard({webContents:new EventEmitter()},{entry,query:{test:'1'}});assert.equal(isolated.allowed(url+'?test=1#part'),true);assert.equal(isolated.allowed(url),false);
});
