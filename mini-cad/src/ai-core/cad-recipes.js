// Independent CAD construction groundwork. This module never imports a mesh
// kernel and is deliberately not wired into the current v4 editor.
import {defaults, parameters, gearDimensions, validParameters} from './parameters.js';
import {buildCadThread,cadThreadDefinition,buildCadTwistedContours} from './cad-screw-surfaces.js';
import {cadVolume} from './cad-native-kernel.js';
import {resolveCadSketch} from './cad-sketch.js';

const TAU = 2 * Math.PI;
const MIN_TOLERANCE = 2e-7;
export const CAD_CONSTRUCTION_TOLERANCE = 1e-4;
export const CAD_RECIPE_STATUS = Object.freeze({
  box: 'analytic', cylinder: 'analytic', sphere: 'analytic', cone: 'analytic',
  pyramid: 'planar', roof: 'planar', wedge: 'planar', hexagon: 'planar',
  triangle: 'planar', tube: 'analytic', torus: 'analytic', capsule: 'analytic',
  star: 'planar', heart: 'bounded-bezier', gear: 'bounded-bezier-and-screw',
  text: 'original-contours-required', roundbox: 'analytic', halfSphere: 'analytic',
  thread: 'bounded-screw-surface', nut: 'bounded-screw-surface',
  countersink: 'analytic', shellbox: 'analytic', polygon: 'planar'
});

function positive(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw Error(`${name}: positiver endlicher Wert erforderlich.`);
  return value;
}
export function constructionTolerance(minFeature, constructionBudget = CAD_CONSTRUCTION_TOLERANCE) {
  if(!Number.isFinite(constructionBudget)||constructionBudget<=0||constructionBudget>CAD_CONSTRUCTION_TOLERANCE)throw Error('Ungültiges CAD-Konstruktionsbudget.');
  const tolerance = Math.min(constructionBudget, positive(minFeature, 'Merkmalsgröße') / 100);
  if (tolerance < MIN_TOLERANCE) throw Error('Merkmal zu klein für die nachgewiesene CAD-Konstruktionstoleranz.');
  return tolerance;
}

// Cubic Hermite interpolation: scalar error <= sup|f''''| h^4 / 384.
// Applying the component bounds gives the Euclidean bound used here. The
// caller supplies analytic fourth-derivative bounds, never measured samples.
export function boundedHermite({value, derivative, fourthBounds, start, end, tolerance}) {
  if (!(Number.isFinite(start) && Number.isFinite(end) && end > start)) throw Error('Ungültiges Kurvenintervall.');
  if (!Array.isArray(fourthBounds) || fourthBounds.length !== 2 || fourthBounds.some(v => !Number.isFinite(v) || v < 0)) throw Error('Analytische Ableitungsgrenzen erforderlich.');
  if (!Number.isFinite(tolerance) || tolerance < MIN_TOLERANCE || tolerance > CAD_CONSTRUCTION_TOLERANCE) throw Error('Ungültige Konstruktionstoleranz.');
  const bound = Math.hypot(...fourthBounds);
  // Reserve half the tolerance for construction/roundoff; OCCT's ordinary
  // topological confusion tolerance is not mistaken for an approximation proof.
  const maximumStep = bound ? (384 * tolerance / 2 / bound) ** .25 : end - start;
  const count = Math.max(1, Math.ceil((end - start) / maximumStep));
  if (count > 100000) throw Error('Die kontrollierte CAD-Kurve überschreitet die Konstruktionsgrenze.');
  const h = (end - start) / count, segments = [];
  for (let i = 0; i < count; i++) {
    const a = start + i * h, b = i === count - 1 ? end : start + (i + 1) * h;
    const p0 = value(a), p1 = value(b), d0 = derivative(a), d1 = derivative(b);
    if (![p0, p1, d0, d1].every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) throw Error('Ungültige analytische Kurvenwerte.');
    segments.push({kind: 'bezier', points: [p0, p0.map((v, k) => v + (b - a) * d0[k] / 3), p1.map((v, k) => v - (b - a) * d1[k] / 3), p1], interval: [a, b]});
  }
  return {segments, tolerance, interpolationBound: bound * h ** 4 / 384, fourthBounds: [...fourthBounds]};
}

