export const CREATION_DOMAIN_KEY='offlinecad-creation-domain-v1';
const valid=value=>['auto','cad','mesh'].includes(value);

export function createCreationDomain(storage){
  let mode='auto';
  try{const saved=JSON.parse(storage.getItem(CREATION_DOMAIN_KEY));if(saved?.version===1&&valid(saved.mode))mode=saved.mode;}catch{/* Existing installations start in automatic mode. */}
  return {get:()=>mode,set:value=>{
    if(!valid(value))throw Error('Unbekannter Formtyp.');
    if(value===mode)return false;
    storage.setItem(CREATION_DOMAIN_KEY,JSON.stringify({version:1,mode:value}));mode=value;return true;
  }};
}

// References are display aids. Only actual CAD and mesh parts determine the
// palette type. This decision never converts or filters existing project data.
export function resolveCreationDomain(project,selection=[],mode='auto'){
  if(!valid(mode))throw Error('Unbekannter Formtyp.');
  if(mode!=='auto')return mode;
  const nodes=project.nodes.filter(node=>node.kind==='cad'||node.kind==='mesh');
  const kinds=new Set(nodes.map(node=>node.kind));
  if(kinds.size<2)return kinds.has('mesh')?'mesh':'cad';
  const ids=new Set(selection.map(target=>target.rootId));
  const chosen=new Set(nodes.filter(node=>ids.has(node.id)).map(node=>node.kind));
  return chosen.size===1?[...chosen][0]:null;
}
