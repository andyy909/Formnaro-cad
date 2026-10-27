// Indexed local container. Opening reads the header/index only; geometry reads
// and copying are explicit, bounded range operations independent of STEP files.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const MAGIC=Buffer.from('FNPACK\r\n'),HEADER=64,MAX_INDEX=16*1024*1024,MAX_PACK=2*1024*1024*1024,CHUNK=1024*1024;
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const need=(value,message)=>{if(!value)throw Object.assign(Error(message),{code:'FNPACK_INVALID'});};
function refs(value,result=new Map(),depth=0){
 need(depth<=100,'Paketkatalog ist zu tief.');
 if(value?.format==='Formnaro-GeometryRef'){
  need(['brep','mesh'].includes(value.kind)&&/^[a-f0-9]{64}$/.test(value.sha256)&&Number.isSafeInteger(value.bytes)&&value.bytes>0&&value.bytes<=(value.kind==='brep'?12:128)*1024*1024,'Ungültiger Geometrieverweis.');
  const old=result.get(value.sha256);need(!old||old.kind===value.kind&&old.bytes===value.bytes,'Widersprüchlicher Geometrieverweis.');result.set(value.sha256,value);
 }else if(value?.format==='OpenCascade-BRep'||Array.isArray(value?.verts)&&Array.isArray(value?.triangles))need(false,'Geometriepuffer gehören in Paketblöcke, nicht in den Index.');
 else if(Array.isArray(value)&&(!value.length||typeof value[0]!=='object'))return result;
 else if(value&&typeof value==='object')for(const child of Object.values(value))refs(child,result,depth+1);
 return result;
}
function validateIndex(index,fileSize){
 need(index&&Object.keys(index).sort().join(',')==='blocks,format,project,version'&&index.format==='FormnaroPackage'&&index.version===1&&index.project?.format==='OfflineCAD'&&[17,18,19,20,21,22,23,24].includes(index.project.version)&&Array.isArray(index.project.nodes)&&index.project.nodes.length<=500&&Array.isArray(index.blocks)&&index.blocks.length<=20000,'Ungültiger Paketindex.');
 const referenced=refs(index.project),seen=new Set();let end=0;
 for(const b of index.blocks){need(b&&Object.keys(b).sort().join(',')==='bytes,kind,offset,sha256'&&/^[a-f0-9]{64}$/.test(b.sha256)&&!seen.has(b.sha256)&&Number.isSafeInteger(b.offset)&&b.offset===end&&Number.isSafeInteger(b.bytes)&&b.bytes>0,'Ungültiger oder überlappender Geometrieblock.');const ref=referenced.get(b.sha256);need(ref&&ref.kind===b.kind&&ref.bytes===b.bytes,'Geometrieblock stimmt nicht mit Katalog überein.');seen.add(b.sha256);end+=b.bytes;need(Number.isSafeInteger(end)&&end<=MAX_PACK,'Paket ist zu groß.');}
 need(referenced.size===seen.size,'Geometrieblock fehlt im Index.');if(fileSize!==undefined)need(end===fileSize,'Paketgröße stimmt nicht mit Index überein.');return index;
}
async function readExact(handle,bytes,position){const data=Buffer.allocUnsafe(bytes);let offset=0;while(offset<bytes){const read=await handle.read(data,offset,bytes-offset,position+offset);need(read.bytesRead>0,'Paket oder Geometrieblock ist unvollständig.');offset+=read.bytesRead;}return data;}
async function openFnpack(file,{onRead=()=>{}}={}){
 const handle=await fs.open(file,'r');
 try{
  const stat=await handle.stat();need(stat.isFile()&&stat.size>=HEADER&&stat.size<=MAX_PACK,'Ungültige Paketgröße.');const header=await readExact(handle,HEADER,0);onRead({kind:'header',bytes:HEADER});
  need(header.subarray(0,8).equals(MAGIC)&&header.readUInt32LE(8)===1&&header.subarray(48).every(v=>v===0),'Unbekannter Paketkopf.');const length=header.readUInt32LE(12);need(length>0&&length<=MAX_INDEX&&HEADER+length<=stat.size,'Ungültige Indexgröße.');
  const raw=await readExact(handle,length,HEADER);onRead({kind:'index',bytes:length});need(sha(raw)===header.subarray(16,48).toString('hex'),'Paketindex-Prüfsumme stimmt nicht.');const index=validateIndex(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)),stat.size-HEADER-length),base=HEADER+length,byHash=new Map(index.blocks.map(b=>[b.sha256,b]));let closed=false;
  await handle.close();let sourcePath=path.resolve(file);const pending=new Set();
  const alive=()=>need(!closed,'Paketquelle ist geschlossen.');
  async function range(operation){alive();const input=await fs.open(sourcePath,'r');const task=(async()=>{try{return await operation(input);}finally{await input.close();}})();pending.add(task);try{return await task;}finally{pending.delete(task);}}
  async function read(hash){return range(async input=>{const block=byHash.get(hash);need(block,'Geometrieblock ist nicht im Paket enthalten.');const bytes=await readExact(input,block.bytes,base+block.offset);onRead({kind:'geometry',sha256:hash,bytes:bytes.length});need(sha(bytes)===hash,'Geometrieblock-Prüfsumme stimmt nicht.');return bytes;});}
  async function copy(hash,target,{signal}={}){return range(async input=>{const block=byHash.get(hash);need(block,'Ungeladener Geometrieblock fehlt.');const digest=crypto.createHash('sha256');let copied=0;while(copied<block.bytes){if(signal?.aborted)throw new DOMException('Paketausgabe abgebrochen.','AbortError');const bytes=await readExact(input,Math.min(CHUNK,block.bytes-copied),base+block.offset+copied);digest.update(bytes);await target.writeFile(bytes);copied+=bytes.length;}onRead({kind:'copy',sha256:hash,bytes:copied});need(digest.digest('hex')===hash,'Ungeladener Geometrieblock ist beschädigt.');});}
  return {index:structuredClone(index),identity:{bytes:stat.size,indexSha256:sha(raw)},read,copy,sourcePath:()=>sourcePath,retarget:file=>{alive();sourcePath=path.resolve(file);},close:async()=>{closed=true;await Promise.allSettled([...pending]);}};
 }catch(error){await handle.close().catch(()=>{});throw error;}
}
async function writeFnpack(file,{project,blocks=[],source,signal,rename=fs.rename}={}){
 const needed=refs(project),payloads=new Map();for(const block of blocks){need(block&&block.bytes instanceof Uint8Array&&needed.has(block.sha256)&&!payloads.has(block.sha256),'Ungültige neue Geometrieblöcke.');const bytes=Buffer.from(block.bytes);need(sha(bytes)===block.sha256&&bytes.length===needed.get(block.sha256).bytes,'Neue Geometrieblock-Prüfsumme stimmt nicht.');payloads.set(block.sha256,bytes);}
 const sourceBlocks=new Map((source?.index.blocks??[]).map(b=>[b.sha256,b]));let offset=0;const table=[];for(const [hash,ref]of needed){need(payloads.has(hash)||sourceBlocks.get(hash)?.kind===ref.kind&&sourceBlocks.get(hash)?.bytes===ref.bytes,'Erforderlicher ungeladener Geometrieblock fehlt.');table.push({sha256:hash,kind:ref.kind,bytes:ref.bytes,offset});offset+=ref.bytes;}
 const index=validateIndex({format:'FormnaroPackage',version:1,project,blocks:table}),raw=Buffer.from(JSON.stringify(index));need(raw.length<=MAX_INDEX&&HEADER+raw.length+offset<=MAX_PACK,'Paket oder Index ist zu groß.');const header=Buffer.alloc(HEADER);MAGIC.copy(header);header.writeUInt32LE(1,8);header.writeUInt32LE(raw.length,12);Buffer.from(sha(raw),'hex').copy(header,16);
 const temporary=path.join(path.dirname(file),'.formnaro-'+crypto.randomUUID()+'.tmp');let target;
 try{
  target=await fs.open(temporary,'wx');await target.writeFile(header);await target.writeFile(raw);
  for(const block of table){if(signal?.aborted)throw new DOMException('Paketausgabe abgebrochen.','AbortError');if(payloads.has(block.sha256))await target.writeFile(payloads.get(block.sha256));else await source.copy(block.sha256,target,{signal});}
  await target.sync();await target.close();target=null;
  const delays=[10,20,40,80,160];for(let attempt=0;;attempt++){if(signal?.aborted)throw new DOMException('Paketausgabe abgebrochen.','AbortError');try{await rename(temporary,file);break;}catch(error){if(process.platform!=='win32'||!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=delays.length)throw error;await new Promise(r=>setTimeout(r,delays[attempt]));}}
  return {bytes:HEADER+raw.length+offset,indexSha256:sha(raw),geometryBlocks:table.length};
 }finally{await target?.close().catch(()=>{});await fs.rm(temporary,{force:true}).catch(()=>{});}
}
module.exports={openFnpack,writeFnpack,validateIndex,geometryReferences:refs,HEADER,MAX_INDEX,MAX_PACK};
