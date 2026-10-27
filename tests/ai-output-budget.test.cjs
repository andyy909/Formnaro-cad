const test=require('node:test'),assert=require('node:assert/strict');
const {generate,validateConfig}=require('../backend/ai-provider.cjs');
test('DeepSeek default and explicit maximum budgets reach both actual request formats',async()=>{
 const original=global.fetch,bodies=[];
 global.fetch=async(_u,o)=>{const b=JSON.parse(o.body);bodies.push(b);const text=JSON.stringify({message:'Ready'});return new Response(JSON.stringify(b.messages?{choices:[{message:{content:text}}]}:{output:[{type:'message',content:[{type:'output_text',text}]}]}));};
 try{for(const protocol of ['chat','responses'])for(const value of [null,393216]){
  await generate({protocol,baseUrl:'https://api.deepseek.com',model:'deepseek-flash',maxOutputTokens:value},'synthetic-fixture-key',{prompt:'Build',scene:{revision:'r'},context:{},chat:true});
  assert.equal(bodies.at(-1)[protocol==='chat'?'max_tokens':'max_output_tokens'],value??131072);
 }}finally{global.fetch=original;}
});
test('saved older profiles adopt automatic defaults and invalid output limits fail before transmission',()=>{
 assert.equal(validateConfig({baseUrl:'https://api.deepseek.com',model:'deepseek-flash'}).maxOutputTokens,null);
 for(const value of [0,-1,393217,1.5,NaN,Infinity,true,'131072'])assert.throws(()=>validateConfig({maxOutputTokens:value}));
 assert.equal(validateConfig({maxOutputTokens:131072}).maxOutputTokens,131072);
});
test('large reasoning replies above the old two MiB limit remain readable',async()=>{
 const original=global.fetch;global.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({message:'Complete answer'}),reasoning_content:'r'.repeat(3*1024*1024)}}]}));
 try{const r=await generate({protocol:'chat',baseUrl:'https://api.deepseek.com',model:'deepseek-flash'},'synthetic-key',{prompt:'Build',scene:{revision:'r'},context:{},chat:true});assert.equal(r.message,'Complete answer');}finally{global.fetch=original;}
});
test('default budget for unrelated Responses providers stays unchanged',async()=>{
 const original=global.fetch;let body;global.fetch=async(_u,o)=>{body=JSON.parse(o.body);return new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({message:'Ready'})}]}]}));};
 try{await generate({baseUrl:'https://example.invalid/v1',model:'fixture'},'synthetic-key',{prompt:'Build',scene:{revision:'r'},context:{},chat:true});assert.equal(body.max_output_tokens,12000);}finally{global.fetch=original;}
});
