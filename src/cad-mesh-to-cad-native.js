import {meshCadSource,meshCadFrame} from './cad-mesh-to-cad-data.js';
import {projectObjectGeometryDigest} from './project-objects.js';

export function meshToCadNative(service,project,{target,sourceDigest,bytes,id,notes}){
 const source=meshCadSource(project,target);
 if(sourceDigest!==projectObjectGeometryDigest(source))throw Error('Das Quellnetz wurde geändert. Neu an den Konverter übergeben.');
 if(typeof id!=='string'||!id.trim()||id.length>200||project.nodes.some(n=>n.id===id))throw Error('Die CAD-Kopie benötigt eine neue eindeutige Kennung.');
 if(typeof notes!=='string'||notes.length>4000)throw Error('Ungültiger Konverterbericht.');
 return service.stepNode(bytes,{id,name:source.name.slice(0,186)+' · CAD-Kopie',transform:meshCadFrame(source),color:source.color??'#8294aa',opacity:source.opacity??1,layerId:source.layerId,folderId:source.folderId,hidden:false,locked:false,metadata:{sourceReference:{objectId:source.id,geometryDigest:sourceDigest,operation:'mesh-to-cad'},notes}});
}
