// ECB reference rate, used only for an explicitly approximate display.
// It is replaced by the locally cached rate when the desktop bridge is ready.
const fallback={usdPerEur:1.1133,date:'2026-10-28',source:'ECB'};
let current={...fallback};
export function setAIExchangeRate(rate){
 if(rate&&rate.source==='ECB'&&Number.isFinite(rate.usdPerEur)&&rate.usdPerEur>0.1&&rate.usdPerEur<10&&/^\d{4}-\d{2}-\d{2}$/.test(rate.date))current={usdPerEur:rate.usdPerEur,date:rate.date,source:'ECB'};
 return getAIExchangeRate();
}
export function getAIExchangeRate(){return {...current};}
export function formatAICostUSD(cost,language='de'){
 if(!cost||!Number.isFinite(cost.min)||!Number.isFinite(cost.max))return language==='en'?'Price unknown':'Preis unbekannt';
 const en=language==='en',n=value=>value.toLocaleString(en?'en-US':'de-DE',{minimumFractionDigits:4,maximumFractionDigits:6}),range=(min,max)=>min===max?n(min):n(min)+'–'+n(max),rate=getAIExchangeRate();
 const date=en?rate.date:rate.date.split('-').reverse().join('.');
 return range(cost.min,cost.max)+' USD (≈ '+range(cost.min/rate.usdPerEur,cost.max/rate.usdPerEur)+' EUR; '+(en?'ECB ':'EZB ')+date+')';
}
