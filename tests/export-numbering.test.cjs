const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {installFiles}=require('../backend/files.cjs');
async function fixture(){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'formnaro-numbering-')),sequenceFile=path.join(dir,'settings','export-series.json'),suggestions=[];let handler,mode='save',rename;
  const win={webContents:{}},ipcMain={handle:(_n,h)=>handler=h},dialog={showSaveDialog:async(_w,options)=>{suggestions.push(options.defaultPath);if(mode==='cancel')return {canceled:true};return {filePath:mode==='fail'?path.join(dir,'missing','a.stl'):rename??path.join(dir,path.basename(options.defaultPath))};}};
  const restart=()=>installFiles(win,{ipcMain,dialog,sequenceFile});restart();
  return {dir,suggestions,restart,setMode:v=>mode=v,setRename:v=>rename=v,save:(filename='Gehäuse5.stl',numbered=true)=>handler({sender:win.webContents},{filename,numbered,bytes:new Uint8Array([1,2,3])})};
}
test('Exports suggest the original name, then 2 through 5, and resume after restart',async()=>{
  const h=await fixture();for(let i=0;i<4;i++)assert.equal((await h.save()).value.saved,true);h.restart();await h.save();
  assert.deepEqual(h.suggestions.map(p=>path.basename(p)),['Gehäuse5.stl','Gehäuse52.stl','Gehäuse53.stl','Gehäuse54.stl','Gehäuse55.stl']);
  for(const file of h.suggestions)assert.deepEqual([...await fs.readFile(path.join(h.dir,path.basename(file)))],[1,2,3]);
});
test('Cancel and write failures do not consume a number; existing names are skipped',async()=>{
  const h=await fixture();h.setMode('cancel');assert.equal((await h.save('Teil.stl')).value.saved,false);h.setMode('fail');assert.equal((await h.save('Teil.stl')).ok,false);h.setMode('save');await h.save('Teil.stl');
  await fs.writeFile(path.join(h.dir,'Teil2.stl'),'keep');h.setMode('cancel');await h.save('Teil.stl');h.setMode('fail');await h.save('Teil.stl');h.setMode('save');await h.save('Teil.stl');
  assert.deepEqual(h.suggestions.map(p=>path.basename(p)),['Teil.stl','Teil.stl','Teil.stl','Teil3.stl','Teil3.stl','Teil3.stl']);assert.equal(await fs.readFile(path.join(h.dir,'Teil2.stl'),'utf8'),'keep');
});
test('Formats and names count separately; manual renames continue from the chosen base and folder',async()=>{
  const h=await fixture(),other=path.join(h.dir,'anderer Ordner');await fs.mkdir(other);
  h.setRename(path.join(other,'Eigener Name.stl'));await h.save('Teil.stl');h.setRename(undefined);await h.save('Teil.stl');await h.save('Teil.step');await h.save('Teil2.stl');
  assert.equal(h.suggestions[1],path.join(other,'Eigener Name2.stl'));assert.equal(h.suggestions[2],'Teil.step');assert.equal(h.suggestions[3],'Teil2.stl');
  await h.save('settings.json',false);await h.save('settings.json',false);assert.deepEqual(h.suggestions.slice(-2),['settings.json','settings.json']);
});
