import test from 'node:test';import assert from 'node:assert/strict';
import {validateCadDrillPattern,cadDrillPatternAnchors} from '../src/cad-drill-pattern.js';
const anchor={point:[-10,-4,2],normal:[0,0,1]},bounds={min:[-20,-10,-2],max:[20,10,2]},run=pattern=>cadDrillPatternAnchors({feature:'box-face-top',anchor,bounds,pattern}).map(x=>x.point);
test('Reihe, Raster, Lochkreis und Spiegelung erzeugen eindeutige definierte Positionen',()=>{
 assert.deepEqual(run({version:1,kind:'line',count:3,step:[5,0],skip:[1]}),[[-10,-4,2],[0,-4,2]]);
 assert.deepEqual(run({version:1,kind:'grid',columns:2,rows:2,step:[20,0],rowStep:[0,8],skip:[]}),[[-10,-4,2],[10,-4,2],[-10,4,2],[10,4,2]]);
 assert.deepEqual(run({version:1,kind:'mirror',axis:'u',offset:10,skip:[]}),[[-10,-4,2],[10,-4,2]]);
 const circle=run({version:1,kind:'circle',count:4,center:[5,0],skip:[]});assert.ok(Math.abs(circle[2][0])<1e-8&&Math.abs(circle[2][1]+4)<1e-8);
});
test('Ungültige, doppelte und unzulässig ausgelassene Muster werden abgewiesen',()=>{
 for(const p of [{version:1,kind:'line',count:3,step:[0,0],skip:[]},{version:1,kind:'line',count:3,step:[4,0],skip:[0]},{version:1,kind:'grid',columns:9,rows:9,step:[1,0],rowStep:[0,1],skip:[]},{version:1,kind:'circle',count:3,center:[0,0],skip:[]},{version:1,kind:'mirror',axis:'u',offset:0,skip:[]}])assert.throws(()=>validateCadDrillPattern(p),{code:'INVALID_CAD_DRILL_PATTERN'});
 assert.throws(()=>run({version:1,kind:'line',count:3,step:[20,0],skip:[]}),/außerhalb/);
});

test('Gespeicherter Lochkreis behält bei abweichendem Radius und Startwinkel seine bestehenden Positionen',()=>{
 const saved=JSON.parse(JSON.stringify({version:1,kind:'circle',count:4,center:[5,0],radius:6,angle:360,startAngle:90,skip:[]})),before=structuredClone(saved),points=cadDrillPatternAnchors({feature:'box-face-top',anchor,bounds:{min:[-20,-20,-2],max:[20,20,2]},pattern:saved}).map(x=>x.point),expected=[[-5,-10,2],[1,-4,2],[-5,2,2],[-11,-4,2]];
 for(let i=0;i<points.length;i++)for(let axis=0;axis<3;axis++)assert.ok(Math.abs(points[i][axis]-expected[i][axis])<1e-8);assert.deepEqual(saved,before);assert.notDeepEqual(points[0],anchor.point);
});
