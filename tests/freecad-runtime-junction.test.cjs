const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),sync=require('node:fs'),path=require('node:path');
const runtime=require('../backend/freecad-runtime.cjs');

test('A fresh managed runtime reached through a directory junction runs an isolated native measurement',async t=>{
 assert.equal(process.platform,'win32');
 const source=runtime.resolveRuntime();assert(source.available&&source.bundled,'Prepared managed runtime required for this Windows integration test');
 const parent=path.resolve('work/freecad-junction-regression');await fs.mkdir(parent,{recursive:true});const temporary=await fs.mkdtemp(path.join(parent,'case-'));
 assert.equal(path.dirname(temporary),parent);
 t.after(async()=>{const actual=await fs.realpath(temporary);assert.equal(path.dirname(actual),await fs.realpath(parent));assert(path.basename(actual).startsWith('case-'));await fs.rm(temporary,{recursive:true,force:true});});
 const physical=path.join(temporary,'physical-runtime'),moduleRoot=path.join(temporary,'linked-application');
 // A real copy has fresh inherited ACLs. A link to a runtime already used by
 // another test would hide the missing permission grant that caused the bug.
 await fs.cp(source.root,physical,{recursive:true});
 await fs.cp(path.resolve('backend'),path.join(moduleRoot,'backend'),{recursive:true});await fs.mkdir(path.join(moduleRoot,'freecad-runtime'),{recursive:true});await fs.symlink(physical,path.join(moduleRoot,'freecad-runtime/runtime'),'junction');
 const freecad=require(path.join(moduleRoot,'backend/freecad.cjs'));
 const result=await freecad.run({inspectOnly:true,script:{version:1,code:"measurements={'radius':Part.makeCircle(3.125).Curve.Radius}"}});
 assert.equal(result.measurements.radius,3.125);
 assert.equal(sync.realpathSync(freecad.status().executable),path.join(physical,'bin/FreeCADCmd.exe'));
});
