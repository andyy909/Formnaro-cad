import {parameters,gearDimensions,threadDimensions,validParameters} from './parameters.js';
const TAU=2*Math.PI;
const replace=(m,next)=>{m.delete();return next;};
const circle=(radius,segments)=>Array.from({length:segments},(_,i)=>[radius*Math.cos(i*TAU/segments),radius*Math.sin(i*TAU/segments)]);
const point=(r,a)=>[r*Math.cos(a),r*Math.sin(a)];
function roundedRectangle(w,d,r,steps){
  if(r<=1e-8)return [[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]];
  const result=[];for(let k=0;k<4;k++){const x=k===0||k===3?w/2-r:-w/2+r,y=k<2?d/2-r:-d/2+r;for(let i=0;i<=steps;i++){const a=(k+i/steps)*Math.PI/2;result.push([x+r*Math.cos(a),y+r*Math.sin(a)]);}}return result;
}
function clippedRectangle(w,d,c){return [[-w/2+c,-d/2],[w/2-c,-d/2],[w/2,-d/2+c],[w/2,d/2-c],[w/2-c,d/2],[-w/2+c,d/2],[-w/2,d/2-c],[-w/2,-d/2+c]];}
function box(node,M,p){
  const [w,d,h]=node.size,c=Math.min(p.edgeSize,Math.min(w,d,p.edgeScope==='all'?h:Infinity)/2*.999);
  if(!c||p.edgeStyle==='none')return M.cube(node.size,true);
  if(p.edgeScope==='vertical')return M.extrude([p.edgeStyle==='round'?roundedRectangle(w,d,c,p.edgeSteps):clippedRectangle(w,d,c)],h,0,0,[1,1],true);
  if(p.edgeStyle==='chamfer'){
    const points=[];for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])for(let axis=0;axis<3;axis++)points.push([x*(w/2-(axis===0?0:c)),y*(d/2-(axis===1?0:c)),z*(h/2-(axis===2?0:c))]);return M.hull(points);
  }
  const core=M.cube(node.size.map(v=>v-2*c),true),ball=M.sphere(c,p.edgeSteps*4);try{return core.minkowskiSum(ball);}finally{core.delete();ball.delete();}
}
// Revolved rim profile; radius and bevel are physical millimetres before normalizing.
function rimProfile(r,h,c,style,scope,steps){
  const bottom=scope==='both'||scope==='bottom',top=scope==='both'||scope==='top',points=[[0,-h/2],[r-(bottom?c:0),-h/2]];
  if(bottom&&c){if(style==='round')for(let i=1;i<=steps;i++){const a=-Math.PI/2+i/steps*Math.PI/2;points.push([r-c+c*Math.cos(a),-h/2+c+c*Math.sin(a)]);}else points.push([r,-h/2+c]);}
  points.push([r,h/2-(top?c:0)]);
  if(top&&c){if(style==='round')for(let i=1;i<=steps;i++){const a=i/steps*Math.PI/2;points.push([r-c+c*Math.cos(a),h/2-c+c*Math.sin(a)]);}else points.push([r-c,h/2]);}
  points.push([0,h/2]);return points;
}
function cylinder(node,M,p){
  const [w,d,h]=node.size,r=Math.min(w,d)/2,sides=node.type==='polygon'?p.sides:node.type==='hexagon'?6:node.type==='triangle'?3:node.segments;
  const c=p.edgeStyle==='none'?0:Math.min(p.edgeSize,r*.999,h/(p.edgeScope==='both'?2:1)*.999,node.type==='tube'?p.wall/2*.999:Infinity);
  let m=M.revolve([rimProfile(r,h,c,p.edgeStyle,p.edgeScope,p.edgeSteps)],sides);
  m=replace(m,m.scale([w/(2*r),d/(2*r),1]));
  if(node.type==='tube'){
    const inner=r-p.wall;if(inner<=0){m.delete();throw new Error('Die Rohrwand muss kleiner als der Außenradius sein.');}
    const eps=h*.001,bottom=p.edgeScope==='both'||p.edgeScope==='bottom',top=p.edgeScope==='both'||p.edgeScope==='top',profile=[[0,-h/2-eps],[inner+(bottom?c:0),-h/2-eps],[inner+(bottom?c:0),-h/2]];
    if(bottom&&c){if(p.edgeStyle==='round')for(let i=1;i<=p.edgeSteps;i++){const a=-Math.PI/2-i/p.edgeSteps*Math.PI/2;profile.push([inner+c+c*Math.cos(a),-h/2+c+c*Math.sin(a)]);}else profile.push([inner,-h/2+c]);}
    profile.push([inner,h/2-(top?c:0)]);
    if(top&&c){if(p.edgeStyle==='round')for(let i=1;i<=p.edgeSteps;i++){const a=Math.PI-i/p.edgeSteps*Math.PI/2;profile.push([inner+c+c*Math.cos(a),h/2-c+c*Math.sin(a)]);}else profile.push([inner+c,h/2]);}
    profile.push([inner+(top?c:0),h/2+eps],[0,h/2+eps]);let cut=M.revolve([profile],node.segments);cut=replace(cut,cut.scale([w/(2*r),d/(2*r),1]));try{m=replace(m,M.difference(m,cut));}finally{cut.delete();}
  }return m;
}
export function gearOutline(p,segments=64){
  const d=gearDimensions(p),rp=d.pitch/2,rb=d.base/2,ra=d.outer/2,rf=d.root/2;
  if(rf<=0||ra<=Math.max(rb,rf))throw new Error('Modul, Zähnezahl und Profilverschiebung ergeben kein gültiges Zahnprofil.');
  const inv=r=>{const t=Math.sqrt(Math.max(0,(r/rb)**2-1));return t-Math.atan(t);},half=(Math.PI/2+2*p.profileShift*Math.tan(p.pressureAngle*Math.PI/180))/p.teeth-p.backlash/(2*rp),halfAt=r=>half+inv(rp)-inv(r);
  if(halfAt(ra)<=.002||halfAt(Math.max(rb,rf))>=Math.PI/p.teeth)throw new Error('Die Zähne werden spitz oder überlappen. Spiel, Winkel oder Profilverschiebung verkleinern.');
  const path=[],steps=Math.max(5,Math.round(segments/8)),start=Math.max(rb,rf);
  for(let tooth=0;tooth<p.teeth;tooth++){
    const a=tooth*TAU/p.teeth;
    path.push(point(rf,a-halfAt(start)));
    for(let i=0;i<=steps;i++){const r=start+(ra-start)*i/steps;path.push(point(r,a-halfAt(r)));}
    for(let i=1;i<=4;i++)path.push(point(ra,a-halfAt(ra)+2*halfAt(ra)*i/4));
    for(let i=steps-1;i>=0;i--){const r=start+(ra-start)*i/steps;path.push(point(r,a+halfAt(r)));}
    path.push(point(rf,a+halfAt(start)));
    const from=a+halfAt(start),to=a+TAU/p.teeth-halfAt(start);for(let i=1;i<4;i++)path.push(point(rf,from+(to-from)*i/4));
  }return path;
}
function gear(node,M,p){
  const d=gearDimensions(p);if(p.bore>=d.root-.1||p.hubDiameter>d.root)throw new Error('Bohrung und Nabe müssen innerhalb des Fußkreises liegen.');
  if(p.keyWidth&&(!p.bore||p.keyWidth>=p.bore||p.bore+2*p.keyDepth>=d.root))throw new Error('Passfedernut: Bohrung und ausreichenden Rand zum Fußkreis einstellen.');
  const twist=p.thickness*Math.tan(Math.abs(p.helixAngle)*Math.PI/180)/(d.pitch/2)*180/Math.PI,divisions=Math.min(120,Math.max(1,Math.ceil(twist/3)));
  if(twist>360)throw new Error('Die Zahnbreite und Schrägung ergeben mehr als eine volle Windung. Zahnbreite oder Winkel verkleinern.');
  const outline=gearOutline(p,node.segments);if(outline.length*(divisions+2)>180000)throw new Error('Das Zahnrad ist zu komplex. Zahnbreite, Schrägungswinkel, Zähnezahl oder Seitenzahl verkleinern.');
  let m=M.extrude([outline],p.thickness,divisions,twist,[1,1],true);
  // Mirror the same triangulation for opposite hands, avoiding a directional volume bias.
  if(p.helixAngle<0)m=replace(m,m.mirror([0,1,0]));
  if(p.hubDiameter>0&&p.hubHeight>0){let hub=M.cylinder(p.hubHeight+.02,p.hubDiameter/2,p.hubDiameter/2,node.segments,true);hub=replace(hub,hub.translate([0,0,p.thickness/2+p.hubHeight/2-.01]));try{m=replace(m,M.union(m,hub));}finally{hub.delete();}}
  if(p.bore>0){const length=2*(p.thickness+p.hubHeight)+2,cut=M.cylinder(length,p.bore/2,p.bore/2,node.segments,true);try{m=replace(m,M.difference(m,cut));}finally{cut.delete();}
    if(p.keyWidth){let key=M.cube([p.keyWidth,p.keyDepth+p.bore/2,length],true);key=replace(key,key.translate([0,p.keyDepth/2+p.bore/4,0]));try{m=replace(m,M.difference(m,key));}finally{key.delete();}}
  }return m;
}
// A closed radial height field avoids thousands of separate helical boolean pieces.
// One revolution advances starts*pitch, while adjacent ridges remain pitch apart.
export function threadMesh(p,segments=64,internal=false){
  const d=threadDimensions(p),clear=internal?p.clearance:-p.clearance,major=p.diameter/2+clear,minor=major-d.depth,crest=d.crest*p.pitch/2,flank=d.depth*Math.tan(d.angle*Math.PI/360),nz=Math.max(16,Math.ceil(p.length/p.pitch*24)),nc=Math.max(32,segments);
  if(minor<=.05||crest+flank>=p.pitch/2)throw new Error('Durchmesser, Steigung und Profil ergeben überlappende oder zu tiefe Gewindeflanken.');
  if((nz+1)*nc>180000)throw new Error('Das Gewinde ist zu fein für diese Länge und Auflösung. Länge/Seitenzahl verkleinern oder Steigung erhöhen.');
  if(!internal&&p.leadIn>=Math.min(major-.05,p.length/2))throw new Error('Die Einführfase muss kleiner als Radius und halbe Gewindelänge sein.');
  const verts=[],triangles=[],hand=p.hand==='right'?1:-1;
  for(let zIndex=0;zIndex<=nz;zIndex++){
    const z=p.length*zIndex/nz;
    for(let i=0;i<nc;i++){
      const a=TAU*i/nc,phase=z/p.pitch-hand*p.starts*a/TAU+p.phase/360,offset=Math.abs(phase-Math.round(phase))*p.pitch;
      let radius=minor+d.depth*(offset<=crest?1:offset>=crest+flank?0:1-(offset-crest)/flank);
      if(!internal&&p.leadIn>0)radius=Math.min(radius,major-p.leadIn+Math.min(z,p.length-z));
      verts.push(radius*Math.cos(a),radius*Math.sin(a),z-p.length/2);
      if(zIndex<nz){const a0=zIndex*nc+i,b0=zIndex*nc+(i+1)%nc,a1=a0+nc,b1=b0+nc;triangles.push(a0,b0,b1,a0,b1,a1);}
    }
  }
  const bottom=verts.length/3;verts.push(0,0,-p.length/2);const top=verts.length/3;verts.push(0,0,p.length/2);
  for(let i=0;i<nc;i++){const j=(i+1)%nc;triangles.push(bottom,j,i,top,nz*nc+i,nz*nc+j);}
  return {verts,triangles};
}
function thread(node,M,p,fromMesh){
  const internal=p.kind!=='external';let m=fromMesh(threadMesh(p,node.segments,internal));
  if(p.kind==='nut'){
    const radius=p.diameter/2+p.clearance,minWall=p.outerShape==='hex'?p.outerDiameter*Math.cos(Math.PI/6)/2:p.outerDiameter/2;
    if(minWall<=radius+.2){m.delete();throw new Error('Die Mutter braucht mindestens 0,2 mm Material außerhalb des Gewindes. Außenmaß vergrößern.');}
    const body=M.cylinder(p.length,p.outerDiameter/2,p.outerDiameter/2,p.outerShape==='hex'?6:node.segments,true);
    if(p.leadIn>0){if(p.leadIn>=Math.min(p.length/2,minWall-radius)){m.delete();body.delete();throw new Error('Einführfase für die Mutter verkleinern.');}
      for(const side of [-1,1]){let lead=M.cylinder(p.leadIn+.01,side===1?radius:radius+p.leadIn,side===1?radius+p.leadIn:radius,node.segments,true);lead=replace(lead,lead.translate([0,0,side*(p.length/2-p.leadIn/2)]));try{m=replace(m,M.union(m,lead));}finally{lead.delete();}}
    }
    try{m=replace(m,M.difference(body,m));}finally{body.delete();}
  }else if(!internal){
    if(p.head!=='none'){if(p.headDiameter<p.diameter){m.delete();throw new Error('Der Schraubenkopf muss mindestens den Gewindedurchmesser besitzen.');}let head=M.cylinder(p.headHeight+.02,p.headDiameter/2,p.headDiameter/2,p.head==='hex'?6:node.segments,true);head=replace(head,head.translate([0,0,-p.length/2-p.headHeight/2+.01]));try{m=replace(m,M.union(m,head));}finally{head.delete();}}
    if(p.bore>0){if(p.bore>=p.diameter-2*(threadDimensions(p).depth+p.clearance)-.1){m.delete();throw new Error('Die axiale Bohrung muss kleiner als der Gewindekern sein.');}const cut=M.cylinder(p.length+2*p.headHeight+2,p.bore/2,p.bore/2,node.segments,true);try{m=replace(m,M.difference(m,cut));}finally{cut.delete();}}
  }return m;
}
export function buildParametric(node,M,fromMesh){
  if(!validParameters(node))throw new Error('Ungültige Formparameter.');
  const p=parameters(node),seg=node.segments||64;
  switch(node.type){
    case 'box':case 'roundbox':return box(node,M,p);
    case 'cylinder':case 'hexagon':case 'triangle':case 'polygon':case 'tube':return cylinder(node,M,p);
    case 'cone':{if(p.topDiameter>Math.min(...node.size.slice(0,2)))throw new Error('Der obere Kegeldurchmesser darf nicht größer als die Grundfläche sein.');return M.cylinder(node.size[2],Math.min(...node.size.slice(0,2))/2,p.topDiameter/2,seg,true);}
    case 'torus':{const r=Math.min(node.size[0],node.size[1])/2,t=p.wall/2;if(t>=r/2)throw new Error('Das Ringprofil muss kleiner als der halbe Außendurchmesser sein.');return M.revolve([circle(t,Math.max(12,seg/2)).map(([x,y])=>[x+r-t,y])],seg);}
    case 'star':return M.extrude([Array.from({length:p.points*2},(_,i)=>point(i%2?p.innerRatio:.999,i*Math.PI/p.points))],node.size[2],0,0,[1,1],true);
    case 'gear':return gear(node,M,p);
    case 'thread':case 'nut':return thread(node,M,p,fromMesh);
    case 'countersink':{if(p.sinkDiameter<p.bore)throw new Error('Der Senkungsdurchmesser muss mindestens dem Bohrungsdurchmesser entsprechen.');const depth=(p.sinkDiameter-p.bore)/2/Math.tan(p.angle*Math.PI/360);if(depth>p.length)throw new Error('Die Senkung ist tiefer als die Bohrungslänge.');let m=M.cylinder(p.length,p.bore/2,p.bore/2,seg,true);if(depth>0){let sink=M.cylinder(depth,p.bore/2,p.sinkDiameter/2,seg,true);sink=replace(sink,sink.translate([0,0,p.length/2-depth/2]));try{m=replace(m,M.union(m,sink));}finally{sink.delete();}}return m;}
    case 'shellbox':{const [w,d,h]=node.size;if(p.wall>=Math.min(w,d)/2||p.floor>=h)throw new Error('Wand und Boden müssen kleiner als der Innenraum sein.');const r=Math.min(p.radius,Math.min(w,d)/2*.999),outer=M.extrude([roundedRectangle(w,d,r,Math.max(4,seg/8))],h,0,0,[1,1],true);let inner=M.extrude([roundedRectangle(w-2*p.wall,d-2*p.wall,Math.max(0,r-p.wall),Math.max(4,seg/8))],h-p.floor+.02,0,0,[1,1],true);inner=replace(inner,inner.translate([0,0,p.floor/2+.01]));try{return M.difference(outer,inner);}finally{outer.delete();inner.delete();}}
    default:throw new Error('Für diese Form gibt es keinen Parameter-Generator.');
  }
}
