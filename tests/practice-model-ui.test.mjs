import test from 'node:test';
import assert from 'node:assert/strict';
import {createPracticeModelUI} from '../src/cad-practice-model-ui.js';

test('fresh model roots visibly use Zur Mitte before exact requested offsets',async()=>{
 for(const position of [undefined,[0,0,4],[20,-5,6]]){
  const events=[],fields=new Map(),snapshot={nodes:[],workplane:{origin:[0,0,0],orientation:[0,0,0,1]}};
  const field=id=>{if(!fields.has(id))fields.set(id,{value:'0'});return fields.get(id);};
  const ui=createPracticeModelUI({controller:{readSnapshot:()=>snapshot,revision:()=>''},access:{},document:{getElementById:id=>fields.get(id)},checkpoint:async()=>{},settled:async()=>{},waitFor:async p=>assert(p()),input:async spec=>{
   events.push(spec);
   if(spec.target==='shape:box'){
    snapshot.nodes.push({id:'fresh',kind:'cad',stats:{bounds:{min:[0,0,0],max:[20,20,20]}},transform:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]});
    for(const [id,value]of Object.entries({'size-0':20,'size-1':20,'size-2':20,'pos-0':13,'pos-1':27,'pos-2':10,'rot-0':0,'rot-1':0,'rot-2':0}))field(id).value=String(value);
   }else if(spec.target==='ui:tool:center'){
    field('pos-0').value='0';field('pos-1').value='0';field('pos-2').value=String(Number(field('size-2').value)/2);
   }else if(spec.action==='set'){
    const id=spec.target.slice('ui:id:'.length);field(id).value=spec.value;
    if(id.startsWith('size-'))snapshot.nodes[0].stats.bounds.max[Number(id.at(-1))]=Number(spec.value);
   }
  }});
  await ui.run({commands:[{op:'create',type:'box',size:[60,40,8],...(position?{pos:position}:{}),rot:[0,0,30]}]});
  assert.equal(events.filter(e=>e.target==='ui:tool:center').length,1);
  if(!position||position[0]===0)assert(!events.some(e=>e.target==='ui:id:pos-0'||e.target==='ui:id:pos-1'));
  assert.deepEqual([0,1,2].map(k=>Number(field('pos-'+k).value)),position??[0,0,4]);
  assert.equal(field('rot-2').value,'30');
 }
});

function harness({aliases=new Map(),overshoot=7.5,ignoreNumber=false,ignoreCommit=false}={}){
 const snapshot={nodes:[{id:'body',name:'Teil'}],joints:{joints:[{id:'drive',childId:'body',value:0}],gears:[]}};
 let rev=0,commits=0;const events=[],previews=[];
 const fields=new Map([['joint-panel',{getClientRects:()=>[{}]}],['joint-value-drive',{value:'0'}],['joint-slider-drive',{value:'0'}],['joint-apply',{disabled:true}]]);
 const controller={readSnapshot:()=>structuredClone(snapshot),revision:()=>String(rev)};
 const ui=createPracticeModelUI({aliases,controller,document:{getElementById:id=>fields.get(id)},checkpoint:async()=>{},settled:async()=>{},waitFor:async predicate=>{assert(predicate(),'target state was not confirmed');},
  input:async spec=>{events.push(spec);const id=spec.target.slice('ui:id:'.length);
   if(spec.action==='drag'){fields.get('joint-value-drive').value=String(Number(spec.value)+overshoot);fields.get('joint-apply').disabled=false;}
   if(spec.action==='set'&&id==='joint-value-drive'&&!ignoreNumber)fields.get(id).value=spec.value;
   if(id==='joint-apply'){commits++;if(!ignoreCommit)snapshot.joints.joints[0].value=Number(fields.get('joint-value-drive').value);rev++;fields.get(id).disabled=true;}
   if(id==='joint-cancel')fields.delete('joint-panel');
  },access:{preview:async request=>{previews.push(request);return {previewId:'p',revision:String(rev),aliases:{next:'body'}};},apply:async()=>{rev++;},discard:()=>{}}});
 return {ui,events,previews,snapshot,get commits(){return commits;}};
}

test('hidden command fallbacks reject the entire batch before any visible or API mutation',async()=>{
 for(const commands of [[{op:'tool',tool:'shell',target:'$rohling'}],[{op:'tool',tool:'copy',as:'next',target:'body'}],[{op:'create',type:'box',as:'fresh',mirror:[1,1,1]},{op:'duplicate',target:'$fresh'}],[{op:'create',type:'box',as:'fresh'},{op:'python',code:'hidden'}]]){const h=harness({aliases:new Map([['rohling','body']])});await assert.rejects(h.ui.run({commands}),/kein direkter/);assert.equal(h.previews.length,0);assert.equal(h.events.length,0);}
});

test('motion corrects pixel rounding visibly and confirms the persisted exact angle',async()=>{
 const h=harness();const r=await h.ui.run({commands:[{op:'joint',action:'move',values:[{jointId:'drive',value:90}]}]});
 assert.equal(h.snapshot.joints.joints[0].value,90);assert.equal(r.jointValues[0].value,90);
 assert(h.events.some(e=>e.action==='drag'));assert(h.events.some(e=>e.action==='set'&&e.target==='ui:id:joint-value-drive'&&e.value==='90'));
 assert.equal(r.motionTargets[0].expected,90);assert.equal(r.motionTargets[0].actual,90);assert.equal(r.motionTargets[0].persisted,true);
});

test('an uncorrectable preview never commits a wrong target angle',async()=>{
 const h=harness({ignoreNumber:true});await assert.rejects(h.ui.run({commands:[{op:'joint',action:'move',values:[{jointId:'drive',value:90}]}]}));assert.equal(h.commits,0);
});

test('a silently ignored motion commit cannot produce a successful exercise result',async()=>{
 const h=harness({overshoot:0,ignoreCommit:true});await assert.rejects(h.ui.run({commands:[{op:'joint',action:'move',values:[{jointId:'drive',value:90}]}]}));
});
