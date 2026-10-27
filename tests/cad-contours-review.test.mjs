// Independent review regressions for the unactivated CAD foundations.
// Expectations come from analytic curves/fill rules, not a sampled mesh.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import OCModule from 'replicad-opencascadejs';
import {Path,EllipseCurve} from 'three';
import {originalCadSubpath,cadContourSignedArea,reverseCadContour,classifyCadSubpaths,originalFontSubpaths,cadContoursFromFont} from '../src/cad-original-contours.js';
import {buildCadContours,cadRecipeVolume,boundedHermite} from '../src/cad-recipes.js';

const oc=await OCModule({print:()=>{},printErr:()=>{}});
const TAU=2*Math.PI;
const rectangle=(w,h,x=0,y=0)=>[
  {kind:'line',start:[x,y],end:[x+w,y]},
  {kind:'line',start:[x+w,y],end:[x+w,y+h]},
  {kind:'line',start:[x+w,y+h],end:[x,y+h]},
  {kind:'line',start:[x,y+h],end:[x,y]}
];
function close(actual,expected,error=1e-7){assert.ok(Math.abs(actual-expected)<=error,`${actual} versus ${expected} (allowed ${error})`);}
function volume(contours){const shape=buildCadContours(oc,{contours,height:1});try{return cadRecipeVolume(oc,shape);}finally{shape.delete();}}
function bezier(points,t){const work=points.map(point=>[...point]);for(let n=work.length-1;n>0;n--)for(let i=0;i<n;i++)for(let k=0;k<2;k++)work[i][k]=work[i][k]*(1-t)+work[i+1][k]*t;return work[0];}

for(const fillRule of ['evenodd','nonzero'])test(`Containment retains a 1e-6 square-unit interior hole (${fillRule})`,()=>{
  const outer=rectangle(10,10),hole=rectangle(.001,.001,4,4);
  const result=classifyCadSubpaths(oc,[outer,fillRule==='nonzero'?reverseCadContour(hole):hole],{fillRule});
  assert.equal(result.contours.length,1,'A contained tiny hole must not become a separate filled outer contour.');
  assert.equal(result.contours[0].holes.length,1,'Small nonzero Common volume is containment, not disjointness.');
  close(volume(result.contours),100-1e-6,1e-8);
});

test('Four nested boundaries preserve two holes and an island independent of input order',()=>{
  const outer=rectangle(20,20),hole=rectangle(14,14,3,3),island=rectangle(8,8,6,6),islandHole=rectangle(2,2,9,9);
  for(const fillRule of ['evenodd','nonzero']){
    const boundaries=fillRule==='evenodd'?[islandHole,outer,hole,island]:[reverseCadContour(islandHole),outer,reverseCadContour(hole),island];
    const result=classifyCadSubpaths(oc,boundaries,{fillRule});
    assert.equal(result.contours.length,2);assert.deepEqual(result.contours.map(contour=>contour.holes.length),[1,1]);
    close(volume(result.contours),400-196+64-4);
  }
});

test('Nonzero winding carries redundant nested boundaries before a later true hole',()=>{
  // Winding sequence -1,-2,-1,0,+1. The first two positive transitions
  // remain filled; only the fourth boundary cuts and the fifth adds an island.
  const boundaries=[reverseCadContour(rectangle(30,30)),reverseCadContour(rectangle(24,24,3,3)),rectangle(18,18,6,6),rectangle(12,12,9,9),rectangle(6,6,12,12)];
  const result=classifyCadSubpaths(oc,boundaries.toReversed());
  assert.equal(result.contours.length,2);assert.deepEqual(result.contours.map(contour=>contour.holes.length),[1,0]);
  close(volume(result.contours),900-144+36);
});

test('Self-intersecting single subpaths cannot receive a certified simple-contour classification',()=>{
  // Nonzero signed area avoids reducing this to the separate degenerate-area
  // guard. Edges (4,0)->(0,4) and (6,6)->(0,0) cross in their interiors.
  const points=[[0,0],[4,0],[0,4],[6,6]],crossing=points.map((start,i)=>({kind:'line',start,end:points[(i+1)%points.length]}));
  assert.notEqual(cadContourSignedArea(crossing),0);
  assert.throws(()=>classifyCadSubpaths(oc,[crossing]),/gültig|kreuzen|berühren|eindeutig|Flächenaufteilung/);
});

