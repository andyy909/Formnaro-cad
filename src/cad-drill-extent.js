// Calculations shared by a future persistent drill feature. All coordinates are
// in the drill frame: its origin is the entry point and drilling follows -Z.
// This module does not resolve or guess topological references.
const fail=message=>{throw Object.assign(Error(message),{code:'INVALID_CAD_DRILL_EXTENT'});};
const finite3=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);

export function calculateCadDrillExtent({termination,depth,bounds,stopPlane,margin=0}={}){
  if(!['depth','through','plane'].includes(termination))fail('Ungültige Bohrungs-Endbedingung.');
  if(!Number.isFinite(margin)||margin<0||margin>1)fail('Ungültiger Bohrungsrand.');
  let length;
  if(termination==='depth'){
    if(!Number.isFinite(depth)||depth<.1||depth>10000)fail('Gültige Bohrungstiefe eingeben.');
    length=depth;
  }else if(termination==='through'){
    if(!bounds||!finite3(bounds.min)||!finite3(bounds.max)||bounds.min.some((v,i)=>v>bounds.max[i]))fail('Gültige Körpergrenzen für die Durchgangsbohrung erforderlich.');
    // max must reach the entry plane and min must lie in the drilling direction.
    if(bounds.max[2]<-margin||bounds.min[2]>=0)fail('Die Durchgangsbohrung erreicht den Körper nicht.');
    length=-bounds.min[2]+margin;
  }else{
    if(!stopPlane||!finite3(stopPlane.point)||!finite3(stopPlane.normal))fail('Eine eindeutig bestimmte Zielfläche auswählen.');
    const [nx,ny,nz]=stopPlane.normal,norm=Math.hypot(nx,ny,nz);
    if(!Number.isFinite(norm)||norm<1e-12||Math.hypot(nx,ny)>norm*1e-8)fail('Die Zielfläche muss parallel zur Eintrittsebene liegen.');
    length=-stopPlane.point[2];
    if(!Number.isFinite(length)||length<.1)fail('Die Zielfläche muss in Bohrrichtung liegen.');
  }
  if(!Number.isFinite(length)||length<.1||length>10000)fail('Bohrungslänge liegt außerhalb des zulässigen Bereichs.');
  return length;
}

export function validateCadDrillDimensions({kind,diameter,headDiameter,headDepth,angle,gap=0,length}={}){
  if(!['plain','counterbore','countersink'].includes(kind))fail('Ungültige Bohrungsart.');
  if(!Number.isFinite(diameter)||diameter<.1||diameter>1000||!Number.isFinite(gap)||gap<0||gap>5||!Number.isFinite(length)||length<.1||length>10000)fail('Ungültige Bohrungsmaße.');
  const bore=diameter+2*gap;
  if(bore>1000)fail('Der Bohrungsdurchmesser ist zu groß.');
  if(kind==='plain')return {bore,length};
  const head=headDiameter+2*gap;
  if(!Number.isFinite(headDiameter)||head<=bore||head>(kind==='counterbore'?1000:300))fail('Das Kopfmaß liegt außerhalb der unterstützten Grenzen.');
  if(kind==='counterbore'){
    if(!Number.isFinite(headDepth)||headDepth<=0||headDepth>=length)fail('Die Kopfaufnahme muss flacher als die Bohrung sein.');
    return {bore,head,headDepth,length};
  }
  if(bore>200||!Number.isFinite(angle)||angle<30||angle>150)fail('Senkungswinkel oder Bohrungsdurchmesser liegt außerhalb der unterstützten Grenzen.');
  const sinkDepth=(head-bore)/2/Math.tan(angle*Math.PI/360);
  if(sinkDepth>=Math.min(length,300))fail('Die Senkung benötigt mehr Bohrungstiefe.');
  return {bore,head,angle,sinkDepth,length};
}
