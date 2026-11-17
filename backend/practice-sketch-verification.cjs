const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');

async function verifyPracticeSketchDraft({win,js,directory,before,checks}){
  const editing=process.env.FORMNARO_VERIFY_PRACTICE_SKETCH==='draft-edit';
  const sketch={version:2,kind:'profile',dimensions:{height:'5'},variables:[{name:'breite',value:'60'},{name:'tiefe',value:'40'}],
   elements:[
    {id:'draft-front-private',type:'line',start:['0','0'],end:['breite','0']},
    {id:'draft-right-private',type:'line',start:['breite','0'],end:['breite','tiefe']},
    {id:'draft-back-private',type:'line',start:['breite','tiefe'],end:['0','tiefe']},
    {id:'draft-left-private',type:'line',start:['0','tiefe'],end:['0','0']}
   ],loops:[{id:'draft-outer-private',role:'outer',elements:['draft-front-private','draft-right-private','draft-back-private','draft-left-private']}]};
  const {createCadDrawingSheet}=await import('../src/cad-drawing-data.js');
  const drawings={version:1,sheets:[createCadDrawingSheet({name:'Unbeteiligtes Blatt',sourceIds:[JSON.parse(before.serialized).nodes[0].id]})]};
  const root=await js(`(async()=>{
   const {controller,select,sketchUI,settled}=window.__cadTest;
   const sketch=${JSON.stringify(sketch)};
   let target;
   if(${editing}){
    const prepared=await controller.preview({kind:'batch',commands:[{op:'sketch',name:'Platte für Entwurfsübung',sketch}]});
    const id=prepared.project.nodes.find(node=>node.recipe?.type==='sketch').id;
    controller.apply({revision:prepared.revision,previewId:prepared.previewId});
    controller.apply(await controller.previewDrawings(${JSON.stringify(drawings)}));
    await settled();
    target={rootId:id,path:[]};select([target]);sketchUI.open(true);
   }else sketchUI.openPracticeDraft({sketch});
   const list=document.getElementById('sketch-profile-element');
   list.value='draft-right-private';list.dispatchEvent(new Event('change',{bubbles:true}));
   document.getElementById('sketch-profile-delete').click();
   return target?.rootId??null;
  })()`);
  const config={protocol:'chat',baseUrl:'http://127.0.0.1:9197/v1',model:'local-sketch-fixture',agentSteps:7,rememberKey:false,bridgeEnabled:false};
  await js(`window.offlinecadDesktop.saveAISettings({config:${JSON.stringify(config)},key:'local-fixture'})`);
  const projectState='(()=>{const a=window.__cadTest;return {serialized:a.serialize(),revision:a.controller.revision(),undo:a.undoDepth()};})()';
  const draftState='window.__cadTest.sketchUI.state()?.sketch';
  const original=await js(projectState),draft=await js(draftState);
  assert.equal(draft.elements.length,3);
  assert(!draft.loops[0].elements.includes('draft-right-private'));
  const openPath=await js("document.querySelector('#sketch-board .contour-open')?.getAttribute('d').trim()");
  assert.equal(openPath,'M 0 0 L 60 0 M 60 -40 L 0 -40 L 0 0','The draft view preserves the actual gap instead of drawing a false diagonal');
  let requests=0,failure;
  const originalFetch=global.fetch;
  const click=id=>({kind:'ui',action:'click',target:'ui:id:'+id});
  global.fetch=async(url,options)=>{
   try{
    assert.equal(new URL(url).host,'127.0.0.1:9197');
    const json=value=>new Response(JSON.stringify(value));
    if(String(url).endsWith('/models'))return json({data:[{id:config.model,input_modalities:['text']}]});
    const request=JSON.parse(options.body),system=request.messages[0].content;
    assert.match(system,/supplied draft already open/);
    assert.match(system,/"gapCount":1,"gaps":\[\{"role":"outer","from":\[60,0\],"to":\[60,40\],"distance":40\}\]/);
    assert.match(system,/"name":"breite","target":"ui:id:sketch-variable-value-1"/);
    const sent=JSON.stringify(request);
    assert(!sent.includes('draft-front-private'));
    if(root)assert(!sent.includes(root));
    requests++;
    return json({choices:[{message:{content:JSON.stringify({revision:original.revision,
     assistant:{kind:'practice',plan:{version:1,title:'Offenen Entwurf schließen',actions:[click('sketch-profile-close'),click('sketch-preview'),click('sketch-apply')]}},
     message:'Kontur in der Übung geschlossen.'
    })}}]});
   }catch(error){failure=error;throw error;}
  };
  const ready=(id)=>`(()=>{const n=document.getElementById('${id}');return !!n&&!n.hidden&&!n.disabled;})()`;
  async function until(expression,{error=false}={}){
   const deadline=Date.now()+70000;
   while(!await js(expression)){
    if(failure)throw failure;
    const status=await js("document.querySelector('#sketch-practice-status.ai-error')?.textContent||''");
    if(status&&!error)throw Error(status);
    if(Date.now()>deadline)throw Error(status||expression);
    await new Promise(resolve=>setTimeout(resolve,100));
   }
  }
  async function run(){
   await js(`(()=>{document.getElementById('sketch-practice').open=true;
    document.getElementById('sketch-practice-prompt').value='Hier ist die Kontur noch offen. Zeig mir, wie ich sie schließe.';
    document.getElementById('sketch-practice-start').click();})()`);
   await until(ready('sketch-practice-review'));
   assert.deepEqual(await js(projectState),original);
   assert.deepEqual(await js(draftState),draft);
   await js("document.getElementById('sketch-practice-review').click()");
   await until(ready('sketch-practice-apply'));
   if(editing)assert.match(await js("document.getElementById('sketch-practice-apply').textContent"),/Folgeänderungen/);
   assert.deepEqual(await js(projectState),original);
   assert.deepEqual(await js(draftState),draft);
  }
  try{
   await run();
   await js("document.getElementById('sketch-practice').scrollIntoView({block:'center'});void 0");
   fs.writeFileSync(path.join(directory,'sketch-draft-review.png'),await win.webContents.capturePage().then(image=>image.toPNG()));
   if(editing){
    await js("document.getElementById('sketch-practice-discard').click()");
    await until("document.getElementById('sketch-practice-apply').hidden");
    assert.deepEqual(await js(projectState),original);
    assert.deepEqual(await js(draftState),draft);
    await run();
   }else{
    const setWidth=value=>js(`(()=>{const field=document.getElementById('sketch-variable-value-1');field.value='${value}';field.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await setWidth('64');
    await js("document.getElementById('sketch-practice-apply').click()");
    await until("document.querySelector('#sketch-practice-status.ai-error')?.textContent.includes('Ausgangsskizze wurde geändert')",{error:true});
    assert.deepEqual(await js(projectState),original);
    assert.equal((await js(draftState)).variables[0].value,'64');
    await setWidth('60');
    await run();
   }
   await js("document.getElementById('sketch-practice-apply').click()");
   await until("!document.getElementById('modal').open");
   await js('window.__cadTest.settled()');
   const applied=await js(projectState);
   assert.notEqual(applied.revision,original.revision);
   assert.equal(applied.undo,original.undo+1);
   const appliedProject=JSON.parse(applied.serialized),originalProject=JSON.parse(original.serialized);
   const node=appliedProject.nodes.find(node=>root?node.id===root:node.recipe?.type==='sketch');
   assert(node);
   assert.deepEqual(appliedProject.nodes.filter(part=>part.id!==node.id),originalProject.nodes.filter(part=>part.id!==node.id));
   assert.deepEqual(appliedProject.drawings,originalProject.drawings);
   assert.equal(node.stats.solids,1);
   assert(Math.abs(node.stats.volume-12000)<.001);
   assert.equal(node.recipe.sketch.loops[0].elements.length,4);
   assert.deepEqual(node.recipe.sketch.elements.filter(element=>!element.id.startsWith('line-')),
    draft.elements.map(element=>({...element,construction:false})));
   assert.equal(requests,2);
   await js('window.__cadTest.actions.undo()');
   assert.equal((await js(projectState)).serialized,original.serialized);
   await js('window.__cadTest.actions.redo()');
   assert.equal((await js(projectState)).serialized,applied.serialized);
   checks.push('The real editor starts an isolated exercise with the existing open draft and only bounded diagnostics reach the provider',
    'The first plan visibly closes the existing gap; the draft and project remain unchanged through review',
    'Explicit acceptance produces one native 12000 mm³ solid and one reversible project step');
   if(editing)checks.push('Discard restores the parent editor without any project or draft change','An unrelated drawing remains byte-identical after explicit source acceptance');
   else checks.push('Editing only the original draft blocks acceptance even when the project revision is unchanged');
   return {ok:true,editing,requests,volume:node.stats.volume,checks};
  }finally{global.fetch=originalFetch;}
}

module.exports={verifyPracticeSketchDraft};
