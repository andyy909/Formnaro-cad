import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {cadExclusion,copyBenchmarkSources} from '../scripts/portable-runtime-policy.mjs';

function temporary(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-benchmark-package-'));
 t.after(()=>{assert.equal(path.dirname(fs.realpathSync(root)),fs.realpathSync(os.tmpdir()));assert(path.basename(root).startsWith('formnaro-benchmark-package-'));fs.rmSync(root,{recursive:true,force:true});});
 return root;
}
test('Portable package contains every pinned renderer source needed by all frozen benchmark suites',t=>{
 const source=fileURLToPath(new URL('../',import.meta.url)),stage=temporary(t),copied=copyBenchmarkSources(source,stage);
 assert.deepEqual(copied.sort(),['cad-agent-ui-policy','cad-ai-analysis','cad-ai-result-checks','cad-bore-check-native','cad-drill-stock-native','cad-drawing-data','cad-drawing-measure','cad-geometry-digest','cad-geometry-ref','cad-practice-controls','cad-practice-model-ui','cad-service'].map(n=>'src/'+n+'.js').sort());
 for(const suite of ['benchmark-core-v1.json','benchmark-advanced-v2.json','benchmark-guided-v1.json'])for(const entry of JSON.parse(fs.readFileSync(path.join(source,'ai',suite))).dependencies.filter(e=>e.path.startsWith('src/'))){
  const bytes=fs.readFileSync(path.join(stage,entry.path));assert.deepEqual(bytes,fs.readFileSync(path.join(source,entry.path)));assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);
 }
 assert.equal(fs.existsSync(path.join(stage,'src/cad-main.js')),false);
});
test('Advanced drawing measurements load from the portable main-process layout',async t=>{
 const source=fileURLToPath(new URL('../',import.meta.url)),stage=temporary(t);
 copyBenchmarkSources(source,stage);
 fs.writeFileSync(path.join(stage,'package.json'),JSON.stringify({type:'module'}));
 const evaluator=path.join(stage,'backend','ai-benchmark-advanced-evaluate.cjs');
 fs.mkdirSync(path.dirname(evaluator));
 fs.copyFileSync(path.join(source,'backend','ai-benchmark-advanced-evaluate.cjs'),evaluator);
 const {evaluateAdvanced}=(await import(pathToFileURL(evaluator).href)).default;
 const original={id:'body',name:'Aufgabenteil'},project={nodes:[original,{id:'guard'}]};
 const {checks}=await evaluateAdvanced({id:'advanced-08'},{project},{
  project,scene:{objects:[{id:'body',target:{path:[]},kind:'cad',solid:true,solids:1}]}
 },null,{ok:true,steps:[{observation:{}}]});
 assert.ok(checks.some(c=>c.name==='Mindestens drei gültige geometrisch verknüpfte Maße'));
 assert.ok(!checks.some(c=>c.name==='Native Gegenprüfung ausführbar'));
});
test('Wrong, conflicting or escaping benchmark pins fail before any source is copied',t=>{
 const root=temporary(t),source=path.join(root,'source'),stage=path.join(root,'stage');fs.mkdirSync(path.join(source,'ai'),{recursive:true});fs.mkdirSync(path.join(source,'src'));fs.writeFileSync(path.join(source,'src/a.js'),'a');fs.writeFileSync(path.join(source,'src/b.js'),'b');
 const pin={path:'src/a.js',sha256:createHash('sha256').update('a').digest('hex')};
 const manifests=(first,second)=>{for(const [name,dependencies] of [['core-v1',first],['advanced-v2',second],['guided-v1',[pin]]])fs.writeFileSync(path.join(source,'ai','benchmark-'+name+'.json'),JSON.stringify({dependencies}));};
 manifests([pin,{path:'src/b.js',sha256:'0'.repeat(64)}],[pin]);assert.throws(()=>copyBenchmarkSources(source,stage),/Benchmark source changed/);assert.equal(fs.existsSync(stage),false);
 manifests([pin],[{...pin,sha256:'0'.repeat(64)}]);assert.throws(()=>copyBenchmarkSources(source,stage),/Conflicting benchmark source pin/);
 manifests([{...pin,path:'src/../../escape.js'}],[]);assert.throws(()=>copyBenchmarkSources(source,stage),/Invalid benchmark source pin/);assert.equal(fs.existsSync(stage),false);
});
test('Portable CAD omits developer inputs but preserves native/Python/GUI functionality and license notices',()=>{
 for(const name of ['sources/freecad_source_1.1.4.tar.gz','bin/python311.pdb','lib/cmake/vtk/VTKConfig.cmake','include/tool.h','lib/Qt6Core.prl','lib/qt6/bin/lupdate.exe','lib/qt6/moc.exe','Mod/Fem/femtest.py','Mod/BIM/Arch.py','Mod/CAM/Path/Main.py','bin/Lib/test/test_math.py','bin/Lib/site-packages/numpy/tests/test_public_api.py','data/examples/Part.FCStd','Mod/Draft/drafttests/test_make.py','Mod/Part/parttests/test_box.py','bin/Lib/tkinter/test/test_widgets.py','bin/Lib/idlelib/idle_test/test_edit.py'])assert(cadExclusion(name),name);
 for(const name of ['bin/FreeCAD.exe','bin/FreeCADCmd.exe','bin/python311.dll','lib/Part.pyd','bin/Qt6Core.dll','lib/qt6/uic.exe','lib/qt6/rcc.exe','bin/Lib/site-packages/cffi/api.py','share/doc/third-party/LICENSE.txt','doc/LICENSE.html','bin/Lib/unittest/__init__.py','bin/Lib/site-packages/numpy/testing/__init__.py','Mod/Draft/InitGui.py','Mod/PartDesign/Init.py','Mod/TechDraw/Init.py'])assert.equal(cadExclusion(name),null,name);
});

test('Core executables, OpenBLAS forwarder target and software GPU fallback survive the deep profile',()=>{
 for(const file of ['bin/FreeCAD.exe','bin/freecadcmd.exe','bin/python.exe','bin/python3.dll','bin/openblas.dll','bin/opengl32sw.dll','bin/MSVCP140.dll','lib/Part.pyd','lib/Sketcher.pyd'])assert.equal(cadExclusion(file),null,file);
 for(const file of ['bin/libclang-13.dll','bin/gmsh.dll','bin/Lib/site-packages/OCC/Core/gp.py','bin/Lib/site-packages/scipy/__init__.py','Mod/Plot/Plot.py','lib/qt6/bin/Qt6Core.dll'])assert(cadExclusion(file),file);
});
