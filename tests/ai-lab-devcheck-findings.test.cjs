const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const load=()=>import('../ai/lab-development-findings.mjs');
const fixture=name=>JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','development-check',name+'.json'),'utf8'));
test('Die deutschen Ergebnisgründe decken alle fünf bekannten Gründe ab',async()=>{
 const {developmentReasonLabels}=await load();
 assert.deepEqual(Object.keys(developmentReasonLabels).sort(),['checker-error','interrupted','model-identity','needs-input','not-started']);
 assert.equal(developmentReasonLabels['needs-input'],'Rückfrage des Agenten');
 assert.equal(developmentReasonLabels['checker-error'],'Prüferfehler');
 assert.equal(developmentReasonLabels.interrupted,'unterbrochen');
 assert.equal(developmentReasonLabels['model-identity'],'Modellkennung abweichend');
 assert.equal(developmentReasonLabels['not-started'],'nicht gestartet');
});
test('Prüferrückmeldungen tragen die Runde der fehlgeschlagenen nativen Prüfung',async()=>{
 const {feedbackRounds}=await load();
 assert.deepEqual(feedbackRounds(fixture('advanced-02')),[1]);
 assert.deepEqual(feedbackRounds(fixture('advanced-05')),[1]);
 assert.deepEqual(feedbackRounds(fixture('drill')),[]);
});
test('Kurzzeile zählt ersten Versuch, Prüferhinweis und offene Fälle',async()=>{
 const {developmentSummaryText}=await load();
 const outcomes=[
  {caseId:'advanced-01',status:'blocked',reason:'needs-input'},
  {caseId:'advanced-02',status:'passed',firstTry:false},
  {caseId:'advanced-05',status:'passed',firstTry:false},
  {caseId:'advanced-07',status:'passed',firstTry:true},
  {caseId:'drill',status:'passed',firstTry:true},
 ];
 const report={phases:[{effort:'low',caseIds:outcomes.map(outcome=>outcome.caseId),outcomes}]};
 assert.equal(developmentSummaryText(report),'Bestanden: 2 im ersten Versuch, 2 nach Prüferhinweis, 1 offen');
});
test('A confirmed failure is counted separately from an unresolved task',async()=>{
 const {developmentFindings,developmentSummaryText}=await load();
 const record=fixture('drill');
 record.verification.passed=false;
 const report={phases:[{effort:'low',caseIds:['drill','shell'],outcomes:[{caseId:'drill',status:'failed',runId:record.id}]}]};
 assert.match(developmentSummaryText(report),/1 durchgefallen, 1 offen/);
 assert.deepEqual(developmentFindings(report,[record]).summary,{
  passedFirstTry:0,passedAfterFeedback:0,failed:1,open:1,byReason:{'native-mismatch':1,'not-started':1},
 });
});
test('Alter Bericht ohne firstTry wird nicht als erster Versuch gezählt',async()=>{
 const {developmentSummaryText}=await load();
 const report={phases:[{effort:'low',caseIds:['drill'],outcomes:[{caseId:'drill',status:'passed'}]}]};
 assert.equal(developmentSummaryText(report),'Bestanden: 0 im ersten Versuch, 0 nach Prüferhinweis, 0 offen · 1 ohne Angabe');
});
test('Eine eskalierte Aufgabe zählt einmal als bestanden',async()=>{
 const {developmentSummaryText}=await load();
 const report={phases:[
  {effort:'low',caseIds:['advanced-02'],outcomes:[{caseId:'advanced-02',status:'failed'}]},
  {effort:'high',caseIds:['advanced-02'],outcomes:[{caseId:'advanced-02',status:'passed',firstTry:true}]},
 ]};
 assert.equal(developmentSummaryText(report),'Bestanden: 1 im ersten Versuch, 0 nach Prüferhinweis, 0 offen');
});
test('Eckdaten eines Laufs kommen aus den Ereignissen',async()=>{
 const {runFacts}=await load();
 assert.deepEqual(runFacts(fixture('advanced-01')),{
  caseId:'advanced-01',runId:'28ba5f84-f2ed-441a-bf73-fba6e7c977bf',effort:'low',status:'needs-input',seconds:16.8,requests:1,
  tokens:{input:6654,output:1734},
  failedChecks:['Sichtbare Ausführung abgeschlossen','Unabhängig berechnetes Materialvolumen','Native Gegenprüfung ausführbar'],
 });
 const drill=runFacts(fixture('drill'));
 assert.equal(drill.caseId,'drill');
 assert.equal(drill.status,'completed');
 assert.deepEqual(drill.failedChecks,[]);
 assert.ok(drill.tokens.input>0&&drill.tokens.output>0);
});
test('Fehlende Tokenwerte bleiben null statt 0',async()=>{
 const {runFacts}=await load();
 const facts=runFacts({id:'x',spec:{caseId:'drill',effort:'low'},status:'completed',elapsedMs:1000,events:[{type:'usage',usage:{}}]});
 assert.deepEqual(facts.tokens,{input:null,output:null});
});
test('Formatkorrekturen werden mit gekürztem Fehlertext gesammelt',async()=>{
 const {formatFeedback}=await load();
 const lists=formatFeedback(fixture('advanced-07'));
 assert.equal(lists.length,1);
 assert.ok(lists[0].includes('plan.title ist zu lang'));
 assert.deepEqual(formatFeedback(fixture('drill')),[]);
 const long=formatFeedback({events:[{type:'format-feedback',error:'x'.repeat(300)}]});
 assert.equal(long[0].length,200);
});
test('Erste Aktion nennt Denkzeit, Zeitpunkt des Vorschlags und die ersten Schritte',async()=>{
 const {firstAction}=await load();
 const missing=firstAction(fixture('advanced-01'));
 assert.equal(missing.reasoningMs,2471);
 assert.equal(missing.firstProposalMs,null);
 assert.deepEqual(missing.firstStepKinds,[]);
 const drill=firstAction(fixture('drill'));
 assert.equal(drill.firstProposalMs,8493);
 assert.deepEqual(drill.firstStepKinds,['select','ui','ui','ui','ui']);
});
test('Kontextlücken sammeln Rückfrage, Formatregeln und Werkzeugauskünfte',async()=>{
 const {contextGaps}=await load();
 const gaps=contextGaps(fixture('advanced-01'));
 assert.equal(gaps.filter(gap=>gap.kind==='rueckfrage').length,1);
 assert.ok(gaps.find(gap=>gap.kind==='rueckfrage').text.includes('Bohrachse'));
 assert.ok(gaps.every(gap=>typeof gap.text==='string'&&gap.text.length<=600));
 const seven=contextGaps(fixture('advanced-07'));
 assert.equal(seven.length,1);
 assert.equal(seven[0].kind,'formatregel');
 assert.ok(seven[0].text.includes('plan.title'));
 const withTool=contextGaps({status:'completed',events:[{type:'tool-call',tool:'offlinecad_tool_info',arguments:'ui:tool:drill'}]});
 assert.deepEqual(withTool,[{kind:'werkzeugauskunft',text:'ui:tool:drill'}]);
});
test('Erstreaktion auf den Startkontext wird mit Hinweisflaggen erfasst',async()=>{
 const {firstContextReaction}=await load();
 const reaction=firstContextReaction(fixture('advanced-01'));
 assert.equal(reaction.untrusted,true);
 assert.equal(typeof reaction.excerpt,'string');
 assert.ok(reaction.excerpt.length<=800);
 assert.ok(reaction.flags.includes('szene-leer'),'Szene leer erkennen');
 assert.ok(!firstContextReaction({events:[]}).excerpt);
 assert.deepEqual(firstContextReaction({events:[]}),{excerpt:null,flags:[],untrusted:true});
 const german=firstContextReaction({events:[{type:'reasoning',text:'Die Szene ist leer, das ist ein Widerspruch.'}]});
 assert.deepEqual(german.flags,['szene-leer','widerspruch']);
});
test('Befundblatt fasst alle Teile eines Laufs mit einheitlichen Schlüsseln zusammen',async()=>{
 const {runFinding}=await load();
 const {developmentOutcome}=await import('../ai/lab-development-sequence.mjs');
 const findings=Object.fromEntries(['advanced-01','advanced-02','advanced-05','advanced-07','drill'].map(name=>{
  const record=fixture(name);
  return [name,runFinding(record,developmentOutcome(record))];
 }));
 const keys=Object.keys(findings.drill).sort();
 for(const name of Object.keys(findings))assert.deepEqual(Object.keys(findings[name]).sort(),keys,name+' hat andere Schlüssel');
 assert.deepEqual(keys,['caseId','contextGaps','effort','failedChecks','feedbackRounds','firstAction','firstContextReaction','firstTry','formatFeedback','outcome','requests','runId','seconds','status','tokens']);
 assert.equal(findings['advanced-01'].outcome.reason,'needs-input');
 assert.equal(findings['advanced-02'].firstTry,false);
 assert.equal(findings.drill.firstTry,true);
 assert.ok(findings['advanced-01'].firstContextReaction.flags.includes('szene-leer'));
});
test('Symptomschlüssel nennt Zählunterschied und deckungsgleiche Körper',async()=>{
 const {symptomKey,runSymptoms}=await load();
 const feedback=fixture('advanced-02').events.find(event=>event.type==='practice-ui-feedback');
 const body=feedback.verification.checks.find(check=>!check.passed&&check.actual?.actual?.count);
 assert.equal(symptomKey(body),'Genau ein Körper mit richtigen Außenmaßen und Lage: 2 statt 1, deckungsgleich');
 const volume=feedback.verification.checks.find(check=>check.name==='Unabhängig berechnetes Materialvolumen');
 assert.equal(symptomKey(volume),'Unabhängig berechnetes Materialvolumen: 28000 statt 24352');
 assert.equal(symptomKey({name:'Zwei getrennte rechteckige Durchbrüche und Materialstege',passed:false}),'Zwei getrennte rechteckige Durchbrüche und Materialstege');
 const distinct=symptomKey({name:'Genau ein Körper mit richtigen Außenmaßen und Lage',actual:{actual:{count:2,bodies:[{size:[70,50,8],center:[7,-9,8]},{size:[70,50,9],center:[7,-9,8]}]},expected:{count:1}}});
 assert.equal(distinct,'Genau ein Körper mit richtigen Außenmaßen und Lage: 2 statt 1');
 const symptoms=runSymptoms(fixture('advanced-02'));
 assert.ok(symptoms.includes('Genau ein Körper mit richtigen Außenmaßen und Lage: 2 statt 1, deckungsgleich'));
 assert.equal(new Set(symptoms).size,symptoms.length);
 assert.deepEqual(runSymptoms(fixture('drill')),[]);
});
test('Muster über Aufgaben nennt den deckungsgleichen Doppelkörper in advanced-02 und advanced-05',async()=>{
 const {runSymptoms,findPatterns}=await load();
 const findings=['advanced-02','advanced-05'].map(name=>{const record=fixture(name);return {caseId:name,runId:record.id,symptoms:runSymptoms(record)}});
 const patterns=findPatterns(findings);
 assert.equal(patterns.length,1);
 assert.equal(patterns[0].key,'Genau ein Körper mit richtigen Außenmaßen und Lage: 2 statt 1, deckungsgleich');
 assert.deepEqual(patterns[0].caseIds,['advanced-02','advanced-05']);
 assert.equal(patterns[0].runIds.length,2);
 assert.equal(patterns[0].hint,'Gleiches Symptom in mehreren Aufgaben: mögliche Programmursache');
});
test('Ein Symptom in nur einer Aufgabe ist kein Muster',async()=>{
 const {findPatterns}=await load();
 assert.deepEqual(findPatterns([{caseId:'advanced-07',runId:'r1',symptoms:['Zwei getrennte rechteckige Durchbrüche und Materialstege']}]),[]);
});
test('Erstreaktions-Muster ab einem Drittel der Läufe, mit Hinweis',async()=>{
 const {contextReactionPatterns}=await load();
 const findings=[{firstContextReaction:{flags:['szene-leer']}},{firstContextReaction:{flags:['szene-leer']}},{firstContextReaction:{flags:[]}}];
 assert.deepEqual(contextReactionPatterns(findings),[{flag:'szene-leer',count:2,total:3,hint:'Startkontext prüfen',untrusted:true}]);
 const boundary=contextReactionPatterns([{firstContextReaction:{flags:['unklar']}},{firstContextReaction:{flags:[]}},{firstContextReaction:{flags:[]}}]);
 assert.equal(boundary.length,1);
 assert.equal(boundary[0].flag,'unklar');
 assert.deepEqual(contextReactionPatterns([]),[]);
});
test('Gesamtbefund verbindet Bericht, Läufe, Muster und Kontextlücken',async()=>{
 const {developmentFindings}=await load();
 const order=['advanced-01','advanced-02','advanced-05','advanced-07','drill'];
 const records=order.map(fixture);
 const outcomes=[
  {caseId:'advanced-01',runId:records[0].id,status:'blocked',reason:'needs-input'},
  {caseId:'advanced-02',runId:records[1].id,status:'passed',firstTry:false},
  {caseId:'advanced-05',runId:records[2].id,status:'passed',firstTry:false},
  {caseId:'advanced-07',runId:records[3].id,status:'passed',firstTry:true},
  {caseId:'drill',runId:records[4].id,status:'passed',firstTry:true},
 ];
 const report={id:'f14586d9-dfd7-48f6-8869-f7309ca43f20',model:'deepseek-flash',setup:{levels:['low']},sourceHash:'f60b86cb1234567890',phases:[{effort:'low',caseIds:order,outcomes}]};
 const findings=developmentFindings(report,records);
 assert.equal(findings.format,'FormnaroDevelopmentFindings');
 assert.equal(findings.version,1);
 assert.deepEqual(findings.check,{id:report.id,model:'deepseek-flash',levels:['low'],sourceHash:'f60b86cb1234567890'});
 assert.deepEqual(findings.summary,{passedFirstTry:2,passedAfterFeedback:2,failed:0,open:1,byReason:{'needs-input':1}});
 assert.equal(findings.runs.length,5);
 assert.equal(findings.patterns.length,1);
 assert.equal(findings.contextReactions.length,1);
 assert.equal(findings.contextReactions[0].flag,'szene-leer');
 assert.equal(findings.contextReactions[0].count,3);
 assert.equal(findings.contextGaps.length,4);
 assert.ok(findings.contextGaps.every(gap=>gap.runId&&gap.caseId&&gap.kind));
});
test('Markdown-Kurzbericht hat Kopf, Tabelle, Abschnitte und Schlusssatz',async()=>{
 const {developmentFindings,findingsMarkdown}=await load();
 const order=['advanced-01','advanced-02','advanced-05','advanced-07','drill'];
 const records=order.map(fixture);
 const outcomes=[
  {caseId:'advanced-01',runId:records[0].id,status:'blocked',reason:'needs-input'},
  {caseId:'advanced-02',runId:records[1].id,status:'passed',firstTry:false},
  {caseId:'advanced-05',runId:records[2].id,status:'passed',firstTry:false},
  {caseId:'advanced-07',runId:records[3].id,status:'passed',firstTry:true},
  {caseId:'drill',runId:records[4].id,status:'passed',firstTry:true},
 ];
 const report={id:'f14586d9-dfd7-48f6-8869-f7309ca43f20',model:'deepseek-flash',setup:{levels:['low']},sourceHash:'f60b86cb1234567890',phases:[{effort:'low',caseIds:order,outcomes}]};
 const md=findingsMarkdown(developmentFindings(report,records));
 assert.match(md,/^# Entwicklungsbefund/m);
 assert.match(md,/Modell: deepseek-flash/);
 assert.match(md,/Stufen: low/);
 assert.match(md,/Quellstand: f60b86cb/);
 assert.match(md,/^\| Aufgabe \| Ergebnis \| 1\. Versuch \| Grund \| Sekunden \| Tokens \|$/m);
 assert.match(md,/^\| advanced-02 \| Bestanden nach Prüferhinweis \| nein \| – \| 116\.4 \| 19948 \/ 6148 \|$/m);
 assert.match(md,/^## Kontextlücken$/m);
 assert.match(md,/^## Muster über Aufgaben$/m);
 assert.match(md,/^## Erstreaktion auf den Kontext$/m);
 assert.ok(md.trimEnd().endsWith('Denktexte sind Hinweise, keine Belege. Bewertungen stammen aus den CAD-Prüfungen.'));
 const piped=findingsMarkdown({check:{},runs:[{caseId:'a|b',runId:'r1',outcome:{status:'passed',firstTry:true},tokens:{input:1,output:2},seconds:1}]});
 const row=piped.split('\n').find(line=>line.includes('a\\|b'));
 assert.ok(row,'Zeile mit maskiertem Namen');
 assert.equal((row.match(/(?<!\\)\|/g)??[]).length,7,'sechs Spalten ergeben sieben unmaskierte Striche');
});
test('Frühere Stufen bleiben in den Befunden, die Zusammenfassung zählt je Aufgabe einmal',async()=>{
 const {developmentFindings,findingsMarkdown}=await load();
 const clone=value=>JSON.parse(JSON.stringify(value));
 const low02=clone(fixture('advanced-02'));
 low02.id='00000000-0000-4000-8000-000000000001';
 low02.spec.effort='low';
 low02.verification={...low02.verification,passed:false};
 const high02=clone(fixture('advanced-02'));
 high02.id='00000000-0000-4000-8000-000000000002';
 high02.spec.effort='high';
 high02.events=high02.events.filter(event=>event.type!=='practice-ui-feedback');
 const low05=fixture('advanced-05');
 const report={id:'f14586d9-dfd7-48f6-8869-f7309ca43f20',model:'deepseek-flash',setup:{levels:['low','high']},sourceHash:'f60b86cb1234567890',phases:[
  {effort:'low',caseIds:['advanced-02','advanced-05'],outcomes:[{caseId:'advanced-02',runId:low02.id,status:'failed'},{caseId:'advanced-05',runId:low05.id,status:'passed',firstTry:false}]},
  {effort:'high',caseIds:['advanced-02'],outcomes:[{caseId:'advanced-02',runId:high02.id,status:'passed',firstTry:true}]},
 ]};
 // Deliberately unordered input: the high attempt comes first.
 const findings=developmentFindings(report,[high02,low05,low02]);
 assert.equal(findings.runs.length,3);
 assert.deepEqual(findings.runs.map(run=>[run.runId,run.effort,run.decisive]),[[low02.id,'low',false],[low05.id,'low',true],[high02.id,'high',true]]);
 assert.deepEqual(findings.summary,{passedFirstTry:1,passedAfterFeedback:1,failed:0,open:0,byReason:{}});
 assert.equal(findings.patterns.length,1,'Doppelkörper aus der Low-Stufe bleibt als Muster erhalten');
 assert.deepEqual(findings.patterns[0].caseIds.sort(),['advanced-02','advanced-05']);
 assert.ok(findings.patterns[0].runIds.includes(low02.id));
 const md=findingsMarkdown(findings);
 assert.match(md,/^\| advanced-02 \| Bestanden \(1\. Versuch\) \| ja \|/m);
 assert.equal(md.split('\n').filter(line=>line.startsWith('| advanced-02 ')).length,1,'eine Tabellenzeile je Aufgabe');
 assert.match(md,/^## Frühere Stufen$/m);
 assert.match(md,/^- advanced-02 · low: Durchgefallen · Symptome: .*2 statt 1, deckungsgleich/m);
});
test('Antwortschema für die auswertende KI ist gültiges JSON mit allen Pflichtfeldern',()=>{
 const schema=JSON.parse(fs.readFileSync(path.join(__dirname,'..','ai','lab-development-review-schema.json'),'utf8'));
 assert.equal(schema.type,'array');
 const item=schema.items;
 for(const field of ['runIds','pattern','beleg','bereich','ursache','vermutung','vorschlag','nachtest'])assert.ok(item.required.includes(field),'Pflichtfeld fehlt: '+field);
 assert.deepEqual(item.properties.bereich.enum,['modell','kontext','programm','aufgabe','pruefer']);
 assert.ok(Array.isArray(item.anyOf)&&item.anyOf.length===2,'runIds oder pattern');
});
test('Hinweiszeile für die Oberfläche nennt Lücken, Muster und Erstreaktion',async()=>{
 const {developmentHintsText}=await load();
 assert.equal(developmentHintsText({contextGaps:[{},{},{},{}],patterns:[{}],contextReactions:[{flag:'szene-leer',count:3,total:5}]}),'Kontextlücken: 4 · Muster: 1 · Erstreaktion: szene-leer in 3 von 5 Läufen');
 assert.equal(developmentHintsText({}),'Keine Hinweise aus den Befunden.');
});
