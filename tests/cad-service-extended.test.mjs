// Mandatory real-kernel acceptance. Missing native artifact is a failure.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {unzipSync,strFromU8} from 'fflate';
import {Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createCadService} from '../src/cad-service.js';
import {createCadProject,cadProjectRevision,serializeCadProject} from '../src/cad-project.js';
import {createCadTransactions} from '../src/cad-transactions.js';
import {cadIdentity,dissolveCadGroup,cadPoint} from '../src/cad-affine.js';
import {cadNativeCapabilities,validateCadSolid,cadBounds,cadVolume} from '../src/cad-native-kernel.js';
import {importCadStep} from '../src/cad-step-io.js';
const url=process.env.FORMNARO_CAD_MODULE?pathToFileURL(process.env.FORMNARO_CAD_MODULE):new URL('../cad-kernel-build/runtime/formnaro_cad.js',import.meta.url),loader=(await import(url.href)).default,oc=await loader({print:()=>{},printErr:()=>{}});
const close=(a,b,e=1e-5)=>assert.ok(Math.abs(a-b)<=e,`${a} versus ${b}`),moved=x=>{const m=cadIdentity();m[12]=x;return m;};

test('Real extended CAD service keeps shear, mirror and editable bore sources through commit, save and dissolution',async()=>{
  assert.equal(cadNativeCapabilities(oc).generalAffine,true);const service=createCadService({oc});
  try{
    const body=service.nativeNode({type:'cylinder',size:[20,20,20]},{id:'body'}),hole=service.nativeNode({type:'cylinder',size:[6,6,30]},{id:'hole',solid:false}),matrix=[-1.5,.2,0,0,.4,.8,0,0,.2,.3,1.2,0,7,-3,14,1];
    const group={id:'group',kind:'cad',name:'Affiner Bohrkörper',solid:true,source:'group',operation:'union',transform:matrix,children:[body,hole],brep:body.brep,stats:body.stats},initial=await service.rebuild(createCadProject({nodes:[group]})),store=createCadTransactions({initial,build:p=>service.rebuild(p)}),draft=store.snapshot();draft.nodes[0].children[1].recipe.size=[8,8,30];
    const preview=await store.preview({project:draft,revision:store.revision()}),changed=store.apply(preview);assert.deepEqual(changed.project.nodes[0].transform,matrix);assert.equal(changed.project.nodes[0].children[1].id,'hole');store.undo();store.redo();const reopened=await service.rebuild(JSON.parse(serializeCadProject(store.snapshot())));close(reopened.nodes[0].stats.volume,Math.PI*(100-16)*20);
    const children=dissolveCadGroup(reopened.nodes[0]);for(let i=0;i<2;i++)assert.deepEqual(children[i].transform,matrix);const world=service.worldShape(reopened.nodes[0]);try{const determinant=Math.abs((-1.5*.8-.4*.2)*1.2);close(cadVolume(oc,world),reopened.nodes[0].stats.volume*determinant,1e-4);assert.equal(validateCadSolid(oc,world).solids,1);}finally{world.delete();}
  }finally{service.dispose();}
});

test('Real double export is independent of display quality, excludes references, preserves colors and satisfies CAD distances',async()=>{
  assert.equal(cadNativeCapabilities(oc).doubleExportMesh,true);const service=createCadService({oc});
  try{
    const body=service.nativeNode({type:'cylinder',size:[20,20,20]},{id:'body',color:'#c13f24',transform:moved(90000.12345)}),reference={id:'ref',kind:'referenceMesh',name:'Referenz',transform:cadIdentity(),mesh:{verts:[0,0,0,1,0,0,0,1,0],triangles:[0,1,2]}},project=await service.rebuild(createCadProject({nodes:[body,reference]})),revision=cadProjectRevision(project),serialized=serializeCadProject(project);
    service.display(project,{deflection:1,angleDegrees:45});const first=service.exportMeshes(project);service.display(project,{deflection:.002,angleDegrees:2});assert.deepEqual(service.exportMeshes(project),first);assert.equal(first.length,1);assert.equal(first[0].color,'#c13f24');assert.equal(first[0].mesh.normals,undefined);assert.equal(cadProjectRevision(project),revision);assert.equal(serializeCadProject(project),serialized);
    const shape=service.worldShape(body),mesh=first[0].mesh,faces=[],explorer=new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum.TopAbs_FACE);try{while(explorer.More()){faces.push(explorer.Current());explorer.Next();}}finally{explorer.delete();}
    try{
      // Independent CAD distance queries on triangle centres, including the
      // cylinder's curved faces. They do not consult any display mesh.
      let observed=0,largestDistance=0;for(let i=0;i<mesh.triangles.length;i+=Math.max(3,Math.floor(mesh.triangles.length/100/3)*3)){
        const points=mesh.triangles.slice(i,i+3).map(index=>mesh.vertices.slice(index*3,index*3+3)),center=[0,1,2].map(k=>points.reduce((sum,p)=>sum+p[k],0)/3),point=new oc.gp_Pnt(...center),maker=new oc.BRepBuilderAPI_MakeVertex(point),vertex=maker.Vertex();let closest=Infinity;
        try{for(const face of faces){const distance=new oc.BRepExtrema_DistShapeShape(vertex,face);try{assert.equal(distance.IsDone(),true);closest=Math.min(closest,distance.Value());}finally{distance.delete();}}assert.ok(closest<=.0100002,`CAD surface distance ${closest}`);largestDistance=Math.max(largestDistance,closest);observed++;}finally{vertex.delete();maker.delete();point.delete();}
      }assert.ok(observed>30);assert.ok(largestDistance>1e-6,'Curved triangle centres must have a nonzero surface distance, rather than solid-containment distance zero.');
    }finally{faces.forEach(face=>face.delete());shape.delete();}
    for(const format of ['stl','obj','3mf','gltf']){const result=service.exportModel(project,{format});assert.ok(result.data instanceof Uint8Array);assert.ok(result.data.length>100);if(format==='obj')assert.ok(unzipSync(result.data)['model.mtl']);if(format==='3mf')assert.match(strFromU8(unzipSync(result.data)['3D/3dmodel.model']),/C13F24FF/);}
    const step=importCadStep(oc,service.exportModel(project,{format:'step'}).data);close(step.stats.volume,body.stats.volume);assert.equal(step.stats.solids,1);
  }finally{service.dispose();}
});

