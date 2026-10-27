import {validatePhotoReference,photoBounds,PHOTO_VIEWS} from './cad-photo-data.js';
import {photoPlane,projectPhotoPoint,photoPlaneContains} from './cad-photo-perspective.js';
import {cadGeometryDigest} from './cad-geometry-digest.js';

export const PHOTO_SET_VIEWS=Object.freeze(['front','right','top']);
export const PHOTO_SET_AXES=Object.freeze({front:[0,2,1],right:[1,2,0],top:[0,1,2]});
export const PHOTO_SET_LABELS=Object.freeze({front:'Vorderansicht · X/Z',right:'Seitenansicht · Y/Z',top:'Draufsicht · X/Y'});
const fail=m=>{throw Object.assign(Error('Mehrere Fotoansichten: '+m),{code:'PHOTO_SET_INVALID'});};
const fields=(v,allowed)=>{if(!v||Object.getPrototypeOf(v)!==Object.prototype||Object.keys(v).some(k=>!allowed.includes(k)))fail('Unbekannte oder ungültige Felder.');};
const text=(v,n=160)=>{if(typeof v!=='string'||!v.trim()||v.length>n||/[\x00-\x1f]/.test(v))fail('Name oder Begründung fehlt.');return v;};
const finite=(v,lo,hi)=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
const signature=v=>{if(typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))fail('Ungültige Referenzprüfsumme.');return v;};
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v===0?0:v;
export const photoReferenceDigest=r=>cadGeometryDigest(JSON.stringify(canonical(validatePhotoReference(r))));
export function validatePhotoSet(value){
 fields(value,['version','id','name','views','dimensions','placement','fitDimensions','assumptions','functionalChecks','result']);
 if(value.version!==1)fail('Unbekannte Ansichtssatzversion.');
 const p={version:1,id:text(value.id,100),name:text(value.name),views:[],dimensions:[],placement:[],fitDimensions:value.fitDimensions,assumptions:[]};
 if(!Array.isArray(value.views)||value.views.length>3||!Array.isArray(value.dimensions)||value.dimensions.length>3||!Array.isArray(value.assumptions)||value.assumptions.length>12||typeof p.fitDimensions!=='boolean')fail('Ansichten, Zielmaße und Annahmen prüfen.');
 const seen=new Set(),images=new Set();
 for(const v of value.views){fields(v,['view','imageId','referenceDigest','origin','holeMode']);if(!PHOTO_SET_VIEWS.includes(v.view)||seen.has(v.view)||!/^photo-[a-f0-9]{16}$/.test(v.imageId)||images.has(v.imageId)||!['unresolved','through'].includes(v.holeMode)||!Array.isArray(v.origin)||v.origin.length!==2||v.origin.some(n=>!finite(n,0,100000)))fail('Eindeutige Ansichten, Original-Nullpunkte und Öffnungsart wählen.');seen.add(v.view);images.add(v.imageId);p.views.push({view:v.view,imageId:v.imageId,referenceDigest:signature(v.referenceDigest),origin:[...v.origin],holeMode:v.holeMode});}
 const axes=new Set();for(const d of value.dimensions){fields(d,['axis','mm','toleranceMm','source','note']);if(![0,1,2].includes(d.axis)||axes.has(d.axis)||!finite(d.mm,.01,10000)||!finite(d.toleranceMm,.000001,.1)||!['user','assumed'].includes(d.source))fail('Eindeutige X/Y/Z-Zielmaße mit nativer Toleranz 0,000001 bis 0,1 mm angeben.');axes.add(d.axis);p.dimensions.push({axis:d.axis,mm:d.mm,toleranceMm:d.toleranceMm,source:d.source,note:text(d.note,300)});}
 if(!Array.isArray(value.placement)||value.placement.length!==3||value.placement.some(n=>!finite(n,-10000,10000)))fail('Gemeinsamen Welt-Nullpunkt innerhalb ±10000 mm angeben.');p.placement=[...value.placement];p.assumptions=value.assumptions.map(s=>text(s,300));
 p.views.sort((a,b)=>PHOTO_SET_VIEWS.indexOf(a.view)-PHOTO_SET_VIEWS.indexOf(b.view));p.dimensions.sort((a,b)=>a.axis-b.axis);
 if(value.functionalChecks!==undefined){
  if(!Array.isArray(value.functionalChecks)||value.functionalChecks.length>8)fail('Höchstens acht zusätzliche native Funktionsprüfungen.');
  const ids=new Set(),checks=value.functionalChecks.map(c=>{fields(c,['id','name','kind','from','to','diameter','tolerance','minWall','source','note']);const id=text(c.id,100);if(ids.has(id))fail('Doppelte Funktionsprüfung.');ids.add(id);if(!['clearance','bore'].includes(c.kind)||!['user','assumed'].includes(c.source)||!finite(c.diameter,.01,10000)||!finite(c.tolerance,.000001,.1)||c.diameter<=2*c.tolerance||![c.from,c.to].every(p=>Array.isArray(p)&&p.length===3&&p.every(n=>finite(n,-10000,10000)))||Math.hypot(...c.to.map((n,k)=>n-c.from[k]))<.01)fail('Funktionsprüfung: gemeinsame XYZ-Achse, Durchmesser, native Toleranz und Herkunft angeben.');if(c.kind==='bore'&&!finite(c.minWall,2*c.tolerance+1e-8,10000))fail('Bohrungsprüfung: Materialrand muss größer als die doppelte native Toleranz sein.');return {id,name:text(c.name),kind:c.kind,from:[...c.from],to:[...c.to],diameter:c.diameter,tolerance:c.tolerance,...(c.kind==='bore'?{minWall:c.minWall}:{}),source:c.source,note:text(c.note,300)};});if(checks.length)p.functionalChecks=checks;
 }
 if(value.result!==undefined){fields(value.result,['rootId','sourceDigest','planDigest']);p.result={rootId:text(value.result.rootId,200),sourceDigest:signature(value.result.sourceDigest),planDigest:signature(value.result.planDigest)};}
 if(JSON.stringify(p).length>12000)fail('Ansichtssatz zu groß.');return p;
}
export function photoSetDigest(value){const {result,...plan}=validatePhotoSet(value);return cadGeometryDigest(JSON.stringify(canonical(plan)));}
export function validatePhotoProvenance(value){fields(value,['version','plan']);if(value.version!==1)fail('Unbekannte Rekonstruktionsherkunft.');const plan=validatePhotoSet(value.plan);if(plan.result)fail('Herkunft darf keine Ergebnisverknüpfung enthalten.');return {version:1,plan};}
export function photoMetricReference(value){
 const r=validatePhotoReference(value),plane=r.version===2?photoPlane(r.perspective,r.width,r.height):null,scale=r.scale.mm/Math.hypot(...r.scale.points[0].map((v,k)=>v-r.scale.points[1][k]));
 const map=p=>plane?projectPhotoPoint(plane.toPlane,p):p.map(n=>n*scale),outline=r.outline.map(map),holes=r.holes.map(h=>h.map(map)),bounds=outline.length?photoBounds(outline):null;
 // Deliberately disclosed first-order image estimate. It is never
 // substituted for the independent native functional-dimension tolerance.
 const uncertaintyMm=plane?2*plane.estimatedCornerUncertaintyMm+2*Math.SQRT2*r.perspective.pickErrorPx*plane.worstMmPerPixel:2*Math.SQRT2*r.scale.pickErrorPx*scale+(bounds?Math.max(...bounds.max.map((n,k)=>n-bounds.min[k])):r.scale.mm)*(Math.SQRT2*r.scale.pickErrorPx/Math.hypot(...r.scale.points[0].map((v,k)=>v-r.scale.points[1][k]))+r.scale.referenceErrorMm/r.scale.mm);
 return {reference:r,map,outline,holes,bounds,uncertaintyMm,scope:'First-order image and calibration estimate; lens error, depth and manufacturing tolerances are not proved.'};
}
export function photoSetViewDefault(reference){if(!reference.outline?.length)fail('Zuerst eine Außenkontur bestätigen.');const m=photoMetricReference(reference),b=photoBounds(reference.outline);let origin=[b.min[0],b.max[1]];if(reference.version===2&&m.bounds){const plane=photoPlane(reference.perspective,reference.width,reference.height);origin=projectPhotoPoint(plane.toOriginal,[m.bounds.min[0],m.bounds.max[1]]);}return {view:reference.view,imageId:reference.imageId,referenceDigest:photoReferenceDigest(reference),origin,holeMode:'unresolved'};}
export function analyzePhotoSet(items,value){
 const plan=validatePhotoSet(value),issues=[],views=[],observations=[[],[],[]],add=(code,message,view)=>issues.push({code,message,...(view?{view}:{})});
 for(const key of PHOTO_SET_VIEWS){const selected=plan.views.find(v=>v.view===key);if(!selected){add('MISSING_VIEW',PHOTO_SET_LABELS[key]+' fehlt.',key);continue;}
  const item=items.find(i=>i.reference.imageId===selected.imageId);if(!item){add('MISSING_REFERENCE','Gespeichertes Originalbild fehlt. Ansicht neu zuordnen.',key);continue;}
  const r=validatePhotoReference(item.reference);if(photoReferenceDigest(r)!==selected.referenceDigest){add('STALE_REFERENCE','Markierungen, Kalibrierung oder Ansicht wurden geändert. Ansicht ausdrücklich neu zuordnen.',key);continue;}
  if(r.view!==key){add('WRONG_VIEW','Fotobeschriftung und zugeordnete technische Ansicht widersprechen sich.',key);continue;}
  if(!r.outline.length){add('MISSING_OUTLINE','Bestätigte Außenkontur fehlt.',key);continue;}
  if(selected.origin.some((n,k)=>n>(k===0?r.width:r.height))||r.version===2&&!photoPlaneContains(r.perspective.points,selected.origin)){add('ORIGIN_OUTSIDE','Gemeinsamen Nullpunkt im Original und innerhalb der kalibrierten Ebene wählen.',key);continue;}
  const metric=photoMetricReference(r),origin=metric.map(selected.origin),points=metric.outline.map(p=>[p[0]-origin[0],origin[1]-p[1]]),holes=metric.holes.map(h=>h.map(p=>[p[0]-origin[0],origin[1]-p[1]])),bounds=photoBounds(points),axes=PHOTO_SET_AXES[key];
  if(metric.outline.length+metric.holes.reduce((n,h)=>n+h.length,0)>128)add('PROFILE_BUDGET','Die native Skizze unterstützt insgesamt 128 Konturpunkte. Kontur gezielt vereinfachen.',key);
  if(r.holes.length&&selected.holeMode!=='through')add('UNRESOLVED_OPENINGS','Sichtbare Öffnungen: Verlauf durch das Teil ausdrücklich bestätigen oder weitere Maße/Konturen liefern.',key);
  const pixelBounds=photoBounds(r.outline);if(bounds.max.some((n,k)=>n-bounds.min[k]<8*metric.uncertaintyMm)||pixelBounds.max.some((n,k)=>n-pixelBounds.min[k]<12))add('LOW_RESOLUTION','Kontur gegenüber der Bildunsicherheit zu klein. Näher fotografieren oder genauere Markierungen anlegen.',key);
  for(let k=0;k<2;k++)observations[axes[k]].push({view:key,min:bounds.min[k],max:bounds.max[k],uncertaintyMm:metric.uncertaintyMm});
  views.push({view:key,selection:selected,reference:r,points,holes,bounds,origin,uncertaintyMm:metric.uncertaintyMm});
 }
 const ranges=observations.map((rows,axis)=>{
  const dimension=plan.dimensions.find(d=>d.axis===axis);if(!dimension)add('MISSING_DIMENSION','Bestätigtes gemeinsames '+['X','Y','Z'][axis]+'-Maß fehlt.');
  if(rows.length===2){const [a,b]=rows,allowed=a.uncertaintyMm+b.uncertaintyMm;if(Math.max(Math.abs(a.min-b.min),Math.abs(a.max-b.max))>allowed+1e-8)add('AXIS_CONFLICT',['X','Y','Z'][axis]+': Nullpunkte oder Maßbereiche aus '+PHOTO_SET_LABELS[a.view]+' und '+PHOTO_SET_LABELS[b.view]+' widersprechen sich.');}
  if(dimension)for(const row of rows)if(Math.abs(row.max-row.min-dimension.mm)>row.uncertaintyMm+dimension.toleranceMm)add('DIMENSION_CONFLICT',['X','Y','Z'][axis]+': Foto '+PHOTO_SET_LABELS[row.view]+' widerspricht dem bestätigten Zielmaß.',row.view);
  return {axis,min:rows.length?rows.reduce((n,r)=>n+r.min,0)/rows.length:0,size:dimension?.mm??null,observations:rows};
 });
 if(!plan.fitDimensions)add('UNCONFIRMED_FIT','Anpassung der CAD-Konturen an bestätigte Zielmaße innerhalb der Bildunsicherheit ausdrücklich bestätigen.');
 if(!plan.assumptions.length)add('UNKNOWN_INTERIOR','Annahme zur nicht sichtbaren Geometrie angeben. Drei Silhouetten bestimmen keine inneren Hohlräume.');
 return {plan,views,ranges,issues,canBuild:issues.length===0,scope:'Intersection of explicitly registered silhouette extrusions, not a unique reconstruction of invisible geometry. Native dimensions are checked separately.'};
}
