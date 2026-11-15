import test from 'node:test';
import assert from 'node:assert/strict';
import {cadProjectRevision,cadProjectSnapshot,createCadProject} from '../src/cad-project.js';
import {captureCadPracticeCopy,inspectCadPracticeResult} from '../src/cad-practice-project-copy.js';

function fixture() {
  const node=id=>({
    id,name:id,kind:'referenceMesh',transform:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],
    mesh:{verts:[0,0,0,1,0,0,0,1,0],triangles:[0,1,2]}
  });
  const project=cadProjectSnapshot({...createCadProject(),nodes:[node('chosen'),node('unrelated')]});
  return {project,selection:[{rootId:'chosen',path:[]}]};
}

test('the exercise result must match its reported revision and preserve unrelated and locked objects',()=>{
  const base=fixture();
  const result=structuredClone(base.project);
  result.nodes[0].transform[12]=10;
  const inspect=()=>inspectCadPracticeResult(base,result,cadProjectRevision(result));
  assert.deepEqual(inspect().parts,[{id:'chosen',name:'chosen',status:'changed'}]);
  assert.throws(()=>inspectCadPracticeResult(base,result,cadProjectRevision(base.project)),/anderen Modellstand/);
  result.nodes[1].transform[12]=4;
  assert.throws(inspect,/unbeteiligtes oder gesperrtes Teil verändert: unrelated/);
  result.nodes[1].transform[12]=0;
  base.project.nodes[0].locked=true;
  assert.throws(inspect,/unbeteiligtes oder gesperrtes Teil verändert: chosen/);
});

test('reopening the same model invalidates an exercise approval even at the same revision',async()=>{
  const base=fixture();
  let scope='first';
  const controller={
    projectScope:()=>scope,revision:()=>cadProjectRevision(base.project),
    transactions:{materialize:async()=>structuredClone(base.project)}
  };
  const copy=await captureCadPracticeCopy(controller,()=>base.selection);
  copy.assertBase();
  scope='reopened';
  assert.throws(copy.assertBase,{code:'STALE_REVISION'});
});

test('a copied exercise exposes measured geometry only for selected roots in the current scene',async()=>{
  const base=fixture(),revision=cadProjectRevision(base.project);
  const controller={projectScope:()=>1,revision:()=>revision,transactions:{materialize:async()=>base.project}};
  const selected={id:'chosen',target:base.selection[0],worldBounds:{size:[548,16,16],center:[0,26,487]}};
  const other={id:'unrelated',target:{rootId:'unrelated',path:[]},worldBounds:{size:[9,8,7],center:[6,5,4]}};
  const scene={revision,objects:[selected,other]};
  const capture=()=>captureCadPracticeCopy(controller,()=>base.selection,{getScene:()=>scene});
  const {objects}=await capture();
  assert.deepEqual(objects.map(({alias,facts})=>({alias,size:facts.size,center:facts.center})),[
    {alias:'existing-1',size:[548,16,16],center:[0,26,487]}
  ]);
  scene.revision='an older revision';
  assert.equal((await capture()).objects[0].facts,undefined);
});

test('a new sketch draft has no editable parent root and invalidates on draft changes',async()=>{
 const base=fixture();
 const controller={
  projectScope:()=>1,revision:()=>cadProjectRevision(base.project),
  transactions:{materialize:async()=>structuredClone(base.project)}
 };
 let current=true;
 const draft={data:{sketch:{kind:'profile',loops:[]}},feedback:{gapCount:1},assertCurrent(){
  if(!current)throw Object.assign(Error('Draft changed'),{code:'STALE_REVISION'});
 }};
 const copy=await captureCadPracticeCopy(controller,()=>base.selection,{draft});
 assert.deepEqual(copy.projectCopy.selection,[]);
 assert.deepEqual(copy.objects,[]);
 assert.deepEqual(copy.sketchFeedback,{gapCount:1});
 assert.deepEqual(copy.projectCopy.sketchDraft,draft.data);
 assert.notEqual(copy.projectCopy.sketchDraft,draft.data);
 current=false;
 assert.throws(copy.assertBase,{code:'STALE_REVISION'});
});

test('a copied screw drive exposes the selected joint aliases and leaves native identities local',async()=>{
 const base=fixture(),revision=cadProjectRevision(base.project);
 base.project.joints={
  joints:[
   {id:'private-rotary',childId:'chosen',name:'Spindel',kind:'revolute',value:0,limits:{min:0,max:720}},
   {id:'private-linear',childId:'unrelated',name:'Schlitten',kind:'prismatic',value:0,limits:{min:0,max:8}}
  ],
  drives:[{kind:'screw',rotary:'private-rotary',linear:'private-linear',lead:4,direction:1}]
 };
 const controller={
  projectScope:()=>1,revision:()=>revision,
  transactions:{materialize:async()=>structuredClone(base.project)}
 };
 const getSelection=()=>base.selection;
 const partial=await captureCadPracticeCopy(controller,getSelection);
 assert.deepEqual(partial.motion.screws,[{rotary:'existing-1',linear:null,lead:4,direction:1}]);
 base.selection.push({rootId:'unrelated',path:[]});
 const full=await captureCadPracticeCopy(controller,getSelection);
 assert.deepEqual(full.motion.screws,[{rotary:'existing-1',linear:'existing-2',lead:4,direction:1}]);
 assert.equal(full.motion.joints[1].kind,'prismatic');
 assert(!JSON.stringify(full.motion).includes('private-'));
 assert.equal(full.projectCopy.project.joints.joints[0].id,'private-rotary');
});
