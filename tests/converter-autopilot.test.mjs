
import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticOverview,automaticRegions,createConverterAutopilot} from '../src/cad-converter-autopilot.js';

function fixture(){
 const faces=[[0,1,2],[1,3,2],[4,5,6]],vertices=[[0,0,0],[2,0,0],[0,2,0],[2,2,0],[8,0,0],[9,0,0],[8,1,0]];
 return {revision:'r1',options:{mode:'auto',unit:1,tolerance:.15,repair:true,fallback:true},selection:[],analysis:{
  modified:false,state:{labels:[10,11,12],protected_faces:[]},bounds_mm:[[0,0,0],[9,2,0]],vertices,faces,
  regions:faces.map((_,i)=>({edit_id:10+i,type:'PLANE',faces:[i],protected_faces:0,reason:'local-only data'}))
 }};
}
const step=(faces=100,deviation=.03,input=3)=>({report:{valid:true,solids:1,output_faces:faces,input_triangles:input,deviation:{sampled_max_mm:deviation}}});
const plan=(args,commands=[])=>({revision:args.scene.revision,commands});
const type=(id=10)=>({op:'type',regions:[id],type:'PLANE'});
function harness(){
 let source=fixture(),convert=()=>step(),reply=args=>plan(args),analyse=(_options,state)=>({...source.analysis,state:state??source.analysis.state,modified:!!state});
 const calls=[],local=[],cancelled=[],baselines=[];
 const ai=createConverterAutopilot({
  desktop:{getAISettings:async()=>({model:'shared',protocol:'responses',reasoningEffort:'high'}),
   generateAI:async args=>{calls.push(args);return reply(args);},cancelAI:async value=>cancelled.push(value)},
  snapshot:()=>source,onBaseline:value=>baselines.push(value),refinementMs:250,
  analyse:(...args)=>({run:async()=>{local.push(['analyse',...args]);return analyse(...args);},cancel:()=>cancelled.push('analyse')}),
  convert:(options)=>({run:async()=>{local.push(['convert',options]);return convert(options);},cancel:()=>cancelled.push('convert')})
 });
 return {ai,local,calls,cancelled,baselines,source,setSource:v=>{source=v;},setConvert:v=>{convert=v;},setReply:v=>{reply=v;},setAnalyse:v=>{analyse=v;}};
}

test('Measured region payload excludes original geometry and prose',()=>{
 const f=fixture(),regions=automaticRegions(f.analysis,f.analysis.regions);
 assert.equal(automaticOverview(f.analysis).triangles,3);
 assert.equal(regions[0].areaMM2,2);
 assert.deepEqual(regions[0].centroidMM,[2/3,2/3,0]);
 assert(!/vertices|faces|local-only/.test(JSON.stringify(regions)));
});

test('Direct conversion runs above the analysis limit with no analysis or API request',async()=>{
 const h=harness();
 h.setSource({...h.source,analysis:null});
 h.setConvert(()=>step(1180,.078,20264));
 const r=await h.ai.run();
 assert.equal(r.result.report.solids,1);
 assert.equal(r.outcome,'local');
 assert.deepEqual(h.local.map(x=>x[0]),['convert']);
 assert.equal(h.calls.length,0);
});

test('Selected correction sends only targets and real edge neighbours after preserving the baseline',async()=>{
 const h=harness(),baseline=step(),improved=step(90,.03);
 h.source.selection=[10];h.setConvert(options=>options.region_edits?improved:baseline);
 h.setReply(args=>{assert.equal(h.baselines[0],baseline);return plan(args,[type()]);});
 const r=await h.ai.run();
 assert.equal(r.result,improved);
 assert.equal(r.outcome,'improved');
 assert.deepEqual(h.calls[0].scene.targets,[10]);
 assert.deepEqual(h.calls[0].scene.regions.map(r=>r.id),[10,11]);
 assert.deepEqual(h.local.map(x=>x[0]),['convert','analyse','convert']);
 assert.equal(h.local[2][1].tolerance,h.local[0][1].tolerance);
});

test('Measured preview deviation can locate a region on the original without user marking',async()=>{
 const h=harness(),baseline=step(100,.1);
 const bytes=new Uint8Array(134),view=new DataView(bytes.buffer);
 view.setUint32(80,1,true);
 h.source.analysis.faces[2].forEach((v,i)=>h.source.analysis.vertices[v].forEach((n,k)=>view.setFloat32(96+i*12+k*4,n,true)));
 baseline.artifacts={preview:bytes};baseline.deviation={face_indices:[0],distances_mm:[.1]};
 h.setConvert(()=>baseline);
 await h.ai.run();
 assert.deepEqual(h.calls[0].scene.targets,[12]);
 assert.equal(h.calls.length,1);
});

test('Local fitting failure only revisits the same target and retains a valid baseline',async()=>{
 const h=harness(),baseline=step();
 h.source.selection=[10];h.setReply(args=>plan(args,[type()]));
 h.setConvert(options=>{if(options.region_edits)throw Error('Ungültiger Fit am gemeinsamen Eckpunkt');return baseline;});
 const r=await h.ai.run();
 assert.equal(r.result,baseline);assert.equal(r.outcome,'retained');
 assert.equal(h.calls.length,2);
 assert.match(h.calls[1].scene.feedback.error,/Eckpunkt/);
 assert.deepEqual(h.calls.map(c=>c.scene.targets),[[10],[10]]);
});

test('Worse geometry and out-of-scope edits never replace the local result',async()=>{
 for(const invalid of [false,true]){
  const h=harness(),baseline=step();
  h.source.selection=[10];h.setReply(args=>plan(args,[type(invalid?12:10)]));
  h.setConvert(options=>options.region_edits?step(70,.04):baseline);
  assert.equal((await h.ai.run()).result,baseline);
  if(invalid)assert.equal(h.local.length,1);
 }
});

test('File or topology errors stay local even with an explicit selection',async()=>{
 const h=harness();h.source.selection=[10];
 h.setConvert(()=>{throw Error('STEP-Ergebnis überschreitet das 30-MB-Importlimit.');});
 await assert.rejects(h.ai.run(),/30-MB/);
 assert.equal(h.calls.length,0);
});

test('Deadline cancels the request and returns the original checked candidate',async()=>{
 const h=harness(),baseline=step();h.source.selection=[10];h.setConvert(()=>baseline);
 h.setReply(()=>new Promise(()=>{}));
 const r=await h.ai.run();
 assert.equal(r.result,baseline);assert.equal(r.outcome,'retained');
 assert.match(r.detail,/Zeitbudget/);
 assert.equal(h.cancelled[0].requestId,h.calls[0].requestId);
});

test('User abort and revision changes prevent delayed provider replies from reaching local tools',async()=>{
 for(const action of ['cancel','stale']){
  const h=harness();h.source.selection=[10];let resolve;
  h.setReply(()=>new Promise(r=>{resolve=r;}));
  const pending=h.ai.run();
  await new Promise(r=>setImmediate(r));
  if(action==='cancel')h.ai.cancel();else h.setSource({...h.source,revision:'changed'});
  resolve(plan(h.calls[0],[type()]));
  await assert.rejects(pending,/abgebrochen|geändert/);
  assert.deepEqual(h.local.map(x=>x[0]),['convert']);
 }
});
