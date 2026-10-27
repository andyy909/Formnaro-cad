const {app,BrowserWindow,session}=require('electron');
const path=require('node:path'),fs=require('node:fs');
const output=path.resolve(__dirname,'../work/cad-v011/ui-browser');fs.mkdirSync(output,{recursive:true});
const profile=fs.mkdtempSync(path.join(output,'isolated-profile-'));app.setPath('userData',profile);app.setPath('sessionData',profile);
app.whenReady().then(async()=>{
  const errors=[],external=[];session.defaultSession.webRequest.onBeforeRequest((details,callback)=>{if(/^https?:/i.test(details.url)){external.push(details.url);callback({cancel:true});}else callback({});});
  const window=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  window.webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message);});
  try{
    await window.loadFile(path.resolve(__dirname,'../work/cad-v011/ui-dist/work/cad-v011/ui-fixture.html'));
    const result=await window.webContents.executeJavaScript('window.runCadInterfaceProof()');if(errors.length||external.length)throw Error('Unerwartete Rendererfehler oder externe Anfragen: '+JSON.stringify({errors,external}));
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({...result,errors,external},null,2));fs.writeFileSync(path.join(output,'interface.png'),(await window.webContents.capturePage()).toPNG());process.stdout.write(JSON.stringify(result)+'\n');app.exit(0);
  }catch(error){fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ready:false,error:error.message,errors,external},null,2));process.stderr.write(error.stack+'\n');app.exit(1);}
});
