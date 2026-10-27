import test from 'node:test';
import assert from 'node:assert/strict';
import {captureCadLinkedClipboard,insertCadLinkedClipboard} from '../src/cad-linked-contours-clipboard.js';
import {stampCadContourLink,cadContourLinkProblems} from '../src/cad-linked-contours-data.js';
import {createCadProjectParameters,stampCadProjectParameters} from '../src/cad-project-parameters-data.js';

const identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],address=(rootId,path=[])=>({rootId,path}),profile=()=>({elements:[{id:'rim',type:'circle',center:[0,0],diameter:20}],loops:[{id:'outer',role:'outer',elements:['rim']}]}),body=id=>({id,kind:'cad',source:'native',solid:true,layerId:'default',folderId:null,recipe:{type:'cylinder',size:[20,20,10]},brep:{data:'unchanged cylinder'},transform:identity(),stats:{bounds:{min:[-10,-10,0],max:[10,10,10]}}});
function fixture(nested=false){const source=body('source'),target={...body('target'),recipe:{type:'sketch',size:[20,20,2],sketch:{version:2,kind:'profile',variables:[{name:'height',value:'2'}],dimensions:{height:'height'},...profile()}}};target.transform[14]=10;const group={...body('group'),source:'group',operation:'union',children:[source,target],transform:[-1.2,0,0,0,.3,1.1,0,0,.2,.1,1.4,0,50,-10,5,1]};delete group.recipe;const project={version:14,nodes:nested?[group]:[source,target],layers:[{id:'default',hidden:false,locked:false}],folders:[],activeLayerId:'default',activeFolderId:null},link={id:'link',source:address(nested?'group':'source',nested?['source']:[]),target:address(nested?'group':'target',nested?['target']:[]),selector:{kind:'native-role',role:'cylinder.cap.max'}};project.contourLinks={version:1,links:[stampCadContourLink(project,link,{profile:profile(),faceFrame:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,10,1],elementMap:[{id:'rim',sourceKey:'cylinder.edge.cap.max'}]})]};return project;}

test('same-project target-only paste retains the deliberate original source and its copy offset',()=>{
 const original=fixture(),captured=captureCadLinkedClipboard(original,[address('target')],{scope:'one'}),draft=structuredClone(original),result=insertCadLinkedClipboard(draft,captured,{scope:'one'}),copy=draft.nodes.at(-1),link=draft.contourLinks.links.at(-1);
 assert.equal(draft.nodes.length,3);assert.deepEqual(link.source,address('source'));assert.deepEqual(link.target,address(copy.id));assert.equal(copy.transform[12],10);assert.equal(result.addedSources,0);assert.deepEqual(result.targets,[address(copy.id)]);assert.deepEqual(cadContourLinkProblems(draft),[]);assert.equal(original.nodes.length,2);
});

test('both sibling source addresses are flattened and remapped through all selected routes',()=>{
 const original=fixture(true),captured=captureCadLinkedClipboard(original,[address('group',['source']),address('group',['target'])],{scope:'one'}),draft=structuredClone(original),result=insertCadLinkedClipboard(draft,captured,{scope:'one'}),link=draft.contourLinks.links.at(-1);
 assert.equal(draft.nodes.length,3);assert.deepEqual(link.source,result.targets[0]);assert.deepEqual(link.target,result.targets[1]);assert.deepEqual(link.source.path,[]);assert.deepEqual(link.target.path,[]);assert.equal(draft.nodes[1].transform[0],-1.2);assert.equal(draft.nodes[1].transform[4],.3);assert.equal(draft.nodes[1].transform[12],60);assert.deepEqual(cadContourLinkProblems(draft),[]);
});

test('cross-project target-only paste captures upstream geometry and fresh global formulas despite colliding old IDs',()=>{
 const original=fixture();original.projectParameters=stampCadProjectParameters(original,{...createCadProjectParameters(),parameters:[{id:'base',name:'basis',value:10},{id:'diameter',name:'durchmesser',value:'basis * 2'}],bindings:[{id:'binding',parameterId:'diameter',target:address('source'),field:'size.0'}]});
 const captured=captureCadLinkedClipboard(original,[address('target')],{scope:'one'}),draft=structuredClone(original),prior=JSON.stringify(draft.nodes),result=insertCadLinkedClipboard(draft,captured,{scope:'two'}),link=draft.contourLinks.links.at(-1),incoming=draft.projectParameters.parameters.filter(parameter=>!['base','diameter'].includes(parameter.id));
 assert.equal(result.addedSources,1);assert.equal(draft.nodes.length,4);assert.equal(JSON.stringify(draft.nodes.slice(0,2)),prior);assert.equal(incoming.length,2);assert.ok(incoming.some(parameter=>typeof parameter.value==='string'&&parameter.value.includes('* 2')));assert.ok(!['source','target'].includes(link.source.rootId));assert.ok(!['source','target'].includes(link.target.rootId));assert.deepEqual(result.targets,[link.target]);assert.notEqual(link.id,'link');assert.equal(draft.projectParameters.bindings.length,2);assert.equal(draft.projectParameters.bindings.at(-1).target.rootId,link.source.rootId);assert.deepEqual(cadContourLinkProblems(draft),[]);
});

test('ancestor plus descendant selection is normalized once and plain geometry keeps its old metadata shape',()=>{
 const original=fixture(true),captured=captureCadLinkedClipboard(original,[address('group',['target']),address('group')],{scope:'one'});assert.deepEqual(captured.targets,[address('group')]);const draft=structuredClone(original);insertCadLinkedClipboard(draft,captured,{scope:'one'});assert.equal(draft.nodes.length,2);assert.equal(draft.contourLinks.links.length,2);assert.deepEqual(cadContourLinkProblems(draft),[]);
 const plain={...original,nodes:[body('plain')]};delete plain.contourLinks;const clipboard=captureCadLinkedClipboard(plain,[address('plain')],{scope:'one'}),host={...plain,nodes:[]};insertCadLinkedClipboard(host,clipboard,{scope:'different'});assert.equal(host.nodes.length,1);assert.equal(host.contourLinks,undefined);assert.equal(host.projectParameters,undefined);
});
