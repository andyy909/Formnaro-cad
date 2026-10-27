// Native precision queries. All results are transient worker DTOs; section
// faces, projected curves and display points never replace source CAD models.
import {cadIdentity,inverseCadMatrix} from './cad-affine.js';
import {cadBounds,cadVolume,cadRayHits,cadClassifyPoint,cadDisplayMesh,validateCadSolid,transformCad,writeCadBrep} from './cad-native-kernel.js';
import {cadCollisionNative} from './cad-analysis-native.js';
import {projectCadFaceAnchorNative} from './cad-topology-native.js';
import {uniqueCadEdgesNative,cadNativeCurveDto,cadCurveDisplayPointsNative,validateCadPrecisionFrame,transformCadGeometryRigidNative,cadEdgeDisplayNative,cadEdgesInRectangleNative} from './cad-edge-display-native.js';

const fail=(code,message)=>{const error=Error(message);error.code=code;throw error;};
const xyz=p=>[p.X(),p.Y(),p.Z()],dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),near=(a,b,t)=>Math.hypot(...a.map((v,k)=>v-b[k]))<=t;
function vector(value){if(!Array.isArray(value)||value.length!==3||!value.every(Number.isFinite))throw Error('Endliche native CAD-Koordinaten erforderlich.');return [...value];}
function unit(value){const v=vector(value),largest=Math.max(...v.map(Math.abs));if(!largest)throw Error('CAD-Normale fehlt.');const scaled=v.map(x=>x/largest),length=Math.hypot(...scaled);return scaled.map(x=>x/length);}
function cadNode(node){if(node?.kind!=='cad')fail('REFERENCE_MESH_NOT_CAD','Netzreferenzen sind kein Ziel für CAD-Präzisionswerkzeuge.');if(!node.solid||node.suppressed)fail('INVALID_CAD_TARGET','CAD-Präzisionsprüfungen benötigen einen aktiven positiven Ergebniskörper.');return node;}
function buildCommon(oc,left,right){const builder=new oc.BRepAlgoAPI_Common(left,right);let result;try{if(builder.HasErrors())throw Error('Native CAD-Schnittoperation fehlgeschlagen.');result=builder.Shape();return result;}catch(error){result?.delete();throw error;}finally{builder.delete();}}
function area(oc,shape){if(shape.IsNull())return 0;const props=new oc.GProp_GProps();try{const error=oc.BRepGProp.SurfaceProperties(shape,props,1e-10,true),value=props.Mass();if(!Number.isFinite(error)||error<0||!Number.isFinite(value)||value<0)throw Error('Native CAD-Schnittflächenintegration fehlgeschlagen.');return value;}finally{props.delete();}}
function edgeDtos(oc,shape,options){if(shape.IsNull())return [];const edges=uniqueCadEdgesNative(oc,shape),result=[];let count=0;try{for(const edge of edges){const points=cadCurveDisplayPointsNative(oc,edge,options);count+=points.length;if(count>(options.maxPoints??200000))throw Error('CAD-Schnittanzeige überschreitet die Punktgrenze.');result.push({curve:cadNativeCurveDto(oc,edge),points});}return result;}finally{edges.forEach(edge=>edge.delete());}}
function num(value){if(!Number.isFinite(value))throw Error('SVG-Koordinate ist nicht endlich.');return Object.is(value,-0)?'0':String(value);}
const svgPoint=p=>`${num(p[0])},${num(-p[1])}`;
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));

/** A positive rational Bézier curve lies in its control hull. Recursive
 * homogeneous de Casteljau subdivision bounds the entire curve by the chord
 * capsule, rather than checking a fixed number of sampled curve points. */
