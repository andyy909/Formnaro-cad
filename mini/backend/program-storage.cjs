const fs=require('node:fs');exports.writeAtomicSync=(file,data)=>{const tmp=file+'.tmp';fs.writeFileSync(tmp,data);fs.renameSync(tmp,file);};
