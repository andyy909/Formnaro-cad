import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Matrix4,Vector3} from 'three';
import {cadLinkedPatternPlacements,validateCadLinkedPattern,materializeCadLinkedPattern,cadLinkedPatternProblems} from '../src/cad-linked-pattern-data.js';

const base={version:1,id:'pattern',sourceId:'part',kind:'line',count:4,step:[10,0,0],excluded:[],instances:[{index:1,id:'one'},{index:2,id:'two'},{index:3,id:'three'}]};
const identity=new Matrix4().toArray();
const at=(m,p=[0,0,0])=>new Vector3(...p).applyMatrix4(new Matrix4().fromArray(m)).toArray();
const near=(actual,expected)=>actual.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-9,`${actual} != ${expected}`));

test('linear and grid layouts preserve source affine placement and identities',()=>{
 const source=new Matrix4().makeTranslation(3,4,5).multiply(new Matrix4().makeScale(2,1,1)).toArray();
 const result=cadLinkedPatternPlacements(base,source,[3,4,5]);
 assert.deepEqual(result.map(x=>x.id),['one','two','three']);near(at(result[2].transform),[33,4,5]);near(at(result[2].transform,[1,0,0]),[35,4,5]);
 const grid={...base,kind:'grid',columns:2,rowStep:[0,7,0]};
 const g=cadLinkedPatternPlacements(grid,identity,[0,0,0]);near(at(g[1].transform),[0,7,0]);near(at(g[2].transform),[10,7,0]);
});
test('full circle has no duplicate endpoint; exclusions do not renumber IDs',()=>{
 const p={version:1,id:'p',sourceId:'s',kind:'circle',count:4,center:[0,0,0],radius:10,startAngle:0,angle:360,rotateCopies:false,excluded:[2],instances:[{index:1,id:'a'},{index:2,id:'b'},{index:3,id:'c'}]};
 const r=cadLinkedPatternPlacements(p,new Matrix4().makeTranslation(10,0,0).toArray(),[10,0,0]);
 assert.deepEqual(r.map(x=>x.id),['a','c']);near(at(r[0].transform),[0,10,0]);near(at(r[1].transform),[0,-10,0]);
 assert.throws(()=>cadLinkedPatternPlacements(p,identity,[0,0,0]),/ersten Kreisposition/);
});
test('mirror reflects position and orientation about explicitly selected plane',()=>{
 const p={version:1,id:'p',sourceId:'s',kind:'mirror',count:2,mirrorAxis:'x',mirrorOffset:3,excluded:[],instances:[{index:1,id:'copy'}]};
 const r=cadLinkedPatternPlacements(p,new Matrix4().makeTranslation(1,0,0).toArray(),[1,0,0]);near(at(r[0].transform),[5,0,0]);near(at(r[0].transform,[1,0,0]),[4,0,0]);
});
test('rejects duplicate identities, source suppression and malformed data',()=>{
 assert.throws(()=>validateCadLinkedPattern({...base,excluded:[0]}));
 assert.throws(()=>validateCadLinkedPattern({...base,instances:[{index:1,id:'part'}]}));
 assert.throws(()=>validateCadLinkedPattern({...base,step:[NaN,0,0]}));
 assert.throws(()=>validateCadLinkedPattern({...base,count:201}));
});
test('updates a changed source on an independent copy and detects modified instances',()=>{
 const source={id:'part',kind:'cad',source:'native',recipe:{type:'box',size:[2,2,2]},transform:identity,stats:{bounds:{min:[-1,-1,-1],max:[1,1,1]}}};
 const project={nodes:[source]};const first=materializeCadLinkedPattern(project,base);
 assert.equal(project.nodes.length,1);assert.equal(first.project.nodes.length,4);assert.deepEqual(cadLinkedPatternProblems(first.project,first.pattern),[]);
 const changed=structuredClone(first.project);changed.nodes[0].recipe.size[0]=3;
 assert.equal(cadLinkedPatternProblems(changed,first.pattern)[0].code,'PATTERN_UPDATE_REQUIRED');
 const second=materializeCadLinkedPattern(changed,first.pattern);assert.equal(second.project.nodes[1].recipe.size[0],3);assert.deepEqual(cadLinkedPatternProblems(second.project,second.pattern),[]);
 changed.nodes[1].recipe.size[0]=6;assert.throws(()=>materializeCadLinkedPattern(changed,first.pattern),/verändert/);
});
test('refuses to overwrite an instance with an outside reference',()=>{
 const source={id:'part',kind:'cad',source:'native',recipe:{type:'box'},transform:identity,stats:{bounds:{min:[-1,-1,-1],max:[1,1,1]}}};
 const first=materializeCadLinkedPattern({nodes:[source]},base);first.project.joints={reference:'one'};
 assert.throws(()=>materializeCadLinkedPattern(first.project,first.pattern),/externen Bezug/);
});
test('changing count retains existing identities and removes only old instances',()=>{
 const source={id:'part',kind:'cad',source:'native',recipe:{type:'box'},transform:identity,stats:{bounds:{min:[-1,-1,-1],max:[1,1,1]}}};
 const first=materializeCadLinkedPattern({nodes:[source]},base);
 const smaller={...first.pattern,count:2,instances:first.pattern.instances.filter(v=>v.index<2),excluded:[]};
 const second=materializeCadLinkedPattern(first.project,smaller,{previous:first.pattern});
 assert.deepEqual(second.pattern.instances,[{index:1,id:'one'}]);assert.deepEqual(second.project.nodes.map(n=>n.id),['part','one']);
 const bigger={...second.pattern,count:3};const third=materializeCadLinkedPattern(second.project,bigger,{previous:second.pattern,newId:()=> 'new-two'});
 assert.deepEqual(third.pattern.instances,[{index:1,id:'one'},{index:2,id:'new-two'}]);
 assert.deepEqual(cadLinkedPatternProblems(third.project,third.pattern),[]);
});
test('circle movement refuses referenced or locked source without modifying it',()=>{
 const source={id:'part',kind:'cad',source:'native',recipe:{type:'box'},transform:identity,stats:{bounds:{min:[-1,-1,-1],max:[1,1,1]}}};
 const p={version:1,id:'p',sourceId:'part',kind:'circle',count:2,center:[0,0,0],radius:10,startAngle:0,angle:180,rotateCopies:false,excluded:[],instances:[]};
 for(const field of ['projectParameters','joints','drawings','contourLinks','workplane']){
  const project={nodes:[source],[field]:{target:{rootId:'part'}}},before=structuredClone(project);assert.throws(()=>materializeCadLinkedPattern(project,p),/externen Bezug/);assert.deepEqual(project,before);
 }
 const locked={nodes:[{...source,locked:true}]};assert.throws(()=>materializeCadLinkedPattern(locked,p),/entsperrte/);
});
test('existing project parameters and variants drive count and distance with stale detection',()=>{
 const source={id:'part',kind:'cad',source:'native',recipe:{type:'box'},transform:identity,stats:{bounds:{min:[-1,-1,-1],max:[1,1,1]}}};
 const project={nodes:[source],projectParameters:{version:1,parameters:[{id:'count',name:'Anzahl',value:3},{id:'distance',name:'Abstand',value:20}],bindings:[],variants:[{id:'v',name:'Variante',values:[{parameterId:'count',value:4},{parameterId:'distance',value:30}],states:[]}],activeVariantId:null}};
 const pattern={...base,instances:[],bindings:[{field:'count',parameterId:'count'},{field:'step.0',parameterId:'distance'}]};let index=0;
 const first=materializeCadLinkedPattern(project,pattern,{newId:()=>`copy-${++index}`});assert.equal(first.pattern.count,3);assert.equal(first.pattern.step[0],20);assert.deepEqual(cadLinkedPatternProblems(first.project,first.pattern),[]);
 const changed=structuredClone(first.project);changed.projectParameters.activeVariantId='v';assert.ok(cadLinkedPatternProblems(changed,first.pattern).some(p=>p.code==='PATTERN_UPDATE_REQUIRED'));
 const second=materializeCadLinkedPattern(changed,first.pattern,{previous:first.pattern,newId:()=>`copy-${++index}`});assert.equal(second.pattern.count,4);assert.equal(second.pattern.step[0],30);assert.deepEqual(cadLinkedPatternProblems(second.project,second.pattern),[]);
 changed.projectParameters.variants[0].values[0].value=3.5;assert.throws(()=>materializeCadLinkedPattern(changed,first.pattern,{previous:first.pattern}),/Positionen/);
 delete changed.projectParameters;assert.ok(cadLinkedPatternProblems(changed,first.pattern).some(p=>p.code==='PATTERN_PARAMETER_LOST'));
});