export function boundedCadBezierPolyline(poles,weights,{tolerance=.01,maxPoints=200000}={}){
  if(!Array.isArray(poles)||poles.length<2||poles.length>64||poles.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))||!Array.isArray(weights)||weights.length!==poles.length||weights.some(w=>!Number.isFinite(w)||w<=0)||!Number.isFinite(tolerance)||tolerance<1e-7||!Number.isSafeInteger(maxPoints)||maxPoints<2||maxPoints>1000000)throw Error('Ungültige kontrollierte CAD-Bézierprojektion.');
  const largest=Math.max(...weights),initial=poles.map((p,k)=>[p[0]*(weights[k]/largest),p[1]*(weights[k]/largest),weights[k]/largest]);if(initial.some(p=>!p.every(Number.isFinite)||p[2]===0))throw Error('Rationale CAD-Projektionsgewichte außerhalb des Zahlenbereichs.');
  const point=h=>[h[0]/h[2],h[1]/h[2]],distance=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);},result=[point(initial[0])];
  function visit(controls,depth){const a=point(controls[0]),b=point(controls.at(-1)),bound=Math.max(...controls.map(h=>distance(point(h),a,b)));if(!Number.isFinite(bound))throw Error('CAD-Projektionsfehlergrenze ist nicht endlich.');if(bound<=tolerance){result.push(b);if(result.length>maxPoints)throw Error('CAD-Projektion überschreitet die Punktgrenze.');return;}if(depth>=32)throw Error('CAD-Projektionsfehlergrenze wurde nicht erreicht.');const left=[controls[0]],right=[controls.at(-1)];let row=controls;while(row.length>1){row=row.slice(0,-1).map((h,k)=>h.map((v,j)=>(v+row[k+1][j])/2));left.push(row[0]);right.push(row.at(-1));}visit(left,depth+1);visit(right.reverse(),depth+1);}
  visit(initial,0);return {points:result,maxDeviation:tolerance,proof:'positive-rational-bezier-control-hull'};
}

function svgBezier(poles,weights,tolerance,maxPoints){
  const rational=weights.some(w=>w!==weights[0]),start=`M${svgPoint(poles[0])}`;
  if(!rational&&poles.length===2)return {d:`${start} L${svgPoint(poles[1])}`,approximate:false};
  if(!rational&&poles.length===3)return {d:`${start} Q${svgPoint(poles[1])} ${svgPoint(poles[2])}`,approximate:false};
  if(!rational&&poles.length===4)return {d:`${start} C${svgPoint(poles[1])} ${svgPoint(poles[2])} ${svgPoint(poles[3])}`,approximate:false};
  const bounded=boundedCadBezierPolyline(poles,weights,{tolerance,maxPoints});return {d:`${start} ${bounded.points.slice(1).map(p=>`L${svgPoint(p)}`).join(' ')}`,approximate:true,maxDeviation:bounded.maxDeviation,proof:bounded.proof};
}
function svgCurve(oc,edge,{tolerance,maxPoints}){
  const dto=cadNativeCurveDto(oc,edge),start=`M${svgPoint(dto.start)}`;
  if(dto.kind==='line')return [{d:`${start} L${svgPoint(dto.end)}`,approximate:false}];
  if(['circle','ellipse'].includes(dto.kind)){
    const [from,to]=dto.parameterRange,span=to-from;if(span>2*Math.PI+1e-7)throw Error('Projizierte CAD-Konikkante überschreitet eine Periode.');const count=Math.max(1,Math.ceil(span/(Math.PI/2))),[rx,ry]=dto.radii,rotation=Math.atan2(-dto.xAxis[1],dto.xAxis[0])*180/Math.PI,sweep=dto.xAxis[1]*dto.yAxis[0]-dto.xAxis[0]*dto.yAxis[1]>0?1:0;
    let d=start;for(let i=1;i<=count;i++){const u=from+span*i/count,p=[0,1].map(k=>dto.center[k]+rx*Math.cos(u)*dto.xAxis[k]+ry*Math.sin(u)*dto.yAxis[k]);d+=` A${num(rx)},${num(ry)} ${num(rotation)} 0 ${sweep} ${svgPoint(p)}`;}if(dto.closed)d+=' Z';return [{d,approximate:false}];
  }
  if(dto.kind==='bezier')return [svgBezier(dto.poles.map(p=>p.slice(0,2)),dto.weights,tolerance,maxPoints)];
  if(dto.kind!=='bspline')fail('UNSUPPORTED_CAD_PROJECTION_CURVE','Native Projektionskurve besitzt keinen kontrollierten SVG-Pfad.');
  const plane=new oc.gp_Pln(),maker=new oc.BRepBuilderAPI_MakeFace(plane),face=maker.Face(),surface=oc.BRep_Tool.Surface(face),location=new oc.TopLoc_Location();let envelope,adapter,spline,converter;
  try{envelope=oc.BRep_Tool.CurveOnPlane(edge,surface,location);if(!envelope.returnValue)throw Error('Native planare CAD-Projektionskurve fehlt.');adapter=new oc.Geom2dAdaptor_Curve(envelope.returnValue,envelope.First,envelope.Last);spline=adapter.BSpline();converter=new oc.Geom2dConvert_BSplineCurveToBezierCurve(spline,envelope.First,envelope.Last,1e-10);const count=converter.NbArcs();if(count>8000)throw Error('CAD-Splineprojektion überschreitet die Kurvenstückgrenze.');const paths=[];for(let i=1;i<=count;i++){const arc=converter.Arc(i),poles=[],weights=[];try{for(let k=1;k<=arc.NbPoles();k++){const p=arc.Pole(k);try{poles.push([p.X(),p.Y()]);weights.push(arc.Weight(k));}finally{p.delete();}}paths.push(svgBezier(poles,weights,tolerance,maxPoints));}finally{arc.delete();}}return paths;}
  finally{converter?.delete();spline?.delete();adapter?.delete();envelope?.[Symbol.dispose]?.();location.delete();surface.delete();face.delete();maker.delete();plane.delete();}
}

