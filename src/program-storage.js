import entries from '../backend/program-data.json' with {type:'json'};
export function createProgramStorage(legacy,desktop,{cadOnly=false}={}){
  return openProgramStorage(legacy,desktop,cadOnly,false);
}
export function createProgramStorageAsync(legacy,desktop,{cadOnly=false}={}){
  return openProgramStorage(legacy,desktop,cadOnly,true);
}
function openProgramStorage(legacy,desktop,cadOnly,asynchronous){
  if(typeof cadOnly!=='boolean')throw Error('Ungültige Datenauswahl.');
  const allowed=key=>Object.hasOwn(entries,key)&&(!cadOnly||!entries[key].legacyMesh);
  if(typeof desktop?.initializeProgramData!=='function')return cadOnly?{
    getItem:key=>allowed(key)?legacy.getItem(key):null,
    setItem:(key,value)=>{if(!allowed(key))throw Error('Ungültiger CAD-Datenbefehl.');legacy.setItem(key,String(value));},
    removeItem:key=>{if(!allowed(key))throw Error('Ungültiger CAD-Datenbefehl.');legacy.removeItem(key);}
  }:legacy;
  // This snapshot is imported only if the native portable folder is absent.
  const old={};for(const key of Object.keys(entries)){if(!allowed(key))continue;try{const value=legacy.getItem(key);if(value!==null)old[key]=value;}catch{}}
  const request=cadOnly?{format:'FormnaroProgramDataInitialization',version:1,cadOnly:true,values:old}:old;
  const build=info=>connectProgramStorage(info,desktop,allowed);
  if(asynchronous&&typeof desktop.initializeProgramDataAsync==='function')return desktop.initializeProgramDataAsync(request).then(build);
  return build(desktop.initializeProgramData(request));
}
function connectProgramStorage(info,desktop,allowed){
  const values={},revisions={};
  const check=key=>{if(info.unavailable?.[key])throw Error('Gespeicherte Datei bleibt unverändert gesperrt: '+info.unavailable[key]);};
  for(const key of Object.keys(entries)){if(!allowed(key))continue;if(Object.hasOwn(info.values,key))values[key]=info.values[key];if(Object.hasOwn(info.revisions,key))revisions[key]=info.revisions[key];}
  function change(key,value){
    check(key);
    if(!allowed(key))throw Error('Ungültiger Datenbefehl.');
    const saved=desktop.changeProgramData({key,value,revision:revisions[key]});
    if(saved.value===null)delete values[key];else values[key]=saved.value;revisions[key]=saved.revision;
  }
  async function setRecoveryItem(key,value){
    check(key);
    if(!allowed(key)||typeof value!=='string'&&!(value instanceof Uint8Array))throw Error('Ungültiger Sicherungsbefehl.');
    const saved=await desktop.changeRecoveryData({key,value,revision:revisions[key]});
    values[key]=value;
    revisions[key]=saved.revision;
  }
  function getItem(key){
    if(!allowed(key)||!Object.hasOwn(values,key))return null;
    if(values[key] instanceof Uint8Array)values[key]=new TextDecoder('utf-8',{ignoreBOM:true}).decode(values[key]);
    return values[key];
  }
  return {getItem,itemRevision:key=>allowed(key)?revisions[key]:undefined,checkReadable:check,setItem:(key,value)=>change(key,String(value)),...(typeof desktop.changeRecoveryData==='function'?{setRecoveryItem}:{}),removeItem:key=>change(key,null),info:()=>({...info,values:undefined,revisions:undefined})};
}
