// Native face indices refer only to this unchanged imported BRep. Changing
// topology invalidates this view/export style; original source data survives.
export function cadStepMeshParts(part,mesh){
  if(!part.faceColors?.length)return [{name:part.name,color:part.color,opacity:part.opacity,mesh}];
  const styles=new Map(part.faceColors.map(f=>[f.faceIndex,f])),groups=new Map();
  for(let i=0;i<mesh.faceGroups.length;i+=3){
    const style=styles.get(mesh.faceGroups[i+2])??part,color=style.color??part.color,opacity=style.opacity??part.opacity??1,key=JSON.stringify([color,opacity]);
    let out=groups.get(key);if(!out){out={name:part.name,color,opacity,mesh:{vertices:[],triangles:[]},remap:new Map()};groups.set(key,out);}
    for(let j=mesh.faceGroups[i];j<mesh.faceGroups[i]+mesh.faceGroups[i+1];j++){
      const index=mesh.triangles[j];let mapped=out.remap.get(index);
      if(mapped===undefined){mapped=out.mesh.vertices.length/3;out.remap.set(index,mapped);out.mesh.vertices.push(...mesh.vertices.slice(index*3,index*3+3));}
      out.mesh.triangles.push(mapped);
    }
  }
  return Array.from(groups.values(),({remap,...part})=>part);
}
