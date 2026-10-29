// Model-read-only follow-up measurements, including isolated computation.
export const AI_ANALYSIS_QUERIES={freecad:['inspect'],cad:['bore','bounds','minimumDistance','rayPick','referencePoints','wallThickness','collision'],mesh:['inspectSolid','featureCatalog','sectionContours','lidCatalog','radialClearance','inspect','holeCatalog','repairCatalog','reduceCatalog','largeReduceCatalog','remeshCatalog','smoothCatalog','sculptCatalog','eraseFillCatalog','makeSolidCatalog','hollowCatalog'],app:['joints','jointCollision','contourLinks','projectParameters','projectParameterCatalog','bounds','resources','technicalMesh','modelComparison','sketchTemplate']};
const invalid=message=>{throw Object.assign(Error('KI-Messauftrag: '+message),{code:'AI_ANALYSIS_INVALID'});};
AI_ANALYSIS_QUERIES.python=['run'];AI_ANALYSIS_QUERIES.javascript=['run'];AI_ANALYSIS_QUERIES.workspace=['files','tools'];
AI_ANALYSIS_QUERIES.photo=['measure','grid'];
function plain(value,depth=0,maxText=10000){if(depth>12)invalid('Daten sind zu tief verschachtelt.');if(value===null||typeof value==='boolean'||typeof value==='string'&&value.length<=maxText||typeof value==='number'&&Number.isFinite(value))return;if(Array.isArray(value)){if(value.length>2000)invalid('Liste ist zu lang.');value.forEach(v=>plain(v,depth+1,maxText));return;}if(!value||Object.getPrototypeOf(value)!==Object.prototype)invalid('Nur einfache Messdaten erlaubt.');for(const [key,v]of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(key))invalid('Ungültiger Schlüssel.');plain(v,depth+1,maxText);}}
export function validateAIAnalysis(value){
 if(!Array.isArray(value)||!value.length||value.length>8||JSON.stringify(value).length>(value.some(q=>['python','javascript','workspace'].includes(q?.engine)||q?.engine==='freecad'&&q.options?.script)?450000:12000))invalid('1 bis 8 kompakte Abfragen erforderlich.');const ids=new Set();
 for(const q of value){if(!q||Object.getPrototypeOf(q)!==Object.prototype||Object.keys(q).some(k=>!['id','engine','kind','options','report'].includes(k))||typeof q.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(q.id)||ids.has(q.id)||(!Object.hasOwn(AI_ANALYSIS_QUERIES,q.engine)||!AI_ANALYSIS_QUERIES[q.engine].includes(q.kind))||q.options!==undefined&&(!q.options||Object.getPrototypeOf(q.options)!==Object.prototype))invalid('Eindeutige Kennung und vorhandene reine Messabfrage wählen.');ids.add(q.id);plain(q.options??{},0,["python","javascript","workspace","freecad"].includes(q.engine)?100000:10000);validateAnalysisReport(q.report);
  if(['python','javascript'].includes(q.engine)){
   const o=q.options??{};if(Object.keys(o).some(k=>!['code','name'].includes(k))||typeof o.code!=='string'||!o.code.trim()||o.code.length>100000||o.name!==undefined&&(typeof o.name!=='string'||o.name.length>160))invalid('Lokale Analyse benötigt vollständigen Code und optional name.');
  }
  if(q.engine==='mesh'&&Object.keys(q.options??{}).some(k=>!['id','nodeId','target','options'].includes(k)))invalid('Nur Modellziel und Messoptionen übergeben.');
 }
 return structuredClone(value);
}
export function compactAIAnalysisResult(value,budget=32000){const encoded=JSON.stringify(value);if(!encoded||encoded.length>budget)invalid('Messbericht zu groß. Kleinere Auswahl oder weniger Messpunkte abfragen.');return JSON.parse(encoded);}

// Large computed values remain exact and local. Paging their nested arrays can
// silently change a polygon; rejecting them instead wastes another model round.
export function localAIAnalysisResult(value,{budget=12000,report,save,atomic=false}={}){
 const encoded=JSON.stringify(value);
 if(encoded.length<=budget)return pageAIAnalysisResult(value,report,budget);
 if(!atomic){try{return pageAIAnalysisResult(value,report,budget);}catch(error){if(error.code!=='AI_ANALYSIS_INVALID')throw error;}}
 const path=save(encoded);
 function schema(v,depth=0){
  if(v===null)return {type:'null'};
  if(Array.isArray(v))return {type:'array',count:v.length,...(v.length&&depth<2?{item:schema(v[0],depth+1)}:{})};
  if(typeof v==='object')return {type:'object',fields:Object.fromEntries(Object.entries(v).slice(0,24).map(([k,x])=>[k,depth<2?schema(x,depth+1):{type:Array.isArray(x)?'array':typeof x}]))};
  if(typeof v==='string')return {type:'string',characters:v.length};
  return {type:typeof v};
 }
 const out={workspaceResult:{path,characters:encoded.length,complete:true,format:'json',schema:schema(value)},message:'Complete result saved locally. Read it inside Python with await workspace.read_json(path), or JavaScript JSON.parse(await api.query({engine:"workspace",kind:"files",options:{action:"read",path}})). Select values locally and return a small summary; do not repeat the original measurement. Python results have their user result under .value. No contours or arrays were truncated.'};
 if(JSON.stringify(out).length>budget)out.workspaceResult.schema={type:Array.isArray(value)?'array':typeof value};
 return out;
}

export function validateAnalysisReport(o={}){
 if(!o||Object.getPrototypeOf(o)!==Object.prototype||Object.keys(o).some(k=>!['detail','collection','offset','limit'].includes(k))||!['compact','full'].includes(o.detail??'compact')||o.collection!==undefined&&(typeof o.collection!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(o.collection)||['constructor','prototype','__proto__'].includes(o.collection))||!Number.isSafeInteger(o.offset??0)||(o.offset??0)<0||(o.offset??0)>1000000||!Number.isInteger(o.limit??4)||(o.limit??4)<1||(o.limit??4)>32)invalid('Bericht: detail compact/full, collection, offset ab 0 und limit 1 bis 32 verwenden.');
 return {detail:o.detail??'compact',offset:o.offset??0,limit:o.limit??4,...(o.collection?{collection:o.collection}:{})};
}

// Geometry stays local. Pages disclose counts and continuation offsets; no
// omitted row can be mistaken for a complete list. No server-side cursor/cache.
export function pageAIAnalysisResult(value,report,budget=12000){
 const o=validateAnalysisReport(report);let raw=JSON.parse(JSON.stringify(value));
 // A truncated point/element list is a different contour. Geometry reports are
 // atomic; the caller selects complete loops in the query, never nested pages.
 if(raw?.kind==='meshSectionContours'){
  if(o.collection||o.offset)invalid('Schnittkonturen bleiben vollständig. Teilmengen über options.loopIndices auswählen.');
  if(JSON.stringify(raw).length>budget)invalid('Vollständige Schnittkonturen überschreiten das Berichtbudget. includePoints:false und weniger loopIndices wählen, oder sectionContours lokal im Python-/JavaScript-Programm verwenden.');
  return raw;
 }
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
