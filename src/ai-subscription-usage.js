import {formatAICostUSD} from './ai-currency.js';
const element=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
export function mountAISubscriptionUsage({parent,desktop,language=()=> 'de'}){
 if(!desktop?.getAISubscriptionUsage)return {refresh:async()=>{}};
 const root=element('section');root.id='ai-subscription-usage';root.className='chatgpt-settings';root.hidden=true;parent.append(root);
 const say=(de,en)=>language()==='en'?en:de,n=v=>Number.isFinite(v)?v.toLocaleString(language()==='en'?'en-US':'de-DE'):'–';
 const title=element('h4'),local=element('p'),cost=element('p'),balance=element('p'),plan=element('p'),note=element('p'),status=element('p'),controls=element('div');cost.id='ai-subscription-api-cost';cost.style.fontWeight='700';
 note.className='small-note';status.setAttribute('role','status');controls.className='ai-controls';
 const update=element('button',say('Kontoinformation aktualisieren','Refresh account information')),open=element('button',say('Abo-Verbrauch beim Anbieter öffnen','Open subscription usage at provider'));
 update.type=open.type='button';update.id='ai-subscription-refresh';open.id='ai-subscription-open';controls.append(update,open);root.append(title,local,cost,balance,plan,note,controls,status);
 let sequence=0,period='all',busy=false;
 async function refresh(options={}){
  period=options.period??period;const ticket=++sequence;
  try{const value=await desktop.getAISubscriptionUsage({period,refreshAccount:options.refreshAccount===true});if(ticket!==sequence||!root.isConnected)return;
   root.hidden=!value.subscription;if(root.hidden)return;
   title.textContent=say('Abo-Nutzung · aktueller Anbieter: ','Subscription usage · current provider: ')+value.label;
   const u=value.local;
   local.textContent=u.available?say('In Formnaro erfasst: ','Recorded in Formnaro: ')+n(u.requests)+say(' Anfragen · ',' requests · ')+(u.inputMissing?'≥ ':'')+n(u.inputTokens)+say(' Eingabe- / ',' input / ')+(u.outputMissing?'≥ ':'')+n(u.outputTokens)+say(' Ausgabe-Tokens',' output tokens'):say('Lokale Verbrauchserfassung nicht verfügbar.','Local usage records unavailable.');
   cost.textContent=say('Geschätzte API-Kosten zum Vergleich: ','Estimated API cost for comparison: ')+(u.estimatedAPICostUSD?formatAICostUSD(u.estimatedAPICostUSD,language()):u.requests===0?say('Noch keine Anfragen erfasst','No recorded requests yet'):say('Preis unbekannt – Modelltarif oder Tokenzahlen fehlen','Price unknown — model rate or token counts missing'))+(u.estimatedAPICostUSD&&u.unpricedRequests?say(' · bekannte Teilsumme',' · known subtotal'):'')+say(' · keine Abo-Rechnung',' · not a subscription invoice');
   balance.textContent=say('Verbleibendes Abo-Kontingent: unbekannt – der Zugang meldet keinen Restwert.','Remaining subscription allowance: unknown — this connection reports no balance.');
   const a=value.account;plan.textContent=a?.plan?say('Gemeldeter Tarif: ','Reported plan: ')+(a.plan.title||a.plan.name)+(a.checkedAt?' · '+new Date(a.checkedAt).toLocaleString(language()==='en'?'en-US':'de-DE'):''):say('Tarif und Gesamtverbrauch können beim Anbieter geprüft werden.','Check your plan and total usage at the provider.');
   note.textContent=say('Die lokalen Zahlen gelten für den gewählten Zeitraum und die hier erfassten Zugänge dieses Anbieters. Nutzung in anderen Apps fehlt. Tokens und API-Gegenwert ergeben keinen verlässlichen Abo-Prozentwert. Mögliche Zusatzkosten richten sich nach deinem Anbieter-Tarif.','Local counts cover the selected period and this provider’s connections recorded here. Other apps are excluded. Tokens and API equivalents do not establish a reliable subscription percentage. Extra charges depend on your provider plan.');
   status.textContent=u.warning||(a?.status==='unavailable'?say('Kontoinformation derzeit nicht abrufbar; der Restwert bleibt unbekannt.','Account information unavailable; remaining allowance is still unknown.'):a?.status==='signed-out'?say('Beim Anbieter noch nicht angemeldet.','Not signed in to the provider.'):'');
  }catch{if(ticket===sequence&&root.isConnected){root.hidden=false;title.textContent=say('Abo-Nutzung','Subscription usage');local.textContent=cost.textContent=balance.textContent=plan.textContent=note.textContent='';status.textContent=say('Abo-Information konnte nicht geladen werden.','Subscription information could not be loaded.');}}
 }
 update.onclick=async()=>{if(busy)return;busy=true;update.disabled=true;try{await refresh({refreshAccount:true});}finally{busy=false;update.disabled=false;}};
 open.onclick=async()=>{try{await desktop.openAISubscriptionUsage();}catch{status.textContent=say('Verbrauchsseite konnte nicht geöffnet werden.','Could not open the usage page.');}};
 return {refresh};
}
