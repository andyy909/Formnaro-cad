import test from 'node:test';
import assert from 'node:assert/strict';
import {autoDimensionCadDrawing} from '../src/cad-drawing-auto-dimensions.js';
import {cadDrawingCurvePoint,cadDrawingCurveBounds} from '../src/cad-drawing-measure.js';
import {createCadDrawingSheet,cadDrawingViewFrame,cadDrawingDimension,validateCadDrawingSheet,cadDrawingProblems,updateCadDrawingProjection,remapCadDrawings} from '../src/cad-drawing-data.js';
import {cadDrawingSvg,cadDrawingDxf,cadDrawingAnnotationGeometry} from '../src/cad-drawing-export.js';
import {createCadProject,cadProjectSnapshot,validateCadProject,serializeCadProject,parseCadProject,cadProjectStoredVersion} from '../src/cad-project.js';
import {encodeFnpackProject,materializedFnpackProject} from '../src/cad-fnpack-data.js';

const signature='a'.repeat(64),line=(id,a,b)=>({id,kind:'line',hidden:false,a,b}),circle=(id,center,radius)=>({id,kind:'circle',hidden:false,center,radius});
const outline=[line('bottom',[0,0],[40,0]),line('right',[40,0],[40,30]),line('top',[0,30],[40,30]),line('left',[0,0],[0,30])];
function plate(){const sheet=createCadDrawingSheet({id:'sheet',sourceIds:['body']});sheet.views=[{id:'top',kind:'top',sourceIds:['body'],position:[65,90],projection:{kind:'cad-drawing-projection',view:'top',frame:cadDrawingViewFrame('top'),curves:[...structuredClone(outline),circle('hole1',[8,8],2.5),circle('hole2',[32,8],2.5),circle('hole3',[32,22],2.5),circle('hole4',[8,22],2.5)],bounds:{min:[0,0],max:[40,30]},sourceSignatures:[{id:'body',signature}],tolerance:.001,approximation:'exact-native-curves'}}];return sheet;}
const values=sheet=>sheet.annotations.map(a=>cadDrawingDimension(sheet,a));
test('repeated auto dimensions on canonical serialized projections retain valid roles across mixed object-key orders',()=>{
 const sheet=plate();for(const c of sheet.views[0].projection.curves)c.sourceReferences=[{source:{rootId:'body',path:['original-child']},role:'edge.'+c.id}];
 const saved=JSON.parse(JSON.stringify(sheet,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value));
 const first=autoDimensionCadDrawing(saved,{mode:'detailed'});saved.annotations=first.sheet.annotations;assert.deepEqual(cadDrawingProblems(saved),[]);assert(values(saved).length>=10);
 const canonical=JSON.parse(JSON.stringify(saved,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value));canonical.annotations=autoDimensionCadDrawing(canonical,{mode:'detailed'}).sheet.annotations;assert.deepEqual(cadDrawingProblems(canonical),[]);
});
test('basic plate suggestions include exact overall dimensions and diameters, preserve input, and remain idempotent',()=>{
 const sheet=plate(),before=JSON.stringify(sheet),first=autoDimensionCadDrawing(sheet);assert.equal(JSON.stringify(sheet),before);assert.equal(first.report.added,6);assert.equal(first.report.noSpace,0);assert.deepEqual(values(first.sheet).map(v=>v.value),[40,30,5,5,5,5]);assert.deepEqual(cadDrawingProblems(first.sheet),[]);
 const second=autoDimensionCadDrawing(first.sheet);assert.equal(second.report.added,0);assert.deepEqual(second.sheet,first.sheet);
});
test('detail pass adds datum-to-centre coordinates, deduplicates shared positions and preserves authored text and moved dimensions',()=>{
 const basic=autoDimensionCadDrawing(plate()).sheet;basic.annotations[0].position=[160,40];basic.annotations.push({id:'note',kind:'label',text:'Passung nach Vorgabe',position:[170,55]});const prior=structuredClone(basic.annotations),detailed=autoDimensionCadDrawing(basic,{mode:'detailed'});
 assert.deepEqual(detailed.sheet.annotations.slice(0,prior.length),prior);const distances=detailed.sheet.annotations.filter(a=>a.kind==='distance');assert.deepEqual(distances.map(a=>cadDrawingDimension(detailed.sheet,a).value).sort((a,b)=>a-b),[8,8,22,30,32,40]);assert.equal(autoDimensionCadDrawing(detailed.sheet,{mode:'detailed'}).report.added,0);
});
test('overall axes are not repeated in orthographic views of the same source set',()=>{
 const sheet=plate();sheet.views[0].projection.curves=structuredClone(outline);const other=structuredClone(sheet.views[0]);other.id='front';other.kind=other.projection.view='front';other.projection.frame=cadDrawingViewFrame('front');other.position=[155,90];sheet.views.push(other);const out=autoDimensionCadDrawing(sheet);assert.equal(out.report.added,3);assert.equal(out.sheet.annotations.filter(a=>a.axis==='x').length,1);
});
test('spline extents are never inferred from control poles, hidden curves are not automatically measured, and crowding is reported',()=>{
 const sheet=plate();sheet.views[0].projection.curves.push({id:'spline',kind:'bezier',hidden:false,poles:[[0,0],[60,70],[40,0]],weights:[1,1,1]},circle('hidden',[100,100],12));sheet.views[0].projection.curves.at(-1).hidden=true;const out=autoDimensionCadDrawing(sheet,{mode:'detailed'});assert.equal(out.report.unsupportedViews,1);assert(out.report.warnings.length);assert(!out.sheet.annotations.some(a=>a.kind==='distance'||a.curveIds.includes('hidden')));
 const huge=plate();huge.scale=10;huge.views[0].position=[20,340];const crowded=autoDimensionCadDrawing(huge);assert.equal(crowded.report.added,0);assert(crowded.report.noSpace>0);assert(crowded.report.warnings.some(s=>s.includes('Platz')));
});
test('analytic arc and mirrored ellipse extrema honor trimmed parameters and remain exact at model offsets',()=>{
 const arc={kind:'arc',center:[1000,-200],radius:5,startAngle:Math.PI/4,endAngle:3*Math.PI/4,clockwise:false};const bounds=cadDrawingCurveBounds(arc);assert(Math.abs(bounds.min[1]-(-200+5/Math.SQRT2))<1e-10);assert.equal(bounds.max[1],-195);assert(Math.abs(bounds.max[0]-(1000+5/Math.SQRT2))<1e-10);
 const mirrored={kind:'ellipse',center:[0,0],radii:[6,2],xAxis:[1,0],yAxis:[0,-1],startAngle:0,endAngle:Math.PI,clockwise:true,closed:false};assert.equal(cadDrawingCurvePoint(mirrored,'minY')[1],-2);assert(Math.abs(cadDrawingCurvePoint(mirrored,'maxY')[1])<1e-12);assert.throws(()=>cadDrawingCurvePoint({kind:'bezier'},'minX'));
});
test('distance references validate strictly, cannot store numeric overrides, and exports show physical units at every paper scale',()=>{
 const out=autoDimensionCadDrawing(plate()).sheet,a=out.annotations[0];for(const scale of [.2,1,5]){out.scale=scale;assert.equal(cadDrawingDimension(out,a).value,40);const g=cadDrawingAnnotationGeometry(out,a);assert.equal(g.lines.length,scale===.2?4:3);assert(Math.abs(g.lines[2][1][0]-g.lines[2][0][0])===40*scale);assert(cadDrawingSvg(out).includes('40 mm'));assert(cadDrawingDxf(out).includes('40 mm'));}
 for(const mutate of [a=>a.axis='z',a=>a.anchors[0].curveIndex=2,a=>a.anchors[0].point='free',a=>a.anchors[0].value=42,a=>a.value=42,a=>a.curveIds.push(a.curveIds[0])]){const bad=structuredClone(out);mutate(bad.annotations[0]);assert.throws(()=>validateCadDrawingSheet(bad));}
 const same=structuredClone(out);same.annotations[0].anchors[1]=structuredClone(same.annotations[0].anchors[0]);assert.throws(()=>cadDrawingDimension(same,same.annotations[0]),/keinen messbaren/);
});
test('freshness, unique stable-role updates, lost-role exports and remapping apply to new distance references',()=>{
 const sheet=plate();for(const c of sheet.views[0].projection.curves)c.sourceReferences=[{source:{rootId:'body',path:[]},role:'edge.'+c.id}];const out=autoDimensionCadDrawing(sheet).sheet;assert(out.annotations.filter(a=>a.kind==='distance').every(a=>a.curveReferences.length));
 const projection=structuredClone(sheet.views[0].projection);for(const c of projection.curves){c.id+='-new';if(c.kind==='line'){c.a=c.a.map(v=>v*2);c.b=c.b.map(v=>v*2);}else{c.center=c.center.map(v=>v*2);c.radius*=2;}}projection.sourceSignatures[0].signature='b'.repeat(64);const next=updateCadDrawingProjection(out,'top',projection);assert.equal(cadDrawingDimension(next,next.annotations[0]).value,80);assert.deepEqual(cadDrawingProblems(next),[]);
 projection.curves=[];const lost=updateCadDrawingProjection(next,'top',projection);assert(lost.annotations[0].unresolved);assert.throws(()=>cadDrawingSvg(lost));
 const remapped=remapCadDrawings({version:1,sheets:[next]},new Map([['body','copy']]));assert.equal(remapped.sheets[0].annotations[0].curveReferences[0].sourceReferences[0].source.rootId,'copy');assert.deepEqual(cadDrawingProblems(remapped.sheets[0]),[]);
 assert.throws(()=>autoDimensionCadDrawing(sheet,{sourceSignatures:new Map()}),/aktualisieren/);
});
test('new dimensions require format18, roundtrip through project and package catalogues while old drawings keep their format',()=>{
 const project=createCadProject();project.drawings={version:1,sheets:[autoDimensionCadDrawing(plate()).sheet]};const stored=cadProjectSnapshot(project);assert.equal(stored.version,18);assert.deepEqual(parseCadProject(serializeCadProject(stored)),stored);assert.throws(()=>validateCadProject({...stored,version:17}),/18/);
 const pack=encodeFnpackProject(stored);assert.equal(pack.project.version,18);assert.deepEqual(pack.project.drawings,stored.drawings);assert.equal(materializedFnpackProject(pack.project).version,18);
 assert.equal(cadProjectStoredVersion({nodes:[],drawings:{version:1,sheets:[plate()]}}),12);
});
test('boundaries and label avoidance are checked on A4/A3 and both orientations without moving cached views',()=>{
 for(const paper of ['A4','A3'])for(const orientation of ['portrait','landscape']){const sheet=plate();sheet.paper=paper;sheet.orientation=orientation;sheet.annotations=[{id:'note',kind:'label',text:'Unverändert',position:[85,98]}];const views=structuredClone(sheet.views),out=autoDimensionCadDrawing(sheet,{mode:'detailed'}),boxes=[];assert.deepEqual(out.sheet.views,views);assert.equal(out.report.noSpace,0);for(const a of out.sheet.annotations){const text=a.kind==='label'?a.text:cadDrawingDimension(out.sheet,a).text,w=Math.max(8,text.length*1.9+3),p=a.position,box={min:[p[0]-w/2,p[1]-5.2],max:[p[0]+w/2,p[1]+1.2]};assert(!boxes.some(b=>b.min.every((v,k)=>v<box.max[k]&&b.max[k]>box.min[k])));boxes.push(box);}}
});
test('bounded requests return explicit limits and invalid IDs fail without changing the input',()=>{
 const sheet=plate(),out=autoDimensionCadDrawing(sheet,{maxNew:1});assert.equal(out.report.added,1);assert(out.report.limited>0);assert.throws(()=>autoDimensionCadDrawing(sheet,{makeId:()=>sheet.id}),/eindeutig/);assert.throws(()=>autoDimensionCadDrawing(sheet,{mode:'all'}));assert.equal(sheet.annotations.length,0);
});
