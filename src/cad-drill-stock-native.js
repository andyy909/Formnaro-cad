import {cadPoint} from './cad-affine.js';
import {cadAffineVolume,validateCadSolid} from './cad-native-kernel.js';

// A general OCCT transform turns even primitive stock into trimmed B-splines.
// Cutting those faces can produce sliver edges that fail STEP reader Boolean
// checks. Build the equivalent working stock from exact planes instead; never
// change the retained source BRep, recipe, placement, or a rounded primitive.
export function affineCadDrillStock(oc,source,bounds){
 const recipe=source.recipe,params=recipe?.params??{},matrix=source.transform;
 const box=recipe?.type==='box',cylinder=recipe?.type==='cylinder'&&recipe.size[0]===recipe.size[1];
 if(source.source!=='native'||!box&&!cylinder||params.edgeSize&&params.edgeStyle!=='none')return null;
 const columns=[0,4,8].map(i=>matrix.slice(i,i+3)),dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0),lengths=columns.map(c=>dot(c,c)),scale=Math.max(...lengths);
 if(lengths.every(v=>Math.abs(v-lengths[0])<=scale*1e-12)&&[[0,1],[0,2],[1,2]].every(([i,j])=>Math.abs(dot(columns[i],columns[j]))<=scale*1e-12))return null;
 const owned=[],keep=value=>(owned.push(value),value);
 let solid;
 try{
  const [x,y,z]=bounds.min,[u,v,w]=bounds.max;
  const wireMaker=keep(new oc.BRepBuilderAPI_MakeWire());
  if(box){
   const points=[[x,y,z],[u,y,z],[u,v,z],[x,v,z]].map(p=>keep(new oc.gp_Pnt(...cadPoint(matrix,p))));
   for(let i=0;i<4;i++){
    const edgeMaker=keep(new oc.BRepBuilderAPI_MakeEdge(points[i],points[(i+1)%4]));
    if(!edgeMaker.IsDone())throw Error('Rohlingkante konnte nicht nativ aufgebaut werden.');
    wireMaker.Add(keep(edgeMaker.Edge()));
   }
  }else{
   // The affine image of a circle is an exact planar ellipse. Its axes are
   // the left singular vectors of the two transformed radius vectors.
   const a=columns[0].map(t=>t*(u-x)/2),b=columns[1].map(t=>t*(v-y)/2),aa=dot(a,a),bb=dot(b,b),ab=dot(a,b);
   const angle=.5*Math.atan2(2*ab,aa-bb),major=a.map((t,i)=>t*Math.cos(angle)+b[i]*Math.sin(angle));
   const cross=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],radius=Math.hypot(...major),minor=Math.hypot(...cross)/radius;
   const center=keep(new oc.gp_Pnt(...cadPoint(matrix,[(x+u)/2,(y+v)/2,z]))),axis=keep(new oc.gp_Ax2(center,keep(new oc.gp_Dir(...cross)),keep(new oc.gp_Dir(...major))));
   const curve=keep(Math.abs(radius-minor)<=radius*1e-12?new oc.gp_Circ(axis,radius):new oc.gp_Elips(axis,radius,minor)),edgeMaker=keep(new oc.BRepBuilderAPI_MakeEdge(curve));
   if(!edgeMaker.IsDone())throw Error('Rohlingellipse konnte nicht nativ aufgebaut werden.');wireMaker.Add(keep(edgeMaker.Edge()));
  }
  if(!wireMaker.IsDone())throw Error('Rohlingkontur konnte nicht geschlossen werden.');
  const wire=keep(wireMaker.Wire()),faceMaker=keep(new oc.BRepBuilderAPI_MakeFace(wire,true));
  if(!faceMaker.IsDone())throw Error('Rohlinggrundfläche ist nicht eindeutig eben.');
  const face=keep(faceMaker.Face()),vector=keep(new oc.gp_Vec(matrix[8]*(w-z),matrix[9]*(w-z),matrix[10]*(w-z)));
  const prism=keep(new oc.BRepPrimAPI_MakePrism(face,vector,true,true));
  if(!prism.IsDone())throw Error('Affiner Rohling konnte nicht aufgebaut werden.');
  solid=oc.TopoDS.Solid(keep(prism.Shape()));
  if(!oc.BRepLib.OrientClosedSolid(solid))throw Error('Affiner Rohling ist nicht geschlossen orientierbar.');
  const checked=validateCadSolid(oc,solid),expected=cadAffineVolume((u-x)*(v-y)*(w-z)*(box?1:Math.PI/4),matrix);
  if(Math.abs(checked.volume-expected)>Math.max(1e-7,expected*1e-10))throw Error('Affiner Rohling widerspricht dem Quellvolumen.');
  const result=solid;solid=null;return result;
 }finally{solid?.delete();for(const value of owned.reverse())value.delete();}
}
