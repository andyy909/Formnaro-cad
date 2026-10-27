import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {createAITaskEvidence,compactAIRequestContext} from '../src/cad-ai-task-evidence.js';
import {runCadAIRequest} from '../src/cad-ai-request.js';
import {correctionFeedback} from '../src/ai-feedback.js';
const require=createRequire(import.meta.url),{generate}=require('../backend/ai-provider.cjs');
test('Public aliases stay intact while the request carries only one full schema',()=>{
 const schema={properties:{commands:{marker:'ALL_TOOLS'}}},context={commandSchema:schema,requestSchema:structuredClone(schema),notes:'KEEP_NOTES',programTools:{all:true}};
 const compact=compactAIRequestContext(context);assert.equal(compact.commandSchema,schema);assert.deepEqual(compact.requestSchema,{$ref:'#/commandSchema'});assert.equal(context.requestSchema.properties.commands.marker,'ALL_TOOLS');assert.deepEqual(compactAIRequestContext(compact),compact);assert.equal(compact.notes,context.notes);assert.deepEqual(compact.programTools,context.programTools);
 const different={commandSchema:{a:1},requestSchema:{a:2}};assert.equal(compactAIRequestContext(different),different);
});
test('Actual Chat and Responses payloads each carry the full schema once, retaining every tool and notes',async()=>{
 const fetch=global.fetch;try{for(const protocol of ['chat','responses']){let body;global.fetch=async(_url,options)=>{body=JSON.parse(options.body);const text=JSON.stringify({revision:'r',commands:[]});return new Response(JSON.stringify(protocol==='chat'?{choices:[{message:{content:text}}]}:{output:[{type:'message',content:[{type:'output_text',text}]}]}));};
 const schema={properties:{commands:{allTools:'UNIQUE_SCHEMA_MARKER'}}},context={commandSchema:schema,requestSchema:schema,programTools:{native:'NATIVE_TOOLS'},notes:'KEEP_NOTES'};
 await generate({protocol,baseUrl:'https://api.deepseek.com',model:'deepseek-flash'},'synthetic-fixture',{prompt:'Build',scene:{revision:'r'},context:compactAIRequestContext(context)});
 const system=body.instructions??body.messages[0].content;assert.equal(system.split('UNIQUE_SCHEMA_MARKER').length-1,1);assert.match(system,/NATIVE_TOOLS/);assert.match(system,/KEEP_NOTES/);assert.match(system,/#\/commandSchema/);
 }}finally{global.fetch=fetch;}
});
test('Converter rejection survives a successful measurement, invalid JSON and a later native failure',async()=>{
 let calls=0,previews=0;const inputs=[],scene=()=>({revision:'r',selectionTargets:[]}),checks=[{kind:'solids',target:'$part',expected:1}];
 const converter=Object.assign(Error('Repair deviation 3.01367 mm; reconstruct from measurements'),{code:'CAD_CONVERTER_REPAIR_REJECTED',feedback:{toolFailure:{scope:'converter-only'}}});
 const result=await runCadAIRequest({input:{},maxSteps:8,visualReview:false,access:{scene,context:()=>({}),analyze:async()=>({results:[{id:'scan',value:{radius:3}}]}),preview:async p=>{assert.deepEqual(p.checks,checks);if(++previews===1)throw converter;if(previews===2)throw Object.assign(Error('Mesh method missing'),{code:'FREECAD_PYTHON_FAILED'});return {previewId:'good'};}},generate:async args=>{
  inputs.push(structuredClone(args));calls++;
  if(calls===1)return {revision:'r',commands:[{op:'tool',engine:'converter',operation:{kind:'convert'}}],checks};
  if(calls===2)return {revision:'r',analysis:[{id:'scan',engine:'python',kind:'run',options:{code:'result=3'}}]};
  if(calls===3){assert.equal(args.correction,'');const e=Object.assign(Error('Invalid JSON'),{code:'AI_OUTPUT_INVALID',aiRetryable:true});throw e;}
  return {revision:'r',commands:[{op:'tool',engine:'freecad',operation:{kind:'build'}}]};
 }});
 assert.equal(result.proposal.previewId,'good');assert.equal(calls,5);
 for(const r of inputs.slice(1)){assert.equal(r.context.taskEvidence.failures[0].code,converter.code);assert.equal(r.context.taskEvidence.failures[0].toolFailure.retrySameTool,false);assert.match(r.context.taskEvidence.failures[0].message,/3.01367/);}
 assert.deepEqual(inputs.at(-1).context.taskEvidence.failures.map(f=>f.code),['CAD_CONVERTER_REPAIR_REJECTED','AI_OUTPUT_INVALID','FREECAD_PYTHON_FAILED']);
 const fresh=createAITaskEvidence('other').snapshot();assert.deepEqual(fresh.failures,[]);assert.equal(fresh.revision,'other');
});
test('All 80 distinct failures survive bounded evidence; repeats aggregate and no arbitrary Error fields leak',()=>{
 const memory=createAITaskEvidence('r');for(let i=1;i<=80;i++)memory.failed(i,{code:'X'.repeat(76)+i,message:'M'.repeat(1500)+i,apiKey:'PRIVATE_KEY',feedback:{secret:'PRIVATE_SECRET',toolFailure:{scope:'converter-only'}}},{commands:Array.from({length:4},(_,j)=>({op:'tool',engine:'e'.repeat(100)+j,operation:{kind:'k'.repeat(100)}}))});
 const snapshot=memory.snapshot(),text=JSON.stringify(snapshot);assert.equal(snapshot.failures.length,80);assert.ok(text.length<=32000,text.length);assert.doesNotMatch(text,/PRIVATE_/);
 const repeat=createAITaskEvidence('r');for(const step of [1,3])repeat.failed(step,{code:'SAME',message:'same'},{commands:[]});assert.equal(repeat.snapshot().failures[0].occurrences,2);assert.equal(repeat.snapshot().failures[0].lastStep,3);
});
test('A failed native analysis returns its complete original script as reference evidence',()=>{
 const script={version:1,code:'measurements={"a":1}\nraise Exception("bad API")',modules:{helper:'pass'}};
 const text=correctionFeedback({message:'bad API'},{analysis:[{id:'native',engine:'freecad',kind:'inspect',options:{script}}]});assert.deepEqual(JSON.parse(text.split('\n')[1]).rejectedPrograms.programs[0].script,script);
});
