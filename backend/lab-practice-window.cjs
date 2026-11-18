const {spawn}=require('node:child_process');

function spawnHiddenChild(executable,args,options){
 return spawn(executable,[...args,'--formnaro-lab-background-practice'],{...options,windowsHide:true});
}

function installHiddenChild(win,install){
 // The invisible lab window still receives trusted events within its own
 // renderer. Only foreground-window focus checks are inapplicable here.
 win.webContents.once('did-finish-load',()=>win.webContents.focus());
 install({
  webContents:win.webContents,
  getContentBounds:()=>win.getContentBounds(),
  isDestroyed:()=>win.isDestroyed(),
  close:()=>win.close(),
  on(event,handler){if(event!=='blur')win.on(event,handler);},
 },{
  channel:{
   on:(event,handler)=>process.on(event,handler),
   send(message){if(message.type!=='focus-parent')process.send(message);},
   set exitCode(value){process.exitCode=value;},
  },
 });
}

module.exports={spawnHiddenChild,installHiddenChild};
