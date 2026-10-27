const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const freecad=require('../backend/freecad.cjs'),{validateDocumentRequest,runDocument}=require('../backend/freecad-document.cjs');
const sha=value=>createHash('sha256').update(Buffer.from(value,'base64')).digest('hex');
const script={version:1,code:`base=doc.addObject('Part::Box','Base');base.Length=30;base.Width=20;base.Height=6
base.addProperty('App::PropertyLength','Protected');base.Protected=7;base.setEditorMode('Protected',1)
bore=doc.addObject('Part::Cylinder','Bore');bore.Radius=3;bore.setExpression('Height','Base.Height + 2 mm');bore.Placement.Base=App.Vector(15,10,-1)
keep=doc.addObject('Part::Box','Independent');keep.Length=2;keep.Width=3;keep.Height=4;keep.Placement.Base=App.Vector(-50,0,0)
static=doc.addObject('Part::Feature','StaticShape');static.Shape=Part.makeBox(3,4,5);static.addProperty('App::PropertyLength','PretendLength');static.PretendLength=3
result=doc.addObject('Part::Cut','Finished');result.Base=base;result.Tool=bore;doc.recompute()
`};
let fixture;
test.before(async()=>{fixture=await freecad.run({script});});
const request=(action='inspect',extra={})=>({version:1,action,documentBase64:fixture.documentBase64,sourceDigest:sha(fixture.documentBase64),...extra});
const radius=(value=4)=>({object:'Bore',property:'Radius',expectedType:'App::PropertyLength',expectedValue:3,value});

