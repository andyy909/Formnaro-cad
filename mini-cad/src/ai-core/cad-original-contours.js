// Original Three.js/FontLoader/SVGLoader curves, without getPoints(), mesh
// extrusion, or sampled hole classification. Nested contours use native CAD
// containment; crossing SVG subpaths use native winding-region arrangements.
import {buildCadContours,buildCadWire,buildCadSegmentEdge,cadRecipeBounds,cadRecipeVolume} from './cad-recipes.js';
import {cadClassifyPoint} from './cad-native-kernel.js';
import {splitCadWindingRegions} from './cad-self-contours.js';
const TAU=2*Math.PI;
const pair=p=>{const result=[p.x,p.y];if(!result.every(Number.isFinite))throw Error('Ungültiger Originalkonturpunkt.');return result;};
const distance=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k]));

export function reverseCadContour(segments) {
  return segments.toReversed().map(segment=>{
    if(segment.kind==='line')return {...segment,start:[...segment.end],end:[...segment.start]};
    if(segment.kind==='bezier')return {...segment,points:segment.points.toReversed().map(p=>[...p])};
    if(segment.kind==='arc')return {...segment,start:[...segment.end],end:[...segment.start]};
    if(segment.kind==='ellipse')return {...segment,reversed:!segment.reversed};
    throw Error('Unbekannte Originalkontur.');
  });
}
function ellipsePoint(segment,theta) {
  const {center,rx,ry,rotation=0}=segment,c=Math.cos(rotation),s=Math.sin(rotation);
  return [center[0]+rx*Math.cos(theta)*c-ry*Math.sin(theta)*s,center[1]+rx*Math.cos(theta)*s+ry*Math.sin(theta)*c];
}
function endpoints(segment) {
  if(segment.kind==='line'||segment.kind==='arc')return [segment.start,segment.end];
  if(segment.kind==='bezier')return [segment.points[0],segment.points.at(-1)];
  if(segment.kind==='ellipse')return segment.reversed?[ellipsePoint(segment,segment.endAngle),ellipsePoint(segment,segment.startAngle)]:[ellipsePoint(segment,segment.startAngle),ellipsePoint(segment,segment.endAngle)];
  throw Error('Unbekannte Originalkontur.');
}
function ellipseSweep(curve) {
  const values=[curve.aStartAngle,curve.aEndAngle,curve.aRotation,curve.aX,curve.aY,curve.xRadius,curve.yRadius];
  if(!values.every(Number.isFinite)||curve.xRadius<=0||curve.yRadius<=0||[curve.aStartAngle,curve.aEndAngle,curve.aRotation].some(angle=>Math.abs(angle)>TAU*1e6))throw Error('Originalellipse besitzt ungültige oder numerisch nicht zuverlässig auswertbare Parameter.');
  let delta=curve.aEndAngle-curve.aStartAngle;const same=Math.abs(delta)<Number.EPSILON;
  // Bounded modulo replaces repeated +/- 2pi. Very large doubles can make
  // subtraction by 2pi a no-op and would otherwise block the worker forever.
  delta%=TAU;if(delta<0)delta+=TAU;
  if(delta<Number.EPSILON)delta=same?0:TAU;
  if(curve.aClockwise&&!same)delta=delta===TAU?-TAU:delta-TAU;
  return delta;
}
export function originalCadSubpath(path,{flipY=false}={}) {
  if(!Array.isArray(path?.curves))throw Error('Originaler CurvePath erforderlich.');
  const map=p=>{const v=pair(p);if(flipY)v[1]*=-1;return v;},segments=[];
  for(const curve of path.curves){
    if(curve.isLineCurve)segments.push({kind:'line',start:map(curve.v1),end:map(curve.v2)});
    else if(curve.isQuadraticBezierCurve)segments.push({kind:'bezier',points:[map(curve.v0),map(curve.v1),map(curve.v2)]});
    else if(curve.isCubicBezierCurve)segments.push({kind:'bezier',points:[map(curve.v0),map(curve.v1),map(curve.v2),map(curve.v3)]});
    else if(curve.isEllipseCurve){
      let start=curve.aStartAngle,end=start+ellipseSweep(curve),rotation=curve.aRotation,center=[curve.aX,curve.aY];
      if(flipY){start=-start;end=-end;rotation=-rotation;center[1]*=-1;}
      if(Math.abs(end-start)<1e-14)continue;
      const reversed=end<start;
      segments.push({kind:'ellipse',center,rx:curve.xRadius,ry:curve.yRadius,rotation,startAngle:Math.min(start,end),endAngle:Math.max(start,end),reversed});
    }else throw Error(`Originalkontur ${curve.type||'unbekannt'} hat keinen nachgewiesenen direkten CAD-Pfad.`);
  }
  // SVG/font fill closes open subpaths with an original straight boundary.
  if(segments.length){const first=endpoints(segments[0])[0],last=endpoints(segments.at(-1))[1];if(distance(first,last)>1e-10)segments.push({kind:'line',start:[...last],end:[...first]});}
  return segments;
}
function polynomial(points) {
  return [0,1].map(k=>points.length===2?[points[0][k],points[1][k]-points[0][k]]:points.length===3?[points[0][k],2*(points[1][k]-points[0][k]),points[0][k]-2*points[1][k]+points[2][k]]:[points[0][k],3*(points[1][k]-points[0][k]),3*(points[0][k]-2*points[1][k]+points[2][k]),-points[0][k]+3*points[1][k]-3*points[2][k]+points[3][k]]);
}
export function cadContourSignedArea(segments) {
  let integral=0;
  for(const segment of segments){
    if(segment.kind==='ellipse'){
      const from=segment.reversed?segment.endAngle:segment.startAngle,to=segment.reversed?segment.startAngle:segment.endAngle,a=ellipsePoint(segment,from),b=ellipsePoint(segment,to);
      integral+=segment.rx*segment.ry*(to-from)+segment.center[0]*(b[1]-a[1])-segment.center[1]*(b[0]-a[0]);
    }else if(segment.kind==='line'||segment.kind==='bezier'){
      const [x,y]=polynomial(segment.kind==='line'?[segment.start,segment.end]:segment.points);
      for(let i=0;i<x.length;i++)for(let j=1;j<x.length;j++)integral+=(x[i]*y[j]-y[i]*x[j])*j/(i+j);
    }else throw Error('Analytisches Flächenintegral der Kontur ist nicht verfügbar.');
  }
  return integral/2;
}
function positiveWinding(segments){return cadContourSignedArea(segments)<0?reverseCadContour(segments):segments;}

