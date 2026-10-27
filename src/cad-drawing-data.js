import {cadSourceGeometryDigest} from './cad-geometry-digest.js';
import {CAD_DRAWING_POINT_ROLES,cadDrawingCurvePoint} from './cad-drawing-measure.js';

// Drawing data is deliberately kernel-free. Validation, paper layout and text
// movement never schedule a projection or alter a confirmed source body.
const fail=message=>{const error=Error('Zeichnung: '+message);error.code='INVALID_CAD_DRAWING';throw error;};
const record=(v,keys)=>{if(!v||![Object.prototype,null].includes(Object.getPrototypeOf(v))||Object.keys(v).some(k=>!keys.includes(k)))fail('Unbekannte oder ungültige Felder.');};
const number=(v,min=-1e6,max=1e6)=>{if(!Number.isFinite(v)||v<min||v>max)fail('Zahl außerhalb des zulässigen Bereichs.');return v===0?0:v;};
const text=(v,max=200)=>{if(typeof v!=='string'||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))fail('Ungültiger Text.');return v;};
const id=v=>{text(v,200);if(!v||/[\r\n]/.test(v))fail('Ungültige Kennung.');return v;};
const point=v=>{if(!Array.isArray(v)||v.length!==2)fail('2D-Punkt erforderlich.');return v.map(n=>number(n));};
const list=(v,max,label)=>{if(!Array.isArray(v)||v.length>max)fail(label+' überschreitet die Grenze.');return v;};
const enumeration=(v,values)=>{if(!values.includes(v))fail('Unbekannter Wert.');return v;};
const unique=(values,label)=>{if(new Set(values).size!==values.length)fail('Doppelte '+label+'.');};
const boolean=v=>{if(typeof v!=='boolean')fail('Wahrheitswert erforderlich.');return v;};
const signatures=value=>{const out=list(value,128,'Quellenbezüge').map(s=>{record(s,['id','signature']);if(typeof s.signature!=='string'||!/^[a-f0-9]{64}$/.test(s.signature))fail('Ungültige Quellensignatur.');return {id:id(s.id),signature:s.signature};});unique(out.map(s=>s.id),'Quellenkennungen');return out;};
const sourceReferences=value=>{const out=list(value,8,'Stabile Kantenbezüge').map(reference=>{record(reference,['source','role','elementId','geometrySignature']);record(reference.source,['rootId','path']);const out={source:{rootId:id(reference.source.rootId),path:list(reference.source.path,12,'Quellenpfad').map(id)},role:text(reference.role,300)};if(!out.role||/[\r\n]/.test(out.role))fail('Stabile Kantenrolle erforderlich.');if(reference.elementId!==undefined)out.elementId=text(reference.elementId,100);if(reference.geometrySignature!==undefined){if(!/^[a-f0-9]{64}$/.test(reference.geometrySignature))fail('Ungültige STEP-Geometriesignatur.');out.geometrySignature=reference.geometrySignature;}if(out.role.startsWith('step.edge.exact.')&&!out.geometrySignature)fail('STEP-Kanten benötigen den unveränderten Originalkörper.');return out;});if(!out.length)fail('Mindestens ein stabiler Kantenbezug erforderlich.');unique(out.map(reference=>JSON.stringify(reference)),'Kantenbezüge');return out;};
const referenceKey=references=>JSON.stringify(references.map(reference=>JSON.stringify({source:{rootId:reference.source.rootId,path:reference.source.path},role:reference.role,...(reference.elementId!==undefined?{elementId:reference.elementId}:{}),...(reference.geometrySignature!==undefined?{geometrySignature:reference.geometrySignature}:{})})).sort());
export const CAD_DRAWING_LIMITS=Object.freeze({sheets:16,views:32,annotations:1000,curves:20000,points:200000});
export const cadDrawingId=prefix=>prefix+'-'+globalThis.crypto.randomUUID();

