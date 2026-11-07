const {app}=require('electron'),path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const {evaluate}=require('../backend/ai-diagnostic-evaluate.cjs'),{cases}=require('../backend/ai-diagnostic-cases.cjs');
const base=path.resolve(__dirname,'..'),out=path.join(base,'work/diagnostic-native');fs.mkdirSync(out,{recursive:true});app.setPath('userData',path.join(out,'host'));
app.whenReady().then(async()=>{const reports=[];let child;try{child=require('../backend/ai-diagnostic-child.cjs').openDiagnosticChild({app:{isPackaged:false,getAppPath:()=>base},directory:path.join(out,'child')});const lookup=(method,args)=>child.call('rpc',{method,args});
 for(const task of cases){const before=await child.call('setup',{caseId:task.id});const target=before.scene.selection[0];let commands=[];
  if(task.id==='drill')commands=[{op:'drill',target,reference:{ray:{origin:[0,0,40],direction:[0,0,-1]}},diameter:6,through:true}];
  if(task.id==='shell')commands=[{op:'create',type:'box',as:'cut',size:[36,26,20],pos:[0,0,12],solid:false},{op:'group',targets:[target,'$cut']}];
  if(task.id==='thread')commands=[{op:'delete',target},{op:'create',type:'thread',size:[16,16,40],pos:[0,0,40],params:{kind:'external',profile:'trapezoid',diameter:16,pitch:4,length:40,hand:'right',leadIn:0}},...[10,70].map(z=>({op:'create',type:'cylinder',size:[16,16,20],pos:[0,0,z]}))];
  if(task.id==='pattern')commands=Array.from({length:5},(_,i)=>{const a=(i+1)*Math.PI/3;return {op:'create',type:'cylinder',size:[6,6,10],pos:[20*Math.cos(a),20*Math.sin(a),5]};});
  if(task.id==='sketch'){const corners=[[-20,-15],[20,-15],[20,15],[-20,15]],elements=corners.map((start,i)=>({id:'e'+i,type:'line',start,end:corners[(i+1)%4]}));commands=[{op:'sketch',sketch:{version:2,kind:'profile',variables:[],dimensions:{height:5},elements:[...elements,{id:'hole',type:'circle',center:[0,0],diameter:10}],loops:[{id:'outer',role:'outer',elements:elements.map(e=>e.id)},{id:'inner',role:'hole',elements:['hole']}]}}];}
  if(task.id==='drawing')commands=[{op:'drawing',action:'put',sheet:{id:'sheet',name:'Test',paper:'A4',orientation:'landscape',scale:1,titleBlock:{title:'Diagnosekörper'},views:['front','top','side'].map((kind,i)=>({id:kind,kind,sourceIds:[target],position:[50+i*65,80]})),annotations:[]}},{op:'drawing',action:'update',sheetId:'sheet'}];
  const p=await lookup('preview',{revision:before.scene.revision,commands});await lookup('apply',{previewId:p.previewId,revision:p.revision});const after=await child.call('snapshot');const result=await evaluate(task.id,before,after,lookup);reports.push({id:task.id,...result});console.log(JSON.stringify(reports.at(-1)));fs.writeFileSync(path.join(out,task.id+'.json'),JSON.stringify({before,after,result},null,2));
  // Every verifier must reject an unchanged fixture and loss of protected data.
  assert.equal((await evaluate(task.id,before,before,lookup)).passed,false,task.id+' unchanged');
  const tampered=structuredClone(after);tampered.project.nodes=tampered.project.nodes.filter(n=>n.name!=='Unbeteiligtes Teil');assert.equal((await evaluate(task.id,before,tampered,lookup)).passed,false,task.id+' protection');
 }
 for(const kind of ['offsetBore','namedSketch']){
  const before=await child.call('setup',{caseId:kind==='offsetBore'?'drill':'sketch'}),target=before.scene.selection[0];
  const commands=kind==='offsetBore'?[{op:'drill',target,reference:{ray:{origin:[3,0,40],direction:[0,0,-1]}},diameter:6,through:true}]:[{op:'create',type:'box',name:'sketch',as:'plate',size:[40,30,5],pos:[0,0,2.5]},{op:'drill',target:'$plate',reference:{ray:{origin:[0,0,40],direction:[0,0,-1]}},diameter:10,through:true}];
  const p=await lookup('preview',{revision:before.scene.revision,commands});await lookup('apply',{previewId:p.previewId,revision:p.revision});const after=await child.call('snapshot'),v=await evaluate(kind==='offsetBore'?'drill':'sketch',before,after,lookup);assert.equal(v.passed,false,kind+' must fail');fs.writeFileSync(path.join(out,kind+'.json'),JSON.stringify(v,null,2));console.log(JSON.stringify({counterexample:kind,rejected:true}));
 }
 const close=await child.close();fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:reports.every(r=>r.passed)&&close.code===0,reports,close},null,2));assert.ok(reports.every(r=>r.passed),'Native acceptance failed');assert.equal(close.code,0);app.quit();
 }catch(e){console.error(e);await child?.close();app.exit(1);}});
