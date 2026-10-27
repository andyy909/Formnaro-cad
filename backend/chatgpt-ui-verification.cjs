// Runs only inside the explicit, isolated AI verification profile. Never signs in.
const fs=require('node:fs'),path=require('node:path');
exports.verifyChatGPTUI=async function(win,{directory}){
 const checks=[],run=code=>win.webContents.executeJavaScript(code),check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 const previous=await run('window.offlinecadDesktop.getAISettings()'),before=await run('window.__cadTest.serialize()');
 try{
  await run("window.offlinecadDesktop.selectAIProvider({providerId:'chatgpt'})");
  const status=await run('window.offlinecadDesktop.getChatGPTStatus()');check(!status.connected&&!status.pending,'New isolated profile requires explicit ChatGPT sign-in');
  const settings=await run('window.offlinecadDesktop.getAISettings()');check(settings.authMode==='chatgpt'&&settings.protocol==='responses'&&settings.baseUrl==='https://api.openai.com/v1'&&!settings.hasKey,'Abo profile selects public Responses without reusing API key');
  check(!JSON.stringify(settings).includes('access_token')&&!JSON.stringify(settings).includes('refresh_token'),'IPC returns account status without credential fields');
  const models=await run('window.offlinecadDesktop.getAIModels({refresh:true})');check(!models.hasKey&&models.models.length===0,'Signed-out ChatGPT does not invent available account models');
  await run(`(async()=>{const root=document.createElement('div');root.id='chatgpt-verification-root';root.style.cssText='position:fixed;inset:25px;z-index:99999;background:white;color:#20374a;overflow:auto;padding:24px;max-width:680px;border:1px solid #ccc;border-radius:12px';document.body.append(root);await window.__cadTest.aiUI.mountSettings(root);})()`);
  check(await run("!document.getElementById('ai-chatgpt-settings').hidden&&!document.getElementById('ai-chatgpt-login').disabled&&document.getElementById('ai-chatgpt-login').textContent==='Continue with ChatGPT'"),'Settings expose explicit browser sign-in button');
  check(await run("['ai-key','ai-base','ai-output-tokens','ai-protocol','ai-effort'].every(id=>document.getElementById(id).closest('label').getBoundingClientRect().height===0)&&document.getElementById('ai-budget-note').getBoundingClientRect().height===0"),'Abo settings hide API secrets, endpoint edits and unsupported token cap');
  await run("window.offlinecadDesktop.selectAIModel({model:'not-entitled-fixture'})");
  const result=await run("window.offlinecadDesktop.generateAIReply({requestId:'chatgpt-fixture',prompt:'Hallo',scene:{revision:'fixture'},context:{},chat:true})");check(!result.ok&&/anmelden/.test(result.error),'Sending while signed out fails locally without cloud request');
  win.setSize(1000,680);await run("document.getElementById('ai-chatgpt-login').scrollIntoView({block:'center'})");
  check(await run("(()=>{const r=document.getElementById('ai-chatgpt-login').getBoundingClientRect();return r.width>100&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})()"),'ChatGPT sign-in is reachable at minimum window size');
  fs.writeFileSync(path.join(directory,'chatgpt-settings.png'),(await win.webContents.capturePage()).toPNG());
  await run("document.getElementById('chatgpt-verification-root').remove()");
  await run('window.offlinecadDesktop.selectAIProvider('+JSON.stringify({providerId:previous.providerId})+')');
  const restored=await run('window.offlinecadDesktop.getAISettings()');check(restored.model===previous.model&&restored.baseUrl===previous.baseUrl&&restored.hasKey===previous.hasKey,'Switching back preserves original API model and key state');
  check(await run('window.__cadTest.serialize()')===before,'Account controls and refused generation preserve exact CAD project');
  return checks;
 }finally{await run("document.getElementById('chatgpt-verification-root')?.remove()");await run('window.offlinecadDesktop.selectAIProvider('+JSON.stringify({providerId:previous.providerId})+')');}
};
