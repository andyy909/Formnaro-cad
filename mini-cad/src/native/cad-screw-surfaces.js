// Controlled tensor-product screw surfaces for native thread/nut and helical
// gear construction. Linear axial controls preserve the parameter contract;
// analytic fourth-derivative bounds control rotational approximation.
import {constructionTolerance,CAD_CONSTRUCTION_TOLERANCE,cadRecipeVolume,buildCadWire,assertCadRecipeTolerance} from './cad-recipes.js';
import {defaults,threadDimensions,validParameters} from './parameters.js';
const TAU=2*Math.PI;
function scope(){const objects=[];return {keep:o=>(objects.push(o),o),release:o=>(objects.splice(objects.indexOf(o),1),o),close:()=>{for(const o of objects.reverse())o?.delete?.();}};}
function parameters(options={}) {
  const {pitch=2,starts=1,hand='right',thetaStart=0,thetaEnd=TAU,constructionBudget=CAD_CONSTRUCTION_TOLERANCE,intervalCount}=options;
  if(!Number.isFinite(pitch)||pitch<=0||!Number.isInteger(starts)||starts<1||starts>4||!['right','left'].includes(hand)||!Number.isFinite(thetaStart)||!Number.isFinite(thetaEnd)||thetaEnd<=thetaStart||thetaEnd-thetaStart>TAU*240)throw Error('Ungültige Schraubflächenparameter.');
  if(intervalCount!==undefined&&(!Number.isInteger(intervalCount)||intervalCount<1||intervalCount>16000))throw Error('Ungültiger gemeinsamer Schraubflächen-Knotensatz.');
  return {pitch,starts,hand,thetaStart,thetaEnd,constructionBudget,intervalCount,lead:(hand==='right'?1:-1)*pitch*starts};
}
function profilePoint(value){if(!Array.isArray(value)||value.length!==2||value.some(v=>!Number.isFinite(v))||value[0]<=0)throw Error('Schraubprofil benötigt positiven Radius und endlichen Axialwert.');return value;}
export function screwSurfacePoint(segment,u,theta,options={}) {
  const p=parameters(options),a=profilePoint(segment[0]),b=profilePoint(segment[1]),r=a[0]+u*(b[0]-a[0]),z=a[1]+u*(b[1]-a[1]);
  if(!Number.isFinite(u)||u<0||u>1||!Number.isFinite(theta))throw Error('Ungültiger Schraubflächenparameter.');
  return [r*Math.cos(theta),r*Math.sin(theta),z+p.lead*theta/TAU];
}
export function screwSurfaceDefinition(segment,options={}) {
  if(!Array.isArray(segment)||segment.length!==2)throw Error('Gerades Schraubprofilsegment erforderlich.');
  const p=parameters(options),a=profilePoint(segment[0]),b=profilePoint(segment[1]),length=Math.hypot(...a.map((v,k)=>v-b[k]));
  if(length<=1e-8)throw Error('Schraubprofilsegment ist degeneriert.');
  const tolerance=constructionTolerance(Math.min(length,p.pitch),p.constructionBudget),fourthBound=Math.SQRT2*Math.max(a[0],b[0]),maximumStep=(384*tolerance/2/fourthBound)**.25,count=Math.max(1,p.intervalCount||0,Math.ceil((p.thetaEnd-p.thetaStart)/maximumStep));
  if(count>16000)throw Error('Schraubfläche überschreitet die kontrollierte Konstruktionsgrenze.');
  const h=(p.thetaEnd-p.thetaStart)/count,knots=Array.from({length:count+1},(_,i)=>i===count?p.thetaEnd:p.thetaStart+i*h),multiplicities=knots.map((_,i)=>i===0||i===count?4:3),poles=[];
  for(const profile of [a,b]){
    const row=[];
    for(let i=0;i<count;i++){
      const from=knots[i],to=knots[i+1],step=to-from,r=profile[0],z=profile[1],start=[r*Math.cos(from),r*Math.sin(from),z+p.lead*from/TAU],end=[r*Math.cos(to),r*Math.sin(to),z+p.lead*to/TAU],d0=[-r*Math.sin(from),r*Math.cos(from),p.lead/TAU],d1=[-r*Math.sin(to),r*Math.cos(to),p.lead/TAU];
      const controls=[start,start.map((v,k)=>v+step*d0[k]/3),end.map((v,k)=>v-step*d1[k]/3),end];
      row.push(...(i===0?controls:controls.slice(1)));
    }poles.push(row);
  }
  // At each fixed profile parameter, the fourth derivative bound is at most
  // sqrt(2)*max(radius). The axial coordinate is exactly linear in theta.
  return {...p,poles,knots,multiplicities,count,tolerance,interpolationBound:fourthBound*h**4/384};
}
function array(oc,s,name,values){const result=s.keep(new oc[name](1,values.length));values.forEach((v,i)=>result.SetValue(i+1,v));return result;}
function surface(oc,s,definition){
  const poles=s.keep(new oc.NCollection_Array2_gp_Pnt(1,2,1,definition.poles[0].length));
  definition.poles.forEach((row,i)=>row.forEach((p,j)=>{const point=s.keep(new oc.gp_Pnt(...p));poles.SetValue(i+1,j+1,point);}));
  return s.keep(new oc.Geom_BSplineSurface(poles,array(oc,s,'NCollection_Array1_double',[0,1]),array(oc,s,'NCollection_Array1_double',definition.knots),array(oc,s,'NCollection_Array1_int',[2,2]),array(oc,s,'NCollection_Array1_int',definition.multiplicities),1,3,false,false));
}
export function buildCadScrewSurface(oc,segment,options={}) {
  const s=scope();try{return s.release(surface(oc,s,screwSurfaceDefinition(segment,options)));}finally{s.close();}
}
function polygonArea(profile){return profile.reduce((sum,a,i)=>{const b=profile[(i+1)%profile.length];return sum+a[0]*b[1]-b[0]*a[1];},0)/2;}
function cap(oc,s,profile,theta,p){
  const maker=s.keep(new oc.BRepBuilderAPI_MakeWire());
  for(let i=0;i<profile.length;i++){
    const at=a=>s.keep(new oc.gp_Pnt(a[0]*Math.cos(theta),a[0]*Math.sin(theta),a[1]+p.lead*theta/TAU));
    const edge=s.keep(s.keep(new oc.BRepBuilderAPI_MakeEdge(at(profile[i]),at(profile[(i+1)%profile.length]))).Edge());maker.Add(edge);
  }
  const wire=s.keep(maker.Wire()),face=s.keep(s.keep(new oc.BRepBuilderAPI_MakeFace(wire,true)).Face());
  return face;
}
export function buildCadScrewPiece(oc,inputProfile,options={}) {
  if(!Array.isArray(inputProfile)||inputProfile.length<3||inputProfile.length>32)throw Error('Geschlossenes geradliniges Schraubprofil erforderlich.');
  const p=parameters(options),profile=inputProfile.map(point=>[...profilePoint(point)]),area=polygonArea(profile);
  if(Math.abs(area)<=1e-8)throw Error('Schraubprofil besitzt keine Fläche.');
  if(area<0)profile.reverse();
  const axialExtent=Math.max(...profile.map(point=>point[1]))-Math.min(...profile.map(point=>point[1]));
  if(p.thetaEnd-p.thetaStart>=TAU-1e-12 && axialExtent>=Math.abs(p.lead))throw Error('Schraubprofil würde benachbarte Windungen überlappen.');
  const s=scope();try{
    const sewing=s.keep(new oc.BRepBuilderAPI_Sewing(1e-7));
    const intervalCount=Math.max(...profile.map((point,i)=>screwSurfaceDefinition([point,profile[(i+1)%profile.length]],p).count));
    if(profile.length*2*(3*intervalCount+1)>500000)throw Error('Schraubflächen überschreiten die native Kontrollpunktgrenze.');
    for(let i=0;i<profile.length;i++){
      const definition=screwSurfaceDefinition([profile[i],profile[(i+1)%profile.length]],{...p,intervalCount}),geometry=surface(oc,s,definition),face=s.keep(s.keep(new oc.BRepBuilderAPI_MakeFace(geometry,1e-7)).Face());
      face.Reverse();sewing.Add(face);
    }
    const first=cap(oc,s,profile,p.thetaStart,p),last=cap(oc,s,profile,p.thetaEnd,p);last.Reverse();sewing.Add(first);sewing.Add(last);sewing.Perform();
    if(sewing.NbFreeEdges()||sewing.NbMultipleEdges())throw Error('Schraubflächen ließen sich nicht eindeutig zu einer geschlossenen Hülle vernähen.');
    const sewn=s.keep(sewing.SewedShape()),shell=s.keep(oc.TopoDS.Shell(sewn)),maker=s.keep(new oc.BRepBuilderAPI_MakeSolid(shell)),solid=s.keep(maker.Solid());
    if(!oc.BRepLib.OrientClosedSolid(solid)||!s.keep(new oc.BRepCheck_Analyzer(solid)).IsValid()||cadRecipeVolume(oc,solid)<=1e-9)throw Error('Schraubflächen ergeben keinen gültigen geschlossenen CAD-Körper.');
    return s.release(solid);
  }finally{s.close();}
}

