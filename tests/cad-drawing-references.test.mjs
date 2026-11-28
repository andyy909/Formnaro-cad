import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createCadDrawingSheet,cadDrawingViewFrame,validateCadDrawingProjection,validateCadDrawingSheet,cadDrawingDimension,cadDrawingProblems,updateCadDrawingProjection,remapCadDrawings,selectCadDrawings,createCadDrawingPartsList,validateCadDrawingPartsList,cadDrawingPartsListDefaultPosition,createCadDrawingBalloon,cadDrawingBalloon} from '../src/cad-drawing-data.js';
import {summarizeParts} from '../src/cad-part-properties.js';
import {createCadProject,serializeCadProject,parseCadProject,cadProjectStoredVersion,DRAWING_CENTERMARK_PROJECT_VERSION,DRAWING_PARTS_LIST_PROJECT_VERSION} from '../src/cad-project.js';
const signature='a'.repeat(64),reference=(role='box.edge.x.y.min.z.max')=>({source:{rootId:'body',path:['child']},role}),line=(id,length=40,references=[reference()])=>({id,kind:'line',hidden:false,a:[0,0],b:[length,0],...(references?{sourceReferences:references}:{})});
const projection=(curves=[line('old')],sign=signature)=>({kind:'cad-drawing-projection',view:'top',frame:cadDrawingViewFrame('top'),curves,bounds:{min:[0,0],max:[60,20]},sourceSignatures:[{id:'body',signature:sign}],tolerance:1e-7,approximation:'exact-native-curves'});
function fixture(curves){const sheet=createCadDrawingSheet({id:'sheet',sourceIds:['body']});sheet.views=[{id:'top',kind:'top',sourceIds:['body'],position:[60,60],projection:projection(curves)}];sheet.annotations=[{id:'dimension',kind:'length',viewId:'top',curveIds:['old'],sourceSignatures:[{id:'body',signature}],position:[10,20]}];return sheet;}
test('drawing provenance is bounded to exact named sources and STEP references require the whole original geometry',()=>{
 assert.equal(validateCadDrawingProjection(projection()).curves[0].sourceReferences[0].role,reference().role);for(const mutate of [p=>p.curves[0].sourceReferences[0].faceIndex=1,p=>p.curves[0].sourceReferences[0].source.path=Array(13).fill('x'),p=>p.curves[0].sourceReferences[0].source.rootId='foreign',p=>p.curves[0].sourceReferences=Array.from({length:9},(_,i)=>reference('edge'+i)),p=>p.curves[0].sourceReferences=[reference('step.edge.exact.'+'b'.repeat(64))]]){const bad=projection();mutate(bad);assert.throws(()=>validateCadDrawingProjection(bad));}const step=projection([line('old',40,[{...reference('step.edge.exact.'+'b'.repeat(64)),geometrySignature:signature}])]);assert.doesNotThrow(()=>validateCadDrawingProjection(step));
});
test('explicit drawing updates follow exactly one semantic role set across changed geometry without nearest-edge matching',()=>{
 const first=reference(),second=reference('box.edge.x.y.min.z.min'),sheet=fixture([line('old',40,[first,second])]),next=projection([line('geometrically-closer',40,[reference('box.edge.x.y.max.z.min')]),line('new',60,[second,first])],'b'.repeat(64)),updated=updateCadDrawingProjection(sheet,'top',next);assert.deepEqual(updated.annotations[0].curveIds,['new']);assert.equal(cadDrawingDimension(updated,updated.annotations[0]).value,60);assert.deepEqual(updated.annotations[0].position,[10,20]);assert.equal(updated.annotations[0].sourceSignatures[0].signature,'b'.repeat(64));assert.equal(updated.annotations[0].curveReferences[0].sourceReferences.length,2);assert.deepEqual(cadDrawingProblems(updated),[]);assert.equal(sheet.annotations[0].curveIds[0],'old');
});
test('ambiguous roles and changed STEP bodies remain explicitly unresolved until repicked even if an old curve ID survives',()=>{
 const ambiguous=updateCadDrawingProjection(fixture(),'top',projection([line('old'),line('second')],'b'.repeat(64)));assert.equal(ambiguous.annotations[0].unresolved,true);assert.equal(cadDrawingProblems(ambiguous)[0].code,'LOST_DIMENSION_REFERENCE');const repeated=updateCadDrawingProjection(ambiguous,'top',projection([line('old')],signature));assert.equal(repeated.annotations[0].unresolved,true);const old={...reference('step.edge.exact.'+'c'.repeat(64)),geometrySignature:signature},next={...old,geometrySignature:'d'.repeat(64)},step=updateCadDrawingProjection(fixture([line('old',40,[old])]),'top',projection([line('old',60,[next])],'b'.repeat(64)));assert.equal(step.annotations[0].unresolved,true);assert.throws(()=>cadDrawingDimension(step,step.annotations[0]),/verloren|mehrdeutig/);
});
test('unsupported projection fragments retain the prior lost-reference behavior and semantic radius changes cannot become ellipse measurements',()=>{
 const unsupported=updateCadDrawingProjection(fixture([line('old',40,null)]),'top',projection([line('new',60,null)],'b'.repeat(64)));assert.equal(unsupported.annotations[0].curveReferences,undefined);assert.equal(cadDrawingProblems(unsupported)[0].code,'LOST_DIMENSION_REFERENCE');const sheet=fixture();sheet.annotations[0].kind='radius';sheet.views[0].projection.curves=[{id:'old',kind:'circle',hidden:false,center:[0,0],radius:5,sourceReferences:[reference('cylinder.edge.cap.max')]}];const next=projection([{id:'ellipse',kind:'ellipse',hidden:false,center:[0,0],radii:[5,10],xAxis:[1,0],yAxis:[0,1],startAngle:0,endAngle:Math.PI*2,clockwise:false,closed:true,sourceReferences:[reference('cylinder.edge.cap.max')]}],'b'.repeat(64));assert.equal(updateCadDrawingProjection(sheet,'top',next).annotations[0].unresolved,true);
});
test('library remapping rewrites every stable source address and subset filtering excludes foreign annotation references',()=>{
 const updated=updateCadDrawingProjection(fixture(),'top',projection([line('new',60)],'b'.repeat(64))),document={version:1,sheets:[updated]},mapping=new Map([['body','copy'],['child','child-copy']]);let id=0;const copy=remapCadDrawings(document,mapping,prefix=>prefix+'-'+(++id)),sheet=copy.sheets[0];assert.deepEqual(sheet.views[0].projection.curves[0].sourceReferences[0].source,{rootId:'copy',path:['child-copy']});assert.deepEqual(sheet.annotations[0].curveReferences[0].sourceReferences[0].source,{rootId:'copy',path:['child-copy']});assert.deepEqual(cadDrawingProblems(sheet),[]);assert.equal(selectCadDrawings(document,['body']).sheets.length,1);updated.annotations[0].curveReferences[0].sourceReferences[0].source.rootId='private';assert.equal(selectCadDrawings(document,['body']).sheets.length,0);assert.doesNotThrow(()=>validateCadDrawingSheet(updated));
});
test('centermark annotation attaches associatively to circle, tracks hole movement, becomes unresolved on deletion, and requires format 37',()=>{
 const circleRef=reference('cylinder.edge.bore.1');
 const circleCurve=(id,center=[15,25],r=5,refs=[circleRef])=>({id,kind:'circle',hidden:false,center,radius:r,sourceReferences:refs});
 const sheet=createCadDrawingSheet({id:'sheet',sourceIds:['body']});
 sheet.views=[{id:'top',kind:'top',sourceIds:['body'],position:[60,60],projection:projection([circleCurve('hole-1')])}];
 sheet.annotations=[{id:'cm-1',kind:'centermark',viewId:'top',curveIds:['hole-1'],sourceSignatures:[{id:'body',signature}],curveReferences:[{sourceReferences:[circleRef]}],position:[75,35]}];
 const dim=cadDrawingDimension(sheet,sheet.annotations[0]);
 assert.equal(dim.value,5);
 assert.equal(dim.text,'');
 assert.deepEqual(dim.points,[[15,25]]);
 assert.deepEqual(cadDrawingProblems(sheet),[]);
 const projectWithout=createCadProject({drawings:{version:1,sheets:[createCadDrawingSheet({id:'plain',sourceIds:['body']})]}});
 assert.ok(cadProjectStoredVersion(projectWithout)<37);
 const projectWith=createCadProject({drawings:{version:1,sheets:[sheet]}});
 assert.equal(cadProjectStoredVersion(projectWith),DRAWING_CENTERMARK_PROJECT_VERSION);
 const serialized=serializeCadProject(projectWith);
 const parsed=parseCadProject(serialized);
 assert.equal(parsed.version,DRAWING_CENTERMARK_PROJECT_VERSION);
 assert.equal(parsed.drawings.sheets[0].annotations[0].kind,'centermark');
 assert.deepEqual(parsed.drawings.sheets[0].annotations[0].curveIds,['hole-1']);
 const invalidLow=JSON.parse(serialized);
 invalidLow.version=36;
 assert.throws(()=>parseCadProject(JSON.stringify(invalidLow)),/Mittelpunktmarken in Zeichnungen benötigen Projektformat 37/);
 const movedNext=projection([circleCurve('hole-moved',[30,45],5,[circleRef])],'b'.repeat(64));
 const updated=updateCadDrawingProjection(sheet,'top',movedNext);
 assert.equal(updated.annotations[0].unresolved,undefined);
 assert.deepEqual(updated.annotations[0].curveIds,['hole-moved']);
 const movedDim=cadDrawingDimension(updated,updated.annotations[0]);
 assert.deepEqual(movedDim.points,[[30,45]]);
 assert.deepEqual(updated.annotations[0].position,[90,15]);
 const deletedNext=projection([line('other')],'c'.repeat(64));
 const lost=updateCadDrawingProjection(sheet,'top',deletedNext);
 assert.equal(lost.annotations[0].unresolved,true);
 assert.equal(cadDrawingProblems(lost)[0].code,'LOST_DIMENSION_REFERENCE');
 assert.throws(()=>cadDrawingDimension(lost,lost.annotations[0]),/verloren|mehrdeutig/);
});
test('centerline connects two circle centers in same view, tracks bore distance changes, becomes unresolved if one hole vanishes, and requires format 37',()=>{
 const refA=reference('cylinder.edge.bore.A'),refB=reference('cylinder.edge.bore.B');
 const circleA=(id,center=[10,20],r=4)=>({id,kind:'circle',hidden:false,center,radius:r,sourceReferences:[refA]});
 const circleB=(id,center=[40,20],r=4)=>({id,kind:'circle',hidden:false,center,radius:r,sourceReferences:[refB]});
 const sheet=createCadDrawingSheet({id:'sheet',sourceIds:['body']});
 sheet.views=[{id:'top',kind:'top',sourceIds:['body'],position:[50,50],projection:projection([circleA('cA'),circleB('cB')])}];
 sheet.annotations=[{id:'cl-1',kind:'centerline',viewId:'top',curveIds:['cA','cB'],sourceSignatures:[{id:'body',signature}],curveReferences:[{sourceReferences:[refA]},{sourceReferences:[refB]}],position:[75,30],overhangMm:4}];
 const dim=cadDrawingDimension(sheet,sheet.annotations[0]);
 assert.equal(dim.value,30);
 assert.equal(dim.text,'');
 assert.deepEqual(dim.points,[[10,20],[40,20]]);
 assert.deepEqual(cadDrawingProblems(sheet),[]);
 const sameCurve=structuredClone(sheet);
 sameCurve.annotations[0].curveIds=['cA','cA'];
 assert.throws(()=>validateCadDrawingSheet(sameCurve),/Doppelte Maßbezüge/);
 const nonCircle=structuredClone(sheet);
 nonCircle.views[0].projection.curves.push(line('not-a-circle'));
 nonCircle.annotations[0].curveIds=['cA','not-a-circle'];
 nonCircle.annotations[0].curveReferences=[{sourceReferences:[refA]},{sourceReferences:[reference()]}];
 assert.throws(()=>cadDrawingDimension(nonCircle,nonCircle.annotations[0]),/Mittellinien benötigen zwei Kreise oder Kreisbögen/);
 const project=createCadProject({drawings:{version:1,sheets:[sheet]}});
 assert.equal(cadProjectStoredVersion(project),DRAWING_CENTERMARK_PROJECT_VERSION);
 const serialized=serializeCadProject(project);
 const parsed=parseCadProject(serialized);
 assert.equal(parsed.version,DRAWING_CENTERMARK_PROJECT_VERSION);
 assert.equal(parsed.drawings.sheets[0].annotations[0].kind,'centerline');
 assert.equal(parsed.drawings.sheets[0].annotations[0].overhangMm,4);
 const invalidLow=JSON.parse(serialized);
 invalidLow.version=36;
 assert.throws(()=>parseCadProject(JSON.stringify(invalidLow)),/Mittellinien in Zeichnungen benötigen Projektformat 37/);
 const movedNext=projection([circleA('cA-new',[10,20]),circleB('cB-new',[60,35])],'b'.repeat(64));
 const updated=updateCadDrawingProjection(sheet,'top',movedNext);
 assert.equal(updated.annotations[0].unresolved,undefined);
 assert.deepEqual(updated.annotations[0].curveIds,['cA-new','cB-new']);
 const movedDim=cadDrawingDimension(updated,updated.annotations[0]);
 assert.deepEqual(movedDim.points,[[10,20],[60,35]]);
 assert.ok(Math.abs(movedDim.value-Math.hypot(50,15))<1e-10);
 assert.deepEqual(updated.annotations[0].position,[85,22.5]);
 const missingOne=projection([circleA('cA-survivor',[10,20]),line('other')],'c'.repeat(64));
 const lost=updateCadDrawingProjection(sheet,'top',missingOne);
 assert.equal(lost.annotations[0].unresolved,true);
 assert.equal(cadDrawingProblems(lost)[0].code,'LOST_DIMENSION_REFERENCE');
 assert.throws(()=>cadDrawingDimension(lost,lost.annotations[0]),/verloren|mehrdeutig/);
});
test('dimension tolerance supports deviation and limits modes, updates with model changes, rejects contradictory limits and requires format 37',()=>{
 const ref=reference('cylinder.edge.bore.dia');
 const circle=(id,r=5,center=[20,30])=>({id,kind:'circle',hidden:false,center,radius:r,sourceReferences:[ref]});
 const sheet=createCadDrawingSheet({id:'sheet',sourceIds:['body']});
 sheet.views=[{id:'top',kind:'top',sourceIds:['body'],position:[50,50],projection:projection([circle('c1',5)])}];
 const dimAnnotation={id:'dia-1',kind:'diameter',viewId:'top',curveIds:['c1'],sourceSignatures:[{id:'body',signature}],curveReferences:[{sourceReferences:[ref]}],position:[70,40],tolerance:{upper:0.10,lower:-0.05,mode:'deviation'}};
 sheet.annotations=[dimAnnotation];

 const devDim=cadDrawingDimension(sheet,sheet.annotations[0]);
 assert.equal(devDim.value,10);
 assert.equal(devDim.text,'Ø 10 +0.10 / -0.05 mm');

 sheet.annotations[0].tolerance.mode='limits';
 const limDim=cadDrawingDimension(sheet,sheet.annotations[0]);
 assert.equal(limDim.value,10);
 assert.equal(limDim.text,'Ø 10.10 / 9.95 mm');

 // Model change: diameter changes from 10 to 12 (radius 5 -> 6)
 const updatedProj=projection([circle('c1-new',6,[20,30])],'b'.repeat(64));
 const updated=updateCadDrawingProjection(sheet,'top',updatedProj);
 assert.equal(updated.annotations[0].tolerance.mode,'limits');
 const updatedLimDim=cadDrawingDimension(updated,updated.annotations[0]);
 assert.equal(updatedLimDim.value,12);
 assert.equal(updatedLimDim.text,'Ø 12.10 / 11.95 mm');

 // Switch back from limits to deviation on updated sheet
 updated.annotations[0].tolerance.mode='deviation';
 const updatedDevDim=cadDrawingDimension(updated,updated.annotations[0]);
 assert.equal(updatedDevDim.value,12);
 assert.equal(updatedDevDim.text,'Ø 12 +0.10 / -0.05 mm');

 // Negative offset: -0.02 / -0.08
 const negSheet=structuredClone(sheet);
 negSheet.annotations[0].tolerance={upper:-0.02,lower:-0.08,mode:'deviation'};
 const negDevDim=cadDrawingDimension(negSheet,negSheet.annotations[0]);
 assert.equal(negDevDim.text,'Ø 10 -0.02 / -0.08 mm');
 negSheet.annotations[0].tolerance.mode='limits';
 const negLimDim=cadDrawingDimension(negSheet,negSheet.annotations[0]);
 assert.equal(negLimDim.text,'Ø 9.98 / 9.92 mm');

 // Contradictory limits: lower > upper rejected
 const contradictory=structuredClone(sheet);
 contradictory.annotations[0].tolerance={upper:-0.05,lower:0.10};
 assert.throws(()=>validateCadDrawingSheet(contradictory),/Untere Toleranzgrenze/);
 assert.throws(()=>cadDrawingDimension(contradictory,contradictory.annotations[0]),/Untere Toleranzgrenze/);

 // Negative limit for diameter rejected
 const negLimit=structuredClone(sheet);
 negLimit.annotations[0].tolerance={upper:0.1,lower:-15};
 assert.throws(()=>cadDrawingDimension(negLimit,negLimit.annotations[0]),/Grenzmaße dürfen nicht negativ sein/);

 // Non-finite rejected
 const nonFinite=structuredClone(sheet);
 nonFinite.annotations[0].tolerance={upper:Infinity,lower:0};
 assert.throws(()=>validateCadDrawingSheet(nonFinite),/endliche Zahlen/);

 // Tolerance on centermark rejected
 const cmTolerance=structuredClone(sheet);
 cmTolerance.annotations[0].kind='centermark';
 assert.throws(()=>validateCadDrawingSheet(cmTolerance),/Toleranzen sind nur für/);

 // Format 37 check
 const projectWith=createCadProject({drawings:{version:1,sheets:[sheet]}});
 assert.equal(cadProjectStoredVersion(projectWith),DRAWING_CENTERMARK_PROJECT_VERSION);
 const serialized=serializeCadProject(projectWith);
 const parsed=parseCadProject(serialized);
 assert.equal(parsed.version,DRAWING_CENTERMARK_PROJECT_VERSION);
 assert.deepEqual(parsed.drawings.sheets[0].annotations[0].tolerance,{upper:0.10,lower:-0.05,mode:'limits'});

 const invalidLow=JSON.parse(serialized);
 invalidLow.version=36;
 assert.throws(()=>parseCadProject(JSON.stringify(invalidLow)),/Projektformat 37/);

 // Project without tolerance stays at lower version
 const sheetNoTol=structuredClone(sheet);
 delete sheetNoTol.annotations[0].tolerance;
 const projectWithout=createCadProject({drawings:{version:1,sheets:[sheetNoTol]}});
 assert.ok(cadProjectStoredVersion(projectWithout)<37);
});
test('B05-01/B05-02: grouped bolts form one table row with quantity 4 and keep their position after reorder and reopen',()=>{
 const part=(id,definitionId,name,partNumber,extra={})=>({id,definitionId,name,partNumber,material:'Stahl',densityGcm3:7.85,volumeMm3:400,massG:3.14,centerMm:[0,0,10],...extra}),
  screws=[1,2,3,4].map(number=>part('s'+number,'def-screw','Zylinderschraube M5x20','ISO4762-M5-20')),
  washer=part('w1','def-washer','Scheibe M5','DIN125-M5'),
  summary=summarizeParts([...screws,washer],{mode:'grouped'});
 assert.equal(summary.rows.length,2,'Vier gleiche Schrauben und eine Scheibe ergeben zwei Stücklistenzeilen');
 const sheet=fixture(),
  position=cadDrawingPartsListDefaultPosition(sheet,summary.rows.length),
  table=createCadDrawingPartsList(summary.rows,{position});
 assert.equal(table.rows.length,2);
 const screw=table.rows.find(row=>row.definitionId==='def-screw'),
  disc=table.rows.find(row=>row.definitionId==='def-washer');
 assert.equal(screw.quantity,4);
 assert.deepEqual(screw.instanceIds,['s1','s2','s3','s4']);
 assert.equal(screw.position,1);
 assert.equal(disc.position,2);
 assert.deepEqual(validateCadDrawingPartsList(table),table);

 const project=createCadProject({drawings:{version:1,sheets:[{...sheet,partsList:table}]}});
 assert.equal(cadProjectStoredVersion(project),DRAWING_PARTS_LIST_PROJECT_VERSION);
 assert.equal(project.version,DRAWING_PARTS_LIST_PROJECT_VERSION);
 const serialized=serializeCadProject(project),
  reopened=parseCadProject(serialized);
 assert.equal(reopened.version,39);
 assert.deepEqual(reopened.drawings.sheets[0].partsList,table);
 const subset=selectCadDrawings(reopened.drawings,['body','s1']).sheets[0].partsList.rows;
 assert.deepEqual(subset.map(row=>[row.position,row.quantity,row.instanceIds]),[[1,1,['s1']]]);

 const reordered=createCadDrawingPartsList([...summary.rows].reverse(),{previous:reopened.drawings.sheets[0].partsList,position:reopened.drawings.sheets[0].partsList.position});
 assert.equal(reordered.rows.find(row=>row.definitionId==='def-screw').position,1,'Schraube behält Position 1');
 assert.equal(reordered.rows.find(row=>row.definitionId==='def-washer').position,2,'Scheibe behält Position 2');

 const nut={...part('n1','def-nut','Mutter M5','DIN934-M5'),variant:'L5'};
 const extended=createCadDrawingPartsList([...summary.rows,nut],{previous:reordered,position:reordered.position});
 assert.equal(extended.rows.find(row=>row.definitionId==='def-nut').position,3,'Neue Definition erhält die nächste freie Nummer');
 assert.equal(extended.rows.find(row=>row.definitionId==='def-screw').position,1);

 const invalidLow=JSON.parse(serialized);
 invalidLow.version=38;
 assert.throws(()=>parseCadProject(JSON.stringify(invalidLow)),/Projektformat 39/);
 const legacy=createCadProject({drawings:{version:1,sheets:[fixture()]}});
 assert.ok(cadProjectStoredVersion(legacy)<DRAWING_PARTS_LIST_PROJECT_VERSION);
});
test('B05-03: removing the last use removes active rows and keeps reserved numbers across later updates, undo, selection, remap and OCAD/FNPACK reopen',async t=>{
 const part=(id,definitionId,name,partNumber,extra={})=>({id,definitionId,name,partNumber,material:'Stahl',densityGcm3:7.85,volumeMm3:400,massG:3.14,centerMm:[0,0,10],...extra}),
  screws=[1,2,3,4].map(number=>part('s'+number,'def-screw','Zylinderschraube M5x20','ISO4762-M5-20',{centerMm:[number,0,10]})),
  washer=part('w1','def-washer','Scheibe M5','DIN125-M5'),
  nut=part('n1','def-nut','Mutter M5','DIN934-M5'),
  sheet=fixture(),
  rows=summarizeParts([...screws,washer,nut],{mode:'grouped'}).rows,
  table=createCadDrawingPartsList(rows,{position:cadDrawingPartsListDefaultPosition(sheet,rows.length)});
 assert.deepEqual(table.rows.map(row=>[row.position,row.definitionId]),[[1,'def-screw'],[2,'def-washer'],[3,'def-nut']]);
 const washerKey=table.rows.find(row=>row.definitionId==='def-washer').identityKey,
  nutKey=table.rows.find(row=>row.definitionId==='def-nut').identityKey,
  withoutNutAndWasher=rows.filter(row=>!['def-nut','def-washer'].includes(row.definitionId)),
  reduced=createCadDrawingPartsList(withoutNutAndWasher,{previous:table,position:table.position});
 assert.deepEqual(reduced.rows.map(row=>[row.position,row.definitionId]),[[1,'def-screw']]);
 assert.equal(reduced.rows.some(row=>row.identityKey===nutKey),false,'entfernte Position ist nicht mehr als vorhandenes Teil aktiv');
 assert.deepEqual(reduced.retainedPositions.map(row=>[row.position,row.identityKey]),[[2,washerKey],[3,nutKey]],'alle entfernten Zeilen bleiben reserviert');
 assert.equal(validateCadDrawingPartsList(reduced).rows.length,1);

 const insert=part('b1','def-bolt','Bolzen','BOLT-1'),
  laterRows=summarizeParts([...withoutNutAndWasher,nut,insert],{mode:'grouped'}).rows,
  later=createCadDrawingPartsList(laterRows,{previous:reduced,position:reduced.position});
 assert.equal(later.rows.find(row=>row.definitionId==='def-nut').position,3,'wieder eingeblendete Identität behält ihre Nummer');
 assert.equal(later.rows.find(row=>row.definitionId==='def-bolt').position,4,'neue Identität erhält die nächste freie Nummer');
 assert.deepEqual(later.retainedPositions.map(row=>[row.position,row.identityKey]),[[2,washerKey]]);

 const shown=createCadDrawingPartsList(summarizeParts([...withoutNutAndWasher,washer,nut,insert],{mode:'grouped'}).rows,{previous:later,position:later.position});
 assert.equal(shown.rows.find(row=>row.definitionId==='def-washer').position,2,'Scheibe erhält beim Wiedereinblenden wieder Position 2');
 assert.equal(shown.retainedPositions,undefined);

 const undone=createCadDrawingPartsList(summarizeParts([...withoutNutAndWasher,washer,nut,insert],{mode:'grouped'}).rows,{previous:structuredClone(shown),position:shown.position});
 assert.deepEqual(undone,shown,'Rückgängig führt zum selben Tabellenstand');
 const empty=createCadDrawingPartsList([],{previous:shown,position:shown.position});
 assert.deepEqual(empty.rows,[],'nach dem Löschen der letzten Verwendung bleibt keine aktive Zeile');
 assert.deepEqual(empty.retainedPositions.map(row=>row.position),[1,2,3,4]);

 const legacyTable=structuredClone(reduced);
 delete legacyTable.retainedPositions;
 assert.doesNotThrow(()=>validateCadDrawingSheet({...sheet,partsList:legacyTable}),'alte Stückliste ohne Reservierungsfeld bleibt lesbar');
 assert.deepEqual(validateCadDrawingPartsList(legacyTable).rows.map(row=>row.position),[1]);
 const clash=structuredClone(reduced);
 clash.retainedPositions[0].position=1;
 assert.throws(()=>validateCadDrawingPartsList(clash),/Doppelte Stücklisten-Positionsnummern/);

 const subset=selectCadDrawings({version:1,sheets:[{...sheet,partsList:reduced}]},['body','s1','w1']).sheets[0].partsList;
 assert.deepEqual(subset.rows.map(row=>[row.position,row.quantity,row.instanceIds]),[[1,1,['s1']]]);
 assert.deepEqual(subset.retainedPositions.map(row=>[row.position,row.instanceIds]),[[2,['w1']]],'Auswahl behält nur Reservierungen gewählter Instanzen');

 const standalone={id:'p1',name:'Blech',partNumber:'BLE-1',material:'Stahl',densityGcm3:7.85,volumeMm3:100,massG:0.8,centerMm:[0,0,1]},
  mixedRows=summarizeParts([screws[0],standalone],{mode:'grouped'}).rows,
  mixed=createCadDrawingPartsList(mixedRows,{position:cadDrawingPartsListDefaultPosition(sheet,mixedRows.length)}),
  mixedWithout=createCadDrawingPartsList(mixedRows.filter(row=>row.id!=='p1'),{previous:mixed,position:mixed.position}),
  mapped=remapCadDrawings({version:1,sheets:[{...sheet,partsList:mixedWithout}]},new Map([['body','copy'],['s1','s1c'],['p1','p1c']]),prefix=>prefix+'-x'),
  mappedList=mapped.sheets[0].partsList;
 assert.deepEqual(mappedList.rows[0].instanceIds,['s1c']);
 assert.deepEqual(mappedList.retainedPositions.map(row=>[row.instanceIds,row.identityKey]),[[['p1c'],JSON.stringify(['standalone','p1c'])]],'Remap schreibt auch reservierte Instanz- und Identitätsbezüge um');
 assert.doesNotThrow(()=>validateCadDrawingSheet(mapped.sheets[0]));

 const project=createCadProject({drawings:{version:1,sheets:[{...sheet,partsList:later}]}});
 assert.equal(cadProjectStoredVersion(project),DRAWING_PARTS_LIST_PROJECT_VERSION);
 assert.equal(project.version,39);
 const reopened=parseCadProject(serializeCadProject(project));
 assert.equal(reopened.version,39);
 assert.deepEqual(reopened.drawings.sheets[0].partsList,later,'OCAD-Speichern und Wiederöffnen erhält aktive und reservierte Positionen');

 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-parts-'));
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const file=path.join(directory,'parts.fnpack'),
  {encodeFnpackProject}=await import('../src/cad-fnpack-data.js'),
  {writeFnpack,openFnpack}=await import('../backend/fnpack.cjs');
 await writeFnpack(file,encodeFnpackProject(project));
 let pack;
 try{
  pack=await openFnpack(file);
  assert.equal(pack.index.project.version,DRAWING_PARTS_LIST_PROJECT_VERSION);
  assert.deepEqual(pack.index.project.drawings.sheets[0].partsList,later,'FNPACK-Speichern und Wiederöffnen erhält aktive und reservierte Positionen');
 }finally{
  await pack?.close();
 }
});

