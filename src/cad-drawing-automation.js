import {needsStepDrillExportProof} from './cad-step-drill-verify.js';
import {validateCadDrawingSheet,validateCadDrawings,cadDrawingSourceSignatures,cadDrawingPaperSize,cadDrawingProblems,cadDrawingDimension,updateCadDrawingProjection} from './cad-drawing-data.js';
import {cadDrawingSvg,cadDrawingDxf} from './cad-drawing-export.js';
import {cadDrawingUpdatedPosition,cadDrawingRescaledPosition} from './cad-drawing-layout.js';
import {autoDimensionCadDrawing} from './cad-drawing-auto-dimensions.js';

const fail=(message,code='INVALID_CAD_DRAWING')=>{throw Object.assign(Error('Zeichnung: '+message),{code});};
const idSchema={type:'string',minLength:1,maxLength:200},pointSchema={type:'array',minItems:2,maxItems:2,items:{type:'number',minimum:-1e6,maximum:1e6}};
const signaturesSchema={type:'array',maxItems:128,items:{type:'object',additionalProperties:false,required:['id','signature'],properties:{id:idSchema,signature:{type:'string',pattern:'^[a-f0-9]{64}$'}}}};
const curveReferencesSchema={type:'array',minItems:1,maxItems:2,description:'Read-only stable roles captured from native curves. Omit when assigning new measured curveIds; unchanged confirmed roles are retained on layout-only put.',items:{type:'object',additionalProperties:false,required:['sourceReferences'],properties:{sourceReferences:{type:'array',minItems:1,maxItems:8,items:{type:'object',additionalProperties:false,required:['source','role'],properties:{source:{type:'object',additionalProperties:false,required:['rootId','path'],properties:{rootId:idSchema,path:{type:'array',maxItems:12,items:idSchema}}},role:{type:'string',minLength:1,maxLength:300},elementId:{type:'string',minLength:1,maxLength:100},geometrySignature:{type:'string',pattern:'^[a-f0-9]{64}$'}}}}}}};
const viewSchema={type:'object',additionalProperties:false,required:['id','kind','sourceIds','position'],properties:{id:idSchema,kind:{enum:['front','side','top','section']},sourceIds:{type:'array',minItems:1,maxItems:128,uniqueItems:true,items:idSchema},position:pointSchema,section:{type:'object',additionalProperties:false,required:['axis','offset'],properties:{axis:{enum:[0,1,2]},offset:{type:'number',minimum:-100000,maximum:100000}}},projection:{type:'object',description:'Read-only cached native projection. Omit on put: the confirmed cache of the same view kind is retained, and changed source/cut settings mark it stale until explicit update. Supplied caches must equal a previously confirmed native result.'}}};
const measuredProperties={id:idSchema,viewId:idSchema,curveIds:{type:'array',minItems:1,maxItems:2,uniqueItems:true,items:idSchema},sourceSignatures:signaturesSchema,curveReferences:curveReferencesSchema,unresolved:{type:'boolean',description:'Read-only lost/ambiguous reference status; reassign measured curves or remove the annotation.'},position:pointSchema};
const annotationSchema={oneOf:[{type:'object',additionalProperties:false,required:['id','kind','text','position'],properties:{id:idSchema,kind:{const:'label'},text:{type:'string',maxLength:1000},position:pointSchema}},{type:'object',additionalProperties:false,required:['id','kind','viewId','curveIds','position'],properties:{...measuredProperties,kind:{enum:['length','angle','radius','diameter']}}},{type:'object',additionalProperties:false,required:['id','kind','viewId','curveIds','position','axis','anchors'],properties:{...measuredProperties,kind:{const:'distance'},axis:{enum:['x','y']},anchors:{type:'array',minItems:2,maxItems:2,items:{type:'object',additionalProperties:false,required:['curveIndex','point'],properties:{curveIndex:{enum:[0,1]},point:{enum:['a','b','center','minX','maxX','minY','maxY']}}}}}}]};
const sheetSchema={type:'object',additionalProperties:false,required:['id','name','paper','orientation','scale','titleBlock','views','annotations'],properties:{id:idSchema,name:{type:'string',maxLength:200},paper:{enum:['A4','A3']},orientation:{enum:['portrait','landscape']},scale:{type:'number',minimum:.001,maximum:1000},titleBlock:{type:'object',additionalProperties:false,properties:Object.fromEntries(['title','number','revision','author','date'].map(key=>[key,{type:'string',maxLength:key==='title'?500:200}]))},views:{type:'array',maxItems:32,items:viewSchema},annotations:{type:'array',maxItems:1000,items:annotationSchema}}};
export const CAD_DRAWING_COMMAND_SCHEMAS=[
 {type:'object',additionalProperties:false,required:['op','action','sheet'],properties:{op:{const:'drawing'},action:{const:'put'},sheet:sheetSchema}},
 {type:'object',additionalProperties:false,required:['op','action','sheetId','mode'],properties:{op:{const:'drawing'},action:{const:'dimension'},sheetId:idSchema,mode:{enum:['basic','detailed']}}},
 ...['remove','update'].map(action=>({type:'object',additionalProperties:false,required:['op','action','sheetId'],properties:{op:{const:'drawing'},action:{const:action},sheetId:idSchema}}))
];

