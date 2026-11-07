async function practiceEntry({variant,prompt,objects,toolIds=[]}){
 if(variant==='A')return {text:'',references:[]};
 const {lookupToolReference}=await import('../ai/formnaro-tool-reference.mjs');
 const declared=[],seen=new Set(),queue=[...toolIds];while(queue.length&&declared.length<8){const tool=queue.shift();if(seen.has(tool))continue;seen.add(tool);const result=lookupToolReference({tool},{practice:true});if(result.ok&&result.tool){declared.push(result.tool);queue.push(...(result.tool.relatedTools??[]));}}
 const matches=declared.length?declared:lookupToolReference({query:prompt.replace(/[\x00-\x1f]/g,' ').slice(0,300)},{practice:true}).matches.slice(0,5);
 const references=matches.map(m=>({toolReference:{tool:m.id}}));
 if(['B','E'].includes(variant))return {references,text:'\nSichtbare Übung: passende Werkzeugauskünfte gezielt nachladen. Keine direkte Geometrie-API und kein Skript-Fallback.\n'+JSON.stringify(references)};
 let text='\nPassende aktuelle Auskünfte ausschließlich für sichtbare Bedienung:\n'+JSON.stringify(matches);
 if(variant==='D')text+='\nFreigegebene Fakten nur zu den vorhandenen ausgewählten Aliasen:\n'+JSON.stringify(objects)+'\nBei Maßänderung den tatsächlich sichtbaren Größenanker beachten und erhaltende Position erneut setzen beziehungsweise prüfen.';
 if(variant==='F')text+='\nNeutrales Formatbeispiel für eine reine Ansichtsaktion, kein Modellierplan für die Aufgabe:\n'+JSON.stringify({revision:'CURRENT_SCENE_REVISION',assistant:{kind:'practice',plan:{version:1,title:'Ansicht einpassen',actions:[{kind:'ui',action:'click',target:'view:fit'}]}}});
 return {text,references};
}
function selectedPracticeObjects(scene,{facts=false}={}){
 return scene.objects.filter(o=>scene.selectionTargets.some(t=>t.rootId===o.id&&!t.path.length)).slice(0,8).map((o,i)=>({alias:'existing-'+(i+1),name:o.name,kind:o.kind,...(facts?{facts:{shape:o.recipe?.type??o.objectType,size:o.worldBounds?.size,center:o.worldBounds?.center}}:{})}));
}
module.exports={practiceEntry,selectedPracticeObjects};
