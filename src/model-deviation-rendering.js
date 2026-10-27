import * as THREE from 'three';
const zero=new THREE.Color('#247edb'),middle=new THREE.Color('#52bd80'),high=new THREE.Color('#e9573e'),unknown=new THREE.Color('#88969f');
function geometry(surface,values,maxDistance){
 const {vertices,triangles}=surface,n=triangles.length/3,positions=new Float32Array(n*9),colors=values?new Float32Array(n*9):null,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<vertices.length;i++){const k=i%3;min[k]=Math.min(min[k],vertices[i]);max[k]=Math.max(max[k],vertices[i]);}const center=min.map((v,k)=>(v+max[k])/2);
 for(let i=0;i<n;i++){const measured=values&&Number.isFinite(values[i]),t=measured?Math.max(0,Math.min(1,values[i]/maxDistance)):0,from=t<.5?zero:middle,to=t<.5?middle:high,ratio=t<.5?t*2:(t-.5)*2;
  for(let j=0;j<3;j++){const id=triangles[i*3+j];for(let k=0;k<3;k++){const value=vertices[id*3+k]-center[k];if(!Number.isFinite(Math.fround(value)))throw Error('Vergleichsoberfläche kann nicht angezeigt werden.');positions[i*9+j*3+k]=value;}if(colors)for(const [k,key]of ['r','g','b'].entries())colors[i*9+j*3+k]=measured?from[key]+(to[key]-from[key])*ratio:unknown[key];}
 }
 const mesh=new THREE.BufferGeometry();mesh.setAttribute('position',new THREE.BufferAttribute(positions,3));if(colors)mesh.setAttribute('color',new THREE.BufferAttribute(colors,3));mesh.computeBoundingSphere();return {geometry:mesh,center};
}
export function createModelComparisonOverlay({left,right,result,direction='right-to-left',maxDistance=.02,showOriginal=true}={}){
 if(!Number.isFinite(maxDistance)||maxDistance<=0||maxDistance>1e7)throw Error('Eine positive obere Farbgrenze in Millimetern wählen.');const data=result?.directions.find(d=>d.direction===direction);if(!data)throw Error('Diese Messrichtung wurde nicht berechnet.');
 const source=direction==='left-to-right'?left:right,other=direction==='left-to-right'?right:left;if(data.values.length!==source.triangles.length/3)throw Error('Abweichungswerte passen nicht zur Vergleichsoberfläche.');
 const group=new THREE.Group();let measured=0;for(const value of data.values)if(Number.isFinite(value))measured++;
 try{if(showOriginal){const ghost=geometry(other),mesh=new THREE.Mesh(ghost.geometry,new THREE.MeshBasicMaterial({color:'#53b4ca',side:THREE.DoubleSide,transparent:true,opacity:.2,depthWrite:false}));mesh.position.fromArray(ghost.center);mesh.renderOrder=17;mesh.userData.comparison='reference';group.add(mesh);}const heat=geometry(source,data.values,maxDistance),mesh=new THREE.Mesh(heat.geometry,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,depthWrite:true}));mesh.position.fromArray(heat.center);mesh.renderOrder=18;mesh.userData.comparison='distances';group.add(mesh);group.userData.summary={direction,triangles:data.values.length,measuredTriangles:measured,unknownTriangles:data.values.length-measured,samplePoints:data.samplePoints,maxDistance,sourcePreserved:true};return group;}
 catch(error){group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});throw error;}
}