export function validateCadDrawingCommands(commands){
 if(!Array.isArray(commands)||!commands.length||commands.length>200||commands.some(c=>!c||Object.getPrototypeOf(c)!==Object.prototype||c.op!=='drawing'))fail('Blattbefehle getrennt von Geometriebefehlen in einer eigenen Vorschau senden.');
 return commands.map(c=>{
  if(!['put','remove','update','dimension'].includes(c.action)||Object.keys(c).some(k=>!(c.action==='put'?['op','action','sheet']:c.action==='dimension'?['op','action','sheetId','mode']:['op','action','sheetId']).includes(k)))fail('Unbekannter Blattbefehl.');
  if(c.action==='put')return {op:'drawing',action:'put',sheet:validateCadDrawingSheet(c.sheet)};
  if(typeof c.sheetId!=='string'||!c.sheetId||c.sheetId.length>200||/[\r\n]/.test(c.sheetId))fail('Gültige Blattkennung erforderlich.');
  if(c.action==='dimension'&&!['basic','detailed'].includes(c.mode))fail('Grundbemaßung oder detaillierte Bemaßung wählen.');
  return {op:'drawing',action:c.action,sheetId:c.sheetId,...(c.action==='dimension'?{mode:c.mode}:{})};
 });
}
export async function previewCadDrawingCommands(controller,{commands,revision,label='Zeichnungsblätter ändern'}={}){
 const validated=validateCadDrawingCommands(commands),current=()=>{if(controller.revision()!==revision)fail('Modell während der Blattänderung geändert.','STALE_REVISION');};current();
 const initial=controller.readSnapshot(),drawings=validateCadDrawings(initial.drawings??{version:1,sheets:[]}),joined=!!initial.contourLinks?.links.length||!!initial.projectParameters,updateIds=new Set();
 for(const command of validated){
  current();
  if(command.action==='put'){
   const sheet=command.sheet,prior=drawings.sheets.find(s=>s.id===sheet.id);
   for(const view of sheet.views){
    const old=prior?.views.find(v=>v.id===view.id),sameKind=old?.kind===view.kind;
    if(view.projection&&(!sameKind||!old.projection||JSON.stringify(view.projection)!==JSON.stringify(old.projection)))fail('Projektionskurven dürfen nur durch „Blatt aktualisieren“ berechnet werden.');
    if(!view.projection&&sameKind&&old.projection)view.projection=structuredClone(old.projection);
    if(sameKind&&old.projection&&prior.scale!==sheet.scale&&view.position.every((value,k)=>value===old.position[k]))view.position=cadDrawingRescaledPosition(view.position,old.projection,prior.scale,sheet.scale);
   }
   for(const annotation of sheet.annotations.filter(annotation=>annotation.kind!=='label')){
    const old=prior?.annotations.find(item=>item.id===annotation.id&&item.kind===annotation.kind),same=old&&old.viewId===annotation.viewId&&JSON.stringify(old.curveIds)===JSON.stringify(annotation.curveIds)&&old.axis===annotation.axis&&JSON.stringify(old.anchors)===JSON.stringify(annotation.anchors)&&(annotation.sourceSignatures===undefined||JSON.stringify(old.sourceSignatures)===JSON.stringify(annotation.sourceSignatures));
    for(const field of ['curveReferences','unresolved']){if(annotation[field]!==undefined&&(!same||JSON.stringify(annotation[field])!==JSON.stringify(old[field])))fail('Stabile Maßrollen und Verluststatus sind schreibgeschützt. Maßkante erneut auswählen und interne Rollen weglassen.');if(same&&old[field]!==undefined)annotation[field]=structuredClone(old[field]);}
    if(!same){const view=sheet.views.find(view=>view.id===annotation.viewId),curves=annotation.curveIds.map(id=>view?.projection?.curves.find(curve=>curve.id===id));if(curves.every(curve=>curve?.sourceReferences))annotation.curveReferences=curves.map(curve=>({sourceReferences:structuredClone(curve.sourceReferences)}));}
   }
   const index=drawings.sheets.findIndex(s=>s.id===sheet.id);if(index<0)drawings.sheets.push(sheet);else drawings.sheets[index]=sheet;
   validateCadDrawings(drawings);
  }else{
   const index=drawings.sheets.findIndex(s=>s.id===command.sheetId);if(index<0)fail('Blattkennung fehlt.');
   if(command.action==='dimension'){if(updateIds.has(command.sheetId))fail('Verknüpftes Blatt zuerst aktualisieren und übernehmen; anschließend automatisch bemaßen.');drawings.sheets[index]=autoDimensionCadDrawing(drawings.sheets[index],{mode:command.mode,sourceSignatures:cadDrawingSourceSignatures(initial)}).sheet;}
   else if(command.action==='remove')drawings.sheets.splice(index,1);
   else if(joined)updateIds.add(command.sheetId);
   else for(const viewId of drawings.sheets[index].views.map(view=>view.id)){
    const sheet=drawings.sheets[index],view=sheet.views.find(view=>view.id===viewId),projection=await controller.query('drawingProjection',{ids:view.sourceIds,view:view.kind,...(view.kind==='section'?{section:view.section}:{})});current();const position=cadDrawingUpdatedPosition(view.position,view.projection,projection,sheet.scale);drawings.sheets[index]=updateCadDrawingProjection(sheet,viewId,projection);drawings.sheets[index].views.find(view=>view.id===viewId).position=position;
   }
  }
 }
 current();const selected=[...updateIds].filter(id=>drawings.sheets.some(sheet=>sheet.id===id));return selected.length?controller.previewDrawingUpdate(validateCadDrawings(drawings),{sheetIds:selected,revision,label}):controller.previewDrawings(validateCadDrawings(drawings),{revision,label});
}

