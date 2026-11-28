const {test}=require('node:test'),assert=require('node:assert/strict');
const {readDiagnosticStream,exposedReasoning}=require('../backend/ai-diagnostic-stream.cjs');
const {matrix,cases}=require('../backend/ai-diagnostic-cases.cjs');
const {matches,validateProposal:validate}=require('../backend/ai-diagnostic-schema.cjs');
const validateProposal=async(args,revision)=>validate(args,revision,(await import('../src/cad-ai-context.js')).cadAIContext());
const {clean,markdown,winners}=require('../backend/ai-diagnostics.cjs');
const {startContext}=require('../backend/ai-start-context.cjs');
function stream(events,chunk=7){const bytes=Buffer.from(events.map(e=>'data: '+JSON.stringify(e)+'\r\n\r\n').join(''));return new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=chunk)c.enqueue(bytes.subarray(i,i+chunk));c.close();}}),{headers:{'content-type':'text/event-stream'}});}
test('SSE handles UTF-8 and CRLF boundaries and only returns a terminal response',async()=>{const events=[],item={type:'message',content:[{type:'output_text',text:'{"message":"Grüße"}'}]};const result=await readDiagnosticStream(stream([{type:'response.reasoning_text.delta',delta:'prüfen'},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{status:'completed',output:[],model:'deepseek-flash'}}]),e=>events.push(e));assert.equal(events[0].text,'prüfen');assert.deepEqual(result.output,[item]);});
test('Interrupted stream never promotes text to a proposal',async()=>{await assert.rejects(readDiagnosticStream(stream([{type:'response.output_text.delta',delta:'{"commands":[]}'}])),{code:'AI_STREAM_INTERRUPTED'});});
test('Incomplete response remains incomplete',async()=>{const r=await readDiagnosticStream(stream([{type:'response.incomplete',response:{status:'incomplete',output:[]}}]));assert.equal(r.status,'incomplete');});
test('Reasoning extraction excludes encrypted content',()=>{assert.equal(exposedReasoning({output:[{type:'reasoning',encrypted_content:'private',content:[{text:'visible'}]}]}),'visible');});
test('Export redacts credentials while preserving dimensions',()=>{const r=clean({key:'actual-secret',authorization:'Bearer actual-secret',encrypted_content:'opaque',point:[16,40,80]},['actual-secret']);assert.ok(!JSON.stringify(r).includes('actual-secret'));assert.ok(!JSON.stringify(r).includes('opaque'));assert.deepEqual(r.point,[16,40,80]);assert.ok(markdown({id:'test',status:'failed',spec:{},events:[{type:'error',ms:3,text:'Grund'}]}).includes('Grund'));});
test('Matrix covers 54 starts and 72 finalist runs with balanced order',()=>{const s=matrix('start'),f=matrix('full',{low:'B',high:'C',max:'B'});assert.equal(s.length,54);assert.equal(new Set(s.map(x=>[x.caseId,x.variant,x.effort].join())).size,54);assert.equal(f.length,72);assert.ok(f.every(x=>x.variant==='A'||x.variant===({low:'B',high:'C',max:'B'})[x.effort]));});
test('All start variants retrieve actual references for all six cases',async()=>{const {cadAIContext}=await import('../src/cad-ai-context.js');const {cadCommandReference}=await import('../src/cad-command-reference.js');const {lookupToolReference}=await import('../ai/formnaro-tool-reference.mjs');const context=cadAIContext(),lookup=async(m,a)=>m==='command_info'?cadCommandReference(context,a):lookupToolReference(a);for(const task of cases){const b=await startContext({variant:'B',prompt:task.prompt,scene:{selectionTargets:[{}]},lookup}),c=await startContext({variant:'C',prompt:task.prompt,scene:{selectionTargets:[{}]},lookup});assert.ok(b.references.length,task.id);assert.ok(c.text.length>b.text.length,task.id);assert.equal((await startContext({variant:'A'})).text,'');}});
test('Compact hints for drilling send only the native drill reference and measured selection',async()=>{
 const {cadAIContext}=await import('../src/cad-ai-context.js');
 const {cadCommandReference}=await import('../src/cad-command-reference.js');
 const context=cadAIContext(),lookups=[];
 const lookup=async(method,args)=>{lookups.push([method,args]);return cadCommandReference(context,args);};
 const target={rootId:'plate',path:[]};
 const scene={selectionTargets:[target],objects:[{target,name:'Platte',worldBounds:{center:[13,-9,10],max:[38,9.75,15]}}],
  referencePoints:{nodeId:'plate',points:[{id:'face:1',kind:'face-centroid',point:[13,-9,15],normal:[0,0,1]},
   {id:'vertex:0',kind:'vertex',point:[38,9.75,15]}]}};
 const task=cases.find(item=>item.id==='drill');
 const drill=await startContext({variant:'D',prompt:task.prompt,scene,lookup,compact:true});
 assert.deepEqual(lookups,[]);
 assert.deepEqual(drill.references,[{tool:'offlinecad_command_info',arguments:{command:'drill'}}]);
 assert.match(drill.text,/"center":\[13,-9,10\]/);
 assert.match(drill.text,/"token":"face:1","point":\[13,-9,15\],"normal":\[0,0,1\]/);
 assert.match(drill.text,/"reference":\{"token":"FACE_TOKEN"\},"diameter":DIAMETER_MM,"through":true/);
 assert.doesNotMatch(drill.text,/vertex:0/);
 assert.doesNotMatch(drill.text,/tool:cad-sweep|tool:mesh-curved-reduce|tool:joints|"command":"update"/);

 const mixed=await startContext({variant:'B',prompt:'Bohre ein Loch und erstelle ein Gelenk.',scene,lookup,compact:true});
 assert.deepEqual(mixed.references.map(ref=>ref.arguments.command),['drill','joint']);
 const sketch=await startContext({variant:'B',prompt:'Erzeuge eine Skizze.',scene,lookup,compact:true});
 assert.deepEqual(sketch.references.map(ref=>ref.arguments.command),['sketch']);
});
test('Schema rejects invented fields, illegal values, missing fields and stale revisions',async()=>{assert.ok(!(await validateProposal({revision:'0123456789abcdef',commands:[{op:'create',type:'box',size:[40,30,8],invented:true}]},'0123456789abcdef')).valid);assert.ok((await validateProposal({revision:'0123456789abcdef',commands:[{op:'create',type:'box',size:[40,30,8]}]},'0123456789abcdef')).valid);assert.ok(!(await validateProposal({revision:'0123456789abcdef',commands:[{op:'delete'}]},'0123456789abcdef')).valid);assert.ok(!(await validateProposal({revision:'0123456789abcdef',commands:[{op:'create',type:'box'}]},'fedcba9876543210')).valid);});
test('Schema handles native conditions and dependent required fields',()=>{assert.equal(matches({x:1},{if:{required:['x']},then:{required:['y']}}),false);assert.equal(matches([1,1],{uniqueItems:true}),false);assert.equal(matches({x:1},{dependentRequired:{x:['y']}}),false);});
test('Winner calculation requires one complete cohort and excludes singles and image trials',()=>{const rows=matrix('start').map(spec=>({benchmarkVersion:1,fixtureHash:spec.caseId,spec:{...spec,seriesId:'base',seriesMode:'start'},proposedValid:spec.variant==='C',toolChoice:{appropriate:true},elapsedMs:10,startedAt:'2026-11-05T19:00:00Z'}));assert.equal(winners(rows).low,'C');const intrusion={...rows[0],spec:{...rows[0].spec,variant:'B',experiment:'single',startImage:true},proposedValid:true};assert.equal(winners([...rows,intrusion]).low,'C');assert.equal(winners(rows.slice(0,53)).low,'B');});
