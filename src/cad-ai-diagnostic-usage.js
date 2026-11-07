import {formatAICostUSD,setAIExchangeRate,getAIExchangeRate} from './ai-currency.js';
import {usageTotals,usagePrice} from '../ai/diagnostic-costs.mjs';
export {usageTotals,usagePrice};
export function mountDiagnosticUsage({host,desktop,rates=null}){
 const root=document.createElement('section');root.id='ai-diagnostic-usage';root.style.cssText='padding:10px 14px;background:#e4f4ef;border:1px solid #7fb5a6;border-radius:8px;margin:10px 0;font:14px/1.5 system-ui;';host.append(root);
 const rows=new Map(),unsettled=new Map(),roles=new Map(),liveRoles=new Map();let currentId=null,live=null,lastUpdate=0,reconciliation=null,requestCount=0;
 const n=v=>Math.round(v).toLocaleString('de-DE');
 function line(label,total){return label+': Input '+n(total.input)+' · Output '+n(total.output)+' · Cache '+n(total.cached)+(total.cacheUnknown?' (+ unbekannte Anteile)':'')+' · '+(total.priceUnknown?'Kosten teilweise unbekannt · ':'')+formatAICostUSD({min:total.min,max:total.max});}
 function render(){
  const all=usageTotals([...rows.values()]),current=usageTotals([...rows].filter(([id])=>id.startsWith(currentId+':')).map(([,v])=>v));root.replaceChildren();
  for(const text of [line('GESAMT · alle Tests einschließlich Vorversuche',all),line('Aktueller Versuch',current)]){const p=document.createElement('div');p.textContent=text;root.append(p);}
  for(const role of ['modeler','supervisor','reviewer']){const p=document.createElement('div');p.textContent=line(role==='reviewer'?'Abschlussauswerter':role==='supervisor'?'Versuchsleiter':'Modellieragent',usageTotals([...rows].filter(([id])=>roles.get(id)===role).map(([,value])=>value)));root.append(p);}
  for(const [role,live]of liveRoles){const p=document.createElement('div');p.textContent=(role==='supervisor'?'Versuchsleiter · ':'Modellieragent · ')+'Laufende Antwort – vorläufig (Zeichen ÷4, Bildtokens noch unbekannt): Input ca. '+n(live.input)+' · Output ca. '+n(live.output)+' · Cache noch unbekannt';root.append(p);}
  const unknown=[...unsettled.values()].reduce((a,b)=>a+b,0);if(unknown){const p=document.createElement('div');p.textContent=unknown+' Anfrage(n) ohne abschließende Verbrauchsmeldung: Kosten fehlen noch in der Summe.';root.append(p);}
  if(reconciliation){const p=document.createElement('div');p.textContent='Anbieterabgleich vom '+new Date(reconciliation.checkedAt).toLocaleString('de-DE')+': '+formatAICostUSD({min:reconciliation.costUSD,max:reconciliation.costUSD})+' für den abgeglichenen Zeitraum mit '+reconciliation.requests+' lokalen Anfragen. Differenz zur damaligen lokalen Summe: '+reconciliation.differenceUSD.toFixed(8)+' USD. '+(reconciliation.requestCountMatches&&reconciliation.costsMatchTokenRows?'Anfragezahl und Anbieter-Tarifzeilen stimmen überein. ':'Zuordnung nicht vollständig bestätigt. ')+(requestCount>reconciliation.requests?'Weitere Tests seit diesem Abgleich sind noch nicht enthalten.':'');root.append(p);}
  const note=document.createElement('small');note.textContent='Summe der gemeldeten API-Tokens, auch bei fehlgeschlagenen Tests. Cache ist im Input enthalten; Output enthält Denk-Tokens. Tarifberechnung, keine Anbieterrechnung. Bei Abo-Zugängen sind dies API-Vergleichswerte. EUR zum EZB-Kurs vom '+getAIExchangeRate().date+'.';root.append(note);
 }
 function update(message){
  if(message.type==='state'){
   rates=message.state.pricing??rates;reconciliation=message.state.reconciliation;const reviewRecords=(message.state.lab?.reviewer?.reviews??[]).map(r=>({...r,id:'review-'+r.id})),allRecords=[...message.state.records,...reviewRecords];requestCount=allRecords.reduce((n,r)=>n+(r.requestCount??0),0);rows.clear();roles.clear();unsettled.clear();
   for(const r of allRecords){for(const e of r.usageEvents??[]){const id=r.id+':'+e.round;rows.set(id,usagePrice(e.usage??{},e.rates??r.rates??rates,e.at,e.billing));roles.set(id,e.role??'modeler');}unsettled.set(r.id,r.unsettledRequests??0);}render();return;
  }
  const e=message.event;if(!e)return;const role=e.role??'modeler';let live=liveRoles.get(role);if(message.runId!==currentId){currentId=message.runId;liveRoles.clear();}
  if(e.type==='request'){requestCount++;
   // Never count base64 as text tokens. Image usage is supplied by the provider.
   const text=JSON.stringify(e.body,(k,v)=>k==='image_url'?'[image]':v);
   live={input:Math.ceil(text.length/4),output:0,reasoning:'',answer:'',round:e.round};liveRoles.set(role,live);unsettled.set(currentId,(unsettled.get(currentId)??0)+1);
  }
  if((e.type==='reasoning'||e.type==='answer')&&live){live[e.type]=e.snapshot?e.text:live[e.type]+e.text;live.output=Math.ceil((live.reasoning.length+live.answer.length)/4);}
  if(e.type==='usage'){roles.set(currentId+':'+e.round,role);rows.set(currentId+':'+e.round,usagePrice(e.usage??{},e.rates??rates,new Date().toISOString(),e.billing));if(Number.isFinite(e.usage?.input_tokens??e.usage?.prompt_tokens)&&Number.isFinite(e.usage?.output_tokens??e.usage?.completion_tokens))unsettled.set(currentId,Math.max(0,(unsettled.get(currentId)??1)-1));liveRoles.delete(role);}
  if(e.type==='finished')liveRoles.clear();
  if(Date.now()-lastUpdate>200||['usage','finished','request'].includes(e.type)){lastUpdate=Date.now();render();}
 }
 const unsubscribe=desktop.onDiagnosticEvent(update);
 desktop.getAIExchangeRate().then(setAIExchangeRate).then(render).catch(()=>{});
 desktop.refreshAIExchangeRate().then(setAIExchangeRate).then(render).catch(()=>{});
 desktop.diagnostics({action:'state'}).then(state=>update({type:'state',state})).catch(()=>{});render();
 return {update,dispose(){unsubscribe?.();root.remove();}};
}