export function cadThreadDefinition(input,{constructionBudget=CAD_CONSTRUCTION_TOLERANCE}={}) {
  const p={...defaults('thread'),...input};
  if(!validParameters({type:'thread',params:p}))throw Error('Ungültige CAD-Gewindeparameter.');
  const internal=p.kind!=='external',d=threadDimensions(p),major=p.diameter/2+(internal?p.clearance:-p.clearance),minor=major-d.depth,crest=d.crest*p.pitch/2,flank=d.depth*Math.tan(d.angle*Math.PI/360),gap=p.pitch/2-crest-flank;
  if(minor<=.05||gap<=0)throw Error('Durchmesser, Steigung und Profil ergeben überlappende oder zu tiefe Gewindeflanken.');
  const minimumFeature=Math.min(d.depth,p.pitch,2*crest,2*gap,p.length,minor,...['bore','leadIn','clearance'].map(key=>p[key]>0?p[key]:Infinity)),tolerance=constructionTolerance(minimumFeature,constructionBudget);
  if(!internal&&p.leadIn>=Math.min(major-.05,p.length/2))throw Error('Die Einführfase muss kleiner als Radius und halbe Gewindelänge sein.');
  const minWall=p.outerShape==='hex'?p.outerDiameter*Math.cos(Math.PI/6)/2:p.outerDiameter/2;
  if(p.kind==='nut'&&(minWall<=major+.2||p.leadIn>=Math.min(p.length/2,minWall-major)))throw Error('Die Mutter benötigt ausreichend Material außerhalb des Gewindes und der Einführfase.');
  if(!internal&&p.head!=='none'&&p.headDiameter<p.diameter)throw Error('Der Schraubenkopf muss mindestens den Gewindedurchmesser besitzen.');
  if(!internal&&p.bore>=2*minor-.1&&p.bore>0)throw Error('Die axiale Bohrung muss kleiner als der Gewindekern sein.');
  // Extend the two ORIGINAL straight flank lines only below the analytic core.
  // These extensions are internal to the union and do not alter its boundary.
  const slope=Math.tan(d.angle*Math.PI/360),overlap=Math.min(2*tolerance,gap/(4*slope),minor/4),root=minor-overlap,halfWidth=crest+flank+overlap*slope;
  if(overlap<tolerance)throw Error('Das Profil lässt keine nachweisbare CAD-Verbindung zum Gewindekern zu.');
  const phaseOffset=-p.length/2-p.pitch*p.phase/360;
  return {p,d,internal,major,minor,crest,flank,gap,minimumFeature,tolerance,overlap,profile:[ [root,-halfWidth],[major,-crest],[major,crest],[root,halfWidth] ],phaseOffset};
}
function threadAxis(oc,s,z){return s.keep(new oc.gp_Ax2(s.keep(new oc.gp_Pnt(0,0,z)),s.keep(new oc.gp_Dir(0,0,1))));}
function threadCylinder(oc,s,r,h,z=-h/2){return s.keep(s.keep(new oc.BRepPrimAPI_MakeCylinder(threadAxis(oc,s,z),r,h)).Shape());}
function threadBoolean(oc,s,kind,a,b){
  const maker=s.keep(new oc[kind==='common'?'BRepAlgoAPI_Common':kind==='cut'?'BRepAlgoAPI_Cut':'BRepAlgoAPI_Fuse'](a,b));
  if(maker.HasErrors())throw Error('CAD-Gewindeverknüpfung fehlgeschlagen.');
  maker.SimplifyResult(true,true);
  const shape=s.keep(maker.Shape());if(shape.IsNull()||!s.keep(new oc.BRepCheck_Analyzer(shape)).IsValid())throw Error('CAD-Gewindeverknüpfung ist ungültig.');return shape;
}
function threadRevolve(oc,s,points){
  const wire=s.keep(new oc.BRepBuilderAPI_MakeWire());
  for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];if(Math.hypot(a[0]-b[0],a[1]-b[1])>1e-10)wire.Add(s.keep(s.keep(new oc.BRepBuilderAPI_MakeEdge(s.keep(new oc.gp_Pnt(a[0],0,a[1])),s.keep(new oc.gp_Pnt(b[0],0,b[1])))).Edge()));}
  const face=s.keep(s.keep(new oc.BRepBuilderAPI_MakeFace(s.keep(wire.Wire()),true)).Face()),axis=s.keep(new oc.gp_Ax1(s.keep(new oc.gp_Pnt(0,0,0)),s.keep(new oc.gp_Dir(0,0,1))));
  return s.keep(s.keep(new oc.BRepPrimAPI_MakeRevol(face,axis,true)).Shape());
}
function threadHex(oc,s,r,h,z){
  const wire=s.keep(new oc.BRepBuilderAPI_MakeWire()),points=Array.from({length:6},(_,i)=>[r*Math.cos(TAU*i/6),r*Math.sin(TAU*i/6),z]);
  for(let i=0;i<6;i++){
    const a=s.keep(new oc.gp_Pnt(...points[i])),b=s.keep(new oc.gp_Pnt(...points[(i+1)%6])),edge=s.keep(s.keep(new oc.BRepBuilderAPI_MakeEdge(a,b)).Edge());wire.Add(edge);
  }
  const face=s.keep(s.keep(new oc.BRepBuilderAPI_MakeFace(s.keep(wire.Wire()),true)).Face());return s.keep(s.keep(new oc.BRepPrimAPI_MakePrism(face,s.keep(new oc.gp_Vec(0,0,h)),true,true)).Shape());
}
export function buildCadThread(oc,input,options={}) {
  const definition=cadThreadDefinition(input,options),{p,d,major,minor,profile,phaseOffset,tolerance,internal}=definition,s=scope();
  try{
    let shape=threadCylinder(oc,s,minor,p.length);
    const signedLead=(p.hand==='right'?1:-1)*d.lead,margin=Math.max(...profile.map(point=>Math.abs(point[1])))+p.pitch,clip=threadCylinder(oc,s,major+tolerance*2,p.length);
    for(let start=0;start<p.starts;start++){
      const z=phaseOffset+start*p.pitch,ends=[(-p.length/2-margin-z)*TAU/signedLead,(p.length/2+margin-z)*TAU/signedLead],thetaStart=Math.min(...ends),thetaEnd=Math.max(...ends),ridge=s.keep(buildCadScrewPiece(oc,profile.map(([r,axial])=>[r,axial+z]),{pitch:p.pitch,starts:p.starts,hand:p.hand,thetaStart,thetaEnd,constructionBudget:tolerance}));
      const clipped=threadBoolean(oc,s,'common',ridge,clip);shape=threadBoolean(oc,s,'fuse',shape,clipped);
    }
    if(!internal&&p.leadIn>0){
      const z=p.length/2,c=p.leadIn,envelope=threadRevolve(oc,s,[[0,-z],[major-c,-z],[major,-z+c],[major,z-c],[major-c,z],[0,z]]);shape=threadBoolean(oc,s,'common',shape,envelope);
    }
    if(p.kind==='nut'){
      if(p.leadIn>0){const z=p.length/2,c=p.leadIn;for(const side of [-1,1]){const opening=threadRevolve(oc,s,side===1?[[0,z-c],[major,z-c],[major+c,z],[0,z]]:[[0,-z],[major+c,-z],[major,-z+c],[0,-z+c]]);shape=threadBoolean(oc,s,'fuse',shape,opening);}}
      const outer=p.outerShape==='hex'?threadHex(oc,s,p.outerDiameter/2,p.length,-p.length/2):threadCylinder(oc,s,p.outerDiameter/2,p.length);shape=threadBoolean(oc,s,'cut',outer,shape);
    }else if(!internal){
      if(p.head!=='none'){const head=p.head==='hex'?threadHex(oc,s,p.headDiameter/2,p.headHeight,-p.length/2-p.headHeight):threadCylinder(oc,s,p.headDiameter/2,p.headHeight,-p.length/2-p.headHeight);shape=threadBoolean(oc,s,'fuse',shape,head);}
      if(p.bore>0)shape=threadBoolean(oc,s,'cut',shape,threadCylinder(oc,s,p.bore/2,p.length+2*p.headHeight+2));
    }
    const solids=s.keep(new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum.TopAbs_SOLID));let count=0;while(solids.More()){count++;solids.Next();}
    if(count!==1||cadRecipeVolume(oc,shape)<=1e-9)throw Error('CAD-Gewinde ergibt keinen einzelnen gültigen Volumenkörper.');
    assertCadRecipeTolerance(oc,shape,tolerance);
    return s.release(shape);
  }finally{s.close();}
}

