const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
exports.verifyAIWorkspace=async(win,{directory})=>{
 const run=s=>win.webContents.executeJavaScript(s),checks=[],check=(v,label)=>{assert(v,label);checks.push(label);};
 const before=await run('window.__cadTest.serialize()'),initial=JSON.parse(before);
 const compute=async(code,name='Analyseprüfung')=>run(`window.__cadTest.controller.analyze([{id:'measure',engine:'python',kind:'run',options:${JSON.stringify({code,name})}}])`);
 const helper='from formnaro.analysis import fit_circle\ndef diameter(points):\n    return fit_circle(points)["diameter"]\n';
 try{
  const cube={id:require('node:crypto').randomUUID(),kind:'mesh',name:'Offene Analysevorlage',color:'#8294aa',opacity:1,layerId:initial.layers[0].id,folderId:null,transform:[1,0,0,0,0,1,0,0,0,0,1,0,90,0,0,1],mesh:{verts:[-10,-10,0,10,-10,0,10,10,0,-10,10,0,-10,-10,20,10,-10,20,10,10,20,-10,10,20],triangles:[4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]}};
  await run(`window.__cadTest.controller.open(${JSON.stringify({...initial,nodes:[...initial.nodes,cube]})})`);await run('window.__cadTest.settled();window.__cadTest.controller.beginAITask()');
  const base=await run('window.__cadTest.serialize()'),undo=await run('window.__cadTest.undoDepth()');
  const science=await compute(`from formnaro import model, workspace
from formnaro.analysis import mesh, fit_circle, closest_surface
import numpy as np, scipy, shapely, sympy, networkx, trimesh, io, base64
from shapely.geometry import Polygon
from matplotlib.figure import Figure
p=await model.snapshot()
n=next(n for n in p['nodes'] if n['id']==${JSON.stringify(cube.id)})
m=mesh(n)
s=m.section(plane_normal=[0,0,1],plane_origin=[90,0,10])
loops=s.discrete
area=Polygon(loops[0][:,:2]).area
theta=np.linspace(0,2*np.pi,64,endpoint=False)
points=np.c_[3+2.5*np.cos(theta),-4+2.5*np.sin(theta)]
circle=fit_circle(points)
q,d,ids=closest_surface(m,[[101,0,10],[90,0,21]])
f=Figure();f.subplots().plot(points[:,0],points[:,1]);png=io.BytesIO();f.savefig(png,format='png')
await workspace.write_text('circle-plot.png.base64',base64.b64encode(png.getvalue()).decode())
await workspace.write_json('measured.json',{'size':m.extents.tolist(),'minimum':m.bounds[0].tolist(),'diameter':circle['diameter']})
saved=await workspace.save_tool('Kreis aus gemessenen Punkten',${JSON.stringify(helper)},'Kreisfit mit gemessenen Residuen; Eingabe: Nx2 Punkte.',['Kreis','Messung'])
await workspace.write_json('saved-tool.json',{'revision':saved['revision']})
x=sympy.Symbol('x')
result={'area':float(area),'diameter':circle['diameter'],'residual':circle['maximumResidual'],'open':not m.is_watertight,'distances':d.tolist(),'integral':int(sympy.integrate(x,(x,0,4))),'graph':networkx.number_connected_components(networkx.path_graph(5)),'pngBytes':len(png.getvalue()),'revision':saved['revision'],'libraries':[np.__version__,scipy.__version__,shapely.__version__,sympy.__version__,networkx.__version__,trimesh.__version__]}`);
  const measured=science.results[0].value.value;check(measured.open&&Math.abs(measured.area-400)<1e-7,'Trimesh/Shapely measure a complete section of an open original without repair');
  check(Math.abs(measured.diameter-5)<1e-9&&measured.residual<1e-9,'NumPy/SciPy recover circle dimensions and actual residuals');
  check(measured.distances.length===2&&measured.distances.every(d=>Math.abs(d-1)<1e-9),'Spatial nearest-surface query returns exact distances for tested points without rtree');
  check(measured.integral===8&&measured.graph===1&&measured.pngBytes>1000&&measured.libraries.length===6,'Symbolic algebra, graph analysis and offline plot rendering execute in Python');
  const imaging=await compute(`import PIL,io,importlib.metadata
from PIL import Image,ImageDraw,features
rows=[]
for fmt in ['PNG','JPEG','WEBP','TIFF']:
    image=Image.new('RGB',(32,24),(11,22,33))
    ImageDraw.Draw(image).text((1,1),'Test',fill=(200,0,0))
    encoded=io.BytesIO();image.save(encoded,format=fmt);encoded.seek(0)
    decoded=Image.open(encoded);decoded.load()
    assert decoded.size==(32,24) and decoded.mode=='RGB'
    rows.append({'format':fmt,'bytes':len(encoded.getvalue())})
result={'pillow':PIL.__version__,'metadata':importlib.metadata.version('pillow'),'setuptools':importlib.metadata.version('setuptools'),'formats':rows,'webp':features.version_module('webp'),'tiff':features.version_codec('libtiff')}`,'Gepatchte Bildverarbeitung prüfen');
  const im=imaging.results[0].value.value;check(im.pillow==='13.0.0'&&im.metadata==='13.0.0'&&im.setuptools==='84.2.1','Actual opaque Python imports patched Pillow 13 and setuptools 84.2.1, including matching wheel metadata');
  check(im.formats.length===4&&im.formats.every(f=>f.bytes>0)&&im.webp==='1.6.0'&&im.tiff==='4.7.2','Patched Pillow preserves PNG/JPEG/WebP/TIFF image and text roundtrips with updated WebP/TIFF libraries');
  const sentinel=path.join(directory,'host-sentinel.txt').replaceAll('\\','/');fs.writeFileSync(sentinel,'Host fixture remains unchanged');
  const boundary=await compute(`import js, pathlib
p=pathlib.Path(${JSON.stringify(sentinel)})
try:
    p.read_text()
    host_read=True
except OSError:
    host_read=False
p.parent.mkdir(parents=True,exist_ok=True)
p.write_text('Only WebAssembly memory changed')
result={'hostRead':host_read,'node':bool(js.Reflect.has(js.globalThis,'process')),'desktop':bool(js.Reflect.has(js.globalThis,'offlinecadDesktop')),'virtual':p.read_text()}`,'Isolation prüfen');
  const b=boundary.results[0].value.value;check(!b.hostRead&&!b.node&&!b.desktop&&b.virtual==='Only WebAssembly memory changed'&&fs.readFileSync(sentinel,'utf8')==='Host fixture remains unchanged','Scientific Python cannot read or alter a real host file, access Node or obtain the desktop bridge');
  check(await run('window.__cadTest.serialize()')===base&&await run('window.__cadTest.undoDepth()')===undo,'Numerical analysis, files and library saves preserve confirmed geometry and Undo');
  const reuse=await compute(`from formnaro import workspace
import numpy as np
saved=await workspace.read_json('saved-tool.json')
tool=await workspace.import_tool(saved['revision'])
t=np.linspace(0,2*np.pi,24,endpoint=False)
result={'diameter':tool.diameter(np.c_[6*np.cos(t),6*np.sin(t)]),'files':await workspace.list()}`,'Wiederverwendeter Kreisfit');
  check(Math.abs(reuse.results[0].value.value.diameter-12)<1e-8&&reuse.results[0].value.value.files.length>=3,'A separately executed Python program reuses persisted helper code with new measured parameters');
  const script=await run(`window.__cadTest.controller.analyze([{id:'js',engine:'javascript',kind:'run',options:{code:'const r=await api.query({engine:"workspace",kind:"files",options:{action:"read",path:"measured.json"}});return {diameter:JSON.parse(r).diameter};'}}])`);
  check(Math.abs(script.results[0].value.diameter-5)<1e-9,'JavaScript and Python share task measurement files');
  const large=await compute("result={'contourText':'measured '*4000,'points':[[i,i*i,0] for i in range(4000)]}",'Vollständiger großer Messbericht');
  const savedResult=large.results[0].value.workspaceResult,source=large.results[0].program;
  check(savedResult?.complete&&savedResult.characters>40000&&source?.path,'Large numerical results return complete local file references instead of a rejected measurement round');
  const selected=await compute(`from formnaro import workspace\nd=await workspace.read_json(${JSON.stringify(savedResult.path)})\ns=await workspace.read_text(${JSON.stringify(source.path)})\nresult={'count':len(d['value']['points']),'last':d['value']['points'][-1],'textLength':len(d['value']['contourText']),'sourceComplete':'range(4000)' in s}`,'Gezieltes Lesen ohne erneute Messung');
  const selectedValue=selected.results[0].value.value;check(selectedValue.count===4000&&selectedValue.last[1]===3999*3999&&selectedValue.textLength===36000&&selectedValue.sourceComplete,'A later real Python worker reads the entire original result and complete source without truncation or remeasurement');
  check(await run('window.__cadTest.serialize()')===base&&await run('window.__cadTest.undoDepth()')===undo,'Oversized result persistence and targeted summaries leave the open original and Undo unchanged');
  const code="from formnaro import model, workspace\nd=await workspace.read_json('measured.json')\np=model.box(*d['size'],origin=d['minimum'])\nh=model.cylinder(2,22,origin=(90,0,-1),hole=True)\nmodel.cut(p,h,alias='result')";
  const preview=await run(`window.__cadTest.access.preview({revision:window.__cadTest.access.scene().revision,commands:[{op:'python',name:'Gemessene CAD-Kopie',code:${JSON.stringify(code)}}],checks:[{kind:'solids',target:'$result',expected:1},{kind:'volume',target:'$result',expected:${8000-80*Math.PI},tolerance:.001}]})`);
  check(preview.verification.passed!==false&&preview.verification.checks.length===2,'Persisted measured dimensions drive real native CAD construction with independent volume and solid checks');
  check(await run('window.__cadTest.serialize()')===base,'Measured reconstruction remains an uncommitted preview');
  await run(`window.__cadTest.access.apply({previewId:${JSON.stringify(preview.previewId)},revision:${JSON.stringify(preview.revision)}})`);await run('window.__cadTest.settled()');
  check(await run('window.__cadTest.undoDepth()')===undo+1,'Reconstruction applies as exactly one Undo step');await run('window.__cadTest.controller.undo();window.__cadTest.settled()');check(await run('window.__cadTest.serialize()')===base,'Undo restores the open original and all unrelated parts exactly');
  let refused=false;try{await compute('from formnaro import model\nmodel.box(1,2,3)');}catch(e){refused=/Analyse darf nur messen/.test(e.message);}check(refused&&await run('window.__cadTest.serialize()')===base,'Read-only computation cannot mutate the model through the Python SDK');
  await run(`window.__analysisPending=window.__cadTest.controller.analyze([{id:'cancel',engine:'python',kind:'run',options:{code:${JSON.stringify('while True:\n    pass')}}}]).then(()=>({ok:true}),e=>({code:e.code,message:e.message}));void 0`);await new Promise(r=>setTimeout(r,600));await run('window.__cadTest.controller.cancel()');const cancelled=await run('window.__analysisPending');check(cancelled.code==='ABORTED','A numerical program without any RPC can be cancelled immediately');
  const tools=await run('window.offlinecadDesktop.aiToolLibrary({action:"search",search:"Kreis",limit:100})');check(tools.tools.some(t=>t.revision===measured.revision),'Named helper remains in the permanent desktop library after analysis and Undo');
  await run('window.__cadTest.aiUI.open()');await run("document.getElementById('ai-tool-library').open=true;void 0");await new Promise(r=>setTimeout(r,150));check(await run("document.getElementById('ai-tool-library').textContent.includes('gespeicherte Versionen')"),'Workshop lists persistent source versions through actual desktop IPC');
  fs.writeFileSync(path.join(directory,'analysis-tools.png'),(await win.webContents.capturePage()).toPNG());await run("document.getElementById('modal-close').click();window.__cadTest.controller.beginAITask();void 0");
  const empty=await run('window.__cadTest.controller.analyze([{id:"files",engine:"workspace",kind:"files",options:{action:"list"}}])');check(Array.isArray(empty.results[0].value)&&empty.results[0].value.length===0,'A new task clears transient measurement files while preserving reusable tools');
  fs.writeFileSync(path.join(directory,'analysis-proof.json'),JSON.stringify({ok:true,checks,measured,reuse:reuse.results[0].value.value,library:tools},null,2));
  checks.push(...await require('./ai-provider-tools-verification.cjs').verifyProviderTools(win,{directory,helperRevision:measured.revision}));
  return checks;
 }finally{await run(`window.__cadTest.controller.open(${before});window.__cadTest.settled()`);}
};
