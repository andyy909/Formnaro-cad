import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCadKernel} from '../src/cad-kernel-loader.js';
import {createCadService} from '../src/cad-service.js';
import {createCadCommandRouter} from '../src/cad-command-router.js';
import {cadRecipeForShape,cadEditFormRecipe,cadFitFormDimensions} from '../src/cad-form-controls.js';
import {cadShapeDimensions,cadShapeDimensionEdit} from '../src/cad-shape-dimensions.js';
import {createCadProject,serializeCadProject,parseCadProject} from '../src/cad-project.js';
import {cadIdentity,cadPoint} from '../src/cad-affine.js';
import {cadFormLocalDimensions} from '../src/cad-interface-state.js';
const oc=await loadCadKernel({print:()=>{},printErr:()=>{}}),near=(a,b,e=1e-5)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const anchor=node=>cadPoint(node.transform,[(node.stats.bounds.min[0]+node.stats.bounds.max[0])/2,(node.stats.bounds.min[1]+node.stats.bounds.max[1])/2,node.stats.bounds.min[2]]);
function fixture(){const service=createCadService({oc}),router=createCadCommandRouter({oc,service,editRecipe:cadEditFormRecipe});return {service,router};}
const values=node=>Object.fromEntries(cadShapeDimensions(node).map(field=>[field.key,field.value]));
async function change(router,project,key,value,target={rootId:project.nodes[0].id,path:[]}){let node=project.nodes.find(node=>node.id===target.rootId);for(const id of target.path)node=node.children.find(child=>child.id===id);return (await router.run(project,{kind:'form',target,...cadShapeDimensionEdit(node,key,value)})).project;}

test('Ring and tube radii produce the screenshot dimensions, exact native volume and fixed bottom',async()=>{
 const {service,router}=fixture();try{
  const original=service.nativeNode(cadRecipeForShape('torus'),{id:'ring'}),fixed=anchor(original);let project=createCadProject({nodes:[original]});
  project=await change(router,project,'ringRadius',7.5);project=await change(router,project,'tubeRadius',2.5);const ring=project.nodes[0],v=values(ring);
  near(v.ringRadius,7.5);near(v.tubeRadius,2.5);near(v.outerDiameter,20);near(v.innerDiameter,10);near(v.height,5);anchor(ring).forEach((n,i)=>near(n,fixed[i]));near(service.inspect(ring).volume,2*Math.PI**2*7.5*2.5**2,1e-4);
  const roundTrip=parseCadProject(serializeCadProject(project));assert.deepEqual(roundTrip.nodes[0].recipe,ring.recipe);assert.equal(roundTrip.nodes[0].brep.data,ring.brep.data);
  project=await change(router,project,'height',3);near(values(project.nodes[0]).tubeRadius,2.5);near(values(project.nodes[0]).height,3);near(service.inspect(project.nodes[0]).volume,2*Math.PI**2*7.5*2.5*1.5,1e-4);
  assert.throws(()=>cadShapeDimensionEdit(ring,'tubeRadius',8),/Ringradius/);assert.throws(()=>cadShapeDimensionEdit(ring,'outerDiameter',9),/Ringradius/);
 }finally{service.dispose();}
});

test('Tube inner/outer diameters and height update physical wall dimensions and volume',async()=>{
 const {service,router}=fixture();try{
  let p=createCadProject({nodes:[service.nativeNode(cadRecipeForShape('tube'),{id:'tube'})]});
  p=await change(router,p,'innerDiameter',10);near(values(p.nodes[0]).wall,5);near(service.inspect(p.nodes[0]).volume,Math.PI*(10**2-5**2)*20);
  p=await change(router,p,'outerDiameter',30);near(values(p.nodes[0]).wall,5);near(values(p.nodes[0]).innerDiameter,20);
  p=await change(router,p,'height',12);near(service.inspect(p.nodes[0]).volume,Math.PI*(15**2-10**2)*12);
  assert.throws(()=>cadShapeDimensionEdit(p.nodes[0],'innerDiameter',31),/Rohrwand/);assert.throws(()=>cadShapeDimensionEdit(p.nodes[0],'wall',15),/Rohrwand/);
 }finally{service.dispose();}
});

