import test from 'node:test';
import assert from 'node:assert/strict';
import {createCreationDomain,resolveCreationDomain,CREATION_DOMAIN_KEY} from '../src/cad-creation-domain.js';

const cad={id:'c',kind:'cad'},mesh={id:'m',kind:'mesh'},reference={id:'r',kind:'referenceMesh'};
const selection=(...ids)=>ids.map(rootId=>({rootId,path:[]}));
test('automatic type uses actual project bodies and ignores display references',()=>{
  for(const nodes of [[],[reference],[cad],[reference,cad]])assert.equal(resolveCreationDomain({nodes}),'cad');
  for(const nodes of [[mesh],[reference,mesh],[{...mesh,hidden:true,locked:true,meshRole:'hole'}]])assert.equal(resolveCreationDomain({nodes}),'mesh');
});
test('mixed projects require a single selected kind, including grouped sources',()=>{
  const project={nodes:[cad,mesh,reference,{id:'m2',kind:'mesh'}]};
  assert.equal(resolveCreationDomain(project,selection('c')),'cad');
  assert.equal(resolveCreationDomain(project,selection('m','m2')),'mesh');
  assert.equal(resolveCreationDomain(project,[{rootId:'m',path:[0]}]),'mesh');
  for(const targets of [[],selection('c','m'),selection('r'),selection('deleted')])assert.equal(resolveCreationDomain(project,targets),null);
});
test('explicit choice overrides selection and project without mutating either',()=>{
  const project={nodes:[cad,mesh,reference]},targets=selection('c','m'),before=structuredClone({project,targets});
  for(const mode of ['cad','mesh'])assert.equal(resolveCreationDomain(project,targets,mode),mode);
  assert.throws(()=>resolveCreationDomain(project,targets,'foreign'));
  assert.deepEqual({project,targets},before);
});
test('new, damaged or future preferences start automatic; valid preferences survive restart',()=>{
  for(const value of [null,'broken','"mesh"','{"version":2,"mode":"mesh"}','{"version":1,"mode":"foreign"}'])assert.equal(createCreationDomain({getItem:()=>value}).get(),'auto');
  const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)},domain=createCreationDomain(storage);
  assert.equal(domain.set('mesh'),true);assert.deepEqual(JSON.parse(values.get(CREATION_DOMAIN_KEY)),{version:1,mode:'mesh'});
  assert.equal(createCreationDomain(storage).get(),'mesh');assert.equal(domain.set('mesh'),false);assert.throws(()=>domain.set('foreign'));
});
test('failed portable write keeps the last confirmed preference',()=>{
  const domain=createCreationDomain({getItem:()=>null,setItem:()=>{throw Error('read-only');}});
  assert.throws(()=>domain.set('mesh'),/read-only/);assert.equal(domain.get(),'auto');
});
