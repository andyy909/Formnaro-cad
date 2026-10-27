import {generateDesktopAI} from './ai-desktop-client.js';
// Converter proposals use the desktop AI service and its existing provider profiles.
// Only a bounded region summary leaves this workbench; geometry stays local.
export const CONVERTER_AI_CONTEXT={application:'Formnaro',domain:'converter',version:1,
  instructions:'Return {revision,label,commands,message?}, {question} or {message}. Use only region IDs present in scene.regions. Commands prepare a local preview, never save, export, convert or change CAD objects. Types are recognition hints, not verified CAD geometry. Preserve protected regions. Do not infer exact dimensions from triangle counts. Only explicit Apply changes region corrections; conversion still performs native CAD/STEP checks.',
  commands:[{op:'type',regions:'existing integer region IDs',type:['AUTO','PLANE','CYLINDER','CONE','GRAPH','REVOLUTION','REST']},{op:'protect',regions:'existing integer region IDs',enabled:'boolean'},{op:'merge',regions:'at least two existing region IDs'}],limits:{commands:20,regions:256}};
const types=new Set(CONVERTER_AI_CONTEXT.commands[0].type);
export function converterAIScene({analysis,options,selection,revision}){
  if(!analysis?.state||!analysis.regions?.length)throw Error('Zuerst eine gültige Flächenanalyse abwarten.');
  if(options.mode!=='auto')throw Error('KI-Flächenbearbeitung benötigt Automatisch erkennen.');
  const selected=new Set(selection),chosen=selected.size?analysis.regions.filter(r=>selected.has(r.edit_id)):analysis.regions;
  if(!chosen.length||chosen.length>256)throw Error('Für die KI höchstens 256 Flächenbereiche auswählen.');
  return {revision,units:'mm',toleranceMM:options.tolerance,sourceUnitMM:options.unit,regionCount:analysis.regions.length,selection:chosen.filter(r=>selected.has(r.edit_id)).map(r=>r.edit_id),
    regions:chosen.map(r=>({id:r.edit_id,type:r.type,triangles:r.faces.length,protectedTriangles:r.protected_faces??0,...Object.fromEntries(['radius_mm','radius_min_mm','radius_max_mm'].filter(k=>Number.isFinite(r[k])).map(k=>[k,r[k]]))}))};
}
export function validateConverterAIProposal(value,scene){
  if(!value||value.revision!==scene.revision)throw Error('Der KI-Vorschlag gehört zu einem älteren Konverterstand.');
  if(!Array.isArray(value.commands)||!value.commands.length||value.commands.length>20)throw Error('Die KI muss 1 bis 20 Flächenbefehle liefern.');
  const known=new Map(scene.regions.map(r=>[r.id,r]));
  for(const command of value.commands){
    const keys={type:['op','regions','type'],protect:['op','regions','enabled'],merge:['op','regions']}[command?.op];
    if(!keys||Object.keys(command).length!==keys.length||Object.keys(command).some(k=>!keys.includes(k)))throw Error('Unbekannter KI-Flächenbefehl.');
    if(!Array.isArray(command.regions)||command.regions.length<(command.op==='merge'?2:1)||command.regions.length>256||new Set(command.regions).size!==command.regions.length||command.regions.some(id=>!Number.isSafeInteger(id)||!known.has(id)))throw Error('KI-Flächenbefehl enthält unbekannte oder doppelte Bereiche.');
    if(command.op==='type'&&!types.has(command.type)||command.op==='protect'&&typeof command.enabled!=='boolean')throw Error('Ungültiger KI-Flächenwert.');
    if(command.op!=='protect'&&command.regions.some(id=>known.get(id).protectedTriangles>0))throw Error('Geschützte Bereiche zuerst ausdrücklich entsperren.');
  }
  return structuredClone(value.commands);
}
export function createConverterAI({desktop,snapshot,prepare,commit,show,clear,onState=()=>{}}){
  let generation=0,pending=null,active=null,disposed=false;
  const emit=()=>onState({busy:!!active,pending:!!pending});
  const same=revision=>!disposed&&snapshot()?.revision===revision;
  function discard(){++generation;pending=null;clear();emit();}
  function cancel(){const current=active;discard();if(current){active=null;if(current.network)void desktop.cancelAI({requestId:current.id}).catch(()=>{});void current.task?.cancel();}emit();return !!current;}
  async function request(prompt){
    if(disposed||active)throw Error('Eine KI-Anfrage läuft bereits.');
    if(typeof prompt!=='string'||!prompt.trim()||prompt.length>10000)throw Error('Eine gewünschte Flächenkorrektur mit höchstens 10.000 Zeichen eingeben.');
    if(!desktop?.generateAI)throw Error('KI-Anfragen stehen in der Windows-Anwendung zur Verfügung.');
    const source=snapshot(),scene=converterAIScene(source);discard();const ticket=generation,id=crypto.randomUUID();active={id,network:false,task:null};emit();
    try{
      const settings=await desktop.getAISettings();if(ticket!==generation||!same(scene.revision))throw Error('Konverterstand geändert. Vorschlag erneut anfordern.');
      const requestConfig=Object.fromEntries(['authMode','protocol','baseUrl','model','reasoningEffort','openAIReasoningEffort','maxOutputTokens'].map(k=>[k,settings[k]??null]));active.network=true;
      const value=await generateDesktopAI(desktop,{domain:'converter',requestId:id,prompt,context:CONVERTER_AI_CONTEXT,scene,chat:true,requestConfig});
      if(ticket!==generation||!same(scene.revision))throw Error('Konverterstand geändert. Vorschlag erneut anfordern.');active.network=false;
      if(!value.commands)return value;
      const commands=validateConverterAIProposal(value,scene),task=prepare(commands);active.task=task;
      const candidate=await task.run();if(ticket!==generation||!same(scene.revision))throw Error('Konverterstand geändert. Vorschlag erneut anfordern.');
      pending={revision:scene.revision,candidate,commands};show(candidate);return {...value,commands};
    }catch(error){if(active?.id===id){pending=null;clear();}throw error;}finally{if(active?.id===id)active=null;emit();}
  }
  function apply(){if(!pending||!same(pending.revision)){discard();throw Error('Konverterstand geändert. Vorschlag erneut anfordern.');}const value=pending;pending=null;++generation;emit();commit(value.candidate);emit();return value;}
  return {request,apply,discard,cancel,state:()=>({busy:!!active,pending:!!pending}),dispose(){cancel();disposed=true;}};
}
