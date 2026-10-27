import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {validateAssistantAction,searchProgramHelp,PROGRAM_TARGETS,programQuestion} from '../src/cad-program-help.js';
import {runCadAIRequest} from '../src/cad-ai-request.js';
const require=createRequire(import.meta.url),{assistantReply}=require('../backend/ai-program-assistant.cjs'),{createModelingContext}=require('../backend/ai-modeling-context.cjs'),{generate}=require('../backend/ai-provider.cjs');
test('Catalogue contains real tool procedures, prerequisites and unique semantic targets',()=>{
 assert.equal(new Set(PROGRAM_TARGETS.map(t=>t.id)).size,PROGRAM_TARGETS.length);
 assert.match(searchProgramHelp('Ausformung Loft')[0].description,/Zwei eigenständige native Skizzen/);
 assert.match(searchProgramHelp('CAD in Netz')[0].description,/Netzkopie/);
 assert(programQuestion('Wo finde ich das Werkzeug?'));assert(programQuestion('Erkläre mir Loft'));
});
test('Whole guide is validated before execution; external actions, file dialogs and model commits are rejected',()=>{
 for(const [target,action,value]of [['#ai-key','set','x'],['tool:import','click'],['tool:new','click'],['region:preview-apply','click'],['settings:theme','set','https://evil.invalid'],['shell:run','click'],['tool:undo','click']])assert.throws(()=>validateAssistantAction({kind:'guide',steps:[{target:'menu:cad',action:'click'},{target,action,...(value?{value}:{})}]}));
 assert.throws(()=>validateAssistantAction({kind:'guide',steps:[{target:'menu:cad',action:'click',selector:'body'}]}));
 assert.deepEqual(validateAssistantAction({kind:'guide',steps:[{target:'settings:theme',action:'set',value:'dark'}]}).steps[0].value,'dark');
});
test('Transport bounds help, guide, note and demonstration without accepting arbitrary nested fields',()=>{
 for(const value of [{kind:'os',command:'x'},{kind:'note',text:'x',path:'C:/outside'},{kind:'help',query:'x'.repeat(501)},{kind:'guide',steps:[{action:'click',target:'button[data-x]'}]},{kind:'demonstrate',title:'x',stages:[{text:'x',commands:[],url:'x'}]}])assert.throws(()=>assistantReply(value));
 assert.equal(assistantReply({kind:'help',query:'Loft'}).kind,'help');
});
test('Context note appends only to its fixed file with stale, size and secret guards',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-note-'));
 try{const store=createModelingContext({directory:path.join(dir,'own'),redact:s=>s.replaceAll('TEST-SECRET','[redacted]')}),outside=path.join(dir,'outside.txt');fs.writeFileSync(outside,'preserve');const before=store.readNote();store.appendNote({text:'Bevorzugt Millimeter.',expectedRevision:before.revision});assert(store.readNote().text.startsWith(before.text));assert.throws(()=>store.appendNote({text:'old',expectedRevision:before.revision}),e=>e.code==='STALE_CONTEXT');assert.throws(()=>store.appendNote({text:'TEST-SECRET',expectedRevision:store.readNote().revision}));assert.throws(()=>store.appendNote({text:'x'.repeat(2001),expectedRevision:store.readNote().revision}));assert.equal(fs.readFileSync(outside,'utf8'),'preserve');assert.deepEqual(fs.readdirSync(path.join(dir,'own')),['KI-Modellierkontext.md']);}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Read-only program help preserves task workspace and returns local help in next provider request',async()=>{
 let calls=0,begun=0;const scene={revision:'current',selectionTargets:[]},access={programOnly:true,beginTask:()=>begun++,scene:()=>scene,context:()=>({}),programAssistant:{execute:async v=>({documentation:[{label:v.query}]})}};
 const result=await runCadAIRequest({input:{prompt:'Erkläre Loft'},access,generate:async args=>{calls++;if(calls===1)return {revision:'current',assistant:{kind:'help',query:'Loft'}};assert.equal(args.analysisResults[0].programHelp.documentation[0].label,'Loft');return {message:'Zwei Skizzen auswählen.'};}});assert.equal(result.message,'Zwei Skizzen auswählen.');assert.equal(begun,0);assert.equal(calls,2);
});
test('Demonstration reuses final checked candidate, independent checks and ordinary Apply boundary',async()=>{
 let inspected=0,previewed=0;const p={previewId:'demo',revision:'current',verification:{passed:true,checks:[]}},access={scene:()=>({revision:'current'}),context:()=>({}),preview:()=>{previewed++;throw Error('must reuse');},inspectFreeCADPreview:async id=>{assert.equal(id,'demo');inspected++;return {passed:true};},programAssistant:{demonstrate:async()=>({proposal:p,commands:[{op:'create'}],report:{completed:true}})}};
 const result=await runCadAIRequest({input:{},access,generate:async()=>({revision:'current',assistant:{kind:'demonstrate',title:'Platte',stages:[]}})});assert.equal(result.proposal.previewId,'demo');assert.equal(inspected,1);assert.equal(previewed,0);assert.equal(result.commands[0].op,'create');
});
test('Assistant provider replies preserve usage for both API protocols and reject combined model actions',async()=>{
 const previous=globalThis.fetch;let mixed=false;
 try{globalThis.fetch=async()=>new Response(JSON.stringify({usage:{input_tokens:20,output_tokens:4,prompt_tokens:20,completion_tokens:4},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({revision:'current',assistant:{kind:'guide',steps:[{target:'menu:cad',action:'click'}]},...(mixed?{commands:[]}:{})})}]}],choices:[{message:{content:JSON.stringify({revision:'current',assistant:{kind:'help',query:'Loft'},...(mixed?{commands:[]}:{})})}}]}));
 for(const protocol of ['chat','responses']){const args=[{baseUrl:'http://localhost:9999',model:'fixture',protocol},'',{prompt:'Zeig das Menü',context:{programAssistant:{}},scene:{revision:'current'},chat:true}];const r=await generate(...args);assert(r.assistant);assert.equal(r.usage.inputTokens,20);mixed=true;await assert.rejects(generate(...args),e=>e.code==='AI_OUTPUT_INVALID'&&e.aiUsage.inputTokens===20);mixed=false;}}
 finally{globalThis.fetch=previous;}
});

