import {Gunzip,gzipSync} from 'fflate';
export function encodeMeshProjectFile(bytes){if(bytes.length<=50*1024*1024)return bytes;if(bytes.length>256*1024*1024)throw Error('Projektdaten überschreiten 256 MB.');const encoded=gzipSync(bytes,{level:6});if(encoded.length>50*1024*1024)throw Error('Komprimierte Projektdatei ist größer als 50 MB.');return encoded;}
const AUTOSAVE_PREFIX='{"format":"Formnaro-MeshAutosave",';
export function encodeMeshAutosave(text){const bytes=new TextEncoder().encode(text);if(bytes.length<=50*1024*1024)return text;const zipped=encodeMeshProjectFile(bytes);let binary='';for(let i=0;i<zipped.length;i+=16384)binary+=String.fromCharCode(...zipped.subarray(i,i+16384));const result=JSON.stringify({format:'Formnaro-MeshAutosave',version:1,dataBase64:btoa(binary)});if(new TextEncoder().encode(result).length>50*1024*1024)throw Error('Autosicherung ist zu groß. Bitte Projektdatei speichern.');return result;}
export function decodeMeshAutosave(text){if(!text.startsWith(AUTOSAVE_PREFIX))return text;const data=JSON.parse(text);if(data.version!==1||typeof data.dataBase64!=='string'||data.dataBase64.length>50*1024*1024||data.dataBase64.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(data.dataBase64))throw Error('Komprimierte Autosicherung ist beschädigt.');const binary=atob(data.dataBase64),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));return decodeMeshProjectFile(bytes);}
export function decodeMeshProjectFile(bytes,maxExpandedBytes=256*1024*1024){
 if(bytes.length>50*1024*1024)throw Error('Projektdatei ist größer als 50 MB.');
 if(bytes[0]!==0x1f||bytes[1]!==0x8b)return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 const parts=[];let count=0;const decoder=new Gunzip(part=>{count+=part.length;if(count>maxExpandedBytes)throw Error('Komprimierte Projektdaten überschreiten das Größenlimit.');parts.push(part);});
 try{decoder.push(bytes,true);}catch{throw Error('Komprimierte Projektdatei ist beschädigt oder zu groß.');}
 const result=new Uint8Array(count);let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length;}return new TextDecoder('utf-8',{fatal:true}).decode(result);
}
