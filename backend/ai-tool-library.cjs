const fs=require('node:fs'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto');
const hash=v=>createHash('sha256').update(v).digest('hex'),fail=m=>{throw Object.assign(Error(m),{code:'AI_TOOL_LIBRARY_INVALID'});};
function validateTool(v){
 if(!v||Object.getPrototypeOf(v)!==Object.prototype||Object.keys(v).some(k=>!['name','description','language','code','modules','tags'].includes(k)))fail('Ungültiges Werkzeug.');
 if(typeof v.name!=='string'||!v.name.trim()||v.name.length>160||!['python','javascript'].includes(v.language)||typeof v.code!=='string'||!v.code.trim()||v.code.length>100000)fail('Werkzeug benötigt Name, Sprache und vollständigen Quelltext.');
 if(v.description!==undefined&&(typeof v.description!=='string'||v.description.length>4000))fail('Werkzeugbeschreibung ist zu lang.');
 if(v.tags!==undefined&&(!Array.isArray(v.tags)||v.tags.length>16||v.tags.some(t=>typeof t!=='string'||t.length>80)))fail('Ungültige Werkzeug-Tags.');
 const modules=v.modules??{};if(!modules||Object.getPrototypeOf(modules)!==Object.prototype||Object.keys(modules).length>32||Object.entries(modules).some(([k,s])=>!k||k.length>200||['__proto__','prototype','constructor'].includes(k)||typeof s!=='string'||s.length>1000000)||JSON.stringify(modules).length>4000000)fail('Ungültige Werkzeugmodule.');
 return {name:v.name.trim(),description:v.description??'',language:v.language,code:v.code,modules,tags:v.tags??[]};
}
function createToolLibrary(directory){
 directory=path.resolve(directory);
 function ready(){fs.mkdirSync(directory,{recursive:true});if(fs.lstatSync(directory).isSymbolicLink()||fs.realpathSync(directory).toLowerCase()!==directory.toLowerCase())fail('Werkzeugordner darf keine Verknüpfung sein.');}
 function read(revision){if(typeof revision!=='string'||! /^[a-f0-9]{64}$/.test(revision))fail('Werkzeugrevision aus dem Katalog wählen.');ready();const file=path.join(directory,revision+'.json');if(fs.lstatSync(file).isSymbolicLink()||fs.statSync(file).size>4300000)fail('Ungültige Werkzeugdatei.');const saved=JSON.parse(fs.readFileSync(file,'utf8')),tool=validateTool(saved.tool);if(hash(JSON.stringify(tool))!==revision||saved.revision!==revision)fail('Werkzeug-Prüfsumme stimmt nicht.');return saved;}
 function request(args={}){
  if(!args||Object.getPrototypeOf(args)!==Object.prototype||Object.keys(args).some(k=>!['action','tool','revision','search','offset','limit'].includes(k)))fail('Ungültige Werkzeugabfrage.');
  ready();
  if(args.action==='read')return read(args.revision);
  if(args.action==='save'){
   const tool=validateTool(args.tool),revision=hash(JSON.stringify(tool)),file=path.join(directory,revision+'.json');
   if(fs.existsSync(file))return {...read(revision),existing:true};
   const entries=fs.readdirSync(directory).filter(n=>/^[a-f0-9]{64}\.json$/.test(n));if(entries.length>=4096||entries.reduce((n,f)=>n+fs.lstatSync(path.join(directory,f)).size,0)+Buffer.byteLength(JSON.stringify(tool))>256*1024*1024)fail('Werkzeugbibliothek voll (4096 Versionen / 256 MiB). Bestehende Werkzeuge bleiben erhalten.');
   const record={format:'FormnaroTool',version:1,revision,createdAt:new Date().toISOString(),evidence:'Archived source; execution and geometric validity must be checked for each new task.',tool},bytes=JSON.stringify(record,null,2),temp=path.join(directory,'.'+revision+'-'+randomUUID()+'.tmp');
   let fd;try{fd=fs.openSync(temp,'wx',0o600);fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;if(fs.existsSync(file))return {...read(revision),existing:true};fs.renameSync(temp,file);}finally{if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(temp))fs.unlinkSync(temp);}
   return record;
  }
  if(args.action==='list'||args.action==='search'){
   if(typeof (args.search??'')!=='string'||(args.search??'').length>200||!Number.isSafeInteger(args.offset??0)||(args.offset??0)<0||!Number.isSafeInteger(args.limit??20)||(args.limit??20)<1||(args.limit??20)>100)fail('Werkzeugsuche: Text, offset und limit 1–100 wählen.');
   const rows=fs.readdirSync(directory).filter(n=>/^[a-f0-9]{64}\.json$/.test(n)).map(n=>read(n.slice(0,-5))).filter(r=>(r.tool.name+' '+r.tool.description+' '+r.tool.tags.join(' ')).toLowerCase().includes((args.search??'').toLowerCase())).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.revision.localeCompare(b.revision));
   const offset=args.offset??0,limit=args.limit??20;return {total:rows.length,offset,nextOffset:offset+limit<rows.length?offset+limit:null,tools:rows.slice(offset,offset+limit).map(r=>({revision:r.revision,createdAt:r.createdAt,name:r.tool.name,description:r.tool.description,language:r.tool.language,tags:r.tool.tags,evidence:r.evidence}))};
  }
  fail('Werkzeugbibliothek: list/search/read/save wählen.');
 }
 return {request,directory};
}
function installToolLibrary(win,{directory,ipcMain}){const store=createToolLibrary(directory);ipcMain.handle('cad-ai-tools:request',(event,args)=>{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)return {ok:false,error:'Invalid window.'};try{return {ok:true,value:store.request(args)};}catch(e){return {ok:false,error:e.message,code:e.code};}});return store;}
module.exports={createToolLibrary,validateTool,installToolLibrary};
