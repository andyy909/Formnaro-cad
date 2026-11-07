import test from 'node:test';import assert from 'node:assert/strict';import {createFnpackRecovery,PACK_RECOVERY_KIND} from '../src/cad-fnpack-recovery.js';
import {createCadProject} from '../src/cad-project.js';

test('both autosave formats share one active write and replace only the unstarted snapshot',async()=>{
 const captured=[],pending=[],values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},project=createCadProject(),recovery=createFnpackRecovery({desktop:{savePackRecovery:data=>{captured.push(data.project);return new Promise(resolve=>pending.push(resolve));}},storage,files:{encode:p=>({project:p})},legacy:{blocked:()=>false},getProject:()=>project,preferPack:()=>true});
 const first=recovery.write(project);project.name='Second';const second=recovery.write(project);
 project.name='Latest';const latest=recovery.write(project);project.name='Caller changed';
 assert.equal(await second,false);
 assert.equal(captured[0].name,'Unbenanntes Modell');pending.shift()({saved:true});
 assert.equal(await first,true);assert.equal(captured[1].name,'Latest');pending.shift()({saved:true});
 assert.equal(await latest,true);assert.equal(values.get(PACK_RECOVERY_KIND),'fnpack');
});
function fixture({kind='ocad',saved=true,broken=false}={}){const values=new Map([[PACK_RECOVERY_KIND,kind]]),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},calls=[],project={nodes:[]},legacy={load:async verify=>{calls.push('legacy-load');return verify(project);},write:()=>{calls.push('legacy-write');return true;},blocked:()=>false},desktop={openPackRecovery:async()=>{calls.push('pack-open');if(broken)throw Error('broken package');return {opened:true,project,fnpack:{sourceId:'session'}};},savePackRecovery:async()=>{calls.push('pack-save');return {saved};}},files={register:value=>calls.push(value.sourceId),encode:p=>({project:p,sourceIds:['session'],blocks:[]})};let preferred=kind==='fnpack';const recovery=createFnpackRecovery({desktop,storage,files,legacy,getProject:()=>project,preferPack:()=>preferred});return {calls,values,recovery,setPreferred:v=>preferred=v};}
test('package recovery chooses a self-contained native package and retains ordinary recovery contracts',async()=>{const normal=fixture();await normal.recovery.load(p=>p);assert.equal(await normal.recovery.write('{}'),true);assert.deepEqual(normal.calls,['legacy-load','legacy-write']);const pack=fixture({kind:'fnpack'});await pack.recovery.load(p=>p);assert.deepEqual(pack.calls,['pack-open','session']);assert.equal(await pack.recovery.write('{"nodes":[]}'),true);assert.equal(pack.values.get(PACK_RECOVERY_KIND),'fnpack');pack.setPreferred(false);assert.equal(await pack.recovery.write('{}'),true);assert.equal(pack.values.get(PACK_RECOVERY_KIND),'ocad');});
test('format switches are published only after the latest queued write completes',async()=>{
 const values=new Map([[PACK_RECOVERY_KIND,'fnpack']]),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 const writes=[],pending=[];
 const hold=(format,value)=>{writes.push([format,value]);return new Promise(resolve=>pending.push(resolve));};
 let pack=false;
 const recovery=createFnpackRecovery({storage,preferPack:()=>pack,getProject:()=>({nodes:[]}),
  files:{encode:project=>project},legacy:{write:value=>hold('ocad',value),blocked:()=>false},
  desktop:{savePackRecovery:value=>hold('fnpack',value)}});
 const first=recovery.write('first');
 const second=recovery.write('second');
 pack=true;
 const latest=recovery.write('{"nodes":[]}');
 pack=false;
 assert.deepEqual(writes,[['ocad','first']]);
 assert.equal(await second,false);
 assert.equal(values.get(PACK_RECOVERY_KIND),'fnpack');
 pending.shift()(true);
 assert.equal(await first,true);
 assert.deepEqual(writes,[['ocad','first'],['fnpack',{nodes:[]}]]);
 assert.equal(values.get(PACK_RECOVERY_KIND),'ocad');
 pending.shift()({saved:true});
 assert.equal(await latest,true);
 assert.equal(values.get(PACK_RECOVERY_KIND),'fnpack');
});
test('a missing/corrupt package recovery blocks subsequent writes without falling through to unrelated older recovery',async()=>{const f=fixture({kind:'fnpack',broken:true});await assert.rejects(f.recovery.load(p=>p),/broken package/);assert.equal(f.recovery.write('{}'),false);assert.equal(f.recovery.blocked(),true);assert.deepEqual(f.calls,['pack-open']);});
test('an unsuccessful native package autosave keeps the previous recovery kind and reports its blocked state',async()=>{const f=fixture({saved:false});f.setPreferred(true);assert.equal(await f.recovery.write('{"nodes":[]}'),false);assert.equal(f.values.get(PACK_RECOVERY_KIND),'ocad');assert.equal(f.recovery.blocked(),true);assert.equal(f.recovery.isWriting(),false);});