// For each pair, native CAD wire distance rejects intersecting/touching
// boundaries. CAD common volumes then determine strict containment. This is
// not a general planar arrangement and does not silently discard crossings.
export function classifyCadSubpaths(oc,subpaths,{fillRule='nonzero'}={}) {
  if(!['nonzero','evenodd'].includes(fillRule))throw Error('Nicht unterstützte SVG-Füllregel.');
  if(!Array.isArray(subpaths)||subpaths.length>256)throw Error('Zu viele originale Unterkonturen.');
  const objects=[],keep=o=>(objects.push(o),o);
  try{
    const entries=subpaths.filter(path=>path.length).map((segments,index)=>{
      const area=cadContourSignedArea(segments);
      if(!Number.isFinite(area)||Math.abs(area)<1e-8)throw Error('Originalkontur ist degeneriert oder nicht eindeutig füllbar.');
      const normalized=positiveWinding(segments),shape=keep(buildCadContours(oc,{contours:[{outer:normalized}],height:1})),wire=keep(buildCadWire(oc,normalized)),volume=cadRecipeVolume(oc,shape),bounds=cadRecipeBounds(oc,shape);
      if(Math.abs(volume-Math.abs(area))>Math.max(1e-5,Math.abs(area)*1e-7))throw Error('CAD-Fläche stimmt nicht mit dem analytischen Originalkonturinhalt überein.');
      return {segments:normalized,index,area:Math.abs(area),winding:Math.sign(area),shape,wire,bounds,containers:[]};
    }).sort((a,b)=>b.area-a.area);
    for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){
      const a=entries[i],b=entries[j];
      if([0,1].some(k=>a.bounds.max[k]<b.bounds.min[k]||b.bounds.max[k]<a.bounds.min[k]))continue;
      let dist,common,result;
      try{
        dist=new oc.BRepExtrema_DistShapeShape(a.wire,b.wire);
        if(!dist.IsDone()||!Number.isFinite(dist.Value())||dist.Value()<=1e-6)throw Error('Originalkonturen kreuzen/berühren sich oder sind nicht eindeutig getrennt; CAD-Flächenaufteilung erforderlich.');
        // With strictly separated boundaries, one native solid classification
        // distinguishes containment from disjointness. Never turn a failed
        // or zero Common result into a filled interior island.
        const classified=typeof oc.FormnaroCadBridge?.ClassifyPoint==='function'?cadClassifyPoint(oc,a.shape,[...endpoints(b.segments[0])[0],0]):null;
        if(classified==='boundary')throw Error('CAD-Konturzuordnung besitzt keine eindeutig getrennten Grenzen.');
        common=new oc.BRepAlgoAPI_Common(a.shape,b.shape);
        if(common.HasErrors())throw Error('CAD-Konturzuordnung konnte nicht berechnet werden.');
        result=common.Shape();let hasSolid=false;
        if(!result.IsNull()){const solids=new oc.TopExp_Explorer(result,oc.TopAbs_ShapeEnum.TopAbs_SOLID,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);try{hasSolid=solids.More();}finally{solids.delete();}}
        const volume=hasSolid?cadRecipeVolume(oc,result):0,error=Math.min(Math.max(1e-5,b.area*1e-7),b.area*1e-6);
        // A small positive common volume is still containment. An absolute
        // area threshold must never turn a real hole into a filled island.
        if(volume===0){if(classified==='inside')throw Error('Native CAD-Konturklassifikation widerspricht dem leeren Common-Ergebnis.');continue;}
        if(!Number.isFinite(volume)||volume<0)throw Error('CAD-Konturzuordnung lieferte keinen gültigen Flächeninhalt.');
        if(classified==='outside')throw Error('Native CAD-Konturklassifikation widerspricht dem positiven Common-Ergebnis.');
        if(Math.abs(volume-b.area)>error)throw Error('Überlappende Originalunterkonturen benötigen eine CAD-Flächenaufteilung.');
        b.containers.push(a);
      }finally{result?.delete();common?.delete();dist?.delete();}
    }
    const contours=[],inside=w=>fillRule==='evenodd'?Math.abs(w)%2===1:w!==0;
    for(const entry of entries){
      entry.parent=entry.containers.sort((a,b)=>a.area-b.area)[0]||null;
      const before=entry.parent?.totalWinding||0,after=before+entry.winding;entry.totalWinding=after;
      if(inside(before)===inside(after)){entry.role='redundant';continue;}
      if(!inside(before)){entry.role='outer';entry.output={outer:entry.segments,holes:[]};contours.push(entry.output);}
      else {entry.role='hole';let parent=entry.parent;while(parent&&parent.role!=='outer')parent=parent.parent;if(!parent)throw Error('CAD-Innenkontur hat keine eindeutige Außenkontur.');parent.output.holes.push(entry.segments);}
    }
    if(!contours.length)throw Error('Originalkonturen bilden keine gefüllte CAD-Fläche.');
    return {contours,topologyCertified:true,sourceTopology:'cad-wire-distance-and-common',fillRule};
  }finally{for(const o of objects.reverse())o?.delete?.();}
}

