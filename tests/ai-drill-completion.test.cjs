const {test}=require('node:test'),assert=require('node:assert/strict');
const {reference}=require('../backend/ai-tool-reference.cjs');
test('drilling instructions expose the real preview and commit controls before execution',async()=>{
 const tool=(await reference({tool:'tool:drill'},{practiceOnly:true})).tool;
 for(const id of ['cad-drill-diameter','cad-ref-preview','cad-ref-apply'])assert(tool.controls?.some(c=>c.target==='ui:id:'+id),'Missing drilling control: '+id);
 assert(tool.steps.some(s=>s.includes('cad-ref-preview')));
 assert(tool.steps.some(s=>s.includes('cad-ref-apply')&&/übernehm/i.test(s)));
 assert(tool.steps.some(s=>/Vorschau/.test(s)&&/Material|Bohrung/.test(s)));
});

test('a preview-only drilling proposal receives actual commit instructions before any execution',async()=>{
 const {withToolReference}=require('../backend/ai-tool-reference.cjs');let rounds=0;
 const actions=[{kind:'select',targets:['existing-1']},{kind:'ui',action:'click',target:'menu:cad'},{kind:'ui',action:'click',target:'ui:tool:drill'},{kind:'face',target:'existing-1',side:'top'},{kind:'ui',action:'set',target:'ui:id:cad-drill-diameter',value:'6'},{kind:'ui',action:'click',target:'ui:id:cad-ref-preview'}];
 const reply=await withToolReference({envelope:{system:'JSON',user:'Drill a through hole.',sceneRevision:'r',input:{history:[],images:[]},context:{toolReference:{version:1},practiceOnly:true,practiceObjects:[{}]}},complete:async e=>{
  rounds++;if(rounds===2){assert(e.user.includes('cad-ref-apply'));assert(e.user.includes('noch kein Material'));assert(e.user.includes('not executed'));}
  return {text:JSON.stringify({revision:'r',assistant:{kind:'practice',plan:{version:1,title:'Drilling',actions:rounds===1?actions:[...actions,{kind:'ui',action:'click',target:'ui:id:cad-ref-apply'}]}}}),data:{usage:{input_tokens:1,output_tokens:1}}};
 }});assert.equal(rounds,2);assert.equal(JSON.parse(reply.text).assistant.plan.actions.at(-1).target,'ui:id:cad-ref-apply');
});


test('the fixed laboratory context supplies the drill commit controls before the first model request',async()=>{
 const task=require('../backend/ai-test-lab-cases.cjs').taskInstance('practice-14');
 const entry=await require('../backend/ai-test-lab-practice-context.cjs').practiceEntry({variant:'C',prompt:task.prompt,objects:[{alias:'existing-1',kind:'cad'}],toolIds:task.toolIds});
 assert(entry.text.includes('cad-ref-preview'));assert(entry.text.includes('cad-ref-apply'));assert(entry.text.includes('noch kein Material'));assert(entry.references.some(r=>r.toolReference.tool==='tool:drill'));
});
