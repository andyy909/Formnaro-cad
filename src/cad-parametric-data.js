// Inert legacy source data for lossless format-9 projects. No external editor runtime.
export const PARAMETRIC_DESIGN_LIMIT=10*1024*1024;
const verified=new Map();let retained=0;
function checkBase64(value){
 if(typeof value!=='string'||!value.length||value.length>4*Math.ceil(PARAMETRIC_DESIGN_LIMIT/3)||value.length%4)throw Error('Parametrischer Entwurf: höchstens 10 MiB Quelldaten.');
 if(verified.has(value))return;
 const padding=value.endsWith('==')?2:value.endsWith('=')?1:0,first=value.indexOf('=');
 if(/[^A-Za-z0-9+/=]/.test(value)||(first>=0&&first!==value.length-padding))throw Error('Ungültige parametrische Quelldaten.');
 if(padding&&('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.indexOf(value[value.length-padding-1])&(padding===2?15:3)))throw Error('Nichtkanonische parametrische Quelldaten.');
 const bytes=value.length/4*3-(value.endsWith('==')?2:value.endsWith('=')?1:0);if(bytes>PARAMETRIC_DESIGN_LIMIT)throw Error('Parametrischer Entwurf ist zu groß.');
 // A few immutable strings avoid rescanning large sources on ordinary moves.
 while(verified.size&&(verified.size>=8||retained+value.length>32*1024*1024)){const first=verified.keys().next().value;retained-=first.length;verified.delete(first);}
 if(value.length<=32*1024*1024){verified.set(value,true);retained+=value.length;}
}
export function validateParametricSource(value){
 const keys=['format','version','engine','engineVersion','compression','designBase64','designSha256','brepSha256'];
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||Object.keys(value).some(k=>!keys.includes(k))||value.format!=='FormnaroParametricSource'||value.version!==1||value.engine!=='solidcraft'||value.engineVersion!=='0.16.2'||value.compression!=='gzip'||!['designSha256','brepSha256'].every(k=>typeof value[k]==='string'&&/^[a-f0-9]{64}$/.test(value[k])))throw Error('Ungültige parametrische Quelle.');
 checkBase64(value.designBase64);return {...value};
}
export function parametricSourceBytes(value){const source=validateParametricSource(value),text=atob(source.designBase64);return Uint8Array.from(text,c=>c.charCodeAt(0));}
export async function parametricSha256(value){const bytes=typeof value==='string'?new TextEncoder().encode(value):value;return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');}
// Scene queries need provenance, not the full compressed project payload.
export function parametricSceneMetadata(metadata){
 if(metadata?.freecadSource){const {documentBase64,pendingFaceColors,changes,...source}=metadata.freecadSource;if(changes)Object.assign(source,{changes:changes.slice(0,16),changeCount:changes.length});if(pendingFaceColors)source.pendingFaceColorCount=pendingFaceColors.length;if(source.script){const {code,modules,...script}=source.script;source.script={...script,codeAvailable:true,codeCharacters:code.length,modules:Object.keys(modules??{}),readSource:'Read the actual project metadata locally through model.snapshot(); do not treat this summary as executable source.'};}metadata={...metadata,freecadSource:{...source,embedded:true,documentBytes:Math.floor(documentBase64.length*3/4)}};}
 if(!metadata?.parametricSource)return metadata;
 const {designBase64,...source}=metadata.parametricSource;
 return {...metadata,parametricSource:{...source,embedded:true,compressedBytes:designBase64.length/4*3-(designBase64.endsWith('==')?2:designBase64.endsWith('=')?1:0)}};
}
