import {Matrix4,Vector3} from 'three';
import {readCadBrep,cadBoolean,cadClassifyPoint} from './cad-native-kernel.js';
const ev=x=>x?.value??x,xyz=p=>[p.X(),p.Y(),p.Z()];
const fail=message=>{throw Object.assign(Error(message),{code:'AI_CHECK_UNAVAILABLE'});};
function scope(){const values=[];return {keep:v=>(values.push(v),v),close:()=>values.reverse().forEach(v=>v?.delete?.())};}
function cylinder(oc,s,origin,axis,radius,depth){
 const p=s.keep(new oc.gp_Pnt(...origin)),d=s.keep(new oc.gp_Dir(...axis)),a=s.keep(new oc.gp_Ax2(p,d));
 return s.keep(s.keep(new oc.BRepPrimAPI_MakeCylinder(a,radius,depth)).Shape());
}
// Analytic full cylindrical walls only. No triangle fitting or source-size
// inference. Rigid/mirrored/uniform world placement preserves native circles.
export function measureCadBore({oc,project,object,check}){
 if(object.kind!=='cad'||object.target.path.length||!object.solid||object.hidden)fail('Bohrungsprüfung benötigt einen sichtbaren fertigen nativen CAD-Körper.');
 const node=project.nodes.find(n=>n.id===object.target.rootId),matrix=new Matrix4().fromArray(object.worldMatrix),cols=[0,1,2].map(i=>new Vector3().setFromMatrixColumn(matrix,i)),scale=cols[0].length();
 if(!Number.isFinite(scale)||scale<1e-8||cols.some(c=>Math.abs(c.length()-scale)>scale*1e-8)||cols.some((c,i)=>cols.some((d,j)=>i!==j&&Math.abs(c.dot(d))>scale*scale*1e-8)))fail('Bohrungsprüfung: Scherung oder ungleiche Skalierung ergibt keine kreisrunde Bohrung.');
 const targetFrom=new Vector3(...check.from),targetTo=new Vector3(...check.to),wantedAxis=targetTo.clone().sub(targetFrom).normalize(),tolerance=check.tolerance??.01,s=scope(),rows=[];
 try{
  const shape=s.keep(readCadBrep(oc,node.brep.data)),explorer=s.keep(new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum.TopAbs_FACE));let count=0;
  while(explorer.More()){
   if(++count>8000)fail('Bohrungsprüfung: zu viele native Flächen.');
   const f=scope();try{
    const face=f.keep(oc.TopoDS.Face(f.keep(explorer.Current()))),ad=f.keep(new oc.BRepAdaptor_Surface(face,true));
    if(ev(ad.GetType())!==ev(oc.GeomAbs_SurfaceType.GeomAbs_Cylinder))continue;
    const cy=f.keep(ad.Cylinder()),axis=f.keep(cy.Axis()),dir=xyz(f.keep(axis.Direction())),loc=xyz(f.keep(axis.Location())),r=cy.Radius(),v0=ad.FirstVParameter(),v1=ad.LastVParameter();
    if(![r,v0,v1].every(Number.isFinite)||r<=0||v1-v0<1e-5||Math.abs(ad.LastUParameter()-ad.FirstUParameter()-2*Math.PI)>1e-7)continue;
    // Full circular rims exclude interrupted holes and rectangular UV bounds
    // that would otherwise conceal trimmed-away wall regions.
    const edges=f.keep(new oc.TopExp_Explorer(face,oc.TopAbs_ShapeEnum.TopAbs_EDGE));let rings=0,complete=true;
    while(edges.More()){
     const e=f.keep(oc.TopoDS.Edge(f.keep(edges.Current())));if(!oc.BRep_Tool.IsClosed(e,face)){
      const c=f.keep(new oc.BRepAdaptor_Curve(e));if(ev(c.GetType())!==ev(oc.GeomAbs_CurveType.GeomAbs_Circle)||!c.IsClosed()||Math.abs(c.LastParameter()-c.FirstParameter()-2*Math.PI)>1e-7)complete=false;else rings++;
     }edges.Next();
    }
    if(!complete||rings!==2)continue;
    const a=loc.map((x,i)=>x+dir[i]*v0),b=loc.map((x,i)=>x+dir[i]*v1),mid=a.map((x,i)=>(x+b[i])/2);
    if(cadClassifyPoint(oc,shape,mid)!=='outside')continue; // excludes bosses
    // On a tube the axis is outside BOTH cylindrical walls. Test the material
    // side of the wall, not face orientation or proximity to the expected size.
    const seed=Math.abs(dir[0])<.8?[1,0,0]:[0,1,0],radial=new Vector3(...dir).cross(new Vector3(...seed)).normalize().toArray(),probe=Math.min(1e-4/scale,r/10,(v1-v0)/10);
    const at=radius=>mid.map((x,i)=>x+radial[i]*radius);
    if(cadClassifyPoint(oc,shape,at(r-probe))!=='outside'||cadClassifyPoint(oc,shape,at(r+probe))!=='inside')continue;
    let from=new Vector3(...a).applyMatrix4(matrix),to=new Vector3(...b).applyMatrix4(matrix);
    if(to.clone().sub(from).dot(wantedAxis)<0)[from,to]=[to,from];
    const actualAxis=to.clone().sub(from).normalize(),axisAngleDegrees=Math.acos(Math.max(-1,Math.min(1,actualAxis.dot(wantedAxis))))*180/Math.PI;
    const axisOffset=targetFrom.clone().sub(from).cross(actualAxis).length(),endpointError=Math.max(from.distanceTo(targetFrom),to.distanceTo(targetTo));
    rows.push({diameter:2*r*scale,depth:(v1-v0)*scale,from:from.toArray(),to:to.toArray(),axis:actualAxis.toArray(),axisAngleDegrees,axisOffset,endpointError,a,dir,r,length:v1-v0,score:endpointError+axisOffset});
   }finally{f.close();explorer.Next();}
  }
  rows.sort((a,b)=>a.score-b.score);const best=rows[0];if(!best)fail('Keine vollständige analytische zylindrische Innenfläche gefunden. Netz-, Freiform-, angeschnittene und facettierte Bohrungen sind nicht exakt messbar.');
  if(rows[1]&&Math.abs(rows[1].score-best.score)<1e-7)fail('Mehrere gleich nahe Bohrungsflächen: Zielachse und Endpunkte eindeutiger angeben.');
  const eps=Math.min(tolerance/scale,best.r/10,best.length/10),origin=best.a.map((x,i)=>x+best.dir[i]*eps),length=best.length-2*eps;
  const inner=cylinder(oc,s,origin,best.dir,best.r-eps,length),occupied=s.keep(cadBoolean(oc,'intersection',shape,inner,{allowEmpty:true}));
  const minWall=check.minWall??.1,outer=cylinder(oc,s,origin,best.dir,best.r+minWall/scale,length),hole=cylinder(oc,s,origin,best.dir,best.r+eps,length),ring=s.keep(cadBoolean(oc,'difference',outer,hole,{allowEmpty:true}));
  const missing=ring?s.keep(cadBoolean(oc,'difference',ring,shape,{allowEmpty:true})):null;
  const {a,dir,r,score,...actual}=best;delete actual.length;
  return {...actual,clear:!occupied,surroundingMaterial:!!ring&&!missing,minWall,radialAllowance:tolerance,method:'analytic-cylinder-and-native-boolean-ring',scope:'Full cylindrical wall and continuous surrounding ring, excluding the reported axial/radial allowance. Endpoints measure the cylindrical portion, not countersinks or drill-tip cones.'};
 }finally{s.close();}
}
