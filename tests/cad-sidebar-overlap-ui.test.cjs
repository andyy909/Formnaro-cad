const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
test('mode switches keep long object trees clear of footer controls and expose associative hole editing',()=>{
 const root=path.resolve(__dirname,'..'),base=path.join(root,'work/sidebar-overlap-ui');fs.mkdirSync(base,{recursive:true});const directory=fs.mkdtempSync(path.join(base,'run-')),report=path.join(directory,'result.json'),env={...process.env,PYTHONDONTWRITEBYTECODE:'1'};delete env.ELECTRON_RUN_AS_NODE;
 const child=spawnSync(require('electron'),[path.join(__dirname,'fixtures/cad-sidebar-overlap-ui.cjs'),'--verify-maintenance='+report],{cwd:root,env,encoding:'utf8',windowsHide:true,timeout:90000});
 assert.equal(child.status,0,child.error?.message??(fs.existsSync(report)?fs.readFileSync(report,'utf8'):child.stderr));const result=JSON.parse(fs.readFileSync(report));assert.equal(result.ok,true);assert.equal(result.isolatedProfile,true);assert.deepEqual(result.errors,[]);assert.deepEqual(result.external,[]);assert.equal(result.checks.length,10);
});
