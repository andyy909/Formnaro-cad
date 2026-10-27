const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const freecad=require('../backend/freecad.cjs'),{validateScript,runPythonJob}=require('../backend/freecad-python.cjs');
const script=code=>({version:1,code});
test('Native Python accepts complete programs and installed APIs without function filtering',()=>{
 const source=script('import FreeCAD,Part,os,ctypes\nclass Builder: pass\nresult=Part.makeBox(1,2,3)');assert.deepEqual(validateScript(source),source);
 for(const v of [{...source,filename:'secret'},{...source,modules:{'../worker.py':'pass'}},{...source,modules:{'formnaro_freecad.py':'pass'}},{...source,modules:{'Worker.py':'pass'}},{...source,modules:{'NUL.py':'pass'}},{...source,modules:{'a.py':'pass','A.py':'pass'}},{...source,parameters:{x:Infinity}},{...source,gui:'yes'}])assert.throws(()=>validateScript(v),{code:'FREECAD_PYTHON_INVALID'});
});
test('Full native Python sews faces, classifies exact inside points and survives STEP readback',async()=>{
 const r=await freecad.run({script:script(`from formnaro_freecad import sew_solid,inside,api
p=[App.Vector(*v) for v in [(0,0,0),(12,0,0),(12,10,0),(0,10,0),(0,0,8),(12,0,8),(12,10,8),(0,10,8)]]
indices=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
faces=[Part.Face(Part.makePolygon([p[i] for i in ids]+[p[ids[0]]])) for ids in indices]
result=sew_solid(faces)
measurements={'inside':inside(result,[(6,5,4),(20,5,4),(0,0,0)]),'api':api('Part','BSplineSurface')}
`)});
 assert.equal(r.report.solids,1);assert.equal(r.report.volume,960);assert.equal(r.stepReadback.check,'passed');assert.equal(r.isolation,'windows-appcontainer');assert.deepEqual(r.measurements.inside,[true,false,true]);assert(r.measurements.api.members.some(m=>m.name==='BSplineSurface'));assert(r.documentBase64.startsWith('UEs'));
});
test('Real dependency objects remain parametrically editable after FCStd reopen',async()=>{
 const r=await freecad.run({script:script(`base=doc.addObject('Part::Box','Base');base.Length=30;base.Width=20;base.Height=6
bore=doc.addObject('Part::Cylinder','Bore');bore.Radius=3;bore.Height=8;bore.Placement.Base=App.Vector(15,10,-1)
result=doc.addObject('Part::Cut','Finished');result.Base=base;result.Tool=bore;doc.recompute()
`)});
 assert(r.documentObjects.some(o=>o.type==='Part::Cylinder'));assert(r.documentObjects.some(o=>o.type==='Part::Cut'));
 const checked=await freecad.run({inspectOnly:true,script:{...script(`import base64
file=workspace/'source.FCStd';file.write_bytes(base64.b64decode(parameters['document']))
doc=App.openDocument(str(file));before=doc.getObject('Finished').Shape.Volume
doc.getObject('Bore').Radius=4;doc.recompute()
measurements={'before':before,'after':doc.getObject('Finished').Shape.Volume,'dependent':doc.getObject('Finished').Tool.Name}
`),parameters:{document:r.documentBase64}}});
 assert.equal(checked.measurements.dependent,'Bore');assert(Math.abs(checked.measurements.before-checked.measurements.after-42*Math.PI)<1e-6);
});
test('GUI-only FreeCAD APIs run offscreen in the same native container',async()=>{
 const r=await freecad.run({script:{...script("import FreeCADGui as Gui,ImportGui,Draft\nbase=doc.addObject('Part::Cylinder','Body');base.Radius=5;base.Height=8;doc.recompute()\nresult=base\nmeasurements={'gui':bool(App.GuiUp),'import':hasattr(ImportGui,'insert'),'draft':hasattr(Draft,'make_wire')}"),gui:true}});
 assert.equal(r.report.solids,1);assert.deepEqual(r.measurements,{gui:true,import:true,draft:true});assert.equal(r.stepReadback.check,'passed');
});
test('Analysis reads original STL as raw Mesh and complete local helper modules',async()=>{
 const triangle=Buffer.alloc(134);triangle.writeUInt32LE(1,80);[0,0,1,0,0,0,2,0,0,0,3,0].forEach((n,i)=>triangle.writeFloatLE(n,84+i*4));
 const r=await freecad.run({inputs:[{name:'original',format:'stl',base64:triangle.toString('base64')}],inspectOnly:true,script:{...script("from helper import number\nmeasurements={'triangles':inputs['original'].CountFacets,'number':number(parameters['n']),'mesh':type(inputs['original']).__name__}"),modules:{'helper.py':'def number(n): return n*2'},parameters:{n:21}}});
 assert.equal(r.measurements.triangles,1);assert.equal(r.measurements.number,42);assert.equal(r.report,null);assert(!r.stepBase64);
});
test('OS isolation blocks Python/native host files and loopback; credentials are absent',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'formnaro-host-sentinel-')),sentinel=path.join(dir,'secret.txt');await fs.writeFile(sentinel,'keep-private');
 const server=http.createServer((q,s)=>s.end('private'));let requests=0;server.on('request',()=>requests++);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const old=process.env.FORMNARO_TEST_SECRET;process.env.FORMNARO_TEST_SECRET='never-forward';
 try{const r=await freecad.run({inspectOnly:true,script:{...script(`from pathlib import Path
import os,socket,ctypes
checks={}
for action in ['read','write']:
 try:
  if action=='read':Path(parameters['sentinel']).read_text()
  else:Path(parameters['sentinel']).write_text('changed')
  checks[action]=False
 except PermissionError:checks[action]=True
kernel=ctypes.WinDLL('kernel32',use_last_error=True);kernel.CreateFileW.restype=ctypes.c_void_p
handle=kernel.CreateFileW(ctypes.c_wchar_p(parameters['sentinel']),0x80000000,1,None,3,0,None)
checks['native']=handle==ctypes.c_void_p(-1).value
try:
 socket.create_connection(('127.0.0.1',parameters['port']),timeout=1).close();checks['network']=False
except OSError:checks['network']=True
checks['credential']=os.environ.get('FORMNARO_TEST_SECRET') is None
measurements=checks
`),parameters:{sentinel,port:server.address().port}}});
  assert.deepEqual(r.measurements,{read:true,write:true,native:true,network:true,credential:true});assert.equal(requests,0);assert.equal(await fs.readFile(sentinel,'utf8'),'keep-private');
 }finally{if(old===undefined)delete process.env.FORMNARO_TEST_SECRET;else process.env.FORMNARO_TEST_SECRET=old;server.closeAllConnections();await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});}
});
test('Tracebacks are retained and invalid bodies are rejected',async()=>{
 await assert.rejects(freecad.run({script:script("raise ValueError('measured-construction-error')")}),e=>e.code==='FREECAD_PYTHON_FAILED'&&e.feedback.traceback.includes('measured-construction-error'));
 await assert.rejects(freecad.run({script:script("result=Part.makePlane(10,10)")}),/Final CAD body failed/);
});
test('The final object selects its real document and existing source properties survive',async()=>{
 const r=await freecad.run({script:script("other=App.newDocument('Other')\nresult=other.addObject('Part::Box','OtherBody');result.Length=2;result.Width=3;result.Height=4\nresult.addProperty('App::PropertyString','FormnaroPython','Formnaro');result.FormnaroPython='previous source'\nother.recompute()")});
 assert(Math.abs(r.report.volume-24)<1e-9);assert(r.documentObjects.some(o=>o.name==='OtherBody'));assert.equal(r.stepReadback.check,'passed');
});
test('A script cannot replace the host cleanup launcher through the writable workspace',async()=>{
 const r=await freecad.run({script:script("(workspace/'container.exe').write_bytes(b'not a host executable')\n(workspace/'container.cs').write_text('untrusted replacement')\nresult=Part.makeBox(2,3,4)")});
 assert(Math.abs(r.report.volume-24)<1e-9);assert.equal(r.stepReadback.check,'passed');
});
test('Cancellation kills the entire native process tree',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'formnaro-native-cancel-')),controller=new AbortController();
 const p=runPythonJob({job:dir,exe:freecad.executable(),script:script("import os,time\n(workspace/'pid.txt').write_text(str(os.getpid()))\nwhile True:time.sleep(.01)"),inputs:[],inspectOnly:true,signal:controller.signal,timeout:30000});
 let pid;try{for(let i=0;i<200;i++){try{pid=Number(await fs.readFile(path.join(dir,'pid.txt'),'utf8'));break;}catch{}await new Promise(r=>setTimeout(r,25));}
  assert(pid,'native interpreter started');controller.abort();await assert.rejects(p,e=>e.code==='ABORTED');
  for(let i=0;i<100;i++){try{process.kill(pid,0);}catch{pid=null;break;}await new Promise(r=>setTimeout(r,20));}assert.equal(pid,null,'interpreter is no longer running');
 }finally{controller.abort();await p.catch(()=>{});await fs.rm(dir,{recursive:true,force:true});}
});
