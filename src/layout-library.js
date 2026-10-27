import {LAYOUT_KEY,loadLayout} from './layout-preferences.js';
import {emptyLayouts,validateLayouts,changeLayouts} from '../backend/layout-data.mjs';
export const LAYOUT_LIBRARY_KEY='offlinecad-layout-library-v1';
export function createLayoutLibrary({storage,desktop,onChange=()=>{}}){
  const native=typeof desktop?.getLayouts==='function';let data=emptyLayouts(loadLayout(storage)),revision=null,directory=null,recoveryRequired=false,warning='';
  function accept(result){data=validateLayouts(result.data);revision=result.revision;directory=result.directory||null;recoveryRequired=!!result.recoveryRequired;warning=result.warning||'';onChange(data.current);return structuredClone(data);}
  async function reload(){
    if(native){
      let result=await desktop.getLayouts();
      revision=result.revision;directory=result.directory;
      if(!result.exists&&storage.getItem(LAYOUT_KEY)){
        // One-time migration only when the portable file does not yet exist.
        let legacy;try{legacy=JSON.parse(storage.getItem(LAYOUT_KEY));}catch{}
        if(legacy){try{legacy=emptyLayouts(legacy).current;}catch{legacy=null;}}
        if(legacy)result=await desktop.changeLayouts({revision:result.revision,command:{action:'current',layout:legacy}});
      }
      return accept(result);
    }
    let stored;try{stored=validateLayouts(JSON.parse(storage.getItem(LAYOUT_LIBRARY_KEY)));}catch{stored=emptyLayouts(loadLayout(storage));}
    return accept({data:stored});
  }
  async function change(command){
    if(native)return accept(await desktop.changeLayouts({revision,command}));
    const next=changeLayouts(data,command,()=>crypto.randomUUID());storage.setItem(LAYOUT_LIBRARY_KEY,JSON.stringify(next));try{storage.setItem(LAYOUT_KEY,JSON.stringify(next.current));}catch{}return accept({data:next});
  }
  return {reload,change,current:()=>structuredClone(data.current),data:()=>structuredClone(data),native,recoveryRequired:()=>recoveryRequired,warning:()=>warning,directory:()=>directory,openFolder:()=>desktop.openLayoutsFolder()};
}
