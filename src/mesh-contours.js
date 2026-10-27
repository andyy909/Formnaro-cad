import {Font} from 'three/addons/loaders/FontLoader.js';
import {SVGLoader} from 'three/addons/loaders/SVGLoader.js';
import {cadFontForText} from './cad-font-outline.js';

export async function meshTextPaths(text,font='regular',fonts=[]){
 if(typeof text!=='string'||!text.trim()||text.length>200)throw Error('Text: 1–200 druckbare Zeichen.');
 const source=await cadFontForText(font,text,fonts),shapes=new Font(source).generateShapes(text,10),contours=[];
 for(const shape of shapes){const points=shape.extractPoints(12);for(const line of [points.shape,...points.holes]){const p=line.map(v=>[v.x,v.y]);if(p.length>1&&p[0].every((v,k)=>v===p.at(-1)[k]))p.pop();if(p.length>=3)contours.push(p);}}
 if(!contours.length)throw Error('Der Text enthält keine druckbare Kontur.');return [{fillRule:'NonZero',contours}];
}
export function meshSvgPaths(svg){
 if(typeof svg!=='string'||svg.length>5*1024*1024||/<!DOCTYPE|<!ENTITY/i.test(svg))throw Error('Eine SVG-Datei bis 5 MB ohne externe Definitionen wählen.');
 const data=new SVGLoader().parse(svg),paths=[];
 for(const path of data.paths){if(path.userData?.style?.fill==='none')continue;const contours=path.subPaths.map(s=>{const points=s.getPoints(16).map(p=>[p.x,-p.y]);if(points.length>1&&points[0].every((v,k)=>v===points.at(-1)[k]))points.pop();return points;}).filter(p=>p.length>=3);if(contours.length)paths.push({fillRule:path.userData?.style?.fillRule==='evenodd'?'EvenOdd':'NonZero',contours});}
 if(!paths.length)throw Error('SVG enthält keine gefüllten geschlossenen Konturen.');return paths;
}
export function mergeProjectedSvg(values){
 if(!values.length)throw Error('Keine SVG-Projektion vorhanden.');if(values.length===1)return values[0];
 const documents=values.map(text=>new DOMParser().parseFromString(text,'image/svg+xml')),boxes=documents.map(doc=>{const box=doc.documentElement.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);if(!box||box.length!==4||box.some(v=>!Number.isFinite(v)))throw Error('Ungültiger Projektionsrahmen.');return box;}),min=[Math.min(...boxes.map(b=>b[0])),Math.min(...boxes.map(b=>b[1]))],size=[Math.max(...boxes.map(b=>b[0]+b[2]))-min[0],Math.max(...boxes.map(b=>b[1]+b[3]))-min[1]],doc=new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg"/>','image/svg+xml'),root=doc.documentElement;
 root.setAttribute('viewBox',[...min,...size].join(' '));root.setAttribute('width',size[0]+'mm');root.setAttribute('height',size[1]+'mm');for(const input of documents)for(const child of input.documentElement.childNodes)root.appendChild(doc.importNode(child,true));return new XMLSerializer().serializeToString(doc);
}