test('Usage distinguishes navigation from cumulative model demonstrations',()=>{
 const {categoryFor}=require('../backend/ai-usage-ledger.cjs');assert.equal(categoryFor({prompt:'Zeig mir das CAD-Menü',assistantKind:'guide'}),'help');assert.equal(categoryFor({prompt:'Zeig eine Platte',assistantKind:'demonstrate'}),'create');assert.equal(categoryFor({prompt:'Baue die STL nach',assistantKind:'demonstrate'}),'rebuild');
});

test('Assistant explanation preserves the best earlier candidate and its failed checks',async()=>{
 let calls=0,discarded=0;const p={revision:'current',previewId:'best',verification:{passed:false,checks:[{passed:false,error:{code:'AI_RESULT_MISMATCH',message:'Maß fehlt'},feedback:{checkKind:'size'}}]}},access={scene:()=>({revision:'current'}),context:()=>({}),preview:async()=>p,discard:()=>discarded++,programAssistant:{execute:async()=>({kind:'guide',completed:true})}};
 const r=await runCadAIRequest({input:{},access,generate:async()=>++calls===1?{revision:'current',commands:[{op:'create'}]}:{revision:'current',assistant:{kind:'guide',steps:[]},message:'Werkzeugvoraussetzungen gezeigt.'}});assert.equal(r.proposal.previewId,'best');assert.equal(r.proposal.verification.passed,false);assert.equal(r.message,'Werkzeugvoraussetzungen gezeigt.');assert.equal(discarded,0);
});
test('Program answers also work in the larger workshop without a chat flag',async()=>{
 const old=globalThis.fetch;try{globalThis.fetch=async()=>new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({message:'Ausformung verbindet zwei native Skizzen.'})}]}]}));const r=await generate({baseUrl:'http://localhost:9999',model:'fixture',protocol:'responses'},'',{prompt:'Erkläre Ausformung',context:{programAssistant:{}},scene:{revision:'current'}});assert.match(r.message,/zwei native Skizzen/);}finally{globalThis.fetch=old;}
});
