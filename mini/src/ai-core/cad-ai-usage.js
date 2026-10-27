const sum=values=>values.every(Number.isFinite)?values.reduce((a,b)=>a+b,0):null;
export function summarizeAIUsage(attempts){
 const cost=attempts.every(a=>a.estimatedCostUSD)?{min:sum(attempts.map(a=>a.estimatedCostUSD.min)),max:sum(attempts.map(a=>a.estimatedCostUSD.max)),cacheAssumed:attempts.some(a=>a.estimatedCostUSD.cacheAssumed),rateDate:attempts[0]?.estimatedCostUSD.rateDate}:null;
 return {requests:attempts.length,inputTokens:sum(attempts.map(a=>a.inputTokens)),outputTokens:sum(attempts.map(a=>a.outputTokens)),reasoningTokens:sum(attempts.map(a=>a.reasoningTokens)),elapsedMs:sum(attempts.map(a=>a.elapsedMs)),estimatedCostUSD:cost};
}
export function formatAIUsage(attempts,language='de'){
 if(!attempts.length)return '';const u=summarizeAIUsage(attempts),en=language==='en',n=v=>v.toLocaleString(en?'en-US':'de-DE'),parts=[en?`${u.requests} API request(s)`:`${u.requests} API-Anfrage(n)`];
 parts.push(u.inputTokens===null||u.outputTokens===null?(en?'Provider reported no complete token usage':'Anbieter meldet keine vollständigen Tokenzahlen'):(en?`${n(u.inputTokens)} input · ${n(u.outputTokens)} output tokens`:`${n(u.inputTokens)} Eingabe · ${n(u.outputTokens)} Ausgabe-Tokens`));
 if(u.reasoningTokens!==null)parts.push(en?`${n(u.reasoningTokens)} reasoning tokens included`:`davon ${n(u.reasoningTokens)} Denk-Tokens`);
 if(u.elapsedMs!==null)parts.push((u.elapsedMs/1000).toLocaleString(en?'en-US':'de-DE',{maximumFractionDigits:1})+' s');
 if(u.estimatedCostUSD){const c=u.estimatedCostUSD,m=v=>v.toLocaleString(en?'en-US':'de-DE',{minimumFractionDigits:4,maximumFractionDigits:6});parts.push((en?'Estimated cost: ':'Geschätzte Kosten: ')+m(c.min)+'–'+m(c.max)+' USD');if(c.cacheAssumed)parts.push(en?'Cache savings unknown':'Cache-Ersparnis unbekannt');}
 return parts.join(' · ');
}
