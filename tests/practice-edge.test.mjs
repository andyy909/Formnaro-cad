import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {validateAgentPracticePlan} from '../src/cad-agent-ui-policy.js';
const {validatePracticePlan}=createRequire(import.meta.url)('../backend/practice-runner.cjs');
const plan=edge=>({version:1,title:'Eine bestimmte Kante wählen',actions:[{kind:'shape',type:'box',as:'body'},edge]});
const edge={kind:'edge',target:'body',sides:['top','front']};

test('both practice boundaries admit a named edge without caller pixels or topology IDs',()=>{
 assert.deepEqual(validatePracticePlan(plan(edge)),plan(edge));
 assert.deepEqual(validateAgentPracticePlan(plan(edge)),plan(edge));
 for(const patch of [{sides:['top','bottom']},{sides:['front','front']},{sides:['top']},{sides:['top','random']},{edgeToken:'forged'},{x:400},{target:'../other'}]){
  assert.throws(()=>validatePracticePlan(plan({...edge,...patch})));
  assert.throws(()=>validateAgentPracticePlan(plan({...edge,...patch})));
 }
});

const edges=[
 {edgeToken:'upper-front',points:[[-20,-15,20],[20,-15,20]]},
 {edgeToken:'lower-front',points:[[-20,-15,0],[20,-15,0]]},
 {edgeToken:'upper-back',points:[[-20,15,20],[20,15,20]]},
 {edgeToken:'left',points:[[-20,-15,0],[-20,-15,20]]}
];
const projectPoint=p=>({x:300+p[0]*3,y:300+p[1]*2-p[2]*3,z:0});
const rect={left:0,top:0,right:600,bottom:600};
test('edge location targets the unique native outer edge through the real screen picker',async()=>{
 const {practiceEdgeTarget}=await import('../src/cad-practice-edge.js');
 const hit=practiceEdgeTarget({edges,sides:['top','front'],projectPoint,rect});
 assert.equal(hit.edgeToken,'upper-front');assert.equal(hit.x,300);assert.equal(hit.y,210);
});
test('edge location rejects ambiguity, invalid geometry and out-of-view targets',async()=>{
 const {practiceEdgeTarget}=await import('../src/cad-practice-edge.js');
 assert.throws(()=>practiceEdgeTarget({edges:[...edges,{...edges[0],edgeToken:'duplicate'}],sides:['top','front'],projectPoint,rect}),/eindeutig/);
 assert.throws(()=>practiceEdgeTarget({edges,sides:['top','bottom'],projectPoint,rect}));
 assert.throws(()=>practiceEdgeTarget({edges,sides:['top','front'],projectPoint,rect:{left:0,top:0,right:100,bottom:100}}),/sichtbar/);
});
test('round and chamfer references name the existing common edge panel and its operation field',async()=>{
 const {lookupToolReference}=await import('../ai/formnaro-tool-reference.mjs');
 for(const kind of ['round','chamfer']){const reference=lookupToolReference({tool:'tool:'+kind},{practice:true}).tool;assert.equal(reference.practiceTarget,'ui:tool:edges');assert.ok(reference.controls.some(c=>c.target==='ui:id:cad-edge-kind'));assert.ok(reference.steps.some(step=>step.includes('auf '+kind+' setzen')));}
 const {AGENT_UI_CONTRACT}=await import('../src/cad-agent-ui-policy.js');const stored=createRequire(import.meta.url)('../ai/OfflineCAD-KI-Kontext.json');const {available,layoutContext,...publishedContract}=stored.agentUI;assert.equal(available,false);assert.equal(typeof layoutContext,'string');assert.deepEqual(publishedContract,AGENT_UI_CONTRACT);
});