function curve(value){
 const common=['id','kind','hidden','sourceReferences'],fields={line:['a','b'],circle:['center','radius'],arc:['center','radius','startAngle','endAngle','clockwise'],ellipse:['center','radii','xAxis','yAxis','startAngle','endAngle','clockwise','closed'],bezier:['poles','weights'],polyline:['points','maxDeviation','proof']};
 if(!value||!Object.hasOwn(fields,value.kind))fail('Unbekannte Projektionskurve.');record(value,[...common,...fields[value.kind]]);
 const out={id:id(value.id),kind:value.kind,hidden:value.hidden===undefined?false:boolean(value.hidden)};
 if(value.sourceReferences!==undefined)out.sourceReferences=sourceReferences(value.sourceReferences);
 if(value.kind==='line'){out.a=point(value.a);out.b=point(value.b);if(Math.hypot(...out.a.map((v,k)=>v-out.b[k]))<1e-12)fail('Leere Projektionslinie.');}
 if(['circle','arc','ellipse'].includes(value.kind))out.center=point(value.center);
 if(['circle','arc'].includes(value.kind))out.radius=number(value.radius,1e-12,1e6);
 if(['arc','ellipse'].includes(value.kind)){out.startAngle=number(value.startAngle,-1e6,1e6);out.endAngle=number(value.endAngle,-1e6,1e6);out.clockwise=boolean(value.clockwise);}
 if(value.kind==='ellipse'){
  if(!Array.isArray(value.radii)||value.radii.length!==2)fail('Ellipsenradien fehlen.');out.radii=value.radii.map(v=>number(v,1e-12,1e6));out.xAxis=point(value.xAxis);out.yAxis=point(value.yAxis);out.closed=boolean(value.closed);
  if(Math.abs(Math.hypot(...out.xAxis)-1)>1e-7||Math.abs(Math.hypot(...out.yAxis)-1)>1e-7||Math.abs(out.xAxis[0]*out.yAxis[0]+out.xAxis[1]*out.yAxis[1])>1e-7)fail('Ellipsenachsen müssen orthonormal sein.');
 }
 if(value.kind==='bezier'){
  out.poles=list(value.poles,26,'Bézierpole').map(point);if(out.poles.length<2)fail('Bézierkurve benötigt mindestens zwei Pole.');
  out.weights=list(value.weights,26,'Béziergewichte').map(v=>number(v,1e-14,1e14));if(out.weights.length!==out.poles.length)fail('Béziergewichte passen nicht zu den Polen.');
 }
 if(value.kind==='polyline'){
  out.points=list(value.points,CAD_DRAWING_LIMITS.points,'Kurvenpunkte').map(point);if(out.points.length<2)fail('Linienzug benötigt zwei Punkte.');out.maxDeviation=number(value.maxDeviation,0,.1);out.proof=enumeration(value.proof,['positive-rational-bezier-control-hull']);
 }
 return out;
}

export function validateCadDrawingProjection(value){
 record(value,['kind','view','frame','curves','bounds','sourceSignatures','tolerance','approximation']);
 if(value.kind!=='cad-drawing-projection')fail('Native Zeichnungsprojektion erforderlich.');
 const out={kind:value.kind,view:enumeration(value.view,['front','side','top','section'])};
 if(!Array.isArray(value.frame)||value.frame.length!==16)fail('Projektionsbezug fehlt.');out.frame=value.frame.map(v=>number(v));
 out.curves=list(value.curves,CAD_DRAWING_LIMITS.curves,'Projektionskurven').map(curve);unique(out.curves.map(c=>c.id),'Kurvenkennungen');
 let points=0;for(const c of out.curves)points+=c.points?.length??c.poles?.length??2;if(points>CAD_DRAWING_LIMITS.points)fail('Gesamte Projektionspunktgrenze überschritten.');
 record(value.bounds,['min','max']);out.bounds={min:point(value.bounds.min),max:point(value.bounds.max)};if(out.bounds.max.some((v,k)=>v<out.bounds.min[k]))fail('Ungültige Projektionsgrenzen.');
 out.sourceSignatures=signatures(value.sourceSignatures);
 if(out.curves.some(curve=>curve.sourceReferences?.some(reference=>!out.sourceSignatures.some(source=>source.id===reference.source.rootId))))fail('Kantenbezug gehört zu einer fremden Projektionsquelle.');
 out.tolerance=number(value.tolerance,1e-7,.1);out.approximation=text(value.approximation,200);return out;
}

