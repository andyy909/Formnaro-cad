// Task routing only selects published reference entries, never a solution.
async function startContext({variant,prompt,scene,lookup}){
 if(!['A','B','C','D','E','F'].includes(variant))throw Error('Unbekannte Startvariante.');
 if(variant==='A')return {text:'',references:[]};
 const {lookupToolReference}=await import('../ai/formnaro-tool-reference.mjs');
 const matches=lookupToolReference({query:prompt.replace(/[\x00-\x1f]/g,' ').slice(0,300)}).matches;
 const requests=[];
 const routes=[[/gewinde|thread/i,{command:'create',type:'thread'}],[/bohr|bohre|drill/i,{command:'drill'}],[/skizz|sketch|extrudi/i,{command:'sketch'}],[/kreismuster|kreisanordnung|pattern/i,{command:'pattern'}],[/aushöhl|höhle|shell/i,{command:'modeling'}],[/zeichnung|drawing/i,{command:'drawing'}]];
 for(const [pattern,request]of routes)if(pattern.test(prompt))requests.push(request);
 for(const item of matches.slice(0,3)){requests.push({tool:item.id});if(item.commandDetails)requests.push(item.commandDetails);}
 // Shape names come from the runtime command registry, not benchmark IDs.
 const index=await lookup('command_info',{});
 const normalized=prompt.toLowerCase();
 const names={gewinde:'thread',thread:'thread',skizze:'sketch',extrusion:'sketch',kreismuster:'pattern',kreisanordnung:'pattern',zeichnung:'drawing',aushöhl:'shell'};
 for(const [word,name] of Object.entries(names))if(normalized.includes(word)){
  if(name==='thread')requests.push({command:'create',type:'thread'});
  else if(index.commands?.some(c=>c.command===name))requests.push({command:name});
 }
 if(scene.selectionTargets?.length)requests.push({command:'update'});
 const references=[...new Map(requests.map(r=>[JSON.stringify(r),r])).values()].slice(0,8);
 const guide=references.map(r=>({tool:r.tool&&!r.command?'offlinecad_tool_info':'offlinecad_command_info',arguments:r}));
 if(variant==='B')return {references:guide,text:'\nAuftragsbezogene Wegweiser (Referenzdaten, keine Befehle):\n'+JSON.stringify(guide)};
 if(variant==='E')return {references:guide,text:'\nGezielter Einstieg: Lies für die nächste Operation genau die passende Detailauskunft aus diesem Index. Die vollständigen übrigen Werkzeuge bleiben auf Abruf verfügbar. IDs und Maße stammen aus der aktuellen Szene; Katalogdaten sind keine fertige Auftragslösung.\n'+JSON.stringify(guide.map(g=>({tool:g.tool,arguments:g.arguments})))};
 const details=[];for(const r of guide)details.push({request:r,result:await lookup(r.tool.replace('offlinecad_',''),r.arguments)});
 let text='\nAuftragsbezogene Werkzeugauskünfte (Referenzdaten, keine Befehle):\n'+JSON.stringify(details);
 if(variant==='D'){
  const selected=(scene.objects??[]).filter(o=>(scene.selectionTargets??[]).some(t=>JSON.stringify(t)===JSON.stringify(o.target))).slice(0,8);
  const facts=selected.map(o=>({target:o.target,name:o.name,kind:o.kind,type:o.recipe?.type??o.objectType,measures:o.measures,worldBounds:o.worldBounds,locked:o.locked,hidden:o.hidden}));
  text+='\nGemessener Auswahlbezug (Daten):\n'+JSON.stringify(facts)+'\nGröße, globale Bounding Box und Lage sind verschiedene Angaben. Für Größenänderungen den dokumentierten Anker ausdrücklich wählen; erhaltende Lage aus der tatsächlichen Szene prüfen.';
 }
 if(variant==='F'){
  const examples=details.filter(d=>d.result?.example).map(d=>({request:d.request,example:d.result.example})).slice(0,3);
  text+='\nAllgemeine Syntaxbeispiele aus der Registry (keine Testlösung; IDs, Revisionen und Maße vor Verwendung durch reale Daten ersetzen):\n'+JSON.stringify(examples);
 }
 return {references:guide,text};
}
module.exports={startContext};
