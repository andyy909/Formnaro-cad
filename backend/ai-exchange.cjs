const fs=require('node:fs'),path=require('node:path');
const {writeAtomicSync}=require('./program-storage.cjs');
const URL='https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
const FALLBACK={usdPerEur:1.1133,date:'2026-10-28',source:'ECB'};
function valid(value){return !!value&&value.source==='ECB'&&Number.isFinite(value.usdPerEur)&&value.usdPerEur>0.1&&value.usdPerEur<10&&/^\d{4}-\d{2}-\d{2}$/.test(value.date)&&Number.isFinite(Date.parse(value.date+'T00:00:00Z'));}
function parseECB(xml){
 if(typeof xml!=='string'||xml.length>65536)throw Error('Ungültige EZB-Kursdatei.');
 const date=xml.match(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/),usd=xml.match(/<Cube\s+currency=['"]USD['"]\s+rate=['"]([\d.]+)['"]\s*\/>/);
 const value={usdPerEur:Number(usd?.[1]),date:date?.[1],source:'ECB'};if(!valid(value))throw Error('Kein gültiger USD-Referenzkurs in der EZB-Datei.');return value;
}
function createAIExchange({file,fetcher=(...args)=>globalThis.fetch(...args),write=writeAtomicSync}={}){
 let rate={...FALLBACK};
 try{const stat=fs.lstatSync(file);if(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=1024){const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(valid(saved)&&saved.date>=rate.date)rate=saved;}}catch{/* Keep the dated bundled rate. */}
 const get=()=>({...rate});
 async function refresh(){
  const response=await fetcher(URL,{signal:AbortSignal.timeout(10000),redirect:'error'});if(!response.ok)throw Error('EZB-Kurs konnte nicht geladen werden.');
  if(Number(response.headers.get('content-length'))>65536)throw Error('EZB-Kursdatei ist zu groß.');
  const next=parseECB(await response.text());if(next.date<rate.date)throw Error('Die EZB-Antwort ist älter als der gespeicherte Kurs.');
  fs.mkdirSync(path.dirname(file),{recursive:true});write(file,JSON.stringify(next)+'\n');rate=next;return get();
 }
 return {get,refresh};
}
module.exports={createAIExchange,parseECB,URL,FALLBACK};
