import {cadBytesDigest} from './cad-geometry-digest.js';
const fail=()=>{throw Object.assign(Error('Ungültige gespeicherte FreeCAD-Quelle.'),{code:'FREECAD_SOURCE_INVALID'});};
const digests=new Map();let retained=0;
export function freeCADSourceDigest(base64){
 if(digests.has(base64))return digests.get(base64);
 const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0)),digest=cadBytesDigest(bytes);
 while(digests.size&&(digests.size>=4||retained+base64.length>64*1024*1024)){const first=digests.keys().next().value;retained-=first.length;digests.delete(first);}
 if(base64.length<=64*1024*1024){digests.set(base64,digest);retained+=base64.length;}return digest;
}
export function validateFreeCADSource(value){
 const v=value,base=['version','plan','script','engineVersion','documentBase64'],advanced=['documentDigest','resultObject','mode','changes','pendingFaceColors'];
 if(!v||![1,2].includes(v.version)||Object.keys(v).some(k=>![...base,...(v.version===2?advanced:[])].includes(k))||typeof v.engineVersion!=='string'||v.engineVersion.length>80||v.plan&&v.script||v.version===1&&!v.plan&&!v.script||JSON.stringify(v.script??v.plan??{}).length>(v.script?8*1024*1024:250000)||v.script&&(v.script.version!==1||typeof v.script.code!=='string'||v.script.code.length>100000)||typeof v.documentBase64!=='string'||v.documentBase64.length>Math.ceil(32*1024*1024/3)*4||!/^UEs[A-Za-z0-9+/]*={0,2}$/.test(v.documentBase64))fail();
 if(v.version===2){
  if(!/^[a-f0-9]{64}$/.test(v.documentDigest??'')||freeCADSourceDigest(v.documentBase64)!==v.documentDigest||!['native','script','plan'].includes(v.mode)||v.mode==='script'&&!v.script||v.mode==='plan'&&!v.plan||!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(v.resultObject??'')||!Array.isArray(v.changes)||v.changes.length>1024)fail();
  if(v.pendingFaceColors!==undefined){if(!Array.isArray(v.pendingFaceColors)||v.pendingFaceColors.length>40000)fail();for(const c of v.pendingFaceColors)if(!c||Object.keys(c).some(k=>!['faceIndex','color','opacity','faceDigest','documentDigest'].includes(k))||!Number.isSafeInteger(c.faceIndex)||c.faceIndex<1||!/^#[a-f0-9]{6}$/i.test(c.color)||!Number.isFinite(c.opacity)||c.opacity<.05||c.opacity>1||!(/^[a-f0-9]{64}$/.test(c.documentDigest??'')&&(c.faceDigest===undefined||/^[a-f0-9]{64}$/.test(c.faceDigest))))fail();}
  const scalar=x=>typeof x==='number'&&Number.isFinite(x)||typeof x==='boolean'||typeof x==='string'&&x.length<=512;
  for(const c of v.changes)if(!c||Object.keys(c).some(k=>!['object','property','type','before','value','unit','derived','expression'].includes(k))||!['object','property'].every(k=>typeof c[k]==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(c[k]))||typeof c.type!=='string'||!/^App::Property[A-Za-z0-9]+$/.test(c.type)||!scalar(c.before)||!scalar(c.value)||typeof c.unit!=='string'||c.unit.length>200||typeof c.derived!=='boolean'||c.expression!==undefined&&(typeof c.expression!=='string'||c.expression.length>10000))fail();
 }
 return structuredClone(v);
}
