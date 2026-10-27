const test=require('node:test'),assert=require('node:assert/strict'),{editMenuTemplate,installEditMenu}=require('../backend/edit-menu.cjs');
test('Editable fields receive native text commands with correct enabled state and language',()=>{
  const params={isEditable:true,editFlags:{canCopy:true,canPaste:true,canSelectAll:true,canUndo:true}};
  const menu=editMenuTemplate(params);assert.equal(menu.find(i=>i.role==='copy').label,'Kopieren');assert.equal(menu.find(i=>i.role==='paste').enabled,true);assert.equal(menu.find(i=>i.role==='cut').enabled,false);assert.equal(menu.find(i=>i.role==='redo').enabled,false);assert.equal(editMenuTemplate(params,'en').find(i=>i.role==='paste').label,'Paste');
});
test('Selected static text supports copying; canvas right-drag and unselected UI get no menu',()=>{
  assert.equal(editMenuTemplate({isEditable:false,selectionText:''}),null);assert.deepEqual(editMenuTemplate({selectionText:'10 mm',editFlags:{canCopy:true}}).map(i=>i.role),['copy']);
});
test('Context menus are attached to the correct native window',()=>{
  let handler,popup,template;const win={webContents:{on:(n,h)=>{assert.equal(n,'context-menu');handler=h;}}};installEditMenu(win,{getLanguage:()=> 'en',Menu:{buildFromTemplate:t=>{template=t;return {popup:p=>popup=p};}}});
  handler({},{});assert.equal(popup,undefined);handler({},{isEditable:true,editFlags:{canPaste:true}});assert.equal(popup.window,win);assert.equal(template.find(i=>i.role==='paste').label,'Paste');
});
