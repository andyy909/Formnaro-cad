const test=require('node:test');
const assert=require('node:assert/strict');
const {validatePracticeFiles}=require('../backend/practice-files.cjs');
const {lockPracticeContext}=require('../backend/ai-practice-context.cjs');

const photo={name:'Vorlage.png',kind:'photo',mimeType:'image/png',base64:'cGhvdG8='};
const mesh={name:'Bauteil.stl',kind:'stl',mimeType:'model/stl',base64:'cHJpdmF0ZS1zdGw='};

test('practice accepts bounded file payloads and exposes only stable file descriptors to the planner',()=>{
 assert.deepEqual(validatePracticeFiles(),[]);
 assert.deepEqual(validatePracticeFiles([photo,mesh]),[photo,mesh]);
 const context=lockPracticeContext({practiceFiles:[photo,mesh]});
 assert.deepEqual(context.practiceFiles,[
  {name:'Vorlage.png',kind:'photo',target:'ui:id:practice-file-1'},
  {name:'Bauteil.stl',kind:'stl',target:'ui:id:practice-file-2'}
 ]);
 assert(!JSON.stringify(context).includes(mesh.base64));
});

test('practice rejects paths, malformed payloads and too many files before opening a window',()=>{
 for(const name of ['../Bild.png','C:\\Bild.png','dir/Bild.png','Bild\n.png'])
  assert.throws(()=>validatePracticeFiles([{...photo,name}]),/Name/);
 assert.throws(()=>validatePracticeFiles([{...mesh,path:'local.stl'}]),/Name/);
 assert.throws(()=>validatePracticeFiles([{...mesh,base64:'A==='}]),/beschädigt/);
 assert.throws(()=>validatePracticeFiles([{...mesh,mimeType:'application/octet-stream'}]),/STL/);
 assert.throws(()=>validatePracticeFiles([mesh,mesh]),/eine STL/);
 assert.throws(()=>validatePracticeFiles(Array(5).fill(photo)),/vier/);
});

test('only valid local photo pixel evidence is included in the provider file descriptor',()=>{
 const points=[[39,39],[240,39],[240,140],[39,140]];
 const evidence={originalPixels:[320,240],outerEdgeCandidate:points,private:'not sent'};
 const files=[{...photo,photoEvidence:evidence},{...mesh,photoEvidence:evidence},
  {...photo,photoEvidence:{...evidence,outerEdgeCandidate:[[0,0],[320,0],[320,241]]}}];
 const context=lockPracticeContext({practiceFiles:files});
 assert.deepEqual(context.practiceFiles.map(file=>file.photoEvidence),[
  {originalPixels:[320,240],outerEdgeCandidate:points},undefined,{originalPixels:[320,240]}
 ]);
 assert.deepEqual(lockPracticeContext(context).practiceFiles,context.practiceFiles);
 assert(!JSON.stringify(context).includes('not sent'));
});
test('silhouette candidates keep only bounded original-pixel outlines and openings',()=>{
 const outline=[[10,10],[50,10],[50,40],[10,40]],opening=[[20,20],[25,20],[25,25],[20,25]];
 const files=[{...photo,photoEvidence:{originalPixels:[60,50],silhouetteCandidate:{outline,openings:[opening],scale:100}}},
  {...photo,photoEvidence:{originalPixels:[60,50],silhouetteCandidate:{outline,openings:[[[10,0],[61,0],[10,10]]]}}}];
 const {practiceFiles}=lockPracticeContext({practiceFiles:files});
 assert.deepEqual(practiceFiles.map(file=>file.photoEvidence),[
  {originalPixels:[60,50],silhouetteCandidate:{outline,openings:[opening]}},{originalPixels:[60,50]}
 ]);
});

