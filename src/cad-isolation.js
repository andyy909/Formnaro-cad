// View-only state. Never stored in a CAD project, workspace or transaction.
export function cadPermanentlyVisible(node,project){
  if(!node||node.hidden||node.suppressed||project.layers.find(v=>v.id===node.layerId)?.hidden)return false;
  let folder=project.folders.find(v=>v.id===node.folderId);
  while(folder){if(folder.hidden)return false;folder=project.folders.find(v=>v.id===folder.parentId);}
  return true;
}
const family=node=>[node.id,...(node.children??[]).flatMap(family)];
export function createCadIsolation(){
  let roots=null,ancestry=new Set();
  function remember(project){ancestry=new Set(project.nodes.filter(n=>roots.has(n.id)).flatMap(family));}
  function start(project,targets){
    const ids=targets.map(t=>t.rootId).filter(id=>cadPermanentlyVisible(project.nodes.find(n=>n.id===id),project));
    if(!ids.length)throw Error('Bitte ein sichtbares Teil auswählen.');
    roots=new Set(ids);remember(project);return state();
  }
  function sync(project){
    if(!roots)return null;
    roots=new Set(project.nodes.filter(n=>cadPermanentlyVisible(n,project)&&family(n).some(id=>ancestry.has(id))).map(n=>n.id));
    if(!roots.size)return end();remember(project);return state();
  }
  function include(project,targets){if(roots){for(const t of targets)if(cadPermanentlyVisible(project.nodes.find(n=>n.id===t.rootId),project))roots.add(t.rootId);remember(project);}return state();}
  function end(){roots=null;ancestry.clear();return null;}
  function state(){return roots?[...roots]:null;}
  const allows=id=>!roots||roots.has(id);
  return {start,sync,include,end,state,allows,visible:(node,project)=>cadPermanentlyVisible(node,project)&&allows(node.id)};
}
