const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {openDiagnosticChild}=require('../backend/ai-diagnostic-child.cjs'),{evaluate}=require('../backend/ai-diagnostic-evaluate.cjs'),{validateProposal}=require('../backend/ai-diagnostic-schema.cjs');
(async()=>{
 const executable=path.resolve(process.argv[2]),directory=path.resolve(process.argv[3]);fs.mkdirSync(directory,{recursive:true});
 const child=openDiagnosticChild({app:{isPackaged:true},directory,executable});
 try{
  const before=await child.call('setup',{caseId:'drill'}),target=before.scene.selection[0];
  const request={revision:before.scene.revision,commands:[{op:'drill',target,diameter:6,through:true,reference:{ray:{origin:[0,0,40],direction:[0,0,-1]}}}]};assert.ok((await validateProposal(request,before.scene.revision,before.validationContext)).valid);
  const lookup=(method,args)=>child.call('rpc',{method,args});const preview=await lookup('preview',request);assert.ok((await child.call('protect',{previewId:preview.previewId})).passed);await lookup('apply',{previewId:preview.previewId,revision:preview.revision});const after=await child.call('snapshot'),verification=await evaluate('drill',before,after,lookup);assert.ok(verification.passed);
  const picture=await lookup('screenshot',{});assert.ok(picture.dataBase64.length>1000);fs.writeFileSync(path.join(directory,'model.png'),Buffer.from(picture.dataBase64,'base64'));
  const close=await child.close();fs.writeFileSync(path.join(directory,'close.json'),JSON.stringify(close,null,2));assert.equal(close.code,0);assert.ok(!close.forced);fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify({ok:true,executable,verification,close,checks:['packaged child launch','runtime schema','preview protection','native drilling','independent bore verification','actual screenshot','regular child close']},null,2));console.log('PACKAGED NATIVE PASS');
 }catch(e){await child.close();throw e;}
})().catch(e=>{console.error(e);process.exitCode=1;});
