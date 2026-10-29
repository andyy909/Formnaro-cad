import test from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';import os from 'node:os';import fs from 'node:fs';
import {cadAIContext} from '../src/cad-ai-context.js';
import {contextMetrics} from '../backend/ai-context-metrics.cjs';
import {providerContext} from '../backend/ai-provider-context.cjs';
const config={baseUrl:'https://api.deepseek.com',model:'deepseek-flash',authMode:'api-key'};
test('Actual complete V4 CAD context and bundled documentation fit metrics; only the deduplicated provider contract is counted',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-metrics-'));
 try{const context=cadAIContext(),before=JSON.stringify(context),modeling={status:()=>({notesFile:path.join(dir,'notes.txt'),journalFile:path.join(dir,'journal.json'),warning:''}),context:()=>''},r=contextMetrics({context,config,modeling,bundledDirectory:path.resolve('ai')});
  assert(before.length>700000);assert.equal(r.components.find(c=>c.id==='tools').characters,JSON.stringify(providerContext(context)).length);assert(r.components[0].characters<before.length);assert.equal(r.files.length,5);assert(r.files.filter(f=>['toolsJson','toolsText','agentRules'].includes(f.id)).every(f=>f.available&&f.bytes>0));assert(r.total.estimatedTokens>1000&&r.total.estimatedInputCostUSD.max>0);assert.equal(JSON.stringify(context),before);
 }finally{assert.equal(path.dirname(dir),os.tmpdir());fs.rmSync(dir,{recursive:true,force:true});}
});
test('Metrics keep a finite UTF-8 byte budget and reject invalid or excessive contexts before reading model data',()=>{
 const modeling={status:()=>{throw Error('Model data should not be read');}};
 for(const context of [null,[],{large:'x'.repeat(3*1024*1024)},{large:'Ä'.repeat(1200000)}])assert.throws(()=>contextMetrics({context,config,modeling}),/Ungültiger Kontext/);
});
