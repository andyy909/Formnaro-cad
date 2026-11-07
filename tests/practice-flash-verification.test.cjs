const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {flashConfig,flashProfile,recordPracticeFlash}=require('../backend/practice-flash-verification.cjs');
const {createAIProfiles}=require('../backend/ai-profiles.cjs');

test('Flash test seed selects only the matching encrypted credential',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-flash-profile-'));
 const file=path.join(directory,'settings.json');
 try{
  fs.writeFileSync(file,JSON.stringify({profiles:[{config:{baseUrl:'https://api.deepseek.com.example.org'},encryptedKey:'unrelated'},
   {config:{baseUrl:'https://api.deepseek.com/v1',model:'old'},encryptedKey:'selected',notes:'not needed'}]}));
  const seed=flashProfile(file);
  assert.deepEqual(seed,{config:{...flashConfig,rememberKey:true},encryptedKey:'selected',selectedProviderId:'https://api.deepseek.com'});
  let persisted;
  const profiles=createAIProfiles({stored:seed,canEncrypt:()=>true,decrypt:value=>value==='selected'?'session-key':'',persist:value=>{persisted=value;}});
  profiles.save({config:flashConfig,key:''});
  assert.equal(profiles.active().key,'session-key');
  assert(!JSON.stringify(persisted).includes('encryptedKey'));
 }finally{fs.rmSync(file,{force:true});fs.rmdirSync(directory);}
});

test('Flash transport evidence verifies High, catalogue, images and correction without retaining credentials',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-flash-wire-')),original=global.fetch;
 let recorder;
 try{
  global.fetch=async url=>new Response(JSON.stringify(String(url).endsWith('/models')?
   {data:[{id:'deepseek-flash',input_modalities:['text','image']}]}:
   {model:'deepseek-flash',choices:[{finish_reason:'stop',message:{content:'{"message":"OK private-fixture"}'}}],usage:{prompt_tokens:12,completion_tokens:4}}));
  recorder=recordPracticeFlash(directory);
  await global.fetch('https://api.deepseek.com/models');
  const feedback={kind:'practice-quality-blocked',reason:'Gemessen 42 mm statt 44 mm private-fixture',
   exerciseRevision:'fee178aa801d2eac',quality:{items:[{id:'width',expected:44,actual:42,status:'failed'}]}};
  const response=await global.fetch('https://api.deepseek.com/chat/completions',{headers:{Authorization:'Bearer private-fixture'},body:JSON.stringify({
   model:'deepseek-flash',thinking:{type:'enabled'},reasoning_effort:'high',messages:[{role:'user',content:[
    {type:'text',text:'Private exercise\nValidation feedback:\n'+JSON.stringify(feedback)},
    {type:'image_url',image_url:{url:'data:image/png;base64,YWJj'}}
   ]}]
  })});
  assert.equal((await response.json()).model,'deepseek-flash');
  assert.equal(recorder.valid(),true);
  const file=fs.readFileSync(path.join(directory,'flash-rounds.json'),'utf8');
  assert(!file.includes('private-fixture'));
  const [round]=JSON.parse(file).rounds;
  assert.deepEqual(round.images,[{mimeType:'image/png',sha256:'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',bytes:3}]);
  assert.deepEqual(round.applicationFeedback,{...feedback,reason:'Gemessen 42 mm statt 44 mm [redacted]'});
  assert(!file.includes('Private exercise'));
 }finally{recorder?.stop();global.fetch=original;fs.rmSync(path.join(directory,'flash-rounds.json'),{force:true});fs.rmdirSync(directory);}
});
