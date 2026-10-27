const {spawn}=require('node:child_process'),path=require('node:path'),fs=require('node:fs');
const electron=require('electron');
const proof=process.env.FORMNARO_MINI_VERIFY_OUTPUT||path.join(__dirname,'../work/desktop');fs.mkdirSync(proof,{recursive:true});
const child=spawn(electron,[path.join(__dirname,'..'),'--mini-verify'],{env:{...process.env,FORMNARO_MINI_VERIFY_OUTPUT:path.resolve(proof)},stdio:'inherit'});child.on('exit',code=>process.exit(code??1));
