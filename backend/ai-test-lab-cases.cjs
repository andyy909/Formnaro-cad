const {cases}=require('./ai-diagnostic-cases.cjs');
const {assemblyCase}=require('./ai-diagnostic-assembly.cjs');
// New task instances are held out from prompt tuning. Oracle data stays local.
function taskInstance(caseId,dataset='development'){
 const functional=require('./ai-practice-function-cases.cjs').functionTask(caseId,dataset);if(functional)return functional;
 const source=[...cases,assemblyCase].find(c=>c.id===caseId);if(!source)throw Error('Unbekannte Testaufgabe.');
 const task=structuredClone(source);task.dataset=dataset;
 if(dataset!=='holdout'){task.geometry={scale:1,origin:[0,0,0],title:'Diagnosekörper'};return task;}
 const s=1.25,o=[13,-9,5];task.geometry={scale:s,origin:o,title:'Abnahmekörper'};
 task.fixture=task.fixture.map(c=>c.name==='Unbeteiligtes Teil'?c:{...c,size:c.size.map(n=>n*s),pos:c.pos.map((n,i)=>n*s+o[i])});
 const prompts={
  thread:'Ersetze ausschließlich die ausgewählte senkrechte Welle durch drei koaxiale getrennte Körper: rechtsgängiges Trapez-Außengewinde Ø20, Steigung5, Länge50 mm von Welt-Z30 bis80; glatte Zapfen Ø20 und Länge25 mm von Z5 bis30 und von Z80 bis105. Gemeinsame Achse X13,Y−9. Gesamtlänge100 mm und Lage erhalten.',
  drill:'Bohre ausschließlich in die ausgewählte Platte50 ×37,5 ×10 mm eine durchgehende Bohrung Ø7,5 entlang Welt-Z bei X13,Y−9. Unterseite Z5, Oberseite Z15. Außenmaße, Lage und alle anderen Teile erhalten.',
  sketch:'Erzeuge eine bearbeitbare Skizzenplatte50 ×37,5 mm mit kreisförmiger Innenöffnung Ø12,5 und extrudiere6,25 mm. Außenrechteck und Loch haben die gemeinsame XY-Mitte13,−9. Unterseite Welt-Z5. Die native Skizzenquelle bearbeitbar erhalten.',
  pattern:'Erzeuge genau sechs getrennte Zylinder einschließlich des ausgewählten Originals, Ø7,5 ×12,5 mm, auf Radius25 um die senkrechte Achse X13,Y−9. Gleichmäßige60°-Abstände, gemeinsame Unterseite Z5. Das Original bei X38,Y−9 bleibt unverändert. Alle anderen Teile erhalten.',
  shell:'Höhle nur den ausgewählten Quader50 ×37,5 ×25 mm aus. XY-Mitte13,−9, Unterseite Welt-Z5, obere Fläche Z30 vollständig offen. Seitenwände und Boden jeweils2,5 mm nach innen. Außenmaße und Lage sowie alle anderen Teile erhalten.',
  drawing:'Erstelle ein A4-Blatt mit Vorder-, Drauf- und Seitenansicht des ausgewählten Körpers. Titelblocktitel: Abnahmekörper. Alle drei Projektionen nativ aktualisieren. Körpermaße25 ×32,5 ×40 mm, XY-Mitte13,−9 und Unterseite Z5 unverändert erhalten.'
 };
 if(caseId==='assembly'){
  // Independent translated/scaled assembly edit with every neighbour protected.
  task.prompt='Ändere nur die ausgewählte X-Antrieb-Welle von Ø20 auf Ø17,5 mm. Länge100 mm und Mittelpunkt X13,Y−9,Z55 erhalten. Alle22anderen Teile unverändert erhalten.';
 }else task.prompt=prompts[caseId];
 return task;
}
module.exports={taskInstance};
