// Native planar arrangement for original self-intersecting fill contours.
// FaceSplitter constructs regions from the original edges. A certified point
// inside each region determines its winding through native curve/ray cuts;
// no sampled polyline or triangulation participates in this construction.
import {buildCadWire,buildCadSegmentEdge} from './cad-recipes.js';
import {cadBounds} from './cad-native-kernel.js';
const TOL=1e-7,MAX_SEGMENTS=1024,MAX_REGIONS=512;
function scope(){const values=[];return {keep:value=>(values.push(value),value),close:()=>{for(const value of values.reverse())value?.delete?.();}};}
function ends(segment){
  if(segment.kind==='line')return [segment.start,segment.end];
  if(segment.kind==='bezier')return [segment.points[0],segment.points.at(-1)];
  if(segment.kind==='ellipse'){
    const at=t=>{const c=Math.cos(segment.rotation||0),s=Math.sin(segment.rotation||0),x=segment.rx*Math.cos(t),y=segment.ry*Math.sin(t);return [segment.center[0]+x*c-y*s,segment.center[1]+x*s+y*c];},a=at(segment.startAngle),b=at(segment.endAngle);return segment.reversed?[b,a]:[a,b];
  }
  throw Error('Selbstschnittaufteilung benötigt originale Linien, Bézierkurven oder Ellipsen.');
}
function curves2d(oc,subpaths,objects){
  const curves=[];
  for(const segments of subpaths){
    if(!segments.length)continue;
    const first=ends(segments[0])[0],last=ends(segments.at(-1))[1];
    if(Math.hypot(first[0]-last[0],first[1]-last[1])>TOL)throw Error('Originale Füllunterkontur ist nicht geschlossen.');
    for(let index=1;index<segments.length;index++){const a=ends(segments[index-1])[1],b=ends(segments[index])[0];if(Math.hypot(a[0]-b[0],a[1]-b[1])>TOL)throw Error('Originale Füllunterkontur besitzt nicht verbundene Kanten.');}
    for(const segment of segments){
      let curve;
      if(segment.kind==='line'||segment.kind==='bezier'){
        const points=segment.kind==='line'?[segment.start,segment.end]:segment.points,array=objects.keep(new oc.NCollection_Array1_gp_Pnt2d(1,points.length));
        for(const [index,point] of points.entries())array.SetValue(index+1,objects.keep(new oc.gp_Pnt2d(...point)));
        curve=objects.keep(new oc.Geom2d_BezierCurve(array));
      }else if(segment.kind==='ellipse'){
        const swapped=segment.ry>segment.rx,rotation=(segment.rotation||0)+(swapped?Math.PI/2:0),axis=objects.keep(new oc.gp_Ax2d(objects.keep(new oc.gp_Pnt2d(...segment.center)),objects.keep(new oc.gp_Dir2d(Math.cos(rotation),Math.sin(rotation))))),ellipse=objects.keep(new oc.Geom2d_Ellipse(axis,Math.max(segment.rx,segment.ry),Math.min(segment.rx,segment.ry),true)),shift=swapped?-Math.PI/2:0;
        curve=objects.keep(new oc.Geom2d_TrimmedCurve(ellipse,segment.startAngle+shift,segment.endAngle+shift,true,false));if(segment.reversed)curve.Reverse();
      }else throw Error('Originalkurve hat keinen nativen Selbstschnittpfad.');
      curves.push({curve,segment,edge:objects.keep(buildCadSegmentEdge(oc,segment)),endpoints:ends(segment)});
    }
  }
  return curves;
}
// Returns null for an ambiguous ray (vertex, tangent or unresolved native root).
// The region search then chooses another point, never guesses a winding count.
function windingAt(oc,curves,point){
  if(curves.some(item=>item.endpoints.some(p=>Math.abs(p[1]-point[1])<=TOL)))return null;
  const objects=scope();try{
    const plane=objects.keep(new oc.gp_Pln(objects.keep(new oc.gp_Pnt(0,point[1],0)),objects.keep(new oc.gp_Dir(0,1,0))));let winding=0;
    for(const {curve,edge} of curves){
      // Unlike Geom2dAPI.NbPoints(), Section exposes native failure and done
      // status. A failed intersection must never become a winding count of 0.
      const section=new oc.BRepAlgoAPI_Section(edge,plane,true);let result,vertices,overlaps;
      try{
        if(!section.IsDone()||section.HasErrors())throw Error('Nativer Originalkurven-Ray-Schnitt ist fehlgeschlagen.');
        result=section.Shape();overlaps=new oc.TopExp_Explorer(result,oc.TopAbs_ShapeEnum.TopAbs_EDGE);if(overlaps.More())return null;
        vertices=new oc.TopExp_Explorer(result,oc.TopAbs_ShapeEnum.TopAbs_VERTEX);const seen=[];
        while(vertices.More()){
          const raw=vertices.Current(),vertex=oc.TopoDS.Vertex(raw),p3=oc.BRep_Tool.Pnt(vertex),p=new oc.gp_Pnt2d(p3.X(),p3.Y());let projector,derivative;
          try{
            if(seen.some(q=>Math.hypot(q[0]-p.X(),q[1]-p.Y())<=TOL)){vertices.Next();continue;}seen.push([p.X(),p.Y()]);
            if(Math.abs(p.Y()-point[1])>TOL*4)return null;if(p.X()<point[0]-TOL){vertices.Next();continue;}if(Math.abs(p.X()-point[0])<=TOL)return null;
            projector=new oc.Geom2dAPI_ProjectPointOnCurve(p,curve,curve.FirstParameter(),curve.LastParameter());
            if(!projector.NbPoints()||projector.LowerDistance()>TOL*4)return null;
            const roots=[];for(let j=1;j<=projector.NbPoints();j++)if(projector.Distance(j)<=TOL*4)roots.push(projector.Parameter(j));
            if(roots.some(t=>Math.abs(t-roots[0])>1e-6))return null;
            derivative=curve.DN(projector.LowerDistanceParameter(),1);const dy=derivative.Y();if(Math.abs(dy)<=TOL*4)return null;winding+=Math.sign(dy);
          }finally{derivative?.delete();projector?.delete();p.delete();p3.delete();vertex.delete();raw.delete();}
          vertices.Next();
        }
      }finally{overlaps?.delete();vertices?.delete();result?.delete();section.delete();}
    }
    return winding;
  }finally{objects.close();}
}
export function cadNativeContourWinding(oc,subpaths,point){
  if(!Array.isArray(subpaths)||!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite))throw Error('Ungültiger originaler Konturpunkt.');
  const objects=scope();try{const winding=windingAt(oc,curves2d(oc,subpaths,objects),point);if(winding===null)throw Error('Originale Konturfüllung besitzt keinen eindeutigen nativen Ray-Schnitt.');return winding;}finally{objects.close();}
}
function originalEdges(oc,items,objects){
  const edges=[];
  for(const {segment,curve,edge} of items){
    if(segment.kind!=='bezier'){edges.push(edge);continue;}
    const intersector=objects.keep(new oc.Geom2dAPI_InterCurveCurve(curve,TOL)),parameters=[0,1];
    for(let index=1;index<=intersector.NbPoints();index++){
      const point=objects.keep(intersector.Point(index)),projector=objects.keep(new oc.Geom2dAPI_ProjectPointOnCurve(point,curve,0,1));
      for(let j=1;j<=projector.NbPoints();j++)if(projector.Distance(j)<=TOL*4){const t=projector.Parameter(j);if(t>1e-9&&t<1-1e-9&&!parameters.some(p=>Math.abs(p-t)<1e-9))parameters.push(t);}
    }
    if(parameters.length===2){edges.push(edge);continue;}
    parameters.sort((a,b)=>a-b);const adaptor=objects.keep(new oc.BRepAdaptor_Curve(edge)),geometry=objects.keep(adaptor.Bezier());
    // Splitter intersects distinct edges. Expose both branches of a single
    // self-crossing original Bézier as exact parameter-trimmed native edges.
    for(let index=1;index<parameters.length;index++){const maker=objects.keep(new oc.BRepBuilderAPI_MakeEdge(geometry,parameters[index-1],parameters[index]));if(!maker.IsDone())throw Error('Originale Bézier-Selbstschnittäste konnten nicht exakt getrennt werden.');edges.push(objects.keep(maker.Edge()));}
  }
  return edges;
}
function regionWinding(oc,face,contour,curves){
  const objects=scope();try{
    // Region boundaries come from the native planar splitter. Classify the
    // point in that region with independent curve/ray intersections. This
    // also handles the unfilled outside region with point-touching holes,
    // which need not be materialized as an artificial volumetric CAD body.
    const reversed=segments=>segments.toReversed().map(s=>s.kind==='line'?{...s,start:s.end,end:s.start}:s.kind==='bezier'?{...s,points:s.points.toReversed()}:{...s,reversed:!s.reversed}),regionCurves=curves2d(oc,[contour.outer,...contour.holes.map(reversed)],objects),props=objects.keep(new oc.GProp_GProps());oc.BRepGProp.SurfaceProperties(face,props,1e-10,false);const centroid=objects.keep(props.CentreOfMass()),bounds=cadBounds(oc,face),candidates=[[centroid.X(),centroid.Y()],bounds.center.slice(0,2)];
    const explorer=objects.keep(new oc.TopExp_Explorer(face,oc.TopAbs_ShapeEnum.TopAbs_EDGE));
    while(explorer.More()){
      const edge=objects.keep(oc.TopoDS.Edge(objects.keep(explorer.Current()))),curve=objects.keep(new oc.BRepAdaptor_Curve(edge)),t=(curve.FirstParameter()+curve.LastParameter())/2,p=objects.keep(curve.Value(t)),derivative=objects.keep(curve.DN(t,1)),length=Math.hypot(derivative.X(),derivative.Y());
      if(length>TOL){const scale=Math.min(bounds.size[0],bounds.size[1]);for(const factor of [.03,.003,.0003])for(const sign of [1,-1]){const amount=Math.max(TOL*8,scale*factor)*sign;candidates.push([p.X()-derivative.Y()/length*amount,p.Y()+derivative.X()/length*amount]);}}
      explorer.Next();
    }
    for(const candidate of candidates){
      if(windingAt(oc,regionCurves,candidate)!==1)continue;
      const winding=windingAt(oc,curves,candidate);if(winding!==null)return winding;
    }
    throw Error('Native Selbstschnittregion besitzt keinen eindeutig klassifizierten Innenpunkt.');
  }finally{objects.close();}
}
/** readFace converts a native planar region back to its original analytic
 * edge classes. The caller owns no returned native handles. */