test('multiple photos surface the native reconstruction route ahead of general shape actions',()=>{
 const {practiceSystem}=require('../backend/ai-practice-prompt.cjs');
 const context={practiceFromProject:true,practiceObjects:[],practiceFiles:[photo,{...photo,name:'Seite.png'},{...photo,name:'Oben.png'}]};
 const multi=practiceSystem(lockPracticeContext(context));
 assert.match(multi,/local project copy and no selected body/);
 assert.doesNotMatch(multi,/practice window starts empty/);
 assert.doesNotMatch(multi,/generic scene object and selection lists are intentionally empty/);
 const selected=practiceSystem({practiceFromProject:true,practiceObjects:[{name:'Halter',kind:'cad'}]});
 assert.match(selected,/generic scene object and selection lists are intentionally empty for privacy/);
 assert.match(selected,/Use practiceObjects as the selected CAD bodies already available/);
 assert(multi.indexOf('Technische Ansichten verbinden')>=0);
 assert(multi.indexOf('Technische Ansichten verbinden')<multi.indexOf('Allowed actions'));
 assert.match(multi,/already calibrated views, open photo-project-open then photo-project-multiview directly/);
 assert.match(multi,/In photo-view choose front, right or top/);
 assert.match(multi,/photo-\* controls named here are exact ui:id: targets/);
 assert.match(multi,/photo-set-value-x\/y\/z, photo-set-tolerance-x\/y\/z/);
 assert.doesNotMatch(multi,/converter-run/);
 const saved=practiceSystem({practiceFiles:context.practiceFiles.map((file,index)=>({
  ...file,savedPhoto:{name:['Vorn','Seite','Oben'][index],view:['front','right','top'][index]}
 }))});
 assert.match(saved,/Every attached photo already has a stored reference in the copy/);
 assert.match(saved,/Keep its existing calibration, outlines and openings/);
 assert.match(saved,/Start with photo-project-open and then photo-project-multiview/);
 assert.doesNotMatch(saved,/For raw images, first calibrate each image/);
 const single=practiceSystem({practiceFiles:[photo,mesh]});
 assert.doesNotMatch(single,/Technische Ansichten verbinden/);
 assert.match(single,/practice window starts empty/);
 assert.match(single,/photo-mode-reference/);
 assert.match(single,/For frontal calibration only, click photo-mode-reference/);
 assert.match(single,/enter exactly four corners with photo-points clockwise from top-left, then use photo-rectify before tracing contours/);
 assert.match(single,/ask for one without suggesting numeric dimensions/);
 assert.match(single,/converter-run/);
 const stl=practiceSystem({practiceFiles:[mesh]});
 assert.doesNotMatch(stl,/photo-mode-reference/);
 assert.match(stl,/practiceFiles target once to open and analyse it directly/);
 assert.match(stl,/converter-run, then converter-import for the CAD preview, converter-apply and stl-close/);
});

test('a photo selector mismatch reports the options of that actual control',async()=>{
 const {practiceOptionIndex}=await import('../src/cad-practice-controls.js');
 const node={tagName:'SELECT',id:'photo-view',options:[
  {value:'front',textContent:'Vorn · X/Z'},{value:'right',textContent:'Rechts · Y/Z'},
  {value:'top',textContent:'Oben · X/Y'},{value:'hidden',textContent:'Versteckt',disabled:true}
 ]};
 assert.equal(practiceOptionIndex(node,'front'),0);
 assert.equal(practiceOptionIndex(node,'Rechts · Y/Z'),1);
 assert.equal(practiceOptionIndex(node,'Vorderansicht · X/Z'),0);
 assert.equal(practiceOptionIndex(node,'Seitenansicht · Y/Z'),1);
 assert.equal(practiceOptionIndex(node,'Draufsicht · X/Y'),2);
 assert.throws(()=>practiceOptionIndex({...node,id:'other-select'},'Vorderansicht · X/Z'),/fehlt oder ist mehrdeutig/);
 assert.throws(()=>practiceOptionIndex({...node,options:[...node.options,node.options[0]]},'Vorderansicht · X/Z'),/fehlt oder ist mehrdeutig/);
 assert.throws(()=>practiceOptionIndex(node,'Vorderseite · X/Z'),error=>{
  assert.match(error.message,/photo-view.*front \(Vorn · X\/Z\).*right.*top/);
  assert.doesNotMatch(error.message,/hidden|Versteckt/);
  return true;
 });
});

