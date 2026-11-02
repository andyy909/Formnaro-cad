const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createToolLibrary}=require('../backend/ai-tool-library.cjs');
test('an application data-parent junction works but library and individual-file links remain forbidden',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-library-parent-')),physical=path.join(root,'physical'),parent=path.join(root,'regular-data');fs.mkdirSync(physical);fs.symlinkSync(physical,parent,process.platform==='win32'?'junction':'dir');
 const library=createToolLibrary(path.join(parent,'KI-Werkzeuge')),tool={name:'Native test',language:'python',code:'result = 1'};
 assert.equal(library.status().available,true);const saved=library.request({action:'save',tool});assert.equal(library.request({action:'read',revision:saved.revision}).tool.code,tool.code);assert.equal(fs.realpathSync(library.directory),library.directory);
 const redirected=path.join(root,'redirected');fs.mkdirSync(redirected);fs.symlinkSync(redirected,path.join(physical,'BadLibrary'),process.platform==='win32'?'junction':'dir');assert.equal(createToolLibrary(path.join(parent,'BadLibrary')).status().available,false);
 const original=path.join(library.directory,saved.revision+'.json'),outside=path.join(root,'outside.json');fs.copyFileSync(original,outside);fs.unlinkSync(original);fs.linkSync(outside,original);assert.throws(()=>library.request({action:'read',revision:saved.revision}),/Werkzeugdatei/);
});
