export function partitionVersion(nodes){let advanced=false;function visit(n){advanced||=n.operation==='partition'||n.partition!==undefined;n.children?.forEach(visit);}nodes.forEach(visit);return advanced?6:4;}
export function validPartition(node,validMesh){
 const p=node.partition;if(node.operation!=='partition')return p===undefined;
 if(!p||p.version!==1||node.type!=='group'||!node.mesh||node.children?.length!==1||!node.children[0].solid||node.children[0].suppressed)return false;
 if(p.kind==='plane')return Object.keys(p).every(k=>['version','kind','normal','offset','side'].includes(k))&&Array.isArray(p.normal)&&p.normal.length===3&&p.normal.every(v=>typeof v==='number'&&Number.isFinite(v))&&Math.abs(Math.hypot(...p.normal)-1)<1e-6&&Number.isFinite(p.offset)&&Math.abs(p.offset)<=200000&&[1,-1].includes(p.side);
 if(p.kind==='body')return Object.keys(p).every(k=>['version','kind','sourceStamp','bodyMesh','bodyCount'].includes(k))&&typeof p.sourceStamp==='string'&&/^[a-f0-9]{16}$/.test(p.sourceStamp)&&Number.isInteger(p.bodyCount)&&p.bodyCount>=2&&p.bodyCount<=500&&p.bodyMesh&&p.bodyMesh.verts?.length>0&&p.bodyMesh.triangles?.length>0&&validMesh(p.bodyMesh);
 return false;
}
