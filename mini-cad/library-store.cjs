const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
exports.createLibrary=({root,directory,checkProject,checkImage})=>{
  const base=directory?path.resolve(directory):path.resolve(root,'Bibliothek-CAD');
  function ensure(){if(fs.existsSync(base)&&fs.lstatSync(base).isSymbolicLink())throw Error('Bibliotheksordner ist eine Verknüpfung.');fs.mkdirSync(base,{recursive:true});}
  function entry(id){if(typeof id!=='string'||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id))throw Error('Ungültiger Bibliothekseintrag.');ensure();const folder=path.join(base,id);if(fs.existsSync(folder)&&fs.lstatSync(folder).isSymbolicLink())throw Error('Bibliothekseintrag ist eine Verknüpfung.');return folder;}
  function read(folder,file,max){const target=path.join(folder,file),stat=fs.lstatSync(target);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>max)throw Error('Ungültige Bibliotheksdatei.');return fs.readFileSync(target);}
  function metadata(value){if(!value||typeof value.name!=='string'||!value.name.trim()||value.name.length>100||typeof value.folder!=='string'||value.folder.length>100||typeof value.favorite!=='boolean'||!Number.isFinite(value.saved))throw Error('Ungültiger Bibliotheksname oder Ordner.');return {name:value.name.trim(),folder:value.folder.trim(),favorite:value.favorite,saved:value.saved};}
  function write(file,data){fs.writeFileSync(file+'.tmp',data);fs.renameSync(file+'.tmp',file);}
  return {
    list(){ensure();const entries=[];let skipped=0;for(const d of fs.readdirSync(base,{withFileTypes:true})){if(!d.isDirectory()||d.name.startsWith('.'))continue;try{const dir=entry(d.name),meta=metadata(JSON.parse(read(dir,'meta.json',8192)));entries.push({id:d.name,...meta});}catch{skipped++;}}return {ok:true,entries,skipped};},
    async save({text,image,name,folder='',favorite=false}){
      await checkProject(text);const meta=metadata({name,folder,favorite,saved:Date.now()});
      if(typeof image!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image)||image.length>360000)throw Error('Ungültiges Vorschaubild.');
      const png=Buffer.from(image.slice(image.indexOf(',')+1),'base64');if(png.length<33||png.length>256*1024||png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||png.subarray(12,16).toString('ascii')!=='IHDR'||png.readUInt32BE(16)<1||png.readUInt32BE(20)<1||png.readUInt32BE(16)>512||png.readUInt32BE(20)>512)throw Error('Ungültiges PNG-Bild.');
      await checkImage(png);
      const id=randomUUID(),target=entry(id),temp=path.join(base,'.'+id);fs.mkdirSync(temp);fs.writeFileSync(path.join(temp,'model.fmcad'),text);fs.writeFileSync(path.join(temp,'preview.png'),png);fs.writeFileSync(path.join(temp,'meta.json'),JSON.stringify(meta));fs.renameSync(temp,target);return {ok:true,id};
    },
    async load(id){const text=read(entry(id),'model.fmcad',32*1024*1024).toString('utf8');await checkProject(text);return {ok:true,text};},
    thumbnail(id){const image=read(entry(id),'preview.png',256*1024);return {ok:true,image:'data:image/png;base64,'+image.toString('base64')};},
    update({id,name,folder,favorite}){const dir=entry(id),previous=metadata(JSON.parse(read(dir,'meta.json',8192))),meta=metadata({...previous,name,folder,favorite});write(path.join(dir,'meta.json'),JSON.stringify(meta));return {ok:true};},
  };
};