test('Partial rotated ellipses retain area through radius swapping, direction and Y reflection',()=>{
  const start=.7,end=4.4;
  for(const radii of [[2,5],[5,2],[3,3]])for(const clockwise of [false,true])for(const flipY of [false,true]){
    const [rx,ry]=radii,path=new Path(),curve=new EllipseCurve(3,4,rx,ry,start,end,clockwise,.63);
    // Both path and original curve sampling APIs are forbidden during conversion.
    path.getPoints=curve.getPoints=curve.getPoint=()=>{throw Error('Review: original CAD conversion must not sample.');};
    path.curves=[curve];const segments=originalCadSubpath(path,{flipY}),sweep=clockwise?end-start-TAU:end-start;
    const signed=.5*rx*ry*(sweep-Math.sin(sweep))*(flipY?-1:1);
    assert.equal(segments.length,2);assert.equal(segments[0].kind,'ellipse');assert.equal(segments[1].kind,'line');
    close(cadContourSignedArea(segments),signed,1e-12);
    close(cadContourSignedArea(reverseCadContour(segments)),-signed,1e-12);
    close(volume([{outer:signed<0?reverseCadContour(segments):segments}]),Math.abs(signed),1e-7);
  }
});

test('The Hermite Euclidean bound is attained by a quartic, including both coordinate components',()=>{
  const result=boundedHermite({value:t=>[t**4,2*t**4],derivative:t=>[4*t**3,8*t**3],fourthBounds:[24,48],start:0,end:1,tolerance:1e-4});
  assert.ok(result.interpolationBound<=result.tolerance/2);
  for(const segment of result.segments){
    const t=(segment.interval[0]+segment.interval[1])/2,actual=[t**4,2*t**4],interpolated=bezier(segment.points,.5);
    const error=Math.hypot(...actual.map((value,k)=>value-interpolated[k]));
    // A quartic has constant fourth derivative; at the interval midpoint
    // Hermite's h^4/384 formula is exact, up to IEEE double arithmetic.
    close(error,result.interpolationBound,1e-14);
  }
});

test('Typeface q/b controls and advances stay continuous without generateShapes or curve samples',()=>{
  const font={data:{resolution:100,boundingBox:{yMin:0,yMax:100},underlineThickness:20,glyphs:{
    A:{ha:150,o:'m 0 0 q 100 0 50 100 l 0 0'},
    B:{ha:120,o:'m 0 0 b 100 0 0 100 100 100 l 0 0'}
  }},generateShapes(){throw Error('Review: FontLoader sampled classification is forbidden.');}};
  const groups=originalFontSubpaths(font,'AB\nB',10);
  assert.equal(groups.length,3);
  assert.deepEqual(groups[0].subpaths[0][0].points,[[0,0],[5,10],[10,0]]);
  assert.deepEqual(groups[1].subpaths[0][0].points,[[15,0],[15,10],[25,10],[25,0]]);
  assert.deepEqual(groups[2].subpaths[0][0].points,[[0,-12],[0,-2],[10,-2],[10,-12]]);
  const result=cadContoursFromFont(oc,font,'AB\nB',10);
  assert.equal(result.topologyCertified,true);assert.equal(result.contours.length,3);
  close(volume(result.contours),100/3+60+60,1e-6);
});

async function boundedEllipseConversion(endAngle){
  // A disposable worker keeps a malformed angle regression from freezing
  // the test runner itself; no UI, personal profile or CAD state is involved.
  const worker=new Worker(`const {parentPort,workerData}=require('node:worker_threads');
    import(workerData.module).then(({originalCadSubpath})=>{
      parentPort.postMessage({type:'ready'});
      try{originalCadSubpath({curves:[{isEllipseCurve:true,aX:0,aY:0,xRadius:2,yRadius:3,aStartAngle:0,aEndAngle:workerData.endAngle,aClockwise:false,aRotation:0}]});parentPort.postMessage({type:'accepted'});}
      catch(error){parentPort.postMessage({type:'rejected',message:error.message});}
    }).catch(error=>parentPort.postMessage({type:'import-error',message:error.message}));`,
    {eval:true,workerData:{module:new URL('../src/cad-original-contours.js',import.meta.url).href,endAngle}});
  try{return await new Promise((resolve,reject)=>{
    let timer=setTimeout(()=>resolve({type:'import-timeout'}),3000);
    worker.on('error',error=>{clearTimeout(timer);reject(error);});
    worker.on('message',message=>{
      clearTimeout(timer);
      if(message.type==='ready')timer=setTimeout(()=>resolve({type:'conversion-timeout'}),300);
      else resolve(message);
    });
  });}finally{await worker.terminate();}
}
for(const endAngle of [Infinity,1e20])test(`Invalid or unbounded ellipse angles fail without an endless normalization loop (${endAngle})`,async()=>{
  const outcome=await boundedEllipseConversion(endAngle);
  assert.equal(outcome.type,'rejected',`Original ellipse conversion must reject invalid/unbounded input promptly; observed ${JSON.stringify(outcome)}.`);
});
