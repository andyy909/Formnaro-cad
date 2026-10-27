const {app,BrowserWindow,ipcMain,dialog,Menu,session,nativeImage}=require('electron');

const fs=require('node:fs'),path=require('node:path');

app.setName('Formnaro Mini CAD');app.setAppUserModelId('de.formnaro.mini.cad');

const verification=process.argv.includes('--mini-verify'),proof=verification?process.env.FORMNARO_MINI_VERIFY_OUTPUT:null;

if(verification&&!proof)throw Error('Für die Prüfung ist ein eigener Nachweisordner erforderlich.');

const programRoot=verification?path.resolve(proof):app.isPackaged?path.dirname(app.getPath('exe')):__dirname;

const dataRoot=path.join(programRoot,'Daten-Mini-CAD');

fs.mkdirSync(dataRoot,{recursive:true});app.setPath('userData',path.join(dataRoot,'Profil'));app.setPath('sessionData',path.join(dataRoot,'Profil'));

let win,closing=false,closePending=false,io=Promise.resolve(),libraryStartupError=null;

const limits={project:32*1024*1024,stl:256*1024*1024};

const safeName=name=>(String(name||'Mini-Projekt').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/[. ]+$/,'').slice(0,90)||'Mini-Projekt');

function atomic(file,data){const temp=file+'.tmp';fs.writeFileSync(temp,data);fs.renameSync(temp,file);}

function ordered(fn){const next=io.then(fn);io=next.catch(()=>{});return next;}

function trusted(event){return event.sender===win?.webContents&&event.senderFrame===win.webContents.mainFrame;}

function handler(channel,fn){ipcMain.handle(channel,async(event,payload)=>{if(!trusted(event))return {ok:false,error:'Unbekanntes Fenster.'};try{return await fn(payload);}catch(e){return {ok:false,error:e.message};}});}

async function checkedProject(text){if(typeof text!=='string'||Buffer.byteLength(text)>limits.project)throw Error('Projekt ist größer als 32 MB.');const {decodeProject}=await import('./src/model.js');decodeProject(text);return text;}

const library=require('./library-location.cjs').createLibraryLocation({programRoot,dataRoot,checkProject:checkedProject,checkImage:png=>{const image=nativeImage.createFromBuffer(png),size=image.getSize();if(image.isEmpty()||size.width<1||size.height<1||size.width>512||size.height>512)throw Error('Vorschaubild ist ungültig oder zu groß.');}});

for(const method of ['list','save','load','thumbnail','update'])handler('mini:library-'+method,payload=>ordered(()=>library.invoke(method,payload)));

handler('mini:library-location',()=>ordered(()=>library.location()));

handler('mini:library-choose',async()=>{const current=library.location(),result=await dialog.showOpenDialog(win,{title:'Bibliotheksordner auswählen',defaultPath:current.directory,properties:['openDirectory','createDirectory']});if(result.canceled)return {ok:false,canceled:true};return ordered(()=>library.change(result.filePaths[0]));});

handler('mini:library-default',()=>ordered(()=>library.reset()));

handler('mini:restore',()=>{

  let text=null,error=null,settings={};const file=path.join(dataRoot,'autosave.fmcad');

  if(fs.existsSync(file)){if(fs.statSync(file).size>limits.project)error='Die letzte Mini-Sicherung ist zu groß. Bitte eine Projektdatei öffnen.';else text=fs.readFileSync(file,'utf8');}

  try{const value=JSON.parse(fs.readFileSync(path.join(dataRoot,'einstellungen.json'),'utf8'));if([32,64,128].includes(value.quality))settings.quality=value.quality;if([0,.1,1,5].includes(value.snap))settings.snap=value.snap;if(typeof value.surfaceAlign==='boolean')settings.surfaceAlign=value.surfaceAlign;}catch{}

  return {text,settings,error:[error,libraryStartupError].filter(Boolean).join(' · ')||null,verification};

});

handler('mini:autosave',text=>ordered(async()=>{await checkedProject(text);atomic(path.join(dataRoot,'autosave.fmcad'),text);return {ok:true};}));

handler('mini:settings',value=>ordered(()=>{

  if(!value||![32,64,128].includes(value.quality)||value.snap!==undefined&&![0,.1,1,5].includes(value.snap)||value.surfaceAlign!==undefined&&typeof value.surfaceAlign!=='boolean')throw Error('Ungültige Mini-Einstellungen.');

  let previous={};try{previous=JSON.parse(fs.readFileSync(path.join(dataRoot,'einstellungen.json'),'utf8'));}catch{}

  const settings={quality:value.quality,snap:value.snap??([0,.1,1,5].includes(previous.snap)?previous.snap:1),surfaceAlign:value.surfaceAlign??(typeof previous.surfaceAlign==='boolean'?previous.surfaceAlign:true)};

  atomic(path.join(dataRoot,'einstellungen.json'),JSON.stringify(settings));return {ok:true};

}));