test('photo point batches use bounded original-pixel coordinates and no arbitrary controls',async()=>{
 const {validatePracticePlan}=require('../backend/practice-runner.cjs');
 const {validateAgentPracticePlan}=await import('../src/cad-agent-ui-policy.js');
 const plan=action=>({version:1,title:'Bildkontur',actions:[action]});
 const action={kind:'photo-points',points:[[100,30],[450,30.25]]};
 for(const validate of [validatePracticePlan,validateAgentPracticePlan]){
  assert.deepEqual(validate(plan(action)),plan(action));
  for(const invalid of [{...action,target:'ui:id:external'},{...action,points:[]},
   {...action,points:Array(17).fill([0,0])},{...action,points:[[-1,0]]},{...action,points:[[0,Infinity]]},
   {...action,points:[[16_000_001,0]]},{...action,points:[[0,0.0000001]]}])assert.throws(()=>validate(plan(invalid)),/Fotopunkte/);
 }
});

test('a mode button mistaken for a select gets actionable feedback before playback',()=>{
 const {validatePracticePlan}=require('../backend/practice-runner.cjs');
 const button={kind:'ui',action:'click',target:'ui:id:photo-mode-outline'};
 const plan={version:1,title:'Bildkontur',actions:[button,{...button,action:'choose'}]};
 assert.throws(()=>validatePracticePlan(plan),/Übungsschritt 2: choose benötigt value.*click ohne value/);
 assert.doesNotThrow(()=>validatePracticePlan({...plan,actions:[button]}));
});

test('both plan validators name an overlong dialog entry without changing its limit',async()=>{
 const {validatePracticePlan}=require('../backend/practice-runner.cjs');
 const {validateAgentPracticePlan}=await import('../src/cad-agent-ui-policy.js');
 const set=value=>({kind:'ui',action:'set',target:'ui:id:photo-set-assumptions',value});
 const plan=value=>({version:1,title:'Ansichten verbinden',actions:[
  {kind:'ui',action:'click',target:'ui:id:photo-set-step-1'},set(value)
 ]});
 for(const validate of [validatePracticePlan,validateAgentPracticePlan]){
  assert.throws(()=>validate(plan('a'.repeat(201))),/Übungsschritt 2: value darf höchstens 200 Zeichen haben \(erhalten: 201\)/);
  assert.deepEqual(validate(plan('a'.repeat(200))),plan('a'.repeat(200)));
 }
});

test('the practice prompt only receives bounded sketch diagnostics',()=>{
 const gap={role:'outer',from:[60,0],to:[60,40],distance:40,source:'private'};
 const measure={name:'breite',target:'ui:id:sketch-variable-value-1',formula:'private'};
 const context=lockPracticeContext({practiceSketch:{gapCount:1,gaps:[gap,{...gap,to:[Infinity,0]}],
  measures:[measure,{name:'tiefe',target:'ui:id:unrelated'}],sketch:'private'}});
 assert.deepEqual(context.practiceSketch,{
  gapCount:1,gaps:[{role:'outer',from:[60,0],to:[60,40],distance:40}],
  measures:[{name:'breite',target:'ui:id:sketch-variable-value-1'}]
 });
});

test('motion context limits references to real selected child aliases',()=>{
 const joint={child:'existing-1',name:'Spindel',kind:'revolute',value:0,limits:{min:0,max:720},id:'private'};
 const screw={rotary:'existing-1',linear:'existing-2',lead:4,direction:1,id:'private'};
 const context=lockPracticeContext({practiceObjects:[{name:'Spindel'}],
  practiceMotion:{joints:[joint,{...joint,child:'existing-2'}],screws:[screw]}});
 assert.deepEqual(context.practiceMotion,{joints:[{
  child:'existing-1',name:'Spindel',kind:'revolute',value:0,limits:{min:0,max:720}
 }],screws:[{rotary:'existing-1',linear:null,lead:4,direction:1}]});
});
