const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function sourceManifest(root=path.resolve(__dirname,'..')){
 const files=[];
 function visit(dir){for(const entry of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const name=dir+'/'+entry.name;if(entry.isDirectory()&&!['fonts','node_modules','__pycache__'].includes(entry.name))visit(name);else if(entry.isFile()&&/\.(?:cjs|mjs|js|css|json|py|md|txt|cs)$/.test(entry.name)){const bytes=fs.readFileSync(path.join(root,name));files.push({path:name,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}}}
 for(const dir of [...(fs.existsSync(path.join(root,'src'))?['src']:[]),...(fs.existsSync(path.join(root,'dist'))?['dist']:[]),'backend','ai'])visit(dir);
 for(const name of ['electron.cjs','preload.cjs','package.json'])files.push({path:name,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')});
 files.sort((a,b)=>a.path.localeCompare(b.path));
 return {hash:crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex'),files,scope:'Renderer/backend/tool definitions, adapter and package metadata. Not a hash of every installed native runtime binary.'};
}
module.exports={sourceManifest};
