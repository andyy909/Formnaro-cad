import test from 'node:test';
import assert from 'node:assert/strict';
import {createEasyDomain,EASY_DOMAIN_KEY,easyDomainAllows,easyImportPolicy,easyExportIds} from '../src/cad-easy-domain.js';
test('new and damaged preferences start in CAD; only a valid versioned domain is restored',()=>{
 for(const value of [null,'broken','"mesh"','{"version":2,"kind":"mesh"}','{"version":1,"kind":"foreign"}'])assert.equal(createEasyDomain({getItem:()=>value}).get(),'cad');
 assert.equal(createEasyDomain({getItem:()=>'{"version":1,"kind":"mesh"}'}).get(),'mesh');
});
test('domain preference persists before changing memory and rejects unknown values',()=>{
 const values=new Map(),domain=createEasyDomain({getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)});
 assert.equal(domain.set('mesh'),true);assert.deepEqual(JSON.parse(values.get(EASY_DOMAIN_KEY)),{version:1,kind:'mesh'});assert.equal(domain.set('mesh'),false);assert.throws(()=>domain.set('other'));assert.equal(domain.get(),'mesh');
});
test('failed portable writes retain the previous domain',()=>{const domain=createEasyDomain({getItem:()=>null,setItem:()=>{throw Error('read-only');}});assert.throws(()=>domain.set('mesh'),/read-only/);assert.equal(domain.get(),'cad');});
test('Easy isolates exact root kinds while normal mode retains references and mixed parts',()=>{
 for(const kind of ['cad','mesh','referenceMesh']){const node={id:'part',kind};assert.equal(easyDomainAllows(node,'cad'),kind==='cad');assert.equal(easyDomainAllows(node,'mesh'),kind==='mesh');assert.equal(easyDomainAllows(node,null),true);}assert.equal(easyDomainAllows(null,'cad'),false);
});
test('imports choose the current type and reject unsupported cross-domain formats',()=>{
 for(const ext of ['STL','obj','.svg','3mf','glb','gltf'])assert.deepEqual(easyImportPolicy(ext,'mesh'),{asMesh:true,reconstruct:false});
 for(const ext of ['step','stp','svg','stl'])assert.deepEqual(easyImportPolicy(ext,'cad'),{asMesh:false,reconstruct:ext==='stl'});
 for(const ext of ['obj','3mf','glb','gltf'])assert.throws(()=>easyImportPolicy(ext,'cad'),/Netz-Bereich/);assert.throws(()=>easyImportPolicy('step','mesh'),/CAD-Bereich/);assert.equal(easyImportPolicy('any',null),null);
});
test('exports are restricted by kind and persistent visibility, without modifying project or requested IDs',()=>{
 const project={layers:[{id:'hidden',hidden:true}],folders:[],nodes:[{id:'c',kind:'cad'},{id:'m',kind:'mesh'},{id:'h',kind:'mesh',hidden:true},{id:'l',kind:'mesh',layerId:'hidden'},{id:'r',kind:'referenceMesh'}]},before=structuredClone(project),ids=['m'];
 assert.deepEqual(easyExportIds(project,'cad',undefined,'stl'),['c']);assert.deepEqual(easyExportIds(project,'mesh',undefined,'stl'),['m']);assert.deepEqual(easyExportIds(project,'mesh',ids,'stl'),ids);assert.equal(easyExportIds(project,null,undefined,'step'),undefined);
 assert.throws(()=>easyExportIds(project,'mesh',undefined,'step'),/STEP/);assert.throws(()=>easyExportIds(project,'mesh',['m','c'],'stl'),/anderen Arbeitsbereich/);assert.throws(()=>easyExportIds({...project,nodes:[]},'cad',undefined,'stl'),/keine sichtbaren/);assert.deepEqual(project,before);assert.deepEqual(ids,['m']);
});
