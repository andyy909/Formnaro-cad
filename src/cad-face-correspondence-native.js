import {readCadBrep,writeCadBrep,cadBounds} from './cad-native-kernel.js';
import {cadGeometryDigest} from './cad-geometry-digest.js';

const value=item=>item?.value??item,xyz=point=>[point.X(),point.Y(),point.Z()],dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function area(oc,shape){if(shape.IsNull())return 0;const properties=new oc.GProp_GProps();try{const error=oc.BRepGProp.SurfaceProperties(shape,properties,1e-12,true),result=properties.Mass();if(!Number.isFinite(error)||error<0||!Number.isFinite(result)||result<0)throw Error('Native Flächenintegration fehlgeschlagen.');return result;}finally{properties.delete();}}
function collect(oc,brep){const shape=readCadBrep(oc,brep.data),faces=[],keys=[],buckets=new Map(),explorer=new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum.TopAbs_FACE);try{while(explorer.More()){const raw=explorer.Current();try{const hash=oc.ReplicadShapeHasher.HashCode(raw,2147483647),bucket=buckets.get(hash)??[];if(!bucket.some(face=>face.IsSame(raw))){const face=oc.TopoDS.Face(raw);faces.push(face);bucket.push(face);buckets.set(hash,bucket);keys.push(cadGeometryDigest(writeCadBrep(oc,face)));if(faces.length>40000)throw Error('Zu viele native Farbflächen.');}}finally{raw.delete();}explorer.Next();}return {faces,keys,close:()=>{faces.forEach(face=>face.delete());shape.delete();}};}catch(error){faces.forEach(face=>face.delete());shape.delete();throw error;}finally{explorer.delete();}}
function support(oc,face){const adaptor=new oc.BRepAdaptor_Surface(face,false),owned=[],keep=item=>(owned.push(item),item);try{
 const orientation=value(face.Orientation()),forward=value(oc.TopAbs_Orientation.TopAbs_FORWARD),reversed=value(oc.TopAbs_Orientation.TopAbs_REVERSED);if(orientation!==forward&&orientation!==reversed)return null;const sign=orientation===reversed?-1:1,type=value(adaptor.GetType());
 if(type===value(oc.GeomAbs_SurfaceType.GeomAbs_Plane)){const plane=keep(adaptor.Plane()),axes=keep(plane.Position()),x=xyz(keep(axes.XDirection())),y=xyz(keep(axes.YDirection())),normal=cross(x,y).map(v=>v*sign),point=xyz(keep(plane.Location()));return {kind:'plane',normal,distance:dot(normal,point)};}
 if(type===value(oc.GeomAbs_SurfaceType.GeomAbs_Cylinder)||type===value(oc.GeomAbs_SurfaceType.GeomAbs_Cone)){
  // gp_Cone is not exposed by this WASM build. BRep_Tool's one-argument
  // Surface returns the transformed native Geom_ConicalSurface instead.
  const cone=type===value(oc.GeomAbs_SurfaceType.GeomAbs_Cone),surface=keep(cone?oc.BRep_Tool.Surface(face):adaptor.Cylinder()),axis=keep(surface.Axis()),direction=xyz(keep(axis.Direction())),first=direction.find(component=>Math.abs(component)>1e-12),canonical=direction.map(component=>component*(first<0?-1:1)),point=xyz(keep(cone?surface.Apex():surface.Location()));
  if(cone){
   const angle=surface.SemiAngle(),axes=keep(surface.Position()),direct=dot(cross(xyz(keep(axes.XDirection())),xyz(keep(axes.YDirection()))),direction)>0;
   if(!Number.isFinite(angle)||Math.abs(angle)<=1e-12||Math.abs(angle)>=Math.PI/2)return null;
   // The untrimmed adaptor reports infinite V limits. Use the entire trimmed
   // face's bounding box to conservatively prove that its radius never crosses
   // the apex. Keeping the signed axis/angle avoids conflating opposite nappes
   // or an orientation change; Common/Cuts still prove the actual trim below.
   const bounds=cadBounds(oc,face),radii=[];
   for(let mask=0;mask<8;mask++)radii.push(dot(direction,point.map((p,i)=>(mask&(1<<i)?bounds.max[i]:bounds.min[i])-p))*Math.tan(angle));
   const minimum=Math.min(...radii),maximum=Math.max(...radii),nappe=minimum>1e-9?1:maximum< -1e-9?-1:0;
   if(!nappe)return null;
   return {kind:'cone',axis:direction,point,angle,orientation:sign*(direct?1:-1)*nappe};
  }
  const projection=dot(point,canonical);return {kind:'cylinder',axis:canonical,point:point.map((component,i)=>component-projection*canonical[i]),radius:surface.Radius(),orientation:sign*(surface.Direct()?1:-1)};
 }
 return null;
}catch{return null;}finally{owned.reverse().forEach(item=>item.delete());adaptor.delete();}}
function sameSupport(left,right,tolerance){const near=(a,b,limit=tolerance)=>a.every((component,i)=>Math.abs(component-b[i])<=limit);if(!left||!right||left.kind!==right.kind)return false;if(left.kind==='plane')return near(left.normal,right.normal,1e-10)&&Math.abs(left.distance-right.distance)<=tolerance;return left.orientation===right.orientation&&near(left.axis,right.axis,1e-10)&&near(left.point,right.point)&&Math.abs((left.radius??left.angle)-(right.radius??right.angle))<=(left.kind==='cone'?1e-10:tolerance);}
function operation(oc,kind,left,right){const builder=new oc[kind](),argumentsList=new oc.NCollection_List_TopoDS_Shape(),toolsList=new oc.NCollection_List_TopoDS_Shape();let result;try{argumentsList.Append(left);toolsList.Append(right);builder.SetArguments(argumentsList);builder.SetTools(toolsList);builder.SetNonDestructive(true);builder.SetFuzzyValue(0);builder.Build();if(builder.HasErrors())throw Error('Native Flächendomänenoperation fehlgeschlagen.');result=builder.Shape();if(!result.IsNull()){const check=new oc.BRepCheck_Analyzer(result);try{if(!check.IsValid())throw Error('Ungültige native Flächendomäne.');}finally{check.delete();}}return result;}catch(error){result?.delete();throw error;}finally{toolsList.delete();argumentsList.delete();builder.delete();}}

