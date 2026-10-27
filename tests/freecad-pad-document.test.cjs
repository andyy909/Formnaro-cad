const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const freecad=require('../backend/freecad.cjs');
const sha=value=>createHash('sha256').update(Buffer.from(value,'base64')).digest('hex');
const script={version:1,name:'Native sketch and pad',code:`body=doc.addObject('PartDesign::Body','Body')
sketch=doc.addObject('Sketcher::SketchObject','Sketch');body.addObject(sketch)
points=[(0,0),(10,0),(10,6),(0,6)]
for i,p in enumerate(points):
    q=points[(i+1)%len(points)];sketch.addGeometry(Part.LineSegment(App.Vector(p[0],p[1],0),App.Vector(q[0],q[1],0)),False)
pad=body.newObject('PartDesign::Pad','Pad');pad.Profile=sketch;pad.Length=5
keep=doc.addObject('Part::Box','Independent');keep.Length=2;keep.Width=3;keep.Height=4;keep.Placement.Base=App.Vector(-50,0,0)
doc.recompute();result=pad
`};
let made;
test.before(async()=>{made=await freecad.run({script});});
const request=(action,archive=made.documentBase64)=>({version:1,action,documentBase64:archive,sourceDigest:sha(archive),resultObject:'Pad'});

test('Actual native Body, Sketcher profile and PartDesign Pad expose their real dependency and editable length',async()=>{
 assert(Math.abs(made.report.volume-300)<1e-7);const r=await freecad.run({document:request('inspect')}),objects=new Map(r.tree.objects.map(o=>[o.name,o]));assert.equal(objects.get('Body').type,'PartDesign::Body');assert.equal(objects.get('Sketch').type,'Sketcher::SketchObject');assert.equal(objects.get('Pad').type,'PartDesign::Pad');assert(objects.get('Pad').dependsOn.includes('Sketch'));assert.equal(objects.get('Pad').staticShape,false);assert([...objects.values()].some(o=>o.properties.some(p=>p.type==='App::PropertyLinkSub'&&p.value===null)));const length=objects.get('Pad').properties.find(p=>p.name==='Length');assert.equal(length.value,5);assert.equal(length.unit,'mm');assert.equal(length.editable,true);
});

test('Native Pad length 5 to 8 recomputes the actual solid and STEP, preserves the independent object and reopens with the original sketch',async()=>{
 const r=await freecad.run({document:{...request('edit'),edits:[{object:'Pad',property:'Length',expectedType:'App::PropertyLength',expectedValue:5,value:8}]}});assert(Math.abs(r.report.volume-480)<1e-7);assert.equal(r.report.check,'passed');assert.equal(r.stepReadback.check,'passed');assert(r.independentObjectsExact.includes('Independent'));assert(r.independentObjectsExact.includes('Sketch'));assert(r.tree.objects.some(o=>o.name==='Body'));assert(r.tree.objects.some(o=>o.name==='Sketch'));const restored=await freecad.run({document:request('inspect',r.documentBase64)});assert.equal(restored.tree.objects.find(o=>o.name==='Pad').properties.find(p=>p.name==='Length').value,8);assert.equal(restored.tree.resultObject,'Pad');
});
