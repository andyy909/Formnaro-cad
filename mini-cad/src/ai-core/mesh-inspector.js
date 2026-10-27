
export const MESH_INSPECTION_CATEGORIES=Object.freeze({
 boundary:{label:'Offene Randkanten',color:'#f58320'},
 duplicate:{label:'Doppelte Dreiecke',color:'#de479d'},
 degenerate:{label:'Entartete Dreiecke',color:'#d5ad14'},
 orientation:{label:'Widersprüchliche Flächenrichtung',color:'#e33842'},
 nonmanifoldEdge:{label:'Problematische Kanten',color:'#8950d3'},
 nonmanifoldVertex:{label:'Problematische Punktverbindungen',color:'#6749c3'},
 small:{label:'Kleine Nebenbestandteile',color:'#2195d1'}
});
const abort=signal=>{if(signal?.aborted)throw Object.assign(Error('Netzinspektion abgebrochen.'),{name:'AbortError'});};
function unionFind(size){const p=Uint32Array.from({length:size},(_,i)=>i),rank=new Uint8Array(size);const find=i=>{let root=i;while(p[root]!==root)root=p[root];while(p[i]!==i){const next=p[i];p[i]=root;i=next;}return root;};return {find,join(a,b){a=find(a);b=find(b);if(a===b)return;if(rank[a]<rank[b])[a,b]=[b,a];p[b]=a;if(rank[a]===rank[b])rank[a]++;}};}

/** Exact-coordinate topology diagnosis, never a repair or solid proof. Faces
 * retain original IDs; duplicated STL seam points are logically identified
 * without changing even one saved point or index. */
export function inspectMeshTopology(topology,{objectId,smallTriangleLimit=20,signal}={}){
 abort(signal);if(!Number.isSafeInteger(smallTriangleLimit)||smallTriangleLimit<0||smallTriangleLimit>500000)throw Error('Grenze für Nebenbestandteile: 0 bis 500.000 Dreiecke.');
 const {mesh,representatives,bad,edges,triangles}=topology;
 const categories=Object.fromEntries(Object.keys(MESH_INSPECTION_CATEGORIES).map(k=>[k,{count:0,triangleIds:[],edges:[],vertexIds:[]}]));
 const faceLinks=unionFind(triangles),fans=unionFind(triangles*3),unsafe=new Set();
 const rep=(face,corner)=>representatives[mesh.triangles[face*3+corner]];
 for(let face=0;face<triangles;face++){
  if(!(face%1024))abort(signal);
  if(bad[face]){categories[bad[face]===1?'degenerate':'duplicate'].triangleIds.push(face);for(let k=0;k<3;k++)unsafe.add(rep(face,k));}
 }
 let step=0;
 for(const edge of edges.values()){
  if(!(step++%1024))abort(signal);const incidents=edge.incidents,ids=[...new Set(incidents.map(i=>i.face))];
  for(let i=1;i<ids.length;i++)faceLinks.join(ids[0],ids[i]);
  const clean=incidents.every(i=>!bad[i.face]),copy=()=>({id:edge.id,vertices:[...edge.vertices]});
  if(incidents.length===1&&clean)categories.boundary.edges.push(copy());
  if(ids.length>2){categories.nonmanifoldEdge.edges.push(copy());for(const id of edge.vertices)unsafe.add(id);}
  if(incidents.length===2&&ids.length===2&&clean){
   if(incidents[0].direction===incidents[1].direction)categories.orientation.edges.push(copy());
   for(const vertex of edge.vertices){const a=incidents[0].face,b=incidents[1].face,ca=[0,1,2].find(k=>rep(a,k)===vertex),cb=[0,1,2].find(k=>rep(b,k)===vertex);fans.join(a*3+ca,b*3+cb);}
  }
 }
 // A pinched/bow-tie vertex may have only ordinary two-face edges. Its local
 // incident face fan still splits into more than one connected sector.
 const firstFan=new Map(),pinched=new Set();
 for(let face=0;face<triangles;face++){if(!(face%1024))abort(signal);if(bad[face])continue;for(let k=0;k<3;k++){const vertex=rep(face,k);if(unsafe.has(vertex))continue;const root=fans.find(face*3+k);if(!firstFan.has(vertex))firstFan.set(vertex,root);else if(firstFan.get(vertex)!==root)pinched.add(vertex);}}
 categories.nonmanifoldVertex.vertexIds=[...pinched].sort((a,b)=>a-b);
 const byRoot=new Map();for(let face=0;face<triangles;face++){if(!(face%1024))abort(signal);const root=faceLinks.find(face),list=byRoot.get(root)??[];list.push(face);byRoot.set(root,list);}
 const components=[...byRoot.values()].sort((a,b)=>b.length-a.length||a[0]-b[0]);
 for(let index=1;index<components.length;index++){abort(signal);const list=components[index];if(list.length<=smallTriangleLimit)for(const face of list)categories.small.triangleIds.push(face);}
 categories.small.triangleIds.sort((a,b)=>a-b);
 for(const c of Object.values(categories))c.count=c.triangleIds.length+c.edges.length+c.vertexIds.length;
 abort(signal);return {format:'FormnaroMeshInspection',version:1,objectId,geometryDigest:topology.geometryDigest,smallTriangleLimit,triangles,vertices:mesh.verts.length/3,componentCount:components.length,
  componentDetails:components.slice(0,256).map((faces,index)=>({index,firstTriangle:faces[0],triangleCount:faces.length,main:index===0,small:index>0&&faces.length<=smallTriangleLimit})),componentDetailsTruncated:components.length>256,
  categories,scope:'exact-coordinate-topology',limitations:['Keine Prüfung auf Selbstüberschneidungen, Wandstärken oder Druckbarkeit.','Eine konsistent nach innen gerichtete Hülle wird hier nicht als falsche Richtung erkannt.','Offene Ränder und getrennte Bestandteile können beabsichtigt sein. Kein Nachweis eines gültigen Materialkörpers.']};
}