/** Exact serialized domains remain the first proof. For analytic supports,
 * unique native Common and both Cuts can additionally prove the same complete
 * trimmed region within strict integration bounds. Ordinals/proximity never
 * establish a correspondence. Handles and operands remain private/unchanged. */
export function cadNativeFaceCorrespondence(oc,before,after,{indices,maxComparisons=2000}={}){
 if(!Number.isSafeInteger(maxComparisons)||maxComparisons<0||maxComparisons>10000)throw Error('Ungültige native Flächenvergleichsgrenze.');
 const left=collect(oc,before),mapping=new Map(),records=[new Map(),new Map()],proofs=[],memo=new Map();let right,comparisons=0;
 try{
  right=collect(oc,after);
  const counts=keys=>{const map=new Map();keys.forEach((key,i)=>map.set(key,[...(map.get(key)??[]),i]));return map;},oldKeys=counts(left.keys),newKeys=counts(right.keys);
  for(const [key,old]of oldKeys){const next=newKeys.get(key);if(old.length===1&&next?.length===1)mapping.set(old[0]+1,next[0]+1);}
  function record(side,index){const cached=records[side].get(index);if(cached)return cached;const face=(side?right:left).faces[index],result={face,bounds:cadBounds(oc,face),area:area(oc,face),support:support(oc,face)};records[side].set(index,result);return result;}
  function equivalent(i,j){const key=i+'/'+j;if(memo.has(key))return memo.get(key);if(left.keys[i]===right.keys[j])return true;let common,missing,added,result=false;
   try{const a=record(0,i),b=record(1,j),scale=Math.max(1,...a.bounds.min.map(Math.abs),...a.bounds.max.map(Math.abs),...b.bounds.min.map(Math.abs),...b.bounds.max.map(Math.abs)),tolerance=Math.max(1e-9,scale*Number.EPSILON*64),areaTolerance=Math.max(1e-8,Math.min(1e-6,Math.max(a.area,b.area)*1e-11));
    if(a.area<=0||b.area<=0||Math.abs(a.area-b.area)>areaTolerance||!sameSupport(a.support,b.support,tolerance)||!a.bounds.min.every((v,k)=>Math.abs(v-b.bounds.min[k])<=tolerance)||!a.bounds.max.every((v,k)=>Math.abs(v-b.bounds.max[k])<=tolerance))return false;
    if(comparisons>=maxComparisons){result=null;return null;}comparisons++;common=operation(oc,'BRepAlgoAPI_Common',a.face,b.face);const shared=area(oc,common);if(Math.abs(shared-a.area)>areaTolerance||Math.abs(shared-b.area)>areaTolerance)return false;
    missing=operation(oc,'BRepAlgoAPI_Cut',a.face,b.face);added=operation(oc,'BRepAlgoAPI_Cut',b.face,a.face);const missingArea=area(oc,missing),addedArea=area(oc,added);result=missingArea<=areaTolerance&&addedArea<=areaTolerance;if(result)proofs.push({before:i+1,after:j+1,method:'analytic-support-common-and-bidirectional-trimmed-domain-cuts',beforeArea:a.area,afterArea:b.area,commonArea:shared,missingArea,addedArea,areaTolerance,supportTolerance:tolerance});return result;
   }catch{result=null;return null;}finally{added?.delete();missing?.delete();common?.delete();memo.set(key,result);}
  }
  const requested=[...new Set(indices??left.faces.map((_,i)=>i+1))].filter(index=>Number.isSafeInteger(index)&&index>0&&index<=left.faces.length);
  for(const index of requested){if(mapping.has(index))continue;const matches=[];let uncertain=false;for(let j=0;j<right.faces.length;j++){const proof=equivalent(index-1,j);if(proof===true)matches.push(j);else if(proof===null)uncertain=true;}if(uncertain||matches.length!==1)continue;const match=matches[0],old=[];for(let i=0;i<left.faces.length;i++){const proof=equivalent(i,match);if(proof===true)old.push(i);else if(proof===null)uncertain=true;}if(uncertain||old.length!==1){for(const prior of old)mapping.delete(prior+1);continue;}if([...mapping].some(([prior,next])=>prior!==index&&next===match+1)){for(const [prior,next]of mapping)if(next===match+1)mapping.delete(prior);continue;}mapping.set(index,match+1);}
  return {mapping,beforeKeys:left.keys,afterKeys:right.keys,proofs:proofs.filter(proof=>mapping.get(proof.before)===proof.after),comparisons};
 }finally{right?.close();left.close();}
}
