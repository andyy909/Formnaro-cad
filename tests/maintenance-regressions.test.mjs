import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createThemeBinding} from '../src/theme.js';
import {writeStartupRecovery} from '../src/cad-startup-recovery.js';
import {createProgramStorage} from '../src/program-storage.js';
const require=createRequire(import.meta.url);
const {createProgramStore}=require('../backend/program-storage.cjs');
const {createErrorLog}=require('../backend/error-log.cjs');
const {createProjectFiles}=require('../backend/projects.cjs');
const {writeAtomic}=require('../backend/files.cjs');
const {createLayoutStore}=require('../backend/layouts.cjs');
const entries=require('../backend/program-data.json');
const settings='offlinecad-settings-v1';
function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-maintenance-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
test('Early logging and existing portable data do not prevent initialization or overwrite settings',t=>{
 const dir=path.join(temp(t),'Daten');createErrorLog({directory:path.join(dir,'Fehlerprotokolle')}).append({message:'synthetic early error'});
 fs.writeFileSync(path.join(dir,entries[settings].file),'portable');
 const store=createProgramStore(dir);assert.equal(store.initialize({[settings]:'legacy'}).values[settings],'portable');assert.equal(store.initialize().values[settings],'portable');
 assert(fs.existsSync(path.join(dir,'profil.json')));assert(fs.existsSync(path.join(dir,'Fehlerprotokolle/formnaro-fehler.jsonl')));
});
test('Logging-only directory still migrates old settings once',t=>{
 const dir=path.join(temp(t),'Daten');fs.mkdirSync(path.join(dir,'Fehlerprotokolle'),{recursive:true});assert.equal(createProgramStore(dir).initialize({[settings]:'legacy'}).values[settings],'legacy');
});
test('Markerless folder initialization does not require hard-link support',t=>{
 const dir=path.join(temp(t),'Daten');fs.mkdirSync(path.join(dir,'Fehlerprotokolle'),{recursive:true});const link=fs.linkSync;
 fs.linkSync=()=>{throw Object.assign(Error('No hard links on this portable drive'),{code:'ENOTSUP'});};
 try{assert.equal(createProgramStore(dir).initialize({[settings]:'legacy'}).values[settings],'legacy');}finally{fs.linkSync=link;}
});
test('One oversized store file is preserved and blocked while unrelated files remain usable',t=>{
 const dir=path.join(temp(t),'Daten');createProgramStore(dir).initialize();const file=path.join(dir,entries[settings].file),bytes=Buffer.alloc(entries[settings].limit+1,120);fs.writeFileSync(file,bytes);
 const store=createProgramStore(dir),initial=store.initialize();assert(initial.unavailable[settings]);
 const storage=createProgramStorage({getItem:()=>null},{initializeProgramData:()=>initial,changeProgramData:args=>store.change(args)});
 assert.equal(storage.getItem(settings),null);assert.throws(()=>storage.checkReadable(settings),/gesperrt/);assert.throws(()=>storage.setItem(settings,'{}'),/gesperrt/);
 assert.equal(storage.getItem('offlinecad-autosave-v7'),null);assert.deepEqual(fs.readFileSync(file),bytes);
});
test('Previous portable settings are backed up exactly, including invalid UTF8 bytes',t=>{
 const dir=path.join(temp(t),'Daten'),store=createProgramStore(dir);store.initialize();const file=path.join(dir,entries[settings].file),bytes=Buffer.from([255,254]);fs.writeFileSync(file,bytes);
 store.change({key:settings,revision:store.read(settings).revision,value:'new'});assert.deepEqual(fs.readFileSync(file+'.vorher'),bytes);assert.equal(fs.readFileSync(file,'utf8'),'new');
});
test('Initial autosave failure does not reject startup and unsuccessful checkpoints are not marked saved',async()=>{
 const failure=Error('quota'),messages=[];assert.equal(await writeStartupRecovery({recovery:{write:()=>{throw failure;}},serialize:()=> '{}',version:24,onError:e=>messages.push(e)}),false);assert.deepEqual(messages,[failure]);
 assert.equal(await writeStartupRecovery({recovery:{write:async()=>false},serialize:()=> '{}',version:24,onError:()=>assert.fail()}),false);
 assert.equal(await writeStartupRecovery({recovery:{write:async()=>true},serialize:()=> '{}',version:24,onError:()=>assert.fail()}),true);
});
test('System theme updates root, body and view on live OS changes; explicit mode stays fixed',()=>{
 const document={documentElement:{dataset:{}},body:{dataset:{}}};let listener,view;
 const media={matches:true,addEventListener:(event,fn)=>listener=fn,removeEventListener:(event,fn)=>assert.equal(fn,listener)};
 const theme=createThemeBinding({document,media,setViewTheme:dark=>view=dark});theme.set('system');assert.equal(document.documentElement.dataset.theme,'dark');assert.equal(document.body.dataset.theme,'dark');assert.equal(view,true);
 media.matches=false;listener();assert.equal(document.documentElement.dataset.theme,'light');assert.equal(view,false);theme.set('dark');listener();assert.equal(view,true);theme.dispose();
});
test('A damaged recent index is repaired with an exact backup and valid entries survive',async t=>{
 const dir=temp(t),file=path.join(dir,'fixture.ocad');fs.writeFileSync(file,'model');const original=JSON.stringify({version:1,items:[{path:file,usedAt:1},{path:'relative.ocad',usedAt:2}]});fs.writeFileSync(path.join(dir,'.letzte-projekte.json'),original);
 const store=createProjectFiles({directory:dir,dialog:{showOpenDialog:async()=>({filePaths:[file]})}});t.after(()=>store.close());
 assert.equal((await store.list()).recent.length,1);assert.equal(fs.readFileSync(path.join(dir,'.letzte-projekte.json.vorher'),'utf8'),original);assert.equal((await store.open()).warning,null);assert.equal((await store.open()).warning,null);
});
test('An external edit during a Windows rename retry aborts project commit and retains the external bytes',async t=>{
 const dir=temp(t),file=path.join(dir,'fixture.ocad');fs.writeFileSync(file,'original');let attempts=0;
 const store=createProjectFiles({directory:dir,dialog:{showOpenDialog:async()=>({filePaths:[file]})},write:async(target,bytes,options)=>target===file?writeAtomic(target,bytes,{...options,platform:'win32',rename:async()=>{attempts++;throw Object.assign(Error('busy'),{code:'EBUSY'});},wait:async()=>fs.writeFileSync(file,'external')}):writeAtomic(target,bytes,options)});t.after(()=>store.close());
 const opened=await store.open();await assert.rejects(store.save({filename:'fixture.ocad',id:opened.file.id,bytes:Buffer.from('replacement')}),{code:'ABORTED'});assert.equal(attempts,1);assert.equal(fs.readFileSync(file,'utf8'),'external');assert(!fs.readdirSync(dir).some(name=>name.endsWith('.tmp')));
});
test('Future layout format is preserved until explicit recovery and backed up on reset',async t=>{
 const dir=temp(t),file=path.join(dir,'layouts.json'),bytes=JSON.stringify({format:'Formnaro-Layouts',version:2,unknown:'keep'});fs.writeFileSync(file,bytes);const store=createLayoutStore(dir),view=await store.inspect();
 assert(view.recoveryRequired);assert.match(view.warning,/neueren/);await assert.rejects(store.change({revision:view.revision,command:{action:'reset'}}));assert.equal(fs.readFileSync(file,'utf8'),bytes);
 const recovered=await store.change({revision:view.revision,command:{action:'recover'}});assert.equal(recovered.data.version,1);assert.equal(fs.readFileSync(file+'.vorher','utf8'),bytes);
});
