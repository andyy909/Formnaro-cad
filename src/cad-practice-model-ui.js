import {cadFormLocalDimensions} from './cad-interface-state.js';
import {CAD_SHAPES} from './cad-shapes.js';
// Geometry may use the modelling engine. Connections and motion are taught
// through the same visible dialog controls a person uses.
export function createPracticeModelUI({controller,access,input,waitFor,checkpoint,settled,document}){
 const aliases={},joints=new Map(),gears=new Map(),project=()=>controller.readSnapshot(),q=id=>document.getElementById(id);
 const ui=async(action,target,value,text)=>{await checkpoint();await input({target:'ui:id:'+target,action,...(value===undefined?{}:{value:String(value)})},text);await settled();};
 const click=(id,text)=>ui('click',id,undefined,text),choose=(id,value,text)=>ui('choose',id,value,text);
 async function set(id,value,text){const current=String(q(id)?.value??'');if(current===String(value)||typeof value==='number'&&current.trim()&&Number(current.replace(',','.'))===value)return;await ui('set',id,value,text);}
 const jointId=id=>typeof id==='string'&&id.startsWith('$')?(project().joints?.joints.find(j=>j.childId===aliases[id.slice(1)])?.id??id):joints.get(id)??id,gearId=id=>gears.get(id)??id;
 function resolve(value,key=''){
  if(typeof value==='string'&&value.startsWith('$')&&['target','targets','rootId','id','ids','nodeId','leftId','rightId','parentId','childId','referenceTarget'].includes(key)){
   const result=aliases[value.slice(1)];if(result===undefined)throw Error('Übungsbezug fehlt: '+value);return structuredClone(result);
  }
  if(Array.isArray(value))return value.map(v=>resolve(v,key));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,resolve(v,k)]));return value;
 }
 const root=value=>typeof value==='string'?value:value?.path?.length===0?value.rootId:null;
 async function open(){if(q('joint-panel')?.getClientRects().length)return;await input({target:'ui:label:CAD-Werkzeuge',action:'click'},'CAD-Werkzeuge öffnen.');await input({target:'ui:tool:joints',action:'click'},'„Gelenke und Bewegung“ öffnen. Hier werden Teile verbunden und Zahnräder gekoppelt.');await waitFor(()=>!!q('joint-panel'),'Gelenkdialog öffnen');}
 async function close(){if(q('joint-panel')?.getClientRects().length){await click('joint-cancel','Dialog schließen. Bereits angelegte Verbindungen und Kopplungen bleiben erhalten.');await waitFor(()=>!q('joint-panel')?.getClientRects().length,'Dialog schließen');}}
 async function details(id,toggle,text){if(!q(id).open)await click(toggle,text);}
 async function coordinates(name,values){for(let k=0;k<3;k++)await set('joint-'+name+'-'+k,values[k],(name==='origin'?'Drehpunkt ':'Achsenrichtung ')+['X','Y','Z'][k]+' einstellen.');}
 async function commit(button,text){const revision=controller.revision();await click(button,text);await waitFor(()=>controller.revision()!==revision,'Gelenkeinstellung übernehmen');}
 async function joint(command,{holdMotion=false}={}){
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
   for(const v of r.values)await ui('drag','joint-slider-'+jointId(v.jointId),v.value,'Den Antriebsregler nach rechts bzw. links ziehen. Die gekoppelten Räder laufen mit.');
   if(!holdMotion&&!q('joint-apply').disabled)await commit('joint-apply','Die gezeigte Endstellung einmal übernehmen.');
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
  const added=project().nodes.filter(n=>!before.has(n.id));if(added.length!==1)throw Error('Neue Grundform nicht eindeutig.');if(c.as)aliases[c.as]=added[0].id;
  if(c.name)await set('object-name',c.name,'Das neue Teil benennen: '+c.name+'.');
  for(const [key,value] of Object.entries(c.params??{})){const field=q('param-'+key);if(!field)throw Error('Formparameter fehlt: '+key);const d=field.closest('details');if(d&&!d.open)await click('shape-parameters-advanced-toggle','Weitere Formparameter aufklappen.');if(field.tagName==='SELECT')await choose(field.id,value,'Formparameter auswählen: '+key+'.');else await set(field.id,value,'Formparameter '+key+' = '+value+' eingeben.');await settled();}
  if(['gear','thread','nut'].includes(c.type)){const n=project().nodes.find(n=>n.id===added[0].id);if([0,1,2].some(k=>Math.abs(Math.hypot(...n.transform.slice(4*k,4*k+3))-1)>1e-7))await click('parameter-original','Nach Zähnezahl oder Modul die Originalgröße herstellen. So entspricht der Teilkreis wirklich dem eingestellten Modul und die Zähne greifen ineinander.');}
  for(const [kind,values]of [['size',c.size],['pos',c.pos??[0,0,cadFormLocalDimensions(project().nodes.find(n=>n.id===added[0].id))[2]/2]],['rot',c.rot]])if(values)for(let k=0;k<3;k++){await set(kind+'-'+k,values[k],(kind==='size'?'Maß ':kind==='pos'?'Weltposition ':'Drehwinkel ')+['X','Y','Z'][k]+' = '+values[k]+' eingeben.');await settled();}
  if(c.solid===false)await input({target:'hole-btn',action:'click'},'Das Teil als Lochform kennzeichnen.');
  if(c.color)await set('object-color-hex',c.color,'Die gewünschte Farbe am Farbfeld einstellen.');await settled();
 }
 async function run(action,{holdMotion=false}={}){
  let pending=[];const flush=async()=>{if(!pending.length)return;await close();let proposal;try{proposal=await access.preview({revision:controller.revision(),label:action.label,commands:resolve(pending),checks:[]},{retainFailedChecks:true});await checkpoint();await access.apply({previewId:proposal.previewId,revision:proposal.revision,acceptFeatureDependencies:true,acceptFailedChecks:true});Object.assign(aliases,proposal.aliases);await settled();}catch(e){if(proposal)access.discard(proposal.previewId);throw e;}pending=[];};
  for(const command of action.commands){await checkpoint();if(command.op==='joint'){await flush();await joint(command,{holdMotion});}else if(command.op==='create'&&!command.parent&&CAD_SHAPES.some(s=>s.type===command.type)&&!command.mirror&&!command.text&&project().workplane.origin.every(v=>v===0)&&project().workplane.orientation.every((v,k)=>v===(k===3?1:0))){await flush();await create(command);}else pending.push(command);}await flush();if(!holdMotion)await close();
  let verification={version:1,checks:[]};if(action.checks?.length){const p=await controller.preview(undefined);try{verification=await controller.checkPreview(p.previewId,resolve(action.checks),{collectFailures:true});}finally{controller.discard(p.previewId);}}
  return {verification,jointValues:(project().joints?.joints??[]).map(j=>({id:j.id,value:Number(q('joint-value-'+j.id)?.value??j.value)})),visibleJointControls:true};
 }
 return {run,rootAlias:name=>root(aliases[name])};
}
