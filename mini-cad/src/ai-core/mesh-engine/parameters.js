// Shape settings are stored in project files; labels, limits and defaults share one schema.
const number=(key,label,value,min,max,step=.1,unit='mm')=>({key,label,value,min,max,step,unit});
const choice=(key,label,value,options)=>({key,label,value,options});
const edges=[['none','Scharf'],['round','Abrundung'],['chamfer','Fase 45°']];
const box=[choice('edgeStyle','Kantenform','none',edges),number('edgeSize','Radius / Fasenmaß',0,0,500),choice('edgeScope','Kanten','all',[['all','Alle Kanten'],['vertical','Nur senkrechte Kanten']]),number('edgeSteps','Rundungsschritte',6,1,48,1,'')];
const cylinder=[choice('edgeStyle','Randform','none',edges),number('edgeSize','Radius / Fasenmaß',0,0,500),choice('edgeScope','Ränder','both',[['both','Oben und unten'],['top','Nur oben'],['bottom','Nur unten']]),number('edgeSteps','Rundungsschritte',6,2,48,1,'')];
const gear=[number('teeth','Zähne',20,6,160,1,''),number('module','Normalmodul',1.5,.1,25,.1),number('pressureAngle','Eingriffswinkel',20,10,35,.5,'°'),number('helixAngle','Schrägungswinkel',0,-45,45,1,'°'),number('thickness','Zahnbreite',6,.1,200),number('backlash','Zahndickenspiel',.1,0,5,.01),number('profileShift','Profilverschiebung',0,-.5,1,.05,''),number('addendum','Kopfhöhenfaktor',1,.5,1.5,.05,''),number('dedendum','Fußhöhenfaktor',1.25,1,2,.05,''),number('bore','Bohrung Ø',5,0,1000),number('hubDiameter','Naben-Ø (0 = ohne)',0,0,1000),number('hubHeight','Zusätzliche Nabenhöhe',0,0,200),number('keyWidth','Nutbreite (0 = ohne)',0,0,100),number('keyDepth','Nuttiefe ab Bohrung',1,0,100)];
const thread=[choice('kind','Ausführung','external',[['external','Außengewinde'],['nut','Innengewinde / Mutter'],['cutter','Lochform für Innengewinde']]),choice('profile','Profil','metric',[['metric','Metrisches 60°-Druckprofil'],['trapezoid','Trapezprofil 30°'],['custom','Eigenes Profil']]),number('diameter','Nenndurchmesser',8,1,300),number('pitch','Steigung',1.25,.2,20,.05),number('length','Gewindelänge',16,.5,300),choice('hand','Drehrichtung','right',[['right','Rechtsgewinde'],['left','Linksgewinde']]),number('starts','Gänge',1,1,4,1,''),number('phase','Startwinkel',0,0,360,1,'°'),number('clearance','Radiales Passungsspiel',0,0,3,.01),number('depth','Profiltiefe (0 = automatisch)',0,0,30,.01),number('flankAngle','Flankenwinkel (eigenes Profil)',60,20,90,1,'°'),number('crest','Kopfbreite / Steigung',.125,.02,.5,.01,''),number('leadIn','Einführfase',.5,0,20),number('bore','Axiale Bohrung Ø',0,0,290),choice('outerShape','Mutterform','hex',[['hex','Sechskant'],['round','Rund']]),number('outerDiameter','Muttermaß über Ecken / Ø',15,2,500),choice('head','Schraubenkopf','none',[['none','Ohne Kopf'],['hex','Sechskant'],['round','Zylinderkopf']]),number('headDiameter','Kopfmaß über Ecken / Ø',13,1,500),number('headHeight','Kopfhöhe',5,.1,100)];
export const SCHEMAS={box,roundbox:box,cylinder,hexagon:cylinder,triangle:cylinder,polygon:[number('sides','Seiten',8,3,32,1,''),...cylinder],cone:[number('topDiameter','Oberer Ø',0,0,10000)],tube:[number('wall','Wandstärke',3.2,.01,500),...cylinder],torus:[number('wall','Ringprofil-Ø',8,.01,500)],star:[number('points','Spitzen',5,3,40,1,''),number('innerRatio','Innen-/Außenradius',.46,.1,.9,.01,'')],gear,thread,nut:thread,countersink:[number('bore','Bohrung Ø',4.4,.1,200),number('sinkDiameter','Senkung Ø',8.4,.1,300),number('angle','Senkungswinkel',90,30,150,1,'°'),number('length','Bohrungslänge',10,.1,300)],shellbox:[number('wall','Wandstärke',2,.1,100),number('floor','Bodenstärke',2,.1,100),number('radius','Äußerer Eckradius',3,0,500)]};
export const GENERATORS=new Set(['gear','thread','nut','countersink']);
export function defaults(type){const p=Object.fromEntries((SCHEMAS[type]||[]).map(f=>[f.key,f.value]));if(type==='roundbox'){p.edgeStyle='round';p.edgeSize=3;p.edgeScope='vertical';}if(type==='nut'){p.kind='nut';p.length=6;p.clearance=.15;}return p;}
export function parameters(node){return {...defaults(node.type),...node.params};}
export function scaledParameters(node,factor){const p=parameters(node);for(const f of SCHEMAS[node.type]||[])if(f.unit==='mm')p[f.key]*=factor;return p;}
export function validParameters(node){
  if(node.params===undefined)return !['thread','nut','countersink','shellbox','polygon'].includes(node.type);
  if(!node.params||Array.isArray(node.params)||typeof node.params!=='object')return false;
  const schema=SCHEMAS[node.type];if(!schema)return false;
  if(Object.keys(node.params).some(k=>!schema.some(f=>f.key===k)))return false;
  const p=parameters(node);return schema.every(f=>f.options?f.options.some(([v])=>v===p[f.key]):typeof p[f.key]==='number'&&Number.isFinite(p[f.key])&&p[f.key]>=f.min&&p[f.key]<=f.max&&(f.step!==1||Number.isInteger(p[f.key])));
}
export function gearDimensions(p){
  const beta=p.helixAngle*Math.PI/180,alpha=Math.atan(Math.tan(p.pressureAngle*Math.PI/180)/Math.cos(beta)),pitch=p.module*p.teeth/Math.cos(beta),base=pitch*Math.cos(alpha);
  return {alpha,pitch,base,outer:pitch+2*p.module*(p.addendum+p.profileShift),root:pitch-2*p.module*(p.dedendum-p.profileShift)};
}
export function threadDimensions(p){const angle=p.profile==='metric'?60:p.profile==='trapezoid'?30:p.flankAngle,depth=p.depth||(p.profile==='metric'?(p.kind==='external'?.6134345:.5412659)*p.pitch:p.profile==='trapezoid'?.5*p.pitch:.5*p.pitch);return {angle,depth,lead:p.pitch*p.starts,crest:p.profile==='trapezoid'?.25:p.crest};}
export function parameterNote(n){
  const p=parameters(n);
  if(n.type==='gear'){const d=gearDimensions(p);return `Teilkreis Ø ${d.pitch.toFixed(3)} mm · Kopfkreis Ø ${d.outer.toFixed(3)} mm · Fußkreis Ø ${d.root.toFixed(3)} mm. Evolventenflanken; Fußübergang vereinfacht, ohne Wälzfräs-Unterschnitt. Modul gilt bei Originalgröße.`;}
  if(n.type==='thread'||n.type==='nut'){const d=threadDimensions(p);return `Leitweg ${d.lead.toFixed(3)} mm/Umdrehung · Profiltiefe ${d.depth.toFixed(3)} mm. Passungsspiel wirkt radial: außen kleiner, innen größer. Annäherung mit flacher Profilwurzel; keine ISO-Toleranzklasse. Gewindemaße gelten bei Originalgröße.`;}
  if(n.type==='countersink')return `Als Lochform mit dem Zielkörper gruppieren. Senktiefe ${((p.sinkDiameter-p.bore)/2/Math.tan(p.angle*Math.PI/360)).toFixed(3)} mm; Senkung an der Oberseite.`;
  if(n.type==='shellbox')return 'Offene Schachtel mit definierter Wand und Boden. Innenradius = Außenradius minus Wandstärke, mindestens 0.';
  if(n.type==='torus')return 'Ringprofil-Ø in X/Y. Der Profilparameter setzt auch die Höhe neu; eine anschließend geänderte Z-Höhe macht den Querschnitt elliptisch.';
  if(n.mesh)return 'Gruppen und importierte Netze haben keine nativen Formparameter. Eine Gruppe auflösen, um ihre Grundformen zu bearbeiten.';
  if(SCHEMAS[n.type])return 'Parameter in Millimetern. 0 setzt den Übergang auf scharf. Radius und Fase bleiben bei einer Größenänderung erhalten, soweit sie geometrisch passen.';
  return '';
}