export function splitCadWindingRegions(oc,subpaths,{fillRule='nonzero',readFace,contourArea}={}){
  if(!['nonzero','evenodd'].includes(fillRule)||!Array.isArray(subpaths)||subpaths.length>256||typeof readFace!=='function'||typeof contourArea!=='function')throw Error('Ungültiger nativer Selbstschnittauftrag.');
  const count=subpaths.reduce((n,path)=>n+path.length,0);if(!count||count>MAX_SEGMENTS)throw Error('Native Selbstschnittaufteilung überschreitet die Konstruktionsgrenze.');
  const objects=scope(),contours=[];try{
    const curves=curves2d(oc,subpaths,objects),compound=objects.keep(new oc.TopoDS_Compound()),builder=objects.keep(new oc.TopoDS_Builder()),tools=objects.keep(new oc.NCollection_List_TopoDS_Shape());builder.MakeCompound(compound);
    for(const edge of originalEdges(oc,curves,objects)){builder.Add(compound,edge);objects.keep(tools.Append(edge));}
    const bounds=cadBounds(oc,compound),margin=Math.max(1,...bounds.size),min=bounds.min.map(v=>v-margin),max=bounds.max.map(v=>v+margin),points=[[min[0],min[1]],[max[0],min[1]],[max[0],max[1]],[min[0],max[1]]],rectangle=points.map((p,i)=>({kind:'line',start:p,end:points[(i+1)%4]})),wire=objects.keep(buildCadWire(oc,rectangle)),face=objects.keep(objects.keep(new oc.BRepBuilderAPI_MakeFace(wire,true)).Face()),argumentsList=objects.keep(new oc.NCollection_List_TopoDS_Shape()),splitter=objects.keep(new oc.BRepAlgoAPI_Splitter());objects.keep(argumentsList.Append(face));
    splitter.SetArguments(argumentsList);splitter.SetTools(tools);splitter.SetNonDestructive(true);splitter.Build();if(!splitter.IsDone()||splitter.HasErrors())throw Error('Native Selbstschnittregionen konnten nicht berechnet werden.');
    const result=objects.keep(splitter.Shape()),analyzer=objects.keep(new oc.BRepCheck_Analyzer(result));if(!analyzer.IsValid())throw Error('Native Selbstschnittaufteilung ergibt ungültige CAD-Flächen.');
    const explorer=objects.keep(new oc.TopExp_Explorer(result,oc.TopAbs_ShapeEnum.TopAbs_FACE));let regions=0,area=0;
    while(explorer.More()){
      if(++regions>MAX_REGIONS)throw Error('Native Selbstschnittaufteilung erzeugt zu viele Regionen.');
      const region=objects.keep(oc.TopoDS.Face(objects.keep(explorer.Current()))),props=objects.keep(new oc.GProp_GProps());oc.BRepGProp.SurfaceProperties(region,props,1e-10,false);const nativeArea=props.Mass();if(!Number.isFinite(nativeArea)||nativeArea<=0)throw Error('Native Selbstschnittregion besitzt keinen positiven endlichen Flächeninhalt.');area+=nativeArea;
      const contour=readFace(oc,region),originalArea=contourArea(contour);if(!Number.isFinite(originalArea)||Math.abs(originalArea-nativeArea)>Math.min(nativeArea*1e-6,Math.max(1e-7,nativeArea*1e-8)))throw Error('Originale Selbstschnittkurven bewahren ihre native Regionfläche nicht.');
      const winding=regionWinding(oc,region,contour,curves);if(fillRule==='evenodd'?Math.abs(winding)%2===1:winding!==0)contours.push(contour);explorer.Next();
    }
    const originalArea=(max[0]-min[0])*(max[1]-min[1]);if(Math.abs(area-originalArea)>Math.max(1e-7,originalArea*1e-8))throw Error('Native Selbstschnittregionen decken ihre ursprüngliche Ebene nicht vollständig ab.');
    return {contours,topologyCertified:true,sourceTopology:'cad-native-self-winding-arrangement',fillRule};
  }finally{objects.close();}
}
