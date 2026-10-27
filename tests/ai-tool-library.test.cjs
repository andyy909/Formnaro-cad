const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createToolLibrary}=require('../backend/ai-tool-library.cjs');
test('Complete reusable tools survive restart, deduplicate exact source and retain old versions',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-library-test-')),library=createToolLibrary(dir),tool={name:'Circle fit',language:'python',code:'def circle(points):\n    return points\n',description:'Measured circle fit',tags:['circles']};
 const a=library.request({action:'save',tool}),b=library.request({action:'save',tool});assert.equal(a.revision,b.revision);assert.equal(b.existing,true);
 const c=library.request({action:'save',tool:{...tool,code:tool.code+'# version two\n'}});assert.notEqual(c.revision,a.revision);
 const restarted=createToolLibrary(dir);assert.deepEqual(restarted.request({action:'read',revision:a.revision}).tool.code,tool.code);assert.equal(restarted.request({action:'list',limit:1}).nextOffset,1);assert.equal(restarted.request({action:'search',search:'CIRCLES'}).total,2);
 assert.equal(fs.readdirSync(dir).length,2);
});
test('Library cannot choose host paths, execute source, accept extra capabilities or trust altered source',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-library-test-')),library=createToolLibrary(dir),tool={name:'Untrusted source',language:'javascript',code:'throw new Error("Never execute while saving");'};
 const saved=library.request({action:'save',tool});assert.match(saved.tool.code,/Never execute/);assert.throws(()=>library.request({action:'read',revision:'../outside'}));assert.throws(()=>library.request({action:'save',tool:{...tool,path:'C:/private'}}));assert.throws(()=>library.request({action:'save',tool:{...tool,modules:JSON.parse('{"constructor":"x"}')}}));
 const file=path.join(dir,saved.revision+'.json'),changed=JSON.parse(fs.readFileSync(file));changed.tool.code='changed';fs.writeFileSync(file,JSON.stringify(changed));assert.throws(()=>library.request({action:'read',revision:saved.revision}),/Prüfsumme/);
});
