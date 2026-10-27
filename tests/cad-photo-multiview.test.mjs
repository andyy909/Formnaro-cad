import test from 'node:test';import assert from 'node:assert/strict';
import {analyzePhotoSet,photoReferenceDigest,photoSetDigest,validatePhotoSet} from '../src/cad-photo-multiview-data.js';
import {validateProjectPhotos,upsertProjectPhoto,photoAttachment,removeProjectPhoto} from '../src/cad-photo-project.js';
import {createCadProject,cadProjectSnapshot,parseCadProject,serializeCadProject} from '../src/cad-project.js';
import {multiViewFixture} from './photo-multiview-fixtures.mjs';
import {polygonPng} from './photo-multiview-fixtures.mjs';
import {cadBytesDigest} from '../src/cad-geometry-digest.js';
import {photoSetViewDefault} from '../src/cad-photo-multiview-data.js';
const fixture=multiViewFixture();
test('Three independent views register common ranges, dimensions and explicit hidden-geometry assumptions',()=>{
 const {items,plan}=structuredClone(fixture),before=JSON.stringify({items,plan}),a=analyzePhotoSet(items,plan);assert(a.canBuild);assert.deepEqual(a.ranges.map(r=>r.size),[40,20,30]);assert(a.ranges.every(r=>Math.abs(r.min)<1e-10&&r.observations.length===2));assert.equal(JSON.stringify({items,plan}),before);
 const reordered={...plan,views:[...plan.views].reverse(),dimensions:[...plan.dimensions].reverse()};assert.equal(photoSetDigest(plan),photoSetDigest(reordered));
});
test('An independently projected oblique front plane shares physical axes with orthographic side and top views',()=>{
 const f=structuredClone(fixture),r=f.items[0].reference,project=([x,y])=>[(x+.15*y+20)/(.0003*x+.0002*y+1),(.05*x+.9*y+10)/(.0003*x+.0002*y+1)];r.version=2;r.outline=r.outline.map(project);r.holes=r.holes.map(h=>h.map(project));r.perspective={kind:'rectangle',points:[[50,30],[550,30],[550,380],[50,380]].map(project),sizeMm:[50,35],referenceErrorMm:.01,pickErrorPx:.25,source:'user',note:r.scale.note};r.scale={...r.scale,points:r.perspective.points.slice(0,2),mm:50};const bytes=polygonPng(r.outline,r.holes);r.digest=cadBytesDigest(bytes);r.imageId='photo-'+r.digest.slice(0,16);f.items[0].image.dataUrl='data:image/png;base64,'+Buffer.from(bytes).toString('base64');f.plan.views[0]=photoSetViewDefault(r);
 const a=analyzePhotoSet(f.items,f.plan);assert(a.canBuild,JSON.stringify(a.issues));for(const range of a.ranges){assert(Math.abs(range.min)<1e-8);for(const o of range.observations)assert(Math.abs(o.max-o.min-range.size)<1e-8);}
});
test('Conflicting widths and common-origin offsets fail independently; image uncertainty cannot relax native target tolerances',()=>{
 const a=structuredClone(fixture);a.items[2].reference.scale.mm=48;a.plan.views[2].referenceDigest=photoReferenceDigest(a.items[2].reference);assert(analyzePhotoSet(a.items,a.plan).issues.some(i=>i.code==='AXIS_CONFLICT'));assert(analyzePhotoSet(a.items,a.plan).issues.some(i=>i.code==='DIMENSION_CONFLICT'));
 const b=structuredClone(fixture);b.plan.views[1].origin[1]-=50;const r=analyzePhotoSet(b.items,b.plan);assert(r.issues.some(i=>i.code==='AXIS_CONFLICT'));assert(r.ranges[2].observations.every(o=>o.max-o.min===30));assert.equal(b.plan.dimensions[0].toleranceMm,.001);
});
test('Missing, stale, low-resolution and unconfirmed evidence produce diagnoses without rewriting references',()=>{
 const edits=[p=>p.plan.views.pop(),p=>p.items.pop(),p=>p.items[0].reference.scale.note='Geändert',p=>p.plan.views[0].origin=[700,400],p=>p.plan.dimensions.pop(),p=>p.plan.fitDimensions=false,p=>p.plan.assumptions=[],p=>{p.items[0].reference.scale.pickErrorPx=50;p.plan.views[0].referenceDigest=photoReferenceDigest(p.items[0].reference);}];
 for(const edit of edits){const f=structuredClone(fixture);edit(f);const before=JSON.stringify(f);assert.equal(analyzePhotoSet(f.items,f.plan).canBuild,false);assert.equal(JSON.stringify(f),before);}
 const holes=multiViewFixture({holes:true});holes.plan.views[0].holeMode='unresolved';assert(analyzePhotoSet(holes.items,holes.plan).issues.some(i=>i.code==='UNRESOLVED_OPENINGS'));
 assert.throws(()=>validatePhotoSet({...fixture.plan,hostPath:'private'}));assert.throws(()=>validatePhotoSet({...fixture.plan,dimensions:[{...fixture.plan.dimensions[0],toleranceMm:2}]}));
});
test('Format20 persists plan, original bytes and missing links; original format19 stays readable',()=>{
 const project=cadProjectSnapshot({...createCadProject(),photos:fixture.photos});assert.equal(project.version,20);assert.deepEqual(parseCadProject(serializeCadProject(project)),project);assert.throws(()=>parseCadProject({...project,version:19}),/Projektformat 20/);
 const older=cadProjectSnapshot({...createCadProject(),photos:{version:1,items:fixture.items}});assert.equal(older.version,19);
 const attachment=photoAttachment(fixture.items[0]);attachment.photo.scale.note='Explizite Änderung';const next=upsertProjectPhoto(fixture.photos,attachment);assert.deepEqual(next.reconstructions,fixture.photos.reconstructions);assert(analyzePhotoSet(next.items,next.reconstructions[0]).issues.some(i=>i.code==='STALE_REFERENCE'));
 let removed=fixture.photos;for(const item of fixture.items)removed=removeProjectPhoto(removed,item.reference.imageId);assert.equal(removed.items.length,0);assert.equal(removed.reconstructions.length,1);assert.equal(analyzePhotoSet(removed.items,removed.reconstructions[0]).canBuild,false);
});

test('Native functional checks persist with provenance and cannot substitute image uncertainty for native tolerances',()=>{
 const f=multiViewFixture({holes:true}),plan=validatePhotoSet(f.plan);assert.equal(plan.functionalChecks[0].diameter,4);for(const patch of [{tolerance:1},{from:[0,0,0],to:[0,0,0]},{kind:'bore',minWall:0},{source:'image'}]){const bad=structuredClone(plan);Object.assign(bad.functionalChecks[0],patch);assert.throws(()=>validatePhotoSet(bad),{code:'PHOTO_SET_INVALID'});}const changed=structuredClone(plan);changed.functionalChecks[0].diameter=6;assert.notEqual(photoSetDigest(plan),photoSetDigest(changed));
});
