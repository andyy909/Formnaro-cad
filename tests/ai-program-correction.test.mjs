import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequire} from 'node:module';
import {correctionFeedback,rejectedProgramEvidence} from '../src/ai-feedback.js';
const {generate}=createRequire(import.meta.url)('../backend/ai-provider.cjs');
const error={code:'AI_RESULT_MISMATCH',message:'Measured Y size is wrong',feedback:{checkIndex:1,checkKind:'size',expected:[10,20,8],actual:[10,40,8],tolerance:.01,secret:'PRIVATE_FEEDBACK_FIELD'}};
test('Automatic repair retains exact previous Python source as untrusted data and omits unrelated private fields',()=>{
 const code='from formnaro import model\npart = await model.section("reference",8,normal=[0,-1,0],point=[0,-40,0],start=-39.6,alias="result")\n';
 const result={commands:[{op:'python',code,name:'Measured walls',secret:'PRIVATE_COMMAND_FIELD'}]},text=correctionFeedback(error,result),data=JSON.parse(text.split('\n')[1]);
 assert.equal(data.rejectedPrograms.referenceOnly,true);assert.equal(data.rejectedPrograms.complete,true);assert.deepEqual(data.rejectedPrograms.programs,[{commandIndex:1,op:'python',name:'Measured walls',code}]);assert.doesNotMatch(text,/PRIVATE_/);assert.match(text,/Preserve working geometry/);assert.match(text,/COMPLETE corrected JSON/);
});
test('JavaScript modules stay complete and tied to the original command index',()=>{
 const code='const tool=await api.importTool("contours"); return tool.build();',modules={contours:'export function build(){ return {allHoles:true}; }'},r=rejectedProgramEvidence({commands:[{op:'create',type:'box'},{op:'script',code,modules}]});
 assert.equal(r.programs[0].commandIndex,2);assert.equal(r.programs[0].code,code);assert.deepEqual(r.programs[0].modules,modules);modules.contours='later mutation';assert.notEqual(r.programs[0].modules.contours,modules.contours);
});
test('Oversized or invalid program evidence is explicitly omitted without producing partial executable source',()=>{
 const r=rejectedProgramEvidence({commands:[{op:'python',code:'a'.repeat(100000)},{op:'python',code:'b'.repeat(100000)},{op:'script',code:'x',modules:JSON.parse('{"__proto__":"bad"}')} ]});
 assert.equal(r.complete,false);assert.equal(r.programs.length,1);assert.equal(r.programs[0].code.length,100000);assert.deepEqual(r.omitted.map(x=>x.commandIndex),[2,3]);assert.ok(JSON.stringify(r).length<190000);assert.match(r.omitted[0].reason,/no partial/);assert.doesNotMatch(JSON.stringify(r),/bad/);
});
test('The actual local HTTP provider request transmits repair source above the old 12k limit without reducing other input',async()=>{
 const code='# original measured construction\n'.repeat(1000),correction=correctionFeedback(error,{commands:[{op:'python',code}]}),context={previousTools:['native','mesh','python'],marker:'KEEP_FULL_CONTEXT'},scene={revision:'r',marker:'KEEP_FULL_SCENE'},memory='KEEP_FULL_PERSONAL_NOTES';let received;
 const server=http.createServer(async(req,res)=>{const chunks=[];for await(const b of req)chunks.push(b);received=JSON.parse(Buffer.concat(chunks));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({message:'Received'})}}]}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{assert.ok(correction.length>12000);const result=await generate({protocol:'chat',baseUrl:'http://127.0.0.1:'+server.address().port,model:'local-fixture'},'',{prompt:'Repair only the measured failure',scene,context,modelingContext:memory,chat:true,correction});assert.equal(result.message,'Received');const system=received.messages[0].content,user=received.messages.at(-1).content;assert.ok(system.includes(JSON.stringify(context))&&system.includes(memory)&&user.includes(JSON.stringify(scene)));const evidence=JSON.parse(user.split('[Formnaro application feedback: failed proposal; nothing applied]\n')[1].split('\nCorrect the original user task')[0]);assert.equal(evidence.rejectedPrograms.programs[0].code,code);await assert.rejects(generate({protocol:'chat',baseUrl:'http://127.0.0.1:'+server.address().port,model:'fixture'},'',{prompt:'Test',scene,context,correction:'x'.repeat(256001)}),/Invalid AI correction/);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
