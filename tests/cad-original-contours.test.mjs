import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadCadKernel} from '../src/cad-kernel-loader.js';
import {FontLoader} from 'three/addons/loaders/FontLoader.js';
import {SVGLoader} from 'three/addons/loaders/SVGLoader.js';
import {Path,Shape,Vector2,QuadraticBezierCurve,CubicBezierCurve,EllipseCurve} from 'three';
import {DOMParser as XMLDOMParser} from '@xmldom/xmldom';
import {originalCadSubpath,originalCadShapes,cadContourSignedArea,reverseCadContour,classifyCadSubpaths,arrangeCadSubpaths,originalFontSubpaths,cadContoursFromFont,originalSvgSubpaths,cadContoursFromSvgPaths} from '../src/cad-original-contours.js';
import {buildCadContours,cadRecipeVolume,cadRecipeBounds,buildCadRecipe,heartContour,gearContour} from '../src/cad-recipes.js';

const oc=await loadCadKernel({print:()=>{},printErr:()=>{}});
const rectangle=(w,h,x=0,y=0)=>[{kind:'line',start:[x,y],end:[x+w,y]},{kind:'line',start:[x+w,y],end:[x+w,y+h]},{kind:'line',start:[x+w,y+h],end:[x,y+h]},{kind:'line',start:[x,y+h],end:[x,y]}];
function close(a,b,e=1e-6){assert.ok(Math.abs(a-b)<=e,`${a} vs ${b}`);}
function volume(contours,height=1){const shape=buildCadContours(oc,{contours,height});try{return cadRecipeVolume(oc,shape);}finally{shape.delete();}}

test('Native solid classifier independently rejects a zero-Common containment contradiction',()=>{
  assert.equal(typeof oc.FormnaroCadBridge.ClassifyPoint,'function');
  // The classifier still receives actual native outer solids and original
  // inner points. Only Common is fault-injected to simulate a broken result.
  const broken=new Proxy(oc,{get(target,key){if(key==='BRepAlgoAPI_Common')return class {HasErrors(){return false;}Shape(){return new oc.TopoDS_Shape();}delete(){}};return Reflect.get(target,key);}});
  assert.throws(()=>classifyCadSubpaths(broken,[rectangle(10,10),reverseCadContour(rectangle(2,2,2,2))]),/klassifikation widerspricht dem leeren Common/);
  const concave=[[0,0],[4,0],[4,1],[1,1],[1,4],[0,4]].map((point,index,points)=>({kind:'line',start:point,end:points[(index+1)%points.length]}));
  const disjoint=classifyCadSubpaths(oc,[concave,rectangle(1,1,2,2)]);assert.equal(disjoint.contours.length,2);assert.equal(disjoint.contours.reduce((sum,c)=>sum+c.holes.length,0),0);
});

