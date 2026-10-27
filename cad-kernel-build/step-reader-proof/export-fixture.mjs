import fs from 'node:fs';
const proofDir=new URL('../../work/cad-independent-step/',import.meta.url);fs.mkdirSync(proofDir,{recursive:true});
import {createHash} from 'node:crypto';
import loadCadKernel from '../../src/cad-kernel-loader.js';
import {buildCadRecipe} from '../../src/cad-recipes.js';
import {cadBoolean,transformCad,cadBounds,cadVolume} from '../../src/cad-native-kernel.js';
import {exportCadStep} from '../../src/cad-step-io.js';
const oc=await loadCadKernel({print:()=>{},printErr:()=>{}}),objects=[];
const withoutPcurves=process.argv.includes('--without-pcurves'),stem=withoutPcurves?'formnaro-no-pcurves':'formnaro-ap214';
if(withoutPcurves){const setup=new oc.STEPCAFControl_Writer();setup.delete();if(!oc.Interface_Static.SetIVal('write.surfacecurve.mode',0))throw Error('Native surface curve parameter was not registered');}
const keep=s=>(objects.push(s),s);
try{
  const cylinder=keep(buildCadRecipe(oc,{type:'cylinder',size:[20,20,20]})),hole=keep(buildCadRecipe(oc,{type:'cylinder',size:[6,6,30]})),body=keep(cadBoolean(oc,'difference',cylinder,hole));
  const rawBox=keep(buildCadRecipe(oc,{type:'box',size:[5,7,9]})),box=keep(transformCad(oc,rawBox,[1,0,0,0,0,1,0,0,0,0,1,0,30,0,0,1]));
  const parts=[{shape:body,name:'Bohrkörper',color:'#ff0000',opacity:1},{shape:box,name:'Quader',color:'#0000ff',opacity:.7}],bytes=exportCadStep(oc,parts),text=new TextDecoder().decode(bytes);
  const expected={file:stem+'.step',nativeWithoutPcurves:withoutPcurves,sha256:createHash('sha256').update(bytes).digest('hex'),fileSchema:text.match(/FILE_SCHEMA\(([^;]+)\);/)?.[1],solids:2,volume:Math.PI*(100-9)*20+5*7*9,parts:parts.map(p=>({name:p.name,color:p.color,opacity:p.opacity,volume:cadVolume(oc,p.shape),bounds:cadBounds(oc,p.shape)}))};
  fs.writeFileSync(new URL('./'+stem+'.step',proofDir),bytes);fs.writeFileSync(new URL('./'+stem+'-expected.json',proofDir),JSON.stringify(expected,null,2)+'\n');
  console.log(JSON.stringify({bytes:bytes.length,schema:expected.fileSchema,expectedVolume:expected.volume,sha256:expected.sha256}));
}finally{for(const shape of objects.reverse())shape.delete();}
