// Run with Node. Optional argument is the actual packaged portable EXE.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {createProgramStore}=require('../backend/program-storage.cjs'),entries=require('../backend/program-data.json');
const root=path.resolve(__dirname,'../work/cad-v011');fs.mkdirSync(root,{recursive:true});const fixture=fs.mkdtempSync(path.join(root,'portable-native-')),directory=path.join(fixture,'portable-data'),output=path.join(fixture,'result.json');
createProgramStore(directory).initialize({'offlinecad-settings-v1':JSON.stringify({language:'de',theme:'dark',autosave:true}),'offlinecad-favorites-v1':'["cylinder"]'});
const legacyFiles=Object.entries(entries).filter(([,entry])=>entry.legacyMesh).map(([key,entry])=>{const file=path.join(directory,entry.file),bytes=Buffer.from('Intentionally invalid legacy mesh '+key);fs.writeFileSync(file,bytes);return {file,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};});
const appRoot=path.resolve(process.env.FORMNARO_TEST_APP_DIR||path.join(__dirname,'..'));
// Load the stage as an application directory so Electron uses its actual
// package version and the backend's real 0.11 CAD-only default policy.
const executable=process.argv[2]?path.resolve(process.argv[2]):require('electron'),args=process.argv[2]?['--verify-local='+output]:[appRoot,'--verify-local='+output];
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const log=fs.openSync(path.join(fixture,'process.log'),'w'),child=spawn(executable,args,{windowsHide:true,env,stdio:['ignore',log,log]});
const timer=setTimeout(()=>{child.kill();console.error('Native portable verification timed out. Local evidence directory: '+fixture);process.exitCode=1;},240000);
child.on('error',error=>{clearTimeout(timer);fs.closeSync(log);console.error('Native portable verifier could not launch: '+error.code);process.exitCode=1;});
child.on('exit',code=>{
  clearTimeout(timer);fs.closeSync(log);
  try{
    const report=JSON.parse(fs.readFileSync(output,'utf8'));assert.equal(code,0);assert.equal(report.ok,true);assert.equal(report.nativeCad,true);assert.equal(report.projectVersion,5);assert.equal(report.isolatedProfile,true);assert.ok(report.checks.includes('actual-python-mcp-toolnames-and-live-cad-schema'));
    const expectedVersion=process.argv[2]?'0.12.0':JSON.parse(fs.readFileSync(path.join(appRoot,'package.json'),'utf8')).version;assert.equal(report.appVersion,expectedVersion,'Native application has the wrong product version');
    assert.equal(report.ui.trustedNativeMouse,true);assert.equal(report.ui.controlledChooser,true);assert.equal(report.ui.files.length,7);
    for(const original of legacyFiles)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(original.file)).digest('hex'),original.sha256,'Old mesh fixture was modified');
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'autosicherung-v5.json'),'utf8')).version,5);assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'einstellungen.json'),'utf8')).theme,'dark');assert.equal(fs.readFileSync(path.join(directory,'favoriten.json'),'utf8'),'["cylinder"]');
    assert.equal(fs.existsSync(path.join(fixture,'offlinecad-verification-profile/ai-bridge.json')),false,'Local bridge descriptor not cleaned');
    report.existingMeshFilesUnchanged=true;report.retainedPreferencesAndFavorites=true;report.actualExecutable=path.basename(executable);fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({ok:true,nativeCad:true,checks:report.checks.length,projectVersion:5,evidence:output}));
  }catch(error){console.error('Native portable verification failed: '+error.message+'; evidence: '+fixture);process.exitCode=1;}
});
