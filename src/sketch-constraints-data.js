// Version-3 sketch relations. This module is deliberately kernel/DOM free.
import {sketchExpression} from './sketch-expression.js';

export const SKETCH_CONSTRAINT_LIMITS=Object.freeze({elements:128,constraints:256,iterations:80,timeMs:1000});
export const SKETCH_CONSTRAINT_TYPES=Object.freeze(['coincident','horizontal','vertical','parallel','perpendicular','equalLength','equalRadius','concentric','symmetric','tangent','fixed','length','distance','angle','radius']);
export const sketchLiteral=value=>typeof value==='number'||typeof value==='string'&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim());
const fail=message=>{throw Object.assign(Error('Skizzenbedingung: '+message),{code:'SKETCH_CONSTRAINT_INVALID'});};
const object=(v,keys)=>{if(!v||![Object.prototype,null].includes(Object.getPrototypeOf(v))||Object.keys(v).some(k=>!keys.includes(k)))fail('Ungültige Felder.');};
export const sketchPointFields=e=>e.type==='circle'?['center']:e.type==='arc'?['start','through','end']:['start','end'];
export function sketchConstraintValues(sketch){
 const defs=new Map(),values=Object.create(null),visiting=new Set();
 if(!Array.isArray(sketch.variables)||sketch.variables.length>40)fail('Höchstens 40 benannte Maße.');
 for(const v of sketch.variables){object(v,['name','value']);if(typeof v.name!=='string'||!/^[A-Za-z_][A-Za-z0-9_]{0,39}$/.test(v.name)||['__proto__','constructor','prototype'].includes(v.name)||defs.has(v.name))fail('Ungültige oder doppelte Maßnamen.');defs.set(v.name,v.value);}
 const read=name=>{if(Object.hasOwn(values,name))return values[name];if(!defs.has(name)||visiting.has(name))fail('Unbekannte oder zyklische Maßformel: '+name);visiting.add(name);const result=sketchExpression(defs.get(name),read);visiting.delete(name);return values[name]=result;};
 for(const name of defs.keys())read(name);return {values,scalar:value=>sketchExpression(value,read)};
}
export function validateSketchConstraints(sketch){
 object(sketch,['version','kind','variables','dimensions','elements','loops','constraints']);
 if(sketch.version!==3)fail('Version 3 erforderlich.');
 if(sketch.kind!=='profile'||!Array.isArray(sketch.loops)||sketch.loops.length>64)fail('Ungültige Profilkonturen.');object(sketch.dimensions,['height']);
 if(!Array.isArray(sketch.elements)||sketch.elements.length>128||!Array.isArray(sketch.constraints)||sketch.constraints.length>256)fail('Höchstens 128 Elemente und 256 Bedingungen.');
 const map=new Map();for(const e of sketch.elements){if(!e||typeof e.id!=='string'||!e.id||e.id.length>100||map.has(e.id)||!['line','arc','circle'].includes(e.type))fail('Ungültige Elementkennung.');map.set(e.id,e);}
 const ids=new Set(),{scalar}=sketchConstraintValues(sketch);scalar(sketch.dimensions.height);
 for(const e of sketch.elements){object(e,['id','type','construction',...sketchPointFields(e),...(e.type==='circle'?['diameter']:[])]);if(e.construction!==undefined&&typeof e.construction!=='boolean')fail('Ungültige Konstruktion.');for(const field of sketchPointFields(e)){if(!Array.isArray(e[field])||e[field].length!==2)fail('Punkt benötigt zwei Koordinaten.');e[field].forEach(scalar);}if(e.type==='circle')scalar(e.diameter);}
 const loopIds=new Set();for(const loop of sketch.loops){object(loop,['id','role','elements']);if(typeof loop.id!=='string'||!loop.id||loop.id.length>100||loopIds.has(loop.id)||!['outer','hole'].includes(loop.role)||!Array.isArray(loop.elements)||!loop.elements.length||loop.elements.length>128||new Set(loop.elements).size!==loop.elements.length||loop.elements.some(id=>!map.has(id)))fail('Ungültiger Konturbezug.');loopIds.add(loop.id);}
 return sketch.constraints.map(c=>{
  object(c,['id','type','refs','value','mode']);if(typeof c.id!=='string'||!c.id||c.id.length>100||ids.has(c.id)||!SKETCH_CONSTRAINT_TYPES.includes(c.type)||!Array.isArray(c.refs))fail('Ungültige oder doppelte Bedingungskennung.');ids.add(c.id);
  const count=['horizontal','vertical','fixed','length','angle','radius'].includes(c.type)?1:c.type==='symmetric'?3:2;if(c.refs.length!==count)fail('Falsche Anzahl Bezüge: '+c.id);
  const refs=c.refs.map(ref=>{object(ref,['element','point']);const e=map.get(ref.element);if(!e)fail('Elementbezug fehlt: '+c.id);if(ref.point!==undefined&&!sketchPointFields(e).includes(ref.point))fail('Punktbezug fehlt: '+c.id);return e;});
  const points=['coincident','distance'].includes(c.type)?count:c.type==='symmetric'?2:c.type==='fixed'&&c.refs[0].point?1:0;
  c.refs.forEach((r,i)=>{if((i<points)!==(r.point!==undefined))fail('Punkt- oder Elementbezug erwartet: '+c.id);});
  const line=e=>e.type==='line',round=e=>['circle','arc'].includes(e.type);
  if(['horizontal','vertical','parallel','perpendicular','equalLength','length','angle'].includes(c.type)&&!refs.every(line)||c.type==='symmetric'&&!line(refs[2])||['equalRadius','concentric','radius'].includes(c.type)&&!refs.every(round)||c.type==='tangent'&&!(round(refs[0])&&round(refs[1])||line(refs[0])&&round(refs[1])||round(refs[0])&&line(refs[1])))fail('Unpassende Elementarten: '+c.id);
  if(c.type==='tangent'){if(c.mode!==undefined&&!['external','internal'].includes(c.mode))fail('Ungültige Tangentenart.');}else if(c.mode!==undefined)fail('Tangentenart nur für Tangenten.');
  if(['length','distance','angle','radius'].includes(c.type)){const v=scalar(c.value);if(c.type!=='angle'&&(v<.005||v>10000))fail('Maß außerhalb 0,005–10000 mm.');}
  else if(c.type==='fixed'){
   const pair=v=>{if(!Array.isArray(v)||v.length!==2||v.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>100000))fail('Fixierung benötigt endliche Koordinaten.');};
   if(points)pair(c.value);else{const e=refs[0],keys=[...sketchPointFields(e),...(e.type==='circle'?['diameter']:[])];object(c.value,keys);if(Object.keys(c.value).length!==keys.length)fail('Unvollständige Fixierung.');for(const k of keys)if(k==='diameter'){if(typeof c.value[k]!=='number'||!Number.isFinite(c.value[k])||c.value[k]<.01||c.value[k]>10000)fail('Ungültiger fixierter Durchmesser.');}else pair(c.value[k]);}
  }else if(c.value!==undefined)fail('Unerwarteter Maßwert.');
  return structuredClone(c);
 });
}
export function upgradeSketchConstraints(profile){
 if(profile.version===3){validateSketchConstraints(profile);return structuredClone(profile);}
 if(profile.version!==2)fail('Zuerst erweiterte Konturen einschalten.');const out={...structuredClone(profile),version:3,constraints:[]};
 const map=new Map(out.elements.map(e=>[e.id,e]));
 // Explicit stable endpoint relations preserve wire closure through later edits.
 for(const loop of out.loops)for(let i=0;i<loop.elements.length;i++){const a=map.get(loop.elements[i]),b=map.get(loop.elements[(i+1)%loop.elements.length]);if(!a||!b||a.type==='circle'||b.type==='circle')continue;out.constraints.push({id:'join-'+crypto.randomUUID(),type:'coincident',refs:[{element:a.id,point:'end'},{element:b.id,point:'start'}]});}
 validateSketchConstraints(out);return out;
}