function heartMaximumY() {
  // Stationary point: y'(t)=sin(t)(32 cos(t)^3+24 cos(t)^2+4 cos(t)-19).
  // The cubic has exactly one root in [0,1] and no roots in [-1,0].
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) {const c = (lo + hi) / 2; if (32*c**3+24*c**2+4*c-19 > 0) hi=c; else lo=c;}
  const t = Math.acos((lo + hi) / 2);
  return 13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t);
}
export function heartContour(size, tolerance = constructionTolerance(Math.min(...size))) {
  const [w, d] = size.map((v, i) => positive(v, ['Breite', 'Tiefe'][i]));
  const ymax = heartMaximumY(), sx = w / 32, sy = d / (ymax + 17), cy = (ymax - 17) / 2;
  const result = boundedHermite({
    value: t => [sx*(12*Math.sin(t)-4*Math.sin(3*t)), sy*(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t)-cy)],
    derivative: t => [sx*(12*Math.cos(t)-12*Math.cos(3*t)), sy*(-13*Math.sin(t)+10*Math.sin(2*t)+6*Math.sin(3*t)+4*Math.sin(4*t))],
    fourthBounds: [336*sx, 511*sy], start: 0, end: TAU, tolerance
  });
  // The function is periodic. Share the exact same double-valued endpoint.
  result.segments.at(-1).points[3] = [...result.segments[0].points[0]];
  return result;
}
export function involuteContour(baseRadius, start, end, tolerance) {
  positive(baseRadius, 'Grundkreisradius');
  if (start < 0) throw Error('Evolventenparameter muss nichtnegativ sein.');
  return boundedHermite({
    value: t => [baseRadius*(Math.cos(t)+t*Math.sin(t)), baseRadius*(Math.sin(t)-t*Math.cos(t))],
    derivative: t => [baseRadius*t*Math.cos(t), baseRadius*t*Math.sin(t)],
    fourthBounds: [baseRadius*(3+end), baseRadius*(3+end)], start, end, tolerance
  });
}

function gearDefinition(input) {
  const p={...defaults('gear'),...input},dimensions=gearDimensions(p),rp=dimensions.pitch/2,rb=dimensions.base/2,ra=dimensions.outer/2,rf=dimensions.root/2;
  if(!validParameters({type:'gear',params:p}))throw Error('Ungültige Zahnradparameter.');
  if(rf<=0||ra<=Math.max(rb,rf))throw Error('Zahnradparameter ergeben kein gültiges Evolventenprofil.');
  const inv=r=>{const t=Math.sqrt(Math.max(0,(r/rb)**2-1));return t-Math.atan(t);},half=(Math.PI/2+2*p.profileShift*Math.tan(p.pressureAngle*Math.PI/180))/p.teeth-p.backlash/(2*rp),halfAt=r=>half+inv(rp)-inv(r),startRadius=Math.max(rb,rf);
  if(halfAt(ra)<=.002||halfAt(startRadius)>=Math.PI/p.teeth)throw Error('Zahnflanken überlappen oder bilden unzulässige Zahnspitzen.');
  const minimumFeature=Math.min(p.module,p.thickness,ra-rf,2*ra*halfAt(ra),...['bore','hubHeight','keyWidth','keyDepth','backlash'].map(k=>p[k]>0?p[k]:Infinity));
  return {p,dimensions,rp,rb,ra,rf,inv,half,halfAt,startRadius,minimumFeature};
}
export function cadRecipeMinimumFeature(recipe) {
  if(recipe?.type==='gear')return gearDefinition(recipe.params).minimumFeature;
  if(recipe?.type==='thread'||recipe?.type==='nut')return cadThreadDefinition({...defaults(recipe.type),...recipe.params}).minimumFeature;
  if(!Array.isArray(recipe?.size)||recipe.size.length!==3)throw Error('Merkmalsgrößen im CAD-Rezept fehlen.');
  recipe.size.forEach(v=>positive(v,'Merkmalsgröße'));
  return Math.min(...recipe.size);
}
export function gearContour(input,{constructionBudget=CAD_CONSTRUCTION_TOLERANCE}={}) {
  const {p,dimensions,rp,rb,ra,rf,inv,half,halfAt,startRadius,minimumFeature}=gearDefinition(input);
  const tolerance=constructionTolerance(minimumFeature,constructionBudget),start=Math.sqrt((startRadius/rb)**2-1),end=Math.sqrt((ra/rb)**2-1),flank=involuteContour(rb,start,end,tolerance),segments=[];
  const polar=(r,a)=>[r*Math.cos(a),r*Math.sin(a)],rotated=(point,a,reflected=false)=>{const x=point[0],y=point[1]*(reflected?-1:1);return [x*Math.cos(a)-y*Math.sin(a),x*Math.sin(a)+y*Math.cos(a)];};
  const addLine=(a,b)=>{if(Math.hypot(...a.map((v,k)=>v-b[k]))>1e-10)segments.push({kind:'line',start:a,end:b});};
  for(let tooth=0;tooth<p.teeth;tooth++){
    const angle=tooth*TAU/p.teeth,leftRotation=angle-half-inv(rp),rightRotation=angle+half+inv(rp);
    const left=flank.segments.map(segment=>({kind:'bezier',points:segment.points.map(point=>rotated(point,leftRotation))})),right=flank.segments.toReversed().map(segment=>({kind:'bezier',points:segment.points.toReversed().map(point=>rotated(point,rightRotation,true))}));
    const leftRoot=polar(rf,angle-halfAt(startRadius)),rightRoot=polar(rf,angle+halfAt(startRadius)),rootEnd=polar(rf,angle+TAU/p.teeth-halfAt(startRadius));
    addLine(leftRoot,left[0].points[0]);segments.push(...left);
    segments.push({kind:'arc',start:left.at(-1).points[3],through:polar(ra,angle),end:right[0].points[0]});
    segments.push(...right);addLine(right.at(-1).points[3],rightRoot);
    segments.push({kind:'arc',start:rightRoot,through:polar(rf,(angle+halfAt(startRadius)+angle+TAU/p.teeth-halfAt(startRadius))/2),end:rootEnd});
  }
  segments.at(-1).end=[...(segments[0].start||segments[0].points[0])];
  return {segments,tolerance,interpolationBound:flank.interpolationBound,dimensions,minimumFeature};
}