test('Decoded native GLTF splits the chosen tolerance between CAD tessellation and coordinate rounding',async(t)=>{
  const service=createCadService({oc}),quality={deflection:.025,angleDegrees:180},originalQuality={...quality},bridge=oc.FormnaroCadBridge,nativeExport=bridge.ExportMeshJson,previousProgress=globalThis.ProgressEvent,calls=[];
  globalThis.ProgressEvent=class ProgressEvent{constructor(type,init){Object.assign(this,{type},init);}};
  // Preserve Embind's overload metadata: its dispatcher looks up the current
  // class property even when the original callable is retained separately.
  bridge.ExportMeshJson=Object.assign(function(shape,deflection,angle){calls.push({deflection,angle});return nativeExport.call(bridge,shape,deflection,angle);},nativeExport);
  let decoded;
  try{
    const transform=cadIdentity();transform[12]=90000.123456789;transform[13]=-85000.678901234;transform[14]=75000.876543210;
    const body=service.nativeNode({type:'cylinder',size:[20,20,20]},{id:'isolated-gltf-budget-cylinder',transform}),project=await service.rebuild(createCadProject({nodes:[body]})),revision=cadProjectRevision(project),original=serializeCadProject(project);
    const reference=service.exportMeshes(project,{...quality,deflection:quality.deflection/2})[0].mesh,result=service.exportModel(project,{format:'gltf',quality});
    // The reference and glTF use identical native export quality and share one
    // Float64 tessellation; decoding below still proves the full error budget.
    assert.equal(calls.length,1);assert.ok(calls.every(call=>call.deflection===quality.deflection/2&&call.angle===Math.PI));assert.deepEqual(quality,originalQuality);
    decoded=await new GLTFLoader().parseAsync(new TextDecoder().decode(result.data),'');decoded.scene.updateMatrixWorld(true);
    const objects=[];decoded.scene.traverse(object=>{if(object.isMesh)objects.push(object);});assert.equal(objects.length,1);
    const object=objects[0],positions=object.geometry.getAttribute('position'),indices=Array.from(object.geometry.index.array),points=[];
    assert.equal(positions.count,reference.vertices.length/3);assert.deepEqual(indices,reference.triangles);
    // The independent loader supplies glTF's Y-up metres; restore CAD's Z-up
    // millimetres before comparing with native double vertices and CAD faces.
    let maximumRounding=0;
    for(let index=0;index<positions.count;index++){
      const point=new Vector3().fromBufferAttribute(positions,index).applyMatrix4(object.matrixWorld),world=[point.x*1000,-point.z*1000,point.y*1000],native=reference.vertices.slice(index*3,index*3+3);
      const error=Math.hypot(...world.map((value,axis)=>value-native[axis]));assert.ok(error<=quality.deflection/2);maximumRounding=Math.max(maximumRounding,error);points.push(world);
    }
    const shape=service.worldShape(body),faces=[],explorer=new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum.TopAbs_FACE);
    try{while(explorer.More()){faces.push(explorer.Current());explorer.Next();}}finally{explorer.delete();}
    try{
      let observed=0,maximum=0;
      for(let index=0;index<indices.length;index+=3){
        const vertices=indices.slice(index,index+3).map(i=>points[i]),center=[0,1,2].map(axis=>vertices.reduce((sum,point)=>sum+point[axis],0)/3),point=new oc.gp_Pnt(...center),maker=new oc.BRepBuilderAPI_MakeVertex(point),vertex=maker.Vertex();let distance=Infinity;
        try{for(const face of faces){const query=new oc.BRepExtrema_DistShapeShape(vertex,face);try{assert.equal(query.IsDone(),true);distance=Math.min(distance,query.Value());}finally{query.delete();}}assert.ok(distance<=quality.deflection+2e-7,`Decoded triangle centre is ${distance} mm from CAD`);maximum=Math.max(maximum,distance);observed++;}
        finally{vertex.delete();maker.delete();point.delete();}
      }
      assert.ok(observed>30);assert.ok(maximum>1e-6);
      t.diagnostic(JSON.stringify({chosenTolerance:quality.deflection,nativeDeflection:quality.deflection/2,roundingBudget:quality.deflection/2,maximumDecodedVertexRounding:maximumRounding,triangleCentersChecked:observed,maximumNativeCadDistance:maximum}));
    }finally{faces.forEach(face=>face.delete());shape.delete();}
    assert.equal(cadProjectRevision(project),revision);assert.equal(serializeCadProject(project),original);
    // This checks actual decoded coordinates and finite triangle-centre
    // distances, rather than claiming a global two-sided Hausdorff proof.
    assert.throws(()=>service.exportModel(project,{format:'gltf',quality:{deflection:1e-7,angleDegrees:5}}),/Mindestdeflektion/);
  }finally{
    bridge.ExportMeshJson=nativeExport;service.dispose();decoded?.scene.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});
    if(previousProgress===undefined)delete globalThis.ProgressEvent;else globalThis.ProgressEvent=previousProgress;
  }
});