test('B06 retains exact placement across remapping, active BOM changes, and project/library/package roundtrips', async (t) => {
  const placement = (rootId, path = []) => ({ source: { rootId, path }, role: 'box.edge.x.y.min.z.max' });
  const duplicate = { ...placement('body'), role: 'box.edge.x.y.min.z.min' };
  const sheet = fixture([
    line('old', 40, [placement('body'), duplicate]),
    line('ambiguous', 20, [placement('body'), placement('neighbor')]),
    line('nested', 30, [placement('body', ['child'])]),
    line('unmapped', 30, null),
  ]);
  const view = sheet.views[0];
  view.sourceIds.push('neighbor');
  view.projection.sourceSignatures.push({ id: 'neighbor', signature });
  const properties = { definitionId: 'same-definition', partNumber: 'M8-20', name: 'Test screw' },
    rows = summarizeParts([{ ...properties, id: 'body' }, { ...properties, id: 'neighbor' }], { mode: 'grouped' }).rows;
  sheet.partsList = createCadDrawingPartsList(rows, { position: [78, 135] });
  const params = { id: 'balloon', viewId: view.id, position: [20, 30] };
  const balloon = createCadDrawingBalloon(sheet, { ...params, curveId: 'old' });
  sheet.annotations = [balloon];

  assert.equal(balloon.instanceId, 'body');
  assert.equal(cadDrawingBalloon(sheet, balloon).row.position, 1);
  for (const curveId of ['ambiguous', 'nested', 'unmapped'])
    assert.throws(() => createCadDrawingBalloon(sheet, { ...params, curveId }), /eindeutigem Platzierungsbezug/);
  assert.throws(() => validateCadDrawingSheet({
    ...sheet,
    annotations: [{ ...balloon, instanceId: 'neighbor' }],
  }), /eindeutigen Bezug/);

  const drawings = { version: 1, sheets: [sheet] };
  const { loadCadKernel } = await import('../src/cad-kernel-loader.js');
  const { createCadService } = await import('../src/cad-service.js');
  const service = createCadService({ oc: await loadCadKernel({ print: () => {}, printErr: () => {} }) });
  t.after(() => service.dispose());
  const nodes = ['body', 'neighbor'].map((id) => service.nativeNode({ type: 'box', size: [10, 8, 8] }, { id }));
  const project = createCadProject({ drawings, nodes });
  assert.equal(project.version, 41);
  assert.throws(() => parseCadProject({ ...project, version: 40 }), /Projektformat 41/);
  assert.deepEqual(parseCadProject(serializeCadProject(project)).drawings, project.drawings);
  const { createCadPersistence } = await import('../src/cad-persistence.js');
  const values = new Map();
  const persistence = createCadPersistence({
    storage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    transactions: { snapshot() {}, preview() {} },
    verify: async (value) => value,
  });
  const library = { format: 'FormnaroCADLibrary', version: 41, items: [{ id: 'sheet-item', name: 'Assembly', project }] };
  await assert.rejects(persistence.importLibrary(JSON.stringify({ ...library, version: 40 })), /Bibliotheksversion 41/);
  await persistence.importLibrary(JSON.stringify(library));
  assert.deepEqual(JSON.parse(persistence.exportLibrary()).items[0].project.drawings, project.drawings);
  const copied = remapCadDrawings(drawings, new Map([['body', 'copied'], ['neighbor', 'copied-neighbor']]),
    (prefix) => prefix + '-copy').sheets[0];
  const copiedBalloon = copied.annotations[0];
  assert.equal(copiedBalloon.instanceId, 'copied');
  assert.equal(copiedBalloon.sourceReferences[0].source.rootId, 'copied');
  assert.deepEqual(cadDrawingBalloon(copied, copiedBalloon).row.instanceIds, ['copied', 'copied-neighbor']);

  const renewed = updateCadDrawingProjection(sheet, view.id, {
    ...view.projection,
    curves: [line('moved', 50, [duplicate, placement('body')]), line('old', 40, [placement('neighbor')])],
  });
  assert.equal(renewed.annotations[0].curveId, 'moved');
  assert.deepEqual(cadDrawingBalloon(renewed, renewed.annotations[0]).target, [85, 60]);
  assert.equal(cadDrawingBalloon(renewed, renewed.annotations[0]).row.position, 1);
  renewed.partsList.rows[0].position = 12;
  assert.equal(cadDrawingBalloon(renewed, renewed.annotations[0]).row.position, 12);
  const activeRow = renewed.partsList.rows[0];
  renewed.partsList = createCadDrawingPartsList([], { previous: renewed.partsList });
  assert.equal(renewed.partsList.retainedPositions[0].position, activeRow.position);
  assert.equal(cadDrawingProblems(renewed)[0].code, 'LOST_BALLOON_REFERENCE');
  const reusedId = updateCadDrawingProjection(sheet, view.id, {
    ...view.projection,
    curves: [line('old', 40, [placement('neighbor')])],
  });
  assert.equal(cadDrawingProblems(reusedId)[0].code, 'LOST_BALLOON_REFERENCE');

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'formnaro-balloon-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'assembly.fnpack'),
    { encodeFnpackProject } = await import('../src/cad-fnpack-data.js'),
    { writeFnpack, openFnpack } = await import('../backend/fnpack.cjs');
  await writeFnpack(file, encodeFnpackProject(project));
  const pack = await openFnpack(file);
  try {
    assert.equal(pack.index.project.version, 41);
    assert.deepEqual(pack.index.project.drawings, project.drawings);
  } finally {
    await pack.close();
  }
});
