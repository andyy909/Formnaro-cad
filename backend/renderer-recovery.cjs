// Renderer loss must not leave the surviving host with an unusable white window.
// Recovery is a user action: no model command or provider request is replayed.
function installRendererRecovery(win,{dialog=require('electron').dialog,reload=()=>win.reload(),onIncident=()=>{}}={}){
 let recovering=false,disposed=false;
 const lost=async(_event,details)=>{
  if(disposed||recovering||win.isDestroyed()||details.reason==='clean-exit')return;
  recovering=true;
  try{
   onIncident({reason:String(details.reason),exitCode:details.exitCode});
   const choice=await dialog.showMessageBox(win,{type:'error',title:'Formnaro wiederherstellen',message:'Die Formnaro-Oberfläche wurde unerwartet beendet.',detail:'Ein anderes Programm kann den Darstellungsprozess beendet haben; auch ein interner Fehler ist möglich. Gespeicherte Projekte und Autosicherungen bleiben erhalten. Nicht gespeicherte Vorschauen können verloren sein. Der KI-Auftrag wird nicht automatisch erneut ausgeführt.',buttons:['Oberfläche wiederherstellen','Programm schließen'],defaultId:0,cancelId:1,noLink:true});
   if(disposed||win.isDestroyed())return;
   if(choice.response===0)await reload();else win.destroy();
  }catch(error){onIncident({recoveryError:String(error?.message||error)});}finally{recovering=false;}
 };
 win.webContents.on('render-process-gone',lost);
 win.once('closed',()=>{disposed=true;win.webContents.removeListener('render-process-gone',lost);});
 return {dispose(){disposed=true;win.webContents.removeListener('render-process-gone',lost);}};
}
module.exports={installRendererRecovery};
