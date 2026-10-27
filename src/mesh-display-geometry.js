import * as THREE from 'three';

// Display only: split corners in the same triangle order, leaving source IDs,
// positions and topology intact. Exact Float32 positions also join STL seams.
export function meshDisplayGeometry(indexed, creaseDegrees=35){
  const geometry=indexed.toNonIndexed(),p=geometry.attributes.position;
  const faces=new Float32Array(p.count),buckets=new Map(),keys=new Array(p.count);
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),n=new THREE.Vector3();
  for(let i=0;i<p.count;i+=3){
    a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);
    n.subVectors(b,a).cross(c.sub(a)).normalize();n.toArray(faces,i);
    for(let k=0;k<3;k++){
      const j=i+k,key=`${p.getX(j)},${p.getY(j)},${p.getZ(j)}`;keys[j]=key;
      let bucket=buckets.get(key);if(!bucket)buckets.set(key,bucket=[]);
      if(bucket.at(-1)!==i)bucket.push(i);
    }
  }
  const normals=new Float32Array(p.count*3),threshold=Math.cos(creaseDegrees*Math.PI/180),sum=new THREE.Vector3();
  for(let i=0;i<p.count;i++){
    n.fromArray(faces,Math.floor(i/3)*3);sum.set(0,0,0);
    for(const face of buckets.get(keys[i])){
      a.fromArray(faces,face);if(n.dot(a)>=threshold)sum.add(a);
    }
    sum.normalize().toArray(normals,i*3);
  }
  geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));
  return geometry;
}

export function meshDisplayMatches(geometry,data){
  const p=geometry.attributes.position.array,t=data.triangles,v=data.verts??data.vertices;
  if(geometry.index||p.length!==t.length*3)return false;
  for(let i=0;i<t.length;i++)for(let k=0;k<3;k++)if(p[i*3+k]!==Math.fround(v[t[i]*3+k]))return false;
  return true;
}

export function meshDisplayEdges(geometry){
  return new THREE.LineSegments(new THREE.EdgesGeometry(geometry,35),new THREE.LineBasicMaterial({color:'#34495e',transparent:true,opacity:.48,depthTest:true,depthWrite:false}));
}
