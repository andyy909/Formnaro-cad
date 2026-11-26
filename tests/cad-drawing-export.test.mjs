import test from 'node:test';
import assert from 'node:assert/strict';
import {DOMParser} from '@xmldom/xmldom';
import {createCadDrawingSheet,cadDrawingViewFrame,createCadDrawingPartsList,cadDrawingPartsListDefaultPosition} from '../src/cad-drawing-data.js';
import {summarizeParts} from '../src/cad-part-properties.js';
import {cadDrawingSvg,cadDrawingDxf,cadDrawingBezierPolyline,cadDrawingAnnotationGeometry} from '../src/cad-drawing-export.js';
const signature='a'.repeat(64),near=(a,b,tol=1e-10)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);
const curves=[{id:'line',kind:'line',hidden:false,a:[-5,2],b:[35,2]},{id:'up',kind:'line',hidden:false,a:[-5,2],b:[-5,32]},{id:'circle',kind:'circle',hidden:false,center:[10,20],radius:4.125},{id:'arc',kind:'arc',hidden:false,center:[12,15],radius:3,startAngle:0,endAngle:Math.PI/2,clockwise:false},{id:'ellipse',kind:'ellipse',hidden:false,center:[0,5],radii:[2,5],xAxis:[1,0],yAxis:[0,-1],startAngle:.2,endAngle:2.4,clockwise:true,closed:false},{id:'bezier',kind:'bezier',hidden:false,poles:[[0,0],[1,1],[2,0]],weights:[1,.7,1]}];
function sheet(scale=1){const s=createCadDrawingSheet({id:'sheet',name:'A <B> & "C"',sourceIds:['body'],scale,titleBlock:{title:'Safe <title>',author:'A&B',number:'X-1'}});s.views=s.views.slice(0,1);s.views[0].id='front';s.views[0].projection={kind:'cad-drawing-projection',view:'front',frame:cadDrawingViewFrame('front'),curves:structuredClone(curves),bounds:{min:[-5,0],max:[35,32]},sourceSignatures:[{id:'body',signature}],tolerance:.001,approximation:'exact-native-curves'};s.annotations=[{id:'length',kind:'length',viewId:'front',curveIds:['line'],position:[70,120]},{id:'angle',kind:'angle',viewId:'front',curveIds:['line','up'],position:[85,85]},{id:'radius',kind:'radius',viewId:'front',curveIds:['circle'],position:[100,70]},{id:'diameter',kind:'diameter',viewId:'front',curveIds:['circle'],position:[100,65]},{id:'label',kind:'label',text:'A < B & Ø 8',position:[100,155]}];return s;}
// A generic group-pair reader does not share writer logic or geometry helpers.
function dxf(text){const lines=text.trimEnd().split(/\r?\n/),pairs=[];assert.equal(lines.length%2,0);for(let i=0;i<lines.length;i+=2)pairs.push([Number(lines[i]),lines[i+1]]);const start=pairs.findIndex((p,i)=>p[0]===2&&p[1]==='ENTITIES'&&pairs[i-1][1]==='SECTION'),entities=[];let current;for(const [code,value]of pairs.slice(start+1)){if(code===0){if(value==='ENDSEC')break;current={type:value,pairs:[]};entities.push(current);}else current?.pairs.push([code,value]);}return {pairs,entities};}
const get=(e,code)=>e.pairs.find(p=>p[0]===code)?.[1],all=(e,code)=>e.pairs.filter(p=>p[0]===code).map(p=>Number(p[1]));

