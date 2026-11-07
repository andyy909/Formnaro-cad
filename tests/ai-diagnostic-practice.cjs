const {app}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'work/diagnostic-practice');fs.mkdirSync(directory,{recursive:true});app.setPath('userData',path.join(directory,'host'));
app.whenReady().then(async()=>{let child;try{
 child=require('../backend/ai-diagnostic-child.cjs').openDiagnosticChild({app:{isPackaged:false,getAppPath:()=>root},directory:path.join(directory,'child')});
 const before=await child.call('setup',{caseId:'assembly'});
 const plan={version:1,title:'Ausgewählte Welle sichtbar auf Ø14 ändern',actions:[{kind:'set',field:'size-0',value:14},{kind:'set',field:'size-1',value:14},{kind:'set',field:'pos-0',value:0},{kind:'set',field:'pos-1',value:0},{kind:'set',field:'pos-2',value:40}]};
 const replay=await child.call('practice',{plan,projectCopy:{revision:before.scene.revision,project:before.project,selection:before.scene.selectionTargets}},90000);
 fs.writeFileSync(path.join(directory,'replay.json'),JSON.stringify(replay,null,2));assert.ok(replay.result.ok);assert.ok(replay.project);
 await child.call('loadResult',{project:replay.project});const after=await child.call('snapshot'),verification=require('../backend/ai-diagnostic-assembly.cjs').evaluateAssembly(before,after);assert.ok(verification.passed,JSON.stringify(verification));
 const close=await child.close();assert.equal(close.code,0);assert.ok(!close.forced);fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify({ok:true,verification,close},null,2));console.log('PRACTICE SELECTION PASS');app.quit();
 }catch(e){console.error(e);await child?.close();app.exit(1);}});
