import test from 'node:test';
import assert from 'node:assert/strict';
import {createSketchViewCache} from '../src/sketch-view-cache.js';
import {defaultCadSketch,resolveCadSketch,cadSketchExpression} from '../src/cad-sketch.js';
import {resolveSketch} from '../src/mesh-engine/mesh-sketch.js';
import {createSketchTemplate} from '../src/sketch-templates.js';
import {profileHandles,profileMidpoints,moveProfilePoints} from '../src/sketch-profile.js';
import {sketchSnap} from '../src/sketch-interaction.js';

test('Camera and selection redraws reuse validated draft geometry without evaluating formulas again',()=>{
 const sketch=createSketchTemplate('rim'),before=structuredClone(sketch);let resolves=0;
 const cache=createSketchViewCache({resolve:s=>{resolves++;return resolveCadSketch(s);},expression:cadSketchExpression}),first=cache.read(sketch);
 for(let i=0;i<100;i++)assert.strictEqual(cache.read(sketch),first);
 assert.equal(resolves,1);assert.equal(first.error,null);assert.deepEqual(sketch,before);
 assert.deepEqual(first.handles,profileHandles(sketch,cadSketchExpression));
 assert.deepEqual(first.midpoints,profileMidpoints(sketch,cadSketchExpression));
});

test('In-place formula edits invalidate derived bounds, handles and snap targets together',()=>{
 const sketch=createSketchTemplate('plate'),cache=createSketchViewCache({resolve:resolveCadSketch,expression:cadSketchExpression});
 const before=cache.read(sketch),oldWidth=before.resolved.size[0],oldCorner=before.handles[0].point;
 sketch.variables.find(v=>v.name==='breite').value='70';cache.invalidate();const after=cache.read(sketch);
 assert.equal(after.resolved.size[0],70);assert.equal(oldWidth,60);assert.notStrictEqual(before,after);assert.notDeepEqual(after.handles[0].point,oldCorner);
 assert.equal(sketch.variables.find(v=>v.name==='breite').value,'70');assert.equal(sketch.elements[0].start[0],'-(breite)/2');
 assert.throws(()=>moveProfilePoints(sketch,[0],[2,3],cadSketchExpression),/Formel/);
});

test('Open drafts remain visible and editable while full validation continues to reject them',()=>{
 const sketch=createSketchTemplate('plate'),cache=createSketchViewCache({resolve:resolveCadSketch,expression:cadSketchExpression});
 sketch.elements[0].end=['10','10'];const invalid=cache.read(sketch);
 assert.equal(invalid.resolved,null);assert.match(invalid.error.message,/offen/);assert.equal(invalid.geometry.elements.length,sketch.elements.length);assert.ok(invalid.handles.length);
 assert.throws(()=>resolveCadSketch(sketch),/offen/);
 const fixed=createSketchTemplate('plate');assert.ok(cache.read(fixed).resolved);assert.equal(cache.read(fixed).error,null);
});

test('Invalid formulas clear previous geometry and recover on the next draft edit',()=>{
 const sketch=createSketchTemplate('ring'),cache=createSketchViewCache({resolve:resolveCadSketch,expression:cadSketchExpression});
 assert.equal(cache.read(sketch).resolved.size[0],20);sketch.variables[0].value='missing';cache.invalidate();
 const invalid=cache.read(sketch);assert.equal(invalid.resolved,null);assert.equal(invalid.geometry,null);assert.deepEqual(invalid.handles,[]);assert.deepEqual(invalid.midpoints,[]);assert.match(invalid.error.message,/Unbekanntes Maß/);
 assert.strictEqual(cache.read(sketch),invalid);sketch.variables[0].value='24';cache.invalidate();assert.equal(cache.read(sketch).resolved.size[0],24);
});

test('Shared midpoint indices still exclude moving geometry and preserve exact angular arc snapping',()=>{
 const sketch=createSketchTemplate('rim'),cache=createSketchViewCache({resolve:resolveCadSketch,expression:cadSketchExpression}),data=cache.read(sketch),arc=data.midpoints[0];
 const options={points:[],midpoints:data.midpoints,grid:0,tolerance:.001};
 assert.equal(sketchSnap(arc.point,options).kind,'midpoint');assert.equal(sketchSnap(arc.point,{...options,exclude:arc.indices}).kind,null);
 assert.deepEqual(data.midpoints,profileMidpoints(sketch,cadSketchExpression));
});

test('Legacy CAD and mesh drafts retain their existing resolvers and independent cache lifetimes',()=>{
 for(const resolve of [resolveCadSketch,resolveSketch]){
  const sketch=defaultCadSketch(),cache=createSketchViewCache({resolve,expression:cadSketchExpression});assert.deepEqual(cache.read(sketch).resolved,resolve(sketch));
  sketch.dimensions.width='55';cache.invalidate();assert.equal(cache.read(sketch).resolved.size[0],55);assert.deepEqual(cache.read(sketch).handles,[]);
 }
});