test('Original curve converter preserves control points and signed area without sampled points',()=>{
  const path=new Path();path.curves=[new QuadraticBezierCurve(new Vector2(0,0),new Vector2(5,10),new Vector2(10,0))];
  path.getPoints=()=>{throw Error('Sampling forbidden');};
  const original=originalCadSubpath(path);assert.deepEqual(original[0].points,[[0,0],[5,10],[10,0]]);close(cadContourSignedArea(original),-100/3);
  const reversed=reverseCadContour(original);close(cadContourSignedArea(reversed),100/3);
  const cubic=new Path();cubic.curves=[new CubicBezierCurve(new Vector2(0,0),new Vector2(0,10),new Vector2(10,10),new Vector2(10,0))];
  const contour=originalCadSubpath(cubic);close(cadContourSignedArea(contour),-60);close(volume([{outer:reverseCadContour(contour)}]),60);
  assert.equal(originalCadShapes([new Shape()]).topologyCertified,false);
});
test('Clockwise rotated ellipse arcs and SVG Y reflection preserve the exact original geometry',()=>{
  for(const clockwise of [false,true]){
    const ellipse=new Path();ellipse.curves=[new EllipseCurve(3,4,2,5,0,2*Math.PI,clockwise,.3)];ellipse.getPoints=()=>{throw Error('Sampling forbidden');};
    const contour=originalCadSubpath(ellipse),flipped=originalCadSubpath(ellipse,{flipY:true});
    close(cadContourSignedArea(contour),(clockwise?-1:1)*Math.PI*10);
    close(cadContourSignedArea(flipped),-cadContourSignedArea(contour));
    close(volume([{outer:cadContourSignedArea(contour)<0?reverseCadContour(contour):contour}]),Math.PI*10,1e-5);
  }
});
test('Native CAD topology classification supports holes, islands and nonzero winding, rejecting crossings and touching',()=>{
  const outer=rectangle(30,30),middle=rectangle(20,20,5,5),inner=rectangle(10,10,10,10);
  const evenodd=classifyCadSubpaths(oc,[outer,middle,inner],{fillRule:'evenodd'});
  assert.equal(evenodd.topologyCertified,true);assert.equal(evenodd.contours.length,2);assert.equal(evenodd.contours[0].holes.length,1);close(volume(evenodd.contours),600);
  const nonzero=classifyCadSubpaths(oc,[outer,middle,inner]);assert.equal(nonzero.contours.length,1);assert.equal(nonzero.contours[0].holes.length,0);close(volume(nonzero.contours),900);
  const cut=classifyCadSubpaths(oc,[outer,reverseCadContour(middle),inner]);close(volume(cut.contours),600);
  assert.throws(()=>classifyCadSubpaths(oc,[outer,rectangle(10,10,25,25)]),/kreuzen|berühren/);
  assert.throws(()=>classifyCadSubpaths(oc,[outer,rectangle(10,10,30,0)]),/kreuzen|berühren/);
});
test('Actual bundled FontLoader font outlines become CAD contours with independently classified O/B/8 holes',async()=>{
  for(const file of ['src/font.json','src/fonts/helvetiker_bold.typeface.json','src/fonts/optimer_regular.typeface.json']){
    const data=JSON.parse(await readFile(new URL('../'+file,import.meta.url),'utf8')),font=new FontLoader().parse(data),text='OB8';
    const sourceShapes=font.generateShapes(text,10),source=originalCadShapes(sourceShapes),raw=originalFontSubpaths(font,text,10),classified=cadContoursFromFont(oc,font,text,10);
    assert.equal(raw.length,3);assert.equal(classified.topologyCertified,true);assert.equal(classified.contours.length,source.contours.length);
    assert.deepEqual(classified.contours.map(c=>c.holes.length),source.contours.map(c=>c.holes.length),file);
    assert.equal(classified.contours.reduce((n,c)=>n+c.holes.length,0),5,file);
    close(volume(classified.contours,2),volume(source.contours,2),1e-5);
    const shape=buildCadContours(oc,{contours:classified.contours,height:2});try{const bounds=cadRecipeBounds(oc,shape);assert.ok(bounds.size[0]>20&&bounds.size[1]>7);close(bounds.size[2],2);}finally{shape.delete();}
  }
});
test('Actual SVGLoader parses original line/Bézier/ellipse paths and preserves native CAD fill rules for crossing subpaths',()=>{
  // xmldom implements XML DOM; SVGLoader's gradient discovery additionally
  // needs this simple tag-selector method. No styles/gradients in fixtures.
  const previous=globalThis.DOMParser;
  globalThis.DOMParser=class {parseFromString(text,mime){const document=new XMLDOMParser().parseFromString(text,mime);document.querySelectorAll=selector=>selector.split(',').flatMap(tag=>Array.from(document.getElementsByTagName(tag.trim())));return document;}};
  try{
    const loader=new SVGLoader(),svg=loader.parse('<svg xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M 0 0 H 30 V 30 H 0 Z M 5 5 H 25 V 25 H 5 Z"/><ellipse cx="50" cy="15" rx="8" ry="5"/><path d="M 70 0 Q 75 10 80 0 L 70 0 Z"/><path d="M 90 0 C 90 10 100 10 100 0 L 90 0 Z"/></svg>');
    const raw=originalSvgSubpaths(svg.paths);assert.equal(raw.length,4);assert.equal(raw[0].subpaths.length,2);assert.equal(raw[0].fillRule,'evenodd');
    for(const path of svg.paths)for(const subpath of path.subPaths)subpath.getPoints=()=>{throw Error('Sampled topology forbidden');};
    const result=cadContoursFromSvgPaths(oc,svg.paths);assert.equal(result.topologyCertified,true);assert.equal(result.contours[0].holes.length,1);
    close(volume(result.contours),500+40*Math.PI+100/3+60,1e-5);
    const crossing=loader.parse('<svg xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M 0 0 H 20 V 20 H 0 Z M 10 10 H 30 V 30 H 10 Z"/></svg>');
    close(volume(cadContoursFromSvgPaths(oc,crossing.paths).contours),600,1e-6);
  }finally{globalThis.DOMParser=previous;}
});