function scope() {
  const objects = [];
  return {keep: o => (objects.push(o), o), release: o => (objects.splice(objects.indexOf(o), 1), o), close: () => {for (const o of objects.reverse()) o?.delete?.();}};
}
function point(oc, s, p) {return s.keep(new oc.gp_Pnt(p[0], p[1], p[2] || 0));}
function axis(oc, s, center, normal = [0,0,1], x = [1,0,0]) {
  return s.keep(new oc.gp_Ax2(point(oc,s,center), s.keep(new oc.gp_Dir(...normal)), s.keep(new oc.gp_Dir(...x))));
}
function lineEdge(oc, s, a, b) {return s.keep(s.keep(new oc.BRepBuilderAPI_MakeEdge(point(oc,s,a),point(oc,s,b))).Edge());}
function segmentEdge(oc, s, segment, z = 0) {
  let builder;
  if (segment.kind === 'line') return lineEdge(oc,s,[...segment.start,z],[...segment.end,z]);
  if (segment.kind === 'bezier') {
    if (![3,4].includes(segment.points?.length)) throw Error('Quadratische oder kubische originale Bézierkontur erforderlich.');
    const poles = s.keep(new oc.NCollection_Array1_gp_Pnt(1, segment.points.length));
    segment.points.forEach((p,i) => poles.SetValue(i+1,point(oc,s,[...p,z])));
    builder=s.keep(new oc.BRepBuilderAPI_MakeEdge(s.keep(new oc.Geom_BezierCurve(poles))));
  } else if (segment.kind === 'arc') {
    const arc=s.keep(new oc.GC_MakeArcOfCircle(point(oc,s,[...segment.start,z]),point(oc,s,[...segment.through,z]),point(oc,s,[...segment.end,z])));
    builder=s.keep(new oc.BRepBuilderAPI_MakeEdge(s.keep(arc.Value())));
  } else if (segment.kind === 'ellipse') {
    const {center,rx,ry,rotation=0,startAngle=0,endAngle=TAU}=segment;
    positive(rx,'Ellipsenradius');positive(ry,'Ellipsenradius');
    if (endAngle<=startAngle || endAngle-startAngle>TAU+1e-12) throw Error('Ungültiger Ellipsenbogen.');
    // gp_Elips requires major >= minor. Rotating the local frame by pi/2
    // and adjusting parameters preserves the original ellipse exactly.
    const swapped=ry>rx, angle=rotation+(swapped?Math.PI/2:0), offset=swapped?-Math.PI/2:0;
    const placement=axis(oc,s,[...center,z],[0,0,1],[Math.cos(angle),Math.sin(angle),0]);
    const geometry=s.keep(rx===ry?new oc.gp_Circ(placement,rx):new oc.gp_Elips(placement,Math.max(rx,ry),Math.min(rx,ry)));
    builder=s.keep(new oc.BRepBuilderAPI_MakeEdge(geometry,startAngle+offset,endAngle+offset));
  } else throw Error(`Nicht unterstützte CAD-Kontur: ${segment.kind}`);
  if (!builder.IsDone()) throw Error('CAD-Konturkante konnte nicht aufgebaut werden.');
  const result=s.keep(builder.Edge());
  if(segment.reversed)result.Reverse();
  return result;
}
function wire(oc, s, segments, z = 0) {
  if (!Array.isArray(segments) || !segments.length || segments.length>100000) throw Error('Geschlossene originale CAD-Kontur erforderlich.');
  const maker=s.keep(new oc.BRepBuilderAPI_MakeWire());
  for (const segment of segments) {maker.Add(segmentEdge(oc,s,segment,z));if(!maker.IsDone())throw Error('CAD-Kontur hat nicht verbundene Kanten.');}
  const result=s.keep(maker.Wire());
  if(!result.Closed())throw Error('CAD-Kontur ist offen.');
  return result;
}
export function buildCadWire(oc,segments,z=0){
  const s=scope();try{return s.release(wire(oc,s,segments,z));}finally{s.close();}
}
export function buildCadSegmentEdge(oc,segment,z=0){
  const s=scope();try{return s.release(segmentEdge(oc,s,segment,z));}finally{s.close();}
}
const polygonSegments = points => points.map((start,i) => ({kind:'line',start,end:points[(i+1)%points.length]}));
function prism(oc, s, segments, height, holes=[], z=-height/2) {
  const faceMaker=s.keep(new oc.BRepBuilderAPI_MakeFace(wire(oc,s,segments,z),true));
  for(const hole of holes){const inner=wire(oc,s,hole,z);inner.Reverse();faceMaker.Add(inner);}
  if(!faceMaker.IsDone())throw Error('CAD-Kontur bildet keine gültige ebene Fläche.');
  const face=s.keep(faceMaker.Face()),vector=s.keep(new oc.gp_Vec(0,0,height));
  return s.keep(s.keep(new oc.BRepPrimAPI_MakePrism(face,vector,true,true)).Shape());
}
function polygonPrism(oc,s,points,height){return prism(oc,s,polygonSegments(points),height);}
function rectangle(w,d){return [[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]];}
function roundedRectangle(w,d,r) {
  if (!r) return polygonSegments(rectangle(w,d));
  if(r>Math.min(w,d)/2)throw Error('Eckradius ist größer als die halbe Konturbreite.');
  const segments=[], centers=[[w/2-r,d/2-r],[-w/2+r,d/2-r],[-w/2+r,-d/2+r],[w/2-r,-d/2+r]];
  for(let i=0;i<4;i++){
    const a=i*Math.PI/2, center=centers[i], at=t=>[center[0]+r*Math.cos(t),center[1]+r*Math.sin(t)], end=at(a+Math.PI/2);
    segments.push({kind:'arc',start:at(a),through:at(a+Math.PI/4),end});
    const next=centers[(i+1)%4], nextPoint=[next[0]+r*Math.cos(a+Math.PI/2),next[1]+r*Math.sin(a+Math.PI/2)];
    if(Math.hypot(...end.map((v,k)=>v-nextPoint[k]))>1e-10)segments.push({kind:'line',start:end,end:nextPoint});
  }return segments;
}
function revolve(oc,s,points) {
  const segments=points.map((a,i)=>({a:[a[0],0,a[1]],b:[points[(i+1)%points.length][0],0,points[(i+1)%points.length][1]]}));
  const maker=s.keep(new oc.BRepBuilderAPI_MakeWire());
  for(const {a,b} of segments){if(Math.hypot(...a.map((v,k)=>v-b[k]))>1e-10)maker.Add(lineEdge(oc,s,a,b));}
  const face=s.keep(s.keep(new oc.BRepBuilderAPI_MakeFace(s.keep(maker.Wire()),true)).Face());
  const ax=s.keep(new oc.gp_Ax1(point(oc,s,[0,0,0]),s.keep(new oc.gp_Dir(0,0,1))));
  return s.keep(s.keep(new oc.BRepPrimAPI_MakeRevol(face,ax,true)).Shape());
}
function boolean(oc,s,kind,a,b){
  const builder=s.keep(new oc[kind==='cut'?'BRepAlgoAPI_Cut':'BRepAlgoAPI_Fuse'](a,b));
  if(builder.HasErrors())throw Error('CAD-Boolean fehlgeschlagen.');
  return s.keep(builder.Shape());
}
function cylinder(oc,s,r,h,z=-h/2){return s.keep(s.keep(new oc.BRepPrimAPI_MakeCylinder(axis(oc,s,[0,0,z]),r,h)).Shape());}
function sharpBox(oc,s,size,z=-size[2]/2){return s.keep(s.keep(new oc.BRepPrimAPI_MakeBox(point(oc,s,[-size[0]/2,-size[1]/2,z]),...size)).Shape());}

