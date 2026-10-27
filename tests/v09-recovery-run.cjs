const {spawn,spawnSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=fs.mkdtempSync(path.resolve(__dirname,'../work/v09/recovery-')),profile=path.join(out,'profile'),electron=require('electron'),test=path.resolve(__dirname,'v09-recovery.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const child=spawn(electron,[test,profile,'writer'],{stdio:['ignore','pipe','pipe']}),log=fs.createWriteStream(path.join(out,'writer.log'));child.stdout.pipe(log);child.stderr.pipe(log);let exited=false;child.once('exit',()=>exited=true);
 for(let i=0;i<300&&!fs.existsSync(path.join(out,'crash-ready.json'));i++){if(exited)throw Error('Writer stopped before the crash checkpoint');await wait(100);}
 const ready=JSON.parse(fs.readFileSync(path.join(out,'crash-ready.json')));assert.equal(ready.pid,child.pid);assert.equal(path.resolve(ready.profile),path.resolve(profile));
 const killed=spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{encoding:'utf8'});assert.equal(killed.status,0,killed.stderr);await wait(600);
 const recovery=spawn(electron,[test,profile,'reader'],{stdio:'inherit'});await new Promise((r,j)=>recovery.once('exit',code=>code===0?r():j(Error('Recovery failed '+code))));console.log(fs.readFileSync(path.join(out,'result.json'),'utf8'));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
