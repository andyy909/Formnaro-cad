export const advancedFreeCADLabels={draft:'Entformungsschräge',defeature:'Merkmale entfernen',revolution:'Rotation',helix:'Helix'};
const fail=message=>{throw Error(message);};
export function validateAdvancedFreeCAD(value){
 const p=structuredClone(value),kind=p?.kind;
 if(!Object.hasOwn(advancedFreeCADLabels,kind))fail('Unbekanntes FreeCAD-Merkmal.');
 const allowed={draft:['kind','faces','neutral','angle','reversed'],defeature:['kind','faces'],revolution:['kind','faces','origin','axis','angle'],helix:['kind','origin','axis','radius','pitch','height','wireRadius','leftHanded']}[kind];
 if(Object.keys(p).some(k=>!allowed.includes(k)))fail('Unbekannte Merkmalparameter.');
 const scalar=(k,min,max)=>{if(typeof p[k]!=='number'||!Number.isFinite(p[k])||p[k]<min||p[k]>max)fail('Ungültiger Wert: '+k);};
 const vector=v=>{if(!Array.isArray(v)||v.length!==3||v.some(x=>typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>100000))fail('Drei endliche Koordinaten erforderlich.');};
 const face=f=>{if(!f||Object.keys(f).some(k=>!['point','normal'].includes(k)))fail('Ungültiger Flächenbezug.');vector(f.point);vector(f.normal);if(Math.hypot(...f.normal)<.9)fail('Ungültige Flächennormale.');};
 if(kind!=='helix'){if(!Array.isArray(p.faces)||p.faces.length<1||p.faces.length>16)fail('Eine bis 16 Flächen auswählen.');p.faces.forEach(face);}
 if(kind==='draft'){face(p.neutral);scalar('angle',.1,45);if(typeof p.reversed!=='boolean')fail('Richtung auswählen.');}
 if(['helix','revolution'].includes(kind)){vector(p.origin);vector(p.axis);if(Math.hypot(...p.axis)<1e-8)fail('Die Achse darf nicht null sein.');}
 if(kind==='revolution'){if(p.faces.length!==1)fail('Eine Profilfläche auswählen.');scalar('angle',.1,360);}
 if(kind==='helix'){for(const [k,min,max]of [['radius',.01,10000],['pitch',.01,10000],['height',.01,10000],['wireRadius',.001,1000]])scalar(k,min,max);if(p.radius<=p.wireRadius||p.pitch<=2*p.wireRadius||p.height/p.pitch>200)fail('Helix benötigt Radius > Drahtradius, Steigung > Drahtdurchmesser und höchstens 200 Windungen.');if(typeof p.leftHanded!=='boolean')fail('Drehsinn auswählen.');}
 return p;
}
export function advancedFreeCADScript(parameters,moduleSource){
 return {version:1,name:advancedFreeCADLabels[parameters.kind],gui:true,code:'from formnaro_advanced_v1 import build\nresult,measurements=build(doc,inputs,parameters)',modules:{'formnaro_advanced_v1.py':moduleSource},parameters:validateAdvancedFreeCAD(parameters)};
}