test('Native SVG winding arrangements handle intersecting line, original Bezier and ellipse subpaths without sampling',()=>{
  for(const [fillRule,expected] of [['nonzero',150],['evenodd',100]])close(volume(arrangeCadSubpaths(oc,[rectangle(10,10),rectangle(10,10,5)],{fillRule}).contours),expected,1e-7);
  for(const [fillRule,expected] of [['nonzero',160],['evenodd',100]])close(volume(arrangeCadSubpaths(oc,[rectangle(10,10),rectangle(10,10,3),rectangle(10,10,6)],{fillRule}).contours),expected,1e-7);
  close(volume(arrangeCadSubpaths(oc,[rectangle(10,10),reverseCadContour(rectangle(10,10,5))]).contours),100,1e-7);
  const oval=x=>[{kind:'ellipse',center:[x,0],rx:5,ry:3,startAngle:0,endAngle:2*Math.PI}],common=15*(2*Math.PI/3-Math.sqrt(3)/2);
  for(const [fillRule,expected] of [['nonzero',30*Math.PI-common],['evenodd',30*Math.PI-2*common]]){const result=arrangeCadSubpaths(oc,[oval(0),oval(5)],{fillRule});assert.ok(result.contours.flatMap(c=>c.outer).every(segment=>segment.kind==='ellipse'));close(volume(result.contours),expected,1e-6);}
  const dome=[{kind:'bezier',points:[[0,0],[0,10],[10,10],[10,0]]},{kind:'line',start:[10,0],end:[0,0]}];
  for(const [fillRule,expected] of [['nonzero',130],['evenodd',100]]){const result=arrangeCadSubpaths(oc,[reverseCadContour(dome),rectangle(10,10,5,-2)],{fillRule});assert.ok(result.contours.flatMap(c=>c.outer).some(segment=>segment.kind==='bezier'));close(volume(result.contours),expected,1e-6);}
  assert.equal(arrangeCadSubpaths(oc,[rectangle(10,10),rectangle(10,10)],{fillRule:'evenodd'}).contours.length,0);
  close(volume(arrangeCadSubpaths(oc,[rectangle(10,10),rectangle(10,10)]).contours),100,1e-7);
  for(const [fillRule,expected] of [['nonzero',360],['evenodd',348]])close(volume(arrangeCadSubpaths(oc,[rectangle(20,20),reverseCadContour(rectangle(10,10,5,5)),rectangle(12,6,4,7)],{fillRule}).contours),expected,1e-6);
  assert.throws(()=>arrangeCadSubpaths(oc,[[{kind:'line',start:[0,0],end:[10,10]},{kind:'line',start:[10,10],end:[0,10]},{kind:'line',start:[0,10],end:[10,0]},{kind:'line',start:[10,0],end:[0,0]}]]),/Selbstschneidende|selbstschneidend/);
  assert.throws(()=>arrangeCadSubpaths(oc,[[{kind:'bezier',points:[[0,0],[2,2],[-1,2],[1,0]]},{kind:'line',start:[1,0],end:[0,0]}]]),/Selbstschneidende/);
});
test('CAD recipe construction budget is forwarded to heart/gear and SVG coordinates remain physical',()=>{
  const tight=heartContour([25,25],1e-6),normal=heartContour([25,25]);assert.ok(tight.segments.length>normal.segments.length);
  const gear=gearContour({}, {constructionBudget:1e-6});assert.ok(gear.interpolationBound<=5e-7);
  assert.throws(()=>buildCadRecipe(oc,{type:'heart',size:[25,25,5]},{constructionBudget:1e-8}),/zu klein/);
  const shape=buildCadRecipe(oc,{type:'svg',size:[200,200,3],contours:[{outer:rectangle(10,20)}]});
  try{const bounds=cadRecipeBounds(oc,shape);close(bounds.size[0],10);close(bounds.size[1],20);close(bounds.size[2],3);}finally{shape.delete();}
});