function rotationProfile(segment){
  if(segment.kind==='line')return {points:[segment.start,segment.end],weights:[1,1]};
  if(segment.kind==='bezier'&&segment.points.length>=2&&segment.points.length<=4)return {points:segment.points,weights:segment.points.map(()=>1)};
  if(segment.kind==='arc'){
    // Gear head/root arcs are analytic circles centred at the gear axis. A
    // quadratic rational Bezier describes these arcs exactly, not by fitting.
    const radius=Math.hypot(...segment.start),r2=Math.hypot(...segment.end),r3=Math.hypot(...segment.through),a=Math.atan2(segment.start[1],segment.start[0]),end=Math.atan2(segment.end[1],segment.end[0]);
    const angle=(end-a+TAU)%TAU,through=(Math.atan2(segment.through[1],segment.through[0])-a+TAU)%TAU;
    if(radius<=0||Math.max(Math.abs(radius-r2),Math.abs(radius-r3))>1e-7||angle<=0||angle>=Math.PI||through<=0||through>=angle)throw Error('Schraubzahnflächen benötigen eindeutige achszentrische Kreisbögen unter 180°.');
    const weight=Math.cos(angle/2),middle=a+angle/2;
    return {points:[segment.start,[radius*Math.cos(middle)/weight,radius*Math.sin(middle)/weight],segment.end],weights:[1,weight,1]};
  }
  throw Error('Nicht unterstützte Originalkontur für die kontrollierte Schraubzahnfläche.');
}
export function twistedSurfaceDefinition(segment,{height,twist,constructionBudget=CAD_CONSTRUCTION_TOLERANCE,intervalCount}={}){
  if(!Number.isFinite(height)||height<=0||!Number.isFinite(twist)||Math.abs(twist)>TAU||!twist)throw Error('Schraubzahnfläche benötigt positive Breite und eine Schrägung bis zu einer Windung.');
  if(intervalCount!==undefined&&(!Number.isInteger(intervalCount)||intervalCount<1||intervalCount>16000))throw Error('Ungültiger gemeinsamer Schraubzahn-Knotensatz.');
  const profile=rotationProfile(segment);if(profile.points.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v))))throw Error('Ungültige Schraubzahnkontrolle.');
  const tolerance=constructionTolerance(height,constructionBudget),maximumRadius=Math.max(...profile.points.map(p=>Math.hypot(...p))),fourthBound=Math.SQRT2*maximumRadius,count=Math.max(1,intervalCount||0,Math.ceil(Math.abs(twist)/(384*tolerance/2/fourthBound)**.25));
  if(count>16000)throw Error('Schraubzahnfläche überschreitet die kontrollierte Konstruktionsgrenze.');
  const knots=Array.from({length:count+1},(_,i)=>i/count),multiplicities=knots.map((_,i)=>i===0||i===count?4:3),poles=[];
  for(const [x,y] of profile.points){
    const row=[];
    for(let i=0;i<count;i++){
      const from=knots[i],to=knots[i+1],step=to-from,at=t=>[x*Math.cos(twist*t)-y*Math.sin(twist*t),x*Math.sin(twist*t)+y*Math.cos(twist*t),height*(t-.5)],derivative=p=>[-twist*p[1],twist*p[0],height],a=at(from),b=at(to),da=derivative(a),db=derivative(b),controls=[a,a.map((v,k)=>v+step*da[k]/3),b.map((v,k)=>v-step*db[k]/3),b];
      row.push(...(i===0?controls:controls.slice(1)));
    }poles.push(row);
  }
  // Positive rational profile weights normalize to a convex combination and
  // do not amplify the rotation error. Axial interpolation remains exact.
  return {profile,poles,knots,multiplicities,count,tolerance,height,twist,interpolationBound:fourthBound*(Math.abs(twist)/count)**4/384};
}
function twistedSurface(oc,s,definition){
  const degree=definition.profile.points.length-1,poles=s.keep(new oc.NCollection_Array2_gp_Pnt(1,degree+1,1,definition.poles[0].length)),weights=s.keep(new oc.NCollection_Array2_double(1,degree+1,1,definition.poles[0].length));
  definition.poles.forEach((row,i)=>row.forEach((p,j)=>{poles.SetValue(i+1,j+1,s.keep(new oc.gp_Pnt(...p)));weights.SetValue(i+1,j+1,definition.profile.weights[i]);}));
  return s.keep(new oc.Geom_BSplineSurface(poles,weights,array(oc,s,'NCollection_Array1_double',[0,1]),array(oc,s,'NCollection_Array1_double',definition.knots),array(oc,s,'NCollection_Array1_int',[degree+1,degree+1]),array(oc,s,'NCollection_Array1_int',definition.multiplicities),degree,3,false,false));
}
export function buildCadTwistedSurface(oc,segment,options){const s=scope();try{return s.release(twistedSurface(oc,s,twistedSurfaceDefinition(segment,options)));}finally{s.close();}}
export function buildCadTwistedContours(oc,segments,options){
  if(!Array.isArray(segments)||segments.length<3||segments.length>10000)throw Error('Geschlossene Originalkontur für Schrägzähne erforderlich.');
  const definitions=segments.map(segment=>twistedSurfaceDefinition(segment,options)),intervalCount=Math.max(...definitions.map(d=>d.count)),{height,twist}=definitions[0],s=scope();
  if(definitions.reduce((sum,d)=>sum+d.profile.points.length*(3*intervalCount+1),0)>500000)throw Error('Schrägzahnflächen überschreiten die native Kontrollpunktgrenze.');
  try{
    const sewing=s.keep(new oc.BRepBuilderAPI_Sewing(1e-7));
    for(const segment of segments){const geometry=twistedSurface(oc,s,twistedSurfaceDefinition(segment,{...options,intervalCount})),face=s.keep(s.keep(new oc.BRepBuilderAPI_MakeFace(geometry,1e-7)).Face());sewing.Add(face);}
    for(const end of [false,true]){
      const angle=end?twist:0,rotate=point=>[point[0]*Math.cos(angle)-point[1]*Math.sin(angle),point[0]*Math.sin(angle)+point[1]*Math.cos(angle)],transformed=segments.map(segment=>segment.kind==='bezier'?{...segment,points:segment.points.map(rotate)}:{...segment,start:rotate(segment.start),end:rotate(segment.end),...(segment.through?{through:rotate(segment.through)}:{})}),wire=s.keep(buildCadWire(oc,transformed,(end?1:-1)*height/2)),face=s.keep(s.keep(new oc.BRepBuilderAPI_MakeFace(wire,true)).Face());if(!end)face.Reverse();sewing.Add(face);
    }
    sewing.Perform();if(sewing.NbFreeEdges()||sewing.NbMultipleEdges())throw Error('Schrägzahnflächen besitzen offene oder mehrdeutige Kanten.');
    const sewn=s.keep(sewing.SewedShape()),shell=s.keep(oc.TopoDS.Shell(sewn)),solid=s.keep(s.keep(new oc.BRepBuilderAPI_MakeSolid(shell)).Solid());
    if(!oc.BRepLib.OrientClosedSolid(solid)||!s.keep(new oc.BRepCheck_Analyzer(solid)).IsValid()||cadRecipeVolume(oc,solid)<=1e-9)throw Error('Schrägzahnflächen ergeben keinen gültigen geschlossenen CAD-Körper.');
    return s.release(solid);
  }finally{s.close();}
}
