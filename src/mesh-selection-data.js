import {cadGeometryDigest} from './cad-geometry-digest.js';

/** Read-only original-triangle selection. Exact coordinate welding is logical:
 * neither the saved points nor triangle numbering are ever rewritten. This is
 * topological selection, not a solid proof or a mesh repair. */
export const MESH_SELECTION_LIMITS=Object.freeze({vertices:1000000,triangles:500000,edges:1500000});
const IDENTITY=Object.freeze([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
const MODES=new Set(['triangle','surface','component','boundary']);
const frozen=mesh=>!!mesh&&typeof mesh==='object'&&Object.isFrozen(mesh)&&Object.isFrozen(mesh.verts)&&Object.isFrozen(mesh.triangles);
const digestCache=new WeakMap(),topologyCache=new WeakMap(),verifiedBindings=new WeakMap(),surfaceNormalCache=new WeakMap();
function fail(message,code='MESH_SELECTION_INVALID'){const error=new Error(`Netzauswahl: ${message}`);error.code=code;throw error;}
function aborted(signal){if(signal?.aborted){const error=new Error('Netzauswahl abgebrochen.');error.name='AbortError';error.code='ABORTED';throw error;}}
function tick(index,signal){if((index&1023)===0)aborted(signal);}
function arrays(mesh,{signal,limits=MESH_SELECTION_LIMITS}={}){
  aborted(signal);
  if(!mesh||typeof mesh!=='object'||!Array.isArray(mesh.verts)||!Array.isArray(mesh.triangles)||mesh.verts.length<9||mesh.verts.length%3||mesh.triangles.length<3||mesh.triangles.length%3)fail('Originale Punkte und Dreiecksindizes fehlen oder sind ungültig.');
  const vertices=mesh.verts.length/3,triangles=mesh.triangles.length/3;
  if(vertices>limits.vertices||triangles>limits.triangles)fail(`Dieses Auswahlwerkzeug unterstützt höchstens ${limits.triangles.toLocaleString('de-DE')} Dreiecke und ${limits.vertices.toLocaleString('de-DE')} Punkte je Netz. Ein kleineres Netz auswählen.`, 'MESH_SELECTION_LIMIT');
  for(let i=0;i<mesh.verts.length;i++){tick(i,signal);if(typeof mesh.verts[i]!=='number'||!Number.isFinite(mesh.verts[i]))fail('Punktkoordinaten müssen endliche Zahlen sein.');}
  for(let i=0;i<mesh.triangles.length;i++){tick(i,signal);const n=mesh.triangles[i];if(!Number.isSafeInteger(n)||n<0||n>=vertices)fail('Ein Dreiecksindex liegt außerhalb der originalen Punktliste.');}
  return {vertices,triangles};
}

/** Placement, color and names do not invalidate an original-triangle binding. */
export function meshSelectionGeometryDigest(nodeOrMesh,{signal}={}){
  const mesh=nodeOrMesh?.mesh??nodeOrMesh;if(!mesh||typeof mesh!=='object')fail('Netzdaten fehlen.');
  let result=frozen(mesh)&&digestCache.get(mesh);if(result){aborted(signal);return result;}
  arrays(mesh,{signal});result=cadGeometryDigest(JSON.stringify({verts:mesh.verts,triangles:mesh.triangles}));aborted(signal);
  if(frozen(mesh))digestCache.set(mesh,result);return result;
}
function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function unit(a){const scale=Math.max(...a.map(Math.abs));if(!scale||!Number.isFinite(scale))return null;const n=a.map(v=>v/scale),length=Math.hypot(...n);return length&&Number.isFinite(length)?n.map(v=>v/length):null;}
function faceNormal(verts,ids,matrix){
  const p=ids.map(i=>verts.slice(i*3,i*3+3)),u=p[1].map((v,i)=>v-p[0][i]),v=p[2].map((n,i)=>n-p[0][i]);
  function transform(d){return [0,1,2].map(row=>matrix[row]*d[0]+matrix[4+row]*d[1]+matrix[8+row]*d[2]);}
  const a=unit(transform(u)),b=unit(transform(v));return a&&b?unit(cross(a,b)):null;
}
function matrix(value=IDENTITY){
  if(!Array.isArray(value)||value.length!==16||value.some(v=>typeof v!=='number'||!Number.isFinite(v))||value[3]!==0||value[7]!==0||value[11]!==0||value[15]!==1)fail('Eine vollständige affine Objektlage wird benötigt.');
  const rows=[0,1,2].map(row=>{const line=[value[row],value[4+row],value[8+row]],scale=Math.max(...line.map(Math.abs));if(!scale)fail('Die Objektlage ist nicht invertierbar.');return line.map(v=>v/scale);});
  for(let col=0;col<3;col++){let pivot=col;for(let row=col+1;row<3;row++)if(Math.abs(rows[row][col])>Math.abs(rows[pivot][col]))pivot=row;if(rows[pivot][col]===0)fail('Die Objektlage ist nicht invertierbar.');[rows[col],rows[pivot]]=[rows[pivot],rows[col]];for(let row=col+1;row<3;row++){const factor=rows[row][col]/rows[col][col];for(let j=col;j<3;j++)rows[row][j]-=factor*rows[col][j];}}
  return value;
}
function key(a,b){return a<b?`${a},${b}`:`${b},${a}`;}
function edgeId(a,b){return a<b?`e:${a}:${b}`:`e:${b}:${a}`;}
function rememberBinding(mesh,value){if(!frozen(mesh))return;const key=JSON.stringify(value),known=verifiedBindings.get(mesh)??new Set();if(known.size>=32)known.delete(known.values().next().value);known.add(key);verifiedBindings.set(mesh,known);}

/** Build at most once for immutable confirmed arrays. Mutable drafts are never
 * cached. Nonmanifold, duplicate and degenerate faces remain visible, but are
 * barriers for connected selection. */
export function buildMeshSelectionTopology(mesh,{signal,limits=MESH_SELECTION_LIMITS}={}){
  const cached=limits===MESH_SELECTION_LIMITS&&frozen(mesh)&&topologyCache.get(mesh);if(cached){aborted(signal);return cached;}
  const counts=arrays(mesh,{signal,limits}),representatives=new Uint32Array(counts.vertices),coordinates=new Map(),edges=new Map(),faceKeys=new Map(),bad=new Uint8Array(counts.triangles),neighbors=new Int32Array(counts.triangles*3).fill(-1),faceEdges=new Array(counts.triangles*3);
  for(let i=0;i<counts.vertices;i++){tick(i,signal);const coordinate=`${mesh.verts[i*3]},${mesh.verts[i*3+1]},${mesh.verts[i*3+2]}`;if(!coordinates.has(coordinate))coordinates.set(coordinate,i);representatives[i]=coordinates.get(coordinate);}
  let degenerateCount=0,duplicateCount=0;
  for(let face=0;face<counts.triangles;face++){
    tick(face,signal);const raw=mesh.triangles.slice(face*3,face*3+3),ids=raw.map(i=>representatives[i]);
    if(new Set(ids).size!==3||!faceNormal(mesh.verts,raw,IDENTITY)){bad[face]=1;degenerateCount++;}
    else{const faceKey=[...ids].sort((a,b)=>a-b).join(',');if(faceKeys.has(faceKey)){bad[face]=2;bad[faceKeys.get(faceKey)]=2;duplicateCount++;}else faceKeys.set(faceKey,face);}
    // Even invalid faces contribute real incidence. Ignoring them could turn a
    // shared edge into a false opening and falsely offer it as a fillable rim.
    for(let side=0;side<3;side++){const a=ids[side],b=ids[(side+1)%3];if(a===b)continue;const edgeKey=key(a,b);let edge=edges.get(edgeKey);if(!edge){edge={id:edgeId(a,b),vertices:a<b?[a,b]:[b,a],incidents:[]};edges.set(edgeKey,edge);if(edges.size>limits.edges)fail('Zu viele Kanten für diese Netzauswahl. Ein kleineres Netz auswählen.','MESH_SELECTION_LIMIT');}edge.incidents.push({face,side,direction:a<b?1:-1});faceEdges[face*3+side]=edge;}
  }
  let nonmanifoldCount=0,orientationCount=0,boundaryCount=0,edgeIndex=0;const unsafeBoundaryVertices=new Set();
  for(const edge of edges.values()){
    tick(edgeIndex++,signal);if(edge.incidents.some(v=>bad[v.face]))edge.vertices.forEach(v=>unsafeBoundaryVertices.add(v));
    if(edge.incidents.length===1){boundaryCount++;continue;}if(edge.incidents.length!==2){nonmanifoldCount++;edge.vertices.forEach(v=>unsafeBoundaryVertices.add(v));continue;}
    const [a,b]=edge.incidents;if(a.direction===b.direction){orientationCount++;edge.vertices.forEach(v=>unsafeBoundaryVertices.add(v));continue;}if(bad[a.face]||bad[b.face])continue;neighbors[a.face*3+a.side]=b.face;neighbors[b.face*3+b.side]=a.face;
  }
  const boundaryAt=new Map();for(const edge of edges.values()){tick(edgeIndex++,signal);if(edge.incidents.length===1&&!bad[edge.incidents[0].face])for(const v of edge.vertices){const list=boundaryAt.get(v)??[];list.push(edge);boundaryAt.set(v,list);}}
  const result={mesh,geometryDigest:meshSelectionGeometryDigest(mesh,{signal}),...counts,representatives,edges,faceEdges,neighbors,bad,boundaryAt,unsafeBoundaryVertices,diagnostics:{degenerateCount,duplicateCount,nonmanifoldCount,orientationCount,boundaryCount}};
  aborted(signal);if(frozen(mesh)&&limits===MESH_SELECTION_LIMITS)topologyCache.set(mesh,result);return result;
}
function validTriangle(topology,index){if(!Number.isSafeInteger(index)||index<0||index>=topology.triangles)fail('Ein originales Dreieck des ausgewählten Netzes anklicken.');if(topology.bad[index]===1)fail('Das getroffene Dreieck hat keine eindeutige Fläche. Ein anderes Dreieck wählen.','MESH_SELECTION_DEGENERATE');if(topology.bad[index]===2)fail('Hier liegen doppelte oder deckungsgleiche Dreiecke. Die Fläche ist nicht eindeutig auswählbar.','MESH_SELECTION_AMBIGUOUS');}
function surfaceNormals(topology,transform,signal){
  // A surface click only needs the faces reached by angle-limited growth.
  // Keep at most one affine placement per immutable topology; mutable drafts
  // get a fresh query-local cache so an in-place edit is still observed.
  const immutable=frozen(topology.mesh);let record=immutable&&surfaceNormalCache.get(topology);
  if(!record||!record.transform.every((v,i)=>v===transform[i])){
    record={transform:[...transform],normals:new Array(topology.triangles)};
    if(immutable)surfaceNormalCache.set(topology,record);
  }
  return face=>{tick(face,signal);if(record.normals[face]===undefined)record.normals[face]=topology.bad[face]?null:faceNormal(topology.mesh.verts,topology.mesh.triangles.slice(face*3,face*3+3),transform);return record.normals[face];};
}
function connected(topology,start,{normalAt,cosine,signal}={}){
  const seen=new Uint8Array(topology.triangles),queue=[start];seen[start]=1;
  for(let head=0;head<queue.length;head++){tick(head,signal);const face=queue[head];for(let side=0;side<3;side++){const next=topology.neighbors[face*3+side];if(next<0||seen[next])continue;if(normalAt){const a=normalAt(face),b=normalAt(next);if(!a||!b||a.reduce((sum,v,i)=>sum+v*b[i],0)<cosine-1e-12)continue;}seen[next]=1;queue.push(next);}}
  return queue;
}
function pointWorld(verts,id,m){const p=verts.slice(id*3,id*3+3);return [0,1,2].map(row=>m[row]*p[0]+m[4+row]*p[1]+m[8+row]*p[2]+m[12+row]);}
function distanceSquared(point,a,b){const d=b.map((n,i)=>n-a[i]),scale=Math.max(...d.map(Math.abs));if(!scale)return Infinity;const u=d.map(n=>n/scale),length=u.reduce((s,n)=>s+n*n,0),t=Math.min(1,Math.max(0,point.reduce((s,n,i)=>s+(n-a[i])/scale*u[i],0)/length));return Math.hypot(...point.map((n,i)=>n-(a[i]+t*d[i])))**2;}
function boundary(topology,request,transform,signal){
  const faces=connected(topology,request.triangleIndex,{signal}),component=new Set(faces),candidates=[];
  for(let i=0;i<faces.length;i++){tick(i,signal);const face=faces[i];for(let side=0;side<3;side++){const edge=topology.faceEdges[face*3+side];if(edge?.incidents.length===1)candidates.push(edge);}}
  if(!candidates.length)fail('Dieser zusammenhängende Netzbereich besitzt keinen eindeutigen offenen Rand. An einer tatsächlichen Öffnung klicken.','MESH_SELECTION_NO_BOUNDARY');
  let chosen,tiedEdges=[];
  if(request.edgeId!==undefined){chosen=candidates.find(e=>e.id===request.edgeId);if(!chosen)fail('Die gewählte Kante ist kein offener Rand dieses Netzbereichs.');}
  else{
    let point=request.point;if(point===undefined){const ids=topology.mesh.triangles.slice(request.triangleIndex*3,request.triangleIndex*3+3),points=ids.map(i=>pointWorld(topology.mesh.verts,i,transform));point=[0,1,2].map(i=>points.reduce((s,p)=>s+p[i],0)/3);}
    if(!Array.isArray(point)||point.length!==3||point.some(v=>typeof v!=='number'||!Number.isFinite(v)))fail('Der angeklickte Flächenpunkt ist ungültig.');
    let nearest=Infinity;for(let i=0;i<candidates.length;i++){
      tick(i,signal);const edge=candidates[i],d=distanceSquared(point,...edge.vertices.map(v=>pointWorld(topology.mesh.verts,v,transform)));if(!Number.isFinite(d))continue;
      const tolerance=Number.EPSILON*128*Math.max(Number.MIN_VALUE,Math.abs(d),Math.abs(nearest));
      if(!chosen||d<nearest-tolerance){nearest=d;chosen=edge;tiedEdges=[edge];}
      else if(Math.abs(d-nearest)<=tolerance)tiedEdges.push(edge);
    }
  }
  if(!chosen)fail('Der Öffnungsrand kann in dieser Objektlage nicht zuverlässig bestimmt werden.');
  const start=chosen.vertices[0],ordered=[start],selected=[],seen=new Set();let vertex=start,edge=chosen;
  while(true){
    tick(selected.length,signal);if(seen.has(edge.id))fail('Der offene Rand ist verzweigt oder läuft mehrfach über dieselbe Kante. Näher an einem einfachen Öffnungsrand klicken.','MESH_SELECTION_AMBIGUOUS');
    seen.add(edge.id);selected.push({id:edge.id,vertices:[...edge.vertices]});
    const atStart=topology.boundaryAt.get(vertex)??[];if(atStart.length!==2||topology.unsafeBoundaryVertices.has(vertex))fail('Der Öffnungsrand ist verzweigt, berührt einen anderen Rand oder ist nicht geschlossen. Ein einfacher geschlossener Randring wird benötigt.','MESH_SELECTION_AMBIGUOUS');
    const next=edge.vertices[0]===vertex?edge.vertices[1]:edge.vertices[0];
    const atNext=topology.boundaryAt.get(next)??[];if(atNext.length!==2||topology.unsafeBoundaryVertices.has(next)||atNext.some(e=>!component.has(e.incidents[0].face)))fail('Der Öffnungsrand berührt einen anderen Netzbereich oder ist nicht geschlossen. Ein eindeutiger Randring wird benötigt.','MESH_SELECTION_AMBIGUOUS');
    if(next===start)break;ordered.push(next);edge=atNext.find(e=>e.id!==edge.id);vertex=next;
    if(selected.length>topology.edges.size)fail('Der Öffnungsrand konnte nicht begrenzt verfolgt werden.');
  }
  if(selected.length<3)fail('Der Öffnungsrand besitzt zu wenige eindeutige Kanten.');
  if(tiedEdges.some(edge=>!seen.has(edge.id)))fail('Mehrere Öffnungsränder sind gleich nah. Näher am gewünschten Rand klicken.','MESH_SELECTION_AMBIGUOUS');
  return {triangleIds:[],incidentTriangleIds:[...new Set(selected.map(e=>topology.edges.get(key(...e.vertices)).incidents[0].face))].sort((a,b)=>a-b),boundaryEdges:selected,boundaryVertexIds:ordered};
}
export function queryMeshSelection(topology,request,{transform=IDENTITY,signal,objectId='mesh'}={}){
  aborted(signal);if(!request||!MODES.has(request.mode))fail('Dreieck, Fläche, Bereich oder Öffnungsrand als Auswahlart wählen.');matrix(transform);validTriangle(topology,request.triangleIndex);
  const angleDegrees=request.angleDegrees??30;if(typeof angleDegrees!=='number'||!Number.isFinite(angleDegrees)||angleDegrees<0||angleDegrees>180)fail('Der Nachbarwinkel muss zwischen 0 und 180 Grad liegen.');
  let result={triangleIds:[],boundaryEdges:[]};
  if(request.mode==='triangle')result.triangleIds=[request.triangleIndex];
  else if(request.mode==='boundary')result=boundary(topology,request,transform,signal);
  else{
    let normalAt;if(request.mode==='surface'){normalAt=surfaceNormals(topology,transform,signal);if(!normalAt(request.triangleIndex))fail('Das getroffene Dreieck hat in dieser Objektlage keine eindeutige Fläche.');}
    result.triangleIds=connected(topology,request.triangleIndex,{normalAt,cosine:Math.cos(angleDegrees*Math.PI/180),signal}).sort((a,b)=>a-b);
  }
  const warnings=[];if(topology.diagnostics.nonmanifoldCount)warnings.push('Mehrdeutige Kanten werden nicht überschritten.');if(topology.diagnostics.orientationCount)warnings.push('Kanten mit widersprüchlicher Flächenrichtung werden nicht überschritten.');if(topology.diagnostics.degenerateCount||topology.diagnostics.duplicateCount)warnings.push('Entartete und doppelte Dreiecke werden bei der Bereichsauswahl nicht überschritten.');
  aborted(signal);return {format:'FormnaroMeshSelection',version:1,objectId,geometryDigest:topology.geometryDigest,mode:request.mode,angleDegrees,...result,warnings,summary:{selectedTriangles:result.triangleIds.length,selectedBoundaryEdges:result.boundaryEdges.length,totalTriangles:topology.triangles,...topology.diagnostics}};
}

/** Strict serializable binding. Supplying a node additionally verifies every
 * original ID and every edge against that exact current geometry. */
export function validateMeshSelectionBinding(value,{node}={}){
  if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail('Ungültiger gespeicherter Auswahlbezug.');
  const allowed=['format','version','objectId','geometryDigest','triangleIds','boundaryEdges'];
  if(Object.keys(value).some(k=>!allowed.includes(k))||value.version!==1||value.format!=='FormnaroMeshSelection'||typeof value.objectId!=='string'||!value.objectId.trim()||value.objectId.length>200||typeof value.geometryDigest!=='string'||!(/^[0-9a-f]{64}$/).test(value.geometryDigest)||!Array.isArray(value.triangleIds)||!Array.isArray(value.boundaryEdges)||value.triangleIds.length>MESH_SELECTION_LIMITS.triangles||value.boundaryEdges.length>MESH_SELECTION_LIMITS.edges)fail('Ungültiger gespeicherter Auswahlbezug.');
  const ids=new Set();for(const id of value.triangleIds){if(!Number.isSafeInteger(id)||id<0||id>=MESH_SELECTION_LIMITS.triangles||ids.has(id))fail('Ungültige oder doppelte originale Dreiecksnummer.');ids.add(id);}
  const edges=new Set();for(const edge of value.boundaryEdges){if(!edge||Object.keys(edge).some(k=>!['id','vertices'].includes(k))||!Array.isArray(edge.vertices)||edge.vertices.length!==2||edge.vertices.some(i=>!Number.isSafeInteger(i)||i<0||i>=MESH_SELECTION_LIMITS.vertices)||edge.vertices[0]>=edge.vertices[1]||edge.id!==edgeId(...edge.vertices)||edges.has(edge.id))fail('Ungültiger oder doppelter originaler Randkantenbezug.');edges.add(edge.id);}
  if(node){
    if(node.kind!=='mesh'||node.id!==value.objectId||meshSelectionGeometryDigest(node)!==value.geometryDigest)fail('Die Netzgeometrie wurde geändert oder entfernt. Flächen erneut auswählen.','MESH_SELECTION_STALE');
    if(!frozen(node.mesh)||!verifiedBindings.get(node.mesh)?.has(JSON.stringify(value))){
      const topology=buildMeshSelectionTopology(node.mesh);for(const id of ids)validTriangle(topology,id);for(const edge of value.boundaryEdges){const actual=topology.edges.get(key(...edge.vertices));if(!actual||actual.incidents.length!==1||topology.bad[actual.incidents[0].face])fail('Die gespeicherte Kante ist kein eindeutiger Originalrand.','MESH_SELECTION_STALE');}
      rememberBinding(node.mesh,value);
    }
  }
  return {format:'FormnaroMeshSelection',version:1,objectId:value.objectId,geometryDigest:value.geometryDigest,triangleIds:[...value.triangleIds].sort((a,b)=>a-b),boundaryEdges:value.boundaryEdges.map(e=>({id:e.id,vertices:[...e.vertices]})).sort((a,b)=>a.vertices[0]-b.vertices[0]||a.vertices[1]-b.vertices[1])};
}
function binding(value){const {format,version,objectId,geometryDigest,triangleIds,boundaryEdges}=value;return validateMeshSelectionBinding({format,version,objectId,geometryDigest,triangleIds,boundaryEdges});}
export function combineMeshSelection(previous,incoming,operation='replace'){
  if(!['replace','add','subtract','toggle'].includes(operation))fail('Ungültige Auswahlverknüpfung.');const next=binding(incoming);
  if(operation==='replace')return next.triangleIds.length||next.boundaryEdges.length?next:null;
  if(!previous)return operation==='subtract'?null:next.triangleIds.length||next.boundaryEdges.length?next:null;
  const old=binding(previous);if(old.objectId!==next.objectId||old.geometryDigest!==next.geometryDigest)fail('Auswahlen verschiedener Netze oder Geometriestände können nicht verbunden werden.','MESH_SELECTION_STALE');
  function combine(a,b,getKey){const result=new Map(a.map(v=>[getKey(v),v]));for(const v of b){const k=getKey(v);if(operation==='subtract'||operation==='toggle'&&result.has(k))result.delete(k);else result.set(k,v);}return [...result.values()];}
  const triangleIds=combine(old.triangleIds,next.triangleIds,v=>v).sort((a,b)=>a-b),boundaryEdges=combine(old.boundaryEdges,next.boundaryEdges,e=>e.id).sort((a,b)=>a.vertices[0]-b.vertices[0]||a.vertices[1]-b.vertices[1]);
  return triangleIds.length||boundaryEdges.length?{format:'FormnaroMeshSelection',version:1,objectId:next.objectId,geometryDigest:next.geometryDigest,triangleIds,boundaryEdges}:null;
}

/** A private worker keeps topology building off the UI thread. Cancelling or
 * disposing terminates only this service's worker, including a dense build.
 * One worker caches only its latest geometry; no project or cloud access. */
export function createMeshSelectionService({workerFactory}={}){
  let worker=null,workerMesh=null,pending=null,sequence=0,disposed=false;
  function stop(reason){worker?.terminate();worker=null;workerMesh=null;if(pending){const p=pending;pending=null;p.cleanup();p.reject(reason);}}
  function abortError(){const error=new Error('Netzauswahl abgebrochen.');error.name='AbortError';error.code='ABORTED';return error;}
  async function calculate(node,request,{signal,action='query',value}={}){
      if(disposed)fail('Das Auswahlwerkzeug wurde geschlossen.');if(node?.kind!=='mesh'||typeof node.id!=='string'||!node.id.trim())fail('Ein Netzteil auswählen.');aborted(signal);if(pending)stop(abortError());
      // Validate size before structured cloning a dense payload into the worker.
      if(!node.mesh?.verts||!node.mesh?.triangles||node.mesh.verts.length/3>MESH_SELECTION_LIMITS.vertices||node.mesh.triangles.length/3>MESH_SELECTION_LIMITS.triangles)arrays(node.mesh,{signal});
      const make=workerFactory??(typeof Worker==='function'?()=>new Worker(new URL('./mesh-selection-worker.js',import.meta.url),{type:'module'}):null);
      if(!make&&action==='inspect'){const {inspectMeshTopology}=await import('./mesh-inspector.js');return inspectMeshTopology(buildMeshSelectionTopology(node.mesh,{signal}),{...request,objectId:node.id,signal});}
      if(!make&&action==='holeCatalog'){const {holeFillCatalog}=await import('./mesh-hole-fill.js');return {...holeFillCatalog(buildMeshSelectionTopology(node.mesh,{signal}),{...request,signal}),objectId:node.id};}
      if(!make&&action==='repairCatalog'){const {simpleRepairCatalog}=await import('./mesh-simple-repair.js');return {...simpleRepairCatalog(buildMeshSelectionTopology(node.mesh,{signal}),{...request,signal}),objectId:node.id};}
      if(!make&&action==='screen'){const {createMeshScreenIndex,queryMeshScreenSelection}=await import('./mesh-selection-screen.js');return queryMeshScreenSelection(createMeshScreenIndex(node,request.context,{signal}),request,{signal});}
      if(!make){await Promise.resolve();aborted(signal);return action==='digest'?meshSelectionGeometryDigest(node.mesh,{signal}):action==='validate'?validateMeshSelectionBinding(value,{node}):queryMeshSelection(buildMeshSelectionTopology(node.mesh,{signal}),request,{transform:node.transform??IDENTITY,signal,objectId:node.id});}
      if(!worker)worker=make();const owner=worker,id=++sequence;
      return new Promise((resolve,reject)=>{
        const onAbort=()=>stop(abortError()),cleanup=()=>signal?.removeEventListener('abort',onAbort);pending={id,resolve,reject,cleanup};signal?.addEventListener('abort',onAbort,{once:true});
        owner.onmessage=event=>{const message=event.data;if(worker!==owner||!pending||message.id!==pending.id)return;const p=pending;pending=null;p.cleanup();if(message.error){const error=new Error(message.error.message);error.name=message.error.name??'Error';error.code=message.error.code;p.reject(error);}else{try{
          const result=message.result,digest=action==='digest'?result:result?.geometryDigest;if(typeof digest!=='string'||!(/^[0-9a-f]{64}$/).test(digest))fail('Ungültige Antwort der Hintergrundberechnung.');
          // Structured cloning a deeply immutable confirmed payload cannot race
          // an in-place edit. Keep its worker-computed SHA without a second
          // synchronous JSON/SHA pass on the UI thread (dense meshes take >1s).
          if(frozen(node.mesh)){digestCache.set(node.mesh,digest);workerMesh=node.mesh;}
          else if(action!=='digest'&&digest!==meshSelectionGeometryDigest(node.mesh))fail('Die Netzgeometrie wurde während der Auswahl geändert. Erneut auswählen.','MESH_SELECTION_STALE');
          if(['inspect','repairCatalog','holeCatalog'].includes(action)&&result.objectId!==node.id)fail('Die Diagnose gehört zu einem anderen Netz.');
          if(!['digest','inspect','repairCatalog','holeCatalog'].includes(action)){const confirmed=binding(result);if(confirmed.objectId!==node.id)fail('Die Auswahl gehört zu einem anderen Netz.','MESH_SELECTION_STALE');rememberBinding(node.mesh,confirmed);}p.resolve(result);
        }catch(error){p.reject(error);}}};
        owner.onerror=event=>{if(worker===owner)stop(new Error(`Netzauswahl: Hintergrundberechnung fehlgeschlagen. ${event.message??''}`));};
        try{const reuse=frozen(node.mesh)&&workerMesh===node.mesh;owner.postMessage({id,action,value,node:{id:node.id,kind:node.kind,...(reuse?{cachedGeometryDigest:digestCache.get(node.mesh)}:{mesh:node.mesh}),transform:node.transform??IDENTITY},request});}catch(error){stop(error);}
      });
  }
  return {
    geometryDigest(nodeOrMesh,{signal}={}){const mesh=nodeOrMesh?.mesh??nodeOrMesh;aborted(signal);const cached=frozen(mesh)&&digestCache.get(mesh);if(cached)return Promise.resolve(cached);const node=nodeOrMesh?.mesh?nodeOrMesh:{id:'mesh-selection-digest',kind:'mesh',mesh,transform:IDENTITY};return calculate(node,null,{signal,action:'digest'});},
    query(node,request,options){return calculate(node,request,options);},
    inspect(node,request,options={}){return calculate(node,request,{...options,action:'inspect'});},
    holeCatalog(node,request,options={}){return calculate(node,request,{...options,action:'holeCatalog'});},
    repairCatalog(node,request,options={}){return calculate(node,request,{...options,action:'repairCatalog'});},
    screen(node,request,options={}){return calculate(node,request,{...options,action:'screen'});},
    validate(value,node,options={}){const clean=validateMeshSelectionBinding(value);return calculate(node,null,{...options,action:'validate',value:clean});},
    cancel(){stop(abortError());},dispose(){disposed=true;stop(abortError());}
  };
}
