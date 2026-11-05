
import Module from 'manifold-3d/manifold';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import {setKernel} from './mesh-engine/geometry.js';
import {loadCadKernel} from './cad-kernel-loader.js';
import {prepareStlSymmetry,finishStlSymmetry} from './cad-stl-symmetry.js';

let prepared;
self.onmessage=async ({data})=>{
  try{
    if(data.phase==='prepare'&&!prepared){
      const wasmBinary=new Uint8Array(await (await fetch(wasmUrl)).arrayBuffer());
      const kernel=await Module({wasmBinary});kernel.setup();setKernel(kernel);
      const {halfBytes,...state}=await prepareStlSymmetry(data.bytes,data.settings);prepared=state;
      self.postMessage({result:{halfBytes,plane:state.plane,overlapMM:state.overlapMM}},[halfBytes]);
    }else if(data.phase==='finish'&&prepared){
      const oc=await loadCadKernel({print:()=>{},printErr:()=>{}});
      const result=finishStlSymmetry(oc,prepared,data.bytes);prepared=null;
      self.postMessage({result},[result.bytes.buffer,result.artifacts.preview.buffer]);
    }else throw Error('Ungültiger Symmetrieauftrag.');
  }catch(error){self.postMessage({error:error.message});}
};
