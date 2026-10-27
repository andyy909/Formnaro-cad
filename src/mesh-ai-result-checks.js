import {Matrix4,Quaternion,Vector3} from 'three';
import {validateAIResultChecks,resolveAIResultTarget,aiCheckFailure} from './cad-ai-result-checks.js';
import {meshTopologyClass} from './project-objects.js';
import {flags} from './organization.js';
import {measureMeshRadialClearance} from './mesh-radial-clearance.js';

export function checkMeshAIResults({kernel,project,checks,aliases={}}){
 const requested=validateAIResultChecks(checks),scene={objects:project.nodes.map(n=>({id:n.id,kind:n.kind,target:{rootId:n.id,path:[]},hidden:flags(n,project).hidden}))},reports=[];
 for(const [index,check]of requested.entries()){
  const object=resolveAIResultTarget(scene,check.target,aliases),node=project.nodes.find(n=>n.id===object.id),owned=[],own=v=>(owned.push(v),v);
  if(node?.kind!=='mesh'||object.hidden||node.meshRole==='hole'||!['volume','solids','clearance','radialClearance'].includes(check.kind)||meshTopologyClass(node.mesh).type!=='closedMesh')throw Object.assign(Error('Ein sichtbares, geschlossenes Material-Netzteil für die Körperprüfung wählen.'),{code:'AI_CHECK_UNSUPPORTED'});
  if(check.kind==='radialClearance'){
   const reference=resolveAIResultTarget(scene,check.other,aliases),other=project.nodes.find(n=>n.id===reference.id);
   if(reference.hidden)throw Object.assign(Error('Ein sichtbares Referenzteil wählen.'),{code:'AI_CHECK_UNSUPPORTED'});
   const {target:ignored,kind,...options}=check,actual=measureMeshRadialClearance({kernel,target:node,other,options});
   if(!actual.passed)throw aiCheckFailure(check,index+1,actual);
   reports.push({kind:check.kind,target:object.target,other:reference.target,expected:check.expected,actual,tolerance:check.tolerance??.01,passed:true,evidence:'mesh-kernel'});continue;
  }
  try{
   const raw=new kernel.Mesh({numProp:3,vertProperties:new Float32Array(node.mesh.verts),triVerts:new Uint32Array(node.mesh.triangles)});raw.merge();const local=own(new kernel.Manifold(raw)),body=own(local.transform(node.transform));
   if(body.status()!=='NoError'||body.isEmpty()||body.volume()<=0)throw Object.assign(Error('Das Netz ist kein geprüfter Materialkörper.'),{code:'AI_CHECK_UNSUPPORTED'});
   const tolerance=check.tolerance??.01;let actual;
   if(check.kind==='volume')actual=body.volume();
   if(check.kind==='solids')actual=body.decompose().map(own).length;
   if(check.kind==='clearance'){
    const delta=check.to.map((v,k)=>v-check.from[k]),length=Math.hypot(...delta),direction=delta.map(v=>v/length),box=body.boundingBox();let near=0,far=length;
    for(let k=0;k<3;k++)if(Math.abs(direction[k])<1e-14){if(check.from[k]<box.min[k]||check.from[k]>box.max[k])near=Infinity;}else{const a=(box.min[k]-check.from[k])/direction[k],b=(box.max[k]-check.from[k])/direction[k];near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));}
    if(far-near<=1e-6)throw Object.assign(Error('Prüfkorridor liegt außerhalb des Zielteils.'),{code:'AI_CHECK_INVALID'});
    // Circumscribe the requested circular corridor, rather than testing an
    // inscribed polygon that could miss material between polygon corners.
    const numericalMargin=Math.max(1,...box.min.map(Math.abs),...box.max.map(Math.abs),...check.from.map(Math.abs),...check.to.map(Math.abs),length)*2**-21;
    if(tolerance<=numericalMargin*4)throw Object.assign(Error('Die verlangte Toleranz ist für die Netzkoordinaten zu klein.'),{code:'AI_CHECK_UNAVAILABLE'});
    const segments=256,radius=check.diameter/2-tolerance,safety=numericalMargin*4,matrix=new Matrix4().compose(new Vector3(...check.from.map((v,k)=>v-direction[k]*safety)),new Quaternion().setFromUnitVectors(new Vector3(0,0,1),new Vector3(...direction)),new Vector3(1,1,1));
    const probeRadius=(radius+safety)/Math.cos(Math.PI/segments),cylinder=own(kernel.Manifold.cylinder(length+2*safety,probeRadius,probeRadius,segments)),placed=own(cylinder.transform(matrix.toArray())),hit=own(body.intersect(placed));
    if(hit.status()!=='NoError')throw Object.assign(Error('Der Netzkorridor konnte nicht eindeutig geprüft werden.'),{code:'AI_CHECK_UNAVAILABLE'});
    actual={clear:hit.isEmpty(),obstructingVolume:Math.max(0,hit.volume()),diameterChecked:2*radius,segments,numericalMargin,method:'circumscribed-mesh-cylinder'};
    if(!actual.clear)throw aiCheckFailure(check,index+1,actual.obstructingVolume);
   }else if(Math.abs(actual-check.expected)>(check.kind==='solids'?0:tolerance))throw aiCheckFailure(check,index+1,actual);
   reports.push({kind:check.kind,target:object.target,expected:check.expected??check.diameter,actual,tolerance:check.kind==='solids'?0:tolerance,passed:true,evidence:'mesh-kernel'});
  }finally{for(const v of owned.reverse())v.delete();}
 }
 return {version:1,checks:reports,scope:'Verified closed mesh bodies; corridor uses a circumscribed polygonal cylinder with the reported radial allowance. No exact bore diameter, surrounding wall or physical print fit is inferred.'};
}
