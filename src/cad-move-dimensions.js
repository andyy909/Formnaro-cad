import {cadPoint,inverseCadMatrix} from './cad-affine.js';

// Measure the actual snapped translation in the active workplane. The initial
// footprint stays fixed throughout the gesture; all annotations lie on z=0.
export function moveDimensionLines({bounds,planeMatrix,delta,gap}) {
  const inverse=inverseCadMatrix(planeMatrix),corners=Array.from({length:8},(_,n)=>cadPoint(inverse,[0,1,2].map(k=>n&(1<<k)?bounds.max[k]:bounds.min[k])));
  const base=[0,1].map(k=>Math.min(...corners.map(p=>p[k]))),shift=[0,1,2].map(k=>delta.reduce((sum,v,j)=>sum+inverse[j*4+k]*v,0));
  const current=base.map((v,k)=>v+shift[k]),world=p=>cadPoint(planeMatrix,[...p,0]);
  return [0,1].map(axis=>{
    const other=1-axis,lane=Math.min(base[other],current[other])-gap,a=base.slice(),b=current.slice();a[other]=lane;b[other]=lane;
    return {axis,value:shift[axis],start:world(a),end:world(b),from:world(base),to:world(current)};
  });
}

export function createMoveDimensions({viewport,projectPoint,getPreferences}) {
  const ns='http://www.w3.org/2000/svg',overlay=document.createElement('div'),svg=document.createElementNS(ns,'svg');
  overlay.className='cad-move-dimensions';overlay.hidden=true;overlay.setAttribute('aria-hidden','true');overlay.append(svg);
  const rows=[0,1].map(axis=>{
    const guides=document.createElementNS(ns,'path'),line=document.createElementNS(ns,'path'),label=document.createElement('div');
    guides.classList.add('cad-move-guides');label.className='cad-move-dimension';label.dataset.axis=String(axis);svg.append(guides,line);overlay.append(label);return {guides,line,label};
  });
  viewport.append(overlay);let state=null,lastDraw=null;
  function draw() {
    if(!state)return;
    const rect=viewport.getBoundingClientRect(),english=getPreferences().language==='en',data=moveDimensionLines(state);
    const projected=data.map(row=>({...row,points:[row.start,row.end,row.from,row.to].map(projectPoint)}));
    const signature=JSON.stringify([projected,rect.left,rect.top,rect.width,rect.height,english]);if(signature===lastDraw)return;lastDraw=signature;
    if(projected.some(row=>row.points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.z < -1||p.z > 1))){overlay.hidden=true;return;}
    overlay.hidden=false;const occupied=[];
    projected.forEach(({axis,value,points},index)=>{
      const {guides,line,label}=rows[index],[a,b,from,to]=points.map(p=>({x:p.x-rect.left,y:p.y-rect.top})),dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
      let nx=length>1?-dy/length:axis===0?0:-1,ny=length>1?dx/length:axis===0?1:0;
      const mx=(a.x+b.x)/2,my=(a.y+b.y)/2,cx=(from.x+to.x)/2,cy=(from.y+to.y)/2;
      if(nx*(mx-cx)+ny*(my-cy)<0){nx=-nx;ny=-ny;}
      guides.setAttribute('d',`M ${from.x} ${from.y} L ${a.x+nx*6} ${a.y+ny*6} M ${to.x} ${to.y} L ${b.x+nx*6} ${b.y+ny*6}`);
      const ux=length>1?dx/length:1,uy=length>1?dy/length:0;
      const arrow=length>=10?`M ${b.x-ux*7+nx*3} ${b.y-uy*7+ny*3} L ${b.x} ${b.y} L ${b.x-ux*7-nx*3} ${b.y-uy*7-ny*3}`:'';
      line.setAttribute('d',`M ${a.x-nx*5} ${a.y-ny*5} L ${a.x+nx*5} ${a.y+ny*5} M ${a.x} ${a.y} L ${b.x} ${b.y} ${arrow}`);
      const displayValue=Math.abs(value)<.005?0:value;
      label.dataset.value=String(value);label.textContent=`${'XY'[axis]} · ${displayValue.toLocaleString(english?'en-US':'de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})} mm`;
      const halfWidth=label.offsetWidth/2,halfHeight=label.offsetHeight/2;
      const clampX=x=>Math.max(halfWidth+8,Math.min(rect.width-halfWidth-8,x)),clampY=y=>Math.max(halfHeight+64,Math.min(rect.height-halfHeight-64,y));
      let x=clampX(mx+nx*(halfWidth*Math.abs(nx)+halfHeight*Math.abs(ny)+12)),y=clampY(my+ny*(halfWidth*Math.abs(nx)+halfHeight*Math.abs(ny)+12));
      for(let attempt=0;attempt<6&&occupied.some(r=>Math.abs(r.x-x)<r.halfWidth+halfWidth+8&&Math.abs(r.y-y)<r.halfHeight+halfHeight+6);attempt++)y=clampY(y+(y+2*halfHeight+8<rect.height-halfHeight-64?1:-1)*(2*halfHeight+8));
      occupied.push({x,y,halfWidth,halfHeight});label.style.left=x+'px';label.style.top=y+'px';
    });
  }
  return {update(value){state=value;draw();},draw,hide(){state=null;lastDraw=null;overlay.hidden=true;},dispose(){overlay.remove();}};
}
