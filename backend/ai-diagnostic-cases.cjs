const protectedPart={op:'create',type:'box',name:'Unbeteiligtes Teil',size:[7,9,11],pos:[150,0,5.5]};
const cases=[
 {id:'thread',label:'Trapezgewinde',toolIds:['tool:properties'],fixture:[{op:'create',type:'cylinder',name:'Welle',size:[16,16,80],pos:[0,0,40]}],prompt:'Ersetze die ausgewählte senkrechte Welle durch drei koaxiale Teile: mittig ein rechtsgängiges Trapez-Außengewinde Ø16, Steigung4, Länge40 mm (Z20 bis60), an beiden Enden glatte Zapfen Ø16 ×20 mm. Gesamtlänge80 mm und Lage erhalten. Drei getrennte Körper sind ausdrücklich gewünscht. Werkzeugdaten für kind:model, create type thread: params.kind=external, params.profile=trapezoid, params.hand=right. Eingaben für Nenndurchmesser, Steigung und Gewindelänge heißen diameter, pitch und length. Verwende die echten Feldnamen.'},
 {id:'drill',label:'Bohrung',fixture:[{op:'create',type:'box',name:'Platte',size:[40,30,8],pos:[0,0,4]}],prompt:'Bohre mittig eine durchgehende Bohrung Ø6 mm entlang Welt-Z in die ausgewählte Platte40 ×30 ×8 mm. Außenmaße und Lage erhalten.'},
 {id:'sketch',label:'Skizze mit Öffnung',fixture:[],prompt:'Erstelle aus einer Skizze eine rechteckige Platte40 ×30 mm mit mittiger kreisförmiger Innenöffnung Ø10 mm und extrudiere sie5 mm. Mittelpunkt in X/Y0, Unterseite Z0. Die Skizzenquelle muss bearbeitbar erhalten bleiben.'},
 {id:'pattern',label:'Kreismuster',toolIds:['tool:array'],fixture:[{op:'create',type:'cylinder',name:'Ausgangsteil',size:[6,6,10],pos:[20,0,5]}],prompt:'Erzeuge ein Kreismuster aus sechs getrennten Zylindern einschließlich des ausgewählten Ausgangsteils. Mittelpunkte auf Radius20 mm um die Welt-Z-Achse, gleiche Winkelabstände60°, Höhe/Lage Z wie Ausgangsteil. Ausgangsteil bei X20,Y0 erhalten. Ausgangskörper der Übung: Ø6 mm, Höhe10 mm, Weltmitte (20,0,5), Unterseite Z0.'},
 {id:'shell',label:'Aushöhlen',toolIds:['tool:cad-shell'],fixture:[{op:'create',type:'box',name:'Gehäuse',size:[40,30,20],pos:[0,0,10]}],prompt:'Höhle den ausgewählten Quader40 ×30 ×20 mm aus. Obere Fläche bei Z20 offen, Wand und Boden2 mm. Außenmaße und Lage erhalten.'},
 {id:'drawing',label:'Technische Zeichnung',toolIds:['tool:drawing'],fixture:[{op:'create',type:'box',name:'Zeichnungskörper',size:[20,26,32],pos:[0,0,16]}],prompt:'Erstelle ein technisches A4-Zeichnungsblatt mit Vorder-, Drauf- und Seitenansicht des ausgewählten Körpers. Titel im Titelblock: Diagnosekörper. Alle drei Ansichten nativ aktualisieren. Körper unverändert erhalten. Der ausgewählte Zeichnungskörper ist als existing-1 in practiceObjects verfügbar.'},
];
for(const c of cases)c.fixture=[...c.fixture,protectedPart];
const efforts=['low','high','max'];
function matrix(stage,winners={}){const list=[];for(let repeat=0;repeat<(stage==='full'?2:1);repeat++)for(let task=0;task<cases.length;task++)for(let level=0;level<efforts.length;level++){
 const effort=efforts[level],variants=stage==='full'?['A',winners[effort]??'B']:['A','B','C'];
 const shift=(task+level+repeat)%variants.length;
 for(let i=0;i<variants.length;i++)list.push({caseId:cases[task].id,variant:variants[(i+shift)%variants.length],effort,stage,repeat});
}return list;}
function visionMatrix(winners={}){return cases.flatMap((task,i)=>efforts.flatMap((effort,j)=>( (i+j)%2?[true,false]:[false,true]).map(startImage=>({caseId:task.id,variant:winners[effort]??'C',effort,stage:'start',repeat:0,experiment:'vision',startImage}))));}
module.exports={cases,efforts,matrix,visionMatrix};
