/** Virtual mesh sources describe retained history. They are not native CAD
 * children or additional scene objects; paths belong to the mesh edit adapter. */
export function meshSourceTree(root,{geometry=true}={}){
  const source=root?.kind==='mesh'?root.meshSource:null,items=[];
  if(!source)return items;
  const key=path=>JSON.stringify(path);
  function localSource(common){
    if(common.meshSource?.node)return {...common.meshSource.node,name:common.name,color:common.color??common.meshSource.node.color,solid:common.meshRole!=='hole',opacity:common.opacity??common.meshSource.node.opacity??1,notes:common.metadata?.notes??common.meshSource.node.notes??''};
    if(!geometry)return {id:common.id,name:common.name,type:'import',solid:common.meshRole!=='hole',color:common.color};
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<common.mesh.verts.length;i++){const axis=i%3;min[axis]=Math.min(min[axis],common.mesh.verts[i]);max[axis]=Math.max(max[axis],common.mesh.verts[i]);}
    return {id:common.id,name:common.name,type:'import',size:min.map((v,k)=>max[k]-v),pos:min.map((v,k)=>(max[k]+v)/2),rot:[0,0,0],solid:common.meshRole!=='hole',color:common.color};
  }
  function append(node,path,depth,parentPath,options={}){
    const entry={node,path:[...path],depth,parentPath:parentPath===null?null:[...parentPath],key:key(path),poseEditable:true,suppressed:!!node.suppressed,suppressible:path.length>0,hidden:!!node.hidden,locked:!!node.locked,...options};
    items.push(entry);return entry;
  }
  function legacy(node,path,depth,parentPath,ancestors={}){
    const entry=append(node,path,depth,parentPath,{hidden:!!ancestors.hidden||!!node.hidden,locked:!!ancestors.locked||!!node.locked});
    for(const child of node.children??[])legacy(child,[...path,child.id],depth+1,path,{hidden:entry.hidden||entry.suppressed,locked:entry.locked});
    return entry;
  }
  function common(node,path,depth,parentPath,parentRecipe,ancestors={}){
    const recipe=node.meshSource,hidden=!!ancestors.hidden||!!node.hidden,locked=!!ancestors.locked||!!node.locked,suppressed=(parentRecipe?.suppressedIds??[]).includes(node.id),suppressible=parentRecipe?.type==='group';
    if(Array.isArray(recipe?.sources)){
      append(localSource(node),path,depth,parentPath,{poseEditable:false,suppressed,suppressible,hidden,locked,common:node});
      for(const child of recipe.sources)common(child,[...path,child.id],depth+1,path,recipe.operation,{hidden:hidden||suppressed,locked});
    }else{
      const entry=legacy(localSource(node),path,depth,parentPath,{hidden,locked});
      Object.assign(entry,{suppressed,suppressible,common:node});
      if(suppressed)for(const descendant of items.slice(items.indexOf(entry)+1))descendant.hidden=true;
    }
  }
  if(Array.isArray(source.sources))for(const child of source.sources)common(child,[child.id],0,null,source.operation,{hidden:!!root.hidden,locked:!!root.locked});
  else legacy(localSource(root),[],0,null,{hidden:!!root.hidden,locked:!!root.locked});
  const parents=new Map(items.map(entry=>[entry.key,entry]));
  for(const entry of items)entry.children=[];
  for(const entry of items)if(entry.parentPath!==null)parents.get(key(entry.parentPath))?.children.push(entry);
  return items;
}

export function meshSourceAtPath(root,path){
  if(!Array.isArray(path))throw Error('Ungültiger Netzquellenpfad.');
  const entry=meshSourceTree(root).find(item=>item.key===JSON.stringify(path));
  if(!entry)throw Error('Gespeicherte Netzquelle ist nicht mehr vorhanden.');
  return entry;
}

/** Only names, roles and history structure affect tree rows. Source geometry,
 * parameters and affine placement remain untouched by this view description. */
export function meshSourceTreeMetadata(root){
  return meshSourceTree(root,{geometry:false}).map(({node,path,suppressed,hidden,locked})=>[path,node.name,node.solid,suppressed,hidden,locked,node.color]);
}