test('Cylinder, sphere, hemisphere and cone controls build physical radii and analytic volumes',async()=>{
 const {service,router}=fixture();try{
  for(const [type,key,value,expected,size]of [['cylinder','radius',6,Math.PI*36*20,[12,12,20]],['sphere','radius',6,4*Math.PI*6**3/3,[12,12,12]],['halfSphere','radius',6,2*Math.PI*6**3/3,[12,12,6]],['cone','topDiameter',8,Math.PI*20*(400+160+64)/12,[20,20,20]]]){
   const p=await change(router,createCadProject({nodes:[service.nativeNode(cadRecipeForShape(type),{id:type})]}),key,value);near(service.inspect(p.nodes[0]).volume,expected);cadFormLocalDimensions(p.nodes[0]).forEach((v,i)=>near(v,size[i]));
  }
 }finally{service.dispose();}
});

test('Scaled mirrored/sheared nested sources preserve source bottom, axis directions, parent and sibling',async()=>{
 const {service,router}=fixture();try{
  const matrix=cadIdentity();matrix[0]=-2;matrix[4]=.3;matrix[5]=1.4;matrix[9]=.2;matrix[10]=1.3;matrix[12]=15;matrix[14]=20;
  const ring=service.nativeNode(cadRecipeForShape('torus'),{id:'ring',transform:matrix,color:'#112233',metadata:{notes:'Keep me'}}),box=service.nativeNode(cadRecipeForShape('box'),{id:'sibling'}),group={...structuredClone(box),id:'group',source:'group',operation:'union',children:[ring,box],transform:cadIdentity()};delete group.recipe;group.transform[4]=.2;
  let p=await service.rebuild(createCadProject({nodes:[group]}));const before=structuredClone(p),old=p.nodes[0].children[0],fixed=anchor(old);p=await change(router,p,'ringRadius',30,{rootId:'group',path:['ring']});const next=p.nodes[0].children[0];near(values(next).ringRadius,30);anchor(next).forEach((v,i)=>near(v,fixed[i]));
  assert.deepEqual(next.metadata,old.metadata);assert.equal(next.color,old.color);assert.deepEqual(p.nodes[0].transform,before.nodes[0].transform);assert.deepEqual(p.nodes[0].children[1],before.nodes[0].children[1]);
  for(let axis=0;axis<3;axis++){const norm=Math.hypot(...matrix.slice(4*axis,4*axis+3)),newNorm=Math.hypot(...next.transform.slice(4*axis,4*axis+3));for(let k=0;k<3;k++)near(matrix[4*axis+k]/norm,next.transform[4*axis+k]/newNorm);}
  const replacement=service.nativeNode(old.recipe,{id:old.id});for(const dims of [[0,1,1],[Infinity,1,1],[1,1],[1,1,10001]])assert.throws(()=>cadFitFormDimensions(old,replacement,dims));
  const locked=structuredClone(p);locked.nodes[0].locked=true;await assert.rejects(change(router,locked,'ringRadius',32,{rootId:'group',path:['ring']}));
 }finally{service.dispose();}
});

test('Height and taper edits retain elliptically stretched X/Y source dimensions',async()=>{
 const {service,router}=fixture();try{
  const matrix=cadIdentity();matrix[0]=2;
  let p=createCadProject({nodes:[service.nativeNode(cadRecipeForShape('cone',{params:{topDiameter:12}}),{id:'ellipse-cone',transform:matrix})]});
  near(values(p.nodes[0]).topDiameter,24);p=await change(router,p,'height',21);p=await change(router,p,'topDiameter',26);near(values(p.nodes[0]).topDiameter,26);cadFormLocalDimensions(p.nodes[0]).forEach((v,i)=>near(v,[40,20,21][i]));
  p=createCadProject({nodes:[service.nativeNode(cadRecipeForShape('tube'),{id:'ellipse-tube',transform:matrix})]});const wall=values(p.nodes[0]).wall;p=await change(router,p,'height',15);near(values(p.nodes[0]).wall,wall);cadFormLocalDimensions(p.nodes[0]).forEach((v,i)=>near(v,[40,20,15][i]));
 }finally{service.dispose();}
});
