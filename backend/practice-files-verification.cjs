const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');

async function verifyPracticeFilesChat({js,directory,checks,before,parentSnapshot,variant}){
 const recovery=variant==='recover';
 const adopt=recovery||variant==='adopt';
 const config={protocol:'chat',baseUrl:'http://127.0.0.1:9197/v1',model:'local-practice-fixture',agentSteps:7,rememberKey:false,bridgeEnabled:false};
 const png=await js(`(()=>{const c=document.createElement('canvas');c.width=40;c.height=30;return c.toDataURL();})()`);
 const privateStl='solid isolated-mesh-marker\nendsolid isolated-mesh-marker\n';
 let requests=0,fixtureFailure;
 const originalFetch=global.fetch;
 global.fetch=async(url,options)=>{
  try{
   assert.equal(new URL(url).host,'127.0.0.1:9197');
   const json=value=>new Response(JSON.stringify(value));
   if(String(url).endsWith('/models'))return json({data:[{id:config.model,input_modalities:['text','image']}]});
   const request=JSON.parse(options.body),system=request.messages[0].content;
   assert.match(system,/"target":"ui:id:practice-file-1","name":"Foto.png","kind":"photo"/);
   assert.match(system,/"target":"ui:id:practice-file-2","name":"Netz.stl","kind":"stl"/);
   const sent=JSON.stringify(request);
   assert(sent.includes(png),'Only explicitly selected photo image sent');
   assert(!sent.includes(Buffer.from(privateStl).toString('base64'))&&!sent.includes('isolated-mesh-marker'),'STL contents never sent');
   assert(!sent.includes(JSON.parse(before.serialized).nodes[0].id),'Parent body IDs remain local');
   const click=id=>({kind:'ui',action:'click',target:'ui:id:'+id});
   const set=(id,value)=>({kind:'ui',action:'set',target:'ui:id:'+id,value:String(value)});
   const point=(x,y)=>[set('photo-point-x',x),set('photo-point-y',y),click('photo-add-point')];
   const calibrate=[set('photo-mm',50),...point(4,4),...point(24,4),click('photo-save')];
   let actions=[click('practice-file-1'),...(adopt?calibrate:[click('photo-cancel')])];
   if(recovery){
    if(requests===0)actions=[{kind:'shape',type:'box',as:'work'},click('practice-file-1'),click('photo-save')];
    else{
     const user=request.messages.at(-1).content;
     const correction=user.find(part=>part.type==='text').text;
     if(requests!==1)fs.writeFileSync(path.join(directory,'unexpected-correction.txt'),correction);
     assert.equal(requests,1,'Only one correction requested');
     assert.match(system,/"selectable":\["work"\]/);
     assert.match(correction,/"failedAction":\{"index":3,"kind":"ui","target":"ui:id:photo-save"/);
     assert.match(correction,/"confirmedCount":2/);
     assert.match(correction,/"exerciseRevision":"[a-f0-9]{16}"/);
     assert.match(correction,/ui:id:photo-point-x/);
     assert.match(correction,/"modelImage":"attached"/);
     const screenshot=user.find(part=>part.type==='image_url'&&part.image_url.url.startsWith('data:image/jpeg;base64,'));
     assert(screenshot,'Correction carries an actual child screenshot');
     const jpg=Buffer.from(screenshot.image_url.url.split(',')[1],'base64');
     assert(jpg.length>2000&&jpg[0]===0xff&&jpg[1]===0xd8);
     fs.writeFileSync(path.join(directory,'correction-window.jpg'),jpg);
     fs.writeFileSync(path.join(directory,'correction-feedback.txt'),correction);
     actions=[...calibrate,{kind:'select',targets:['work']},{kind:'set',field:'size-0',value:44}];
    }
   }
   requests++;
   return json({choices:[{message:{content:JSON.stringify({revision:before.state.revision,
    assistant:{kind:'practice',plan:{version:1,title:'Übungsdatei öffnen',actions}},message:'Dateiübung abgeschlossen.'
   })}}]});
  }catch(error){fixtureFailure=error;throw error;}
 };
 try{
  await js(`window.offlinecadDesktop.saveAISettings({config:${JSON.stringify(config)},key:'local-fixture'})`);
  await js('window.__cadTest.aiUI.chat.refreshModels()');
  await js(`(async()=>{
   const input=document.getElementById('ai-chat-practice-file-input'),transfer=new DataTransfer();
   const photo=Uint8Array.from(atob(${JSON.stringify(png.split(',')[1])}),character=>character.charCodeAt(0));
   transfer.items.add(new File([photo],'Foto.png',{type:'image/png'}));
   transfer.items.add(new File([${JSON.stringify(privateStl)}],'Netz.stl',{type:'model/stl'}));
   input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  const limit=Date.now()+100000;
  async function until(expression){
   while(!await js(expression)){
    if(fixtureFailure)throw fixtureFailure;
    if(Date.now()>limit)throw Error(await js("document.getElementById('ai-chat-status').textContent")||expression);
    await new Promise(resolve=>setTimeout(resolve,100));
   }
  }
  await until("document.querySelectorAll('#ai-chat-practice-file-list button').length===2&&!document.getElementById('ai-chat-send').disabled");
  await js(`(()=>{
   if(${adopt}){
    window.__cadTest.select([]);
    document.getElementById('ai-chat-practice-from-project').click();
   }
   document.getElementById('ai-chat-prompt').value='Zeig mir das Foto im Übungsfenster.';
   document.getElementById('ai-chat-form').requestSubmit();
  })()`);
  await until("!window.__cadTest.aiUI.isBusy()&&document.getElementById('ai-chat-log').textContent.includes('Dateiübung abgeschlossen.')");
  assert.equal(requests,recovery?2:1);
  assert.equal(await js("document.querySelectorAll('#ai-chat-practice-file-list button').length"),0);
  const after=await js(parentSnapshot);
  assert.equal(after.serialized,before.serialized);
  assert.deepEqual(after.visiblePreviewRoots,before.visiblePreviewRoots);
  checks.push('Normal chat stages explicit photo and STL files and starts the isolated practice',
   'Simulated provider receives the photo and both descriptors, with no STL payload or parent IDs',
   adopt?'Photo saved in the child with no body selected in the parent':'Child opens the real photo dialog and closes it without saving');
  if(adopt){
   await js("window.__cadTest.clearPreview();document.getElementById('ai-chat-practice-review').click()");
   await until("!document.getElementById('cad-ai-preview-banner').hidden&&!window.__cadTest.aiUI.isBusy()");
   assert.match(await js("document.getElementById('ai-chat-proposal').textContent"),/Geändert · Fotos/);
   assert.equal(await js('window.__cadTest.serialize()'),before.serialized);
   assert.equal(await js('window.__cadTest.undoDepth()'),before.state.undo);
   await js("document.getElementById('cad-ai-preview-apply').click()");
   await until("document.getElementById('cad-ai-preview-banner').hidden&&!window.__cadTest.aiUI.isBusy()");
   assert.equal(await js('window.__cadTest.undoDepth()'),before.state.undo+1);
   const applied=await js('window.__cadTest.serialize()');
   const project=JSON.parse(applied);
   const originals=JSON.parse(before.serialized).nodes;
   assert.deepEqual(project.nodes.filter(node=>originals.some(original=>original.id===node.id)),originals);
   assert.equal(project.nodes.length,originals.length+(recovery?1:0));
   if(recovery){
    const part=project.nodes.find(node=>!originals.some(original=>original.id===node.id));
    const native=await js(`window.__cadTest.controller.describe()`);
    const size=native.objects.find(node=>node.id===part.id).worldBounds.size;
    assert(Math.abs(size[0]-44)<.001,'The body created before the failure still exists and is 44 mm wide');
    checks.push('Failed photo save reports actual fields and a JPEG from the retained child window',
     'Second provider plan uses the still-open dialog and existing alias without repeating successful actions');
   }
   assert.equal(project.photos.items[0].image.dataUrl,png);
   assert.deepEqual(project.photos.items[0].reference.scale.points,[[4,4],[24,4]]);
   await js('window.__cadTest.actions.undo()');
   assert.equal(await js('window.__cadTest.serialize()'),before.serialized);
   await js('window.__cadTest.actions.redo()');
   assert.equal(await js('window.__cadTest.serialize()'),applied);
   checks.push('Adoption preview identifies photos and preserves the parent until confirmed',
    'One Undo step transfers the original photo and calibration, and Redo restores it');
  }
  return {ok:true,checks,requests};
 }finally{global.fetch=originalFetch;}
}

module.exports={verifyPracticeFilesChat};
