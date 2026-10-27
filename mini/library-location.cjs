const fs=require('node:fs'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto');
const {createLibrary}=require('./library-store.cjs');
const idPattern=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const files=[['model.fmini',32*1024*1024],['preview.png',256*1024],['meta.json',8192]];
exports.createLibraryLocation=({programRoot,dataRoot,checkProject,checkImage})=>{
  const defaultDirectory=path.resolve(programRoot,'Bibliothek'),legacy=path.resolve(dataRoot,'Bibliothek'),settings=path.join(dataRoot,'bibliothek-ort.json');
  let directory=defaultDirectory,configError=null,initialized=false,warning='';
  try{if(fs.existsSync(settings)){const stat=fs.lstatSync(settings);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>16384)throw Error('Ungültige Bibliotheks-Einstellungen.');const config=JSON.parse(fs.readFileSync(settings,'utf8'));if(config.version!==1||config.directory!==null&&(typeof config.directory!=='string'||!path.isAbsolute(config.directory)||config.directory.length>4096))throw Error('Ungültiger Bibliothekspfad.');if(config.directory)directory=path.resolve(config.directory);}}
  catch(e){configError=e.message+' Bitte Bibliotheksordner neu wählen oder auf Standard zurücksetzen.';}
  const same=(a,b)=>path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
  const store=dir=>createLibrary({directory:dir,checkProject,checkImage});
  function ensure(dir){if(!path.isAbsolute(dir)||path.parse(dir).root===dir)throw Error('Bitte einen eigenen Bibliotheksordner wählen.');if(fs.existsSync(dir)){const stat=fs.lstatSync(dir);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Der Bibliotheksordner ist keine normale Ordnerablage.');}fs.mkdirSync(dir,{recursive:true});}
  function readEntry(dir,id){
    const entry=path.join(dir,id),stat=fs.lstatSync(entry);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Ungültiger Eintrag.');
    return files.map(([name,max])=>{const file=path.join(entry,name),stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>max)throw Error('Ungültige Bibliotheksdatei.');return fs.readFileSync(file);});
  }
  const equal=(left,right)=>left.every((data,i)=>data.equals(right[i]));
  function known(dir){const file=path.join(dir,'.mini-uebernahme.json');if(!fs.existsSync(file))return new Set();const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8*1024*1024)throw Error('Ungültiger Übernahmebeleg.');const value=JSON.parse(fs.readFileSync(file,'utf8'));if(value.version!==1||!Array.isArray(value.entries)||value.entries.length>100000||value.entries.some(v=>typeof v!=='string'||!/^[0-9a-f]{64}$/.test(v)))throw Error('Ungültiger Übernahmebeleg.');const result=new Set(value.entries);result.legacyDone=value.legacyDone===true;result.legacySkipped=Number.isInteger(value.legacySkipped)&&value.legacySkipped>=0?value.legacySkipped:0;return result;}
  async function copy(source,target,fromLegacy=false){
    if(same(source,target)||!fs.existsSync(source))return {copied:0,skipped:0};
    ensure(source);ensure(target);const remembered=known(target);if(fromLegacy&&remembered.legacyDone)return {copied:0,skipped:remembered.legacySkipped||0};
    if(!fromLegacy){const previous=known(source);for(const hash of previous)remembered.add(hash);remembered.legacyDone=remembered.legacyDone||previous.legacyDone;remembered.legacySkipped=Math.max(remembered.legacySkipped||0,previous.legacySkipped||0);}
    const sourceStore=store(source),listed=sourceStore.list();let copied=0,skipped=listed.skipped;
    for(const meta of listed.entries){
      let data;try{data=readEntry(source,meta.id);await checkProject(data[0].toString('utf8'));const png=data[1];if(png.length<33||png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||png.readUInt32BE(16)>512||png.readUInt32BE(20)>512)throw Error('Ungültiges Bild.');await checkImage(png);}
      catch{skipped++;continue;}
      const fingerprint=createHash('sha256').update(meta.id);data.forEach(value=>fingerprint.update(value));const digest=fingerprint.digest('hex');
      if(fromLegacy&&remembered.has(digest))continue;
      let id=meta.id,targetEntry=path.join(target,id);
      if(fs.existsSync(targetEntry)){
        let existing;try{existing=readEntry(target,id);}catch{}
        if(existing&&equal(data,existing)){if(fromLegacy)remembered.add(digest);continue;}
        const hash=createHash('sha256').update(meta.id);data.forEach(value=>hash.update(value));const hex=hash.digest('hex').slice(0,32);id=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');targetEntry=path.join(target,id);
        if(fs.existsSync(targetEntry)){if(equal(data,readEntry(target,id))){if(fromLegacy)remembered.add(digest);continue;}throw Error('Ein Ziel-Eintrag ist bereits anders belegt. Vorhandene Daten wurden erhalten.');}
      }
      if(!idPattern.test(id))throw Error('Ungültige Zielkennung.');
      const temp=path.join(target,'.uebernahme-'+randomUUID());fs.mkdirSync(temp);files.forEach(([name],i)=>fs.writeFileSync(path.join(temp,name),data[i]));fs.renameSync(temp,targetEntry);copied++;
      if(fromLegacy)remembered.add(digest);
    }
    if(fromLegacy){remembered.legacyDone=true;remembered.legacySkipped=skipped;}
    if(remembered.size||remembered.legacyDone){const file=path.join(target,'.mini-uebernahme.json');fs.writeFileSync(file+'.tmp',JSON.stringify({version:1,entries:[...remembered],legacyDone:!!remembered.legacyDone,legacySkipped:remembered.legacySkipped||0}));fs.renameSync(file+'.tmp',file);}
    return {copied,skipped};
  }
  async function init(){if(configError)throw Error(configError);if(initialized)return;ensure(directory);const result=await copy(legacy,directory,true);warning=result.skipped?`${result.skipped} ältere Einträge konnten nicht übernommen werden; die Originaldateien bleiben erhalten.`:'';initialized=true;}
  async function change(target){
    target=path.resolve(target);ensure(target);
    // Copy first; publish the new setting only when all valid entries are safe.
    const first=await copy(directory,target),second=await copy(legacy,target,true);
    const text=JSON.stringify({version:1,directory:same(target,defaultDirectory)?null:target});fs.mkdirSync(dataRoot,{recursive:true});fs.writeFileSync(settings+'.tmp',text);fs.renameSync(settings+'.tmp',settings);
    directory=target;configError=null;initialized=true;warning=first.skipped+second.skipped?`${first.skipped+second.skipped} beschädigte Einträge wurden ausgelassen; Originale bleiben erhalten.`:'';
    return {...location(),copied:first.copied+second.copied};
  }
  function location(){return {ok:true,directory,isDefault:same(directory,defaultDirectory),warning,error:configError};}
  return {location,change,reset:()=>change(defaultDirectory),async init(){await init();return location();},
    async invoke(method,payload){await init();const result=await store(directory)[method](payload);return {...result,...(method==='list'?{location:location()}:{} )};},
  };
};
