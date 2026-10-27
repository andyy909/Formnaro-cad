import test from 'node:test';
import assert from 'node:assert/strict';
import {createCadProject,createCadWorkspaceSerializer,parseCadProject,serializeCadProject,CAD_IDENTITY_MATRIX} from '../src/cad-project.js';
import {validateCadWorkspace} from '../src/cad-workspace.js';
import {CAD_QUALITY_DEFAULTS} from '../src/cad-quality.js';
import {defaultLayout} from '../src/layout-preferences.js';
import {buildMeshSelectionTopology,queryMeshSelection,validateMeshSelectionBinding} from '../src/mesh-selection-data.js';

const source=()=>({id:'open',kind:'mesh',name:'Offenes Netz',transform:[...CAD_IDENTITY_MATRIX],mesh:{verts:[0,0,0,20,0,0,20,20,0,0,20,0],triangles:[0,1,2,0,2,3]},color:'#109ca9',opacity:.8,locked:false,hidden:false,layerId:'default',folderId:null,metadata:{notes:'Originalquelle erhalten'}});
const workspace=()=>({version:4,view:{projection:'orthographic',position:[10,10,100],target:[10,10,0],up:[0,1,0],zoom:2},selection:[{rootId:'open',path:[]}],tree:{expanded:[]},mode:'translate',snap:1,quality:structuredClone(CAD_QUALITY_DEFAULTS),layout:defaultLayout(),meshSelection:null});
const selection=n=>{const result=queryMeshSelection(buildMeshSelectionTopology(n.mesh),{mode:'boundary',triangleIndex:0,point:[10,0,0]},{objectId:n.id});const {format,version,objectId,geometryDigest,triangleIds,boundaryEdges}=result;return validateMeshSelectionBinding({format,version,objectId,geometryDigest,triangleIds,boundaryEdges});};

test('Workspace 4 roundtrips original mesh triangle/rim bindings alongside an optional independent section',()=>{
  const n=source(),model=createCadProject({nodes:[n]}),original=JSON.stringify(model.nodes),state=workspace();state.meshSelection=selection(n);
  for(const section of [null,{normal:[0,0,1],offset:3,side:'positive',ids:[n.id]}]){
    if(section)state.section=section;
    const encoded=serializeCadProject({...model,workspace:state}),reopened=parseCadProject(encoded);
    assert.deepEqual(reopened.workspace,state);assert.equal(JSON.stringify(reopened.nodes),original);assert.equal(reopened.workspace.meshSelection.boundaryEdges.length,4);
    assert.deepEqual(validateMeshSelectionBinding(reopened.workspace.meshSelection,{node:reopened.nodes[0]}),state.meshSelection);
  }
  assert.equal(n.mesh.triangles.length,6);assert.equal(n.mesh.verts.length,12);
});
test('Stored selection rejects unknown data, duplicate indices, forged edge references and incompatible workspace versions',()=>{
  const state=workspace();state.meshSelection=selection(source());
  const invalid=[s=>delete s.meshSelection,s=>s.meshSelection.extra='not UI data',s=>s.meshSelection.geometryDigest='old',s=>s.meshSelection.triangleIds=[0,0],s=>s.meshSelection.triangleIds=[-1],s=>s.meshSelection.boundaryEdges[0].id='e:wrong',s=>s.meshSelection.boundaryEdges[0].vertices.reverse(),s=>s.version=3,s=>s.version=5];
  for(const change of invalid){const value=structuredClone(state);change(value);assert.throws(()=>validateCadWorkspace(value));}
  const detached=validateCadWorkspace(state);detached.meshSelection.boundaryEdges[0].vertices[0]=999;assert.notEqual(state.meshSelection.boundaryEdges[0].vertices[0],999);
});
test('Confirmed selection is serialized without model history changes and legacy workspaces remain readable',()=>{
  const model=createCadProject({nodes:[source()]}),before=serializeCadProject(model),encode=createCadWorkspaceSerializer(model),state=workspace();state.meshSelection=selection(model.nodes[0]);
  const saved=encode(state);assert.equal(serializeCadProject(model),before);assert.equal(parseCadProject(saved).workspace.meshSelection.geometryDigest,state.meshSelection.geometryDigest);
  state.meshSelection=null;assert.equal(parseCadProject(encode(state)).workspace.meshSelection,null);assert.ok(parseCadProject(saved).workspace.meshSelection);
  for(const version of [1,2,3]){const legacy=workspace();legacy.version=version;delete legacy.meshSelection;if(version===1)delete legacy.tree;if(version===3)legacy.section={normal:[0,0,1],offset:0,side:'negative',ids:['open']};assert.equal(validateCadWorkspace(legacy).version,version);assert.deepEqual(parseCadProject(encode(legacy)).workspace,legacy);}
});
