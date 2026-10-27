import {validateCompositePath,pathArc} from './cad-composite-path.js';
const labels={line:'Gerade',arc:'Dreipunktbogen',bezier:'Bézier',bspline:'B-Spline'};
const element=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
const normal=v=>{const n=Math.hypot(...v);return n>1e-8?v.map(x=>x/n):[0,0,1];};
function endFrame(segment){if(!segment)return {point:[0,0,0],tangent:[0,0,1]};if(segment.kind==='arc')return {point:segment.end,tangent:pathArc(segment).tangent(1)};if(segment.points)return {point:segment.points.at(-1),tangent:normal(segment.points.at(-1).map((v,k)=>v-segment.points.at(-2)[k]))};return {point:segment.end,tangent:normal(segment.end.map((v,k)=>v-segment.start[k]))};}
function defaultSegment(kind,previous){const {point:a,tangent:t}=endFrame(previous),reference=Math.abs(t[0])<.8?[1,0,0]:[0,1,0],d=reference.reduce((n,v,k)=>n+v*t[k],0),b=normal(reference.map((v,k)=>v-d*t[k])),at=(u,v)=>a.map((x,k)=>x+t[k]*u+b[k]*v);
 if(kind==='line')return {kind,start:[...a],end:at(30,0)};
 if(kind==='arc')return {kind,start:[...a],through:at(30/Math.SQRT2,30-30/Math.SQRT2),end:at(30,30)};
 return {kind,points:[[...a],at(20,0),at(40,20),at(60,20)]};
}
/** A local draft only. Reading it validates values; no model work on input. */
export function createCompositePathEditor(host,{value,onChange=()=>{}}={}){
 const draft=structuredClone(value??{kind:'segments',orientation:'corrected',segments:[defaultSegment('line')]}),caption=element('p','Pfad im Koordinatensystem der Skizze: Start 0/0/0, erste Tangente +Z. Übergänge müssen tangential sein. Koordinaten in mm.'),orientation=element('select'),list=element('div'),addKind=element('select'),add=element('button','Segment anhängen');
 caption.className='small-note';orientation.dataset.pathOrientation='';orientation.setAttribute('aria-label','Profilorientierung');orientation.add(new Option('Mitlaufend · korrigiert','corrected'));orientation.add(new Option('Frenet · krümmungsgeführt','frenet'));orientation.value=draft.orientation;orientation.onchange=()=>{draft.orientation=orientation.value;onChange();};
 for(const [kind,label]of Object.entries(labels))addKind.add(new Option(label,kind));addKind.setAttribute('aria-label','Neues Pfadsegment');addKind.dataset.pathAddKind='';add.type='button';add.dataset.pathAdd='';
 host.replaceChildren(caption,orientation,list,addKind,add);
 function render(){list.replaceChildren();draft.segments.forEach((segment,index)=>{const group=element('fieldset'),legend=element('legend',(index+1)+'. '+labels[segment.kind]),remove=element('button','Segment entfernen');group.dataset.pathSegment=String(index);group.append(legend);const fields=segment.points?segment.points.map((_,i)=>i):segment.kind==='arc'?['start','through','end']:['start','end'];
  const table=element('table'),header=element('tr');header.append(element('th','Punkt'),...['X','Y','Z'].map(x=>element('th',x)));table.append(header);
  for(const field of fields){const row=element('tr'),name=typeof field==='number'?'P'+field:({start:'Start',through:'Zwischen',end:'Ende'})[field],point=segment.points?segment.points[field]:segment[field];row.append(element('th',name));for(let axis=0;axis<3;axis++){const cell=element('td'),input=element('input');input.type='text';input.inputMode='decimal';input.value=String(point[axis]);input.setAttribute('aria-label','Segment '+(index+1)+' '+name+' '+['X','Y','Z'][axis]);input.dataset.pathPoint=String(field);input.dataset.pathAxis=String(axis);input.oninput=()=>{point[axis]=input.value.trim()?Number(input.value.replace(',','.')):NaN;onChange();};cell.append(input);row.append(cell);}table.append(row);}group.append(table);
  if(segment.kind==='bspline'){const addPoint=element('button','Kontrollpunkt ergänzen'),removePoint=element('button','Kontrollpunkt entfernen');addPoint.type=removePoint.type='button';addPoint.disabled=segment.points.length>=16;removePoint.disabled=segment.points.length<=4;addPoint.onclick=()=>{const a=segment.points.at(-2),b=segment.points.at(-1);segment.points.splice(-1,0,a.map((v,k)=>(v+b[k])/2));render();onChange();};removePoint.onclick=()=>{segment.points.splice(-2,1);render();onChange();};group.append(addPoint,removePoint);}
  remove.type='button';remove.disabled=draft.segments.length===1;remove.onclick=()=>{draft.segments.splice(index,1);render();onChange();};group.append(remove);list.append(group);
 });add.disabled=draft.segments.length>=32;}
 add.onclick=()=>{try{draft.segments.push(defaultSegment(addKind.value,draft.segments.at(-1)));render();onChange();}catch{host.dispatchEvent(new CustomEvent('path-error',{detail:'Zuerst die Koordinaten des letzten Segments vervollständigen.'}));}};
 render();return {read:()=>validateCompositePath(draft)};
}
