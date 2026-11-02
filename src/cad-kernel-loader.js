import integrity from '../cad-kernel-build/runtime/integrity.json' with {type:'json'};
// One native kernel shared by test threads and the dedicated CAD Worker.
import initialize from '../cad-kernel-build/runtime/formnaro_cad.js';
import {cadNativeCapabilities} from './cad-native-kernel.js';
const wasmUrl=new URL('../cad-kernel-build/runtime/formnaro_cad.wasm',import.meta.url);
export async function loadCadKernel(options={}){
  const oc=await initialize({...options,locateFile:name=>name.endsWith('.wasm')?wasmUrl.href:new URL(name,import.meta.url).href});
  oc.formnaroRuntimeVersion=integrity.files['formnaro_cad.js'].sha256+':'+integrity.files['formnaro_cad.wasm'].sha256;
  const capabilities=cadNativeCapabilities(oc);
  for(const name of ['stepAssembly','exactBounds','generalAffine','rayHits','directWriteNoTriangles','solidPointClassification','doubleExportMesh','displayFaceMapping'])if(!capabilities[name])throw Error(`Der gemeinsame CAD-Kern besitzt die notwendige Schnittstelle ${name} nicht.`);
  return oc;
}
export default loadCadKernel;
