// Task and fixture data only. Expected results never enter model context.
const definitions=require('../ai/practice-function-tests.json');
const box=(name='Aufgabenteil',size=[20,10,8],pos=[0,0,4])=>({op:'create',type:'box',name,size,pos});
const cyl=(size=[16,16,80],pos=[0,0,40])=>({...box('Aufgabenteil',size,pos),type:'cylinder'});
function functionTask(id,dataset='development'){
 const d=definitions.find(d=>d.id===id);if(!d)return null;
 if(dataset!=='development')throw Error('Für neue Funktionstests ist noch kein unabhängiger Holdout definiert. Entwicklungsserie wählen.');
 const n=d.number;let fixture=[box()];
 if(n===2)fixture=[box('Aufgabenteil',[30,10,8])];
 if(n===3||n===5)fixture=[cyl()];
 if(n===4)fixture=[box('Aufgabenteil',[10,8,6],[0,0,3])];
 if(n===6)fixture=[{...box('Aufgabenteil',[20,10,8],[15,5,4]),as:'base'},{...box('Schenkel',[10,10,8],[10,15,4]),as:'leg'},{op:'group',targets:['$base','$leg'],name:'Aufgabenteil'}];
 if(n===7)fixture=[box('Aufgabenteil',[20,10,8],[5,30,4]),box('Referenz',[30,20,10],[40,-10,5])];
 if(n===8)fixture=[box('Aufgabenteil',[10,8,6],[30,20,15]),box('Zweites Teil',[12,8,6],[50,20,15])];
 if(n===9)fixture=[box('Aufgabenteil',[20,10,8],[5,7,25])];
 if(n===10)fixture=[box('Aufgabenteil',[4,6,8])];
 if(n===11)fixture=[cyl([6,6,10],[20,0,5])];
 if(n===12)fixture=[box('Aufgabenteil',[20,10,8]),box('Zweites Teil',[20,10,8],[10,0,4])];
 if([13,14,22].includes(n))fixture=[box('Aufgabenteil',[40,30,8])];
 if([15,16,17,18,29].includes(n))fixture=[box('Aufgabenteil',[40,30,20],[0,0,10])];
 if(n===19)fixture=[];
 if(n===20)fixture=[{op:'sketch',name:'Aufgabenteil',sketch:{version:2,kind:'profile',variables:[],dimensions:{height:5},elements:[[-20,-15],[20,-15],[20,15],[-20,15]].map((start,i,a)=>({id:'e'+i,type:'line',start,end:a[(i+1)%4]})),loops:[{id:'outer',role:'outer',elements:['e0','e1','e2','e3']}]}}];
 if(n===21)fixture=[box('Aufgabenteil',[20,26,32],[0,0,16])];
 if([23,24,25,30].includes(n))fixture=[box(),box('Zweites Teil',[10,10,8],[40,0,4])];
 if(n===25)fixture.push(box('Drittes Teil',[10,10,8],[-40,0,4]));
 const initialBodies=fixture.some(c=>c.op==='group')?'':fixture.filter(c=>c.op==='create').map(c=>c.name+' ('+c.type+', Größe '+c.size.join('×')+' mm, Mitte ('+c.pos.join(',')+'))').join('; ');
 const selectAll=[7,8,12,30].includes(n),selectName=selectAll?null:'Aufgabenteil';
 return {...d,geometry:{scale:1,origin:[0,0,0],title:'Übungsteil'},dataset,fixture:[...fixture,box('Unbeteiligtes Teil',[7,9,11],[150,0,5.5])],selectName,
 prompt:'Ausgangszustand: '+d.initialState+'. '+(initialBodies?'Ausgangskörper: '+initialBodies+'. ':'')+(n===20?'Vorhandene Skizze 40×30 mm, Extrusionshöhe 5 mm, Körpermitte (0,0,2.5). ':'')+'Auftrag: '+d.prompt+' '+({5:'Ausgangszylinder Ø16 ×80, Mitte (0,0,40). Kopie mit Mittelpunkt (30,0,40).',6:'Fertiger ausgewählter L-Körper: Außenmaß 20×20×8, Weltmitte (15,10,4). Seine Quellen sind zwei vereinigte Quader: 20×10×8 bei (15,5,4) und 10×10×8 bei (10,15,4). Die Quellenmitten sind nicht die Mitte des fertigen L-Körpers.',7:'Bewegliches Aufgabenteil Mitte (5,30,4), Referenz Mitte (40,-10,5). Nur das Aufgabenteil bewegen.',8:'Ausgangsmitten (30,20,15) und (50,20,15).',10:'Ausgangsquader 4×6×8, Mitte (0,0,4).',15:'Außenkante am Schnitt der oberen Fläche Z20 und vorderen Fläche Y−15, parallel zu X.',16:'Außenkante am Schnitt der oberen Fläche Z20 und vorderen Fläche Y−15, parallel zu X.',18:'Rechte Seitenfläche bei X20 um 2 mm nach außen versetzen.',26:'Zuerst um 15 mm in X verschieben, dann diese Änderung rückgängig machen und wiederholen.',29:'Teilung an der horizontalen Welt-Ebene Z10.',30:'Aufgabenteil als Elternteil, Zweites Teil als Kind. Drehachse Welt-Z durch (40,0,4), Kind um 30 Grad drehen.'}[n]??'')+' Alle unbeteiligten Teile erhalten.'};
}
module.exports={definitions,functionTask};
