import {Matrix4,Vector3,Quaternion,Euler} from 'three';
import {matrixArray} from './engine/geometry.js';
import {cloneNodes,renewIds} from './model.js';

export function libraryCopies(nodes,count){
  if(!nodes.length||count+nodes.length>200)throw Error('Mit dieser Vorlage wären mehr als 200 Teile im Projekt oder die Vorlage ist leer.');
  if(!nodes.some(n=>!n.hidden))throw Error('Die Vorlage enthält keine sichtbaren Teile.');
  return cloneNodes(nodes).map(renewIds);
}
export function libraryPlacement(nodes,rendered,name){
  const visible=nodes.filter(n=>!n.hidden),byId=new Map(rendered.map(r=>[r.id,r.data]));
  if(!visible.length)throw Error('Die Vorlage enthält keine sichtbaren Teile.');
  if(nodes.length===1)return {node:nodes[0],data:byId.get(nodes[0].id),members:null};
  const support=visible.some(n=>n.solid)?visible.filter(n=>n.solid):visible,verts=[],min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],v=new Vector3();
  let triangles=0;
  for(const n of support){const data=byId.get(n.id);if(!data)throw Error('Vorlagengeometrie fehlt.');triangles+=data.triangles.length/3;if(triangles>500000)throw Error('Die Vorlage ist für eine schnelle Ablagevorschau zu umfangreich.');const matrix=new Matrix4().fromArray(matrixArray(n));
    for(let i=0;i<data.verts.length;i+=3){v.fromArray(data.verts,i).applyMatrix4(matrix);for(let j=0;j<3;j++){const value=v.getComponent(j);verts.push(value);min[j]=Math.min(min[j],value);max[j]=Math.max(max[j],value);}}
  }
  const size=max.map((value,i)=>Math.max(.01,value-min[i])),pos=min.map((value,i)=>(value+max[i])/2);
  for(let i=0;i<verts.length;i++)verts[i]=(verts[i]-pos[i%3])/size[i%3];
  return {node:{id:crypto.randomUUID(),name,pos,size,rot:[0,0,0],mirror:[1,1,1],color:visible[0].color,solid:true},data:{verts,triangles:[]},members:visible.map(node=>({node,data:byId.get(node.id)}))};
}
export function placeLibraryNodes(nodes,anchor,result){
  const before=new Quaternion().setFromEuler(new Euler(...anchor.rot.map(v=>v*Math.PI/180),'ZYX')),after=new Quaternion().setFromEuler(new Euler(...result.rot.map(v=>v*Math.PI/180),'ZYX')),delta=after.multiply(before.invert());
  return cloneNodes(nodes).map(n=>{
    n.pos=new Vector3(...n.pos).sub(new Vector3(...anchor.pos)).applyQuaternion(delta).add(new Vector3(...result.pos)).toArray();
    const rotation=delta.clone().multiply(new Quaternion().setFromEuler(new Euler(...n.rot.map(v=>v*Math.PI/180),'ZYX'))),e=new Euler().setFromQuaternion(rotation,'ZYX');n.rot=[e.x,e.y,e.z].map(v=>v*180/Math.PI);return n;
  });
}
