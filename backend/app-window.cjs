const {installNavigationGuard}=require('./navigation-guard.cjs');
// One installer belongs to one BrowserWindow. The popup rule, the guarded
// reload wrapper and the close flush keep their flags and the originally
// bound reload for exactly that window's lifetime.
function installAppWindow(win,{entry,query}={}){
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const reloadWindow=win.reload.bind(win);let reloadPending=false;
  win.reload=()=>{
    if(reloadPending||win.isDestroyed())return;
    reloadPending=true;
    void win.webContents.executeJavaScript('window.__formnaroFlushRecovery?.() ?? true').then(saved=>{
      if(saved===true&&!win.isDestroyed())reloadWindow();
    }).catch(error=>console.error('Autosicherung beim Neuladen: '+error.message)).finally(()=>{reloadPending=false;});
  };
  let closeApproved=false,closePending=false;
  win.on('close',event=>{
    if(closeApproved||win.webContents.isLoadingMainFrame())return;
    event.preventDefault();
    if(closePending)return;
    closePending=true;
    win.webContents.executeJavaScript('window.__formnaroFlushRecovery?.() ?? true').then(saved=>{
      if(saved===true&&!win.isDestroyed()){closeApproved=true;win.close();}
    }).catch(error=>console.error('Autosicherung beim Schließen: '+error.message)).finally(()=>{closePending=false;});
  });
  installNavigationGuard(win,{entry,query});
}
module.exports={installAppWindow};
