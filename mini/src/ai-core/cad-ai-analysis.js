// Read-only follow-up measurements. No executable code or external resources.
export const AI_ANALYSIS_QUERIES={cad:['bounds','minimumDistance','rayPick','referencePoints','wallThickness','collision'],mesh:['inspectSolid','featureCatalog','lidCatalog','radialClearance','inspect','holeCatalog','repairCatalog','reduceCatalog','remeshCatalog','smoothCatalog','sculptCatalog','eraseFillCatalog','makeSolidCatalog','hollowCatalog'],app:['bounds','resources']};
const invalid=message=>{throw Object.assign(Error('KI-Messauftrag: '+message),{code:'AI_ANALYSIS_INVALID'});};
function plain(value,depth=0){if(depth>12)invalid('Daten sind zu tief verschachtelt.');if(value===null||typeof value==='boolean'||typeof value==='string'&&value.length<=10000||typeof value==='number'&&Number.isFinite(value))return;if(Array.isArray(value)){if(value.length>2000)invalid('Liste ist zu lang.');value.forEach(v=>plain(v,depth+1));return;}if(!value||Object.getPrototypeOf(value)!==Object.prototype)invalid('Nur einfache Messdaten erlaubt.');for(const [key,v]of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(key))invalid('Ungültiger Schlüssel.');plain(v,depth+1);}}
export function validateAIAnalysis(value){
 if(!Array.isArray(value)||!value.length||value.length>8||JSON.stringify(value).length>12000)invalid('1 bis 8 kompakte Abfragen erforderlich.');const ids=new Set();
 for(const q of value){if(!q||Object.getPrototypeOf(q)!==Object.prototype||Object.keys(q).some(k=>!['id','engine','kind','options','report'].includes(k))||typeof q.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(q.id)||ids.has(q.id)||(!Object.hasOwn(AI_ANALYSIS_QUERIES,q.engine)||!AI_ANALYSIS_QUERIES[q.engine].includes(q.kind))||q.options!==undefined&&(!q.options||Object.getPrototypeOf(q.options)!==Object.prototype))invalid('Eindeutige Kennung und vorhandene reine Messabfrage wählen.');ids.add(q.id);plain(q.options??{});validateAnalysisReport(q.report);
  if(q.engine==='mesh'&&Object.keys(q.options??{}).some(k=>!['id','nodeId','target','options'].includes(k)))invalid('Nur Modellziel und Messoptionen übergeben.');
 }
 return structuredClone(value);
}
export function compactAIAnalysisResult(value){const encoded=JSON.stringify(value);if(!encoded||encoded.length>32000)invalid('Messbericht zu groß. Kleinere Auswahl oder weniger Messpunkte abfragen.');return JSON.parse(encoded);}

export function validateAnalysisReport(o={}){
 if(!o||Object.getPrototypeOf(o)!==Object.prototype||Object.keys(o).some(k=>!['detail','collection','offset','limit'].includes(k))||!['compact','full'].includes(o.detail??'compact')||o.collection!==undefined&&(typeof o.collection!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(o.collection)||['constructor','prototype','__proto__'].includes(o.collection))||!Number.isSafeInteger(o.offset??0)||(o.offset??0)<0||(o.offset??0)>1000000||!Number.isInteger(o.limit??4)||(o.limit??4)<1||(o.limit??4)>32)invalid('Bericht: detail compact/full, collection, offset ab 0 und limit 1 bis 32 verwenden.');
 return {detail:o.detail??'compact',offset:o.offset??0,limit:o.limit??4,...(o.collection?{collection:o.collection}:{})};
}

// Geometry stays local. Pages disclose counts and continuation offsets; no
// omitted row can be mistaken for a complete list. No server-side cursor/cache.
export function pageAIAnalysisResult(value,report,budget=12000){
 const o=validateAnalysisReport(report);let raw=JSON.parse(JSON.stringify(value));
 if(report===undefined&&JSON.stringify(raw).length<=budget)return raw;
 if(Array.isArray(raw))raw={items:raw};
 if(o.collection&&(!raw||!Object.hasOwn(raw,o.collection)||!Array.isArray(raw[o.collection])))invalid('Die gewünschte Berichtsliste existiert nicht.');
 for(let limit=o.limit;limit>=1;limit--){
  const pages=[];
  function visit(v,path='',depth=0){
   if(depth>12)invalid('Messbericht zu tief verschachtelt.');
   if(Array.isArray(v)){
    if(v.length<=16&&v.every(x=>typeof x==='number')||path.includes('[')&&v.length<=16&&v.every(x=>x===null||['number','string','boolean'].includes(typeof x)))return v;
    const offset=path===o.collection||!o.collection&&!path.includes('[')&&!path.includes('.')?o.offset:0,rows=v.slice(offset,offset+limit);
    if(!path.includes('[')||rows.length!==v.length)pages.push({collection:path,total:v.length,offset,returned:rows.length,nextOffset:offset+rows.length<v.length?offset+rows.length:null});
    return rows.map((x,i)=>visit(x,path+'['+(offset+i)+']',depth+1));
   }
   if(!v||typeof v!=='object')return v;
   return Object.fromEntries(Object.entries(v).filter(([k,x])=>!o.collection||path!==''||!Array.isArray(x)||k===o.collection).map(([k,x])=>[k,visit(x,path?path+'.'+k:k,depth+1)]));
  }
  // Full preserves small reports, or a specifically selected list page. Large
  // full reports automatically become a disclosed compact page.
  if(o.detail==='full'&&!o.collection&&!o.offset&&JSON.stringify(raw).length<=budget)return raw;
  const data=visit(raw);
  if(data&&typeof data==='object'&&!Array.isArray(data))data.reportPage={detail:'compact',requestedDetail:o.detail,pages,omittedCollections:o.collection?Object.keys(raw).filter(k=>Array.isArray(raw[k])&&k!==o.collection):[],revisionBound:true};
  if(JSON.stringify(data).length<=budget)return data;
 }
 invalid('Messbericht enthält einen zu großen Einzelwert. Eine konkrete collection und kleinere Auswahl abfragen.');
}
