// Runs through the real opaque Python worker and ordinary native CAD commands.
exports.verifyAIAssistance=async(win,{directory}={})=>{
 const fs=require('node:fs'),path=require('node:path');
 const result=await win.webContents.executeJavaScript(String.raw`(async()=>{
 try { const cad=window.__cadTest.controller,checks=[],check=(v,m)=>{if(!v)throw Error(m);checks.push(m);},near=(a,b)=>a.every((v,i)=>Math.abs(v-b[i])<1e-5);
 document.getElementById("modal")?.close();await window.__cadTest.resetProject();await window.__cadTest.settled?.();
 const before=cad.serialize(),depth=cad.state().undo,empty=cad.snapshot().nodes.length===0,code='from formnaro import model\np=model.box(60,40,6)\nw=[model.box(60,6,24,origin=(0,y,6)) for y in (0,34)]\nh=model.cylinder_between(diameter=8,start=(30,41,18),end=(30,-1,18),overrun=.5,hole=True)\npart=model.cut(model.union(p,*w),h,alias="result")\nawait h.resize([10,10,43],anchor="center")';
 const p=await cad.preview({kind:'batch',commands:[{op:'python',code}]}),root=p.project.nodes[0],hole=root.children.find(n=>!n.solid);
 check(empty&&cad.serialize()===before&&cad.state().undo===depth,'New Python helpers only alter the candidate');
 const verified=await cad.checkPreview(p.previewId,[{kind:'volume',target:'$result',expected:31680-300*Math.PI,tolerance:.001},{kind:'solids',target:'$result',expected:1},{kind:'clearance',target:'$result',from:[30,-1,18],to:[30,41,18],diameter:10}]);
 check(verified.checks.length===3&&hole.recipe.type==='cylinder','Negative-direction segment cylinder and alias resize clear both walls with exact volume');
 cad.apply(p);const saved=cad.serialize();check(cad.state().undo===depth+1,'Helpers use one ordinary Apply and Undo');cad.undo();check(cad.serialize()===before,'Helper Undo is byte exact');cad.redo();check(cad.serialize()===saved,'Helper Redo is byte exact');
 const original=cad.snapshot(),placed=structuredClone(original);placed.nodes[0].transform=[-1.2,.2,0,0,.3,.8,.1,0,0,.15,1.1,0,12,20,8,1];await cad.open(placed);
 const address={rootId:root.id,path:[hole.id]},scene=await cad.describe(),old=scene.objects.find(n=>n.id===hole.id),centre=n=>[0,1,2].map(k=>n.worldMatrix[12+k]+[0,1,2].reduce((s,j)=>s+n.worldMatrix[j*4+k]*(n.localBounds.min[j]+n.localBounds.max[j])/2,0));
 const q=await cad.preview({kind:'batch',commands:[{op:'python',code:'from formnaro import model\nawait model.get('+JSON.stringify(address)+').resize([12,12,43])'}]}),changed=(await cad.describe(q.project)).objects.find(n=>n.id===hole.id);
 check(near(centre(old),centre(changed))&&JSON.stringify(q.project.nodes[0].transform)===JSON.stringify(placed.nodes[0].transform)&&changed.id===hole.id,'Nested resize preserves measured world centre, source ID and mirrored sheared parent');cad.discard(q.previewId);
 const locked=structuredClone(placed);locked.layers[0].locked=true;await cad.open(locked);const lockBefore=cad.serialize();let rejected=false;try{await cad.preview({kind:'batch',commands:[{op:'python',code:'from formnaro import model\nawait model.get('+JSON.stringify(address)+').resize([12,12,43])'}]});}catch(e){rejected=/gesperrt|geschützt/.test(e.message);}
 check(rejected&&cad.serialize()===lockBefore&&cad.state().previews===0,'Measured resize respects inherited locks and rolls back atomically');
 await cad.open(original);const data={ocad:cad.serialize()};for(const format of ['step','stl'])data[format]=Array.from((await cad.exportModel({format})).data);return {checks,data};
 }catch(e){return {error:e.message,stack:e.stack};}
 })()`);
 if(result.error)throw Error(result.error+"\n"+result.stack);
 for(const ext of ['ocad','step','stl'])fs.writeFileSync(path.join(directory,'python-assistance.'+ext),ext==='ocad'?result.data[ext]:Buffer.from(result.data[ext]));
 return result.checks;
};
