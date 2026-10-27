import test from 'node:test';
import assert from 'node:assert/strict';
import initialize from '../cad-kernel-build/runtime/formnaro_cad.js';
import {createOperations} from '../src/operations.js';
import {createNode,emptyProject,encodeProject,decodeProject} from '../src/model.js';
const kernel=await initialize({print:()=>{},printErr:()=>{}});const run=createOperations(kernel);
const near=(a,b)=>assert.ok(Math.abs(a-b)<.02,`${a} vs ${b}`);
const volume=async n=>{const [{data}]=await run('render',[n]);return data.volume*n.size.reduce((a,b)=>a*b,1);};
function fixture(){const body=createNode('box');body.size=[30,20,10];body.pos=[0,0,5];const holes=[-5,5].map((x,i)=>{const h=createNode('box');h.size=[4,4,20];h.pos=[x,0,5];h.solid=false;h.name='Loch '+i;h.notes='Quellnotiz '+i;return h;});return {body,holes};}
function stlVolume(buffer){const v=new DataView(buffer);let sum=0;for(let i=0;i<v.getUint32(80,true);i++){const p=Array.from({length:9},(_,j)=>v.getFloat32(84+i*50+12+j*4,true));sum+=p[0]*(p[4]*p[8]-p[5]*p[7])+p[1]*(p[5]*p[6]-p[3]*p[8])+p[2]*(p[3]*p[7]-p[4]*p[6]);}return sum/6;}

test('hole-only union retains role and exact editable sources through save, reload and dissolve',async()=>{
 const {holes}=fixture(),before=structuredClone(holes),g=await run('group',{nodes:holes});assert.equal(g.solid,false);assert.equal(g.children.length,2);near(await volume(g),640);assert.deepEqual(holes,before);
 const restored=decodeProject(encodeProject({...emptyProject(),nodes:[g]}));assert.equal(restored.nodes[0].solid,false);await run('validate',restored);const parts=await run('ungroup',restored.nodes[0]);parts.forEach((n,i)=>{assert.equal(n.solid,false);assert.equal(n.id,holes[i].id);assert.equal(n.name,holes[i].name);assert.equal(n.notes,holes[i].notes);assert.deepEqual(n.params,holes[i].params);n.pos.forEach((v,k)=>near(v,holes[i].pos[k]));n.size.forEach((v,k)=>near(v,holes[i].size[k]));});
 await assert.rejects(run('export',[g]));
});

test('nested cutter removes independently expected material in actual binary STL',async()=>{
 const {body,holes}=fixture(),g=await run('group',{nodes:holes}),cut=await run('group',{nodes:[body,g]});assert.equal(cut.solid,true);near(await volume(cut),5680);near(stlVolume(await run('export',[cut])),5680);const parts=await run('ungroup',cut);assert.equal(parts[1].solid,false);assert.equal(parts[1].children.length,2);
});

test('hole intersection stays a hole and empty intersection rejects without mutating sources',async()=>{
 const {holes}=fixture();holes[0].pos[0]=-1;holes[1].pos[0]=1;const g=await run('group',{nodes:holes,operation:'intersection'});assert.equal(g.solid,false);near(await volume(g),160);holes[1].pos[0]=50;const before=JSON.stringify(holes);await assert.rejects(run('group',{nodes:holes,operation:'intersection'}));assert.equal(JSON.stringify(holes),before);
});

test('scaled rotated mirrored hole group dissolves into cutters with the same total geometry',async()=>{
 const {holes}=fixture(),g=await run('group',{nodes:holes});g.size=g.size.map(v=>v*2);g.rot=[19,27,41];g.mirror=[-1,1,1];g.pos=[30,-10,15];const parts=await run('ungroup',g);assert(parts.every(n=>!n.solid));const rebuilt=await run('group',{nodes:parts});assert.equal(rebuilt.solid,false);near(await volume(rebuilt),5120);near(await volume(g),5120);
});

test('lazy native AI accepts ordinary hole groups and can create its own without losing the role',async()=>{const {holes}=fixture(),project={...emptyProject(),nodes:holes},start=await run('ai-begin',{project,selection:[]}),out=await run('ai-run',{project:start.project,operation:{kind:'batch',commands:[{op:'group',targets:holes.map(n=>n.id)}]}});assert.equal(out.project.nodes[0].solid,false);near(out.project.nodes[0].stats.volume,640);const mini=await run('ai-convert',{project:out.project,baseline:project,nativeBaseline:start.project});assert.equal(mini.nodes[0].solid,false);near((await run('ai-begin',{project:mini})).scene.objects[0].volume,640);const group=await run('group',{nodes:holes}),begun=await run('ai-begin',{project:{...emptyProject(),nodes:[group]}});assert.equal(begun.project.nodes[0].solid,false);near(begun.project.nodes[0].stats.volume,640);});
