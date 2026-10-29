const path=require('node:path'),{pathToFileURL}=require('node:url');
// Renderer navigation may only reload the exact application document. Local
// script iframes and workers retain their separate sandbox/CSP policies.
function installNavigationGuard(win,{entry,query}={}){
 const expected=pathToFileURL(path.resolve(entry));if(query)expected.search=new URLSearchParams(query).toString();
 const allowed=value=>{try{const url=new URL(value);url.hash='';return url.href===expected.href;}catch{return false;}};
 const guard=(event,url)=>{if(!allowed(url))event.preventDefault();};
 win.webContents.on('will-navigate',guard);win.webContents.on('will-redirect',guard);
 return {allowed};
}
module.exports={installNavigationGuard};
