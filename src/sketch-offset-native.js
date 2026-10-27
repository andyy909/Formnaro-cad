import {buildCadWire} from './cad-recipes.js';
import {nativePlanarWire} from './cad-original-contours.js';
import {resolveSketchProfile,profileNativeSegments} from './sketch-profile.js';
import {sketchExpression} from './sketch-expression.js';
export function offsetSketchContour(oc,{sketch,loopId,distance}={}){
 if(typeof distance!=='number'||!Number.isFinite(distance)||Math.abs(distance)<.001||Math.abs(distance)>1000)throw Error('Versatz: Abstand von ±0,001 bis ±1000 mm.');
 const r=resolveSketchProfile(sketch,sketchExpression),loop=r.loops.find(l=>l.id===loopId);if(!loop)throw Error('Geschlossene Kontur auswählen.');
 const wire=buildCadWire(oc,profileNativeSegments(loop.entities)),maker=new oc.BRepOffsetAPI_MakeOffset();let result,explorer;
 try{maker.Init(oc.GeomAbs_JoinType.GeomAbs_Arc,false);maker.AddWire(wire);maker.Perform(distance,0);if(!maker.IsDone())throw Error('Dieser Konturversatz konnte nicht berechnet werden.');result=maker.Shape();explorer=new oc.TopExp_Explorer(result,oc.TopAbs_ShapeEnum.TopAbs_WIRE);const contours=[];while(explorer.More()){const raw=explorer.Current(),w=oc.TopoDS.Wire(raw);try{const c=nativePlanarWire(oc,w);if(c?.length)contours.push(c);}finally{w.delete();raw.delete();}explorer.Next();}
 if(contours.length!==1)throw Error('Versatz zerfällt in mehrere Konturen oder verschwindet. Kleineren Abstand wählen.');return {segments:contours[0],distance,sourceLoopId:loopId,kind:'native-contour-offset'};
 }finally{explorer?.delete();result?.delete();maker.delete();wire.delete();}
}