handler('mini:save-project',async({name,text})=>{

  await checkedProject(text);const result=await dialog.showSaveDialog(win,{title:'Mini-Projekt speichern',defaultPath:safeName(name)+'.fmcad',filters:[{name:'Formnaro Mini CAD',extensions:['fmcad']}]});if(result.canceled)return {ok:false};

  await ordered(()=>atomic(result.filePath,text));return {ok:true};

});

handler('mini:open-project',async()=>{

  const result=await dialog.showOpenDialog(win,{title:'Mini-Projekt öffnen',properties:['openFile'],filters:[{name:'Formnaro Mini CAD',extensions:['fmcad']}]});if(result.canceled)return {ok:false};const file=result.filePaths[0];if(fs.statSync(file).size>limits.project)throw Error('Projekt ist größer als 32 MB.');const text=fs.readFileSync(file,'utf8');await checkedProject(text);return {ok:true,text};

});

handler('mini:open-stl',async()=>{

  const result=await dialog.showOpenDialog(win,{title:'STEP-CAD oder STL-Netz laden',properties:['openFile'],filters:[{name:'CAD-Dateien',extensions:['step','stp','stl']},{name:'STEP-CAD',extensions:['step','stp']},{name:'STL-Netz (auch offen oder groß)',extensions:['stl']}]});if(result.canceled)return {ok:false};const file=result.filePaths[0];if(fs.statSync(file).size>limits.stl)throw Error('Importdatei ist größer als 256 MiB.');const bytes=fs.readFileSync(file);return {ok:true,name:path.basename(file),buffer:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};

});

handler('mini:save-stl',async({name,buffer,format='stl'})=>{

  if(!(buffer instanceof ArrayBuffer)||!['stl','step'].includes(format)||buffer.byteLength>100*1024*1024)throw Error('Ungültige CAD-Ausgabe.');

  if(format==='stl'&&(buffer.byteLength<84||84+new DataView(buffer).getUint32(80,true)*50!==buffer.byteLength))throw Error('Ungültige STL-Ausgabe.');

  if(format==='step'&&(buffer.byteLength>30*1024*1024||!/^ISO-10303-21\s*;/i.test(Buffer.from(buffer).subarray(0,256).toString('utf8'))))throw Error('Ungültige STEP-Ausgabe.');

  const result=await dialog.showSaveDialog(win,{title:format==='step'?'STEP-CAD exportieren':'STL für den 3D-Druck exportieren',defaultPath:safeName(name)+'.'+format,filters:[{name:format.toUpperCase()+' · Millimeter',extensions:[format]}]});if(result.canceled)return {ok:false};await ordered(()=>atomic(result.filePath,Buffer.from(buffer)));return {ok:true};

});

ipcMain.on('mini:close-ready',async(event,error)=>{

  if(!trusted(event)||!closePending)return;await io;

  if(error){const choice=await dialog.showMessageBox(win,{type:'warning',title:'Mini-Sicherung fehlgeschlagen',message:'Der letzte Stand konnte nicht gesichert werden.',detail:String(error).slice(0,500),buttons:['Zurück zum Projekt','Trotzdem schließen'],defaultId:0,cancelId:0});if(choice.response!==1){closePending=false;return;}}

  closing=true;win.close();

});

app.on('window-all-closed',()=>app.quit());

if(!verification&&!app.requestSingleInstanceLock())app.quit();else{

  app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus();}});

  app.whenReady().then(async()=>{

    try{await ordered(()=>library.init());}catch(e){libraryStartupError='Bibliothek: '+e.message;}

    Menu.setApplicationMenu(null);

    session.defaultSession.webRequest.onBeforeRequest((details,cb)=>cb({cancel:/^https?:|^wss?:|^ftp:/i.test(details.url)}));

    session.defaultSession.setPermissionRequestHandler((_web,_permission,callback)=>callback(false));

    win=new BrowserWindow({title:'Formnaro Mini CAD',width:1440,height:960,minWidth:1000,minHeight:700,show:!verification,backgroundColor:'#edf0f1',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,spellcheck:false,backgroundThrottling:!verification}});

    require('./backend/desktop-ai.cjs').installDesktopAI(win,{settingsFile:path.join(dataRoot,'ai-settings.json')});

    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());win.webContents.on('will-attach-webview',event=>event.preventDefault());

    win.on('close',event=>{if(!closing){event.preventDefault();if(!closePending){closePending=true;win.webContents.send('mini:closing');}}});

    if(verification){const {runVerification}=require('./tests/verify.cjs');await runVerification({win,app,dialog,dataRoot,proof:path.resolve(proof)});}

    else await win.loadFile(path.join(__dirname,'dist/index.html'));

  }).catch(e=>{console.error(e);app.exit(1);});

}

