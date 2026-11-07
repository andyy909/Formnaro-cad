const isObject=value=>value&&typeof value==='object'&&!Array.isArray(value);
const alias=value=>typeof value==='string'&&/^\$[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(value);
const checkKinds=new Set(['size','bounds','volume','solids','distance','bore','clearance','radialClearance','surfaceDeviation','freecad','photoScale','photoLength','jointValue']);

function validatePracticeQuality(value){
 if(value===undefined)return undefined;
 if(!isObject(value)||Object.keys(value).some(key=>!['mode','criteria','enabled'].includes(key))||
  !['off','report','enforce'].includes(value.mode)||!Array.isArray(value.criteria)||value.criteria.length>12)
  throw Error('Ungültige Konfiguration für Übungsprüfungen.');
 const ids=new Set();
 const criteria=value.criteria.map(entry=>{
  if(!isObject(entry)||Object.keys(entry).some(key=>!['id','source','check'].includes(key))||
   typeof entry.id!=='string'||!/^[-a-z0-9]{1,50}$/.test(entry.id)||ids.has(entry.id)||
   typeof entry.source!=='string'||!entry.source.trim()||entry.source.length>160)
   throw Error('Übungsprüfung braucht eindeutige Kennung und Herkunft des Sollwerts.');
  const check=entry.check;
  if(!isObject(check)||!checkKinds.has(check.kind)||JSON.stringify(check).length>1200||
   !alias(check.target)||check.other!==undefined&&!alias(check.other))
   throw Error('Übungsprüfung benötigt einen semantischen Bauteilalias.');
  if(check.kind==='freecad'&&Object.keys(check).some(key=>!['kind','target'].includes(key)))
   throw Error('FreeCAD prüft die gültige geschlossene Geometrie des ausgewählten Körpers.');
  if(['photoScale','photoLength'].includes(check.kind)){
   const length=check.kind==='photoLength';
   if(!/^\$photo-[1-4]$/.test(check.target)||![check.expected,check.tolerance].every(n=>Number.isFinite(n)&&n>0)||
    Object.keys(check).some(key=>!['kind','target','expected','tolerance',...(length?['measurementIndex','expectedPoints','pointTolerancePx']:[])].includes(key))||
    length&&(!Number.isSafeInteger(check.measurementIndex)||check.measurementIndex<0||check.measurementIndex>39))
    throw Error('Die Fotoprüfung benötigt ein bereitgestelltes Foto, einen festen Sollwert und eine feste Toleranz.');
   if(length&&(check.expectedPoints!==undefined||check.pointTolerancePx!==undefined)&&(
    !Array.isArray(check.expectedPoints)||check.expectedPoints.length!==2||
    !check.expectedPoints.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&n>=0))||
    !Number.isFinite(check.pointTolerancePx)||check.pointTolerancePx<=0))
    throw Error('Eine feste Fotomessstelle benötigt zwei Originalpixelpunkte und eine Pixeltoleranz.');
  }
  if(check.kind==='jointValue'&&(!['revolute','prismatic'].includes(check.jointKind)||!Number.isFinite(check.expected)||
   !Number.isFinite(check.tolerance)||check.tolerance<=0||Object.keys(check).some(key=>!['kind','target','jointKind','expected','tolerance'].includes(key))))
   throw Error('Die Gelenkprüfung benötigt einen festen Winkel oder Weg mit Toleranz.');
  ids.add(entry.id);
  return {id:entry.id,source:entry.source,check:structuredClone(check)};
 });
 if(value.enabled!==undefined&&(!Array.isArray(value.enabled)||new Set(value.enabled).size!==value.enabled.length||
  value.enabled.some(id=>!ids.has(id))))throw Error('Unbekannte freigegebene Übungsprüfung.');
 return {mode:value.mode,criteria,...(value.enabled===undefined?{}:{enabled:[...value.enabled]})};
}

module.exports={validatePracticeQuality};
