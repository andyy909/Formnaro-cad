import test from 'node:test';
import assert from 'node:assert/strict';
import loader from '../cad-kernel-build/runtime/formnaro_cad.js';
import {createCadService} from '../src/cad-service.js';
import {cadSketchRecipe} from '../src/cad-sketch.js';
import {affineCadSketchCircle} from '../src/cad-drill-stock-native.js';
import {cadBounds,cadAffineVolume,readCadBrep,validateCadSolid,transformCad} from '../src/cad-native-kernel.js';
import {uniqueCadEdgesNative,cadNativeCurveDto} from '../src/cad-edge-display-native.js';
import {createCadProject} from '../src/cad-project.js';
import {cadColorPartsNative} from '../src/cad-analysis-native.js';
import {paintPartFaces} from '../src/cad-part-properties.js';
import {createCadAIReferencesNative} from '../src/cad-ai-feature-references-native.js';
import {cadAIReferenceState} from '../src/cad-ai-feature-references.js';
const oc=await loader({print:()=>{},printErr:()=>{}});
const recipe=cadSketchRecipe({version:2,kind:'profile',variables:[],dimensions:{height:3},elements:[{id:'circle',type:'circle',center:[2,-1],diameter:12}],loops:[{id:'outer',role:'outer',elements:['circle']}]});
test('affine circle sketch placement retains exact conics under stretch, shear and reflection',()=>{
 const service=createCadService({oc});try{for(const transform of [[2,0,0,0,0,1,0,0,0,0,1,0,23,4,12,1],[-2,.2,0,0,.4,1,0,0,.1,0,2,0,3,4,5,1]]){const source=service.nativeNode(recipe,{id:'circle',transform}),local=readCadBrep(oc,source.brep.data);let shape,edges=[];try{shape=affineCadSketchCircle(oc,source,cadBounds(oc,local));assert(shape);const stats=validateCadSolid(oc,shape);assert(Math.abs(stats.volume-cadAffineVolume(108*Math.PI,transform))<1e-7);edges=uniqueCadEdgesNative(oc,shape);const curves=edges.map(edge=>cadNativeCurveDto(oc,edge));assert(curves.some(curve=>curve.kind==='ellipse'));assert(curves.every(curve=>['ellipse','circle','line'].includes(curve.kind)));assert.equal(source.recipe.sketch.elements[0].diameter,'12');}finally{edges.forEach(edge=>edge.delete());shape?.delete();local.delete();}}}finally{service.dispose();}
});
test('circle metadata cannot substitute a different retained BRep, and similarity uses the existing transform',()=>{
 const service=createCadService({oc});try{const source=service.nativeNode(recipe,{id:'circle'}),local=readCadBrep(oc,source.brep.data);try{assert.equal(affineCadSketchCircle(oc,source,cadBounds(oc,local)),null);}finally{local.delete();}const different=service.nativeNode({type:'box',size:[12,12,3]},{id:'different'});source.brep=different.brep;source.transform[0]=2;const wrong=readCadBrep(oc,source.brep.data);try{assert.equal(affineCadSketchCircle(oc,source,cadBounds(oc,wrong)),null);}finally{wrong.delete();}}finally{service.dispose();}
});
function faceZ(shape){const explorer=new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum.TopAbs_FACE),out=[];try{while(explorer.More()){const raw=explorer.Current(),face=oc.TopoDS.Face(raw);try{const bounds=cadBounds(oc,face);out.push([bounds.min[2],bounds.max[2]]);}finally{face.delete();raw.delete();}explorer.Next();}return out;}finally{explorer.delete();}}
test('V1 and V2 circle cap colors retain their face indices and actual exported mesh surface',()=>{
 const service=createCadService({oc});try{for(const input of [cadSketchRecipe({version:1,kind:'circle',variables:[],dimensions:{diameter:12,height:3},points:[]}),recipe]){const source=service.nativeNode(input,{id:'circle'}),local=readCadBrep(oc,source.brep.data);let original;try{original=faceZ(local);}finally{local.delete();}const top=original.findIndex(([a,b])=>Math.abs(a-3)<1e-8&&Math.abs(b-3)<1e-8)+1;assert(top>0);paintPartFaces(source,{name:'Top',color:'#ff0000',faceIds:[top]});source.transform[0]=2;const parts=cadColorPartsNative(oc,source);try{const current=faceZ(parts[0].shape);assert.equal(current.length,original.length);assert(current.every((pair,k)=>pair.every((v,j)=>Math.abs(v-original[k][j])<1e-6)));assert(parts[0].faceColors.some(c=>c.faceIndex===top&&c.color==='#ff0000'));}finally{parts.forEach(part=>part.shape.delete());}const meshes=service.exportMeshes(createCadProject({nodes:[source]})),red=meshes.find(part=>part.color==='#ff0000');assert(red?.mesh.vertices.length>0);assert(red.mesh.vertices.filter((_v,k)=>k%3===2).every(z=>Math.abs(z-3)<1e-8));assert.equal(source.metadata.partProperties.surfaces.groups[0].faceIds[0],top);}}finally{service.dispose();}
});
test('saved affine sketch edge domains still resolve against the original retained BRep placement',()=>{
 const service=createCadService({oc});try{const source=service.nativeNode(recipe,{id:'circle'});source.transform[0]=2;const project=createCadProject({nodes:[source]}),target={rootId:source.id,path:[]},old=createCadAIReferencesNative({oc,service:{...service,worldShape(node){const local=readCadBrep(oc,node.brep.data);try{return transformCad(oc,local,node.transform);}finally{local.delete();}}}}),current=createCadAIReferencesNative({oc,service}),catalog=old(project,{action:'edges',target});assert(catalog.edges.length>0);for(const item of catalog.edges){const reference=old(project,{action:'edge',target,signature:item.selector.signature}).reference;assert.equal(cadAIReferenceState(project,reference).status,'current');assert.equal(current(project,{action:'resolve',reference}).state.status,'current');}}finally{service.dispose();}
});
