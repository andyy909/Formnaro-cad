import {holeFillCatalog} from './mesh-hole-fill.js';
import {inspectMeshTopology} from './mesh-inspector.js';
import {simpleRepairCatalog} from './mesh-simple-repair.js';
import {createMeshScreenIndex,queryMeshScreenSelection} from './mesh-selection-screen.js';
import {buildMeshSelectionTopology,meshSelectionGeometryDigest,queryMeshSelection,validateMeshSelectionBinding} from './mesh-selection-data.js';
let cached=null,cachedMesh=null,cachedDigest=null,screenIndex=null,screenKey=null;
self.onmessage=event=>{
  const {id,node,request,action,value}=event.data;
  try{
    if(node.mesh){Object.freeze(node.mesh.verts);Object.freeze(node.mesh.triangles);Object.freeze(node.mesh);cachedDigest=meshSelectionGeometryDigest(node.mesh);cachedMesh=node.mesh;}
    else if(!cachedMesh||node.cachedGeometryDigest!==cachedDigest)throw Error('Netzauswahl: Der gespeicherte Netzbezug im Hintergrund ist veraltet. Erneut auswählen.');
    if(action==='digest'){self.postMessage({id,result:cachedDigest});return;}
    if(action==='screen'){const key=JSON.stringify([cachedDigest,node.transform,request.context]);if(key!==screenKey){screenIndex=createMeshScreenIndex({...node,mesh:cachedMesh},request.context);screenKey=key;}self.postMessage({id,result:queryMeshScreenSelection(screenIndex,request)});return;}
    if(!cached||cached.geometryDigest!==cachedDigest)cached=buildMeshSelectionTopology(cachedMesh);
    const result=action==='holeCatalog'?{...holeFillCatalog(cached,request),objectId:node.id}:action==='repairCatalog'?{...simpleRepairCatalog(cached,request),objectId:node.id}:action==='inspect'?inspectMeshTopology(cached,{...request,objectId:node.id}):action==='validate'?validateMeshSelectionBinding(value,{node:{...node,mesh:cached.mesh}}):queryMeshSelection(cached,request,{objectId:node.id,transform:node.transform});self.postMessage({id,result});
  }catch(error){self.postMessage({id,error:{name:error.name,code:error.code,message:error.message}});}
};
