import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCadKernel} from '../src/cad-kernel-loader.js';
import {createCadService} from '../src/cad-service.js';
import {cadPluginRecipes,buildCadPluginShape} from '../src/cad-plugin-recipes.js';
import {EXAMPLE_PLUGIN} from '../src/settings-ui.js';
import {defaults} from '../src/parameters.js';
import {cadIdentity,cadPoint} from '../src/cad-affine.js';
import {cadThreadDefinition} from '../src/cad-screw-surfaces.js';
import {validateCadSolid,brepHasNoTriangulation} from '../src/cad-native-kernel.js';
const oc=await loadCadKernel({print:()=>{},printErr:()=>{}});
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<=e,`${a} vs ${b}`);
test('Original local forms-package contract adapts to independent CAD recipes without changing source manifests',()=>{
  const before=structuredClone(EXAMPLE_PLUGIN),adapted=cadPluginRecipes(EXAMPLE_PLUGIN,'flange',{language:'en'});
  assert.equal(adapted.name,'Drilled flange');assert.equal(adapted.sources.length,6);assert.equal(adapted.sources.filter(source=>!source.solid).length,5);assert.deepEqual(adapted.plugin,{id:'workshop',shapeId:'flange'});assert.deepEqual(EXAMPLE_PLUGIN,before);
  assert.ok(adapted.sources.every(source=>!Object.hasOwn(source.recipe,'mesh')&&!Object.hasOwn(source.recipe.params||{},'edgeSteps')));
  adapted.manifest.shapes[0].name='changed';assert.deepEqual(EXAMPLE_PLUGIN,before);
  assert.throws(()=>cadPluginRecipes({...EXAMPLE_PLUGIN,scripts:['unsafe']},'flange'),/ungültige Angaben/);assert.throws(()=>cadPluginRecipes(EXAMPLE_PLUGIN,'absent'),/fehlt/);
});
test('Original spacer and flange packs build native sources and CAD holes, preserving parameter/color/plugin metadata',async()=>{
  const service=createCadService({oc});try{
    const spacer=await buildCadPluginShape(service,EXAMPLE_PLUGIN,'spacer',{id:'isolated-plugin-spacer',metadata:{tags:['review'],notes:'kept'}});
    assert.equal(spacer.source,'native');assert.equal(spacer.recipe.params.wall,3);assert.deepEqual(spacer.metadata,{tags:['review'],notes:'kept',plugin:{id:'workshop',shapeId:'spacer'}});near(spacer.stats.volume,Math.PI*(64-25)*12);assert.ok(brepHasNoTriangulation(spacer.brep.data));
    const flange=await buildCadPluginShape(service,EXAMPLE_PLUGIN,'flange',{id:'isolated-plugin-flange'});assert.equal(flange.source,'group');assert.equal(flange.children.length,6);assert.equal(flange.children.filter(child=>!child.solid).length,5);near(flange.stats.volume,Math.PI*(400-4*4-25)*6,1e-5);
    for(const [i,child] of flange.children.entries()){assert.equal(child.source,'native');assert.equal(child.recipe.type,'cylinder');assert.deepEqual(child.metadata.plugin,{id:'workshop',shapeId:'flange'});assert.equal(child.color,defaults('cylinder').color||'#ebac3c');const expected=EXAMPLE_PLUGIN.shapes[1].nodes[i].pos;assert.deepEqual(child.transform.slice(12,15),expected);assert.ok(brepHasNoTriangulation(child.brep.data));}
    const world=service.worldShape(flange);try{assert.equal(validateCadSolid(oc,world).solids,1);}finally{world.delete();}
  }finally{service.dispose();}
});
test('Original threaded-insert template uses a CAD screw cutter and keeps editable original sources',async()=>{
  const service=createCadService({oc});try{
    const inserted=await buildCadPluginShape(service,EXAMPLE_PLUGIN,'insert',{id:'isolated-plugin-insert'}),cutter=inserted.children.find(child=>!child.solid);
    assert.equal(cutter.recipe.type,'thread');assert.equal(cutter.recipe.params.kind,'cutter');assert.equal(cutter.recipe.params.pitch,1.25);assert.equal(cutter.recipe.params.length,20);assert.equal(cutter.recipe.params.clearance,.15);assert.ok(brepHasNoTriangulation(inserted.brep.data));
    const d=cadThreadDefinition(cutter.recipe.params),mean=(2*d.crest*d.major**2+2*d.flank*(d.minor**2+d.minor*d.major+d.major**2)/3+2*d.gap*d.minor**2)/d.p.pitch;
    near(inserted.stats.volume,Math.PI*(100-mean)*16,.03);const world=service.worldShape(inserted);try{assert.equal(validateCadSolid(oc,world).solids,1);}finally{world.delete();}
  }finally{service.dispose();}
});
test('Template size/rotation/mirror placements remain full affine CAD transforms under parent shear',async()=>{
  const manifest={format:'OfflineCAD-Plugin',version:1,id:'affine',name:'CAD-Pack',shapes:[{id:'gear',name:'gear',description:'Original CAD recipe',nodes:[{type:'gear',size:[20,12,4],pos:[3,5,7],rot:[0,0,30],mirror:[-1,1,1],color:'#4466aa',params:{teeth:8,module:1,thickness:2,bore:0}}]}]},before=structuredClone(manifest),parent=cadIdentity();parent[4]=.4;parent[12]=10;
  const service=createCadService({oc});try{
    const node=await buildCadPluginShape(service,manifest,'gear',{id:'isolated-plugin-affine',transform:parent}),center=node.stats.bounds.min.map((v,i)=>(v+node.stats.bounds.max[i])/2),placed=cadPoint(node.transform,center);
    for(let i=0;i<3;i++)near(placed[i],cadPoint(parent,[3,5,7])[i],1e-4);
    assert.equal(node.recipe.params.module,1);assert.equal(node.recipe.params.thickness,2);assert.deepEqual(node.metadata.plugin,{id:'affine',shapeId:'gear'});assert.equal(node.metadata.notes,'Original CAD recipe');assert.equal(node.color,'#4466aa');assert.deepEqual(manifest,before);assert.ok(node.transform[0]<0);
    const world=service.worldShape(node);try{assert.equal(validateCadSolid(oc,world).solids,1);}finally{world.delete();}
    const controller=new AbortController();controller.abort();await assert.rejects(buildCadPluginShape(service,manifest,'gear',{signal:controller.signal}),{name:'AbortError'});
  }finally{service.dispose();}
});
