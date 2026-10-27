import {profileId,profileLines,appendProfileLoop} from './sketch-profile.js';
import {resolveCadSketch} from './cad-sketch.js';
export const SKETCH_TEMPLATES=Object.freeze([
 {id:'plate',name:'Halteplatte',description:'60 × 40 × 3 mm · vier Bohrungen Ø 4,2 und Langloch 20 × 6',help:'Benannte Maße ändern: breite, tiefe, hoehe, bohrung, rand, laenge und schlitz. Die vier Bohrungsmittelpunkte folgen dem Randabstand. Vorschau prüft, ob alle Öffnungen innerhalb der Platte liegen.'},
 {id:'slots',name:'Langlochplatte',description:'60 × 30 × 3 mm · zwei Langlöcher 20 × 6',help:'laenge und schlitz steuern die Öffnungen, abstand deren Mittenabstand. breite, tiefe und hoehe ändern die Platte. Überkreuzte oder außen liegende Öffnungen werden vor der Extrusion abgewiesen.'},
 {id:'ring',name:'Distanzring',description:'Außen Ø 20 · innen Ø 10 · Höhe 5 mm',help:'aussen, innen und hoehe als benannte Maße ändern. Der Innendurchmesser muss kleiner als der Außendurchmesser bleiben. Beide Kreise behalten ihren gemeinsamen Mittelpunkt.'},
 {id:'rim',name:'Gehäuserand',description:'60 × 40 × 10 mm · Wand 2 · Eckradius 4 mm',help:'breite, tiefe, hoehe, wand und radius ändern den umlaufenden Rand. Der innere Eckradius ist radius − wand und muss positiv bleiben. Dies ist ein extrudierter Rand mit durchgehender Öffnung.'}
]);
const circle=(center,diameter)=>({id:profileId('circle'),type:'circle',center,diameter,construction:false});
const rectangle=(w,d)=>profileLines([[`-(${w})/2`,`-(${d})/2`],[`(${w})/2`,`-(${d})/2`],[`(${w})/2`,`(${d})/2`],[`-(${w})/2`,`(${d})/2`]]);
function rounded(w,d,r,{slot=false,cx='0',cy='0'}={}){
 const centers=[[`(${w})/2-(${r})`,`-(${d})/2+(${r})`],[`(${w})/2-(${r})`,`(${d})/2-(${r})`],[`-(${w})/2+(${r})`,`(${d})/2-(${r})`],[`-(${w})/2+(${r})`,`-(${d})/2+(${r})`]],angle=[-90,0,90,180],at=(c,a)=>[`(${cx})+(${c[0]})+(${r})*cosd(${a})`,`(${cy})+(${c[1]})+(${r})*sind(${a})`],out=[];
 for(let i=0;i<4;i++){const c=centers[i],a=angle[i],start=at(c,a),through=at(c,a+45),end=at(c,a+90);out.push({id:profileId('arc'),type:'arc',start,through,end,construction:false});if(!slot||i%2===1)out.push({id:profileId('line'),type:'line',start:end,end:at(centers[(i+1)%4],angle[(i+1)%4]),construction:false});}return out;
}
export function createSketchTemplate(id){
 const descriptor=SKETCH_TEMPLATES.find(t=>t.id===id);if(!descriptor)throw Error('Unbekannte Skizzenvorlage.');let sketch={version:2,kind:'profile',variables:[],dimensions:{height:'hoehe'},elements:[],loops:[]};
 const vars=values=>sketch.variables=Object.entries(values).map(([name,value])=>({name,value:String(value)})),loop=(entities,role='hole')=>sketch=appendProfileLoop(sketch,entities,role);
 if(id==='plate'){vars({breite:60,tiefe:40,hoehe:3,bohrung:4.2,rand:8,laenge:20,schlitz:6});loop(rectangle('breite','tiefe'),'outer');for(const sx of [-1,1])for(const sy of [-1,1])loop([circle([`${sx}*(breite/2-rand)`,`${sy}*(tiefe/2-rand)`],'bohrung')]);loop(rounded('laenge','schlitz','schlitz/2',{slot:true}));}
 if(id==='slots'){vars({breite:60,tiefe:30,hoehe:3,laenge:20,schlitz:6,abstand:30});loop(rectangle('breite','tiefe'),'outer');for(const sx of [-1,1])loop(rounded('laenge','schlitz','schlitz/2',{slot:true,cx:`${sx}*abstand/2`}));}
 if(id==='ring'){vars({aussen:20,innen:10,hoehe:5});loop([circle(['0','0'],'aussen')],'outer');loop([circle(['0','0'],'innen')]);}
 if(id==='rim'){vars({breite:60,tiefe:40,hoehe:10,wand:2,radius:4});loop(rounded('breite','tiefe','radius'),'outer');loop(rounded('breite-2*wand','tiefe-2*wand','radius-wand'));}
 resolveCadSketch(sketch);return sketch;
}
