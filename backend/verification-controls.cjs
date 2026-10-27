// Open real workbench menus before sending input to an existing test control.
// This helper is used only by isolated application verification.
async function revealVerificationControl(win,selector){
 for(let attempt=0;attempt<5;attempt++){
  const summary=await win.webContents.executeJavaScript(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing verification control '+${JSON.stringify(selector)});const ancestors=[];for(let n=e.parentElement;n;n=n.parentElement)if(n.tagName==='DETAILS'&&!n.open)ancestors.push(n);const menu=ancestors.at(-1);if(!menu)return null;const s=menu.querySelector(':scope > summary');if(!s)throw Error('Closed menu has no summary');s.scrollIntoView({block:'nearest'});const r=s.getBoundingClientRect();if(!r.width||!r.height)throw Error('Menu summary is hidden');return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
  if(!summary)return;
  for(const type of ['mouseMove','mouseDown','mouseUp'])win.webContents.sendInputEvent({type,button:'left',clickCount:1,...summary});
  await new Promise(resolve=>setTimeout(resolve,80));
 }
 throw Error('Could not reveal verification control '+selector);
}
module.exports={revealVerificationControl};
