const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const sha=value=>createHash('sha256').update(value).digest('hex');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function verifyOcadClose(win,{directory,reopen=false}){
 const checks=[],run=code=>win.webContents.executeJavaScript(`(async()=>{const a=window.__cadTest;${code}})()`);
 const expected=path.join(directory,'expected-close.json');
 if(reopen){
  const info=JSON.parse(fs.readFileSync(expected,'utf8'));
  assert.equal(sha(await run('return a.serialize();')),info.modelSha256);
  checks.push('Fresh editor restores the exact confirmed model saved during normal Close');
  return {ok:true,checks};
 }
 await run(`
  await a.execute({kind:'batch',commands:[{op:'create',type:'box',size:[21,23,25],pos:[0,0,12.5]}]});
  await a.settled();
 `);
 const data=path.join(directory,'portable-data');
 const file=path.join(data,'autosicherung-cad-v7.json');
 const previous=fs.readFileSync(file);
 const external=Buffer.from('externally changed autosave');
 fs.writeFileSync(file,external);
 try{
  win.close();
  let errorVisible=false;
  for(let i=0;i<120;i++){
   assert(!win.isDestroyed(),'Failed recovery closed the editor');
   if(await run("return document.getElementById('save-state').textContent==='Autosicherung fehlgeschlagen';")){
    errorVisible=true;break;
   }
   await delay(50);
  }
  assert(errorVisible,'Actual close error was not reported');
  assert(fs.readFileSync(file).equals(external),'External bytes changed on failed close');
  checks.push('An external revision conflict leaves the window open and shows the failed autosave');
 }finally{fs.writeFileSync(file,previous);}
 const model=await run('return a.serialize();');
 fs.writeFileSync(expected,JSON.stringify({modelSha256:sha(model)}));
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Normal Close did not finish')),30000);
  win.once('closed',()=>{clearTimeout(timer);resolve();});
  win.close();
 });
 const recovered=JSON.parse(fs.readFileSync(file,'utf8'));
 assert.deepEqual(recovered.nodes,JSON.parse(model).nodes);
 checks.push('Normal Close waits for the confirmed OCAD model to reach the autosave file');
 return {ok:true,checks};
}
module.exports={verifyOcadClose};
