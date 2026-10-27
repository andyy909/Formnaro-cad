import test from 'node:test';
import assert from 'node:assert/strict';
import {createCadDrawingSheet,validateCadDrawings,validateCadDrawingProjection,cadDrawingPaperSize,cadDrawingViewFrame,cadDrawingProblems,cadDrawingDimension,cadDrawingSourceSignatures,selectCadDrawings,remapCadDrawings} from '../src/cad-drawing-data.js';
const signature='a'.repeat(64);
const projection=(view='front',curves=[{id:'edge',kind:'line',hidden:false,a:[0,0],b:[40,0]}],section)=>({kind:'cad-drawing-projection',view,frame:cadDrawingViewFrame(view,section),curves,bounds:{min:[0,0],max:[40,20]},sourceSignatures:[{id:'body',signature}],tolerance:.001,approximation:'exact-native-curves'});
function sheet(){const s=createCadDrawingSheet({id:'s',sourceIds:['body']});s.views=s.views.slice(0,1);s.views[0].id='front';s.views[0].projection=projection();return s;}

test('drawing document validates strict bounded portable data and preserves caller inputs',()=>{
 const s=sheet(),value={version:1,sheets:[s]},out=validateCadDrawings(value);assert.deepEqual(out,value);out.sheets[0].views[0].projection.curves[0].a[0]=99;assert.equal(s.views[0].projection.curves[0].a[0],0);
 for(const mutate of [v=>v.secret='x',v=>v.version=2,v=>v.sheets[0].scale=0,v=>v.sheets[0].views[0].sourceIds.push('body'),v=>v.sheets[0].views[0].projection.curves.push({...v.sheets[0].views[0].projection.curves[0]}),v=>v.sheets[0].views[0].projection.curves[0].a[0]=Infinity]){const bad=structuredClone(value);mutate(bad);assert.throws(()=>validateCadDrawings(bad),/Zeichnung/);}
 assert.throws(()=>validateCadDrawings({version:1,sheets:Array.from({length:17},()=>s)}),/Grenze/);
});
test('A4 and A3 paper dimensions and orientation are exact millimetres',()=>{
 for(const [paper,orientation,size]of [['A4','portrait',[210,297]],['A4','landscape',[297,210]],['A3','portrait',[297,420]],['A3','landscape',[420,297]]])assert.deepEqual(cadDrawingPaperSize({paper,orientation}),size);
});
test('all three orthographic frames and section origin match explicit native coordinate system',()=>{
 for(const [kind,x,y]of [['front',[1,0,0],[0,0,1]],['side',[0,1,0],[0,0,1]],['top',[1,0,0],[0,1,0]]]){const f=cadDrawingViewFrame(kind);assert.deepEqual(f.slice(0,3),x);assert.deepEqual(f.slice(4,7),y);}
 for(let axis=0;axis<3;axis++){const frame=cadDrawingViewFrame('section',{axis,offset:13.2});assert.equal(frame[12+axis],13.2);}
});
test('drawing staleness and lost sources require update while layout changes reuse cached geometry',()=>{
 const s=sheet(),fresh=new Map([['body',signature]]);assert.deepEqual(cadDrawingProblems(s,{sourceSignatures:fresh}),[]);
 s.scale=.5;s.views[0].position=[20,90];assert.deepEqual(cadDrawingProblems(s,{sourceSignatures:fresh}),[]);
 assert.equal(cadDrawingProblems(s,{sourceSignatures:new Map()})[0].code,'STALE_SOURCE');assert.equal(cadDrawingProblems(s,{sourceSignatures:{body:'b'.repeat(64)}})[0].code,'STALE_SOURCE');
 delete s.views[0].projection;assert.equal(cadDrawingProblems(s)[0].code,'UPDATE_REQUIRED');
});
test('changed section axes and cut offsets cannot export a cached projection for old cut',()=>{
 const s=sheet(),v=s.views[0];v.kind='section';v.section={axis:2,offset:10};v.projection=projection('section',undefined,v.section);assert.deepEqual(cadDrawingProblems(s),[]);v.section.offset=11;assert.equal(cadDrawingProblems(s)[0].code,'STALE_VIEW');
});
test('length angle radius diameter dimensions are measured from selected cached curves without numeric overrides',()=>{
 const s=sheet(),v=s.views[0];v.projection.curves.push({id:'vertical',kind:'line',hidden:false,a:[0,0],b:[0,30]},{id:'circle',kind:'circle',hidden:false,center:[5,5],radius:4});
 for(const [kind,curveIds,value,text]of [['length',['edge'],40,'40 mm'],['angle',['edge','vertical'],90,'90°'],['radius',['circle'],4,'R 4 mm'],['diameter',['circle'],8,'Ø 8 mm']]){const a={id:'a',kind,viewId:v.id,curveIds,position:[50,50]};assert.equal(cadDrawingDimension(s,a).value,value);assert.equal(cadDrawingDimension(s,a).text,text);s.annotations=[a];assert.deepEqual(cadDrawingProblems(s),[]);}
 s.annotations[0].curveIds=['removed'];assert.equal(cadDrawingProblems(s)[0].code,'LOST_DIMENSION_REFERENCE');assert.throws(()=>cadDrawingDimension(s,{kind:'radius',viewId:v.id,curveIds:['edge']}),/Kreis/);
});
test('ellipse and rational Bézier validation retains exact representations and positive weights',()=>{
 const curves=[{id:'ellipse',kind:'ellipse',center:[0,0],radii:[2,5],xAxis:[1,0],yAxis:[0,-1],startAngle:0,endAngle:Math.PI,clockwise:true,closed:false},{id:'bezier',kind:'bezier',poles:[[1,0],[1,1],[0,1]],weights:[1,Math.SQRT1_2,1]}],p=projection('front',curves);p.tolerance=1e-7;assert.equal(validateCadDrawingProjection(p).curves.length,2);
 p.curves[1].weights[1]=0;assert.throws(()=>validateCadDrawingProjection(p),/Zahl/);p.curves[1].weights[1]=1;p.curves[0].yAxis=[1,0];assert.throws(()=>validateCadDrawingProjection(p),/orthonormal/);
});
test('source signatures include physical placement and parameters but ignore names and colors',()=>{
 const root={id:'body',kind:'cad',source:'native',solid:true,transform:cadDrawingViewFrame('top'),recipe:{type:'box',size:[40,20,10]},name:'Box',color:'#fff'},project={nodes:[root]};const first=cadDrawingSourceSignatures(project).get('body');root.name='Other';root.color='#000';assert.equal(cadDrawingSourceSignatures(project).get('body'),first);root.transform[12]=5;assert.notEqual(cadDrawingSourceSignatures(project).get('body'),first);assert.equal(cadDrawingSourceSignatures(project,['unknown']).size,0);
});
test('library subset selection omits sheets with any unselected source and remaps all internal document identities',()=>{
 const s=sheet(),other=sheet();other.id='other';other.views[0].id='other-front';other.views[0].sourceIds=['neighbour'];const doc={version:1,sheets:[s,other]};assert.deepEqual(selectCadDrawings(doc,['body']).sheets.map(s=>s.id),['s']);s.annotations=[{id:'dim',kind:'length',viewId:'front',curveIds:['edge'],position:[30,60]}];let serial=0;const remapped=remapCadDrawings({version:1,sheets:[s]},new Map([['body','copy']]),prefix=>prefix+'-'+(++serial)),copy=remapped.sheets[0];assert.notEqual(copy.id,s.id);assert.notEqual(copy.views[0].id,'front');assert.notEqual(copy.annotations[0].id,'dim');assert.equal(copy.annotations[0].viewId,copy.views[0].id);assert.equal(copy.views[0].sourceIds[0],'copy');assert.equal(copy.views[0].projection.sourceSignatures[0].id,'copy');assert.deepEqual(copy.annotations[0].curveIds,['edge']);assert.equal(s.views[0].sourceIds[0],'body');
});
test('library subset never carries unselected cached or measured source references',()=>{
 const s=sheet(),value={version:1,sheets:[s]};s.views[0].projection.sourceSignatures.push({id:'unrelated',signature});assert.equal(selectCadDrawings(value,['body']).sheets.length,0);s.views[0].projection.sourceSignatures.pop();s.annotations.push({id:'dim',kind:'length',viewId:'front',curveIds:['edge'],position:[30,60],sourceSignatures:[{id:'unrelated',signature}]});assert.equal(selectCadDrawings(value,['body']).sheets.length,0);s.annotations[0].sourceSignatures=[{id:'body',signature}];assert.equal(selectCadDrawings(value,['body']).sheets.length,1);
 const mapped=remapCadDrawings(value,new Map([['body','copy'],['s','sheet-copy'],['front','front-copy'],['dim','dim-copy']]));assert.equal(mapped.sheets[0].id,'sheet-copy');assert.equal(mapped.sheets[0].views[0].id,'front-copy');assert.equal(mapped.sheets[0].annotations[0].id,'dim-copy');assert.equal(mapped.sheets[0].annotations[0].viewId,'front-copy');assert.equal(mapped.sheets[0].annotations[0].sourceSignatures[0].id,'copy');
});
