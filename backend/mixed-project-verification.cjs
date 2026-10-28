const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');

// Run only in an isolated verification window. UI imports/edits and original
// project/export IPCs are exercised with deterministic file dialogs.
async function verifyMixedProject(win,{directory,files}={}){
 const checks=[],js=code=>win.webContents.executeJavaScript(code),proof=async(name,code)=>{await js(`(async()=>{window.__mixedPhase=${JSON.stringify(name)};const a=window.__cadTest;const check=(ok,message)=>{if(!ok)throw Error(message);};${code}})()`);checks.push(name);};
 fs.mkdirSync(directory,{recursive:true});
 await proof('mixed-real-ui-imports-open-and-closed-triangles',`
  await a.resetProject();await a.addShape('box');await a.settled();
  const p=window.__mixed={native:a.getModel().nodes[0],checks:[]};
  const closed={v:[[0,0,0],[20,0,0],[0,20,0],[0,0,20]],t:[[0,2,1],[0,1,3],[1,2,3],[2,0,3]]},open={v:[[0,0,0],[20,0,0],[0,20,0]],t:[[0,1,2]]};
  p.wait=async fn=>{const start=Date.now();while(!fn()){if(Date.now()-start>20000)throw Error('UI timeout: '+document.getElementById('import-status')?.textContent);await new Promise(r=>setTimeout(r,25));}};
  p.import=async(data,name,cancel=false)=>{const rows=['solid test'];for(const t of data.t){rows.push('facet normal 0 0 1','outer loop',...t.map(i=>'vertex '+data.v[i].join(' ')),'endloop','endfacet');}rows.push('endsolid test');const file=new File([rows.join('\\n')],name,{type:'model/stl'}),transfer=new DataTransfer();transfer.items.add(file);const input=document.getElementById('import-file');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));await p.wait(()=>document.getElementById('modal').open&&!!document.getElementById('import-kind'));check(document.getElementById('import-kind').querySelector('option[value="mesh"]'),'mesh choice missing');document.getElementById('import-kind').value='mesh';document.getElementById('import-kind').dispatchEvent(new Event('change',{bubbles:true}));if(cancel){document.getElementById('import-cancel').click();return;}const count=a.getModel().nodes.length;document.getElementById('import-confirm').click();await p.wait(()=>a.getModel().nodes.length===count+1&&!document.getElementById('modal').open);await a.settled();};
  await p.import(closed,'Geschlossen.stl');await p.import(open,'Offen.stl');check(a.getModel().version===8,'mixed format missing');check(a.getModel().nodes.filter(n=>n.kind==='mesh').length===2,'mesh roots missing');check(JSON.stringify(a.getModel().nodes[0])===JSON.stringify(p.native),'CAD source changed');
  const scene=a.getScene();check(scene.objects.some(n=>n.objectType==='openMesh')&&scene.objects.some(n=>n.objectType==='closedMesh'),'type classification missing');check(a.view.groups.bodies.children.length===3,'shared viewport missing');
 `);
 await proof('mixed-inspector-transform-color-and-shared-undo-redo',`
  const p=window.__mixed;const meshes=a.getModel().nodes.filter(n=>n.kind==='mesh');
  p.edit=async(id,value)=>{const input=document.getElementById(id);input.value=value;if(input.onchange)await input.onchange();else input.dispatchEvent(new Event('change',{bubbles:true}));await p.wait(()=>!a.controller.state().busy&&!a.controller.state().worker.running&&!input.dataset.commitPending);await a.settled();};
  for(const [i,n]of meshes.entries()){a.select([{rootId:n.id,path:[]}]);await p.edit('pos-0',i?-45:45);await p.edit('object-color',i?'#ed6a48':'#079ca9');}
  const before=a.serialize(),undo=a.undoDepth();a.select([{rootId:meshes[0].id,path:[]}]);await p.edit('size-0','24');const after=a.serialize();check(after!==before&&a.undoDepth()===undo+1,'mesh dimension history');await a.actions.undo();check(a.serialize()===before,'mesh undo');await a.actions.redo();check(a.serialize()===after,'mesh redo');check(JSON.stringify(a.getModel().nodes[0])===JSON.stringify(p.native),'unrelated native changed');p.mixed=after;
 `);
 await proof('mixed-preview-cancel-stale-apply-and-locks',`
  const p=window.__mixed,before=a.serialize(),undo=a.undoDepth(),draft=a.getModel();draft.nodes[2].transform[13]+=5;
  const proposal=await a.controller.preview(undefined,{project:draft});await a.showPreview(proposal);check(a.serialize()===before&&a.undoDepth()===undo,'preview changed confirmed state');a.cancel();let rejected=false;try{a.controller.apply(proposal);}catch(e){rejected=e.code==='UNKNOWN_PREVIEW';}check(rejected&&a.serialize()===before,'cancelled result applied');
  const stale=await a.controller.preview(undefined,{project:draft});await a.mutate(d=>{d.name='Gemeinsames Prüfprojekt';});let staleRejected=false;try{a.controller.apply(stale);}catch(e){staleRejected=e.code==='STALE_REVISION';}check(staleRejected,'stale result applied');
  const mesh=a.getModel().nodes[1];a.select([{rootId:mesh.id,path:[]}]);await a.mutate(d=>{d.nodes[1].locked=true;});check(document.getElementById('pos-0').disabled,'locked inspector');await a.actions.undo();check(!a.getModel().nodes[1].locked,'lock undo');
 `);
 await proof('mixed-import-cancel-keeps-complete-project',`
  const p=window.__mixed,before=a.serialize(),undo=a.undoDepth();await p.import({v:[[0,0,0],[10,0,0],[0,10,0]],t:[[0,1,2]]},'Abbruch.stl',true);check(a.serialize()===before&&a.undoDepth()===undo,'cancel mutated');
 `);
 await proof('mixed-delayed-import-rejects-cancel-and-source-revision-change',`
  const make=()=>{const file=new File(['solid p\\nfacet normal 0 0 1\\nouter loop\\nvertex 0 0 0\\nvertex 20 0 0\\nvertex 0 20 0\\nendloop\\nendfacet\\nendsolid p'],'Verzögert.stl'),read=file.arrayBuffer.bind(file);let release;file.arrayBuffer=async()=>{await new Promise(r=>release=r);return read();};return {file,release:()=>release()};};
  const before=a.serialize(),cancelled=make();let active=true;const pending=a.importFile(cancelled.file,{asMesh:true,current:()=>active});active=false;cancelled.release();let abort=false;try{await pending;}catch(e){abort=e.name==='AbortError';}check(abort&&a.serialize()===before,'delayed cancelled import committed');
  const stale=make(),request=a.importFile(stale.file,{asMesh:true});await a.mutate(d=>{d.name+=' · Zwischenänderung';});const changed=a.serialize();stale.release();let rejected=false;try{await request;}catch(e){rejected=e.code==='STALE_REVISION';}check(rejected&&a.serialize()===changed,'delayed stale import committed');await a.actions.undo();
 `);
 files.save=path.join(directory,'Gemischt.ocad');
 await proof('mixed-normal-project-save-ipc',`const saved=await a.save({saveAs:true});check(saved.saved,'save IPC');window.__mixed.saved=a.serialize();`);
 const saved=fs.readFileSync(files.save,'utf8'),savedModel=JSON.parse(saved);assert.equal(savedModel.version,8);assert.equal(savedModel.nodes.length,3);checks.push('mixed-physical-file-version-and-all-three-objects');
 await proof('mixed-normal-open-ipc-retains-sources-and-view',`
  const p=window.__mixed,saved=p.saved,camera=a.workspace().view;await a.resetProject();const opened=a.openProject();await new Promise(r=>setTimeout(r,30));document.getElementById('project-change-discard')?.click();await opened;await a.settled();check(a.serialize()===saved,'file reopen lost data');check(JSON.stringify(a.getModel().nodes[0])===JSON.stringify(p.native),'reopen lost BRep');check(a.workspace().view.position.every((v,k)=>Math.abs(v-camera.position[k])<1e-6),'reopen view');
 `);
 for(const format of ['3mf','glb','gltf','obj','stl','step']){
  const result=await js(`window.__cadTest.exportModel(${JSON.stringify(format)})`);const file=path.join(directory,'exports','Gemeinsames Prüfprojekt.'+result.extension);assert.ok(fs.statSync(file).size>30,format+' physical file');checks.push('mixed-normal-export-ipc-'+format);
 }
 await proof('mixed-autosave-keeps-prior-cad-namespace',`
  const p=window.__mixed,old=a.storage.getItem('offlinecad-autosave-v7');await p.wait(()=>!!a.storage.getItem('offlinecad-autosave-v8'));const saved=JSON.parse(a.storage.getItem('offlinecad-autosave-v8'));check(saved.version===8&&JSON.stringify(saved.nodes)===JSON.stringify(JSON.parse(a.serialize()).nodes),'mixed autosave geometry missing');check(old&&a.storage.getItem('offlinecad-autosave-v7')===old&&JSON.parse(old).version!==8,'old CAD autosave overwritten');
  p.final=a.serialize();
 `);
 const image=path.join(directory,'mixed-scene.png');await js('window.__cadTest.view.fit();window.__cadTest.view.invalidate();');await new Promise(r=>setTimeout(r,100));fs.writeFileSync(image,(await win.webContents.capturePage()).toPNG());
 const legacy={format:'OfflineCAD',version:1,name:'Altes Netzprojekt',bed:[200,200],planeZ:4,ruler:null,nodes:[{id:'legacy-box',type:'box',name:'Erhaltene Netzquelle',color:'#418db6',size:[20,10,8],pos:[30,-12,7],rot:[0,0,30],mirror:[1,1,1],solid:true,hidden:false,locked:true,segments:32,notes:'Originalparameter'}]};
 const oldFile=path.join(directory,'Altes-Netzprojekt.ocad'),oldBytes=JSON.stringify(legacy),compressed=require('node:zlib').gzipSync(Buffer.from(oldBytes));fs.writeFileSync(oldFile,compressed);files.save=oldFile;
 await proof('mixed-legacy-open-uses-mesh-worker-and-keeps-original-recipes',`
  const pending=a.openProject();await new Promise(r=>setTimeout(r,30));document.getElementById('project-change-discard')?.click();await pending;await a.settled();const model=a.getModel();check(model.version===8&&model.nodes[0].kind==='mesh','legacy import');check(model.nodes[0].locked&&model.nodes[0].meshSource.node.notes==='Originalparameter','legacy metadata/source');check(model.migrationSource.data===${JSON.stringify(oldBytes)},'original legacy project lost');check(a.activeProjectFile()===null,'legacy file is writable as original');
 `);
 files.save=path.join(directory,'Netzprojekt-Gemeinsam.ocad');await proof('mixed-migration-saves-new-file-via-normal-ipc',`const saved=await a.save();check(saved.saved,'migration save');`);
 assert.deepEqual(fs.readFileSync(oldFile),compressed);assert.equal(JSON.parse(fs.readFileSync(files.save,'utf8')).version,8);checks.push('mixed-gzip-old-project-file-byte-identical-after-new-save');
 const oldCadFile=path.join(directory,'CAD5-Original.ocad'),originalCad={...savedModel,version:5,nodes:[savedModel.nodes[0]]};delete originalCad.migrationSource;delete originalCad.workspace;fs.writeFileSync(oldCadFile,JSON.stringify(originalCad));files.save=oldCadFile;
 await proof('mixed-opens-and-saves-existing-cad5-before-upgrade',`const pending=a.openProject();await new Promise(r=>setTimeout(r,30));document.getElementById('project-change-discard')?.click();await pending;await a.settled();check(a.getModel().version===5,'CAD5 compatibility');await a.save();check(a.activeProjectFile().projectVersion===5,'original file version lost');`);
 const cadBefore=fs.readFileSync(oldCadFile);files.save=path.join(directory,'CAD5-Gemeinsam.ocad');
 await proof('mixed-first-cad5-upgrade-forces-new-save-dialog',`const p=window.__mixed;await p.import({v:[[0,0,0],[20,0,0],[0,20,0]],t:[[0,1,2]]},'Neue-Netzfläche.stl');check(a.getModel().version===8,'CAD5 upgrade');await a.save();check(a.activeProjectFile().name==='CAD5-Gemeinsam.ocad','original CAD file overwritten');`);
 assert.deepEqual(fs.readFileSync(oldCadFile),cadBefore);checks.push('mixed-original-cad5-file-byte-identical-after-upgrade');
 return {ok:true,checks,projectFile:files.save,screenshot:image};
}
function verificationDialogs(directory){
 const files={save:path.join(directory,'Gemischt.ocad')};
 const projectDialog={showSaveDialog:async()=>({filePath:files.save}),showOpenDialog:async()=>({filePaths:[files.save]})};
 const exportDialog={showSaveDialog:async(_win,options)=>{const dir=path.join(directory,'exports');fs.mkdirSync(dir,{recursive:true});return {filePath:path.join(dir,path.basename(options.defaultPath))};}};
 return {files,projectDialog,exportDialog};
}
module.exports={verifyMixedProject,verificationDialogs};
