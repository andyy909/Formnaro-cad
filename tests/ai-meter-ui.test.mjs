import test from 'node:test';import assert from 'node:assert/strict';
import {formatAIBytes,formatAIMeterCost,createAIUsagePanel} from '../src/cad-ai-meter.js';
test('Context sizes and prices use readable units, explicit estimates and unknown prices',()=>{
 assert.equal(formatAIBytes(2500000),'2,5 MB');assert.equal(formatAIBytes(0),'0 B');assert.equal(formatAIBytes(null),'–');assert.equal(formatAIMeterCost(null),'Preis unbekannt');assert.match(formatAIMeterCost({min:.001,max:.002}),/0,0010–0,0020 USD/);
});
test('Context metrics refresh on application initialization before settings are opened, without a provider request',async()=>{
 let metrics=0,context=0;createAIUsagePanel({desktop:{getAIContextMetrics:async args=>{metrics++;assert.deepEqual(args.context,{tools:true});return {provider:'local'};}},getContext:()=>{context++;return {tools:true};}});
 await new Promise(r=>setImmediate(r));assert.equal(metrics,1);assert.equal(context,1);
});
