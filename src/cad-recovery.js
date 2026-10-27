import {parseCadProject,cadProjectSnapshot} from './cad-project.js';
export const CAD_AUTOSAVE_KEY='offlinecad-autosave-v7';
export const CAD_LEGACY_AUTOSAVE_KEY='offlinecad-autosave-v5';
export const MIXED_AUTOSAVE_KEY='offlinecad-autosave-v8';
// Missing new data permits a validated fallback. Invalid new data never does.
// A failed recovery disables automatic writes for this session, preserving
// the exact bytes of both generations for deliberate external recovery.
export function createCadRecovery(storage){
  let blocked=false,read=false,lastChecked;
  const values=()=>[MIXED_AUTOSAVE_KEY,CAD_AUTOSAVE_KEY,CAD_LEGACY_AUTOSAVE_KEY].map(key=>storage.getItem(key));
  const equal=(a,b)=>a&&b&&a.every((v,i)=>v===b[i]);
  function candidate(){const all=values(),index=all.findIndex(v=>v!==null);if(index<0)return null;const project=parseCadProject(all[index]);if(index===2&&project.version!==5)throw Error('Alte CAD-Autosicherung muss Format 5 verwenden.');return project;}
  async function load(verify){try{const before=values(),project=candidate(),result=project===null?null:cadProjectSnapshot(await verify(project));if(!equal(values(),before))throw Error('CAD-Autosicherung wurde während der Prüfung geändert.');read=true;lastChecked=before;return result;}catch(error){blocked=true;read=true;throw error;}}
  function write(encoded,{version}={}){
    if(blocked)return false;const current=values();
    // Cached identity avoids reparsing the unchanged large recovery file.
    // A new or replaced value must be checked again, including beforeunload.
    if(!read||!equal(current,lastChecked)){try{candidate();read=true;lastChecked=current;}catch{blocked=true;return false;}}
    // The caller supplies the confirmed transaction serializer's output.
    // Do not copy/reparse a large unchanged model for workspace-only saves.
    if(typeof encoded!=='string'||!encoded)throw Error('Bestätigte CAD-Serialisierung erforderlich.');
    version??=parseCadProject(encoded).version;
    // Once this app owns a mixed autosave, even a subsequent empty CAD scene
    // stays in the new namespace. Previous CAD7/CAD5 recovery bytes survive.
    const key=version>=8||current[0]!==null?MIXED_AUTOSAVE_KEY:CAD_AUTOSAVE_KEY;
    storage.setItem(key,encoded);lastChecked=values();return true;
  }
  return {load,write,blocked:()=>blocked};
}
