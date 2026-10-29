import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
import {formatAICostUSD,setAIExchangeRate} from '../src/ai-currency.js';
const require=createRequire(import.meta.url),{createAIExchange,parseECB}=require('../backend/ai-exchange.cjs');
const xml=`<Envelope><Cube><Cube time='2026-10-29'><Cube currency='USD' rate='1.2000'/></Cube></Cube></Envelope>`;
test('ECB quotes are USD per EUR and are divided for the estimated euro range',()=>{
 const rate=parseECB(xml);assert.deepEqual(rate,{date:'2026-10-29',usdPerEur:1.2,source:'ECB'});setAIExchangeRate(rate);
 const formatted=formatAICostUSD({min:1.2,max:2.4});assert.match(formatted,/1,2000–2,4000 USD/);assert.match(formatted,/1,0000–2,0000 EUR/);assert.match(formatted,/29\.10\.2026/);
 assert.throws(()=>parseECB('<Cube currency="USD" rate="NaN"/>'));assert.equal(formatAICostUSD(null),'Preis unbekannt');
});
test('Only explicit refresh fetches ECB; its dated result survives restart and old data cannot replace it',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-fx-')),file=path.join(directory,'rate.json');t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));let calls=0;
 const service=createAIExchange({file,fetcher:async url=>{calls++;assert.equal(url,'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml');return new Response(xml);}});
 assert.equal(service.get().date,'2026-10-28');assert.equal(calls,0);assert.equal((await service.refresh()).usdPerEur,1.2);assert.equal(calls,1);assert.equal(createAIExchange({file}).get().date,'2026-10-29');
 const old=createAIExchange({file,fetcher:async()=>new Response(xml.replace('2026-10-29','2026-10-27'))});await assert.rejects(old.refresh(),/älter/);assert.equal(old.get().date,'2026-10-29');
});
