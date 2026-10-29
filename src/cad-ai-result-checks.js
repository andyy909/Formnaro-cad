import {TARGET_SCHEMA} from './command-schema.js';

export const MAX_AI_RESULT_CHECKS=32;
export function aiProposalWarning(proposal){return proposal?.correctionError?.message||(proposal?.photoComparison?.some(r=>r.unavailable||r.matches===false)?'Fotovergleich: Abweichung oder Prüfung nicht vollständig.':'')||(proposal?.independentCheck?.passed===false?'FreeCAD meldet Geometriefehler.':proposal?.independentCheck?.status==='unavailable'?'FreeCAD-Prüfung nicht abgeschlossen: '+proposal.independentCheck.reason:'')||(['unavailable','incomplete'].includes(proposal?.visualReview?.status)?proposal.visualReview.reason||'Bildprüfung nicht abgeschlossen.':'');}
export function appendAIIndependentCheck(root,proposal,language='de'){
 const c=proposal?.independentCheck;if(!c||c.status==='not-applicable')return;const p=document.createElement('p');p.dataset.aiIndependentCheck='';
 p.textContent=c.passed===true?(language==='en'?'FreeCAD: exported geometry is valid. Dimensions require the separate checks.':'FreeCAD: Exportgeometrie gültig. Maßhaltigkeit wird durch die separaten Prüfungen belegt.'):c.passed===false?'FreeCAD: Geometriefehler im Export. Entwurf nur mit Warnung übernehmen.':'FreeCAD-Prüfung nicht abgeschlossen: '+c.reason;
 if(c.passed!==true)p.className='ai-error';root.append(p);
}
const vector={type:'array',minItems:3,maxItems:3,items:{type:'number',minimum:-100000,maximum:100000}};
const positive={type:'number',exclusiveMinimum:0,maximum:10000};
const definitions={
 bore:{required:['from','to','diameter'],properties:{from:vector,to:vector,diameter:positive,minWall:positive}},
 size:{required:['space','expected'],properties:{space:{enum:['edit','worldAxes']},expected:{...vector,items:positive}}},
 bounds:{required:['edge','expected'],properties:{edge:{enum:['min','max','center','size']},expected:vector}},
 volume:{required:['expected'],properties:{expected:{type:'number',exclusiveMinimum:0,maximum:1e12}}},
 solids:{required:['expected'],properties:{expected:{type:'integer',minimum:1,maximum:500}}},
 distance:{required:['other','expected'],properties:{other:TARGET_SCHEMA,expected:{type:'number',minimum:0,maximum:200000}}},
 surfaceDeviation:{required:['other','expected'],properties:{other:TARGET_SCHEMA,expected:{type:'number',minimum:0,maximum:1000},maxSamples:{type:'integer',minimum:1,maximum:12000}}},
 clearance:{required:['from','to','diameter'],properties:{from:vector,to:vector,diameter:positive}},
 radialClearance:{required:['other','from','to','expected'],properties:{other:TARGET_SCHEMA,from:vector,to:vector,expected:{type:'number',minimum:0,maximum:5},samples:{type:'integer',minimum:3,maximum:33}}}
};
export const AI_RESULT_CHECKS_SCHEMA={type:'array',maxItems:MAX_AI_RESULT_CHECKS,items:{oneOf:Object.entries(definitions).map(([kind,value])=>({type:'object',additionalProperties:false,required:['kind','target',...value.required],properties:{kind:{const:kind},target:TARGET_SCHEMA,...value.properties,...(['solids','surfaceDeviation'].includes(kind)?{}:{tolerance:{type:'number',minimum:0.000001,maximum:0.1}})}}))}};
function invalid(message){throw Object.assign(Error('Ungültige Ergebnisprüfung: '+message),{code:'AI_CHECK_INVALID'});}
function target(value){
 const id=v=>typeof v==='string'&&v.length>0&&v.length<=200;
 if(id(value))return;
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['rootId','path'].includes(k))||!id(value.rootId)||!Array.isArray(value.path)||value.path.length>12||!value.path.every(id))invalid('vollständiges Ziel oder eindeutigen Alias angeben.');
}
const vec=value=>Array.isArray(value)&&value.length===3&&value.every(v=>Number.isFinite(v)&&Math.abs(v)<=100000);
export function validateAIResultChecks(value=[]){
 if(!Array.isArray(value)||value.length>MAX_AI_RESULT_CHECKS)invalid('höchstens 32 Prüfungen angeben.');
 if(JSON.stringify(value).length>6000)invalid('Prüfauftrag ist größer als 6000 Zeichen.');
 for(const check of value){
  if(!check||typeof check!=='object'||Array.isArray(check)||!Object.hasOwn(definitions,check.kind))invalid('unbekannte Prüfart.');
  const definition=definitions[check.kind],allowed=['kind','target',...Object.keys(definition.properties),...(['solids','surfaceDeviation'].includes(check.kind)?[]:['tolerance'])];
  if(Object.keys(check).some(k=>!allowed.includes(k))||['target',...definition.required].some(k=>!Object.hasOwn(check,k)))invalid('fehlende oder unbekannte Felder.');
  target(check.target);if(['distance','radialClearance','surfaceDeviation'].includes(check.kind))target(check.other);
  if(check.kind==='surfaceDeviation'&&(!Number.isFinite(check.expected)||check.expected<0||check.expected>1000||!Number.isSafeInteger(check.maxSamples??12000)||(check.maxSamples??12000)<1||(check.maxSamples??12000)>12000))invalid('Oberflächenvergleich: 0 bis 1000 mm maximale Stichprobenabweichung und 1 bis 12.000 Stichprobendreiecke je Richtung wählen.');
  if(check.kind==='radialClearance'&&(!vec(check.from)||!vec(check.to)||Math.hypot(...check.to.map((v,k)=>v-check.from[k]))<.01||!Number.isFinite(check.expected)||check.expected<0||check.expected>5||!Number.isInteger(check.samples??9)||(check.samples??9)<3||(check.samples??9)>33))invalid('Radialspiel: Weltachse, 0 bis 5 mm Mindestspiel und 3 bis 33 Schnitte angeben.');
  if(check.tolerance!==undefined&&(!Number.isFinite(check.tolerance)||check.tolerance<1e-6||check.tolerance>.1))invalid('Toleranz muss zwischen 0,000001 und 0,1 liegen.');
  if(['size','bounds'].includes(check.kind)&&!vec(check.expected))invalid('drei endliche Sollwerte angeben.');
  if(check.kind==='size'&&(!['edit','worldAxes'].includes(check.space)||check.expected.some(v=>v<=0||v>10000)))invalid('Objektachsmaße und gültigen Maßraum angeben.');
  if(check.kind==='bounds'&&!['min','max','center','size'].includes(check.edge))invalid('min, max, center oder size wählen.');
  if(['volume','distance'].includes(check.kind)&&(!Number.isFinite(check.expected)||check.expected<(check.kind==='volume'?Number.MIN_VALUE:0)||check.expected>(check.kind==='volume'?1e12:200000)))invalid('endlichen Sollwert im Arbeitsbereich angeben.');
  if(check.kind==='solids'&&(!Number.isSafeInteger(check.expected)||check.expected<1||check.expected>500))invalid('1 bis 500 native Materialkörper angeben.');
  if(check.kind==='bore'&&(!Number.isFinite(check.minWall??.1)||(check.minWall??.1)<=2*(check.tolerance??.01)||(check.minWall??.1)>10000))invalid('Bohrung: minWall muss groesser als die doppelte Toleranz und hoechstens 10000 mm sein.');
  if(['clearance','bore'].includes(check.kind)){
   if(!vec(check.from)||!vec(check.to)||!Number.isFinite(check.diameter)||check.diameter<=0||check.diameter>10000)invalid('Weltpunkte und positiven freien Durchmesser angeben.');
   if(Math.hypot(...check.to.map((v,k)=>v-check.from[k]))<.01||check.diameter<=2*(check.tolerance??.01))invalid('Korridor zu kurz oder Durchmesser kleiner als Toleranz.');
  }
 }
 return structuredClone(value);
}
export function resolveAIResultTarget(scene,value,aliases={}){
 let address=value;
 if(typeof address==='string'&&address.startsWith('$')){
  const name=address.slice(1);if(!Object.hasOwn(aliases,name))invalid('Prüfalias fehlt: '+name);
  address=aliases[name];if(Array.isArray(address))invalid('Prüfalias bezeichnet mehrere Teile.');
 }
 if(typeof address==='string')address={rootId:address,path:[]};
 target(address);
 const object=scene.objects.find(n=>n.target.rootId===address.rootId&&JSON.stringify(n.target.path)===JSON.stringify(address.path));
 if(!object)invalid('Prüfziel ist im berechneten Ergebnis nicht vorhanden.');
 if(object.suppressed||scene.objects.some(n=>n.suppressed&&n.target.rootId===object.target.rootId&&n.target.path.length<object.target.path.length&&n.target.path.every((id,k)=>object.target.path[k]===id)))invalid('Unterdrückte Quellen sind kein fertiges Prüfergebnis.');
 return object;
}
export function aiCheckFailure(check,index,actual){
 const expected=check.kind==='clearance'?0:check.kind==='bore'?{diameter:check.diameter,from:check.from,to:check.to,minWall:check.minWall??.1}:check.expected;
 if(check.kind==='surfaceDeviation')return Object.assign(Error(`Ergebnisprüfung ${index} (surfaceDeviation) fehlgeschlagen: maximale Stichprobenabweichung ${actual.sampledMaximum} mm über ${expected} mm. Die größten gemessenen Abweichungen stehen in actual.directions[].worst. Keine globale Fehlergarantie.`),{code:'AI_RESULT_MISMATCH',feedback:{checkIndex:index,checkKind:check.kind,target:check.target,expected,actual,retryable:true}});
 const message=check.kind==='radialClearance'?`Ergebnisprüfung ${index} (radialClearance) konnte das Mindestspiel ${check.expected} mm nicht bestätigen: konservative Untergrenze ${actual.minimumGapLowerBound} mm, Schnitt-Untergrenze ${actual.sampledMinimumGapLowerBound} mm.`:check.kind==='clearance'?`Ergebnisprüfung ${index} (clearance) fehlgeschlagen: Korridor Ø ${check.diameter} mm enthält noch ${actual} mm³ Material.`:`Ergebnisprüfung ${index} (${check.kind}) fehlgeschlagen: Soll ${JSON.stringify(expected)}, Ist ${JSON.stringify(actual)}.`;
 return Object.assign(Error(message),{code:'AI_RESULT_MISMATCH',feedback:{checkIndex:index,checkKind:check.kind,target:check.target,expected,actual,tolerance:check.kind==='solids'?0:check.tolerance??.01,retryable:true}});
}
export function aiVerificationText(verification,language='de'){
 const count=verification?.checks?.length??0;
 const failed=verification?.checks?.filter(c=>c.passed===false).length??0;
 if(failed)return language==='en'?`${failed} of ${count} result checks failed or could not be measured. Review the preview; you can discard it or apply with errors.`:`${failed} von ${count} Ergebnisprüfungen fehlgeschlagen oder nicht messbar. Vorschau prüfen und verwerfen oder mit Fehlern übernehmen.`;
 return language==='en'?(count?`${count} result check${count===1?'':'s'} passed. Only the listed requirements were measured.`:'No dimensional result checks supplied.'):(count?`${count} Ergebnisprüfung${count===1?'':'en'} bestanden. Gemessen wurden nur die aufgeführten Anforderungen.`:'Keine zusätzlichen Sollmaßprüfungen angegeben.');
}
export function appendAIVerification(root,verification,scene,language='de',doc=globalThis.document){
 const policy=verification?.modellingPolicy;if(policy){const line=doc.createElement('p');line.textContent=language==='en'?`Modelling strictness ${policy.strictness}/100: ${policy.accepted?'within selected allowance':'outside selected allowance'}. Original measured results remain listed below.`:`Modellstrenge ${policy.strictness}/100: ${policy.accepted?'innerhalb des gewählten Spielraums':'außerhalb des gewählten Spielraums'}. Ursprüngliche Messbefunde stehen weiterhin darunter.`;root.append(line);}
 const english=language==='en',note=doc.createElement('p');note.textContent=aiVerificationText(verification,language);root.append(note);
 if(verification?.passed===false){note.className='ai-error';const legend=doc.createElement('p');legend.textContent=english?'Red: measured surface sample deviations, or the affected part for other checks. This is not a complete error map.':'Rot: gemessene Abweichungsstellen an der Oberfläche; bei anderen Prüfungen das betroffene Teil. Keine vollständige Fehlerkarte.';root.append(legend);}
 if(!verification?.checks?.length)return;
 const details=doc.createElement('details'),summary=doc.createElement('summary'),list=doc.createElement('ul');summary.textContent=english?'Show measured requirements':'Geprüfte Anforderungen anzeigen';details.append(summary,list);
 const labels=english?{size:'Object dimensions',bounds:'World bounds',volume:'Volume',solids:'Material bodies',distance:'Minimum distance',clearance:'Free corridor'}:{size:'Objektachsmaße',bounds:'Weltbegrenzung',volume:'Volumen',solids:'Materialkörper',distance:'Mindestabstand',clearance:'Freier Korridor'};
 const number=value=>Array.isArray(value)?value.map(number).join(' × '):Number(value).toLocaleString(english?'en-US':'de-DE',{useGrouping:false,maximumFractionDigits:6});
 for(const check of verification.checks){const item=doc.createElement('li'),object=scene?.objects?.find(n=>n.target.rootId===check.target.rootId&&JSON.stringify(n.target.path)===JSON.stringify(check.target.path));item.dataset.noTranslate='';if(check.passed===false){item.className='ai-error';item.textContent=`${object?.name??''}: ${english?'Failed / unavailable':'Fehlgeschlagen / nicht messbar'} · ${check.error?.message??check.kind}`;list.append(item);continue;}if(check.kind==='bore'){item.textContent=`${object?.name??''}: ${english?'Bore':'Bohrung'} Ø ${number(check.actual.diameter)} mm · ${english?'cylindrical depth':'zylindrische Tiefe'} ${number(check.actual.depth)} mm · ${english?'surrounding material':'umgebendes Material'} ≥ ${number(check.actual.minWall)} mm`;list.append(item);continue;}if(check.kind==='surfaceDeviation'){item.textContent=`${object?.name??''}: ${english?'Sampled surface deviation':'Oberflächenabweichung in Stichproben'} ${number(check.actual.sampledMaximum)} mm · ${english?'allowed maximum':'erlaubtes Maximum'} ${number(check.expected)} mm · ${english?'no global guarantee':'keine globale Fehlergarantie'}`;list.append(item);continue;}if(check.kind==='radialClearance'){item.textContent=`${object?.name??''}: ${english?'Radial gap lower bound':'Radialspiel-Untergrenze'} ${number(check.actual.minimumGapLowerBound)} mm · ${english?'required minimum':'gefordertes Minimum'} ${number(check.expected)} mm · ${check.actual.samples} ${english?'section planes; continuous slab verification':'Schnittebenen; Zwischenhöhen durchgehend geprüft'} · ± ${number(check.tolerance)} mm`;list.append(item);continue;}if(check.kind==='bore'&&(!Number.isFinite(check.minWall??.1)||(check.minWall??.1)<=2*(check.tolerance??.01)||(check.minWall??.1)>10000))invalid('Bohrung: minWall muss groesser als die doppelte Toleranz und hoechstens 10000 mm sein.');
  if(['clearance','bore'].includes(check.kind)){item.textContent=`${object?.name??''}: ${labels.clearance} · ${english?'minimum free diameter':'freier Mindestdurchmesser'} ${number(check.actual.diameterChecked)} mm · ${english?'requested':'gewünscht'} ${number(check.expected)} mm · ${english?'radial allowance':'radialer Spielraum'} ${number(check.tolerance)} mm`;list.append(item);continue;}item.textContent=`${object?.name??''}: ${labels[check.kind]}${check.edge?' ('+check.edge+')':''} · ${english?'expected':'Soll'} ${number(check.expected)} · ${english?'measured':'Ist'} ${number(check.kind==='clearance'?check.actual.diameterChecked:check.actual)}${check.kind==='solids'?'':` · ± ${number(check.tolerance)} ${check.kind==='volume'?'mm³':'mm'}`}`;list.append(item);}
 root.append(details);
}
