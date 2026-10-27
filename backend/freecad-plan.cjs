// Data-only CAD plans. No provider Python, paths, expressions or imports.
const fields={box:['size','origin'],cylinder:['radius','height','origin','axis'],cone:['radius','radius2','height','origin','axis'],sphere:['radius','origin'],torus:['radius','radius2','origin','axis'],polygon:['points'],circle:['radius','origin','axis'],extrude:['source','vector'],revolve:['source','origin','axis','angle'],loft:['sources','solid','ruled'],sweep:['source','path','solid','frenet'],fuse:['sources'],cut:['source','tool'],common:['sources'],fillet:['source','edges','radius'],chamfer:['source','edges','radius'],shell:['source','faces','thickness','tolerance'],offset:['source','distance','tolerance'],refine:['source'],repair:['source','tolerance'],solid:['source'],section:['source','tool'],transform:['source','translation','axis','origin','angle'],inspect:['source'],distance:['source','tool']};
const required={box:['size'],cylinder:['radius','height'],cone:['radius','radius2','height'],sphere:['radius'],torus:['radius','radius2'],polygon:['points'],circle:['radius'],extrude:['source','vector'],revolve:['source','axis','angle'],loft:['sources'],sweep:['source','path'],fuse:['sources'],cut:['source','tool'],common:['sources'],fillet:['source','edges','radius'],chamfer:['source','edges','radius'],shell:['source','faces','thickness'],offset:['source','distance'],refine:['source'],repair:['source'],solid:['source'],section:['source','tool'],transform:['source'],inspect:['source'],distance:['source','tool']};
fields.wire=['points','closed'];required.wire=['points'];
fields.sketch=['elements','constraints','origin','axis'];required.sketch=['elements'];
const fail=m=>{throw Object.assign(Error('FreeCAD: '+m),{code:'FREECAD_PLAN_INVALID'});};
const id=v=>typeof v==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(v);
const plain=v=>v&&Object.getPrototypeOf(v)===Object.prototype;
function keys(v,allowed){if(!plain(v)||Object.keys(v).some(k=>!allowed.includes(k)))fail('Unbekannte Planfelder.');}
function validatePlan(value,inputNames=[]){
 keys(value,['version','parameters','steps','output','name']);if(value.version!==1||!Array.isArray(value.steps)||!value.steps.length||value.steps.length>128||value.name!==undefined&&(typeof value.name!=='string'||value.name.length>200))fail('Planversion 1 mit 1–128 Schritten erforderlich.');
 const params=value.parameters??{};if(!plain(params)||Object.keys(params).length>128||Object.entries(params).some(([k,v])=>!id(k)||typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>200000))fail('Ungültige Maßparameter.');
 const scalar=v=>{if(plain(v)){keys(v,['param']);if(!Object.hasOwn(params,v.param))fail('Unbekannter Maßparameter.');v=params[v.param];}if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>200000)fail('Endliche Zahl bis 200000 erforderlich.');return v;};
 const refs=new Set(inputNames);if(refs.size!==inputNames.length||inputNames.some(n=>!id(n)))fail('Ungültige Eingabenamen.');
 for(const s of value.steps){if(!plain(s)||!Object.hasOwn(fields,s.op))fail('Unbekannte CAD-Operation.');keys(s,['id','op',...fields[s.op]]);if(!id(s.id)||refs.has(s.id)||required[s.op].some(k=>s[k]===undefined))fail('Eindeutige Schrittkennung und vollständige Argumente erforderlich.');
  for(const [k,v]of Object.entries(s)){
   if(['op','id'].includes(k))continue;
   if(['source','tool','path'].includes(k)){if(!refs.has(v))fail('Quelle noch nicht berechnet: '+v);}
   else if(k==='sources'){if(!Array.isArray(v)||v.length<2||v.length>32||v.some(x=>!refs.has(x)))fail('2–32 vorhandene Quellen erforderlich.');}
   else if(['solid','ruled','frenet','closed'].includes(k)){if(typeof v!=='boolean')fail('Boolescher Wert erforderlich.');}
   else if(k==='elements'){
    if(!Array.isArray(v)||!v.length||v.length>512)fail('1–512 Skizzenelemente erforderlich.');
    const point=p=>{if(!Array.isArray(p)||p.length!==2)fail('Zweidimensionaler Skizzenpunkt erforderlich.');p.forEach(scalar);};
    for(const e of v){if(!plain(e)||!['line','arc','circle'].includes(e.type))fail('Unbekanntes Skizzenelement.');keys(e,e.type==='circle'?['type','center','radius']:e.type==='line'?['type','start','end']:['type','start','mid','end']);if(e.type==='circle'){point(e.center);if(scalar(e.radius)<=0)fail('Positiver Kreisradius erforderlich.');}else{point(e.start);point(e.end);if(e.type==='arc')point(e.mid);}}
   }
   else if(k==='constraints'){
    const names=['Distance','DistanceX','DistanceY','Radius','Diameter','Horizontal','Vertical','Coincident','Parallel','Perpendicular','Equal','Angle','Block','PointOnObject','Tangent','Symmetric'];
    if(!Array.isArray(v)||v.length>512)fail('Höchstens 512 Skizzenbedingungen.');
    for(const c of v){keys(c,['type','args']);if(!names.includes(c.type)||!Array.isArray(c.args)||c.args.length>6)fail('Ungültige Skizzenbedingung.');c.args.forEach(scalar);}
   }
   else if(['edges','faces'].includes(k)){if(!Array.isArray(v)||!v.length||v.length>256||new Set(v).size!==v.length||v.some(x=>!Number.isSafeInteger(x)||x<1||x>100000))fail('Gemessene, einsbasierte Topologieindizes erforderlich.');}
   else if(k==='points'){if(!Array.isArray(v)||v.length<(s.op==='wire'?2:3)||v.length>2048||v.some(p=>!Array.isArray(p)||p.length!==3))fail('Vollständige dreidimensionale Profilpunkte erforderlich.');v.forEach(p=>p.forEach(scalar));}
   else if(['size','origin','axis','vector','translation'].includes(k)){if(!Array.isArray(v)||v.length!==3)fail('Dreiervektor erforderlich.');const nums=v.map(scalar);if(k==='size'&&nums.some(n=>n<=0)||['axis','vector'].includes(k)&&Math.hypot(...nums)<1e-9)fail('Ungültige Abmessung oder Richtung.');}
   else {const n=scalar(v);if(['radius','height','tolerance'].includes(k)&&n<=0||k==='radius2'&&n<0||k==='angle'&&(n===0||Math.abs(n)>360))fail('Ungültiges Maß: '+k);}
  }
  // Inspection-only results cannot become geometry inputs.
  if(!['inspect','distance'].includes(s.op))refs.add(s.id);
 }
 if(!refs.has(value.output))fail('Ein vorhandenes geometrisches Ergebnis als output wählen.');
 if(JSON.stringify(value).length>250000)fail('Plan überschreitet 250000 Zeichen.');return JSON.parse(JSON.stringify(value));
}
module.exports={validatePlan,fields,required};
