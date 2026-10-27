const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=process.argv.at(-1),request=JSON.parse(fs.readFileSync(path.join(root,'request.json'),'utf8'));
fs.writeFileSync(path.join(root,'started.txt'),String(process.pid));
if(request.options.mode==='smooth')setInterval(()=>{},1000);
else if(request.action==='analyse'){
 fs.writeFileSync(path.join(root,'response.json'),JSON.stringify({ok:true,version:2,engine:'0.10.0',analysis:{vertices:[[0,0,0],[1,0,0],[0,1,0]],faces:[[0,1,2]],regions:[{id:0,type:'PLANE',faces:[0]}],state:{labels:[0]},face_regions:[0]}}));
}
else{
 const bytes=Buffer.from('ISO-10303-21;\nfixture\nEND-ISO-10303-21;');fs.writeFileSync(path.join(root,'result.step'),bytes);
 const preview=Buffer.from('preview');fs.writeFileSync(path.join(root,'result.vorschau.stl'),preview);
 fs.writeFileSync(path.join(root,'response.json'),JSON.stringify({ok:true,version:2,engine:'0.10.0',report:{version:'0.10.0',valid:true,solids:1},step_sha256:request.options.mode==='exact'?'bad':crypto.createHash('sha256').update(bytes).digest('hex'),artifacts:{preview:{file:'result.vorschau.stl',size:preview.length,sha256:crypto.createHash('sha256').update(preview).digest('hex')}},deviation:{face_indices:[0],distances_mm:[.01],unit:'mm'}}));
}
