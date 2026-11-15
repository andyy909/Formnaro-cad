const fs=require('node:fs'),path=require('node:path');

function atomic(file,data){
 const temp=path.join(path.dirname(file),'.formnaro-'+require('node:crypto').randomUUID()+'.tmp');let fd,created=false;
 try{fd=fs.openSync(temp,'wx',0o600);created=true;fs.writeFileSync(fd,data);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;fs.renameSync(temp,file);}
 finally{if(fd!==undefined)fs.closeSync(fd);if(created)fs.rmSync(temp,{force:true});}
}

module.exports={atomic};
