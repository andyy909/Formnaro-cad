import test from 'node:test';
import assert from 'node:assert/strict';
import {meshSourceTree,meshSourceAtPath,meshSourceTreeMetadata} from '../src/cad-mesh-source-tree.js';

const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const legacy=(id,children)=>({id,name:'Quelle '+id,type:children?'group':'box',pos:[0,0,5],rot:[0,0,0],size:[10,10,10],solid:true,...(children?{children}:{})});
const raw=(id)=>({id,kind:'mesh',name:'Netz '+id,color:'#1188aa',transform:[...identity],mesh:{verts:[-2,-3,-4,2,-3,-4,0,3,-4,0,0,4],triangles:[0,2,1,0,1,3,1,2,3,2,0,3]}});
const v1=(id,node=legacy(id))=>({...raw(id),meshSource:{format:'Formnaro-MeshSource',version:1,node}});
const v2=(id,sources,operation={type:'group',mode:'union'})=>({...raw(id),meshSource:{format:'Formnaro-MeshSource',version:2,node:legacy('worker-'+id,[legacy('synthetic-cutter')]),sources,operation}});

test('legacy mesh source paths are virtual, exact and leave source data unchanged',()=>{
  const hole={...legacy('source/with/slash'),solid:false,suppressed:true},group=legacy('group',[hole,legacy('locked')]);group.children[1].locked=true;
  const root=v1('root',group),before=structuredClone(root),items=meshSourceTree(root);
  assert.deepEqual(items.map(item=>item.path),[[],['source/with/slash'],['locked']]);
  assert.equal(items[0].node.name,root.name);assert.equal(items[0].children.length,2);assert.equal(items[1].node.solid,false);assert.equal(items[1].suppressed,true);assert.equal(items[2].locked,true);
  assert.deepEqual(meshSourceAtPath(root,['source/with/slash']).path,items[1].path);
  assert.deepEqual(root,before);
});

test('exact original common sources retain full affine frames and metadata',()=>{
  const original=raw('source');original.transform=[-2,0,0,0,.3,1,0,0,.1,.2,3,0,17,2,-5,1];original.name='Ursprüngliche Scherung';original.meshRole='hole';original.locked=true;
  const root=v2('result',[original]),before=structuredClone(root),item=meshSourceAtPath(root,['source']);
  assert.equal(item.node.name,original.name);assert.equal(item.node.solid,false);assert.equal(item.locked,true);assert.equal(item.common,original);assert.deepEqual(item.common.transform,original.transform);
  assert.deepEqual(item.node.size,[4,6,8]);assert.deepEqual(item.node.pos,[0,0,0]);assert.deepEqual(item.parentPath,null);assert.deepEqual(root,before);
});

test('nested v2 histories expose original source ids and omit generated worker cutters',()=>{
  const leaf=v1('leaf'),nested=v2('nested',[leaf]),root=v2('root',[nested,raw('muted')],{type:'group',mode:'union',suppressedIds:['muted']});
  const items=meshSourceTree(root);
  assert.deepEqual(items.map(item=>item.path),[['nested'],['nested','leaf'],['muted']]);
  assert.equal(items[0].poseEditable,false);assert.equal(items[0].children[0],items[1]);assert.deepEqual(items[1].parentPath,['nested']);assert.equal(items[1].poseEditable,true);assert.equal(items[2].suppressed,true);
  assert.ok(items.every(item=>item.node.id!=='synthetic-cutter'));
});

test('source suppression and ancestor locks remain visible through nested sources',()=>{
  const leaf=v1('leaf',legacy('leaf',[legacy('child')])),nested=v2('nested',[leaf]);nested.locked=true;
  const root=v2('root',[nested],{type:'group',mode:'union',suppressedIds:['nested']}),items=meshSourceTree(root);
  assert.ok(items.every(item=>item.locked));assert.ok(items.slice(1).every(item=>item.hidden));assert.equal(items[0].suppressed,true);assert.equal(items[0].suppressible,true);
});

test('tree-only metadata never scans dense raw geometry or emits native CAD children',()=>{
  const original=raw('dense');Object.defineProperty(original,'mesh',{get(){throw Error('Tree metadata must not read geometry');}});
  const root=v2('root',[original]);
  assert.doesNotThrow(()=>meshSourceTreeMetadata(root));assert.deepEqual(meshSourceTree(root,{geometry:false})[0].path,['dense']);
  assert.deepEqual(meshSourceTree({kind:'cad',meshSource:root.meshSource}),[]);assert.deepEqual(meshSourceTree({kind:'referenceMesh',meshSource:root.meshSource}),[]);
  const safe=v2('safe',[raw('original')]);assert.throws(()=>meshSourceAtPath(safe,[]),/nicht mehr vorhanden/);assert.throws(()=>meshSourceAtPath(safe,'original'),/Ungültiger/);
});
