const test=require('node:test'),assert=require('node:assert/strict');
const {reference,withToolReference}=require('../backend/ai-tool-reference.cjs');
const required=['drawing-sheet','drawing-paper-size','drawing-title-block','drawing-title','drawing-update','drawing-apply'];

test('drawing lookups and the recorded Sol search expose the complete actual sheet controls',async()=>{
 for(const practiceOnly of [true,false]){
  const context={practiceOnly};
  const direct=(await reference({tool:'tool:drawing'},context)).tool;
  const search=(await reference({query:'Technische Zeichnung Vorderansicht Draufsicht Seitenansicht Ansichten Bedienelemente Papierformat A4'},context)).matches.find(t=>t.id==='tool:drawing');
  for(const tool of [direct,search]){
   for(const id of required)assert(tool.controls?.some(c=>c.target==='ui:id:'+id),'Missing actual drawing control: '+id);
   assert(tool.controls.find(c=>c.target==='ui:id:drawing-paper-size').options.some(o=>o.value==='A4'));
   assert(tool.steps.some(s=>s.includes('Vorder-')&&s.includes('Drauf-')&&s.includes('Seitenansicht')));
   assert(tool.steps.some(s=>s.includes('menu:cad')&&s.includes('ui:tool:drawing')));
   assert(tool.steps.some(s=>s.includes('drawing-apply')||s.includes('Blatt übernehmen')));
  }
 }
});

test('a drawing-opening-only proposal receives its missing field schema before execution',async()=>{
 let rounds=0;
 const actions=[{kind:'select',targets:['existing-1']},{kind:'ui',action:'click',target:'menu:cad'},{kind:'ui',action:'click',target:'ui:tool:drawing'}];
 const reply=await withToolReference({envelope:{system:'JSON',user:'A4 drawing with title and three views.',sceneRevision:'r',input:{history:[],images:[]},context:{toolReference:{version:1},practiceOnly:true,practiceObjects:[{}]}},complete:async e=>{
  rounds++;
  if(rounds===2){assert(e.user.includes('drawing-paper-size'));assert(e.user.includes('drawing-title-block'));assert(e.user.includes('drawing-apply'));assert(e.user.includes('not executed'));}
  return {text:JSON.stringify({revision:'r',assistant:{kind:'practice',plan:{version:1,title:'Drawing',actions:rounds===1?actions:[...actions,{kind:'ui',action:'choose',target:'ui:id:drawing-paper-size',value:'A4'},{kind:'ui',action:'click',target:'ui:id:drawing-title-block'},{kind:'ui',action:'set',target:'ui:id:drawing-title',value:'Part'},{kind:'ui',action:'click',target:'ui:id:drawing-update'},{kind:'ui',action:'click',target:'ui:id:drawing-apply'}]}}}),data:{usage:{input_tokens:1,output_tokens:1}}};
 }});
 assert.equal(rounds,2);assert.equal(reply.data.toolReferences[0].source,'planned-tool-fields');
});
