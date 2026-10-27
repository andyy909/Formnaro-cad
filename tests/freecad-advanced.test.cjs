const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const freecad=require('../backend/freecad.cjs'),{runDocument}=require('../backend/freecad-document.cjs');
const modules={'formnaro_advanced_v1.py':fs.readFileSync('backend/freecad-advanced.py','utf8')};
const ref=(point,normal)=>({point,normal}),sha=x=>createHash('sha256').update(Buffer.from(x,'base64')).digest('hex');
async function build(parameters,source='') {return freecad.run({script:{version:1,modules,parameters,gui:true,code:source+'\nfrom formnaro_advanced_v1 import build\nresult,measurements=build(doc,inputs,parameters)'}});}
const box='inputs["original"]=Part.makeBox(30,20,10)';
function edit(r,object,property,expectedType,expectedValue,value){return runDocument({version:1,action:'edit',documentBase64:r.documentBase64,sourceDigest:sha(r.documentBase64),resultObject:r.resultObject,modules,edits:[{object,property,expectedType,expectedValue,value}]});}
test('Installed native capabilities are probed by object creation and actual shape method',async()=>{
 const r=await freecad.run({inspectOnly:true,script:{version:1,modules,code:'from formnaro_advanced_v1 import capabilities\nmeasurements=capabilities(doc)'}});
 assert.deepEqual(r.measurements.features,{draft:true,revolution:true,helix:true,sweep:true,defeature:true});assert.deepEqual(r.documentObjects,[]);
});
test('Native draft has a static base, editable angle/reversal, unique STEP-safe face selection and visible parent',async()=>{
 const r=await build({kind:'draft',faces:[ref([30,10,5],[1,0,0])],neutral:ref([15,10,0],[0,0,-1]),angle:5,reversed:false},box);
 assert.equal(r.report.solids,1);assert(Math.abs(Math.abs(r.report.volume-6000)-1000*Math.tan(5*Math.PI/180))<1e-5);
 const changed=await edit(r,'Draft','Angle','App::PropertyAngle',5,10);assert(Math.abs(Math.abs(changed.report.volume-6000)-1000*Math.tan(10*Math.PI/180))<1e-5);
 const tree=await runDocument({version:1,action:'inspect',documentBase64:changed.documentBase64,sourceDigest:sha(changed.documentBase64),modules});
 assert(tree.tree.objects.find(o=>o.name==='StaticBase').staticShape);assert(tree.tree.objects.find(o=>o.name==='Draft').properties.find(p=>p.name==='Angle').editable);
 const xml=await freecad.run({inspectOnly:true,script:{version:1,parameters:{archive:r.documentBase64},code:`import base64,io,zipfile,xml.etree.ElementTree as ET
with zipfile.ZipFile(io.BytesIO(base64.b64decode(parameters['archive']))) as z:
 root=ET.fromstring(z.read('GuiDocument.xml'));measurements={'visible':{p.attrib['name']:p.find(".//Property[@name='Visibility']/Bool").attrib['value'] for p in root.iter('ViewProvider')}}`}});
 assert.equal(xml.measurements.visible.Draft,'true');assert.equal(xml.measurements.visible.DraftBody,'true');assert.equal(xml.measurements.visible.StaticBase,'false');
});
test('Suitable static defeaturing removes an actual through hole; unsuitable selections fail',async()=>{
 const source='inputs["original"]=Part.makeBox(30,20,10).cut(Part.makeCylinder(3,10,App.Vector(15,10,0)))';
 const r=await build({kind:'defeature',faces:[ref([18,10,5],[-1,0,0])]},source);assert(Math.abs(r.report.volume-6000)<1e-6);assert.equal(r.measurements.staticResult,true);
 await assert.rejects(build({kind:'defeature',faces:[ref([30,10,5],[1,0,0])]},box),/unverändert|gültigen|failed|entfernung/i);
});
test('Real revolution survives native Angle edit without rerunning its static source profile',async()=>{
 const r=await build({kind:'revolution',faces:[ref([7.5,5,0],[0,0,1])],axis:[0,1,0],origin:[0,0,0],angle:360},'inputs["original"]=Part.makeBox(5,10,1,App.Vector(5,0,-1))');
 assert(Math.abs(r.report.volume-750*Math.PI)<1e-5);const changed=await edit(r,'Revolution','Angle','App::PropertyFloatConstraint',360,180);assert(Math.abs(changed.report.volume-375*Math.PI)<1e-5);assert(changed.independentObjectsExact.includes('StaticProfile'));
});
test('Linked helix profile restores from archived helper and follows actual native pitch edits',async()=>{
 const r=await build({kind:'helix',radius:10,pitch:5,height:20,wireRadius:1,axis:[0,0,1],origin:[0,0,0],leftHanded:false});
 const volume=pitch=>Math.PI*Math.hypot(20*Math.PI,pitch)*20/pitch;
 assert(Math.abs(r.report.volume-volume(5))<.02);const changed=await edit(r,'Helix','Pitch','App::PropertyLength',5,8);assert(Math.abs(changed.report.volume-volume(8))<.02);assert(changed.affectedObjects.includes('HelixProfile'));assert(changed.affectedObjects.includes('HelixSweep'));
 await assert.rejects(edit(r,'Helix','Pitch','App::PropertyLength',5,1),/failed|Invalid|Error|leer|gültig|recompute|berechn/i);
});
