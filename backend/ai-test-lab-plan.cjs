const crypto=require('node:crypto');
const {cases,efforts}=require('./ai-diagnostic-cases.cjs');
const {definitions:functionCases}=require('./ai-practice-function-cases.cjs');
const VARIANTS=[
 {id:'A',name:'Kompakter Einstieg',description:'Bisheriger kompakter Vertrag und Szene.'},
 {id:'B',name:'Werkzeugwegweiser',description:'Auftragsbezogene Auskunftswege aus dem echten Katalog.'},
 {id:'C',name:'Details sofort',description:'Passende aktuelle Werkzeugbeschreibungen direkt im Einstieg.'},
 {id:'D',name:'Auswahl und Bezug',description:'Details plus gemessene Auswahlfakten und Größenbezug.'},
 {id:'E',name:'Gezielt nachladen',description:'Kurzer Index mit konkretem Pfad zu Detailauskünften.'},
 {id:'F',name:'Neutrale Beispiele',description:'Details plus allgemeine Registry-Beispiele ohne Aufgabenlösung.'}
];
const PRESETS=[
 {id:'pilot',name:'Kleiner Pilot',description:'Bohrung und Baugruppenteil · sechs Kontexte · drei Denkstufen · 36 Starts.'},
 {id:'screen',name:'Kontexte vergleichen',description:'Sechs Aufgaben · sechs Kontexte · drei Denkstufen · 108 Starts.'},
 {id:'confirm',name:'Neue Aufgaben bestätigen',description:'Neue Aufgabeninstanzen · A gegen gewählte Variante · zwei Wiederholungen · 72 Vollmodelle.'},
 {id:'images',name:'Bilder vergleichen',description:'Gleiche Textauswahl · ohne Bild/Gesamtansicht/Auswahlansicht.'},
 {id:'selection',name:'Ein Teil aus vielen',description:'Volle Szene gegen Auswahl · Agent und Übung getrennt.'},
 {id:'practice-functions',name:'30 Übungsfunktionen',description:'Sichtbare Bedienung · unabhängige Pflichtprüfungen · 90 Versuche.'},
 {id:'reliability',name:'Wiederholbarkeit',description:'Drei vollständige Wiederholungen je Aufgabe und Denkstufe.'}
];
const fail=text=>{throw Object.assign(Error(text),{code:'INVALID_LAB_PLAN'});};
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const choice=(value,allowed,name)=>{if(!allowed.includes(value))fail('Ungültig: '+name);return value;};
function choices(value,allowed,name){if(!Array.isArray(value)||!value.length||value.length>allowed.length||new Set(value).size!==value.length||value.some(v=>!allowed.includes(v)))fail('Ungültige Auswahl: '+name);return [...value];}
function integer(value,min,max,name){if(!Number.isSafeInteger(value)||value<min||value>max)fail(name+': '+min+' bis '+max);return value;}
function validatePlan(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input))fail('Versuchsplan fehlt.');
 const allowed=['roles','name','preset','caseIds','variants','efforts','repeats','stage','dataset','workflow','scopes','images','monitor','limits','customContext','variantNotes','finalist'];
 if(Object.keys(input).some(k=>!allowed.includes(k)))fail('Unbekanntes Planfeld.');
 const plan={name:typeof input.name==='string'?input.name.trim().slice(0,120):'Neuer Vergleich',preset:choice(input.preset??'pilot',PRESETS.map(p=>p.id),'Vorlage'),caseIds:choices(input.caseIds??['drill','assembly'],[...cases.map(c=>c.id),'assembly',...functionCases.map(c=>c.id),...require('./ai-benchmark-advanced-cases.cjs').definitions.map(c=>c.id)],'Aufgaben'),variants:choices(input.variants??VARIANTS.map(v=>v.id),VARIANTS.map(v=>v.id),'Kontexte'),efforts:choices(input.efforts??efforts,require('./ai-lab-roles.cjs').EFFORTS,'Denkstufen'),repeats:integer(input.repeats??1,1,8,'Wiederholungen'),stage:choice(input.stage??'start',['start','full'],'Testtiefe'),dataset:choice(input.dataset??'development',['development','holdout'],'Datensatz'),workflow:choice(input.workflow??'agent',['agent','practice','both'],'Arbeitsweise'),scopes:choices(input.scopes??['selection'],['selection','full'],'Szenenumfang'),images:choices(input.images??['none'],['none','overview','selection'],'Bilder'),finalist:choice(input.finalist??'C',VARIANTS.filter(v=>v.id!=='A').map(v=>v.id),'Finalist')};
 if(plan.caseIds.some(id=>id.startsWith('practice-')||id.startsWith('advanced-'))&&(plan.workflow!=='practice'||plan.dataset!=='development'||plan.stage!=='full'))fail('Funktionstests benötigen Übung, vollständige Ausführung und Entwicklungsdatensatz.');
 const monitor=input.monitor??{};
 if(Object.keys(monitor).some(k=>!['mode','model','effort','trigger','prefixChars','confidence','cadence','maxChecks'].includes(k)))fail('Unbekanntes Überwacherfeld.');
 plan.monitor={mode:choice(monitor.mode??'shadow',['off','shadow','active'],'Überwachung'),model:typeof monitor.model==='string'?monitor.model.trim():'deepseek-flash',effort:choice(monitor.effort??'low',efforts,'Überwacher-Denkstufe'),trigger:choice(monitor.trigger??'proposal',['reasoning','proposal'],'Prüfzeitpunkt'),prefixChars:integer(monitor.prefixChars??1000,400,4000,'Denktextzeichen'),cadence:choice(monitor.cadence??'first',['first','each-proposal'],'Supervisor cadence'),maxChecks:integer(monitor.maxChecks??12,1,24,'Supervisor checks'),confidence:monitor.confidence??.95};
 if(!plan.monitor.model||plan.monitor.model.length>200||/[\x00-\x1f]/.test(plan.monitor.model)||!Number.isFinite(plan.monitor.confidence)||plan.monitor.confidence<.5||plan.monitor.confidence>1)fail('Ungültige Überwachereinstellung.');
 if(plan.dataset==='holdout'&&plan.monitor.mode==='active')fail('Die Bestätigungsserie verwendet einen beobachtenden Überwacher. Aktive Abbrüche separat entwickeln.');
 const limits=input.limits??{};
 if(Object.keys(limits).some(k=>!['seconds','outputTokens','rounds','formatRepairs','requestBudget'].includes(k)))fail('Unbekanntes Limit.');
 plan.limits={seconds:integer(limits.seconds??(plan.stage==='start'?120:360),30,900,'Zeitlimit'),outputTokens:integer(limits.outputTokens??16384,1024,32768,'Ausgabetokens'),rounds:integer(limits.rounds??20,1,40,'Schrittlimit'),formatRepairs:integer(limits.formatRepairs??(plan.stage==='full'?2:0),0,2,'Formatkorrekturen'),requestBudget:integer(limits.requestBudget??2000,1,10000,'Anfragebudget')};
 if(input.customContext!==undefined&&(typeof input.customContext!=='string'||input.customContext.length>6000||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(input.customContext)))fail('Eigener Kontext: höchstens 6000 Zeichen.');
 plan.customContext=input.customContext??'';
 const notes=input.variantNotes??{};if(!notes||Array.isArray(notes)||typeof notes!=='object'||Object.keys(notes).some(k=>!VARIANTS.some(v=>v.id===k)))fail('Invalid variant notes.');plan.variantNotes={};for(const [id,text] of Object.entries(notes)){if(typeof text!=='string'||text.length>3000||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))fail('Variant note exceeds 3000 characters.');if(text)plan.variantNotes[id]=text;}
 if(plan.dataset==='holdout'&&(plan.customContext||Object.keys(plan.variantNotes).length))fail('Eigene Kontextoptimierung gehört in die Entwicklungsserie.');
 if(input.roles!==undefined)plan.roles=require('./ai-lab-roles.cjs').validateRoles(input.roles);
 return plan;
}
function preset(id='pilot',finalist='C'){
 const p={name:PRESETS.find(p=>p.id===id)?.name,preset:id,finalist};
 if(id==='practice-functions')Object.assign(p,{caseIds:functionCases.map(c=>c.id),variants:['C'],stage:'full',workflow:'practice'});
 if(id==='screen')p.caseIds=cases.map(c=>c.id);
 if(id==='confirm')Object.assign(p,{caseIds:cases.map(c=>c.id),variants:['A',finalist],stage:'full',repeats:2,dataset:'holdout'});
 if(id==='images')Object.assign(p,{variants:['C'],images:['none','overview','selection']});
 if(id==='selection')Object.assign(p,{caseIds:['assembly'],variants:['C'],workflow:'both',scopes:['selection','full']});
 if(id==='reliability')Object.assign(p,{caseIds:cases.map(c=>c.id),variants:['C'],stage:'full',repeats:3});
 return validatePlan(p);
}
function expandPlan(input){
 const plan=validatePlan(input),rows=[];let block=0;
 const workflows=plan.workflow==='both'?['agent','practice']:[plan.workflow];
 const effectiveEfforts=plan.roles?.modeler&&plan.roles.modeler.effort!=='series'?[plan.roles.modeler.effort==='profile'?'auto':plan.roles.modeler.effort]:plan.efforts;
 for(let repeat=0;repeat<plan.repeats;repeat++)for(const caseId of plan.caseIds)for(const effort of effectiveEfforts)for(const workflow of workflows)for(const sceneScope of plan.scopes){
  const conditions=plan.variants.flatMap(variant=>plan.images.map(imageMode=>({variant,imageMode}))),shift=block++%conditions.length;
  for(let i=0;i<conditions.length;i++){const c=conditions[(i+shift)%conditions.length];rows.push({caseId,effort,workflow,sceneScope,repeat,...c,startImage:c.imageMode!=='none',stage:plan.stage,dataset:plan.dataset,experiment:'lab',...(plan.roles?{roles:plan.roles}:{}),monitor:plan.monitor,limits:plan.limits,customContext:[plan.customContext,plan.variantNotes[c.variant]].filter(Boolean).join('\n'),plannedRepeats:plan.repeats});}
 }
 if(rows.length>648)fail('Höchstens 648 Versuche je Serie. Faktoren auf getrennte Vergleiche verteilen.');
 return {plan,planHash:hash(plan),trials:rows.length,maxProviderRequests:Math.min(plan.limits.requestBudget,rows.length*(plan.limits.rounds+(plan.monitor.mode==='off'?0:2*((plan.monitor.cadence==='each-proposal'?plan.monitor.maxChecks:1)+51+(plan.stage==='full'?1:0))))),rows};
}
module.exports={VARIANTS,PRESETS,validatePlan,preset,expandPlan,hash};
