import {conversionSummary} from './cad-stl-converter.js';
import {meshCadSource} from './cad-mesh-to-cad-data.js';
import {projectObjectGeometryDigest} from './project-objects.js';
import {flags} from './organization.js';

/** File conversion stays separate from the project. Only an explicit, current
 * native proposal may add a body to the common project and its single history. */
export function createCadConverterImport({controller,getFrame,showPreview,clearPreview,applyProposal,select,isolate=()=>{}}){
 let active=null,sequence=0;
 const aborted=()=>Object.assign(Error('CAD-Übernahme abgebrochen.'),{name:'AbortError'});
 function discard(){const s=active;active=null;sequence++;if(!s)return false;if(s.proposal){controller.discard(s.proposal.previewId);clearPreview(s.proposal.previewId);}else if(s.preparing)controller.cancel();return true;}
 async function prepare(file,result,{current=()=>true,source=null}={}){
  discard();if(!file?.name?.toLowerCase().endsWith('.stl')||!(result?.bytes instanceof Uint8Array)||!result.bytes.length||!result.report?.valid)throw Error('Ein geprüftes STL-Konverterergebnis auswählen.');
  const p=controller.snapshot(),revision=controller.revision(),id=crypto.randomUUID(),s=active={revision,current,source,preparing:true,proposal:null},token=++sequence;
  if(source){try{const node=meshCadSource(p,source.target);if(source.revision!==revision||source.digest!==projectObjectGeometryDigest(node))throw Error('Quellnetz oder Projekt geändert. Das Netz erneut auswählen.');}catch(error){s.preparing=false;discard();throw error;}}
  if(!source&&(flags({layerId:p.activeLayerId,folderId:p.activeFolderId},p).locked||flags({layerId:p.activeLayerId,folderId:p.activeFolderId},p).hidden)){discard();throw Error('Für die CAD-Übernahme einen sichtbaren entsperrten Layer und Ordner wählen.');}
  const valid=()=>active===s&&sequence===token&&current()&&controller.revision()===revision;
  try{
   if(!valid())throw aborted();
   const operation=source?{kind:'meshToCad',bytes:result.bytes,id,target:source.target,sourceDigest:source.digest,notes:conversionSummary(result.report).slice(0,4000)}:{kind:'importStep',bytes:result.bytes,options:{id,name:file.name,transform:getFrame(p),color:'#8294aa',layerId:p.activeLayerId,folderId:p.activeFolderId,metadata:{importedFile:{name:file.name,type:'stl'},notes:conversionSummary(result.report).slice(0,4000)}}};
   const proposal=await controller.preview(operation,{revision,label:source?'Netz als CAD-Kopie prüfen':'STL-Konverter: CAD-Übernahme prüfen'});
   s.preparing=false;s.proposal=proposal;if(!valid()){controller.discard(proposal.previewId);throw aborted();}
   await showPreview(proposal,[id],source?[source.target.rootId]:[]);if(!valid()){controller.discard(proposal.previewId);clearPreview(proposal.previewId);throw aborted();}
   return {previewId:proposal.previewId,revision,id,volume:proposal.project.nodes.find(n=>n.id===id).stats.volume};
  }catch(error){s.preparing=false;if(active===s)discard();throw error;}
 }
 async function apply({isolateCopy=false}={}){const s=active;if(!s?.proposal)throw Error('Zuerst die CAD-Übernahmevorschau berechnen.');if(!s.current()||s.revision!==controller.revision()){discard();throw Error('Projekt geändert. Die CAD-Übernahme erneut prüfen.');}active=null;sequence++;try{const result=await applyProposal(s.proposal);const targets=[{rootId:s.proposal.project.nodes.at(-1).id,path:[]}];select(targets);if(s.source&&isolateCopy)isolate(targets);return result;}catch(error){controller.discard(s.proposal.previewId);clearPreview(s.proposal.previewId);throw error;}}
 return {prepare,apply,discard,state:()=>active?{revision:active.revision,preparing:active.preparing,previewId:active.proposal?.previewId??null}:null};
}