function contourObjects(){const values=[];return {keep:value=>(values.push(value),value),release:value=>(values.splice(values.indexOf(value),1),value),prune:retained=>{for(let i=values.length-1;i>=0;i--)if(!retained.has(values[i])){values[i]?.delete?.();values.splice(i,1);}},close:()=>{for(const value of values.reverse())value?.delete?.();}};}
function assertSimpleCadSubpath(oc,segments){
  const objects=contourObjects();try{
    // Native self-intersection detection is required before assigning a single
    // winding sign to a subpath. It is not inferred from its signed area.
    for(const segment of segments)if(segment.kind==='bezier'){
      const points=objects.keep(new oc.NCollection_Array1_gp_Pnt2d(1,segment.points.length));segment.points.forEach((p,i)=>points.SetValue(i+1,objects.keep(new oc.gp_Pnt2d(...p))));
      const curve=objects.keep(new oc.Geom2d_BezierCurve(points)),intersections=objects.keep(new oc.Geom2dAPI_InterCurveCurve(curve,1e-7));
      if(intersections.NbPoints()||intersections.NbSegments())throw Error('Selbstschneidende SVG-Unterkontur benötigt eine eigene CAD-Winding-Aufteilung.');
    }
    const edges=[];
    for(const segment of segments)edges.push(objects.keep(buildCadSegmentEdge(oc,segment)));
    if(edges.length*(edges.length-1)/2>200000)throw Error('SVG-Selbstschnittprüfung überschreitet die native Konstruktionsgrenze.');
    for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++){
      const adjacent=j===i+1||(i===0&&j===edges.length-1),allowed=[];if(j===i+1)allowed.push(endpoints(segments[i])[1]);if(i===0&&j===edges.length-1)allowed.push(endpoints(segments[j])[1]);const dist=new oc.BRepExtrema_DistShapeShape(edges[i],edges[j]);
      try{if(!dist.IsDone())throw Error('SVG-Selbstschnittprüfung konnte nicht berechnet werden.');if(dist.Value()>1e-7)continue;if(!adjacent)throw Error('Selbstschneidende SVG-Unterkontur benötigt eine eigene CAD-Winding-Aufteilung.');
        for(let k=1;k<=dist.NbSolution();k++){const p=dist.PointOnShape1(k);try{if(!allowed.some(point=>distance([p.X(),p.Y()],point)<=1e-6))throw Error('Selbstschneidende SVG-Unterkontur benötigt eine eigene CAD-Winding-Aufteilung.');}finally{p.delete();}}
      }finally{dist.delete();}
    }
  }finally{objects.close();}
}
function nativePlanarEdge(oc,edge){
  const objects=contourObjects();try{
    const curve=objects.keep(new oc.BRepAdaptor_Curve(edge)),from=curve.FirstParameter(),to=curve.LastParameter(),reversed=edge.Orientation()===oc.TopAbs_Orientation.TopAbs_REVERSED,type=curve.GetType(),at=t=>{const p=objects.keep(curve.Value(t));return [p.X(),p.Y()];};
    if(type===oc.GeomAbs_CurveType.GeomAbs_Line)return {kind:'line',start:at(reversed?to:from),end:at(reversed?from:to)};
    if(type===oc.GeomAbs_CurveType.GeomAbs_BezierCurve){
      const geometry=objects.keep(curve.Bezier()),copy=objects.keep(new oc.Geom_BezierCurve(geometry));copy.Segment(from,to);
      if(copy.IsRational()||![1,2,3].includes(copy.Degree()))throw Error('Die native SVG-Aufteilung erzeugte eine nicht unterstützte rationale Bézierkurve.');
      const points=Array.from({length:copy.NbPoles()},(_,i)=>{const p=objects.keep(copy.Pole(i+1));return [p.X(),p.Y()];});if(reversed)points.reverse();
      return points.length===2?{kind:'line',start:points[0],end:points[1]}:{kind:'bezier',points};
    }
    if(type===oc.GeomAbs_CurveType.GeomAbs_Circle||type===oc.GeomAbs_CurveType.GeomAbs_Ellipse){
      const ellipse=objects.keep(type===oc.GeomAbs_CurveType.GeomAbs_Circle?curve.Circle():curve.Ellipse()),position=objects.keep(ellipse.Position()),x=objects.keep(position.XDirection()),normal=objects.keep(position.Direction()),center=objects.keep(ellipse.Location()),negative=normal.Z()<0;
      if(Math.abs(normal.Z())<1-1e-9)throw Error('Die native SVG-Randkurve liegt nicht in ihrer originalen Ebene.');
      return {kind:'ellipse',center:[center.X(),center.Y()],rx:type===oc.GeomAbs_CurveType.GeomAbs_Circle?ellipse.Radius():ellipse.MajorRadius(),ry:type===oc.GeomAbs_CurveType.GeomAbs_Circle?ellipse.Radius():ellipse.MinorRadius(),rotation:Math.atan2(x.Y(),x.X()),startAngle:negative?-to:from,endAngle:negative?-from:to,reversed:reversed!==negative};
    }
    throw Error('Die native SVG-Aufteilung erzeugte eine nicht unterstützte Originalkurvenklasse.');
  }finally{objects.close();}
}
function nativePlanarWire(oc,wire){
  const objects=contourObjects();try{
    const explorer=objects.keep(new oc.TopExp_Explorer(wire,oc.TopAbs_ShapeEnum.TopAbs_EDGE)),pending=[];
    while(explorer.More()){const edge=objects.keep(oc.TopoDS.Edge(objects.keep(explorer.Current())));if([oc.TopAbs_Orientation.TopAbs_FORWARD,oc.TopAbs_Orientation.TopAbs_REVERSED].includes(edge.Orientation()))pending.push(nativePlanarEdge(oc,edge));explorer.Next();}
    // Splitter can retain dangling INTERNAL tools inside a region. They do
    // not bound a filled area and must never be reinterpreted as open holes.
    if(!pending.length)return null;
    const result=[pending.shift()];while(pending.length){const end=endpoints(result.at(-1))[1],candidates=pending.map((segment,i)=>distance(endpoints(segment)[0],end)<=1e-6?i:-1).filter(i=>i>=0);if(candidates.length!==1)throw Error('Die native SVG-Aufteilung besitzt keinen eindeutigen geschlossenen Rand.');result.push(pending.splice(candidates[0],1)[0]);}
    if(distance(endpoints(result[0])[0],endpoints(result.at(-1))[1])>1e-6)throw Error('Die native SVG-Aufteilung besitzt einen offenen Rand.');
    return positiveWinding(result);
  }finally{objects.close();}
}
function nativePlanarFace(oc,face){
  const objects=contourObjects();try{
    const outer=objects.keep(oc.BRepTools.OuterWire(face)),wires=objects.keep(new oc.TopExp_Explorer(face,oc.TopAbs_ShapeEnum.TopAbs_WIRE)),contour={outer:nativePlanarWire(oc,outer),holes:[]};if(!contour.outer)throw Error('Native Füllregion besitzt keinen Außenrand.');
    while(wires.More()){const wire=objects.keep(oc.TopoDS.Wire(objects.keep(wires.Current())));if(!wire.IsSame(outer)){const boundary=nativePlanarWire(oc,wire);if(boundary)contour.holes.push(boundary);}wires.Next();}return contour;
  }finally{objects.close();}
}
function nativePlanarContours(oc,shape){
  const objects=contourObjects(),contours=[];try{
    const explorer=objects.keep(new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum.TopAbs_FACE));
    while(explorer.More()){
      const face=objects.keep(oc.TopoDS.Face(objects.keep(explorer.Current()))),surface=objects.keep(new oc.BRepAdaptor_Surface(face,true));
      if(surface.GetType()===oc.GeomAbs_SurfaceType.GeomAbs_Plane){const plane=objects.keep(surface.Plane()),position=objects.keep(plane.Position()),center=objects.keep(position.Location()),normal=objects.keep(position.Direction());
        if(Math.abs(center.Z()-.5)<1e-6&&Math.abs(normal.Z())>1-1e-9){
          contours.push(nativePlanarFace(oc,face));
        }
      }explorer.Next();
    }
    if(!contours.length)throw Error('Die native SVG-Aufteilung besitzt keine gefüllte originale Ebene.');return contours;
  }finally{objects.close();}
}
export function arrangeCadSubpaths(oc,subpaths,{fillRule='nonzero'}={}) {
  if(!['nonzero','evenodd'].includes(fillRule)||!Array.isArray(subpaths)||subpaths.length>256)throw Error('Ungültige originale SVG-Unterkonturen oder Füllregel.');
  const objects=contourObjects(),inside=w=>fillRule==='evenodd'?Math.abs(w)%2===1:w!==0;
  function operation(kind,a,b){
    const maker=new oc[kind==='common'?'BRepAlgoAPI_Common':kind==='cut'?'BRepAlgoAPI_Cut':'BRepAlgoAPI_Fuse'](a,b);let result;
    try{if(maker.HasErrors())throw Error('Native SVG-Flächenaufteilung konnte nicht berechnet werden.');result=maker.Shape();const explorer=new oc.TopExp_Explorer(result,oc.TopAbs_ShapeEnum.TopAbs_SOLID);let hasSolid;try{hasSolid=explorer.More();}finally{explorer.delete();}if(!hasSolid){result.delete();return null;}const analyzer=new oc.BRepCheck_Analyzer(result);try{if(!analyzer.IsValid())throw Error('Native SVG-Flächenaufteilung ergibt ungültige Körper.');}finally{analyzer.delete();}return objects.keep(result);}catch(error){result?.delete?.();throw error;}finally{maker.delete();}
  }
  try{
    let regions=[];
    for(const segments of subpaths.filter(path=>path.length)){
      assertSimpleCadSubpath(oc,segments);const area=cadContourSignedArea(segments);if(!Number.isFinite(area)||Math.abs(area)<1e-8)throw Error('SVG-Unterkontur ist degeneriert oder selbstschneidend.');
      const contour=objects.keep(buildCadContours(oc,{contours:[{outer:positiveWinding(segments)}],height:1})),mass=cadRecipeVolume(oc,contour);if(Math.abs(mass-Math.abs(area))>Math.min(Math.abs(area)*1e-6,Math.max(1e-7,Math.abs(area)*1e-8)))throw Error('SVG-Unterkontur ist nicht eindeutig durch ihre originale CAD-Fläche dargestellt.');
      let remaining=contour;const next=[];
      for(const region of regions){const common=operation('common',region.shape,contour),outside=operation('cut',region.shape,contour),winding=fillRule==='evenodd'?(region.winding+Math.sign(area))%2:region.winding+Math.sign(area);
        if(outside)next.push({...region,shape:outside});if(common&&inside(winding))next.push({shape:common,winding});if(remaining)remaining=operation('cut',remaining,region.shape);
      }
      if(remaining)next.push({shape:remaining,winding:Math.sign(area)});regions=next;
      if(regions.length>512)throw Error('SVG-Winding-Aufteilung überschreitet die native Konstruktionsgrenze.');
      objects.prune(new Set(regions.map(region=>region.shape)));
    }
    if(!regions.length)return {contours:[],topologyCertified:true,sourceTopology:'cad-native-winding-arrangement',fillRule};
    let shape=regions[0].shape;for(const region of regions.slice(1))shape=operation('fuse',shape,region.shape);
    const contours=nativePlanarContours(oc,shape),rebuilt=objects.keep(buildCadContours(oc,{contours,height:1})),expected=cadRecipeVolume(oc,shape),actual=cadRecipeVolume(oc,rebuilt);
    if(Math.abs(actual-expected)>Math.min(expected*1e-6,Math.max(1e-7,expected*1e-8)))throw Error('Originale SVG-Randkurven bewahren die native Füllfläche nicht.');
    return {contours,topologyCertified:true,sourceTopology:'cad-native-winding-arrangement',fillRule};
  }finally{objects.close();}
}

