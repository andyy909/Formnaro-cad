const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
exports.verifyFreeCADRuntime=async(win,{directory})=>{
 const js=s=>win.webContents.executeJavaScript(s),checks=[],timings=[];
 function check(v,label){assert(v,label);checks.push(label);}
 const freecad=require('./freecad.cjs'),status=freecad.status();
 if(process.env.FORMNARO_VERIFY_CAD_RUNTIME_EXPECT_FAILURE==='1'){
  const before=await js('window.__cadTest.serialize()'),depth=await js('window.__cadTest.undoDepth()');
  const reply=await js("window.offlinecadDesktop.runFreeCADReply({requestId:crypto.randomUUID(),inspectOnly:true,script:{version:1,code:'measurements={}'}})");
  check(!reply.ok&&/CAD-Laufzeit.*beschädigt|CAD-Laufzeit.*fehlt/.test(reply.error),'Actual desktop IPC reports an incomplete or corrupt bundle without using external CAD');
  check(await js('window.__cadTest.serialize()')===before&&await js('window.__cadTest.undoDepth()')===depth,'Runtime failure preserves confirmed model and Undo');
  return checks;
 }
 check(status.available&&status.bundled&&!status.externalInstallation,'Packaged app selects its integrated runtime despite an external FreeCAD installation');
 check(path.resolve(status.executable).startsWith(path.resolve(process.resourcesPath)+path.sep),'Interpreter is inside the current portable program directory');
 const startupOnly=process.env.FORMNARO_VERIFY_CAD_RUNTIME_FAST_ONLY==='1';
 const start=performance.now(),proof=await require('./freecad-runtime.cjs').verifyRuntime(undefined,{startupOnly});
 timings.push({operation:startupOnly?'startup-core-integrity':'complete-runtime-integrity',ms:performance.now()-start,files:proof.files,bytes:proof.bytes});check(proof.ok,startupOnly?'Startup components match the manifest; complete package integrity is checked by the packager':'Every delivered CAD runtime file matches its manifest');
 for(const mode of ['normal','easy','solid','fusion']){
  await js(`window.__cadTest.workbenchUI.setMode(${JSON.stringify(mode)});void 0`);
  const before=await js('window.__cadTest.serialize()'),undo=await js('window.__cadTest.undoDepth()'),t=performance.now();
  // Native execution through the public desktop bridge and the established
  // controller command lifecycle (same path in all four workbench modes).
  const r=await freecad.run({inspectOnly:true,script:{version:1,gui:true,code:"import sys,FreeCADGui,ImportGui,Draft,PartDesign,Sketcher,Mesh,MeshPart,Surface,Import,TechDraw,Points,Spreadsheet\nmeasurements={'gui':bool(App.GuiUp),'python':sys.version,'prefix':sys.prefix,'freecad':App.getHomePath(),'draft':hasattr(Draft,'make_wire')}"}});
  timings.push({operation:mode+'-offscreen-gui',ms:performance.now()-t});
  const runtimeRootPhysical=fs.realpathSync(status.root),freecadHomePhysical=fs.realpathSync(r.measurements.freecad),homeRelative=path.relative(runtimeRootPhysical,freecadHomePhysical);
  const homeInsideRuntime=homeRelative===''||(!path.isAbsolute(homeRelative)&&homeRelative!=='..'&&!homeRelative.startsWith('..'+path.sep));
  fs.writeFileSync(path.join(directory,mode+'-runtime-paths.json'),JSON.stringify({mode,status,measurements:r.measurements,resourcesPath:process.resourcesPath,realpaths:{runtimeRoot:runtimeRootPhysical,freecadHome:freecadHomePhysical,executable:fs.realpathSync(status.executable),resources:fs.realpathSync(process.resourcesPath)},homeRelative,homeInsideRuntime,oldLexicalPrefix:r.measurements.freecad.toLowerCase().startsWith(status.root.toLowerCase())},null,2));
  check(r.measurements.gui&&r.measurements.draft&&homeInsideRuntime,mode+' uses bundled native/GUI modules without loading external FreeCAD');
  check(await js('window.__cadTest.serialize()')===before&&await js('window.__cadTest.undoDepth()')===undo,mode+' runtime analysis preserves the confirmed project and Undo');
  await js("(async()=>{const a=window.__cadTest;window.__runtimePreview=await a.access.preview({revision:a.access.scene().revision,label:'Integrierte CAD-Laufzeit',commands:[{op:'tool',engine:'freecad',as:'result',operation:{kind:'build',script:{version:1,code:'result=Part.makeBox(2,3,4)'}}}],checks:[{kind:'volume',target:'$result',expected:24,tolerance:.0001}]});})()");
  check(await js('window.__cadTest.serialize()')===before&&await js('window.__cadTest.undoDepth()')===undo,mode+' native model preview preserves confirmed geometry');
  await js('(async()=>{const a=window.__cadTest,p=window.__runtimePreview;await a.access.apply({previewId:p.previewId,revision:p.revision});await a.settled();})()');
  check(await js('window.__cadTest.undoDepth()')===undo+1,mode+' native Apply creates exactly one Undo');
  await js('window.__cadTest.actions.undo();void 0');await js('window.__cadTest.settled()');
  check(await js('window.__cadTest.serialize()')===before,mode+' Undo restores the exact original model');
 }
 fs.writeFileSync(path.join(directory,'runtime-proof.json'),JSON.stringify({ok:true,status,proof,checks,timings,cleanWindowsVerified:false,cloudRequests:0},null,2));
 fs.writeFileSync(path.join(directory,'integrated-runtime.png'),(await win.webContents.capturePage()).toPNG());
 return checks;
};
