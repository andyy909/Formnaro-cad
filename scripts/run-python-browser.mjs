import {spawn} from 'node:child_process';
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const p=spawn('node_modules/electron/dist/electron.exe',['tests/python-browser.cjs'],{stdio:'inherit',windowsHide:true,env});
p.on('error',error=>{console.error(error);process.exitCode=1;});
p.on('exit',code=>process.exitCode=code??1);