// This adapter is useful for already-provided Shapes but does not upgrade the
// sampled hole classification used by Three.ShapePath.toShapes().
export function originalCadShapes(shapes,options={}) {
  return {contours:shapes.map(shape=>({outer:positiveWinding(originalCadSubpath(shape,options)),holes:(shape.holes||[]).map(hole=>positiveWinding(originalCadSubpath(hole,options)))})),topologyCertified:false,sourceTopology:'provided-shapes-unverified'};
}

// Faithful to FontLoader's typeface m/l/q/b coordinates and advance metrics,
// while retaining raw glyph subpaths before generateShapes().toShapes().
export function originalFontSubpaths(font,text,size=10) {
  const data=font?.data||font;
  if(!data?.glyphs||!Number.isFinite(data.resolution)||data.resolution<=0||typeof text!=='string'||!Number.isFinite(size)||size<=0)throw Error('Ungültige originale Schriftquelle.');
  const scale=size/data.resolution,lineHeight=(data.boundingBox.yMax-data.boundingBox.yMin+data.underlineThickness)*scale,groups=[];let offsetX=0,offsetY=0,previous=null;
  for(const char of Array.from(text)){
    if(char==='\n'){offsetX=0;offsetY-=lineHeight;previous=null;continue;}
    const glyph=data.glyphs[char]||(!data.strictGlyphs&&data.glyphs['?']);if(!glyph)throw Error(`Schriftzeichen fehlt: ${char}`);offsetX+=(data.kerning?.[previous]?.[char]??0)*scale;previous=char;
    const tokens=glyph.o?glyph.o.trim().split(/\s+/):[],paths=[];let path,current,first;
    const read=()=>{const p=[Number(tokens.shift())*scale+offsetX,Number(tokens.shift())*scale+offsetY];if(!p.every(Number.isFinite))throw Error('Ungültige originale Glyphenkontur.');return p;};
    while(tokens.length){
      const command=tokens.shift();
      if(command==='m'){path=[];paths.push(path);current=read();first=current;}
      else {if(!path||!current)throw Error('Glyphenkontur beginnt nicht mit einem Punkt.');
        if(command==='z'){if(distance(current,first)>1e-10)path.push({kind:'line',start:current,end:first});current=first;}
        else if(command==='l'){const end=read();path.push({kind:'line',start:current,end});current=end;}
        else if(command==='q'){const end=read(),control=read();path.push({kind:'bezier',points:[current,control,end]});current=end;}
        else if(command==='b'){const end=read(),control1=read(),control2=read();path.push({kind:'bezier',points:[current,control1,control2,end]});current=end;}
        else throw Error(`Nicht unterstützter originaler Glyphenbefehl: ${command}`);
      }
    }
    for(const segments of paths.filter(path=>path.length)){const first=endpoints(segments[0])[0],last=endpoints(segments.at(-1))[1];if(distance(first,last)>1e-10)segments.push({kind:'line',start:last,end:first});}
    if(paths.some(path=>path.length))groups.push({subpaths:paths.filter(path=>path.length),fillRule:'nonzero',character:char});
    offsetX+=glyph.ha*scale;
  }
  return groups;
}
export function cadContoursFromFont(oc,font,text,size=10) {
  const groups=originalFontSubpaths(font,text,size),contours=[];
  // Some original glyphs contain touching or overlapping subpaths (for
  // example the registered-sign R and Optimer's cedilla). Apply the same
  // native winding-region construction as SVG instead of dropping boundaries.
  for(const group of groups)contours.push(...cadContoursFromSvgSubpaths(oc,group.subpaths,{fillRule:group.fillRule}).contours);
  if(!contours.length)throw Error('Text enthält keine gefüllten Schriftkonturen.');
  return {contours,topologyCertified:true,sourceTopology:'original-font-cad-classified'};
}
export function originalSvgSubpaths(paths,{flipY=true}={}) {
  return paths.filter(path=>path.userData?.style?.fill!=='none'&&path.userData?.style?.visibility!=='hidden').map(path=>({subpaths:path.subPaths.map(subpath=>originalCadSubpath(subpath,{flipY})).filter(segments=>segments.length),fillRule:path.userData?.style?.fillRule||'nonzero'}));
}
/** Transferred original subpaths use the same native certification gates. */
export function cadContoursFromSvgSubpaths(oc,subpaths,{fillRule='nonzero'}={}) {
  if(!Array.isArray(subpaths)||subpaths.length>256)throw Error('Zu viele originale SVG-Unterkonturen.');
  let selfIntersection=false;
  for(const segments of subpaths)try{assertSimpleCadSubpath(oc,segments);}catch(error){if(!/Selbstschneidende/.test(error.message))throw error;selfIntersection=true;}
  if(selfIntersection){const result=splitCadWindingRegions(oc,subpaths,{fillRule,readFace:nativePlanarFace,contourArea:contour=>Math.abs(cadContourSignedArea(contour.outer))-contour.holes.reduce((sum,hole)=>sum+Math.abs(cadContourSignedArea(hole)),0)});return {contours:result.contours,topologyCertified:true,sourceTopology:'original-svg-cad-classified'};}
  let classified;try{classified=classifyCadSubpaths(oc,subpaths,{fillRule});}catch(error){if(!/kreuzen|berühren|Flächenaufteilung/.test(error.message))throw error;classified=arrangeCadSubpaths(oc,subpaths,{fillRule});}
  return {contours:classified.contours,topologyCertified:true,sourceTopology:'original-svg-cad-classified'};
}
export function cadContoursFromSvgPaths(oc,paths,options={}) {
  const groups=originalSvgSubpaths(paths,options),contours=[];
  for(const group of groups)if(group.subpaths.length){
    contours.push(...cadContoursFromSvgSubpaths(oc,group.subpaths,{fillRule:group.fillRule}).contours);
  }
  if(!contours.length)throw Error('SVG enthält keine gefüllten Originalkonturen.');
  return {contours,topologyCertified:true,sourceTopology:'original-svg-cad-classified'};
}
