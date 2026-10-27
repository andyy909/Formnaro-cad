// The real application entry also runs this proof in the packaged executable.
const {spawnSync}=require('node:child_process'),path=require('node:path'),os=require('node:os'),fs=require('node:fs');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-cad-mesh-copy-')),report=path.join(output,'result.json');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const result=spawnSync(require('electron'),[path.resolve(__dirname,'..'),'--verify-cad-mesh-copy='+report],{stdio:'inherit',windowsHide:true,timeout:600000,env});
if(result.error)console.error(result.error.message);if(result.status!==0)console.error(JSON.stringify({out:output,error:fs.existsSync(report)?JSON.parse(fs.readFileSync(report,'utf8')).error:'Verification process failed'}));if(result.status===0){const target=process.env.FORMNARO_CAD_MESH_COPY_PROOF??path.resolve('work/cad-mesh-copy/checks/source-copy.json');fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(report,target);}process.exit(result.status??1);