export function validateCadDrawingSheet(value){
 record(value,['id','name','paper','orientation','scale','titleBlock','views','annotations']);
 const out={id:id(value.id),name:text(value.name),paper:enumeration(value.paper,['A4','A3']),orientation:enumeration(value.orientation,['portrait','landscape']),scale:number(value.scale,.001,1000)};
 record(value.titleBlock,['title','number','revision','author','date']);out.titleBlock={};for(const key of ['title','number','revision','author','date'])out.titleBlock[key]=text(value.titleBlock[key]??'',key==='title'?500:200);
 out.views=list(value.views,CAD_DRAWING_LIMITS.views,'Ansichten').map(v=>{
  record(v,['id','kind','sourceIds','position','section','projection']);const view={id:id(v.id),kind:enumeration(v.kind,['front','side','top','section']),sourceIds:list(v.sourceIds,128,'Ansichtsquellen').map(id),position:point(v.position)};
  if(!view.sourceIds.length)fail('Ansicht benötigt mindestens ein CAD-Teil.');unique(view.sourceIds,'Ansichtsquellen');
  if(v.kind==='section'){record(v.section,['axis','offset']);view.section={axis:enumeration(v.section.axis,[0,1,2]),offset:number(v.section.offset,-100000,100000)};}else if(v.section!==undefined)fail('Schnittdaten nur für Schnittansichten.');
  if(v.projection!==undefined){view.projection=validateCadDrawingProjection(v.projection);if(view.projection.view!==view.kind)fail('Projektion gehört zu einer anderen Ansichtsart.');}
  return view;
 });unique(out.views.map(v=>v.id),'Ansichtskennungen');
 out.annotations=list(value.annotations,CAD_DRAWING_LIMITS.annotations,'Beschriftungen').map(a=>{
  if(a?.kind==='label'){record(a,['id','kind','text','position']);return {id:id(a.id),kind:a.kind,text:text(a.text,1000),position:point(a.position)};}
  record(a,['id','kind','viewId','curveIds','position','sourceSignatures','curveReferences','unresolved','axis','anchors']);const item={id:id(a.id),kind:enumeration(a.kind,['length','angle','radius','diameter','distance']),viewId:id(a.viewId),curveIds:list(a.curveIds,2,'Maßbezüge').map(id),position:point(a.position)};if(a.sourceSignatures!==undefined)item.sourceSignatures=signatures(a.sourceSignatures);if(a.unresolved!==undefined)item.unresolved=boolean(a.unresolved);if(a.curveReferences!==undefined)item.curveReferences=list(a.curveReferences,2,'Stabile Maßbezüge').map(reference=>{record(reference,['sourceReferences']);return {sourceReferences:sourceReferences(reference.sourceReferences)};});
  if(item.kind==='distance'){item.axis=enumeration(a.axis,['x','y']);item.anchors=list(a.anchors,2,'Maßpunkte').map(anchor=>{record(anchor,['curveIndex','point']);return {curveIndex:enumeration(anchor.curveIndex,[0,1]),point:enumeration(anchor.point,CAD_DRAWING_POINT_ROLES)};});if(item.anchors.length!==2||item.anchors.some(anchor=>anchor.curveIndex>=item.curveIds.length)||item.curveIds.some((_,index)=>!item.anchors.some(anchor=>anchor.curveIndex===index)))fail('Maßpunkte passen nicht zu den gewählten Kanten.');}else if(a.axis!==undefined||a.anchors!==undefined)fail('Maßpunkte nur für Abstandsmaße.');
  if(item.curveReferences&&item.curveReferences.length!==item.curveIds.length)fail('Stabile Maßbezüge passen nicht zu den gewählten Kanten.');
  if(item.kind==='distance'?!item.curveIds.length:item.curveIds.length!==(item.kind==='angle'?2:1))fail('Unpassende Anzahl der Maßbezüge.');unique(item.curveIds,'Maßbezüge');return item;
 });unique(out.annotations.map(a=>a.id),'Beschriftungskennungen');return out;
}