export function cadRecipeBounds(oc,shape) {
  const s=scope();try{
    const box=s.keep(new oc.Bnd_Box());oc.BRepBndLib.AddOptimal(shape,box,false,false);
    const lo=s.keep(box.CornerMin()),hi=s.keep(box.CornerMax()),min=[lo.X(),lo.Y(),lo.Z()],max=[hi.X(),hi.Y(),hi.Z()];
    return {min,max,size:min.map((v,k)=>max[k]-v),center:min.map((v,k)=>(v+max[k])/2)};
  }finally{s.close();}
}
export function cadRecipeVolume(oc,shape) {
  // Fixed quadrature misses narrow trimmed screw patches; plain adaptive
  // Gauss can report false convergence for ellipses. Gauss-Kronrod evaluates
  // the original surfaces with explicit B-spline spans, without triangulation.
  return cadVolume(oc,shape,{projection:'point'});
}
export function assertCadRecipeTolerance(oc,shape,constructionBudget){
  const s=scope();try{
    let maximum=0;
    for(const [type,cast] of [[oc.TopAbs_ShapeEnum.TopAbs_FACE,'Face'],[oc.TopAbs_ShapeEnum.TopAbs_EDGE,'Edge'],[oc.TopAbs_ShapeEnum.TopAbs_VERTEX,'Vertex']]){
      const explorer=s.keep(new oc.TopExp_Explorer(shape,type));while(explorer.More()){
        const raw=explorer.Current(),item=oc.TopoDS[cast](raw);try{const tolerance=oc.BRep_Tool.Tolerance(item);if(!Number.isFinite(tolerance)||tolerance<0)throw Error('CAD-Topologie besitzt keine endliche Genauigkeitsgrenze.');maximum=Math.max(maximum,tolerance);}finally{item.delete();raw.delete();}explorer.Next();
      }
    }
    if(maximum>constructionBudget/2*(1+1e-12))throw Error('Native CAD-Topologietoleranz überschreitet das reservierte Konstruktionsbudget.');
    return maximum;
  }finally{s.close();}
}
function check(oc,s,shape) {
  if(shape.IsNull() || !s.keep(new oc.BRepCheck_Analyzer(shape)).IsValid() || cadRecipeVolume(oc,shape)<=1e-9)throw Error('CAD-Rezept ergibt keinen gültigen geschlossenen Körper.');
  const solids=s.keep(new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum.TopAbs_SOLID));
  if(!solids.More())throw Error('CAD-Rezept enthält keinen Volumenkörper.');
  return shape;
}
function finish(oc,s,shape,p,selector) {
  if(!p.edgeSize || p.edgeStyle==='none')return shape;
  const ex=s.keep(new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum.TopAbs_EDGE)),edges=[];
  while(ex.More()){
    const raw=s.keep(ex.Current()),edge=s.keep(oc.TopoDS.Edge(raw));
    if(!edges.some(e=>e.IsSame(edge))){const curve=s.keep(new oc.BRepAdaptor_Curve(edge)),from=curve.FirstParameter(),to=curve.LastParameter(),points=[0,.5,1].map(t=>{const v=s.keep(curve.Value(from+t*(to-from)));return [v.X(),v.Y(),v.Z()];});if(selector(points))edges.push(edge);}
    ex.Next();
  }
  if(!edges.length)throw Error('Keine passenden CAD-Kanten für den Formparameter.');
  const builder=s.keep(p.edgeStyle==='round'?new oc.BRepFilletAPI_MakeFillet(shape,oc.ChFi3d_FilletShape.ChFi3d_Rational):new oc.BRepFilletAPI_MakeChamfer(shape));
  edges.forEach(e=>builder.Add(p.edgeSize,e));
  const result=s.keep(builder.Shape());return check(oc,s,result);
}
function regular(n,w,d) {
  const points=Array.from({length:n},(_,i)=>[Math.cos(TAU*i/n),Math.sin(TAU*i/n)]);
  return fitPoints(points,w,d);
}
function fitPoints(points,w,d){const lo=[0,1].map(k=>Math.min(...points.map(p=>p[k]))),hi=[0,1].map(k=>Math.max(...points.map(p=>p[k])));return points.map(p=>p.map((v,k)=>(v-(lo[k]+hi[k])/2)*[w,d][k]/(hi[k]-lo[k])));}
function rigidTransform(oc,s,shape,matrix) {
  const tr=s.keep(new oc.gp_Trsf());tr.SetValues(...[0,1,2].flatMap(r=>[matrix[r],matrix[4+r],matrix[8+r],matrix[12+r]]));
  return s.keep(s.keep(new oc.BRepBuilderAPI_Transform(shape,tr,true,false)).Shape());
}
function fitShape(oc,s,shape,size,affineTransform,knownBounds) {
  const box=knownBounds||cadRecipeBounds(oc,shape),scale=size.map((v,k)=>v/box.size[k]);
  if(scale.every(v=>Math.abs(v-1)<1e-10)&&box.center.every(v=>Math.abs(v)<1e-10))return shape;
  const matrix=[scale[0],0,0,0,0,scale[1],0,0,0,0,scale[2],0,...box.center.map((v,k)=>-v*scale[k]),1];
  if(Math.max(...scale)-Math.min(...scale)>1e-10){
    if(!affineTransform)throw Error('Diese Form benötigt die noch nachzuweisende allgemeine CAD-Transformation.');
    return s.keep(affineTransform(shape,matrix));
  }
  return rigidTransform(oc,s,shape,matrix);
}