/** API methods return serializable native query results. The owner runs these
 * in its persistent CAD worker, with cancellation handled at the worker boundary. */
export function createCadPrecisionNative({oc,service}={}){
  if(!oc||typeof service?.worldShape!=='function')throw TypeError('Nativer CAD-Kern und Dienst erforderlich.');
  function section({node,frame=cadIdentity(),side='negative',linearDeflection=.02,angularDeflection=.15,maxPoints=200000,display=false,displayQuality={deflection:.02,angleDegrees:8}}={}){
    cadNode(node);frame=validateCadPrecisionFrame(frame);if(!['negative','positive'].includes(side)||typeof display!=='boolean')throw Error('Ungültige CAD-Schnittseite.');
    const world=service.worldShape(node),local=transformCad(oc,world,inverseCadMatrix(frame)),bounds=cadBounds(oc,local),plane=new oc.gp_Pln(),faceMaker=new oc.BRepBuilderAPI_MakeFace(plane);let face,sectionBuilder,contours,cap,clip,clipBox,boxMaker,corner,contoursWorld,capWorld,clipWorld;
    try{
      face=faceMaker.Face();sectionBuilder=new oc.BRepAlgoAPI_Section(local,plane,false);sectionBuilder.Approximation(false);sectionBuilder.ComputePCurveOn1(true);sectionBuilder.ComputePCurveOn2(true);sectionBuilder.Build();if(sectionBuilder.HasErrors())throw Error('Nativer CAD-Ebenenschnitt fehlgeschlagen.');contours=sectionBuilder.Shape();cap=buildCommon(oc,local,face);const capArea=area(oc,cap),margin=Math.max(1,Math.hypot(...bounds.size)*.01),min=bounds.min.map(v=>v-margin),max=bounds.max.map(v=>v+margin),lower=side==='negative'?min[2]:0,upper=side==='negative'?0:max[2];
      if(upper>lower){corner=new oc.gp_Pnt(min[0],min[1],lower);boxMaker=new oc.BRepPrimAPI_MakeBox(corner,max[0]-min[0],max[1]-min[1],upper-lower);clipBox=boxMaker.Shape();clip=buildCommon(oc,local,clipBox);}
      let clipVolume=clip&&!clip.IsNull()?cadVolume(oc,clip):0;if(!Number.isFinite(clipVolume)||clipVolume<0)throw Error('CAD-Schnittkörper besitzt ungültiges Volumen.');if(clipVolume>0){validateCadSolid(oc,clip);clipWorld=transformCad(oc,clip,frame);}else clipVolume=0;
      if(!contours.IsNull()){const edges=uniqueCadEdgesNative(oc,contours);try{if(edges.length)contoursWorld=transformCadGeometryRigidNative(oc,contours,frame);}finally{edges.forEach(edge=>edge.delete());}}
      if(capArea>0)capWorld=transformCadGeometryRigidNative(oc,cap,frame);
      return {kind:'cad-section',objectId:node.id,frame:[...frame],side,area:capArea,clipVolume,contoursBrep:contoursWorld?writeCadBrep(oc,contoursWorld):null,capBrep:capWorld?writeCadBrep(oc,capWorld):null,clipBrep:clipWorld?writeCadBrep(oc,clipWorld):null,edges:contoursWorld?edgeDtos(oc,contoursWorld,{linearDeflection,angularDeflection,maxPoints}):[],...(display?{capDisplay:capWorld?cadDisplayMesh(oc,capWorld,displayQuality):null,clipDisplay:clipWorld?cadDisplayMesh(oc,clipWorld,displayQuality):null}:{})};
    }finally{clipWorld?.delete();capWorld?.delete();contoursWorld?.delete();clip?.delete();clipBox?.delete();boxMaker?.delete();corner?.delete();cap?.delete();contours?.delete();sectionBuilder?.delete();face?.delete();faceMaker.delete();plane.delete();local.delete();world.delete();}
  }
  function svgProjection({nodes,frame=cadIdentity(),includeHidden=false,tolerance=.01,maxPoints=200000}={}){
    if(!Array.isArray(nodes)||!nodes.length||nodes.length>10000||typeof includeHidden!=='boolean'||!Number.isFinite(tolerance)||tolerance<1e-7||!Number.isSafeInteger(maxPoints)||maxPoints<2||maxPoints>1000000)throw Error('Ungültige native CAD-SVG-Projektion.');nodes.forEach(cadNode);frame=validateCadPrecisionFrame(frame);
    const algorithm=new oc.HLRBRep_Algo(),projector=new oc.HLRAlgo_Projector(),shapes=[],extractions=[],paths=[];let filter;
    try{algorithm.Projector(projector);for(const node of nodes){const world=service.worldShape(node);try{const local=transformCad(oc,world,inverseCadMatrix(frame));shapes.push(local);algorithm.Add(local,0);}finally{world.delete();}}algorithm.Update();algorithm.Hide();filter=new oc.HLRBRep_HLRToShape(algorithm);
      const types=[['VCompound',false],['OutLineVCompound',false],['Rg1LineVCompound',false]];if(includeHidden)types.push(['HCompound',true],['OutLineHCompound',true],['Rg1LineHCompound',true]);
      let min=[Infinity,Infinity],max=[-Infinity,-Infinity],pointCount=0;
      for(const [method,hidden] of types){const shape=filter[method]();extractions.push(shape);if(shape.IsNull())continue;if(!oc.BRepLib.BuildCurves3d(shape))throw Error('Native Projektionskanten konnten nicht als CAD-Kurven erzeugt werden.');const edges=uniqueCadEdgesNative(oc,shape);try{for(const edge of edges){const bounds=cadBounds(oc,edge);for(let k=0;k<2;k++){const lo=k===1?-bounds.max[k]:bounds.min[k],hi=k===1?-bounds.min[k]:bounds.max[k];min[k]=Math.min(min[k],lo);max[k]=Math.max(max[k],hi);}for(const path of svgCurve(oc,edge,{tolerance,maxPoints})){pointCount+=(path.d.match(/[MLQCA]/g)||[]).length;if(pointCount>maxPoints)throw Error('CAD-SVG überschreitet die gesamte Punkt-/Befehlgrenze.');paths.push({...path,hidden});}}}finally{edges.forEach(edge=>edge.delete());}}
      if(!paths.length)throw Error('Native CAD-Projektion ist leer.');const width=max[0]-min[0],height=max[1]-min[1],viewBox=[...min,width||1,height||1],svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.map(num).join(' ')}" width="${num(width||1)}mm" height="${num(height||1)}mm" data-source="native-cad-hlr" data-y-axis="down"><g fill="none" stroke="black" stroke-width="0.1">${paths.map(path=>`<path d="${escape(path.d)}"${path.hidden?' stroke-dasharray="1 1"':''}${path.approximate?` data-max-deviation-mm="${num(path.maxDeviation)}" data-error-bound="${path.proof}"`:''}/>`).join('')}</g></svg>`;
      return {kind:'cad-svg-projection',frame:[...frame],projection:'orthographic-native-hlr',yAxis:'down',viewBox,paths,svg,tolerance,approximation:paths.some(path=>path.approximate)?'bounded-native-curve-representation':'exact-svg-curves'};
    }finally{extractions.forEach(shape=>shape.delete());filter?.delete();algorithm.delete();projector.delete();shapes.forEach(shape=>shape.delete());}
  }
  function wallThickness({node,samples,maxDistance,tolerance=1e-7}={}){
    cadNode(node);if(!Array.isArray(samples)||!samples.length||samples.length>200||!Number.isFinite(tolerance)||tolerance<1e-7||tolerance>1e-4)throw Error('Ungültige CAD-Wandstärkenstichprobe.');
    const shape=service.worldShape(node);try{const bounds=cadBounds(oc,shape),limit=maxDistance??Math.max(1,Math.hypot(...bounds.size)*2);if(!Number.isFinite(limit)||limit<=tolerance*8)throw Error('Ungültige CAD-Wandstärkenmessweite.');const results=samples.map((sample,index)=>{
        const point=vector(sample.point),normal=unit(sample.normal),matches=projectCadFaceAnchorNative(oc,shape,{point,normal},{tolerance});if(matches.length!==1)return {index,status:matches.length?'ambiguous-surface':'missing-surface',point,normal,thickness:null};
        const start=matches[0].point,direction=normal.map(v=>-v),insidePoint=start.map((v,k)=>v+direction[k]*tolerance*4);if(cadClassifyPoint(oc,shape,insidePoint,{tolerance})!=='inside')return {index,status:'unresolved-inside',point:start,normal,thickness:null};
        const hits=cadRayHits(oc,shape,{origin:start,direction,near:tolerance*4,far:limit,tolerance}).sort((a,b)=>a.t-b.t);let hit;
        for(const candidate of hits){if(dot(candidate.normal,direction)<=1e-8)continue;hit=candidate;break;}if(!hit)return {index,status:'no-exit',point:start,normal,thickness:null};
        if(hits.some(candidate=>candidate!==hit&&Math.abs(candidate.t-hit.t)<=tolerance&&(!near(candidate.point,hit.point,tolerance)||candidate.faceIndex!==hit.faceIndex)))return {index,status:'ambiguous-exit',point:start,normal,thickness:null};
        const midpoint=start.map((v,k)=>v+direction[k]*hit.t/2);if(cadClassifyPoint(oc,shape,midpoint,{tolerance})!=='inside')return {index,status:'unresolved-material-interval',point:start,normal,thickness:null};return {index,status:'measured',point:start,normal,exit:vector(hit.point),thickness:hit.t};
      }),measured=results.filter(sample=>sample.status==='measured').map(sample=>sample.thickness);
      return {kind:'cad-surface-samples',objectId:node.id,method:'native-cad-inward-normal-ray',sampling:true,label:'Stichprobenprüfung auf CAD-Flächen',samples:results,minimumSampledThickness:measured.length?Math.min(...measured):null,complete:false,samplesComplete:results.every(sample=>sample.status==='measured')};
    }finally{shape.delete();}
  }
  return {section,svgProjection,wallThickness,collision:({left,right})=>cadCollisionNative(oc,cadNode(left),cadNode(right)),edges:options=>cadEdgeDisplayNative(oc,options.node,options),edgesInRectangle:options=>cadEdgesInRectangleNative(oc,options.node,options)};
}
