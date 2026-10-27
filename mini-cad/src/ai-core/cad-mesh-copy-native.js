import {cadExportMesh,readCadBrep,validateCadSolid} from './cad-native-kernel.js';
import {validateProjectMesh,meshTopologyClass,projectObjectGeometryDigest} from './project-objects.js';
import {compactCadMesh,meshSignedVolume,meshCopySource,validateMeshCopyQuality} from './cad-mesh-copy-data.js';
export function cadMeshCopyNative(oc,project,{target,quality,id=crypto.randomUUID()}={}){
 const source=meshCopySource(project,target),settings=validateMeshCopyQuality(quality);
 if(typeof id!=='string'||!id.trim()||id.length>200||project.nodes.some(n=>n.id===id))throw Error('Die Netzkopie benötigt eine neue eindeutige Kennung.');
 const m=source.transform,columns=[0,1,2].map(i=>[Math.abs(m[i*4]),Math.abs(m[i*4+1]),Math.abs(m[i*4+2])]),one=Math.max(...columns.map(c=>c.reduce((a,b)=>a+b,0))),infinity=Math.max(...[0,1,2].map(i=>columns.reduce((s,c)=>s+c[i],0))),stretch=Math.sqrt(one)*Math.sqrt(infinity),localDeflection=settings.deflection/stretch;
 if(localDeflection<1e-7)throw Error('Diese Feinheit ist bei der gespeicherten Skalierung zu klein. Eine gröbere Netzkopie wählen.');
 const shape=readCadBrep(oc,source.brep.data);let raw,cadVolume;
 try{cadVolume=validateCadSolid(oc,shape).volume;raw=cadExportMesh(oc,shape,{...settings,deflection:localDeflection});}finally{shape.delete();}
 const mesh=validateProjectMesh(compactCadMesh(raw));
 if(meshTopologyClass(mesh).type!=='closedMesh')throw Error('Diese CAD-Vernetzung ist nicht geschlossen. Eine andere Feinheit wählen; die CAD-Quelle bleibt erhalten.');
 const volume=meshSignedVolume(mesh);if(!Number.isFinite(volume)||volume<=0)throw Error('Die CAD-Vernetzung besitzt kein positives orientiertes Volumen.');
 const determinant=m[0]*(m[5]*m[10]-m[9]*m[6])-m[4]*(m[1]*m[10]-m[9]*m[2])+m[8]*(m[1]*m[6]-m[5]*m[2]),scale=Math.abs(determinant),sourceDigest=projectObjectGeometryDigest(source);
 const node={id,kind:'mesh',name:source.name.slice(0,186)+' · Netzkopie',meshRole:'solid',mesh,transform:[...m],color:source.color??'#8294aa',opacity:source.opacity??1,hidden:false,locked:false,layerId:source.layerId,folderId:source.folderId,
  metadata:{sourceReference:{objectId:source.id,geometryDigest:sourceDigest,operation:'cad-to-mesh'},notes:`CAD-Netzkopie; Vernetzungsziel ${settings.deflection} mm, Winkel ${settings.angleDegrees}°. Keine garantierte Maximalabweichung. Unabhängige Kopie; CAD-Quelle bleibt erhalten. Objektfarbe übernommen.`}};
 return {node,report:{quality:settings,sourceId:source.id,sourceDigest,vertices:mesh.verts.length/3,triangles:mesh.triangles.length/3,cadVolume:cadVolume*scale,meshVolume:volume*scale,volumeDifferencePercent:Math.abs(volume-cadVolume)/cadVolume*100,solidProven:false}};
}
