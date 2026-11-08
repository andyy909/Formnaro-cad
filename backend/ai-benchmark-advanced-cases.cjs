// Fixed multi-step tasks. Local oracle/reference construction lives in a separate module.
const create=(type,name,size,pos,extra={})=>({op:'create',type,name,size,pos,...extra});
const box=(size,pos=[10,-5,size[2]/2],extra={})=>create('box','Aufgabenteil',size,pos,extra);
const definitions=[
 {id:'advanced-01',label:'Asymmetrisches Bohrbild',toolIds:['tool:drill'],
  fixture:[box([60,40,10],[10,-5,10])],
  prompt:'Bearbeite nur die Platte 60×40×10 mm, Weltmitte (10,−5,10), Unterseite Z5, Oberseite Z15. Erzeuge drei durchgehende Welt-Z-Bohrungen: Ø8 bei X−8,Y−15; Ø6 bei X24,Y−15; Ø10 bei X10,Y6. Alle drei Durchmesser und Positionen gleichzeitig erfüllen; Außenmaße und Lage erhalten.'},
 {id:'advanced-02',label:'Zwei versetzte Durchbrüche',toolIds:['tool:group'],
  fixture:[box([70,50,8],[7,-9,8])],
  prompt:'Erzeuge in der Platte 70×50×8 mm mit Weltmitte (7,−9,8), Z4 bis Z12, zwei getrennte rechteckige Durchbrüche parallel zu Welt-X/Y: 18×12 mm bei XY-Mitte (−10,−14) und 12×20 mm bei (24,−4). Beide vollständig durchgehend. Die zwei Öffnungen getrennt halten; Außenmaße, Lage und Material dazwischen erhalten.'},
 {id:'advanced-03',label:'Gebohrte Hülsen im versetzten Muster',toolIds:['tool:drill','tool:array'],
  fixture:[create('cylinder','Aufgabenteil',[10,10,12],[37,7,9])],
  prompt:'Bohre den vorhandenen Zylinder Ø10×12 mm, Mitte (37,7,9), koaxial durchgehend Ø4. Erzeuge daraus insgesamt acht getrennte identische Hülsen einschließlich des gebohrten Originals. Die Mittelpunkte liegen auf Radius30 um die Welt-Z-Achse X7,Y7, Z-Mitte9, gleichmäßig alle45°. Das Original bei (37,7,9) gibt den Startwinkel0° vor. Jede Hülse reicht von Z3 bis15 und muss dieselbe echte Durchgangsbohrung besitzen.'},
 {id:'advanced-04',label:'Stufenkörper aufbauen und bohren',toolIds:['tool:group','tool:drill'],
  fixture:[box([60,40,8],[10,-5,4])],
  prompt:'Ergänze die Grundplatte 60×40×8 mm, Mitte (10,−5,4), um einen Quader 20×40×16 mm mit Weltmitte (−10,−5,16), also Z8 bis24. Vereinige beides zu genau einem Stufenkörper. Erzeuge dann eine durchgehende Welt-Z-Bohrung Ø6 bei X−10,Y−5 durch die gesamte dortige Höhe24 mm. Grundplatte und Stufe dürfen nicht als getrennte Körper zurückbleiben.'},
 {id:'advanced-05',label:'Gehäuse mit seitlichem Durchbruch',toolIds:['tool:cad-shell','tool:group'],
  fixture:[box([60,40,30],[10,-5,18])],
  prompt:'Höhle den Quader 60×40×30 mm, Weltmitte (10,−5,18), Z3 bis33, nach innen mit3 mm Wand und Boden aus. Die gesamte obere Fläche muss offen sein. Ergänze mittig in der vorderen Wand bei Y−25 eine rechteckige Öffnung10 mm breit in X und12 mm hoch in Z, Mittelpunkt X10,Z18. Nur diese vordere Wand durchbrechen; die Rückwand bleibt vollständig. Außenmaße, Lage, Boden und übrige Seitenwände erhalten.'},
 {id:'advanced-06',label:'Blindtasche und blinde Bohrung',toolIds:['tool:group','tool:drill'],
  fixture:[box([70,50,20],[10,-5,10])],
  prompt:'Bearbeite den Quader70×50×20 mm mit Mitte (10,−5,10), Z0 bis20. Schneide von oben eine rechteckige blinde Tasche20×16 mm bei XY-Mitte (−5,−5), Tiefe8 mm, Taschenboden Z12. Erzeuge zusätzlich eine getrennte blinde Welt-Z-Bohrung Ø8 bei X28,Y8 von Z20 bis Z8, Tiefe12 mm. Keine der beiden Öffnungen darf durchgehen. Außenmaße und Lage erhalten.'},
 {id:'advanced-07',label:'Bearbeitbare L-Skizze mit zwei Löchern',toolIds:['tool:sketch','tool:extrude'],
  fixture:[box([10,10,6],[100,0,3])],
  prompt:'Ersetze nur das ausgewählte Aufgabenteil durch eine einzige bearbeitbare Skizzenextrusion6 mm hoch, Unterseite Welt-Z4. Lokale XY-Kontur: (−30,−20),(30,−20),(30,5),(10,5),(10,20),(−30,20), geschlossen. Zwei kreisförmige Innenkonturen: Ø8 mit lokaler Mitte (−15,0) und Ø6 bei (15,−10). Verschiebe die gesamte Kontur um Welt-X7,Y−9; lokale (0,0) liegt somit bei Welt (7,−9). Beide Löcher müssen durchgehen. Skizze mit Außenkontur und beiden Innenkonturen bearbeitbar erhalten.'},
 {id:'advanced-08',label:'Stufenteil mit Schnitt und Bemaßung',toolIds:['tool:drawing'],
  fixture:[box([60,40,8],[10,-5,4],{as:'base'}),box([20,40,16],[-10,-5,16],{as:'step'}),{op:'group',targets:['$base','$step'],as:'block',name:'Aufgabenteil'},create('cylinder','Bohrung',[6,6,26],[-10,-5,12],{as:'bore',solid:false}),{op:'group',targets:['$block','$bore'],name:'Aufgabenteil'}],
  prompt:'Erstelle vom ausgewählten bereits gebohrten Stufenteil ein A3-Blatt im Querformat, Maßstab1:2, Titelblocktitel Aufbauhalter, Zeichnungsnummer AB-08, Revision B. Benötigt werden Vorder-, Drauf-, Seitenansicht und eine zusätzliche Schnittansicht an der Welt-Ebene Y−5 (Achse Y, Schnittlage−5 mm). Alle vier Ansichten nativ aktualisieren. Ergänze mindestens drei echte geometrisch verknüpfte Maße, etwa mit der automatischen Grundbemaßung. Maßtexte allein genügen nicht. Den vollständigen vorhandenen CAD-Körper unverändert erhalten.'}
];
function advancedTask(id,dataset='development'){
 const d=definitions.find(x=>x.id===id);if(!d)return null;
 if(dataset!=='development')throw Error('Der Aufbau-Benchmark verwendet seinen festen Entwicklungsdatensatz.');
 return {...structuredClone(d),dataset,selectName:'Aufgabenteil',geometry:{scale:1,origin:[0,0,0],title:'Aufbauhalter'},
  fixture:[...structuredClone(d.fixture),create('box','Unbeteiligtes Teil',[7,9,11],[150,0,5.5])],
  prompt:d.prompt+' Alle unbeteiligten Teile einschließlich Schutzteil vollständig erhalten. Modellierung ausschließlich mit sichtbaren Übungswerkzeugen.'};
}
module.exports={definitions,advancedTask};
