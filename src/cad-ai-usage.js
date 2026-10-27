const sum=values=>values.every(Number.isFinite)?values.reduce((a,b)=>a+b,0):null;
export function summarizeAIUsage(attempts){
 const known=attempts.filter(a=>a.estimatedCostUSD),cost=known.length?{min:sum(known.map(a=>a.estimatedCostUSD.min)),max:sum(known.map(a=>a.estimatedCostUSD.max)),cacheAssumed:known.some(a=>a.estimatedCostUSD.cacheAssumed),rateDate:known[0]?.estimatedCostUSD.rateDate,basis:known.some(a=>a.estimatedCostUSD.basis==='api-equivalent')?'api-equivalent':undefined,subscription:known.some(a=>a.estimatedCostUSD.subscription),longContext:known.some(a=>a.estimatedCostUSD.longContext),missing:attempts.length-known.length}:null;
 return {requests:attempts.length,inputTokens:sum(attempts.map(a=>a.inputTokens)),outputTokens:sum(attempts.map(a=>a.outputTokens)),cachedInputTokens:sum(attempts.map(a=>a.cachedInputTokens)),reasoningTokens:sum(attempts.map(a=>a.reasoningTokens)),elapsedMs:sum(attempts.map(a=>a.elapsedMs)),estimatedCostUSD:cost};
}
export function formatAIUsage(attempts,language='de'){
 if(!attempts.length)return '';const u=summarizeAIUsage(attempts),en=language==='en',n=v=>v.toLocaleString(en?'en-US':'de-DE'),parts=[en?`${u.requests} API request(s)`:`${u.requests} API-Anfrage(n)`];
 parts.push(u.inputTokens===null||u.outputTokens===null?(en?'Provider reported no complete token usage':'Anbieter meldet keine vollständigen Tokenzahlen'):(en?`${n(u.inputTokens)} input · ${n(u.outputTokens)} output tokens`:`${n(u.inputTokens)} Eingabe · ${n(u.outputTokens)} Ausgabe-Tokens`));
 if(u.cachedInputTokens!==null)parts.push(en?`${n(u.cachedInputTokens)} cached input tokens`:`${n(u.cachedInputTokens)} Eingabe-Tokens aus Cache`);
 if(u.reasoningTokens!==null)parts.push(en?`${n(u.reasoningTokens)} reasoning tokens included`:`davon ${n(u.reasoningTokens)} Denk-Tokens`);
 if(u.elapsedMs!==null)parts.push((u.elapsedMs/1000).toLocaleString(en?'en-US':'de-DE',{maximumFractionDigits:1})+' s');
 if(u.estimatedCostUSD){const c=u.estimatedCostUSD,m=v=>v.toLocaleString(en?'en-US':'de-DE',{minimumFractionDigits:4,maximumFractionDigits:6});parts.push((c.basis==='api-equivalent'?(en?'Estimated API equivalent: ':'Geschätzter API-Gegenwert: '):(en?'Estimated cost: ':'Geschätzte Kosten: '))+(c.min===c.max?m(c.min):m(c.min)+'–'+m(c.max))+' USD');if(c.subscription)parts.push(en?'Comparison only; no extra subscription charge':'Vergleichswert; keine zusätzliche Abo-Abrechnung');if(c.cacheAssumed)parts.push(en?'Cache savings unknown':'Cache-Ersparnis unbekannt');if(c.basis==='api-equivalent')parts.push((en?'Standard rates as of ':'Standardtarif vom ')+c.rateDate+(en?'; excludes surcharges/taxes; API caching may differ':'; ohne Zuschläge/Steuern; API-Cache kann abweichen'));if(c.longContext)parts.push(en?'Long-context rates included per request':'Langkontexttarif je Anfrage berücksichtigt');if(c.missing)parts.push(en?`${c.missing} request(s) without price; subtotal only`:`${c.missing} Anfrage(n) ohne Preis; nur bekannte Teilsumme`);}
 else if(attempts.some(a=>/^gpt-/.test(a.model??'')))parts.push(en?'API equivalent unavailable for this model or missing token counts':'API-Gegenwert für dieses Modell oder ohne Tokenzahlen nicht verfügbar');
 return parts.join(' · ');
}

// Only requests and tokens occupy the closed footer; costs remain in its details.
export function formatAIUsageCompact(attempts,language='de'){
 if(!attempts.length)return '';
 const u=summarizeAIUsage(attempts),en=language==='en',n=v=>v.toLocaleString(en?'en-US':'de-DE');
 const requests=en?`${u.requests} request${u.requests===1?'':'s'}`:`${u.requests} ${u.requests===1?'Versuch':'Versuche'}`;
 const tokens=u.inputTokens===null||u.outputTokens===null?(en?'Tokens unknown':'Tokens unbekannt'):(en?`${n(u.inputTokens)} in / ${n(u.outputTokens)} out tokens`:`${n(u.inputTokens)} ein / ${n(u.outputTokens)} aus Tokens`);
 return requests+' · '+tokens;
}