// Contours have explicit outer/hole membership. Winding is normalized by
// their provider; no sampling or triangulation is used to infer hole topology.
export function buildCadContours(oc,{contours,height}) {
  positive(height,'Extrusionshöhe');const s=scope();
  try{
    if(!Array.isArray(contours)||!contours.length)throw Error('Originale Konturen fehlen.');
    let shape;
    for(const contour of contours){const part=prism(oc,s,contour.outer,height,contour.holes||[]);shape=shape?boolean(oc,s,'fuse',shape,part):part;}
    return s.release(check(oc,s,shape));
  }finally{s.close();}
}

// The generator uses its constructive module/thickness parameters. Placement
// and scaling are separate from this natural, centred body.
export function buildCadGear(oc,input,options={}) {
  const p={...defaults('gear'),...input},definition=gearDefinition(p),twist=p.thickness*Math.tan(p.helixAngle*Math.PI/180)/definition.rp,tolerance=constructionTolerance(definition.minimumFeature,options.constructionBudget),outline=gearContour(p,{constructionBudget:twist?tolerance/2:tolerance}),s=scope();
  try{
    if(Math.abs(twist)>TAU)throw Error('Die Zahnbreite und Schrägung ergeben mehr als eine volle Windung.');
    if(p.bore>=outline.dimensions.root-.1||p.hubDiameter>outline.dimensions.root)throw Error('Bohrung/Nabe liegen außerhalb des Fußkreises.');
    if(p.keyWidth&&(!p.bore||p.keyWidth>=p.bore||p.bore+2*p.keyDepth>=outline.dimensions.root))throw Error('Unzulässige Passfedernut.');
    let shape=twist?s.keep(buildCadTwistedContours(oc,outline.segments,{height:p.thickness,twist,constructionBudget:tolerance/2})):prism(oc,s,outline.segments,p.thickness);
    if(p.hubDiameter>0&&p.hubHeight>0)shape=boolean(oc,s,'fuse',shape,cylinder(oc,s,p.hubDiameter/2,p.hubHeight,p.thickness/2));
    if(p.bore>0){
      const length=2*(p.thickness+p.hubHeight)+2;
      shape=boolean(oc,s,'cut',shape,cylinder(oc,s,p.bore/2,length));
      if(p.keyWidth){
        const key=prism(oc,s,polygonSegments([[-p.keyWidth/2,0],[p.keyWidth/2,0],[p.keyWidth/2,p.bore/2+p.keyDepth],[-p.keyWidth/2,p.bore/2+p.keyDepth]]),length);
        shape=boolean(oc,s,'cut',shape,key);
      }
    }
    assertCadRecipeTolerance(oc,shape,tolerance);
    return s.release(check(oc,s,shape));
  }finally{s.close();}
}

