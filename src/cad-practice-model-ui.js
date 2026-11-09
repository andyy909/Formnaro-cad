import {isPracticeUICommand} from './cad-practice-ui-policy.js';
import {cadFormLocalDimensions} from './cad-interface-state.js';
import {CAD_SHAPES} from './cad-shapes.js';
// Task-locked practice construction uses real native UI input only.
// No generic geometry/API fallback is available.
export function practiceScrewEvidence(drives,values,selected){
 const byId=new Map(values.map(row=>[row.id,row.value])),ids=new Set(selected);
 return (drives??[]).filter(c=>c.kind==='screw'&&(ids.has(c.rotary)||ids.has(c.linear))).map(c=>{
  const angle=byId.get(c.rotary),actual=byId.get(c.linear),expected=angle*c.lead*c.direction/360+c.phase;
  const tolerance=1e-6,available=Number.isFinite(expected)&&Number.isFinite(actual);
  return {id:c.id,kind:'screw',angle,expected,actual,tolerance,status:!available?'unavailable':Math.abs(actual-expected)<=tolerance?'passed':'failed'};
 });
}

export function createPracticeModelUI({controller,access,input,waitFor,checkpoint,settled,document,aliases=new Map()}){
 const joints=new Map(),gears=new Map(),project=()=>controller.readSnapshot(),q=id=>document.getElementById(id);
 const ui=async(action,target,value,text)=>{await checkpoint();await input({target:'ui:id:'+target,action,...(value===undefined?{}:{value:String(value)})},text);await settled();};
 const click=(id,text)=>ui('click',id,undefined,text),choose=(id,value,text)=>ui('choose',id,value,text);
 async function set(id,value,text){const current=String(q(id)?.value??'');if(current===String(value)||typeof value==='number'&&current.trim()&&Number(current.replace(',','.'))===value)return;await ui('set',id,value,text);}
 const jointId=id=>typeof id==='string'&&id.startsWith('$')?(project().joints?.joints.find(j=>j.childId===root(aliases.get(id.slice(1))))?.id??id):joints.get(id)??id,gearId=id=>gears.get(id)??id;
 function resolve(value,key='',local=new Set(),deferUnknown=false){
  if(typeof value==='string'&&value.startsWith('$')&&['target','targets','rootId','id','ids','nodeId','leftId','rightId','parentId','childId','referenceTarget'].includes(key)){
   if(local.has(value.slice(1)))return value;
   const result=aliases.get(value.slice(1));if(result===undefined){if(deferUnknown)return value;throw Error('Übungsbezug fehlt: '+value);}return structuredClone(result);
  }
  if(Array.isArray(value))return value.map(v=>resolve(v,key,local,deferUnknown));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,resolve(v,k,local,deferUnknown)]));return value;
 }
 const root=value=>typeof value==='string'?value:value?.path?.length===0?value.rootId:null;
 function rootAlias(name){
  const id=root(aliases.get(name)),nodes=project().nodes;if(!id||nodes.some(n=>n.id===id))return id;
  // A native edit retains its one positive source identity. Ordinary drilling
  // also adds negative cutters. Never follow a consumed cutter, multiple solid
  // sources, an unrelated body, or an ambiguous clone.
  const follows=(node,seen=new Set())=>{
   if(node.id===id)return true;if(seen.has(node.id))return false;seen.add(node.id);
   if(node.kind!=='cad'||!node.children?.length)return false;
   const positive=node.children.filter(c=>c.solid!==false&&!c.suppressed);
   const unary=node.children.length===1&&['finish','modeling'].includes(node.source);
   const subtractive=node.source==='group'&&(node.operation??'union')==='union'&&positive.length===1;
   return (unary||subtractive)&&follows(unary?node.children[0]:positive[0],seen);
  };
  const replacements=nodes.filter(n=>follows(n));
  if(replacements.length!==1)return id;
  aliases.set(name,replacements[0].id);return replacements[0].id;
 }
 async function open(){if(q('joint-panel')?.getClientRects().length)return;await input({target:'ui:label:CAD-Werkzeuge',action:'click'},'CAD-Werkzeuge öffnen.');await input({target:'ui:tool:joints',action:'click'},'„Gelenke und Bewegung“ öffnen. Hier werden Teile verbunden und Zahnräder gekoppelt.');await waitFor(()=>!!q('joint-panel'),'Gelenkdialog öffnen');}
 async function close(){if(q('joint-panel')?.getClientRects().length){await click('joint-cancel','Dialog schließen. Bereits angelegte Verbindungen und Kopplungen bleiben erhalten.');await waitFor(()=>!q('joint-panel')?.getClientRects().length,'Dialog schließen');}}
 async function details(id,toggle,text){if(!q(id).open)await click(toggle,text);}
 async function coordinates(name,values){for(let k=0;k<3;k++)await set('joint-'+name+'-'+k,values[k],(name==='origin'?'Drehpunkt ':'Achsenrichtung ')+['X','Y','Z'][k]+' einstellen.');}
 async function commit(button,text){const revision=controller.revision();await click(button,text);await waitFor(()=>controller.revision()!==revision,'Gelenkeinstellung übernehmen');}
 async function joint(command,{holdMotion,motionTargets,motionStates,motionCouplings}){
  const {op,...r}=resolve(command);await open();
  if(r.action==='create'){
   const j=r.joint,parent=root(j.parentId),child=root(j.childId);if(!parent||!child)throw Error('Für Gelenke vollständige Körper wählen.');
   await details('joint-create-details','joint-create-toggle','Bereich „Weitere Verbindung anlegen“ öffnen.');
   await choose('joint-kind',j.kind,'Gelenkart auswählen: '+j.kind+'.');await choose('joint-parent',parent,'Den gemeinsamen Träger als Elternteil bzw. feste Basis auswählen.');await choose('joint-child',child,'Das bewegte Teil auswählen.');
   await set('joint-name',j.name??('Drehgelenk '+(project().nodes.find(n=>n.id===child)?.name??'')),'Dem Gelenk einen verständlichen Namen geben.');await ui('locate','joint-origin-0',undefined,'Geplanter Welt-Bezugspunkt: ('+j.origin.join(', ')+') mm. Das ist dasselbe Koordinatensystem wie bei den Positionsfeldern der Teile.');await coordinates('origin',j.origin);await coordinates('axis',j.axis??[0,0,1]);
   if(j.kind!=='fixed'){const limits=j.limits??(j.kind==='revolute'?{min:-180,max:180}:{min:-100,max:100});await set('joint-min',limits.min,'Untere Bewegungsgrenze einstellen.');await set('joint-max',limits.max,'Obere Bewegungsgrenze einstellen.');}
   const before=new Set(project().joints?.joints.map(j=>j.id)??[]);await commit('joint-create','„Verbindung anlegen“ anklicken.');const added=project().joints.joints.filter(j=>!before.has(j.id));if(added.length!==1)throw Error('Die neue Verbindung wurde nicht eindeutig angelegt.');joints.set(j.id??added[0].id,added[0].id);
  }else if(r.action==='gear-create'){
   const g=r.gear;await details('joint-gears','joint-gears-toggle','„Zahnräder koppeln“ aufklappen. Die Zähnezahlen bestimmen die Übersetzung.');
   await choose('joint-gear-a',jointId(g.jointA),'Erstes Drehgelenk der Kopplung auswählen.');await set('joint-teeth-a',g.teethA,'Zähnezahl des ersten Rads: '+g.teethA+'.');await choose('joint-gear-b',jointId(g.jointB),'Zweites Drehgelenk auswählen.');await set('joint-teeth-b',g.teethB,'Zähnezahl des zweiten Rads: '+g.teethB+'.');await choose('joint-gear-kind',g.kind??'external','Außenverzahnung dreht gegenläufig; Innenverzahnung gleichläufig.');
   const before=new Set(project().joints.gears?.map(g=>g.id)??[]);await commit('joint-gear-create','Mit „Zahnräder koppeln“ die Übersetzung anlegen.');const added=project().joints.gears.filter(g=>!before.has(g.id));if(added.length!==1)throw Error('Die Kopplung wurde nicht eindeutig angelegt.');gears.set(g.id??added[0].id,added[0].id);
  }else if(r.action==='move'){
   const targets=r.values.map(v=>({jointId:jointId(v.jointId),expected:v.value}));
   const matches=(value,expected)=>Number.isFinite(value)&&Math.abs(value-expected)<1e-6;
   for(const v of targets){
    const field='joint-value-'+v.jointId,slider=q('joint-slider-'+v.jointId);
    const joint=project().joints?.joints.find(j=>j.id===v.jointId);
    if(!joint||!slider||!q(field)||!Number.isFinite(v.expected)||joint.limits&&(v.expected<joint.limits.min||v.expected>joint.limits.max))throw Error('Ungültiges Bewegungsziel: '+v.jointId);
    await ui('drag',slider.id??('joint-slider-'+v.jointId),v.expected,'Den Antriebsregler ziehen. Die gekoppelten Teile bewegen sich mit.');
    // Native range controls quantize mouse positions to pixels. A visible
    // number-field correction is necessary before accepting an exact angle.
    if(!matches(Number(q(field)?.value),v.expected))await set(field,v.expected,'Den genauen Zielwert '+v.expected+' im Zahlenfeld einstellen.');
    await waitFor(()=>matches(Number(q(field)?.value),v.expected),'genauen Bewegungswert '+v.expected);
   }
   for(const v of targets)if(!matches(Number(q('joint-value-'+v.jointId)?.value),v.expected))throw Error('Bewegungsziele widersprechen sich durch eine Kopplung.');
   const previewValues=(project().joints?.joints??[]).map(j=>({id:j.id,value:Number(q('joint-value-'+j.id)?.value??j.value)}));
   if(!holdMotion&&!q('joint-apply').disabled)await commit('joint-apply','Die gezeigte Endstellung einmal übernehmen.');
   if(!holdMotion)for(const v of previewValues)if(!matches(project().joints?.joints.find(j=>j.id===v.id)?.value,v.value))throw Error('Gespeicherte Kopplungsstellung weicht von der Vorschau ab: '+v.id);
   for(const v of targets){const actual=holdMotion?Number(q('joint-value-'+v.jointId)?.value):project().joints?.joints.find(j=>j.id===v.jointId)?.value;if(!matches(actual,v.expected))throw Error('Gespeicherter Bewegungswert stimmt nicht mit dem Ziel überein: '+v.jointId);motionTargets.push({...v,preview:previewValues.find(j=>j.id===v.jointId)?.value,actual,persisted:!holdMotion});}
   const couplings=practiceScrewEvidence(project().joints?.drives,previewValues,targets.map(v=>v.jointId));
   if(couplings.length)motionCouplings.push({revision:controller.revision(),persisted:!holdMotion,checks:couplings});
   if(couplings.some(c=>c.status!=='passed'))throw Error('Der gemessene Vorschub stimmt nicht mit der bestehenden Schraubkopplung überein.');
   motionStates?.push({jointValues:previewValues,persisted:!holdMotion,revision:controller.revision()});
  }else if(r.action==='gear-remove'){
   await details('joint-gears','joint-gears-toggle','Zahnradkopplungen öffnen.');await commit('joint-gear-remove-'+gearId(r.gearId),'Die gewählte Kopplung lösen.');
  }else if(['limits','rebind','remove'].includes(r.action)){
   await details('joint-edit-details','joint-edit-toggle','„Grenzen und Bezüge bearbeiten“ öffnen.');await choose('joint-edit',jointId(r.jointId),'Die zu bearbeitende Verbindung auswählen.');
   if(r.action==='limits'){await set('joint-edit-min',r.limits.min,'Neue untere Grenze eingeben.');await set('joint-edit-max',r.limits.max,'Neue obere Grenze eingeben.');await commit('joint-limits','Grenzen übernehmen.');}
   else if(r.action==='rebind'){await details('joint-create-details','joint-create-toggle','Bezugspunkt und Achse einblenden.');await coordinates('origin',r.origin);await coordinates('axis',r.axis);await commit('joint-rebind','Bezug erneuern.');}
   else await commit('joint-remove','Verbindung lösen.');
  }else if(r.action==='clear'){
   for(const j of [...project().joints?.joints??[]]){await details('joint-edit-details','joint-edit-toggle','Verbindungen bearbeiten.');await choose('joint-edit',j.id,'Die nächste Verbindung auswählen.');await commit('joint-remove','Verbindung lösen.');}
  }else throw Error('Unbekannter Gelenkbefehl.');
 }
 async function create(c){
  await close();const before=new Set(project().nodes.map(n=>n.id));await input({target:'shape:'+c.type,action:'drag'},'Die Grundform '+(CAD_SHAPES.find(s=>s.type===c.type)?.name??c.type)+' aus der Formenleiste auf die Arbeitsfläche ziehen.');await waitFor(()=>project().nodes.some(n=>!before.has(n.id)),'Grundform einsetzen');
  const added=project().nodes.filter(n=>!before.has(n.id));if(added.length!==1)throw Error('Neue Grundform nicht eindeutig.');if(c.as)aliases.set(c.as,added[0].id);
  if(c.name)await set('object-name',c.name,'Das neue Teil benennen: '+c.name+'.');
  for(const [key,value] of Object.entries(c.params??{})){const field=q('param-'+key);if(!field)throw Error('Formparameter fehlt: '+key);const d=field.closest('details');if(d&&!d.open)await click('shape-parameters-advanced-toggle','Weitere Formparameter aufklappen.');if(field.tagName==='SELECT')await choose(field.id,value,'Formparameter auswählen: '+key+'.');else await set(field.id,value,'Formparameter '+key+' = '+value+' eingeben.');await settled();}
  if(['gear','thread','nut'].includes(c.type)){const n=project().nodes.find(n=>n.id===added[0].id);if([0,1,2].some(k=>Math.abs(Math.hypot(...n.transform.slice(4*k,4*k+3))-1)>1e-7))await click('parameter-original','Nach Zähnezahl oder Modul die Originalgröße herstellen. So entspricht der Teilkreis wirklich dem eingestellten Modul und die Zähne greifen ineinander.');}
  if(c.size)for(let k=0;k<3;k++){await set('size-'+k,c.size[k],'Maß '+'XYZ'[k]+' = '+c.size[k]+' eingeben.');await settled();}
  // A fresh library drop has an arbitrary pointer position. Teach the actual
  // placement tool before entering only the requested remaining offsets.
  await input({target:'ui:tool:center',action:'click'},'„Zur Mitte“ in der Werkzeugleiste: das neue Teil gemeinsam in X/Y zentrieren und auf Z=0 absetzen.');await settled();
  for(const [kind,values]of [['pos',c.pos??[0,0,cadFormLocalDimensions(project().nodes.find(n=>n.id===added[0].id))[2]/2]],['rot',c.rot]])if(values)for(let k=0;k<3;k++){await set(kind+'-'+k,values[k],(kind==='pos'?'Gewünschter Weltversatz ':'Drehwinkel ')+['X','Y','Z'][k]+' = '+values[k]+' eingeben.');await settled();}
  if(c.solid===false)await input({target:'hole-btn',action:'click'},'Das Teil als Lochform kennzeichnen.');
  if(c.color)await set('object-color-hex',c.color,'Die gewünschte Farbe am Farbfeld einstellen.');await settled();
 }
 async function run(action,{holdMotion=false}={}){
  if(!Array.isArray(action.commands)||!action.commands.length||action.commands.some(c=>!isPracticeUICommand(c)))throw Error('Übungsauftrag: kein direkter Modell- oder Skriptzugriff. Nur sichtbar bediente Grundformen und Gelenke sind freigegeben.');
  if(action.commands.some(c=>c.op==='create')&&(!project().workplane.origin.every(v=>v===0)||!project().workplane.orientation.every((v,k)=>v===(k===3?1:0))))throw Error('Grundformen hier über die sichtbaren Bedienelemente auf der aktuellen Arbeitsebene einsetzen.');
  const motionTargets=[],motionCouplings=[];
  const motionStates=action.commands.filter(command=>command.op==='joint'&&command.action==='move').length>1?[]:null;
  for(const [index,command] of action.commands.entries()){
   await checkpoint();
   const next=action.commands[index+1],hold=next?next.op==='joint'&&next.action==='move':holdMotion;
   if(command.op==='joint')await joint(command,{holdMotion:hold,motionTargets,motionStates,motionCouplings});
   else await create(command);
  }
  if(!holdMotion)await close();
  let verification={version:1,checks:[]};if(action.checks?.length){const p=await controller.preview(undefined);try{verification=await controller.checkPreview(p.previewId,resolve(action.checks),{collectFailures:true});}finally{controller.discard(p.previewId);}}
  return {verification,motionTargets,...(motionCouplings.length?{motionCouplings}:{}),...(motionStates?{motionStates}:{}),jointValues:(project().joints?.joints??[]).map(j=>({id:j.id,value:Number(q('joint-value-'+j.id)?.value??j.value)})),visibleJointControls:true};
 }
 return {run,rootAlias,aliasState:()=>[...aliases.keys()].slice(0,32).map(alias=>{const id=rootAlias(alias);return {alias,target:structuredClone(aliases.get(alias)),kind:project().nodes.find(n=>n.id===id)?.kind??null};}),reset(){aliases.clear();joints.clear();gears.clear();}};
}
