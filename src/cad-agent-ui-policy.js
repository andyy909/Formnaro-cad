import {assertPracticeToolSequence} from '../ai/practice-plan-feedback.mjs';
import practicePolicy from '../ai/FORMNARO-PRACTICE-UI.json' with {type:'json'};
import {isPracticeUICommand} from './cad-practice-ui-policy.js';
import {validateAIResultChecks} from './cad-ai-result-checks.js';
import {practiceSketchGesture} from './cad-practice-sketch.js';
import {CAD_SHAPES} from './cad-shapes.js';
import {PROGRAM_TARGETS,validateAssistantAction} from './cad-program-help.js';

const SHAPES=new Set(CAD_SHAPES.map(s=>s.type));
const CLICK=new Set(['menu:arrange','menu:cad','menu:mesh','menu:convert','menu:view-tools','view:fit','view:iso','view:top','view:front','view:right']);
export const AGENT_UI_TARGETS=Object.freeze(PROGRAM_TARGETS.filter(t=>/^(?:tool|shape|menu|mode|view|region):/.test(t.id)&&!t.id.startsWith('region:preview-')).map(t=>({id:t.id,label:t.label,click:CLICK.has(t.id),...(t.path?{path:t.path}:{}),...(t.description&&!t.description.startsWith('Vorhandenes Formnaro-Werkzeug.')?{description:t.description}:{}),...(t.requirement?{requirement:t.requirement}:{})})));
const TARGETS=new Set(AGENT_UI_TARGETS.map(t=>t.id)),object=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const alias={type:'string',pattern:'^[a-z][a-z0-9_-]{0,40}$'};
const sketchPoint={type:'array',minItems:2,maxItems:2,items:{type:'number',minimum:-10000,maximum:10000}};
export const AGENT_PRACTICE_SCHEMA=object({version:{const:1},title:{type:'string',minLength:1,maxLength:200},actions:{type:'array',minItems:1,maxItems:50,items:{oneOf:[
 object({kind:{const:'shape'},text:{type:'string',maxLength:600},type:{enum:[...SHAPES]},as:alias},['kind','type','as']),
 object({kind:{const:'set'},text:{type:'string',maxLength:600},field:{enum:['size-0','size-1','size-2','pos-0','pos-1','pos-2']},value:{type:'number',minimum:-10000,maximum:10000}},['kind','field','value']),
 object({kind:{const:'role'},text:{type:'string',maxLength:600},value:{enum:['solid','hole']}},['kind','value']),
 object({kind:{const:'select'},text:{type:'string',maxLength:600},targets:{type:'array',minItems:1,maxItems:8,uniqueItems:true,items:alias}},['kind','targets']),
 object({kind:{const:'group'},text:{type:'string',maxLength:600},as:alias},['kind','as']),
 object({kind:{const:'ui'},action:{enum:['click','point','set','choose','drag']},target:{type:'string',pattern:'^(ui:(id|label|tool|menu|view):|(menu|tool|view):)',maxLength:240},value:{type:'string',maxLength:200},text:{type:'string',maxLength:600}},['kind','action','target']),
 object({kind:{const:'face'},target:alias,side:{enum:['top','bottom','left','right','front','back']},text:{type:'string',maxLength:600}},['kind','target','side']),
 object({kind:{const:'edge'},target:alias,sides:{type:'array',minItems:2,maxItems:2,uniqueItems:true,items:{enum:['top','bottom','left','right','front','back']}},text:{type:'string',maxLength:600}},['kind','target','sides']),
 object({kind:{const:'sketch-gesture'},point:sketchPoint,to:sketchPoint,add:{type:'boolean'},text:{type:'string',maxLength:600}},['kind','point']),
 object({kind:{const:'gear-snap'},moving:alias,anchor:alias,angle:{type:'number',minimum:-360,maximum:360},text:{type:'string',maxLength:600}},['kind','moving','anchor','angle']),
 object({kind:{const:'model'},label:{type:'string',maxLength:200},commands:{type:'array',minItems:1,maxItems:200,items:{oneOf:practicePolicy.commands}},checks:structuredClone(practicePolicy.resultChecks)},['kind','commands'])
]}}},['version','title','actions']);
export const AGENT_UI_SCHEMA={oneOf:[
 object({action:{const:'state'}},['action']),object({action:{const:'help'},query:{type:'string',maxLength:500}},['action','query']),
 object({action:{const:'guide'},revision:{type:'string',minLength:1,maxLength:200},steps:{type:'array',minItems:1,maxItems:12,items:object({action:{enum:['point','click']},target:{enum:[...TARGETS]},text:{type:'string',maxLength:600}},['action','target'])}},['action','revision','steps']),
 object({action:{const:'practice'},revision:{type:'string',minLength:1,maxLength:200},plan:AGENT_PRACTICE_SCHEMA},['action','revision','plan']),
 object({action:{const:'status'},jobId:{type:'string',minLength:1,maxLength:100}},['action','jobId']),object({action:{const:'cancel'},jobId:{type:'string',minLength:1,maxLength:100}},['action'])
]};
export const AGENT_UI_CONTRACT={version:1,requestSchema:AGENT_UI_SCHEMA,layoutContextFile:'ai/FORMNARO-UI-KONTEXT.md',targets:AGENT_UI_TARGETS,scope:'Only registered Formnaro UI targets. Menus/views may be clicked; other targets may only be pointed at. No OS input, coordinates, selectors, arbitrary keys, URLs, paths, file dialogs, provider settings or model commits. Practice locks each task to a separate empty Formnaro window with visible native UI construction only. Model shorthand allows native library create and joint-dialog replay only; hidden geometry batches and scripts are rejected. Read-only tool details, images and actual feedback remain available.',workflow:'Read context, scene, then ui state. Guide/practice returns a jobId immediately. Poll status at most once a second until completed/failed/cancelled. Never claim success from accepted/running. Cancel stops the active job. A changed parent revision invalidates the job.'};
const exact=(value,fields)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>fields.includes(k));
export function validateAgentUIRequest(value){
 if(!value||JSON.stringify(value).length>(value.action==='practice'?2*1024*1024:64000))throw Error('Ungültige oder zu große UI-Anfrage.');
 const fields={state:['action'],help:['action','query'],guide:['action','revision','steps'],practice:['action','revision','plan'],status:['action','jobId'],cancel:['action','jobId']}[value.action];
 if(!fields||!exact(value,fields))throw Error('Nicht freigegebene UI-Aktion oder Felder.');
 if(['guide','practice'].includes(value.action)&&(typeof value.revision!=='string'||!value.revision||value.revision.length>200))throw Error('Aktuelle Modellrevision für die UI-Aktion angeben.');
 if(value.action==='help'&&(typeof value.query!=='string'||value.query.length>500))throw Error('Ungültige lokale Hilfeanfrage.');
 if(value.action==='status'&&value.jobId===undefined||value.jobId!==undefined&&(typeof value.jobId!=='string'||!value.jobId||value.jobId.length>100))throw Error('Ungültige UI-Auftragskennung.');
 if(value.action==='guide'){
  if(!Array.isArray(value.steps)||!value.steps.length||value.steps.length>12)throw Error('Eine UI-Führung benötigt 1 bis 12 Schritte.');
  for(const step of value.steps)if(!exact(step,['action','target','text'])||!['point','click'].includes(step.action)||!TARGETS.has(step.target)||step.action==='click'&&!CLICK.has(step.target)||step.text!==undefined&&(typeof step.text!=='string'||step.text.length>600))throw Error('Nicht freigegebenes UI-Ziel. Nur feste Formnaro-Menüs/Ansichten anklicken.');
  validateAssistantAction({kind:'guide',steps:value.steps});
 }
 if(value.action==='practice')validateAgentPracticePlan(value.plan);
 return structuredClone(value);
}
export function validateAgentPracticePlan(plan){
 if(typeof plan?.title==='string'&&plan.title.length>200)throw Error('plan.title ist zu lang: '+plan.title.length+' Zeichen, höchstens 200. Nur eine kurze Überschrift verwenden; eine Erklärung gehört in das oberste diagnosis-Feld.');
 if(!exact(plan,['version','title','actions'])||plan.version!==1||typeof plan.title!=='string'||!plan.title.trim()||plan.title.length>200||!Array.isArray(plan.actions)||!plan.actions.length||plan.actions.length>50)throw Error('Ungültiger begrenzter Übungsplan.');
 const aliases=new Set(),used=new Set();let selected=[];
 function add(id){if(typeof id!=='string'||!/^[a-z][a-z0-9_-]{0,40}$/.test(id)||used.has(id))throw Error('Ungültiger Übungsalias.');used.add(id);aliases.add(id);selected=[id];}
 for(const [index,step] of plan.actions.entries()){
  if(!step||typeof step!=='object'||Array.isArray(step)||step.text!==undefined&&(typeof step.text!=='string'||step.text.length>600))throw Error('Ungültiger Übungsschritt.');
  if(step.kind==='shape'){if(!exact(step,['kind','type','as','text'])||!SHAPES.has(step.type))throw Error('Nicht freigegebene Übungsform.');add(step.as);}
  else if(step.kind==='set'){if(!exact(step,['kind','field','value','text'])||!['size-0','size-1','size-2','pos-0','pos-1','pos-2'].includes(step.field)||typeof step.value!=='number'||!Number.isFinite(step.value)||Math.abs(step.value)>10000||!/^[-]?(?:\d+)(?:\.\d{1,6})?$/.test(String(step.value))||step.field.startsWith('size-')&&step.value<=0||selected.length!==1)throw Error('Ungültiger Übungswert.');}
  else if(step.kind==='role'){if(!exact(step,['kind','value','text'])||!['solid','hole'].includes(step.value)||selected.length!==1)throw Error('Ungültige Übungsrolle.');}
  else if(step.kind==='select'){if(!exact(step,['kind','targets','text'])||!Array.isArray(step.targets)||!step.targets.length||step.targets.length>8||new Set(step.targets).size!==step.targets.length||step.targets.some(id=>!aliases.has(id)))throw Error('Ungültige Übungsauswahl.');selected=[...step.targets];}
  else if(step.kind==='group'){if(!exact(step,['kind','as','text'])||selected.length<2)throw Error('Ungültige Übungsgruppe.');for(const id of selected)aliases.delete(id);add(step.as);}
  else if(step.kind==='ui'){
   const needsValue=['set','choose','drag'].includes(step.action);
   if(needsValue&&typeof step.value==='string'&&step.value.length>200)throw Error(`Übungsschritt ${index+1}: value darf höchstens 200 Zeichen haben (erhalten: ${step.value.length}).`);
   if(!exact(step,['kind','action','target','value','text'])||!['click','point','set','choose','drag'].includes(step.action)||typeof step.target!=='string'||step.target.length>240||!/^(?:ui:(?:id|label|tool|menu|view):[^\r\n\x00]+|(?:menu|tool|view):[A-Za-z][A-Za-z0-9_-]{0,199})$/.test(step.target)||!step.target.startsWith('ui:label:')&&!/^(?:ui:)?(?:id|tool|menu|view):[A-Za-z][A-Za-z0-9_-]{0,199}$/.test(step.target)||needsValue&&typeof step.value!=='string'||!needsValue&&step.value!==undefined||step.text!==undefined&&(typeof step.text!=='string'||step.text.length>600))throw Error('Ungültige sichtbare Formnaro-Bedienung.');
  }
  else if(step.kind==='photo-points'){
   const {points,text}=step;
   if(!exact(step,['kind','points','text'])||!Array.isArray(points)||points.length<1||points.length>16||
    points.some(point=>!Array.isArray(point)||point.length!==2||point.some(n=>typeof n!=='number'||n<0||n>16000000||!/^\d+(?:\.\d{1,6})?$/.test(String(n))))||
    text!==undefined&&(typeof text!=='string'||text.length>600))throw Error('Ungültige Fotopunkte in Originalpixeln.');
  }
  else if(step.kind==='sketch-gesture'){if(!practiceSketchGesture(step))throw Error('Ungültige Skizzengeste.');}
  else if(step.kind==='face'){if(!exact(step,['kind','target','side','text'])||typeof step.target!=='string'||!/^[a-z][a-z0-9_-]{0,40}$/.test(step.target)||!['top','bottom','left','right','front','back'].includes(step.side)||step.text!==undefined&&(typeof step.text!=='string'||step.text.length>600))throw Error('Ungültige semantische Flächenauswahl.');}
  else if(step.kind==='edge'){const axis=s=>[['top','bottom'],['left','right'],['front','back']].findIndex(pair=>pair.includes(s));if(!exact(step,['kind','target','sides','text'])||typeof step.target!=='string'||!/^[a-z][a-z0-9_-]{0,40}$/.test(step.target)||!Array.isArray(step.sides)||step.sides.length!==2||step.sides.some(s=>axis(s)<0)||axis(step.sides[0])===axis(step.sides[1])||step.text!==undefined&&(typeof step.text!=='string'||step.text.length>600))throw Error('Ungültige semantische Kantenauswahl.');}
  else if(step.kind==='gear-snap'){if(!exact(step,['kind','moving','anchor','angle','text'])||![step.moving,step.anchor].every(v=>typeof v==='string'&&/^[a-z][a-z0-9_-]{0,40}$/.test(v))||step.moving===step.anchor||typeof step.angle!=='number'||!Number.isFinite(step.angle)||Math.abs(step.angle)>360||step.text!==undefined&&(typeof step.text!=='string'||step.text.length>600))throw Error('Ungültige Zahnrad-Ziehvorführung.');}
  else if(step.kind==='model'){if(!Array.isArray(step.commands)||step.commands.some(c=>!isPracticeUICommand(c)))throw Error('Im Übungsauftrag sind direkte Modellbefehle und Skripte gesperrt.');if(!exact(step,['kind','label','commands','checks'])||step.label!==undefined&&(typeof step.label!=='string'||step.label.length>200)||!Array.isArray(step.commands)||!step.commands.length||step.commands.length>200||step.commands.some(c=>!c||typeof c!=='object'||Array.isArray(c)||typeof c.op!=='string')||step.checks!==undefined&&(!Array.isArray(step.checks)||step.checks.length>64)||JSON.stringify(step).length>256000)throw Error('Ungültiger Modellierauftrag im Übungsprojekt.');if(step.checks!==undefined)validateAIResultChecks(step.checks);for(const command of step.commands)if(command.as!==undefined){if(typeof command.as!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(command.as)||used.has(command.as))throw Error('Ungültiger oder doppelter Übungsalias.');aliases.add(command.as);used.add(command.as);}}
  else throw Error('Nicht freigegebene Übungsaktion.');
 }
 assertPracticeToolSequence(plan.actions);
 return structuredClone(plan);
}
