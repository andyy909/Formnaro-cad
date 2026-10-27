import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {formatAIUsage,summarizeAIUsage} from '../src/cad-ai-usage.js';
const {aiUsage}=createRequire(import.meta.url)('../backend/ai-usage.cjs');
test('Abo displays a labelled API equivalent and explicitly excludes additional subscription billing',()=>{
 const u=aiUsage({usage:{input_tokens:100000,output_tokens:10000,input_tokens_details:{cached_tokens:80000}}},{baseUrl:'https://api.openai.com/v1',model:'gpt-6.1-sol',authMode:'chatgpt'},1000),text=formatAIUsage([u,u]);
 assert.match(text,/Geschätzter API-Gegenwert: 0,2960 USD/);assert.match(text,/keine zusätzliche Abo-Abrechnung/);assert.match(text,/2026-10-26/);assert.match(text,/ohne Zuschläge/);
});
test('Unknown requests produce a labelled known subtotal, never a fabricated zero',()=>{
 const unknown={model:'gpt-unknown',inputTokens:100,outputTokens:10},known=aiUsage({usage:{input_tokens:1000,output_tokens:100}},{baseUrl:'https://api.openai.com/v1',model:'gpt-6.1-sol'},1),u=summarizeAIUsage([known,unknown]);
 assert.equal(u.estimatedCostUSD.missing,1);assert.match(formatAIUsage([known,unknown]),/nur bekannte Teilsumme/);assert.match(formatAIUsage([unknown]),/nicht verfügbar/);
});