/** An inspectable local API response, bounded independently of a project's
 * potentially large curve caches. Truncation is explicit at every level. */
export function cadDrawingPreviewSummary(project){
 const drawings=validateCadDrawings(project.drawings??{version:1,sheets:[]}),ids=[...new Set(drawings.sheets.flatMap(s=>s.views.flatMap(v=>v.sourceIds)))],signatures=cadDrawingSourceSignatures(project,ids),limits={bytes:160000,views:32,curves:200,annotations:100,sources:128};
 const summary={version:1,sheetCount:drawings.sheets.length,viewCount:drawings.sheets.reduce((n,s)=>n+s.views.length,0),curveCount:drawings.sheets.reduce((n,s)=>n+s.views.reduce((m,v)=>m+(v.projection?.curves.length??0),0),0),annotationCount:drawings.sheets.reduce((n,s)=>n+s.annotations.length,0),sourceCount:ids.length,sheets:[],sourceSignatures:[],truncated:false,limits};
 let views=0,curves=0,annotations=0;
 const fits=()=>new TextEncoder().encode(JSON.stringify(summary)).length<=limits.bytes-1000;
 function append(array,value){array.push(value);if(!fits()){array.pop();summary.truncated=true;return false;}return true;}
 for(const id of ids.slice(0,limits.sources))if(!append(summary.sourceSignatures,{id,signature:signatures.get(id)??null}))break;
 if(summary.sourceSignatures.length<ids.length)summary.truncated=true;
 for(const sheet of drawings.sheets){
  const problems=cadDrawingProblems(sheet,{sourceSignatures:signatures}),item={id:sheet.id,name:sheet.name,paper:sheet.paper,orientation:sheet.orientation,scale:sheet.scale,titleBlock:sheet.titleBlock,viewCount:sheet.views.length,annotationCount:sheet.annotations.length,problemCount:problems.length,views:[],annotations:[],problems:[],truncated:false};
  if(!append(summary.sheets,item))break;
  for(const problem of problems.slice(0,32))if(!append(item.problems,problem))break;if(item.problems.length<problems.length)item.truncated=summary.truncated=true;
  for(const view of sheet.views){
   if(views>=limits.views){item.truncated=summary.truncated=true;break;}const projection=view.projection,row={id:view.id,kind:view.kind,position:view.position,sourceIds:view.sourceIds.slice(0,16),sourceCount:view.sourceIds.length,...(view.section?{section:view.section}:{}),curveCount:projection?.curves.length??0,curves:[],sourceSignatures:projection?.sourceSignatures.slice(0,16)??[],updated:!!projection,truncated:view.sourceIds.length>16||!!projection&&projection.sourceSignatures.length>16};
   if(!append(item.views,row)){item.truncated=true;break;}views++;
   for(const curve of projection?.curves??[]){
    if(curves>=limits.curves){row.truncated=item.truncated=summary.truncated=true;break;}
    const value={id:curve.id,kind:curve.kind,hidden:curve.hidden};
    if(curve.kind==='line'){value.a=curve.a;value.b=curve.b;value.length=Math.hypot(...curve.a.map((v,k)=>v-curve.b[k]));}
    if(['circle','arc'].includes(curve.kind)){value.center=curve.center;value.radius=curve.radius;value.diameter=curve.radius*2;}
    if(curve.kind==='arc')Object.assign(value,{startAngle:curve.startAngle,endAngle:curve.endAngle,clockwise:curve.clockwise});
    if(curve.kind==='ellipse')Object.assign(value,{center:curve.center,radii:curve.radii});
    if(curve.kind==='bezier')value.poleCount=curve.poles.length;
    if(curve.kind==='polyline')Object.assign(value,{pointCount:curve.points.length,maxDeviation:curve.maxDeviation});
    if(!append(row.curves,value)){row.truncated=item.truncated=true;break;}curves++;
   }
   if(row.truncated)item.truncated=summary.truncated=true;
  }
  for(const annotation of sheet.annotations){
   if(annotations>=limits.annotations){item.truncated=summary.truncated=true;break;}const value={...annotation};
   if(annotation.kind!=='label')try{const measured=cadDrawingDimension(sheet,annotation);value.value=measured.value;value.text=measured.text;}catch(error){value.problem=error.message;}
   if(!append(item.annotations,value)){item.truncated=true;break;}annotations++;
  }
 }
 return summary;
}