export function validateCadDrawings(value){record(value,['version','sheets']);if(value.version!==1)fail('Nur Zeichnungsversion 1 wird unterstützt.');const out={version:1,sheets:list(value.sheets,CAD_DRAWING_LIMITS.sheets,'Zeichnungsblätter').map(validateCadDrawingSheet)},identities=out.sheets.flatMap(s=>[s.id,...s.views.map(v=>v.id),...s.annotations.map(a=>a.id)]),sources=new Set(out.sheets.flatMap(s=>s.views.flatMap(v=>v.sourceIds)));unique(identities,'Zeichnungskennungen');if(identities.some(id=>sources.has(id)))fail('Zeichnungskennungen dürfen keine Quellenkennungen überschreiben.');return out;}
export function cadDrawingPaperSize(sheet){const size=sheet.paper==='A3'?[297,420]:[210,297];return sheet.orientation==='landscape'?[size[1],size[0]]:size;}
export function cadDrawingViewFrame(kind,section){const axis=kind==='section'?section.axis:kind==='side'?0:kind==='front'?1:2,frame=axis===0?[0,1,0,0,0,0,1,0,1,0,0,0,0,0,0,1]:axis===1?[1,0,0,0,0,0,1,0,0,-1,0,0,0,0,0,1]:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];if(kind==='section')frame[12+axis]=section.offset;return frame;}
export function createCadDrawingSheet({id:sheetId=cadDrawingId('sheet'),name='Zeichnungsblatt',sourceIds=[],paper='A4',orientation='landscape',scale=1,titleBlock={}}={}){
 const sheet={id:sheetId,name,paper,orientation,scale,titleBlock:{title:'',number:'',revision:'',author:'',date:'',...titleBlock},views:[],annotations:[]};
 if(sourceIds.length)for(const [kind,position]of [['front',[65,100]],['top',[65,165]],['side',[165,100]]])sheet.views.push({id:cadDrawingId('view'),kind,sourceIds:[...sourceIds],position});
 return validateCadDrawingSheet(sheet);
}
export function cadDrawingSourceSignatures(project,ids){const wanted=ids?new Set(ids):null,result=new Map();for(const root of project.nodes??[])if(root.kind==='cad'&&(!wanted||wanted.has(root.id)))result.set(root.id,cadSourceGeometryDigest(root));return result;}
const signatureAt=(sourceSignatures,id)=>sourceSignatures instanceof Map?sourceSignatures.get(id):sourceSignatures?.[id];
export function cadDrawingProblems(sheet,{sourceSignatures}={}){
 const problems=[];
 for(const v of sheet.views){
  if(!v.projection){problems.push({code:'UPDATE_REQUIRED',viewId:v.id,message:'Ansicht muss über „Blatt aktualisieren“ berechnet werden.'});continue;}
  const signs=v.projection.sourceSignatures;
  const frame=cadDrawingViewFrame(v.kind,v.section);if(v.projection.frame.some((n,i)=>n!==frame[i]))problems.push({code:'STALE_VIEW',viewId:v.id,message:'Ansichtsrichtung oder Schnittlage geändert. Blatt aktualisieren.'});
  if(signs.length!==v.sourceIds.length||v.sourceIds.some(id=>!signs.some(s=>s.id===id))||sourceSignatures!==undefined&&signs.some(s=>signatureAt(sourceSignatures,s.id)!==s.signature))problems.push({code:'STALE_SOURCE',viewId:v.id,message:'Ausgangsteil geändert oder verloren. Blatt aktualisieren.'});
 }
 for(const a of sheet.annotations)if(a.kind!=='label')try{cadDrawingDimension(sheet,a);}catch(error){problems.push({code:'LOST_DIMENSION_REFERENCE',annotationId:a.id,viewId:a.viewId,message:error.message});}
 return problems;
}
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const fmt=value=>String(Number(value.toFixed(2)));
export function cadDrawingDimension(sheet,annotation){
 const a=annotation,view=sheet.views.find(v=>v.id===a.viewId);if(a.unresolved)fail('Stabiler Maßbezug ist verloren oder mehrdeutig. Bezug erneut auswählen oder Maß entfernen.');if(!view?.projection)fail('Maßansicht fehlt.');const curves=a.curveIds.map(id=>view.projection.curves.find(c=>c.id===id));if(curves.some(c=>!c))fail('Maßbezug verloren. Bezug erneut auswählen oder Maß entfernen.');
 if(a.curveReferences&&a.curveReferences.some((reference,index)=>!curves[index].sourceReferences||referenceKey(reference.sourceReferences)!==referenceKey(curves[index].sourceReferences)))fail('Die gespeicherte Kantenrolle passt nicht mehr zum gewählten Maß. Bezug erneut auswählen.');
 if(a.sourceSignatures&&(a.sourceSignatures.length!==view.projection.sourceSignatures.length||a.sourceSignatures.some(s=>!view.projection.sourceSignatures.some(p=>p.id===s.id&&p.signature===s.signature))))fail('Maßquelle geändert. Bezug erneut auswählen oder Maß entfernen.');
 let value,points;
 if(a.kind==='distance'){if(!['x','y'].includes(a.axis)||a.anchors?.length!==2)fail('Abstandsmaß benötigt Achse und zwei geometrische Maßpunkte.');points=a.anchors.map(anchor=>cadDrawingCurvePoint(curves[anchor.curveIndex],anchor.point));value=Math.abs(points[1][a.axis==='x'?0:1]-points[0][a.axis==='x'?0:1]);if(value<1e-10)fail('Abstandsmaß hat keinen messbaren Abstand.');}
 else if(a.kind==='length'){const c=curves[0];if(c.kind!=='line')fail('Längenmaß benötigt eine Gerade.');value=dist(c.a,c.b);points=[c.a,c.b];}
 else if(a.kind==='angle'){
  if(curves.some(c=>c.kind!=='line'))fail('Winkelmaß benötigt zwei Geraden.');const u=curves[0].b.map((x,k)=>x-curves[0].a[k]),v=curves[1].b.map((x,k)=>x-curves[1].a[k]);value=Math.atan2(Math.abs(u[0]*v[1]-u[1]*v[0]),u[0]*v[0]+u[1]*v[1])*180/Math.PI;points=curves.flatMap(c=>[c.a,c.b]);
 }else if(['radius','diameter'].includes(a.kind)){
  const c=curves[0];if(!['circle','arc'].includes(c.kind))fail('Radius- und Durchmessermaße benötigen einen Kreis oder Kreisbogen.');value=c.radius*(a.kind==='diameter'?2:1);points=[c.center,[c.center[0]+c.radius,c.center[1]]];
 }else fail('Unbekannte Maßart.');
 return {value,text:(a.kind==='radius'?'R ':a.kind==='diameter'?'Ø ':'')+fmt(value)+(a.kind==='angle'?'°':' mm'),points,view,curves};
}

