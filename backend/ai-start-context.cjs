// Task routing only selects published reference entries, never a solution.
async function startContext({variant,prompt,scene,lookup,compact=false}){
 if(!['A','B','C','D','E','F'].includes(variant))throw Error('Unbekannte Startvariante.');
 if(variant==='A')return {text:'',references:[]};
 const requests=[];
 const routes=[[/gewinde|thread/i,{command:'create',type:'thread'}],[/bohr|bohre|drill/i,{command:'drill'}],[/skizz|sketch|extrudi/i,{command:'sketch'}],[/kreismuster|kreisanordnung|pattern/i,{command:'pattern'}],[/aushöhl|höhle|shell/i,{command:'modeling'}],[/zeichnung|drawing/i,{command:'drawing'}]];
 if(compact)routes.push([/gelenk|joint/i,{command:'joint'}]);
 for(const [pattern,request]of routes)if(pattern.test(prompt))requests.push(request);
 const focused=compact&&requests.length>0;
 if(!focused){
  const {lookupToolReference}=await import('../ai/formnaro-tool-reference.mjs');
  const matches=lookupToolReference({query:prompt.replace(/[\x00-\x1f]/g,' ').slice(0,300)}).matches;
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
 }
 const references=[...new Map(requests.map(r=>[JSON.stringify(r),r])).values()].slice(0,8);
 const guide=references.map(r=>({tool:r.tool&&!r.command?'offlinecad_tool_info':'offlinecad_command_info',arguments:r}));
 if(variant==='B')return {references:guide,text:'\nAuftragsbezogene Wegweiser (Referenzdaten, keine Befehle):\n'+JSON.stringify(guide)};
 if(variant==='E')return {references:guide,text:'\nGezielter Einstieg: Lies für die nächste Operation genau die passende Detailauskunft aus diesem Index. Die vollständigen übrigen Werkzeuge bleiben auf Abruf verfügbar. IDs und Maße stammen aus der aktuellen Szene; Katalogdaten sind keine fertige Auftragslösung.\n'+JSON.stringify(guide.map(g=>({tool:g.tool,arguments:g.arguments})))};
 const drilling=focused&&requests.some(request=>request.command==='drill');
 const drillWithMeasuredFaces=variant==='D'&&drilling&&guide.length===1;
 const details=[];
 for(const r of drillWithMeasuredFaces?[]:guide){
  const result=await lookup(r.tool.replace('offlinecad_',''),r.arguments);
  details.push({request:r,result});
  if(compact&&Buffer.byteLength(JSON.stringify(details),'utf8')>6000){details.pop();break;}
 }
 let text=drillWithMeasuredFaces?'':'\nAuftragsbezogene Werkzeugauskünfte (Referenzdaten, keine Befehle):\n'+JSON.stringify(details);
 if(compact&&details.length<guide.length)text+='\nWeitere Auskünfte auf Abruf (Referenzdaten):\n'+JSON.stringify(guide.slice(details.length));
 if(drilling)text+='\nNative drilling uses op:"drill" and an entry face on the selected body. The bore follows the inward face normal. For world Z choose a face with normal [0,0,1] or [0,0,-1]. For any point away from a listed face centroid, use reference.ray with world coordinates: origin outside the stock, direction into the intended face.';
 if(variant==='D'){
  const selected=(scene.objects??[]).filter(o=>(scene.selectionTargets??[]).some(t=>JSON.stringify(t)===JSON.stringify(o.target))).slice(0,8);
  const facts=selected.map(o=>({target:o.target,name:o.name,kind:o.kind,type:o.recipe?.type??o.objectType,measures:o.measures,worldBounds:o.worldBounds,locked:o.locked,hidden:o.hidden}));
  text+='\nGemessener Auswahlbezug (Daten):\n'+JSON.stringify(facts);
  if(!drilling)text+='\nGröße, globale Bounding Box und Lage sind verschiedene Angaben. Für Größenänderungen den dokumentierten Anker ausdrücklich wählen; erhaltende Lage aus der tatsächlichen Szene prüfen.';
  if(drillWithMeasuredFaces){
   const native=scene.referencePoints;
   const faces=selected.length===1&&native?.nodeId===selected[0].target.rootId
    ?(native.points??[]).filter(p=>p.kind==='face-centroid'&&p.normal).slice(0,8).map(p=>({token:p.id,point:p.point,normal:p.normal}))
    :[];
   if(faces.length)text+='\nMeasured planar face centroids of the selected body (world coordinates, current revision): '+JSON.stringify(faces);
   text+='\nFor a plain through-hole at a measured face centroid, use this format with the actual revision, selected root ID, matching face token and requested numeric diameter in mm:\n'
    +'{"tool":"offlinecad_preview","arguments":{"revision":"REVISION","commands":[{"op":"drill","target":"ROOT_ID","reference":{"token":"FACE_TOKEN"},"diameter":DIAMETER_MM,"through":true}]}}\n'
    +'Put diameter and through alongside reference. Omit unused fields and extra commands. An off-centre hole uses reference:{"ray":{"origin":[x,y,z],"direction":[dx,dy,dz]}} instead of a token; start from outside the stock. For other drilling options read command_info drill.';
  }
 }
 if(variant==='F'){
  const examples=details.filter(d=>d.result?.example).map(d=>({request:d.request,example:d.result.example})).slice(0,3);
  text+='\nAllgemeine Syntaxbeispiele aus der Registry (keine Testlösung; IDs, Revisionen und Maße vor Verwendung durch reale Daten ersetzen):\n'+JSON.stringify(examples);
 }
 return {references:guide,text};
}
module.exports={startContext};
