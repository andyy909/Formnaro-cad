const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

test('desktop chat attaches the clicked bore and limits the applied change to its exact source',{timeout:170000},()=>{
 const root=path.resolve(__dirname,'..');
 const directory=path.join(root,'work','cad-ai-chat');
 fs.mkdirSync(directory,{recursive:true});
 const out=fs.mkdtempSync(path.join(directory,'direct-feature-'));
 const env={...process.env,FORMNARO_FEATURE_OUTPUT:out,FORMNARO_CHAT_ENTRY:path.join(root,'dist','index.html')};
 delete env.ELECTRON_RUN_AS_NODE;
 const run=spawnSync(require('electron'),[path.join(__dirname,'cad-app-ai-chat-feature-desktop.cjs')],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:150000});
 const file=path.join(out,'result.json');
 const evidence=fs.existsSync(file)?fs.readFileSync(file,'utf8'):run.stderr;
 assert.equal(run.status,0,run.error?.message??evidence);
 assert.equal(JSON.parse(evidence).passed,true,evidence);
});
