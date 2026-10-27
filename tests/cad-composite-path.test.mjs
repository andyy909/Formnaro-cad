import test from 'node:test';
import assert from 'node:assert/strict';
import load from '../cad-kernel-build/runtime/formnaro_cad.js';
import {validateCompositePath,inspectCompositePath} from '../src/cad-composite-path.js';
import {cadProfileModelingNative} from '../src/cad-modeling-native.js';
import {cadBounds,cadVolume,validateCadSolid,writeCadBrep,readCadBrep} from '../src/cad-native-kernel.js';
import {defaultCadSketch} from '../src/cad-sketch.js';
import {cadIdentity} from '../src/cad-affine.js';
const oc=await load({print:()=>{},printErr:()=>{}}),near=(a,b,eps=1e-5)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
function profile(z=0,kind='circle'){const sketch=defaultCadSketch(kind);sketch.dimensions={width:'10',depth:'10',diameter:'2',height:'1'};const frame=cadIdentity();frame[14]=z;return {sketch,frame};}
const path=(segments,orientation='corrected')=>({kind:'segments',segments,orientation});
const line=(start,end)=>({kind:'line',start,end});
function checked(request,fn){const body=cadProfileModelingNative(oc,request);try{assert.equal(validateCadSolid(oc,body).solids,1);fn(body);const copy=readCadBrep(oc,writeCadBrep(oc,body));try{near(cadVolume(oc,copy),cadVolume(oc,body));}finally{copy.delete();}}finally{body.delete();}}
test('Two connected native straight segments preserve circular area and both orientation modes',()=>{
 for(const orientation of ['corrected','frenet'])checked({kind:'sweep',profile:profile(),path:path([line([0,0,0],[0,0,20]),line([0,0,20],[0,0,40])],orientation)},body=>{near(cadVolume(oc,body),Math.PI*40);near(cadBounds(oc,body).max[2],40);});
});
test('Line, exact quarter circle and tangent line produce the independently known native pipe volume',()=>{
 const r=30,s=20,composite=path([line([0,0,0],[0,0,s]),{kind:'arc',start:[0,0,s],through:[r-r/Math.SQRT2,0,s+r/Math.SQRT2],end:[r,0,s+r]},line([r,0,s+r],[r+20,0,s+r])]);
 const before=structuredClone(composite);checked({kind:'sweep',profile:profile(),path:composite},body=>near(cadVolume(oc,body),Math.PI*(40+30*Math.PI/2),1e-4));assert.deepEqual(composite,before);
});
test('Bezier and multi-span B-spline paths create real curved native pipes without changing editable poles',()=>{
 for(const kind of ['bezier','bspline']){const points=kind==='bezier'?[[0,0,0],[0,0,30],[30,0,60],[30,0,90]]:[[0,0,0],[0,0,20],[10,0,40],[25,0,60],[30,0,80],[30,0,100]],p=path([{kind,points}]),before=structuredClone(p);checked({kind:'sweep',profile:profile(),path:p},body=>{assert(cadVolume(oc,body)>Math.PI*90);near(cadBounds(oc,body).max[0],31,1e-3);});assert.deepEqual(p,before);}
});
test('Path gaps, corners, wrong first orientation, tight bends and a returning loop reject before geometry construction',()=>{
 for(const invalid of [path([line([1,0,0],[1,0,20])]),path([line([0,0,0],[20,0,0])]),path([line([0,0,0],[0,0,20]),line([0,0,21],[0,0,40])]),path([line([0,0,0],[0,0,20]),line([0,0,20],[20,0,20])])])assert.throws(()=>validateCompositePath(invalid));
 assert.throws(()=>inspectCompositePath(path([{kind:'bezier',points:[[0,0,0],[0,0,1],[1,0,1],[1,0,2]]}]),5),/eng|komplex|Tangente/);
 const at=t=>[20*(1-Math.cos(t)),0,20*Math.sin(t)],segments=Array.from({length:4},(_,i)=>({kind:'arc',start:at(i*Math.PI/2),through:at((i+.5)*Math.PI/2),end:at((i+1)*Math.PI/2)}));assert.throws(()=>inspectCompositePath(path(segments),1),/nahe|überschneiden/);
});
test('Three-profile loft keeps an explicit order and orientation; returning order and invalid permutations reject',()=>{
 const profiles=[profile(0,'rectangle'),profile(10,'rectangle'),profile(30,'rectangle')],before=structuredClone(profiles);
 for(const orientation of ['automatic','preserve'])checked({kind:'loft',profiles,orientation,profileOrder:[0,1,2]},body=>near(cadVolume(oc,body),3000));
 assert.throws(()=>cadProfileModelingNative(oc,{kind:'loft',profiles,orientation:'automatic',profileOrder:[0,2,1]}),/Reihenfolge|zurück/);
 assert.throws(()=>cadProfileModelingNative(oc,{kind:'loft',profiles,orientation:'automatic',profileOrder:[0,0,1]}),/Reihenfolge/i);assert.deepEqual(profiles,before);
});
