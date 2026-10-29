import {remapCadCylinderFaceAnchor} from './cad-cylinder-face-anchor.js';
import {remapCadBoxFaceAnchor} from './cad-box-face-anchor.js';
const fail=message=>{throw Object.assign(Error(message),{code:'INVALID_CAD_DRILL_PATTERN'});};
const finite2=value=>Array.isArray(value)&&value.length===2&&value.every(v=>Number.isFinite(v)&&Math.abs(v)<=10000);
const bounded=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
export function validateCadDrillPattern(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1)fail('Ungültiges Bohrungsmuster.');
 const fields={line:['version','kind','count','step','skip'],grid:['version','kind','columns','rows','step','rowStep','skip'],circle:['version','kind','count','center','radius','angle','startAngle','skip'],mirror:['version','kind','axis','offset','skip']}[value.kind];
 if(!fields||Object.keys(value).some(k=>!fields.includes(k)))fail('Ungültige Bohrungsmusterdaten.');
 let count;if(value.kind==='grid'){if(!bounded(value.rows,1,64)||!bounded(value.columns,1,64)||value.rows*value.columns<2||value.rows*value.columns>64||!finite2(value.step)||!finite2(value.rowStep))fail('Raster benötigt bis zu 64 Positionen und endliche Abstände.');count=value.rows*value.columns;}
 else if(value.kind==='mirror'){if(!['u','v'].includes(value.axis)||!Number.isFinite(value.offset)||Math.abs(value.offset)<1e-6||Math.abs(value.offset)>10000)fail('Spiegelachse und Abstand sind erforderlich.');count=2;}
 else {if(!bounded(value.count,2,64))fail('Muster benötigt 2 bis 64 Positionen.');count=value.count;if(value.kind==='line'&&(!finite2(value.step)||Math.hypot(...value.step)<1e-6))fail('Reihe benötigt einen Abstand.');if(value.kind==='circle'){if(!finite2(value.center)||Math.hypot(...value.center)<1e-6)fail('Lochkreis benötigt einen Mittelpunkt abseits der ersten Bohrung.');if(value.radius!==undefined&&(!Number.isFinite(value.radius)||value.radius<.01||value.radius>10000)||value.angle!==undefined&&(!Number.isFinite(value.angle)||Math.abs(value.angle)<.01||Math.abs(value.angle)>360)||value.startAngle!==undefined&&(!Number.isFinite(value.startAngle)||Math.abs(value.startAngle)>36000))fail('Lochkreisradius oder Winkel außerhalb der zulässigen Grenzen.');}}
 if(!Array.isArray(value.skip)||value.skip.length>=count||value.skip.some(v=>!bounded(v,1,count-1))||new Set(value.skip).size!==value.skip.length)fail('Ungültige ausgelassene Musterposition.');
 return structuredClone(value);
}

// U/V are axes of the original native box face, in its local coordinates.
export function cadDrillPatternAnchors({feature,anchor,bounds,pattern}){
 if(!pattern)return [structuredClone(anchor)];const p=validateCadDrillPattern(pattern),axes={'box-face-top':[0,1],'box-face-bottom':[0,1],'box-face-left':[1,2],'box-face-right':[1,2],'box-face-front':[0,2],'box-face-back':[0,2],'cylinder-face-top':[0,1],'cylinder-face-bottom':[0,1]}[feature];if(!axes)fail('Muster benötigt eine Quaderfläche.');
 const total=p.kind==='grid'?p.columns*p.rows:p.kind==='mirror'?2:p.count,omitted=new Set(p.skip),result=[];
 for(let i=0;i<total;i++){
  if(omitted.has(i))continue;let u=0,v=0;
  if(p.kind==='line'){u=p.step[0]*i;v=p.step[1]*i;}
  else if(p.kind==='grid'){u=p.step[0]*(i%p.columns)+p.rowStep[0]*Math.floor(i/p.columns);v=p.step[1]*(i%p.columns)+p.rowStep[1]*Math.floor(i/p.columns);}
  else if(p.kind==='circle'){const span=p.angle??360,angle=((p.startAngle??0)+span*i/(Math.abs(span)===360?p.count:p.count-1))*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),scale=(p.radius??Math.hypot(...p.center))/Math.hypot(...p.center),x=-p.center[0]*scale,y=-p.center[1]*scale;u=p.center[0]+c*x-s*y;v=p.center[1]+s*x+c*y;}
  else if(i){if(p.axis==='u')u=2*p.offset;else v=2*p.offset;}
  const point=[...anchor.point];point[axes[0]]+=u;point[axes[1]]+=v;const next={point,normal:[...anchor.normal]};
  if(!(feature.startsWith('cylinder-')?remapCadCylinderFaceAnchor:remapCadBoxFaceAnchor)({feature,anchor:next,previousBounds:bounds,currentBounds:bounds}))fail('Musterposition liegt außerhalb oder am Rand der Quaderfläche.');result.push(next);
 }
 return result;
}