// Only an explicitly requested projection update may carry a dimension across
// a source change. Every exact semantic reference set must match one curve.
// Fragments and ambiguous coincident-role sets retain a visible lost reference.
export function updateCadDrawingProjection(sheet,viewId,projection){
 const out=validateCadDrawingSheet(sheet),view=out.views.find(view=>view.id===viewId);if(!view)fail('Zeichnungsansicht fehlt.');const previous=view.projection,next=validateCadDrawingProjection(projection);if(next.view!==view.kind)fail('Projektion gehört zu einer anderen Ansichtsart.');view.projection=next;
 for(const annotation of out.annotations.filter(annotation=>annotation.kind!=='label'&&annotation.viewId===viewId)){if(annotation.unresolved)continue;let references=annotation.curveReferences;if(!references&&previous){const old=annotation.curveIds.map(id=>previous.curves.find(curve=>curve.id===id)),sameInputs=!annotation.sourceSignatures||annotation.sourceSignatures.length===previous.sourceSignatures.length&&annotation.sourceSignatures.every(source=>previous.sourceSignatures.some(prior=>prior.id===source.id&&prior.signature===source.signature));if(sameInputs&&old.every(curve=>curve?.sourceReferences))references=old.map(curve=>({sourceReferences:curve.sourceReferences}));}if(!references)continue;annotation.curveReferences=structuredClone(references);const matches=references.map(reference=>next.curves.filter(curve=>curve.sourceReferences&&referenceKey(curve.sourceReferences)===referenceKey(reference.sourceReferences)));if(matches.some(curves=>curves.length!==1)||new Set(matches.map(curves=>curves[0].id)).size!==matches.length){annotation.unresolved=true;continue;}annotation.curveIds=matches.map(curves=>curves[0].id);annotation.sourceSignatures=structuredClone(next.sourceSignatures);try{cadDrawingDimension(out,annotation);}catch{annotation.unresolved=true;}}
 return validateCadDrawingSheet(out);
}

