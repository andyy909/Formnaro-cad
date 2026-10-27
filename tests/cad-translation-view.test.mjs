import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareCadTranslationView} from '../src/cad-translation-view.js';
import {loadCadKernel} from '../src/cad-kernel-loader.js';
import {createCadService} from '../src/cad-service.js';
import {createCadCommandRouter} from '../src/cad-command-router.js';
import {createCadProject,cadProjectRevision} from '../src/cad-project.js';
const oc=await loadCadKernel({print:()=>{},printErr:()=>{}});

test('Translations of rotated, mirrored and sheared native parts match an independent native scene and preserve display buffers',async()=>{
 const service=createCadService({oc}),router=createCadCommandRouter({oc,service});
 try{
  const node=service.nativeNode({type:'box',size:[12,8,6]},{id:'part'});node.transform=[-1.1,.2,0,0,.3,.9,.1,0,0,0,1.2,0,5,-4,10,1];
  const baseline=await service.rebuild(createCadProject({nodes:[node]})),scene=router.scene(baseline),meshes=service.display(baseline),view={revision:scene.revision,scene,meshes};
  const project=structuredClone(baseline);project.nodes[0].transform[12]+=17;project.nodes[0].transform[13]-=23;project.nodes[0].transform[14]+=9;
  const prepared=prepareCadTranslationView(baseline,project,view,cadProjectRevision(project)),native=router.scene(await service.rebuild(project));
  assert(prepared);assert.deepEqual(prepared.scene,native);assert.equal(prepared.meshes[0].mesh,view.meshes[0].mesh);
  assert.deepEqual(prepared.meshes,service.display(project));assert.equal(baseline.nodes[0].transform[12],5);
  for(const change of [p=>p.nodes[0].transform[0]*=2,p=>p.nodes[0].recipe.size[0]++,p=>p.nodes[0].brep.data+=' ',p=>p.nodes[0].stats.volume++,p=>p.nodes[0].color='#ffffff',p=>p.layers[0].locked=true,p=>p.workplane.origin[0]++,p=>p.nodes.reverse()]){
   const altered=structuredClone(project);change(altered);if(JSON.stringify(altered)===JSON.stringify(project))continue;assert.equal(prepareCadTranslationView(baseline,altered,view,'new'),null);
  }
  const out=structuredClone(project);out.nodes[0].transform[12]=100001;assert.equal(prepareCadTranslationView(baseline,out,view,'new'),null);
 }finally{service.dispose();}
});

test('Group root translations shift all source worlds; source edits, annotations and geometric references stay native',async()=>{
 const service=createCadService({oc}),router=createCadCommandRouter({oc,service});
 try{
  const body=service.nativeNode({type:'box',size:[20,20,8]},{id:'body'}),hole=service.nativeNode({type:'cylinder',size:[4,4,12]},{id:'hole',solid:false});
  const group={...body,id:'group',source:'group',operation:'union',children:[body,hole]};delete group.recipe;
  const baseline=await service.rebuild(createCadProject({nodes:[group]})),scene=router.scene(baseline),view={revision:scene.revision,scene,meshes:service.display(baseline)};
  const next=structuredClone(baseline);next.nodes[0].transform[12]=40;next.nodes[0].transform[13]=-15;
  const prepared=prepareCadTranslationView(baseline,next,view,cadProjectRevision(next));assert.deepEqual(prepared.scene,router.scene(await service.rebuild(next)));
  const child=structuredClone(next);child.nodes[0].children[1].transform[12]=3;assert.equal(prepareCadTranslationView(baseline,child,view,'new'),null);
  const annotated=structuredClone(baseline);annotated.nodes[0].annotations=[{}];assert.equal(prepareCadTranslationView(annotated,next,view,'new'),null);
  const referenced=structuredClone(baseline);referenced.workplane.reference={};assert.equal(prepareCadTranslationView(referenced,next,view,'new'),null);
 }finally{service.dispose();}
});