export function buildCadRecipe(oc, recipe, {affineTransform,constructionBudget=CAD_CONSTRUCTION_TOLERANCE} = {}) {
  if(!recipe||(!CAD_RECIPE_STATUS[recipe.type]&&!['svg','sketch'].includes(recipe.type)))throw Error('Unbekanntes CAD-Formrezept.');
  constructionTolerance(1,constructionBudget);
  if(recipe.mesh!==undefined)throw Error('Ein Mesh ist keine CAD-Konstruktionsquelle.');
  const size=recipe.size;
  if(!Array.isArray(size)||size.length!==3)throw Error('CAD-Rezept benötigt drei Abmessungen.');
  size.forEach(v=>positive(v,'Abmessung'));
  const p=parameters({...recipe,params:{...defaults(recipe.type),...recipe.params}});
  if(Object.keys(defaults(recipe.type)).length&&!validParameters({...recipe,params:p}))throw Error('Ungültige CAD-Formparameter.');
  const [w,d,h]=size,s=scope();let shape;
  try{
    switch(recipe.type){
      case 'sketch':{
        const resolved=resolveCadSketch(recipe.sketch);
        if(recipe.size.some((v,i)=>v!==resolved.size[i]))throw Error('Skizzengröße widerspricht den Maßformeln.');
        shape=resolved.kind==='circle'?cylinder(oc,s,resolved.diameter/2,resolved.height,0):prism(oc,s,polygonSegments(resolved.points),resolved.height,[],0);
        break;
      }
      case 'box':case 'roundbox':{
        if(p.edgeScope==='vertical'&&p.edgeStyle==='round')shape=prism(oc,s,roundedRectangle(w,d,p.edgeSize),h);
        else {shape=sharpBox(oc,s,size);shape=finish(oc,s,shape,p,points=>p.edgeScope==='all'||Math.abs(points[0][2]-points[2][2])>1e-8);}
        break;
      }
      case 'cylinder':{
        if(w===d)shape=cylinder(oc,s,w/2,h);
        else shape=prism(oc,s,[{kind:'ellipse',center:[0,0],rx:w/2,ry:d/2}],h);
        shape=finish(oc,s,shape,p,points=>points.every(v=>Math.abs(v[2]-points[0][2])<1e-8)&&(p.edgeScope==='both'||(p.edgeScope==='top'?points[0][2]>0:points[0][2]<0)));break;
      }
      case 'sphere':shape=s.keep(s.keep(new oc.BRepPrimAPI_MakeSphere(w/2)).Shape());shape=fitShape(oc,s,shape,size,affineTransform,{size:[w,w,w],center:[0,0,0]});break;
      case 'halfSphere':shape=s.keep(s.keep(new oc.BRepPrimAPI_MakeSphere(w/2,0,Math.PI/2)).Shape());shape=fitShape(oc,s,shape,size,affineTransform,{size:[w,w,w/2],center:[0,0,w/4]});break;
      case 'cone':{
        if(p.topDiameter>Math.min(w,d))throw Error('Oberer Kegeldurchmesser überschreitet die Grundfläche.');
        shape=revolve(oc,s,[[0,-h/2],[Math.min(w,d)/2,-h/2],[p.topDiameter/2,h/2],[0,h/2]]);shape=fitShape(oc,s,shape,size,affineTransform,{size:[Math.min(w,d),Math.min(w,d),h],center:[0,0,0]});break;
      }
      case 'hexagon':case 'triangle':case 'polygon':{
        const n=recipe.type==='hexagon'?6:recipe.type==='triangle'?3:p.sides;
        shape=polygonPrism(oc,s,regular(n,w,d),h);
        shape=finish(oc,s,shape,p,points=>points.every(v=>Math.abs(v[2]-points[0][2])<1e-8)&&(p.edgeScope==='both'||(p.edgeScope==='top'?points[0][2]>0:points[0][2]<0)));break;
      }
      case 'tube':{
        if(p.wall>=Math.min(w,d)/2)throw Error('Rohrwand muss kleiner als der Außenradius sein.');
        shape=boolean(oc,s,'cut',cylinder(oc,s,Math.min(w,d)/2,h),cylinder(oc,s,Math.min(w,d)/2-p.wall,h+2e-4));
        shape=finish(oc,s,shape,p,points=>points.every(v=>Math.abs(v[2]-points[0][2])<1e-8)&&(p.edgeScope==='both'||(p.edgeScope==='top'?points[0][2]>0:points[0][2]<0)));
        shape=fitShape(oc,s,shape,size,affineTransform,{size:[Math.min(w,d),Math.min(w,d),h],center:[0,0,0]});break;
      }
      case 'torus':{
        const r=Math.min(w,d)/2,t=p.wall/2;if(t>=r/2)throw Error('Ringprofil muss kleiner als der halbe Außenradius sein.');
        shape=s.keep(s.keep(new oc.BRepPrimAPI_MakeTorus(r-t,t)).Shape());shape=fitShape(oc,s,shape,size,affineTransform,{size:[Math.min(w,d),Math.min(w,d),p.wall],center:[0,0,0]});break;
      }
      case 'capsule':{
        shape=prism(oc,s,roundedRectangle(w,d,Math.min(w,d)/2),h);break;
      }
      case 'star':{
        const points=Array.from({length:2*p.points},(_,i)=>{const r=i%2?p.innerRatio:1,a=i*Math.PI/p.points;return [r*Math.cos(a),r*Math.sin(a)];});
        shape=polygonPrism(oc,s,fitPoints(points,w,d),h);break;
      }
      case 'heart':{
        const tolerance=constructionTolerance(Math.min(w,d,h),constructionBudget);shape=prism(oc,s,heartContour([w,d],tolerance).segments,h);assertCadRecipeTolerance(oc,shape,tolerance);break;
      }
      case 'roof':case 'wedge':{
        const points=recipe.type==='roof'?[[-w/2,-h/2],[w/2,-h/2],[0,h/2]]:[[-w/2,-h/2],[w/2,-h/2],[-w/2,h/2]];
        const part=polygonPrism(oc,s,points,d);
        shape=rigidTransform(oc,s,part,[1,0,0,0,0,0,1,0,0,-1,0,0,0,0,0,1]);break;
      }
      case 'pyramid':{
        const base=wire(oc,s,polygonSegments(rectangle(w,d)),-h/2),vertex=s.keep(s.keep(new oc.BRepBuilderAPI_MakeVertex(point(oc,s,[0,0,h/2]))).Vertex()),loft=s.keep(new oc.BRepOffsetAPI_ThruSections(true,true,1e-7));
        loft.AddWire(base);loft.AddVertex(vertex);loft.Build();shape=s.keep(loft.Shape());break;
      }
      case 'shellbox':{
        if(p.wall>=Math.min(w,d)/2||p.floor>=h)throw Error('Wand/Boden lassen keinen Gehäuseinnenraum.');
        const outer=prism(oc,s,roundedRectangle(w,d,p.radius),h),inner=prism(oc,s,roundedRectangle(w-2*p.wall,d-2*p.wall,Math.max(0,p.radius-p.wall)),h-p.floor+2e-4,[],-h/2+p.floor);
        shape=boolean(oc,s,'cut',outer,inner);break;
      }
      case 'countersink':{
        if(p.sinkDiameter<p.bore)throw Error('Senkdurchmesser ist kleiner als die Bohrung.');
        const depth=(p.sinkDiameter-p.bore)/2/Math.tan(p.angle*Math.PI/360);
        if(depth>p.length)throw Error('Senkung ist tiefer als die Bohrung.');
        shape=revolve(oc,s,[[0,-p.length/2],[p.bore/2,-p.length/2],[p.bore/2,p.length/2-depth],[p.sinkDiameter/2,p.length/2],[0,p.length/2]]);shape=fitShape(oc,s,shape,size,affineTransform,{size:[p.sinkDiameter,p.sinkDiameter,p.length],center:[0,0,0]});break;
      }
      case 'text':{
        if(!recipe.contours)throw Error('Originale Schriftkonturen fehlen; Textmesh ist keine CAD-Quelle.');
        shape=s.keep(buildCadContours(oc,{contours:recipe.contours,height:h}));shape=fitShape(oc,s,shape,size,affineTransform);break;
      }
      case 'svg':{
        if(!recipe.contours)throw Error('Originale SVG-Konturen fehlen.');
        shape=s.keep(buildCadContours(oc,{contours:recipe.contours,height:h}));break;
      }
      case 'gear':shape=s.keep(buildCadGear(oc,p,{constructionBudget}));break;
      case 'thread':case 'nut':shape=s.keep(buildCadThread(oc,p,{constructionBudget}));break;
    }
    return s.release(check(oc,s,shape));
  }finally{s.close();}
}
