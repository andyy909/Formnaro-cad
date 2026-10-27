const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
// Runs in the same isolated profile as the existing end-to-end sketch suite.
exports.verifyNativeCore=async(win,{directory})=>{
 const checks=[],run=code=>win.webContents.executeJavaScript(`(async()=>{const a=window.__cadTest,check=(v,m)=>{if(!v)throw Error(m)};${code}})()`);
 const proof=async(name,code)=>{await run(code);checks.push(name);};
 await proof('normal and Easy modes expose native tools without an external editor action, menu or IPC',`
  for(const mode of ['normal','easy']){a.workbenchUI.setMode(mode);check(!a.actions.parametric&&!a.parametricUI,'external action');check(!document.querySelector('[data-action="parametric"]'),'external menu');}
  for(const key of ['getParametricState','startParametricEditor','collectParametricEditor','closeParametricEditor','openParametricFolder'])check(!(key in window.offlinecadDesktop),'external IPC '+key);
  check(typeof a.actions.sketch==='function'&&typeof a.actions['sketch-on-part']==='function'&&typeof a.actions['sketch-templates']==='function','native tools missing');
  await a.actions.functions();check(!document.querySelector('[data-native-function="parametric"]'),'external function card');document.getElementById('modal').close();a.workbenchUI.setMode('normal');
 `);
 const data=zlib.gzipSync(Buffer.from('{"format":"solidcraft/27","name":"Legacy compatibility fixture"}')),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
 await proof('legacy format9 geometry and embedded design round-trip with no additional editor installed',`
  await a.resetProject();await a.addShape('box');await a.settled();const project=a.getModel(),n=project.nodes[0];
  project.version=9;n.source='step';delete n.recipe;
  const brepHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(n.brep.data))),v=>v.toString(16).padStart(2,'0')).join('');
  n.metadata={...n.metadata,parametricSource:{format:'FormnaroParametricSource',version:1,engine:'solidcraft',engineVersion:'0.16.2',compression:'gzip',designBase64:${JSON.stringify(data.toString('base64'))},designSha256:${JSON.stringify(sha(data))},brepSha256:brepHash}};
  await a.controller.open(project);await a.settled();window.legacyCoreBefore=a.serialize();window.legacyCoreSource=JSON.stringify(a.getModel().nodes[0].metadata.parametricSource);
  await a.controller.open(JSON.parse(window.legacyCoreBefore));await a.settled();check(a.getModel().version===9,'legacy format');check(a.serialize()===window.legacyCoreBefore,'legacy round trip changed');
 `);
 await proof('native editing and Undo preserve legacy embedded source bytes',`
  const n=a.getModel().nodes[0];a.select([{rootId:n.id,path:[]}]);const depth=a.undoDepth();await a.actions.duplicate();await a.settled();check(a.getModel().nodes.length===2,'duplicate');check(a.getModel().nodes.every(n=>JSON.stringify(n.metadata.parametricSource)===window.legacyCoreSource),'source changed');check(a.undoDepth()===depth+1,'duplicate Undo count');
  await a.actions.undo();await a.settled();check(a.serialize()===window.legacyCoreBefore,'legacy Undo');
 `);
 fs.writeFileSync(path.join(directory,'legacy-format9.ocad'),await run('return a.serialize();'));
 return {checks};
};
