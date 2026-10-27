const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const freecad=require('../backend/freecad.cjs'),{runDocument}=require('../backend/freecad-document.cjs');
const modules={'formnaro_surfaces_v1.py':fs.readFileSync('backend/freecad-surfaces.py','utf8')};
const ref=(source,point,normal)=>({source,point,normal});
const box='inputs["original"]=Part.makeBox(20,20,10)';
async function build(parameters,source=''){return freecad.run({script:{version:1,modules,parameters,code:source+'\nfrom formnaro_surfaces_v1 import build\nresult,measurements=build(doc,inputs,parameters)'}});}
const boundary=()=>[[[0,0,0],[20/3,0,0],[40/3,0,0],[20,0,0]],[[20,0,0],[20,20/3,0],[20,40/3,0],[20,20,0]],[[20,20,0],[40/3,20,0],[20/3,20,0],[0,20,0]],[[0,20,0],[0,40/3,0],[0,20/3,0],[0,0,0]]];
const loops=[[[-3,-2],[3,-2],[3,2],[-3,2]]];
async function edit(r,property,before,value){return runDocument({version:1,action:'edit',documentBase64:r.documentBase64,sourceDigest:createHash('sha256').update(Buffer.from(r.documentBase64,'base64')).digest('hex'),resultObject:r.resultObject,modules,edits:[{object:'SurfaceResult',property,expectedType:'App::PropertyLength',expectedValue:before,value}]});}
test('Surface fill retains cubic boundary and separate positional diagnostic; thickness edit restores archived helper',async()=>{
 const r=await build({kind:'surface-fill',boundary:boundary(),thickness:1});assert(Math.abs(r.report.volume-400)<1e-5);assert(r.measurements.connection.maxSampleGap<1e-5);assert.equal(r.measurements.connection.samples,68);assert.equal(r.measurements.connection.sampling,true);assert.equal(r.measurements.connection.tangentContinuity,'nicht zugesichert');
 const changed=await edit(r,'Thickness',1,2);assert(Math.abs(changed.report.volume-800)<1e-5);await assert.rejects(edit(r,'Thickness',1,0),/failed|Error|leer|gültig|berechn|Invalid/i);
 const curved=boundary();curved[0][1][2]=2;curved[0][2][2]=2;const c=await build({kind:'surface-fill',boundary:curved,thickness:1});assert(c.report.valid&&c.report.closed);assert(c.measurements.surfaceArea>400);assert(c.measurements.connection.maxSampleGap<1e-5);
 const open=boundary();open[0][3][0]=19;await assert.rejects(build({kind:'surface-fill',boundary:open,thickness:1}),/geschlossen/);
});
test('Transition is a checked independent solid with G0 report rather than an unsupported smoothness claim',async()=>{
 const r=await build({kind:'surface-transition',faces:[ref('a',[10,10,10],[0,0,1]),ref('b',[10,10,30],[0,0,-1])],ruled:false},'inputs["a"]=Part.makeBox(20,20,10)\ninputs["b"]=Part.makeBox(20,20,10,App.Vector(0,0,30))');
 assert(Math.abs(r.report.volume-8000)<1e-5);assert.equal(r.measurements.connection.position,'G0');assert(r.measurements.connection.maxSampleGap<1e-5);assert.match(r.measurements.connection.tangentContinuity,/nicht zugesichert/);assert(Math.abs(r.measurements.connection.maxSampleNormalAngleDegrees-90)<1e-5);assert.equal(r.measurements.connection.normalSamples,120);
});
test('Sewing all six faces gives the known box; missing, duplicate and stale faces reject',async()=>{
 const faces=[ref('original',[0,10,5],[-1,0,0]),ref('original',[20,10,5],[1,0,0]),ref('original',[10,0,5],[0,-1,0]),ref('original',[10,20,5],[0,1,0]),ref('original',[10,10,0],[0,0,-1]),ref('original',[10,10,10],[0,0,1])];
 const r=await build({kind:'surface-sew',faces},box);assert(Math.abs(r.report.volume-4000)<1e-5);assert.equal(r.measurements.freeEdges,0);
 await assert.rejects(build({kind:'surface-sew',faces:faces.slice(1)},box),/offen|Randkanten/);await assert.rejects(build({kind:'surface-sew',faces:[...faces,faces[0]]},box),/mehrfach/);await assert.rejects(build({kind:'surface-sew',faces:[{...faces[0],point:[-1,10,5]},...faces.slice(1)]},box),/nicht eindeutig/);
});
test('Planar add/cut has exact material change, holes and native depth edit, rejects overhanging and self-crossing profiles',async()=>{
 const p={kind:'surface-relief',faces:[ref('original',[10,10,10],[0,0,1])],loops,depth:2,rotation:0,mode:'add'};
 const r=await build(p,box);assert(Math.abs(r.report.volume-4048)<1e-5);const changed=await edit(r,'Depth',2,3);assert(Math.abs(changed.report.volume-4072)<1e-5);
 const cut=await build({...p,mode:'cut'},box);assert(Math.abs(cut.report.volume-3952)<1e-5);
 const hole=await build({...p,loops:[loops[0],[[-1,-1],[-1,1],[1,1],[1,-1]]]},box);assert(Math.abs(hole.report.volume-4040)<1e-5);
 await assert.rejects(build({...p,loops:[[[0,0],[30,0],[30,4],[0,4]]]},box),/innerhalb/);
 await assert.rejects(build({...p,loops:[[[0,0],[4,4],[0,4],[4,0]]]},box),/Kontur|klein|gültig/);
});
test('Cylinder add/cut uses exact arc-length UV mapping and radial depth, including seam crossing and rotated placement',async()=>{
 const p={kind:'surface-relief',faces:[ref('original',[10,0,10],[1,0,0])],loops,depth:2,rotation:0,mode:'add'},source='inputs["original"]=Part.makeCylinder(10,20)';
 const r=await build(p,source);assert(Math.abs(r.report.volume-(2000*Math.PI+(.5*(144-100)*.6*4)))<1e-4);assert.match(r.measurements.mapping,/Bogenlänge/);
 const cut=await build({...p,mode:'cut'},source);assert(Math.abs(cut.report.volume-(2000*Math.PI-.5*(100-64)*.6*4))<1e-4);
 const withHole=await build({...p,loops:[loops[0],[[-1,-1],[-1,1],[1,1],[1,-1]]]},source);assert(Math.abs(withHole.report.volume-(2000*Math.PI+44))<1e-4);
 await assert.rejects(build({...p,rotation:30},source),/orthogonale Zylinderkonturen/);
 const rotated=await build({...p,faces:[ref('original',[20,20,40],[1,0,0])]},'inputs["original"]=Part.makeCylinder(10,20,App.Vector(10,10,40),App.Vector(0,1,0))');assert(Math.abs(rotated.report.volume-r.report.volume)<1e-4);
 await assert.rejects(build({...p,depth:5},source),/halbe/);
 await assert.rejects(build({...p,faces:[ref('original',[10,0,19],[1,0,0])]},source),/innerhalb/);
});
test('Unsupported curved surfaces and cylinder bores reject without substituting planar geometry',async()=>{
 const p={kind:'surface-relief',faces:[ref('original',[10,0,0],[1,0,0])],loops,depth:1,rotation:0,mode:'add'};
 await assert.rejects(build(p,'inputs["original"]=Part.makeSphere(10)'),/Ebenen|Zylinder/);
 await assert.rejects(build({...p,faces:[ref('original',[5,0,10],[-1,0,0])]},'inputs["original"]=Part.makeCylinder(10,20).cut(Part.makeCylinder(5,20))'),/äußere/);
});
module.exports={boundary};
