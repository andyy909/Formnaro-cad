const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const freecad=require('../backend/freecad.cjs'),{runDocument,validateDocumentRequest}=require('../backend/freecad-document.cjs');
const sha=s=>createHash('sha256').update(Buffer.from(s,'base64')).digest('hex');
const {code}=require('./fixtures/freecad-link-fixture.cjs');
let fixture;
test.before(async()=>{fixture=await freecad.run({script:{version:1,code}});});
const request=(edits,resultObject='Finished',archive=fixture.documentBase64)=>({version:1,action:'edit',documentBase64:archive,sourceDigest:sha(archive),resultObject,edits});
const change=(object,property,expectedType,expectedValue,value)=>({object,property,expectedType,expectedValue,value});
const property=(tree,object,name)=>tree.objects.find(o=>o.name===object).properties.find(p=>p.name===name);

test('link requests accept typed document-local choices and reject malformed or unbounded values before launch',()=>{
 const edit=change('Finished','Tool','App::PropertyLink',{object:'Bore'},{object:'OtherBore'}),r=request([edit]);assert.deepEqual(validateDocumentRequest(r),r);
 for(const value of ['OtherBore',{object:'../Outside'},{object:'OtherBore',document:'host.FCStd'},{object:'OtherBore',subelements:[]},[{object:'OtherBore'}],{object:7}])assert.throws(()=>validateDocumentRequest(request([{...edit,value}])),{code:'FREECAD_DOCUMENT_INPUT'});
 assert.throws(()=>validateDocumentRequest(request([change('Binder','Support','App::PropertyXLinkSubList',[],Array(65).fill({object:'Base',subelements:[]}))])),{code:'FREECAD_DOCUMENT_INPUT'});
});
test('the native catalog exposes actual link kinds, current endpoints and exact topology counts',async()=>{
 const r=await runDocument({...request([]),action:'inspect',edits:undefined});assert.equal(property(r.tree,'Finished','Tool').kind,'link');assert(property(r.tree,'Finished','Tool').editable);assert(property(r.tree,'Pad','Profile').subelements);assert(property(r.tree,'Combined','Links').multiple);assert(property(r.tree,'Binder','Support').multiple);assert.deepEqual(r.tree.objects.find(o=>o.name==='Base').topology,{faces:6,edges:12,vertices:8});
});
test('replacing a Cut tool changes only its explicit native edge and finished geometry and preserves both sources',async()=>{
 const r=await runDocument(request([change('Finished','Tool','App::PropertyLink',{object:'Bore'},{object:'OtherBore'})]));assert.equal(r.report.check,'passed');assert.equal(r.stepReadback.check,'passed');assert(Math.abs(r.report.volume-(3600-96*Math.PI))<1e-6);assert.deepEqual(r.affectedObjects,['Finished']);assert(r.independentObjectsExact.includes('Keep'));assert.deepEqual(property(r.tree,'Finished','Tool').value,{object:'OtherBore'});assert.deepEqual(r.reassignedSources,['Bore','OtherBore']);
 const reopened=await runDocument({...request([],r.tree.resultObject,r.documentBase64),action:'inspect',edits:undefined});assert.deepEqual(property(reopened.tree,'Finished','Tool').value,{object:'OtherBore'});assert.equal(property(reopened.tree,'Bore','Radius').value,3);assert.equal(property(reopened.tree,'OtherBore','Radius').value,4);
});
test('whole-profile LinkSub and collected LinkList replacements rebuild real Pad and Compound features',async()=>{
 for(const [edit,resultObject,volume] of [[change('Pad','Profile','App::PropertyLinkSub',{object:'Profile',subelements:[]},{object:'NewProfile',subelements:[]}),'Pad',384],[change('Combined','Links','App::PropertyLinkList',[{object:'Base'},{object:'Keep'}],[{object:'Replacement'},{object:'Keep'}]),'Combined',6024]]){const r=await runDocument(request([edit],resultObject));assert.equal(r.report.check,'passed');assert.equal(r.stepReadback.check,'passed');assert(Math.abs(r.report.volume-volume)<1e-6);assert.deepEqual(property(r.tree,edit.object,edit.property).value,edit.value);}
});
test('native subelement list replacement uses explicitly chosen current faces and rejects missing subelements or cycles',async()=>{
 const inspect=await runDocument({...request([]),action:'inspect',edits:undefined}),p=property(inspect.tree,'Binder','Support'),edit=change('Binder','Support',p.type,p.value,[{object:'Replacement',subelements:['Face6']}]),r=await runDocument(request([edit],'Extruded'));assert.equal(r.report.check,'passed');assert(Math.abs(r.report.volume-2000)<1e-6);assert.deepEqual(property(r.tree,'Binder','Support').value,edit.value);
 for(const [invalid,code] of [[{...edit,value:[{object:'Replacement',subelements:['Face999']}]},'FREECAD_DOCUMENT_REFERENCE_LOST'],[change('Finished','Tool','App::PropertyLink',{object:'Bore'},{object:'Missing'}),'FREECAD_DOCUMENT_REFERENCE_LOST'],[change('Finished','Tool','App::PropertyLink',{object:'Bore'},{object:'Finished'}),'FREECAD_DOCUMENT_REFERENCE_CYCLE'],[change('Finished','Tool','App::PropertyLink',{object:'OtherBore'},{object:'Bore'}),'FREECAD_DOCUMENT_STALE'],[change('OtherBore','ProtectedSource','App::PropertyLink',{object:'Base'},{object:'Keep'}),'FREECAD_DOCUMENT_READ_ONLY']])await assert.rejects(runDocument(request([invalid])),e=>e.code===code);
});
test('a genuinely broken saved Cut with no result Shape remains readable and recovers through explicit source reassignment',async()=>{
 const damaged=await freecad.run({inspectOnly:true,script:{version:1,parameters:{archive:fixture.documentBase64},code:"import base64\npath=workspace/'broken.FCStd';path.write_bytes(base64.b64decode(parameters['archive']));doc=App.openDocument(str(path));broken=doc.getObject('Finished');broken.Tool=None;doc.recompute();broken.Shape=Part.Shape();doc.saveAs(str(workspace/'lost.FCStd'));measurements={'archive':base64.b64encode((workspace/'lost.FCStd').read_bytes()).decode(),'shapeNull':broken.Shape.isNull()}"}}),archive=damaged.measurements.archive;assert(damaged.measurements.shapeNull);
 const before=await runDocument({...request([],'Finished',archive),action:'inspect',edits:undefined});assert.equal(before.tree.resultObject,'Finished');assert.equal(before.tree.objects.find(o=>o.name==='Finished').hasShape,false);assert.equal(property(before.tree,'Finished','Tool').value,null);
 const r=await runDocument(request([change('Finished','Tool','App::PropertyLink',null,{object:'OtherBore'})],'Finished',archive));assert.equal(r.report.check,'passed');assert.equal(r.stepReadback.check,'passed');assert(Math.abs(r.report.volume-(3600-96*Math.PI))<1e-6);assert.deepEqual(property(r.tree,'Finished','Tool').value,{object:'OtherBore'});assert.equal(r.tree.objects.find(o=>o.name==='Finished').hasShape,true);
});
test('collected link replacements use their final graph and reject a mutual cycle before native setters run',async()=>{
 const edits=[change('Finished','Base','App::PropertyLink',{object:'Base'},{object:'Combined'}),change('Combined','Links','App::PropertyLinkList',[{object:'Base'},{object:'Keep'}],[{object:'Replacement'}])],r=await runDocument(request(edits));assert.equal(r.report.check,'passed');assert(Math.abs(r.report.volume-(6000-54*Math.PI))<1e-6);assert.deepEqual(property(r.tree,'Finished','Base').value,{object:'Combined'});const cycle=structuredClone(edits);cycle[1].value=[{object:'Finished'}];await assert.rejects(runDocument(request(cycle)),{code:'FREECAD_DOCUMENT_REFERENCE_CYCLE'});
});
