// Menu navigation needs its trusted target catalogue and current UI state, not
// the geometry command schemas. The request loop asks again with the full
// contract before executing any model reply returned from this smaller scope.
export function cadAIRequestContext(context,{programHelpOnly=false}={}){
 if(!programHelpOnly||!context?.programAssistant)return context;
 return {
  programHelpOnly:true,
  ...(context.localEngines?{localEngines:context.localEngines}:{}),
  programAssistant:{
   ...context.programAssistant,
   scope:'Navigation and program explanations only. The native commandSchema and modelling tools are intentionally omitted from this request. Preserve confirmed geometry and any pending model proposal. Use the supplied catalogue, current mode and target state; disabled tools may be pointed at while explaining prerequisites. '+context.programAssistant.scope,
   reply:'Return {revision,assistant:{kind:"help",query},message?} for one targeted local help lookup. Return {revision,assistant:{kind:"guide",steps:[{action:"point"|"click"|"set",target:catalogueId,text?:shortExplanation,value?:listedValue}]},message} to execute navigation. Put message at the TOP LEVEL, outside assistant; do not add checks to navigation. Bundle requested targets and explain their purpose and prerequisites in one or two sentences. Return {revision,assistant:{kind:"note",text},message} only for a requested provider context note. If the task actually requires constructing or measuring geometry or a staged model demonstration, return {revision,commands:[]} to request the complete modelling contract. The application discards that placeholder and regenerates with the full CAD API before executing anything.'
  }
 };
}
