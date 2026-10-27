// Native workplane correspondence after rebuilding CAD. Uses exact trimmed
// face projection plus native surface normals. Lost/ambiguous references
// detach while the last spatial plane pose stays available to the user.
import {Matrix4,Quaternion,Vector3} from 'three';
import {cadProjectSnapshot} from './cad-project.js';
import {cadIdentity,cadPoint,multiplyCadMatrices,inverseCadMatrix} from './cad-affine.js';
import {cadBounds,cadRayHits,cadNativeCapabilities,readCadBrep,transformCad} from './cad-native-kernel.js';
import {cadWorkplaneFromHit} from './cad-tools-native.js';

function unit(v){if(!Array.isArray(v)||v.length!==3||!v.every(Number.isFinite))throw Error('CAD-Flächenanker benötigt eine endliche Normale.');const largest=Math.max(...v.map(Math.abs));if(!largest)throw Error('CAD-Flächenanker benötigt eine endliche Normale.');const scaled=v.map(x=>x/largest),length=Math.hypot(...scaled);return scaled.map(x=>x/length);}
function normal(matrix,n){const inverse=inverseCadMatrix(matrix);return unit([0,1,2].map(row=>inverse[row*4]*n[0]+inverse[row*4+1]*n[1]+inverse[row*4+2]*n[2]));}
const near=(a,b,tol)=>Math.hypot(...a.map((v,k)=>v-b[k]))<=tol;
function faces(oc,shape){const explorer=new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum.TopAbs_FACE),items=[],buckets=new Map();try{while(explorer.More()){const raw=explorer.Current();try{const hash=oc.ReplicadShapeHasher.HashCode(raw,2147483647),bucket=buckets.get(hash)||[];if(!bucket.some(face=>face.IsSame(raw))){const face=oc.TopoDS.Face(raw);items.push(face);bucket.push(face);buckets.set(hash,bucket);}}finally{raw.delete();}if(items.length>8000)throw Error('CAD-Flächenzuordnung überschreitet die Projektgrenze.');explorer.Next();}return items;}catch(error){items.forEach(face=>face.delete());throw error;}finally{explorer.delete();}}

/** An exact per-trimmed-face closest projection. Returned matches contain
 * native normal evaluations; neither face indices nor triangle normals are
 * used as persistent identity. Multiple matches are deliberately preserved. */
export function projectCadFaceAnchorNative(oc,shape,anchor,{tolerance=1e-6}={}){
  if(!cadNativeCapabilities(oc).rayHits)throw Error('CAD-Flächenneuzuordnung benötigt die native Strahl-/Normalschnittstelle.');
  if(!Number.isFinite(tolerance)||tolerance<=0||tolerance>1e-4||!Array.isArray(anchor?.point)||anchor.point.length!==3||!anchor.point.every(Number.isFinite)||!Array.isArray(anchor.normal)||anchor.normal.length!==3)throw Error('Ungültiger CAD-Flächenanker.');
  const n=unit(anchor.normal),point=new oc.gp_Pnt(...anchor.point),maker=new oc.BRepBuilderAPI_MakeVertex(point),vertex=maker.Vertex(),list=faces(oc,shape),matches=[];
  try{for(const face of list){const distance=new oc.BRepExtrema_DistShapeShape(vertex,face);try{
    if(!distance.IsDone()||!Number.isFinite(distance.Value()))throw Error('Nativer CAD-Flächenprojektor fehlgeschlagen.');if(distance.Value()>tolerance||distance.NbSolution()<1)continue;
    const value=distance.PointOnShape2(1);let projected;try{projected=[value.X(),value.Y(),value.Z()];}finally{value.delete();}
    const offset=Math.max(1e-4,tolerance*16),origin=projected.map((v,k)=>v+n[k]*offset),hits=cadRayHits(oc,face,{origin,direction:n.map(v=>-v),near:0,far:2*offset,tolerance:Math.min(1e-7,tolerance/4)});
    const relevant=hits.filter(hit=>near(hit.point,projected,tolerance)&&new Vector3(...unit(hit.normal)).dot(new Vector3(...n))>1-1e-8);
    if(relevant.length===1)matches.push({point:[...relevant[0].point],normal:unit(relevant[0].normal)});
  }finally{distance.delete();}}return matches;}
  finally{list.forEach(face=>face.delete());vertex.delete();maker.delete();point.delete();}
}