test('FCStd requests reject stale bytes, paths, extra edits in read mode and malformed property authority before launch',()=>{
 const r=request();assert.deepEqual(validateDocumentRequest(r),r);
 for(const bad of [{...r,sourceDigest:'0'.repeat(64)},{...r,path:'host.FCStd'},{...r,edits:[]},{...request('edit',{resultObject:'../Finished',edits:[radius()]})},{...request('edit',{resultObject:'Finished',edits:[radius(),radius()]})},{...request('edit',{resultObject:'Finished',edits:[{...radius(),value:NaN}]})}])assert.throws(()=>validateDocumentRequest(bad),{code:'FREECAD_DOCUMENT_INPUT'});
});
test('Actual native tree exposes real object links, types, units, formulas and static shapes without fabricated history',async()=>{
 const r=request(),before=JSON.stringify(r),result=await runDocument(r);assert.equal(JSON.stringify(r),before);assert.equal(result.isolation,'windows-appcontainer');assert.equal(result.sourceDigest,r.sourceDigest);assert(!result.documentBase64&&!result.stepBase64);
 const objects=new Map(result.tree.objects.map(o=>[o.name,o]));assert.equal(objects.size,5);assert.equal(result.tree.resultObject,'Finished');assert.deepEqual(objects.get('Finished').dependsOn,['Base','Bore']);assert(objects.get('Bore').usedBy.includes('Finished'));
 const cut=objects.get('Finished');assert.deepEqual(cut.properties.find(p=>p.name==='Base').value,{object:'Base'});assert.deepEqual(cut.properties.find(p=>p.name==='Tool').value,{object:'Bore'});assert.deepEqual(objects.get('Bore').properties.find(p=>p.name==='Placement').value.position,[15,10,-1]);
 const props=Object.fromEntries(objects.get('Bore').properties.map(p=>[p.name,p]));assert.equal(props.Radius.value,3);assert.equal(props.Radius.editable,true);assert.equal(props.Radius.unit,'mm');assert.equal(props.Height.editable,false);assert.equal(props.Height.reason,'expression');assert.match(props.Height.expression,/Base.Height/);
 assert.equal(objects.get('StaticShape').staticShape,true);assert.equal(objects.get('StaticShape').properties.find(p=>p.name==='PretendLength').editable,false);assert.equal(objects.get('Base').properties.find(p=>p.name==='Protected').editable,false);
});
test('A typed native bore edit recomputes the actual cut, preserves dependency/formula and independent shapes, and reopens as edited FCStd',async()=>{
 const r=await freecad.run({document:request('edit',{resultObject:'Finished',edits:[radius()]})});assert.equal(r.report.solids,1);assert.equal(r.report.check,'passed');assert.equal(r.stepReadback.check,'passed');assert(Math.abs(fixture.report.volume-r.report.volume-42*Math.PI)<1e-6);
 const appearance=await freecad.run({inspectOnly:true,script:{version:1,parameters:{archive:r.documentBase64},code:`import base64,io,zipfile,xml.etree.ElementTree as ET
with zipfile.ZipFile(io.BytesIO(base64.b64decode(parameters['archive']))) as z:
 root=ET.fromstring(z.read('GuiDocument.xml'));measurements={'providers':[p.attrib.get('name') for p in root.iter('ViewProvider')]}`}});
 assert(appearance.measurements.providers.includes('Finished')&&appearance.measurements.providers.includes('Independent'));
 assert(r.independentObjectsExact.includes('Independent')&&r.independentObjectsExact.includes('StaticShape'));assert.deepEqual(r.affectedObjects,['Bore','Finished']);assert.equal(r.changes[0].before,3);assert.equal(r.changes[0].value,4);
 const opened=await runDocument({version:1,action:'inspect',documentBase64:r.documentBase64,sourceDigest:sha(r.documentBase64),resultObject:'Finished'});assert.equal(opened.tree.objects.find(o=>o.name==='Bore').properties.find(p=>p.name==='Radius').value,4);
 assert.equal(opened.tree.objects.find(o=>o.name==='Finished').properties.find(p=>p.name==='FormnaroPython').reason,'source-archive');assert.equal(sha(fixture.documentBase64),request().sourceDigest);
});
test('Native read-only, expression-driven and static properties reject writes; wrong prior value cannot retarget a stale request',async()=>{
 for(const [object,property,expectedValue,code]of [['Bore','Height',8,'FREECAD_DOCUMENT_READ_ONLY'],['Base','Protected',7,'FREECAD_DOCUMENT_READ_ONLY'],['StaticShape','PretendLength',3,'FREECAD_DOCUMENT_READ_ONLY'],['Bore','Radius',2,'FREECAD_DOCUMENT_STALE']])await assert.rejects(runDocument(request('edit',{resultObject:'Finished',edits:[{object,property,expectedType:'App::PropertyLength',expectedValue,value:4}]})),e=>e.code===code);
});
test('Editing a genuine driver recomputes its expression-bound dependent property without replacing the formula',async()=>{
 const r=await runDocument(request('edit',{resultObject:'Finished',edits:[{object:'Base',property:'Height',expectedType:'App::PropertyLength',expectedValue:6,value:8}]}));
 const bore=r.tree.objects.find(o=>o.name==='Bore').properties.find(p=>p.name==='Height');assert.equal(bore.value,10);assert.equal(bore.editable,false);assert.match(bore.expression,/Base.Height/);
 assert(r.dependentChanges.some(p=>p.object==='Bore'&&p.property==='Height'&&p.before===8&&p.value===10&&/Base.Height/.test(p.expression)));
 assert(Math.abs(r.report.volume-8*(600-9*Math.PI))<1e-6);assert.deepEqual(r.affectedObjects,['Base','Bore','Finished']);assert(r.independentObjectsExact.includes('Independent'));
});
test('Invalid native values and unresolvable result identities fail without replacing the archived source',async()=>{
 await assert.rejects(freecad.run({document:request(),script}),e=>e.code==='FREECAD_DOCUMENT_INPUT');
 await assert.rejects(runDocument(request('edit',{resultObject:'Missing',edits:[radius()]})),e=>e.code==='FREECAD_DOCUMENT_STALE');
 await assert.rejects(runDocument(request('edit',{resultObject:'Finished',edits:[radius(-1)]})),/begrenzt|verändert|Radius|positive|greater|range|value/i);
});

