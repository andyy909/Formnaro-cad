// Runs only with an explicit verification flag, in a separate temporary profile.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
async function verifySharedAI(win,{directory,fixtures}){
  fixtures=path.join(__dirname,'../converter/examples');
 const checks=[],calls=[],js=code=>win.webContents.executeJavaScript(code),pause=ms=>new Promise(r=>setTimeout(r,ms));let mode='protect';
  const check=(value,label)=>{assert(value,label);checks.push(label);fs.writeFileSync(path.join(directory,'progress.json'),JSON.stringify({checks},null,2));};
  const until=async code=>{const start=Date.now();while(Date.now()-start<120000){if(await js(code))return;await pause(40);}throw Error('Timeout: '+code+'; Status: '+await js("document.getElementById(\"converter-status\")?.textContent"));};
  const click=id=>js(`document.getElementById(${JSON.stringify(id)}).click()`);
  const mock=http.createServer(async(req,res)=>{try{
    const chunks=[];for await(const c of req)chunks.push(c);res.setHeader('Content-Type','application/json');
    if(req.url.endsWith('/models'))return res.end(JSON.stringify({data:[{id:'shared-first'},{id:'shared-second'}]}));
    const body=JSON.parse(Buffer.concat(chunks)),system=body.instructions??body.messages[0].content,messages=body.input??body.messages,raw=typeof messages==='string'?messages:messages.at(-1).content,text=typeof raw==='string'?raw:raw[0].text,scene=JSON.parse(text.split('Current scene (data):\n')[1].split('\nUser task:\n')[0]),domain=system.includes('region assistant')?'converter':'cad';
    calls.push({domain,model:body.model,protocol:req.url.endsWith('responses')?'responses':'chat',scene,auth:req.headers.authorization});
    let answer=domain==='cad'?{message:'Gemeinsame Formnaro-API aktiv.'}:{revision:scene.revision,label:'Bereich schützen',commands:[{op:'protect',regions:[scene.regions?.[0]?.id??0],enabled:true}]};
    if(scene.phase==='settings')answer={revision:scene.revision,commands:[{op:'settings',mode:'auto',tolerance:scene.options.tolerance,repair:true,fallback:true}]};if(scene.phase==='regions')answer={revision:scene.revision,commands:[]};
    if(mode==='bad'&&domain==='converter')answer.commands=[{op:'delete',regions:[scene.regions[0].id]}];
    const reply=()=>{if(!res.destroyed)res.end(JSON.stringify(body.instructions?{output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(answer)}]}],usage:{input_tokens:100,output_tokens:30}}:{choices:[{message:{content:JSON.stringify(answer)}}],usage:{prompt_tokens:100,completion_tokens:30}}));};
    if(mode==='slow')setTimeout(reply,1200);else reply();
  }catch{res.statusCode=500;res.end('{}');}});await new Promise(r=>mock.listen(0,'127.0.0.1',r));
  try{
    await js(`window.offlinecadDesktop.saveAISettings({config:{protocol:'responses',baseUrl:'http://127.0.0.1:${mock.address().port}/v1',model:'shared-first',reasoningEffort:'high',rememberKey:false,bridgeEnabled:false},key:'shared-verification-only'})`);
    await js('window.__cadTest.aiUI.chat.refreshModels()');await until(`!document.getElementById('ai-chat-send').disabled`);
    await js(`document.getElementById('ai-chat-prompt').value='Verbindung erklären';document.getElementById('ai-chat-form').requestSubmit()`);await until(`!document.getElementById('ai-chat-send').disabled&&document.getElementById('ai-chat-log').textContent.includes('Gemeinsame Formnaro-API aktiv')`);
    check(calls.length===1&&calls[0].domain==='cad','Normal CAD chat uses the shared provider');
    await js('window.__cadTest.loadDemo()');await js('window.__cadTest.settled()');const original=await js('window.__cadTest.serialize()'),depth=await js('window.__cadTest.undoDepth()');
    const name='platte-mit-zwei-senkungen.stl',base64=fs.readFileSync(path.join(fixtures,name)).toString('base64');
    const open=async()=>{await js(`(()=>{const d=new DataTransfer();d.items.add(new File([Uint8Array.from(atob(${JSON.stringify(base64)}),c=>c.charCodeAt(0))],${JSON.stringify(name)}));const e=window.__cadTest.functionsUI.file;e.files=d.files;e.dispatchEvent(new Event('change'));})()`);await until(`window.__cadTest.functionsUI.state()?.regions>0&&!window.__cadTest.functionsUI.state().busy`);await js(`document.getElementById('converter-assistance').value='manual';document.getElementById('converter-assistance').dispatchEvent(new Event('change'));document.querySelector('#stl-regions tr').click();document.getElementById('converter-ai').open=true;`);};
    await open();check(await js(`!!document.getElementById('converter-ai-send')`),'Converter exposes AI beside existing region tools');
    await click('converter-ai-settings');await until(`!!document.getElementById('converter-ai-settings-root').querySelector('#ai-model')?.value`);check(await js(`document.getElementById('converter-ai-settings-root').querySelector('#ai-model').value==='shared-first'`),'Embedded settings read the existing Formnaro model');
    await js(`const r=document.getElementById('converter-ai-settings-root');r.querySelector('#ai-model').value='shared-second';r.querySelector('#ai-save-settings').click()`);await until(`window.offlinecadDesktop.getAISettings().then(s=>s.model==='shared-second'&&s.hasKey)`);check(await js(`document.getElementById('converter-ai-settings-root').querySelector('#ai-key').value===''`),'Empty key preserves shared credentials when changing the model');await click('converter-ai-settings');
    const baseline=await js(`document.getElementById('stl-regions').textContent`),undo=await js('window.__cadTest.functionsUI.state().undo');
    const send=async()=>{await until(`!document.getElementById('converter-ai-send').disabled`);await js(`document.getElementById('converter-ai-prompt').value='Schütze diesen Bereich';document.getElementById('converter-ai-send').click()`);};
    await send();await until(`window.__cadTest.functionsUI.state().ai.pending`);
    check(calls.at(-1).domain==='converter'&&calls.at(-1).model==='shared-second','Converter uses the model changed through common settings');check(calls[0].auth===calls.at(-1).auth,'CAD and converter use the same backend key');
    check(!/vertices|faces|labels|mesh_sha256|\.stl|api.?key/i.test(JSON.stringify(calls.at(-1).scene)),'Converter request contains region summaries without geometry, filenames or credentials');
    check(await js('window.__cadTest.serialize()')===original&&await js('window.__cadTest.undoDepth()')===depth,'AI preview preserves the entire confirmed CAD project and its history');
    check(await js(`document.getElementById('stl-regions').textContent`)===baseline&&await js('window.__cadTest.functionsUI.state().undo')===undo,'Native candidate preview leaves confirmed region corrections unchanged');
    check(await js(`document.getElementById('converter-ai-commands').textContent.includes('schützen')&&!document.getElementById('converter-ai-commands').textContent.includes('\"op\"')`),'Converter proposals explain changes in plain language');
    check(await js(`!document.getElementById('converter-ai-apply').disabled&&!document.getElementById('converter-ai-apply').hidden&&document.getElementById('converter-run').disabled`),'Explicit AI Apply is enabled while conversion is blocked');
    await click('converter-ai-discard');check(await js(`document.getElementById('stl-regions').textContent`)===baseline,'Discard restores region display without accepting the candidate');
    await send();await until(`window.__cadTest.functionsUI.state().ai.pending`);await click('converter-ai-apply');
    check(await js('window.__cadTest.functionsUI.state().undo')===undo+1,'Confirmed AI corrections create one region Undo');check(await js(`document.getElementById('stl-regions').textContent`)!==baseline,'Explicit Apply changes the protected region');
    await click('stl-undo');await until(`!window.__cadTest.functionsUI.state().busy`);check(await js(`document.getElementById('stl-regions').textContent`)===baseline,'Existing native region Undo restores the exact original correction');
    await click('stl-redo');await until(`!window.__cadTest.functionsUI.state().busy`);check(await js(`document.getElementById('stl-regions').textContent`)!==baseline,'Existing native region Redo restores the AI correction');await click('stl-undo');await until(`!window.__cadTest.functionsUI.state().busy`);
    mode='bad';await send();await until(`document.getElementById('converter-ai-status').textContent.includes('Unbekannter')`);check(await js(`document.getElementById('stl-regions').textContent`)===baseline&&!await js('window.__cadTest.functionsUI.state().ai.pending'),'A foreign CAD command is rejected without region or project changes');
    mode='slow';await send();await until(`window.__cadTest.functionsUI.state().ai.busy`);await click('converter-ai-cancel');await pause(1500);check(!await js('window.__cadTest.functionsUI.state().ai.pending')&&await js(`document.getElementById('stl-regions').textContent`)===baseline,'Cancelled delayed provider replies cannot become previews');
    mode='protect';await send();await until(`window.__cadTest.functionsUI.state().ai.pending`);await js(`window.__cadTest.mutate(p=>{p.name='Changed during converter preview';})`);await js('window.__cadTest.settled()');check(!await js('window.__cadTest.functionsUI.state().ai.pending'),'A changed project invalidates the pending converter AI proposal');
    await click('stl-close');await until(`!document.getElementById('modal').open`);await js(`document.getElementById('ai-chat-prompt').value='Gemeinsame Auswahl bestätigen';document.getElementById('ai-chat-form').requestSubmit()`);await until(`!document.getElementById('ai-chat-send').disabled`);check(calls.at(-1).domain==='cad'&&calls.at(-1).model==='shared-second','CAD chat immediately reuses the model saved inside the converter');
    await open();await js(`document.getElementById('converter-ai').open=true;`);await send();await until(`window.__cadTest.functionsUI.state().ai.pending`);
    await js(`document.getElementById('converter-ai-apply').scrollIntoView({block:'center'})`);await pause(150);check(await js(`(()=>{const e=document.getElementById('converter-ai-apply'),r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===e;})()`),'AI Apply is visible and reachable in the converter');
    fs.writeFileSync(path.join(directory,'shared-ai.png'),(await win.webContents.capturePage()).toPNG());check(await js(`document.getElementById('converter-ai').getBoundingClientRect().width>200`),'Shared AI proposal is rendered in the normal converter surface');await click('stl-close');await until(`window.__cadTest.functionsUI.state().disposed`);check(!await js('window.__cadTest.functionsUI.state().ai.pending'),'Closing the converter discards its AI proposal');
    const settings=await js('window.offlinecadDesktop.getAISettings()');check(settings.model==='shared-second'&&settings.hasKey&&!JSON.stringify(settings).includes('shared-verification-only'),'The public settings expose availability without the shared secret');

    // Reuse the existing project, as a real import does. Replacing the selected demo
    // here would exercise unrelated whole-project replacement during the fixture setup.
    // Normal user import entry: no region picks or intermediate buttons.
    const autoOriginal=await js('window.__cadTest.serialize()'),autoDepth=await js('window.__cadTest.undoDepth()');
    const openAuto=async()=>{
      await js(`(()=>{const d=new DataTransfer();d.items.add(new File([Uint8Array.from(atob(${JSON.stringify(base64)}),c=>c.charCodeAt(0))],${JSON.stringify(name)}));const e=document.getElementById('import-file');e.files=d.files;e.dispatchEvent(new Event('change'));})()`);
      await until(`document.getElementById('import-kind')&&document.getElementById('import-confirm')`);
      await js(`document.getElementById('import-kind').value='cad';document.getElementById('import-kind').dispatchEvent(new Event('change'));document.getElementById('import-assistance').value='with';document.getElementById('import-confirm').click()`);
    };
    mode='protect';const autoStart=calls.length;await openAuto();
    await until(`window.__cadTest.functionsUI.state()?.projectPreview&&!window.__cadTest.functionsUI.state().busy`);
    const autoCalls=calls.slice(autoStart);
    check(autoCalls[0].scene.phase==='settings'&&autoCalls.some(c=>c.scene.phase==='regions'),'Mit KI automatically requests settings and all region pages');
    check(autoCalls.filter(c=>c.scene.phase==='regions').reduce((n,c)=>n+c.scene.regions.length,0)===autoCalls[0].scene.overview.regionCount,'Automatic planning covers every region without manual selection');
    check(await js('window.__cadTest.serialize()')===autoOriginal&&await js('window.__cadTest.undoDepth()')===autoDepth,'Automatic native conversion and CAD preview leave project and history unchanged');
    check(await js(`!document.getElementById('converter-apply').disabled&&!document.getElementById('converter-apply').hidden&&document.getElementById('converter-ai-send').hidden`),'Only final Apply/Discard is needed; manual proposal button is hidden');
    check(await js(`document.getElementById('converter-auto-usage').textContent.length>0&&document.getElementById('converter-result').textContent.includes('CAD-Flächen')`),'Automatic workflow displays actual token usage and native conversion report');
    await js('window.__cadTest.view.renderReady()');await pause(300);fs.writeFileSync(path.join(directory,'automatic-cad-preview.png'),(await win.webContents.capturePage()).toPNG());
    await click('converter-discard');check(await js('window.__cadTest.serialize()')===autoOriginal&&!await js('window.__cadTest.functionsUI.state().projectPreview'),'Discard keeps the project and the computed converter result');
    await click('converter-import');await until(`window.__cadTest.functionsUI.state()?.projectPreview&&!window.__cadTest.functionsUI.state().busy`);await click('converter-apply');await until(`window.__cadTest.functionsUI.state()?.sourceApplied&&!window.__cadTest.functionsUI.state().busy`);
    check(await js('window.__cadTest.undoDepth()')===autoDepth+1&&await js('window.__cadTest.serialize()')!==autoOriginal,'Explicit final Apply adds exactly one CAD history entry');
    await click('stl-close');await js('window.__cadTest.actions.undo()');await js('window.__cadTest.settled()');check(await js('window.__cadTest.serialize()')===autoOriginal,'One Undo restores exact project before automatic import');
    mode='slow';await openAuto();await until(`window.__cadTest.functionsUI.state()?.automatic?.busy`);await click('converter-cancel');await until(`!window.__cadTest.functionsUI.state()?.busy`);await pause(1300);
    check(!await js('window.__cadTest.functionsUI.state().hasResult')&&await js('window.__cadTest.serialize()')===autoOriginal,'Cancelling the automatic provider stage cannot produce or commit a late result');
    await click('stl-close');mode='protect';
    return {ok:true,checks,calls:calls.map(({auth,scene,...rest})=>({...rest,regionSummary:!!scene.regions})),cloudRequests:0,syntheticProviderOnly:true};
  }finally{mock.closeAllConnections();await new Promise(r=>mock.close(r));}
}
module.exports={verifySharedAI};
