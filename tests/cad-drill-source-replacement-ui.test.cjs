const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');

test('explicit replacement source requires all drill faces and repairs a lost stock through the real dialog',()=>{
 const root=path.resolve(__dirname,'..'),parent=path.join(root,'work','drill-source-replacement-ui');fs.mkdirSync(parent,{recursive:true});
 const directory=fs.mkdtempSync(path.join(parent,'run-')),report=path.join(directory,'result.json'),child=spawnSync(require('electron'),[path.join(__dirname,'fixtures','cad-drill-source-replacement-ui.cjs'),'--verify-maintenance='+report],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});
 assert.equal(child.status,0,child.error?.message??(fs.existsSync(report)?fs.readFileSync(report,'utf8'):child.stderr));
 const result=JSON.parse(fs.readFileSync(report,'utf8'));assert.equal(result.ok,true);assert.equal(result.isolatedProfile,true);assert.deepEqual(result.errors,[]);assert.deepEqual(result.external,[]);assert.equal(result.checks.length,13);
});
