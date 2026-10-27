import test from 'node:test';import assert from 'node:assert/strict';
import {createFreeCADDependencyHost} from '../src/cad-freecad-parameter-host.js';
import {freeCADSourceDigest} from '../src/cad-freecad-source.js';
import {createCadProject,CAD_IDENTITY_MATRIX} from '../src/cad-project.js';
const target=rootId=>({rootId,path:[]}),script={version:1,code:'result=doc.addObject("Part::Box","Result")',parameters:{length:10}},source={version:1,engineVersion:'fixture',script,documentBase64:'UEs='};
const body=id=>({id,kind:'cad',name:id,source:'step',solid:true,transform:[...CAD_IDENTITY_MATRIX],metadata:{freecadSource:source},brep:{format:'OpenCascade-BRep',triangulation:false,data:'Host transport fixture '+id},stats:{bounds:{min:[0,0,0],max:[10,5,3]},volume:150,solids:1}});
function fixture(){const project=createCadProject({nodes:['input','following','independent'].map(body)});project.projectParameters={version:2,parameters:[{id:'length',name:'length',value:10}],bindings:['following','independent'].map(id=>({id:'bind-'+id,parameterId:'length',target:target(id),field:'freecad.parameters.length'})),variants:[],activeVariantId:null,freecad:[{target:target('following'),inputs:[{name:'raw',target:target('input')}]},{target:target('independent'),inputs:[]}]};return project;}
const request=(id,inputs=[])=>({target:target(id),sourceDigest:freeCADSourceDigest(source.documentBase64),script,inputs});

test('Native dependency host authority excludes the changed source and unrelated programs, rejects altered code, parameters, digest and input names before desktop execution',async()=>{
 let calls=0;const host=createFreeCADDependencyHost(fixture(),[target('input')],{desktop:{runFreeCADReply:async()=>{calls++;return {ok:false,error:'NATIVE_STUB',code:'NATIVE_STUB'};}}}),valid=request('following',[{name:'raw',format:'step',base64:'QQ=='}]);for(const bad of [request('input'),request('independent'),{...valid,script:{...script,code:'other code'}},{...valid,script:{...script,parameters:{length:99}}},{...valid,sourceDigest:'0'.repeat(64)},{...valid,inputs:[{name:'other',format:'step',base64:'QQ=='}]}])await assert.rejects(host(bad),{code:'FREECAD_PARAMETER_AUTHORITY'});assert.equal(calls,0);await assert.rejects(host(valid),{code:'NATIVE_STUB'});assert.equal(calls,1);await assert.rejects(host(valid),{code:'FREECAD_PARAMETER_AUTHORITY'});assert.equal(calls,1);
});
