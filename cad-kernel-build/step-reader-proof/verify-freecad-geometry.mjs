import fs from 'node:fs';
const proofDir=new URL('../../work/cad-independent-step/',import.meta.url);fs.mkdirSync(proofDir,{recursive:true});
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import loadCadKernel from '../../src/cad-kernel-loader.js';
import {buildCadGear} from '../../src/cad-recipes.js';
import {buildCadThread} from '../../src/cad-screw-surfaces.js';
import {transformCad,cadVolume,cadBoolean,readCadBrep} from '../../src/cad-native-kernel.js';
const oc=await loadCadKernel({print:()=>{},printErr:()=>{}}),stem='formnaro-complex';
const expected=JSON.parse(fs.readFileSync(new URL('./'+stem+'-expected.json',proofDir))),freecad=JSON.parse(fs.readFileSync(new URL('./freecad-'+stem+'-evidence.json',proofDir)));
assert.equal(freecad.status,'passed');assert.equal(freecad.stepSha256,expected.sha256);
const massTolerance=1e-4;
const evidence={independentReader:'Native FreeCAD 1.1.4 OCCT7.8.1',crossCheckKernel:'Formnaro original extended OCCT8.0.1 WASM',sharedOcctAlgorithm:true,stepSha256:expected.sha256,comparison:'Native BRep parsed/exported by independent app versus regenerated original CAD shapes; GK masses and geometric Common within stated integration budget. A volume comparison is not a general Hausdorff bound.',absoluteMassToleranceMm3:massTolerance,parts:[]};
for(let i=0;i<expected.parts.length;i++){
  const objects=[],keep=s=>(objects.push(s),s),reference=expected.parts[i],read=freecad.parts[i];
  try{
    const bytes=fs.readFileSync(new URL('./'+read.brep,proofDir));assert.equal(createHash('sha256').update(bytes).digest('hex'),read.brepSha256);
    const imported=keep(readCadBrep(oc,bytes.toString('utf8'))),raw=keep(i===2?buildCadGear(oc,reference.recipe):buildCadThread(oc,reference.recipe)),original=keep(transformCad(oc,raw,[1,0,0,0,0,1,0,0,0,0,1,0,i*30,0,0,1])),common=keep(cadBoolean(oc,'intersection',original,imported)),volumeOriginal=cadVolume(oc,original),volumeImported=cadVolume(oc,imported),volumeCommon=cadVolume(oc,common),symmetricDifference=volumeOriginal+volumeImported-2*volumeCommon;
    evidence.parts.push({name:reference.name,volumeOriginal,volumeImported,volumeCommon,symmetricDifference,freecadFixedQuadratureVolume:read.volume,accurateImportedMinusFreecadVolume:volumeImported-read.volume});
    console.log(JSON.stringify(evidence.parts.at(-1)));
    fs.writeFileSync(new URL('./freecad-complex-geometry-evidence.json',proofDir),JSON.stringify({...evidence,status:'diagnostic'},null,2)+'\n');
    assert.ok(Math.abs(volumeOriginal-volumeImported)<massTolerance,`Independent parsed geometry volume differs for ${reference.name}`);
    assert.ok(volumeCommon>0 && volumeCommon<=Math.min(volumeOriginal,volumeImported)+massTolerance,'Invalid Common mass result');
    assert.ok(Math.abs(symmetricDifference)<massTolerance,`Independent parsed geometry intersection differs for ${reference.name}`);
  }finally{for(const shape of objects.reverse())shape.delete();}
}
evidence.status='passed';fs.writeFileSync(new URL('./freecad-complex-geometry-evidence.json',proofDir),JSON.stringify(evidence,null,2)+'\n');