test('Archived helper classes restore a real FeaturePython for native edits without rerunning the original program',async()=>{
 const modules={'fixture_body.py':`import FreeCAD as App, Part
class ParametricBody:
    def __init__(self, obj):
        obj.addProperty('App::PropertyLength','Length');obj.Length=10
        obj.addProperty('App::PropertyLength','Width');obj.Width=5
        obj.addProperty('App::PropertyLength','Height');obj.Height=3
        obj.Proxy=self
    def execute(self, obj):
        obj.Shape=Part.makeBox(obj.Length,obj.Width,obj.Height)
    def dumps(self): return None
    def loads(self, state): pass
`};
 const code=`from fixture_body import ParametricBody
result=doc.addObject('Part::FeaturePython','ProgrammedBody');ParametricBody(result)
keep=doc.addObject('Part::Box','Independent');keep.Length=2;keep.Width=3;keep.Height=4
doc.recompute()`;
 const original=await freecad.run({script:{version:1,code,modules}}),base={version:1,action:'inspect',documentBase64:original.documentBase64,sourceDigest:sha(original.documentBase64),resultObject:'ProgrammedBody',modules};
 const {readFreeCADDocument,editFreeCADDocument}=await import('../src/cad-freecad-document.js');
 const source={version:1,script:{version:1,code:'raise AssertionError("main program must not run during a native document operation")',modules},engineVersion:original.engineVersion,documentBase64:original.documentBase64};
 const desktop={runFreeCADReply:async({document})=>({ok:true,value:await runDocument(document)})};
 const inspected=await readFreeCADDocument(source,{desktop,resultObject:'ProgrammedBody'}),body=inspected.tree.objects.find(o=>o.name==='ProgrammedBody');
 assert.equal(body.staticShape,false);assert.equal(body.missingProxy,false);assert.equal(body.properties.find(p=>p.name==='Length').editable,true);
 const changed=await editFreeCADDocument(source,{desktop,resultObject:'ProgrammedBody',edits:[{object:'ProgrammedBody',property:'Length',expectedType:'App::PropertyLength',expectedValue:10,value:14}]});
 assert.equal(changed.source.mode,'native');assert.deepEqual(changed.source.script,source.script);assert(Math.abs(changed.report.report.volume-210)<1e-8);assert.equal(changed.report.stepReadback.check,'passed');assert(changed.report.independentObjectsExact.includes('Independent'));
 const reopened=await runDocument({...base,documentBase64:changed.source.documentBase64,sourceDigest:changed.source.documentDigest});
 assert.equal(reopened.tree.objects.find(o=>o.name==='ProgrammedBody').properties.find(p=>p.name==='Length').value,14);
 const withoutHelpers={...base};delete withoutHelpers.modules;
 const unavailable=await runDocument(withoutHelpers),missing=unavailable.tree.objects.find(o=>o.name==='ProgrammedBody');assert.equal(missing.missingProxy,true);assert.equal(missing.properties.find(p=>p.name==='Length').reason,'missing-python-proxy');
 await assert.rejects(runDocument({...withoutHelpers,action:'edit',edits:[{object:'ProgrammedBody',property:'Length',expectedType:'App::PropertyLength',expectedValue:10,value:14}]}),e=>e.code==='FREECAD_DOCUMENT_PROXY_MISSING');
});

test('Archived helper filenames cannot replace workers, alias a Windows device, collide by case or escape the job',()=>{
 const r=request();for(const modules of [{'Worker.py':'pass'},{'Formnaro_FreeCAD.py':'pass'},{'USER.py':'pass'},{'CON.py':'pass'},{'lpt1.py':'pass'},{'../body.py':'pass'},{'a.py':'pass','A.py':'pass'},{'body.py':3}])assert.throws(()=>validateDocumentRequest({...r,modules}),{code:'FREECAD_DOCUMENT_INPUT'});
});
