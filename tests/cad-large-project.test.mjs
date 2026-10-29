import test from 'node:test';
import assert from 'node:assert/strict';
import {createCadProject,CAD_IDENTITY_MATRIX,serializeCadProject,cadProjectNeedsPackage} from '../src/cad-project.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {encodeFnpackProject,createFnpackResolver} from '../src/cad-fnpack-data.js';

test('preview identity accepts a retained-source project above the plain JSON file limit; package roundtrip and Undo remain exact',async()=>{
 const data='source geometry '.repeat(Math.ceil(10*1024*1024/16)),body=id=>({id,kind:'cad',name:id,source:'step',solid:true,transform:[...CAD_IDENTITY_MATRIX],brep:{format:'OpenCascade-BRep',data,triangulation:false},stats:{bounds:{min:[0,0,0],max:[10,10,10]},volume:1000,solids:1}});
 const initial=createCadProject({nodes:[0,1,2,3].map(i=>body('body'+i))}),store=createCadTransactions({initial,build:async p=>p}),revision=store.revision(),original=store.serialize(),candidate=store.snapshot();candidate.nodes.push(body('result'));
 assert(JSON.stringify(candidate).length>50*1024*1024);
 const preview=await store.preview({revision,project:candidate});assert.equal(store.serialize(),original);assert.equal(store.state().undo,0);
 store.apply(preview);assert.equal(store.state().undo,1);assert.notEqual(store.revision(),revision);
 assert.equal(cadProjectNeedsPackage(store.readSnapshot()),true);assert.equal(cadProjectNeedsPackage(initial),false);
 assert.throws(()=>serializeCadProject(store.readSnapshot()),/50 MB/,'Plain JSON file limit remains independent');
 const encoded=encodeFnpackProject(store.readSnapshot()),blocks=new Map(encoded.blocks.map(b=>[b.sha256,b.bytes]));assert.equal(blocks.size,1);
 const hydrated=await createFnpackResolver({readBlock:async h=>blocks.get(h)}).hydrate(encoded.project);assert.equal(hydrated.nodes.length,5);assert.equal(hydrated.nodes[4].brep.data,data);
 store.undo();assert.equal(store.serialize(),original);store.redo();assert.equal(store.snapshot().nodes[4].brep.data,data);
});
