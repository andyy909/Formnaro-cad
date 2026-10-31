import {cadPoint} from './cad-affine.js';
import {cadAffineVolume,validateCadSolid,writeCadBrep} from './cad-native-kernel.js';
import {resolveCadSketch} from './cad-sketch.js';
import {buildCadRecipe} from './cad-recipes.js';

// A general OCCT transform turns even primitive stock into trimmed B-splines.
// Cutting those faces can produce sliver edges that fail STEP reader Boolean
// checks. Build the equivalent working stock from exact planes instead; never
// change the retained source BRep, recipe, placement, or a rounded primitive.
export function affineCadDrillStock(oc,source,bounds){
 const recipe=source.recipe,params=recipe?.params??{},matrix=source.transform;
 const box=recipe?.type==='box',cylinder=recipe?.type==='cylinder'&&recipe.size[0]===recipe.size[1];
 if(source.source!=='native'||!box&&!cylinder||params.edgeSize&&params.edgeStyle!=='none')return null;
 return affinePrism(oc,matrix,bounds,box);
}

// Circle profiles need the same exact working extrusion when an explicit
// contour size binding stretches their placement. Keep the native profile,
// source BRep and target identity intact; arbitrary profiles still use OCCT.
export function affineCadSketchCircle(oc,source,bounds,matrix=source.transform){
 if(source.source!=='native'||source.recipe?.type!=='sketch'||source.recipe.sketch.version!==2)return null;
 const resolved=resolveCadSketch(source.recipe.sketch),outer=resolved.native?.outer;
 const circle=resolved.kind==='profile'&&!resolved.native.holes.length&&outer.length===1&&outer[0].kind==='ellipse'&&outer[0].rx===outer[0].ry&&Math.abs((outer[0].endAngle??2*Math.PI)-(outer[0].startAngle??0)-2*Math.PI)<1e-12;
 if(!circle||similarity(matrix))return null;
 // Export may receive stored native data without a fresh service rebuild.
 // Recipe metadata alone must never replace a different retained BRep.
 const canonical=buildCadRecipe(oc,source.recipe);
 try{if(writeCadBrep(oc,canonical)!==source.brep.data)return null;}finally{canonical.delete();}
 return affinePrism(oc,matrix,bounds,false);
}

function similarity(matrix){
 const columns=[0,4,8].map(i=>matrix.slice(i,i+3)),dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0),lengths=columns.map(c=>dot(c,c)),scale=Math.max(...lengths);
 return lengths.every(v=>Math.abs(v-lengths[0])<=scale*1e-12)&&[[0,1],[0,2],[1,2]].every(([i,j])=>Math.abs(dot(columns[i],columns[j]))<=scale*1e-12);
}
function affinePrism(oc,matrix,bounds,box){
 if(similarity(matrix))return null;
 const columns=[0,4,8].map(i=>matrix.slice(i,i+3)),dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
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
