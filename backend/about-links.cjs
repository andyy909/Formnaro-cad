const links=require('./about-links.json');

function installAboutLinks(win,{ipcMain,shell}){
 ipcMain.handle('cad-about:open',async(event,key)=>{
  if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||
    typeof key!=='string'||!Object.hasOwn(links,key))return {ok:false,error:'Ungültiger Formnaro-Infodialog-Link.'};
  try{
   await shell.openExternal(links[key]);
   return {ok:true,value:true};
  }catch{
   return {ok:false,error:'Der Link konnte nicht geöffnet werden.'};
  }
 });
}
module.exports={installAboutLinks};
