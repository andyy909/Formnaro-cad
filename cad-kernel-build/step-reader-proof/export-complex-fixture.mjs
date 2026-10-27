import fs from 'node:fs';
const proofDir=new URL('../../work/cad-independent-step/',import.meta.url);fs.mkdirSync(proofDir,{recursive:true});
import {createHash} from 'node:crypto';
import loadCadKernel from '../../src/cad-kernel-loader.js';
import {buildCadGear} from '../../src/cad-recipes.js';
import {buildCadThread} from '../../src/cad-screw-surfaces.js';
import {transformCad,cadBounds,cadVolume,validateCadSolid} from '../../src/cad-native-kernel.js';
import {exportCadStep} from '../../src/cad-step-io.js';
const oc=await loadCadKernel({print:()=>{},printErr:()=>{}}),objects=[];
const keep=s=>(objects.push(s),s),place=(s,x)=>keep(transformCad(oc,s,[1,0,0,0,0,1,0,0,0,0,1,0,x,0,0,1]));
try{
  const definitions=[
    {name:'Linkes Zweiganggewinde',color:'#00aa00',x:0,recipe:{diameter:8,pitch:1.25,length:1.25,leadIn:.2,hand:'left',starts:2,phase:37,bore:2,head:'hex',headHeight:1},build:p=>buildCadThread(oc,p)},
    {name:'Mutter mit Innengewinde',color:'#aa6600',x:30,recipe:{kind:'nut',length:1.25,leadIn:.2,clearance:.15},build:p=>buildCadThread(oc,p)},
    {name:'Schraegzahnrad',color:'#6600aa',x:60,recipe:{teeth:8,helixAngle:25,thickness:2,hubDiameter:5,hubHeight:1,bore:2,keyWidth:1,keyDepth:.5},build:p=>buildCadGear(oc,p)}
  ],parts=[];
  for(const definition of definitions){
    const shape=place(keep(definition.build(definition.recipe)),definition.x),stats=validateCadSolid(oc,shape);
    if(stats.solids!==1)throw Error('Fixture must have one closed solid per part');
    parts.push({...definition,shape,opacity:1});console.log(JSON.stringify({built:definition.name,volume:cadVolume(oc,shape)}));
  }
  const bytes=exportCadStep(oc,parts),text=new TextDecoder().decode(bytes);
  const expected={file:'formnaro-complex.step',sha256:createHash('sha256').update(bytes).digest('hex'),fileSchema:text.match(/FILE_SCHEMA\(([^;]+)\);/)?.[1],solids:parts.length,volume:parts.reduce((total,p)=>total+cadVolume(oc,p.shape),0),parts:parts.map(p=>({name:p.name,color:p.color,opacity:p.opacity,recipe:p.recipe,volume:cadVolume(oc,p.shape),bounds:cadBounds(oc,p.shape)}))};
  fs.writeFileSync(new URL('./formnaro-complex.step',proofDir),bytes);fs.writeFileSync(new URL('./formnaro-complex-expected.json',proofDir),JSON.stringify(expected,null,2)+'\n');
  console.log(JSON.stringify({bytes:bytes.length,schema:expected.fileSchema,volume:expected.volume,sha256:expected.sha256}));
}finally{for(const shape of objects.reverse())shape.delete();}
