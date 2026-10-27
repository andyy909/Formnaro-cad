const path=require('node:path'),{fileURLToPath}=require('node:url');
function speechEntryMatches(url,entry){try{return path.resolve(fileURLToPath(url)).toLowerCase()===path.resolve(entry).toLowerCase();}catch{return false;}}
function installSpeechPermissions(win,{entry}){
 const own=contents=>contents===win.webContents&&speechEntryMatches(contents.getURL(),entry);
 win.webContents.session.setPermissionCheckHandler((contents,permission,_origin,details)=>own(contents)&&(permission==='clipboard-sanitized-write'||permission==='media'&&details.isMainFrame===true&&details.mediaType==='audio'&&speechEntryMatches(details.requestingUrl,entry)));
 win.webContents.session.setPermissionRequestHandler((contents,permission,callback,details)=>callback(own(contents)&&(permission==='clipboard-sanitized-write'||permission==='media'&&details.isMainFrame===true&&speechEntryMatches(details.requestingUrl,entry)&&Array.isArray(details.mediaTypes)&&details.mediaTypes.length===1&&details.mediaTypes[0]==='audio')));
}
module.exports={installSpeechPermissions,speechEntryMatches};
