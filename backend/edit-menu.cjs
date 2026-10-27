function editMenuTemplate(params,language='de'){
  const en=language==='en',flags=params.editFlags||{};
  if(params.isEditable)return [
    {role:'undo',label:en?'Undo':'Rückgängig',enabled:!!flags.canUndo},
    {role:'redo',label:en?'Redo':'Wiederholen',enabled:!!flags.canRedo},
    {type:'separator'},
    {role:'cut',label:en?'Cut':'Ausschneiden',enabled:!!flags.canCut},
    {role:'copy',label:en?'Copy':'Kopieren',enabled:!!flags.canCopy},
    {role:'paste',label:en?'Paste':'Einfügen',enabled:!!flags.canPaste},
    {role:'delete',label:en?'Delete':'Löschen',enabled:!!flags.canDelete},
    {type:'separator'},
    {role:'selectAll',label:en?'Select all':'Alles auswählen',enabled:!!flags.canSelectAll}
  ];
  return params.selectionText?[{role:'copy',label:en?'Copy':'Kopieren',enabled:!!flags.canCopy}]:null;
}
function installEditMenu(win,{Menu,getLanguage=()=> 'de'}={}){
  Menu||=require('electron').Menu;
  win.webContents.on('context-menu',(_event,params)=>{const template=editMenuTemplate(params,getLanguage());if(template)Menu.buildFromTemplate(template).popup({window:win});});
}
module.exports={editMenuTemplate,installEditMenu};
