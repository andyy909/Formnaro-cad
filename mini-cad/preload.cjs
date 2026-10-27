const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('miniBridge',{
  restore:()=>ipcRenderer.invoke('mini:restore'),
  autosave:text=>ipcRenderer.invoke('mini:autosave',text),
  settings:value=>ipcRenderer.invoke('mini:settings',value),
  saveProject:(name,text)=>ipcRenderer.invoke('mini:save-project',{name,text}),
  openProject:()=>ipcRenderer.invoke('mini:open-project'),
  openSTL:()=>ipcRenderer.invoke('mini:open-stl'),
  saveExport:(name,buffer,format='stl')=>ipcRenderer.invoke('mini:save-stl',{name,buffer,format}),
  libraryList:()=>ipcRenderer.invoke('mini:library-list'),
  librarySave:value=>ipcRenderer.invoke('mini:library-save',value),
  libraryLoad:id=>ipcRenderer.invoke('mini:library-load',id),
  libraryThumbnail:id=>ipcRenderer.invoke('mini:library-thumbnail',id),
  libraryUpdate:value=>ipcRenderer.invoke('mini:library-update',value),
  libraryLocation:()=>ipcRenderer.invoke('mini:library-location'),
  chooseLibraryFolder:()=>ipcRenderer.invoke('mini:library-choose'),
  resetLibraryFolder:()=>ipcRenderer.invoke('mini:library-default'),
  onClose:callback=>ipcRenderer.on('mini:closing',()=>callback()),
  closeReady:error=>ipcRenderer.send('mini:close-ready',error),
});

const aiCall=async(name,args)=>{const r=await ipcRenderer.invoke('cad-ai:'+name,args);if(!r.ok)throw Object.assign(Error(r.error),{code:r.code,feedback:r.feedback,aiUsage:r.aiUsage,aiRetryable:r.aiRetryable});return r.value;};
contextBridge.exposeInMainWorld('offlinecadDesktop',{
 getAISettings:()=>aiCall('get'),saveAISettings:v=>aiCall('save',v),getAIModels:v=>aiCall('models',v),selectAIProvider:v=>aiCall('provider',v),selectAIModel:v=>aiCall('model',v),selectAIEffort:v=>aiCall('effort',v),generateAI:v=>aiCall('generate',v),testAI:()=>aiCall('test'),cancelAI:v=>aiCall('cancel',v),
 onAIRequest:fn=>ipcRenderer.on('cad-ai:request',(_e,v)=>{Promise.resolve(fn(v.method,v.args)).then(value=>ipcRenderer.send('cad-ai:reply',{id:v.id,value}),e=>ipcRenderer.send('cad-ai:reply',{id:v.id,error:e.message,errorCode:e.code,feedback:e.feedback}));})
});