export async function exportCadDrawing(controller,args,{printDrawingPdf=value=>globalThis.offlinecadDesktop?.printDrawingPdf?.(value)}={}){
 if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!['format','sheetId'].includes(k))||!['drawing-svg','drawing-dxf','drawing-pdf'].includes(args.format)||typeof args.sheetId!=='string'||!args.sheetId||args.sheetId.length>200)fail('Zeichnungsexport benötigt Ausgabeformat und Blattkennung; ids und quality sind hier nicht zulässig.');
 const revision=controller.revision(),project=controller.readSnapshot(),sheet=project.drawings?.sheets.find(s=>s.id===args.sheetId);if(!sheet)fail('Blattkennung fehlt.');
 const sourceIds=[...new Set(sheet.views.flatMap(view=>view.sourceIds))];controller.assertExportReady?.({ids:sourceIds,format:args.format,includeHidden:true});
 if(needsStepDrillExportProof(project,sourceIds))await controller.query('stepDrillIntegrity',{ids:sourceIds});
 const options={sourceSignatures:cadDrawingSourceSignatures(project)},extension=args.format.slice(8);let data,mime;
 if(extension==='dxf'){data=new TextEncoder().encode(cadDrawingDxf(sheet,options));mime='application/dxf';}
 else{
  const svg=cadDrawingSvg(sheet,options);
  if(extension==='svg'){data=new TextEncoder().encode(svg);mime='image/svg+xml';}
  else{const [widthMm,heightMm]=cadDrawingPaperSize(sheet),pdf=await printDrawingPdf({svg,widthMm,heightMm});if(!(pdf instanceof Uint8Array)||pdf.length<5||new TextDecoder().decode(pdf.subarray(0,5))!=='%PDF-')fail('Lokale PDF-Ausgabe ist nicht verfügbar oder lieferte keine PDF-Datei.');data=pdf;mime='application/pdf';}
 }
 if(controller.revision()!==revision)fail('Projekt während des Zeichnungsexports geändert.','STALE_REVISION');
 return {mime,extension,data};
}