function sourceNode(root,path){let node=root,matrix=cadIdentity();for(const id of path){node=node.children?.find(child=>child.id===id);if(!node||node.suppressed)return null;matrix=multiplyCadMatrices(matrix,node.transform);}return {node,matrix};}
function cylinderAnchor(oc,topology,root,oldRoot){
  const feature=topology.origin.featureId;if(!['cylinder-face-top','cylinder-face-bottom','cylinder-face-side'].includes(feature))return null;
  const source=sourceNode(root,topology.origin.path);if(!source||source.node.source!=='native'||source.node.recipe?.type!=='cylinder')return null;
  const fresh=readCadBrep(oc,source.node.brep.data);let previous;
  try{
    const b=cadBounds(oc,fresh),oldCandidate=oldRoot&&sourceNode(oldRoot,topology.origin.path),oldSource=oldCandidate?.node.source==='native'&&oldCandidate.node.recipe?.type==='cylinder'?oldCandidate:null,old=oldSource?readCadBrep(oc,oldSource.node.brep.data):null;previous=old;
    const point=cadPoint(inverseCadMatrix(oldSource?.matrix??source.matrix),topology.anchor.point),oldBounds=old?cadBounds(oc,old):b;let n;
    if(feature==='cylinder-face-top'||feature==='cylinder-face-bottom'){point[2]=feature==='cylinder-face-top'?b.max[2]:b.min[2];n=[0,0,feature==='cylinder-face-top'?1:-1];}
    else{const angle=Math.atan2((point[1]-oldBounds.center[1])/(oldBounds.size[1]/2),(point[0]-oldBounds.center[0])/(oldBounds.size[0]/2)),rx=b.size[0]/2,ry=b.size[1]/2,ratio=(point[2]-oldBounds.min[2])/oldBounds.size[2];point[0]=b.center[0]+rx*Math.cos(angle);point[1]=b.center[1]+ry*Math.sin(angle);point[2]=b.min[2]+ratio*b.size[2];n=unit([Math.cos(angle)/rx,Math.sin(angle)/ry,0]);}
    if(!source.node.solid)n=n.map(v=>-v);
    return {point:cadPoint(source.matrix,point),normal:normal(source.matrix,n)};
  }finally{previous?.delete();fresh.delete();}
}

/** Returns a complete strict project snapshot. Call after a real service
 * rebuild, with baseline when recipes changed. Callback returns a current
 * root-local native geometric anchor or null for a lost source feature. */
export function rebindCadWorkplaneNative(oc,input,{baseline,resolveSourceFeature,tolerance=1e-6}={}){
  if(input.workplane?.reference?.kind==='mesh')return cadProjectSnapshot(input);
  const candidate=structuredClone(input);if(candidate.workplane?.reference&&Array.isArray(candidate.nodes)&&!candidate.nodes.some(node=>node.kind==='cad'&&node.id===candidate.workplane.reference.objectId))candidate.workplane.reference=null;
  const p=cadProjectSnapshot(candidate),reference=p.workplane.reference;if(!reference)return p;
  const root=p.nodes.find(node=>node.id===reference.objectId&&node.kind==='cad');if(!root){p.workplane.reference=null;return p;}
  const original=structuredClone(p.workplane),topology=reference.topology,oldRoot=baseline&&cadProjectSnapshot(baseline).nodes.find(node=>node.id===reference.objectId);let expected;
  if(topology.origin.featureId){if(resolveSourceFeature)expected=resolveSourceFeature({reference:structuredClone(reference),root,oldRoot});if(!expected)expected=cylinderAnchor(oc,topology,root,oldRoot);if(!expected){p.workplane.reference=null;return p;}}
  else expected=structuredClone(topology.anchor);
  if(!expected.normal){p.workplane.reference=null;return p;}
  const local=readCadBrep(oc,root.brep.data);let world;
  try{world=transformCad(oc,local,root.transform);const projected=projectCadFaceAnchorNative(oc,world,{point:cadPoint(root.transform,expected.point),normal:normal(root.transform,expected.normal)},{tolerance});
    if(projected.length!==1){p.workplane=original;p.workplane.reference=null;return p;}
    const replacement=cadWorkplaneFromHit({objectId:root.id,...projected[0]},{transform:root.transform});replacement.reference.topology.origin=structuredClone(topology.origin);
    // Keep the previous in-plane direction when possible. Rotating only the
    // normal should not introduce a gratuitous spin of the ruler/grid axes.
    const oldTangent=new Vector3(1,0,0).applyQuaternion(new Quaternion(...original.orientation)),n=new Vector3(...projected[0].normal);oldTangent.addScaledVector(n,-oldTangent.dot(n));
    if(oldTangent.lengthSq()>1e-16){oldTangent.normalize();const y=new Vector3().crossVectors(n,oldTangent),orientation=new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(oldTangent,y,n)).normalize();replacement.orientation=orientation.toArray();const inverse=inverseCadMatrix(root.transform),localTangent=[0,1,2].map(row=>inverse[row]*oldTangent.x+inverse[4+row]*oldTangent.y+inverse[8+row]*oldTangent.z);replacement.reference.topology.anchor.tangent=unit(localTangent);}
    p.workplane=replacement;return cadProjectSnapshot(p);
  }finally{world?.delete();local.delete();}
}