test('SVG is vector paper output with exact A4/A3 sizes and XML-safe titles, names and labels',()=>{
 for(const [paper,orientation,w,h]of [['A4','landscape',297,210],['A4','portrait',210,297],['A3','landscape',420,297],['A3','portrait',297,420]]){const s=sheet();s.paper=paper;s.orientation=orientation;const svg=cadDrawingSvg(s),doc=new DOMParser({onError:e=>{throw Error(e);}}).parseFromString(svg,'image/svg+xml');assert.equal(doc.documentElement.getAttribute('width'),w+'mm');assert.equal(doc.documentElement.getAttribute('height'),h+'mm');assert.equal(doc.documentElement.getAttribute('viewBox'),`0 0 ${w} ${h}`);assert.equal(doc.getElementsByTagName('script').length,0);assert.ok(doc.getElementsByTagName('path').length>3);assert.ok(doc.getElementsByTagName('text').length>4);assert.match(svg,/Safe &lt;title&gt;/);assert.match(svg,/A &lt; B &amp; Ø 8/);assert.doesNotMatch(svg,/<style|url\(|href=/);}
});
test('SVG uses cached exact model curves and sheet scale only in its view transform',()=>{
 const s=sheet(.5),before=JSON.stringify(s),svg=cadDrawingSvg(s);assert.match(svg,/scale\(0.5 -0.5\)/);assert.match(svg,/r="4.125"/);assert.match(svg,/40 mm/);assert.equal(JSON.stringify(s),before);const interactive=cadDrawingSvg(s,{interactive:true});assert.match(interactive,/data-drawing-view="front"/);assert.match(interactive,/data-drawing-curve="line"/);assert.match(interactive,/data-drawing-annotation="length"/);assert.match(interactive,/stroke="transparent" stroke-width="6"/);assert.doesNotMatch(svg,/data-drawing-curve/);
});
test('all exports refuse stale sources, absent projections, changed cuts and lost dimensions',()=>{
 for(const render of [cadDrawingSvg,cadDrawingDxf]){assert.throws(()=>render(sheet(),{sourceSignatures:new Map()}),/geändert oder verloren/);const s=sheet();s.annotations[0].curveIds=['gone'];assert.throws(()=>render(s),/Maßbezug verloren/);delete s.views[0].projection;assert.throws(()=>render(s),/Blatt aktualisieren/);}
 const draft=sheet();delete draft.views[0].projection;assert.match(cadDrawingSvg(draft,{allowStale:true,interactive:true}),/Blatt aktualisieren/);
});
test('ASCII DXF declares AutoCAD2000 and mm, independently read geometry remains 1:1 at all paper scales',()=>{
 for(const scale of [.1,.5,1,2,10]){const s=sheet(scale),text=cadDrawingDxf(s),read=dxf(text);assert.ok([...text].every(c=>c.charCodeAt(0)<128));assert.match(text,/\$ACADVER\r\n1\r\nAC1015/);assert.match(text,/\$INSUNITS\r\n70\r\n4/);const geometry=read.entities.filter(e=>get(e,8)==='VIEW_1'),line=geometry.find(e=>e.type==='LINE'),circle=geometry.find(e=>e.type==='CIRCLE');near(Math.hypot(Number(get(line,11))-Number(get(line,10)),Number(get(line,21))-Number(get(line,20))),40);near(Number(get(circle,40)),4.125);assert.ok(read.entities.some(e=>get(e,1)==='40 mm'));assert.ok(read.entities.some(e=>get(e,1)==='\\U+00D8 8.25 mm'));assert.ok(read.entities.some(e=>get(e,1)==='A < B & \\U+00D8 8'));}
});
test('DXF retains circular arcs, mirrored ellipse axes, and rational spline control data exactly',()=>{
 const read=dxf(cadDrawingDxf(sheet())),arc=read.entities.find(e=>e.type==='ARC'&&get(e,8)==='VIEW_1'),ellipse=read.entities.find(e=>e.type==='ELLIPSE'),spline=read.entities.find(e=>e.type==='SPLINE');near(Number(get(arc,40)),3);near(Number(get(arc,50)),0);near(Number(get(arc,51)),90);near(Number(get(ellipse,40)),.4);assert.equal(Number(get(ellipse,230)),-1);near(Math.hypot(Number(get(ellipse,11)),Number(get(ellipse,21))),5);near(Number(get(ellipse,41)),(.2-Math.PI/2+Math.PI*2)%(Math.PI*2));assert.equal(Number(get(spline,71)),2);assert.deepEqual(all(spline,40),[0,0,0,1,1,1]);assert.deepEqual(all(spline,41),[1,.7,1]);assert.equal(Number(get(spline,70))&4,4);
});
test('multiple DXF views have separate layers and nonoverlapping 1:1 model geometry independent of paper moves',()=>{
 const s=sheet(),second=structuredClone(s.views[0]);second.id='second';second.position=[1,1];s.views.push(second);const read=dxf(cadDrawingDxf(s)),line1=read.entities.find(e=>e.type==='LINE'&&get(e,8)==='VIEW_1'),line2=read.entities.find(e=>e.type==='LINE'&&get(e,8)==='VIEW_2');near(Number(get(line2,10))-Number(get(line1,10)),60);near(Number(get(line2,11))-Number(get(line2,10)),40);
});
test('positive rational Bézier SVG approximation has a conservative explicit bound',()=>{
 const c={kind:'bezier',poles:[[1,0],[1,1],[0,1]],weights:[1,Math.SQRT1_2,1]},poly=cadDrawingBezierPolyline(c,{tolerance:1e-4});assert.ok(poly.maxDeviation<=1e-4);assert.ok(poly.points.length>10);assert.deepEqual(poly.points[0],[1,0]);assert.deepEqual(poly.points.at(-1),[0,1]);for(const p of poly.points)near(Math.hypot(...p),1,1e-12);assert.throws(()=>cadDrawingBezierPolyline(c,{tolerance:1e-7,maxPoints:3}),/Kurvenpunktgrenze/);
});
test('all annotation drawing points derive from paper transforms while displayed values remain model units',()=>{
 const s=sheet(.25),geometry=cadDrawingAnnotationGeometry(s,s.annotations[0]);assert.equal(geometry.text,'40 mm');assert.equal(geometry.lines.length,3);near(Math.hypot(...geometry.lines[2][0].map((v,k)=>v-geometry.lines[2][1][k])),10);const circle=s.annotations.find(a=>a.kind==='diameter'),g=cadDrawingAnnotationGeometry(s,circle);near(Math.hypot(...g.lines[0][0].map((v,k)=>v-g.lines[0][1][k])),8.25*.25);
});
test('hidden edge output precedes visible outlines and DXF retains its dashed linetype without mutating cache order',()=>{
 const s=sheet(),view=s.views[0],before=view.projection.curves.map(c=>c.id);view.projection.curves.push({id:'hidden-part',kind:'line',a:[5,2],b:[25,2],hidden:true});const svg=cadDrawingSvg(s,{interactive:true});assert.ok(svg.indexOf('data-drawing-curve="hidden-part"')<svg.indexOf('data-drawing-curve="line"'));assert.match(svg,/stroke-dasharray="1 1"/);const geometry=dxf(cadDrawingDxf(s)).entities.filter(e=>get(e,8)==='VIEW_1'&&e.type!=='TEXT');assert.equal(get(geometry[0],6),'HIDDEN');assert.equal(geometry[1].type,'LINE');assert.notEqual(get(geometry[1],6),'HIDDEN');assert.deepEqual(view.projection.curves.map(c=>c.id),[...before,'hidden-part']);
});
test('dragged radius and diameter text leaders attach to their selected circular arc',()=>{
 const s=sheet(),v=s.views[0],arc=v.projection.curves.find(c=>c.id==='arc'),center=[v.position[0]+arc.center[0],v.position[1]-arc.center[1]];
 for(const kind of ['radius','diameter']){const a={id:kind,kind,viewId:v.id,curveIds:['arc'],position:[center[0]-20,center[1]+5]},geometry=cadDrawingAnnotationGeometry(s,a),anchor=geometry.lines.at(-1)[0],dx=anchor[0]-center[0],dy=-(anchor[1]-center[1]),angle=Math.atan2(dy,dx);near(Math.hypot(dx,dy),arc.radius);assert.ok(angle>=-1e-12&&angle<=Math.PI/2+1e-12,'leader points beyond the selected arc');}
});
test('centermark exports cross lines to SVG at paper position and 1:1 model coordinates in DXF on ANNOTATIONS layer',()=>{
 const s=sheet(2),view=s.views[0],circle=view.projection.curves.find(c=>c.id==='circle');
 const centermark={id:'cm',kind:'centermark',viewId:view.id,curveIds:['circle'],position:[view.position[0]+circle.center[0]*2,view.position[1]-circle.center[1]*2]};
 s.annotations.push(centermark);
 const g=cadDrawingAnnotationGeometry(s,centermark);
 assert.equal(g.text,'');
 assert.equal(g.lines.length,2);
 const paperCenter=[view.position[0]+circle.center[0]*2,view.position[1]-circle.center[1]*2],rPaper=circle.radius*2+2;
 near(g.lines[0][0][0],paperCenter[0]-rPaper);
 near(g.lines[0][0][1],paperCenter[1]);
 near(g.lines[0][1][0],paperCenter[0]+rPaper);
 near(g.lines[0][1][1],paperCenter[1]);
 near(g.lines[1][0][0],paperCenter[0]);
 near(g.lines[1][0][1],paperCenter[1]-rPaper);
 near(g.lines[1][1][0],paperCenter[0]);
 near(g.lines[1][1][1],paperCenter[1]+rPaper);
 const svg=cadDrawingSvg(s,{interactive:true});
 assert.match(svg,/data-drawing-annotation="cm"/);
 assert.doesNotMatch(svg,/<text[^>]*><\/text>/);
 const text=cadDrawingDxf(s),read=dxf(text);
 const annLines=read.entities.filter(e=>e.type==='LINE'&&get(e,8)==='ANNOTATIONS');
 assert.ok(annLines.length>=2);
 const bounds=view.projection.bounds,offset=[0-bounds.min[0],-bounds.min[1]];
 const expectedCenterModel=[circle.center[0]+offset[0],circle.center[1]+offset[1]];
 const hLine=annLines.find(e=>Math.abs(Number(get(e,20))-expectedCenterModel[1])<1e-4&&Math.abs(Number(get(e,21))-expectedCenterModel[1])<1e-4);
 const vLine=annLines.find(e=>Math.abs(Number(get(e,10))-expectedCenterModel[0])<1e-4&&Math.abs(Number(get(e,11))-expectedCenterModel[0])<1e-4);
 assert.ok(hLine,'horizontal centermark line in DXF');
 assert.ok(vLine,'vertical centermark line in DXF');
 near(Number(get(hLine,10)),expectedCenterModel[0]-rPaper/2);
 near(Number(get(hLine,11)),expectedCenterModel[0]+rPaper/2);
});
test('centerline exports stroke-dasharray to SVG and DXF line with CENTER linetype on ANNOTATIONS layer at 1:1 model coordinates',async ()=>{
 const {createRequire}=await import('node:module');
 const {drawingPdfInput}=createRequire(import.meta.url)('../backend/drawing-pdf.cjs');
 for(const scale of [0.5,2]){
  const s=sheet(scale),view=s.views[0];
  const c1=view.projection.curves.find(c=>c.id==='circle');
  const c2=view.projection.curves.find(c=>c.id==='arc');
  const centerline={id:'cl',kind:'centerline',viewId:view.id,curveIds:['circle','arc'],position:[view.position[0]+(c1.center[0]+c2.center[0])*scale/2,view.position[1]-(c1.center[1]+c2.center[1])*scale/2],extensionStart:4,extensionEnd:5};
  s.annotations.push(centerline);
  const g=cadDrawingAnnotationGeometry(s,centerline);
  assert.equal(g.text,'');
  assert.equal(g.lines.length,1);
  assert.equal(g.dash,'8 2 2 2');
  const p1=[view.position[0]+c1.center[0]*scale,view.position[1]-c1.center[1]*scale];
  const p2=[view.position[0]+c2.center[0]*scale,view.position[1]-c2.center[1]*scale];
  const dist=Math.hypot(p2[0]-p1[0],p2[1]-p1[1]);
  const nx=(p2[0]-p1[0])/dist,ny=(p2[1]-p1[1])/dist;
  near(g.lines[0][0][0],p1[0]-nx*4);
  near(g.lines[0][0][1],p1[1]-ny*4);
  near(g.lines[0][1][0],p2[0]+nx*5);
  near(g.lines[0][1][1],p2[1]+ny*5);

  const svg=cadDrawingSvg(s,{interactive:true});
  assert.match(svg,/data-drawing-annotation="cl"/);
  assert.match(svg,/stroke-dasharray="8 2 2 2"/);
  assert.doesNotThrow(()=>drawingPdfInput({svg,widthMm:297,heightMm:210}));

  const text=cadDrawingDxf(s),read=dxf(text);
  assert.ok(read.pairs.some(p=>p[0]===2&&p[1]==='CENTER'));
  const clDxf=read.entities.find(e=>e.type==='LINE'&&get(e,8)==='ANNOTATIONS'&&get(e,6)==='CENTER');
  assert.ok(clDxf,'found CENTER linetype line on ANNOTATIONS layer');
  const bounds=view.projection.bounds,offset=[0-bounds.min[0],-bounds.min[1]];
  const m1=[c1.center[0]+offset[0],c1.center[1]+offset[1]];
  const m2=[c2.center[0]+offset[0],c2.center[1]+offset[1]];
  const mDist=Math.hypot(m2[0]-m1[0],m2[1]-m1[1]);
  const mnx=(m2[0]-m1[0])/mDist,mny=(m2[1]-m1[1])/mDist;
  near(Number(get(clDxf,10)),m1[0]-mnx*(4/scale),1e-3);
  near(Number(get(clDxf,20)),m1[1]-mny*(4/scale),1e-3);
  near(Number(get(clDxf,11)),m2[0]+mnx*(5/scale),1e-3);
  near(Number(get(clDxf,21)),m2[1]+mny*(5/scale),1e-3);
 }
});
test('dimension tolerance exports identical text to SVG, PDF and DXF in deviation and limits modes, updates with nominal change and supports negative offset',async ()=>{
 const {createRequire}=await import('node:module');
 const {drawingPdfInput}=createRequire(import.meta.url)('../backend/drawing-pdf.cjs');
 const s=sheet(1),view=s.views[0];
 const circle=view.projection.curves.find(c=>c.id==='circle');
 circle.radius=5; // nominal diameter = 10
 const tolAnnotation={id:'dia-tol',kind:'diameter',viewId:view.id,curveIds:['circle'],position:[100,50],tolerance:{upper:0.10,lower:-0.05,mode:'deviation'}};
 s.annotations.push(tolAnnotation);

 // 1. Deviation mode
 const gDev=cadDrawingAnnotationGeometry(s,tolAnnotation);
 assert.equal(gDev.text,'Ø 10 +0.10 / -0.05 mm');
 const svgDev=cadDrawingSvg(s);
 assert.match(svgDev,/Ø 10 \+0\.10 \/ -0\.05 mm/);
 assert.doesNotThrow(()=>drawingPdfInput({svg:svgDev,widthMm:297,heightMm:210}));
 const dxfDev=dxf(cadDrawingDxf(s));
 assert.ok(dxfDev.entities.some(e=>e.type==='TEXT'&&get(e,8)==='ANNOTATIONS'&&get(e,1)==='\\U+00D8 10 +0.10 / -0.05 mm'));

 // 2. Limits mode
 tolAnnotation.tolerance.mode='limits';
 const gLim=cadDrawingAnnotationGeometry(s,tolAnnotation);
 assert.equal(gLim.text,'Ø 10.10 / 9.95 mm');
 const svgLim=cadDrawingSvg(s);
 assert.match(svgLim,/Ø 10\.10 \/ 9\.95 mm/);
 assert.doesNotThrow(()=>drawingPdfInput({svg:svgLim,widthMm:297,heightMm:210}));
 const dxfLim=dxf(cadDrawingDxf(s));
 assert.ok(dxfLim.entities.some(e=>e.type==='TEXT'&&get(e,8)==='ANNOTATIONS'&&get(e,1)==='\\U+00D8 10.10 / 9.95 mm'));

 // 3. Model nominal change to 12.00 (radius 5 -> 6)
 circle.radius=6;
 const gLim12=cadDrawingAnnotationGeometry(s,tolAnnotation);
 assert.equal(gLim12.text,'Ø 12.10 / 11.95 mm');
 const svgLim12=cadDrawingSvg(s);
 assert.match(svgLim12,/Ø 12\.10 \/ 11\.95 mm/);
 assert.doesNotThrow(()=>drawingPdfInput({svg:svgLim12,widthMm:297,heightMm:210}));
 const dxfLim12=dxf(cadDrawingDxf(s));
 assert.ok(dxfLim12.entities.some(e=>e.type==='TEXT'&&get(e,8)==='ANNOTATIONS'&&get(e,1)==='\\U+00D8 12.10 / 11.95 mm'));

 // 4. Return to deviation on 12.00
 tolAnnotation.tolerance.mode='deviation';
 const gDev12=cadDrawingAnnotationGeometry(s,tolAnnotation);
 assert.equal(gDev12.text,'Ø 12 +0.10 / -0.05 mm');
 const svgDev12=cadDrawingSvg(s);
 assert.match(svgDev12,/Ø 12 \+0\.10 \/ -0\.05 mm/);
 const dxfDev12=dxf(cadDrawingDxf(s));
 assert.ok(dxfDev12.entities.some(e=>e.type==='TEXT'&&get(e,8)==='ANNOTATIONS'&&get(e,1)==='\\U+00D8 12 +0.10 / -0.05 mm'));

 // 5. Negative offset -0.02 / -0.08 on nominal 10
 circle.radius=5;
 tolAnnotation.tolerance={upper:-0.02,lower:-0.08,mode:'deviation'};
 const gNegDev=cadDrawingAnnotationGeometry(s,tolAnnotation);
 assert.equal(gNegDev.text,'Ø 10 -0.02 / -0.08 mm');
 const dxfNegDev=dxf(cadDrawingDxf(s));
 assert.ok(dxfNegDev.entities.some(e=>e.type==='TEXT'&&get(e,8)==='ANNOTATIONS'&&get(e,1)==='\\U+00D8 10 -0.02 / -0.08 mm'));

 tolAnnotation.tolerance.mode='limits';
 const gNegLim=cadDrawingAnnotationGeometry(s,tolAnnotation);
 assert.equal(gNegLim.text,'Ø 9.98 / 9.92 mm');
 const dxfNegLim=dxf(cadDrawingDxf(s));
 assert.ok(dxfNegLim.entities.some(e=>e.type==='TEXT'&&get(e,8)==='ANNOTATIONS'&&get(e,1)==='\\U+00D8 9.98 / 9.92 mm'));
});
test('B05-01: grouped parts-list table renders one bolt row with quantity 4 in SVG, PDF input and DXF',async()=>{
 const {createRequire}=await import('node:module');
 const {drawingPdfInput}=createRequire(import.meta.url)('../backend/drawing-pdf.cjs');
 const screws=[1,2,3,4].map(number=>({id:'s'+number,definitionId:'def-screw',name:'Zylinderschraube M5x20',partNumber:'ISO4762-M5-20',material:'Stahl',densityGcm3:7.85,volumeMm3:400,massG:3.14,centerMm:[number,0,10]})),
  rows=summarizeParts(screws,{mode:'grouped'}).rows,
  s=sheet();
 s.partsList=createCadDrawingPartsList(rows,{position:cadDrawingPartsListDefaultPosition(s,rows.length)});
 const svg=cadDrawingSvg(s);
 assert.match(svg,/Stückliste/);
 assert.match(svg,/Zylinderschraube M5x20/);
 assert.match(svg,/ISO4762-M5-20/);
 assert.match(svg,/>4<\/text>/);
 assert.doesNotThrow(()=>drawingPdfInput({svg,widthMm:297,heightMm:210}));
 assert.match(cadDrawingSvg(s,{interactive:true}),/data-drawing-parts-list=/);
 const read=dxf(cadDrawingDxf(s)),
  texts=read.entities.filter(entity=>entity.type==='TEXT'&&get(entity,8)==='ANNOTATIONS').map(entity=>get(entity,1));
 assert.ok(texts.includes('St\\U+00FCckliste'));
 assert.ok(texts.includes('Zylinderschraube M5x20'));
 assert.ok(texts.includes('ISO4762-M5-20'));
});
test('B05-04: SVG, PDF path and DXF print position and quantity from the sheet and hide reserved inactive rows',async()=>{
 const {createRequire}=await import('node:module');
 const {drawingPdfInput}=createRequire(import.meta.url)('../backend/drawing-pdf.cjs');
 const part=(id,definitionId,name,partNumber,extra={})=>({id,definitionId,name,partNumber,material:'Stahl',densityGcm3:7.85,volumeMm3:400,massG:3.14,centerMm:[0,0,10],...extra}),
  screws=[1,2,3,4].map(number=>part('s'+number,'def-screw','Zylinderschraube M5x20','ISO4762-M5-20',{centerMm:[number,0,10]})),
  washer=part('w1','def-washer','Scheibe M5','DIN125-M5'),
  nut=part('n1','def-nut','Mutter M5','DIN934-M5'),
  rows=summarizeParts([...screws,washer,nut],{mode:'grouped'}).rows,
  s=sheet(),
  table=createCadDrawingPartsList(rows,{position:cadDrawingPartsListDefaultPosition(s,rows.length)}),
  active=createCadDrawingPartsList(rows.filter(row=>row.definitionId!=='def-washer'),{previous:table,position:table.position});
 assert.deepEqual(active.rows.map(row=>[row.position,row.quantity,row.name]),[[1,4,'Zylinderschraube M5x20'],[3,1,'Mutter M5']]);
 assert.deepEqual(active.retainedPositions.map(row=>row.position),[2]);
 s.partsList=active;
 const svg=cadDrawingSvg(s),
  doc=new DOMParser({onError:e=>{throw Error(e);}}).parseFromString(svg,'image/svg+xml'),
  texts=Array.from(doc.getElementsByTagName('text'),node=>node.textContent);
 for(const expected of ['1','4','3'])assert.ok(texts.includes(expected),`SVG table cell ${expected}`);
 assert.ok(!texts.includes('Scheibe M5'),'entfernte Position bleibt aus dem SVG');
 const pdfSvg=drawingPdfInput({svg,widthMm:297,heightMm:210}).svg;
 for(const expected of ['1','4','3'])assert.match(pdfSvg,new RegExp(`>${expected}</text>`),`PDF-Weg enthält Tabellenzelle ${expected}`);
 assert.doesNotMatch(pdfSvg,/Scheibe M5/);
 const read=dxf(cadDrawingDxf(s)),
  dxfTexts=read.entities.filter(entity=>entity.type==='TEXT'&&get(entity,8)==='ANNOTATIONS').map(entity=>get(entity,1));
 for(const expected of ['1','4','3'])assert.ok(dxfTexts.includes(expected),`DXF-Tabellenzelle ${expected}`);
 assert.ok(!dxfTexts.some(value=>value.includes('Scheibe')),'entfernte Position bleibt aus dem DXF');
 const cleared=createCadDrawingPartsList([],{previous:active,position:active.position});
 assert.deepEqual(cleared.rows,[]);
 s.partsList=cleared;
 const clearedSvg=cadDrawingSvg(s);
 assert.doesNotThrow(()=>drawingPdfInput({svg:clearedSvg,widthMm:297,heightMm:210}),'Blatt ohne sichtbare Positionen bleibt druckbar');
 assert.doesNotMatch(clearedSvg,/Zylinderschraube M5x20|Mutter M5/);
 assert.ok(dxf(cadDrawingDxf(s)).entities.some(entity=>entity.type==='TEXT'&&get(entity,1)==='Pos.'),'Kopfzeile bleibt lesbar');
});
