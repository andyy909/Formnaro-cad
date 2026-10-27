import fs from 'node:fs';import path from 'node:path';
import init from '../../cad-kernel-build/runtime/formnaro_cad.js';
import {reconstructStlPatches,buildStlSurfaceCad,stlError} from '../../src/cad-stl-surfaces.js';
import {readStlReconstructionMesh} from '../../src/cad-stl-input.js';
import {readCadBrep,cadExportMesh} from '../../src/cad-native-kernel.js';
import {exportCadStep,importCadStep} from '../../src/cad-step-io.js';
import {createCadProject,serializeCadProject,parseCadProject} from '../../src/cad-project.js';
const [input,out]=process.argv.slice(2),start=performance.now();fs.mkdirSync(out,{recursive:true});
try{
 if(fs.statSync(input).size>50*1024*1024)throw stlError('STL_LIMIT','STL überschreitet 50 MB.');
 const bytes=fs.readFileSync(input),definition=reconstructStlPatches(readStlReconstructionMesh(new Uint8Array(bytes)));
 const oc=await init({wasmBinary:fs.readFileSync(new URL('../../cad-kernel-build/runtime/formnaro_cad.wasm',import.meta.url))}),{quality,...geometry}=buildStlSurfaceCad(oc,definition),shape=readCadBrep(oc,geometry.brep.data);
 try{
  const node={id:'test-reconstruction',name:'STL-Testmodell',kind:'cad',source:'step',solid:true,transform:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],...geometry},project=createCadProject();project.nodes.push(node);
  const saved=serializeCadProject(project),reopened=parseCadProject(saved);if(reopened.nodes[0].brep.data!==geometry.brep.data)throw Error('Project reload differs');
  const step=exportCadStep(oc,[{shape,name:'STL-Testmodell'}]),read=importCadStep(oc,step),stepRoundtripVolumeDeviation=Math.abs(read.stats.volume/geometry.stats.volume-1),stepBoundsMaxError=Math.max(...['min','max'].flatMap(key=>read.stats.bounds[key].map((v,i)=>Math.abs(v-geometry.stats.bounds[key][i]))));
  // At large offsets STEP decimal serialization and native integration differ
  // by a few ppm. The explicit 0.001% volume / 0.00001-mm bounds gates remain
  // substantially tighter than the accepted reconstruction requirements.
  if(stepRoundtripVolumeDeviation>1e-5||stepBoundsMaxError>1e-5)throw Error('STEP roundtrip quality differs: '+JSON.stringify({source:geometry.stats,read:read.stats,stepRoundtripVolumeDeviation,stepBoundsMaxError}));
  fs.writeFileSync(path.join(out,'model.ocad'),saved);fs.writeFileSync(path.join(out,'model.step'),step);fs.writeFileSync(path.join(out,'mesh.json'),JSON.stringify(cadExportMesh(oc,shape,{deflection:.01,angleDegrees:5})));
  const result={ok:true,stats:geometry.stats,quality,brepBytes:geometry.brep.data.length,projectBytes:saved.length,stepBytes:step.length,roundtrip:true,stepRoundtripVolumeDeviation,stepBoundsMaxError,elapsedMs:performance.now()-start};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{shape.delete();}
}catch(error){const result={ok:false,code:error.code||'TEST_FAILURE',message:error.message,elapsedMs:performance.now()-start};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));process.exitCode=1;}
