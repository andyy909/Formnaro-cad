const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {openDiagnosticChild}=require('../backend/ai-diagnostic-child.cjs');
(async()=>{
 const executable=path.resolve(process.argv[2]),directory=path.resolve(process.argv[3]),expectFailure=process.argv.includes('--expect-unavailable');fs.mkdirSync(directory,{recursive:true});
 const child=openDiagnosticChild({app:{isPackaged:true},directory,executable});let close,pendingPreview;
 try{
  const before=await child.call('setup',{caseId:'drill'}),request={revision:before.scene.revision,commands:[{op:'tool',engine:'freecad',as:'result',operation:{kind:'build',script:{version:1,code:'result=Part.makeBox(2,3,4)'}}}],checks:[{kind:'volume',target:'$result',expected:24,tolerance:.0001}]};
  if(expectFailure){await assert.rejects(child.call('rpc',{method:'preview',args:request}),/integrierte CAD-Laufzeit fehlt|FREECAD_UNAVAILABLE/);const after=await child.call('snapshot');assert.deepEqual(after.project,before.project);fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify({reproduced:true,packagedFreecadUnavailable:true,modelPreserved:true}));}
  else{
   const preview=await child.call('rpc',{method:'preview',args:request},60000);pendingPreview=preview;fs.writeFileSync(path.join(directory,'preview.json'),JSON.stringify(preview,null,2));
   const checked=await child.call('rpc',{method:'analysis',args:{revision:preview.revision,previewId:preview.previewId,checks:request.checks}});assert.equal(checked.verification.passed,true);assert.ok((await child.call('protect',{previewId:preview.previewId})).passed);
   await child.call('rpc',{method:'apply',args:{revision:preview.revision,previewId:preview.previewId}});const after=await child.call('snapshot');assert.equal(after.scene.objects.length,before.scene.objects.length+1);
   pendingPreview=null;fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify({passed:true,checks:['actual packaged EXE','bundled FreeCAD through renderer IPC','native 2x3x4 solid','explicit independent24mm3 volume check regardless of default check profile','preview protection','apply and retained unrelated fixture'],verification:checked.verification},null,2));
  }
 }catch(error){fs.writeFileSync(path.join(directory,'error.json'),JSON.stringify({message:error.message,code:error.code,stack:error.stack},null,2));throw error;}finally{if(pendingPreview)await child.call('rpc',{method:'discard',args:{revision:pendingPreview.revision,previewId:pendingPreview.previewId}}).catch(()=>{});close=await child.close();fs.writeFileSync(path.join(directory,'close.json'),JSON.stringify(close));assert.equal(close.code,0);assert.ok(!close.forced);}
 console.log(expectFailure?'PACKAGED FREECAD FAILURE REPRODUCED':'PACKAGED FREECAD PASS');
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
