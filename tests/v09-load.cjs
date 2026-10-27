const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=path.resolve(__dirname,'../work/v09/load');fs.mkdirSync(out,{recursive:true});const profile=fs.mkdtempSync(path.join(out,'profile-'));app.setPath('userData',profile);app.setPath('sessionData',profile);
app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,width:1500,height:950,webPreferences:{sandbox:true,contextIsolation:true,offscreen:true,backgroundThrottling:false}}),js=c=>w.webContents.executeJavaScript(c),fixture=JSON.parse(fs.readFileSync(path.resolve(out,'../exports/load-fixtures.json'))),report={};try{await w.loadFile(path.resolve(__dirname,'../dist/index.html'),{query:{test:'1'}});await js(`(async()=>{while(!window.__cadReady)await new Promise(r=>setTimeout(r,30));})()`);
 for(const [name,nodes]of Object.entries(fixture)){
  await js(`(()=>{const a=window.__cadTest;a.restore({nodes:${JSON.stringify(nodes)},bed:[200,200],planeZ:0,name:${JSON.stringify(name)}});a.select(a.snapshot().nodes.map(n=>n.id));a.actions.fit();})()`);
  const r=await js(`(async()=>{const a=window.__cadTest,start=performance.now();let ticks=0;const timer=setInterval(()=>ticks++,10);await a.groupAsync('union');clearInterval(timer);return {ms:performance.now()-start,ticks,sources:a.snapshot().nodes[0].children.length,triangles:a.snapshot().nodes[0].mesh.triangles.length/3,cache:a.renderCacheState()};})()`);assert.equal(r.sources,nodes.length);assert.ok(r.ticks>5);r.memory=app.getAppMetrics().map(m=>({type:m.type,memory:m.memory}));report[name]=r;
 }
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:true,...report},null,2));console.log(JSON.stringify(report,null,2));app.exit(0);
 }catch(e){console.error(e.stack);app.exit(1);}
});
