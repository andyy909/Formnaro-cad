// The normal application entry is used identically by source and packaged checks.
const {spawnSync}=require('node:child_process'),path=require('node:path'),os=require('node:os'),fs=require('node:fs');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-unified-workflows-')),report=path.join(output,'result.json'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const result=spawnSync(require('electron'),[path.resolve(__dirname,'..'),'--verify-unified-workflows='+report],{stdio:'inherit',windowsHide:true,timeout:1500000,env});
if(result.error)console.error(result.error.message);if(result.status!==0)console.error(JSON.stringify({out:output,error:fs.existsSync(report)?JSON.parse(fs.readFileSync(report,'utf8')).error:'Verification process failed'}));
if(result.status===0){const target=process.env.FORMNARO_UNIFIED_WORKFLOWS_PROOF??path.resolve('work/unified-workflows/checks/source-unified.json');fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(report,target);}process.exit(result.status??1);
