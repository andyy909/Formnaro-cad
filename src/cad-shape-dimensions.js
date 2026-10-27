// Physical dimensions along the selected source's local axes. No display mesh
// or stored duplicate radius parameters are needed for these inspector controls.
import {cadFormLocalDimensions} from './cad-interface-state.js';
import {defaults} from './parameters.js';
const field=(key,label,value)=>({key,label,value,min:.01,max:10000,step:.1,unit:'mm'});
const supported=new Set(['torus','tube','cylinder','sphere','halfSphere','cone']);
export function cadShapeDimensions(node){
  if(node?.source!=='native'||!supported.has(node.recipe?.type))return [];
  const [x,,z]=cadFormLocalDimensions(node),type=node.recipe.type,p={...defaults(type),...node.recipe.params},base=Math.min(...node.recipe.size.slice(0,2)),ratio=x/base;
  if(type==='torus'){const tube=p.wall*ratio/2,ring=x/2-tube;return [field('ringRadius','Ringradius (bis Rohrmitte)',ring),field('tubeRadius','Rohrradius',tube),field('outerDiameter','Außendurchmesser',x),field('innerDiameter','Innendurchmesser',2*(ring-tube)),field('height','Profilhöhe',z)];}
  if(type==='tube'){const wall=p.wall*ratio;return [field('outerDiameter','Außendurchmesser',x),field('innerDiameter','Innendurchmesser',x-2*wall),field('wall','Wandstärke',wall),field('height','Rohrlänge',z)];}
  if(type==='cone')return [field('radius','Grundradius',x/2),field('diameter','Grunddurchmesser',x),{...field('topDiameter','Oberer Durchmesser',p.topDiameter*ratio),min:0},field('height','Höhe',z)];
  return [field('radius','Radius',x/2),field('diameter','Durchmesser',x),...(type!=='sphere'?[field('height','Höhe',z)]:[])];
}

export function cadShapeDimensionEdit(node,key,value){
  const fields=cadShapeDimensions(node),definition=fields.find(field=>field.key===key);
  if(!definition||!Number.isFinite(value)||value<definition.min||value>definition.max)throw Error('Ungültiges Formmaß.');
  const values=Object.fromEntries(fields.map(field=>[field.key,field.value])),type=node.recipe.type;
  const current=cadFormLocalDimensions(node),scales=[0,1,2].map(i=>Math.hypot(...node.transform.slice(4*i,4*i+3)));
  let desired=[...current],params;
  if(type==='torus'){
    let ring=values.ringRadius,tube=values.tubeRadius,height=values.height;
    if(key==='ringRadius')ring=value;if(key==='tubeRadius'){tube=value;height=2*value;}
    if(key==='outerDiameter')ring=value/2-tube;if(key==='innerDiameter')ring=value/2+tube;if(key==='height')height=value;
    if(ring<=tube||tube<=0)throw Error('Der Ringradius muss größer als der Rohrradius sein.');
    desired=key==='height'?[current[0],current[1],height]:[2*(ring+tube),2*(ring+tube),height];
    const source=desired.map((v,i)=>v/scales[i]);params={wall:2*tube*Math.min(source[0],source[1])/desired[0]};
  }else if(type==='tube'){
    let diameter=values.outerDiameter,wall=values.wall,height=values.height;
    if(key==='outerDiameter')diameter=value;if(key==='innerDiameter')wall=(diameter-value)/2;if(key==='wall')wall=value;if(key==='height')height=value;
    if(wall<=0||wall>=diameter/2)throw Error('Die Rohrwand muss kleiner als der Außenradius sein; der Innendurchmesser muss positiv bleiben.');
    desired=key==='height'?[current[0],current[1],height]:[diameter,diameter,height];
    const source=desired.map((v,i)=>v/scales[i]);params={wall:wall*Math.min(source[0],source[1])/desired[0]};
  }else{
    let diameter=current[0],height=current[2];if(key==='radius')diameter=2*value;if(key==='diameter')diameter=value;if(key==='height')height=value;
    if(type==='sphere')desired=[diameter,diameter,diameter];
    else if(type==='halfSphere'&&key!=='height')desired=[diameter,diameter,diameter/2];
    else desired=['height','topDiameter'].includes(key)?[current[0],current[1],height]:[diameter,diameter,height];
    if(type==='cone'){const top=key==='topDiameter'?value:values.topDiameter;if(top>desired[0])throw Error('Der obere Durchmesser darf nicht größer als der Grunddurchmesser sein.');const source=desired.map((v,i)=>v/scales[i]);params={topDiameter:top*Math.min(source[0],source[1])/desired[0]};}
  }
  if(desired.some(v=>!Number.isFinite(v)||v<.01||v>10000))throw Error('Formmaße müssen zwischen 0,01 und 10000 mm liegen.');
  const size=desired.map((v,i)=>v/scales[i]);
  if(size.some(v=>!Number.isFinite(v)||v<=0||v>10000))throw Error('Die Quellenmaße liegen außerhalb des CAD-Bereichs.');
  return {patch:{size,...(params?{params}:{})},dimensions:desired};
}
