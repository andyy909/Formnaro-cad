import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {createCadController} from '../src/cad-controller.js';import {createCadAutomationAccess} from '../src/cad-automation-access.js';import {createCadAssemblyDisplay} from '../src/cad-assembly-display.js';import {validateCadAssemblyRequest,CAD_ASSEMBLY_DISPLAY_SCHEMA} from '../src/cad-assembly-automation.js';import {cadAIContext} from '../src/cad-ai-context.js';import {createCadProject} from '../src/cad-project.js';import {cadIdentity} from '../src/cad-affine.js';
const node=id=>({id,name:id,kind:'cad',source:'native',solid:true,recipe:{type:'box',size:[10,8,4]},transform:cadIdentity(),brep:{format:'OpenCascade-BRep',data:'storage-only-'+id,triangulation:false},stats:{volume:320,solids:1,bounds:{min:[-5,-4,-2],max:[5,4,2]}}});
test('strict view requests reject mixed model fields empty duplicate targets and unknown methods',()=>{for(const v of [null,{},[],{action:'state',revision:'x'},{action:'all',revision:'x',ids:['a']},{action:'only',revision:'x',ids:[]},{action:'load',revision:'x',ids:['a','a']},{action:'only',revision:'x',ids:['a'],commands:[]},{action:'preview',revision:'x'}])assert.throws(()=>validateCadAssemblyRequest(v));assert.deepEqual(validateCadAssemblyRequest({action:'load',revision:'x',ids:['a']}),{action:'load',revision:'x',ids:['a']});});
test('local view API changes only the workspace load set and rejects stale or absent targets before mutation',async()=>{let jobs=0;const cad=createCadController({initial:createCadProject({nodes:[node('a'),node('b')]}),createWorker:()=>{jobs++;throw Error('No geometry requested');}}),view=createCadAssemblyDisplay(),access=createCadAutomationAccess({controller:cad,getAssemblyDisplay:()=>view.state(cad.readSnapshot()),setAssemblyDisplay:async r=>view[r.action](r.ids??cad.readSnapshot(),r.ids?cad.readSnapshot():undefined)});try{const before=cad.serialize(),revision=cad.revision();assert.equal((await access.assembly({action:'state'})).geometryResident,true);await access.dispatch('assembly',{action:'only',revision,ids:['a']});assert.deepEqual(view.ids(cad.readSnapshot()),['a']);await assert.rejects(access.assembly({action:'load',revision:'stale',ids:['b']}),{code:'STALE_REVISION'});await assert.rejects(access.assembly({action:'load',revision,ids:['missing']}));assert.deepEqual(view.ids(cad.readSnapshot()),['a']);await access.assembly({action:'load',revision,ids:['b']});assert.deepEqual(view.ids(cad.readSnapshot()),['a','b']);assert.equal(cad.serialize(),before);assert.equal(cad.state().undo,0);assert.equal(jobs,0);}finally{cad.dispose();}});
test('generated context and OpenAPI advertise the separate display schema without model commands',()=>{const c=cadAIContext();assert.deepEqual(c.assemblyDisplaySchema,CAD_ASSEMBLY_DISPLAY_SCHEMA);assert.ok(c.endpoints['POST /v1/assembly']);assert.match(c.programTools.assemblyDisplay,/workspace-only|workspace.only/);});
test('Python MCP adapter retains the eighth view tool and conditionally adds Python for supporting applications',()=>{const script=`import importlib.util,json
s=importlib.util.spec_from_file_location('adapter','scripts/offlinecad_ai.py')
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
c=json.load(open('ai/OfflineCAD-KI-Kontext.json',encoding='utf-8'))
C=type('C',(),{'request':lambda self,method:c})
tools=m.tool_definitions(C())
assert len(tools)==9 and tools[7]['name']=='offlinecad_assembly' and tools[7]['inputSchema']==c['assemblyDisplaySchema']
assert tools[8]['name']=='offlinecad_python' and tools[8]['annotations']['readOnlyHint'] is True
python_support=c['programTools'].pop('python')
legacy=m.tool_definitions(C())
assert len(legacy)==8 and legacy[-1]==tools[7]
del c['assemblyDisplaySchema']
assert len(m.tool_definitions(C()))==7
c['programTools']['python']=python_support
modern=m.tool_definitions(C())
assert len(modern)==8 and modern[-1]==tools[8]
assert modern[:7]==legacy[:7]
print('ok')`;const r=spawnSync('python',['-c',script],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),'ok');});
