const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
// The old test targeted the pre-CAD renderer API. Exercise the maintained native
// desktop fixtures through Electron, including real mouse/keyboard events.
const root=path.resolve(__dirname,'..');
const cases=[
 ['shape-dimensions','FORMNARO_DIMENSIONS_OUTPUT','shape-dimensions',r=>assert(r.checks.length>=5)],
 ['scale-dimensions','FORMNARO_SCALE_LABEL','cad-scale-dimensions',r=>{for(const k of ['escape','pointercancel','clickDimensions'])assert.equal(r[k],true,k);}],
 ['align','FORMNARO_ALIGN_LABEL','cad-align-performance',r=>{for(const k of ['visibleMouseControls','oneUndo','undoExact','closeRestoresManipulation'])assert.equal(r[k],true,k);}],
 ['align-markers','FORMNARO_MARKERS_LABEL','cad-align-markers',r=>{for(const k of ['cameraFollowing','narrowWindow','workplane','lockedReference','escape','singleSelectionCloses'])assert.equal(r[k],true,k);}]
];
for(const [name,variable,folder,verify]of cases)test('current native desktop scene controls: '+name,()=>{
 const label='suite-'+require('node:crypto').randomUUID(),directory=path.join(root,'work',folder,label),entry=path.join(root,'dist/index.html'),env={...process.env,[variable]:variable.endsWith('_OUTPUT')?directory:label,FORMNARO_DIMENSIONS_ENTRY:entry,FORMNARO_SCALE_APP_ENTRY:entry,FORMNARO_ALIGN_APP_ENTRY:entry,FORMNARO_MARKERS_ENTRY:entry};delete env.ELECTRON_RUN_AS_NODE;
 const p=spawnSync(require('electron'),[path.join(__dirname,'cad-app-'+name+'-desktop.cjs')],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:90000});
 const file=path.join(directory,'result.json');assert.equal(p.status,0,p.error?.message??(fs.existsSync(file)?fs.readFileSync(file,'utf8'):p.stderr));const result=JSON.parse(fs.readFileSync(file));assert.equal(result.ok,true);assert.deepEqual(result.errors,[]);assert.deepEqual(result.external,[]);verify(result);
});
