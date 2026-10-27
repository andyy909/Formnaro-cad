// Use the normal application entry, also exercised by the immutable EXE.
const {spawnSync}=require('node:child_process'),path=require('node:path'),os=require('node:os'),fs=require('node:fs');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-mesh-to-cad-')),report=path.join(output,'result.json'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const result=spawnSync(require('electron'),[path.resolve(__dirname,'..'),'--verify-mesh-to-cad='+report],{stdio:'inherit',windowsHide:true,timeout:1200000,env});
if(result.error)console.error(result.error.message);if(result.status!==0)console.error(JSON.stringify({out:output,error:fs.existsSync(report)?JSON.parse(fs.readFileSync(report,'utf8')).error:'Verification process failed'}));
if(result.status===0){const target=process.env.FORMNARO_MESH_TO_CAD_PROOF??path.resolve('work/mesh-to-cad/checks/source-transfer.json');fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(report,target);}process.exit(result.status??1);