/** Remap only explicit object identities; curve identities encode geometry and
 * survive duplicated source IDs. Missing selected sources keep a lost reference. */
export function remapCadDrawings(value,idMap,makeId=cadDrawingId){
 const out=validateCadDrawings(value),get=id=>idMap instanceof Map?idMap.get(id)??id:idMap[id]??id;
 const identity=(prior,prefix)=>{const mapped=get(prior);return mapped===prior?makeId(prefix):mapped;};
 const remap=references=>references.map(reference=>({...reference,source:{rootId:get(reference.source.rootId),path:reference.source.path.map(get)}}));
 for(const sheet of out.sheets){sheet.id=identity(sheet.id,'sheet');const views=new Map();for(const view of sheet.views){const prior=view.id;view.id=identity(prior,'view');views.set(prior,view.id);view.sourceIds=view.sourceIds.map(get);if(view.projection){view.projection.sourceSignatures=view.projection.sourceSignatures.map(s=>({...s,id:get(s.id)}));for(const curve of view.projection.curves)if(curve.sourceReferences)curve.sourceReferences=remap(curve.sourceReferences);}}for(const a of sheet.annotations){a.id=identity(a.id,'annotation');if(a.kind!=='label')a.viewId=views.get(a.viewId)??a.viewId;if(a.sourceSignatures)a.sourceSignatures=a.sourceSignatures.map(s=>({...s,id:get(s.id)}));for(const reference of a.curveReferences??[])reference.sourceReferences=remap(reference.sourceReferences);}}
 return out;
}
export function selectCadDrawings(value,ids){const wanted=new Set(ids),out=validateCadDrawings(value),selected=refs=>!refs||refs.every(s=>wanted.has(s.id)),owned=references=>!references||references.every(reference=>wanted.has(reference.source.rootId));out.sheets=out.sheets.filter(sheet=>sheet.views.length&&sheet.views.every(view=>view.sourceIds.every(id=>wanted.has(id))&&selected(view.projection?.sourceSignatures)&&view.projection?.curves.every(curve=>owned(curve.sourceReferences))!==false)&&sheet.annotations.every(a=>selected(a.sourceSignatures)&&(a.curveReferences??[]).every(reference=>owned(reference.sourceReferences))));return out;}
