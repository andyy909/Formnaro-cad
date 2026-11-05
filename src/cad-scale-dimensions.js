import {cadPoint} from './cad-affine.js';

// Screen-space annotations of the same local CAD bounds used by corner resize.
// No geometry queries or model mutations are needed during a pointer move.
export function createScaleDimensions({viewport,projectPoint,getPreferences}) {
  const ns='http://www.w3.org/2000/svg',overlay=document.createElement('div');
  overlay.className='cad-scale-dimensions';overlay.hidden=true;
  const svg=document.createElementNS(ns,'svg');overlay.append(svg);
  const rows=[0,1,2].map(axis=>{
    const path=document.createElementNS(ns,'path'),label=document.createElement('div');
    label.className='cad-scale-dimension';label.dataset.axis=String(axis);
    svg.append(path);overlay.append(label);return {path,label};
  });
  viewport.append(overlay);let state=null,lastDraw=null;
  function update({bounds,worldMatrix,sizes}) {state={bounds,worldMatrix,sizes};draw();}
  function draw() {
    if(!state)return;
    const rect=viewport.getBoundingClientRect(),{bounds,worldMatrix,sizes}=state;
    const corners=Array.from({length:8},(_,n)=>projectPoint(cadPoint(worldMatrix,[0,1,2].map(k=>n&(1<<k)?bounds.max[k]:bounds.min[k]))));
    const signature=JSON.stringify([corners,rect.left,rect.top,rect.width,rect.height,sizes,getPreferences().language]);if(signature===lastDraw)return;lastDraw=signature;
    if(corners.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.z < -1||p.z > 1)){overlay.hidden=true;return;}
    overlay.hidden=false;
    const center={x:corners.reduce((s,p)=>s+p.x,0)/8,y:corners.reduce((s,p)=>s+p.y,0)/8};
    const english=getPreferences().language==='en',names=english?['Width','Depth','Height']:['Breite','Tiefe','Höhe'];
    const occupied=[];
    rows.forEach(({path,label},axis)=>{
      const candidates=corners.flatMap((a,n)=>{
        if(n&(1<<axis))return [];const b=corners[n|(1<<axis)],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
        if(length<8)return [];let nx=-dy/length,ny=dx/length;
        const mx=(a.x+b.x)/2,my=(a.y+b.y)/2;if(nx*(mx-center.x)+ny*(my-center.y)<0){nx=-nx;ny=-ny;}
        return [{a,b,dx,dy,length,nx,ny,mx,my,score:Math.hypot(mx-center.x,my-center.y)}];
      }).sort((a,b)=>b.score-a.score);
      const edge=candidates[0];let x,y;
      if(edge){
        const {a,b,nx,ny,dx,dy,length}=edge,ax=a.x+nx*34-rect.left,ay=a.y+ny*34-rect.top,bx=b.x+nx*34-rect.left,by=b.y+ny*34-rect.top,ux=dx/length,uy=dy/length;
        const arrow=(px,py,sign)=>`M ${px+ux*sign*7+nx*3} ${py+uy*sign*7+ny*3} L ${px} ${py} L ${px+ux*sign*7-nx*3} ${py+uy*sign*7-ny*3}`;
        path.setAttribute('d',`M ${a.x-rect.left} ${a.y-rect.top} L ${ax+nx*7} ${ay+ny*7} M ${b.x-rect.left} ${b.y-rect.top} L ${bx+nx*7} ${by+ny*7} M ${ax} ${ay} L ${bx} ${by} ${arrow(ax,ay,1)} ${arrow(bx,by,-1)}`);
        x=edge.mx+nx*65-rect.left;y=edge.my+ny*65-rect.top;
      }else{
        path.setAttribute('d','');x=Math.max(...corners.map(p=>p.x))-rect.left+76;y=center.y-rect.top+axis*44;
      }
      label.dataset.value=String(sizes[axis]);
      label.textContent=`${'XYZ'[axis]} · ${names[axis]} ${sizes[axis].toLocaleString(english?'en-US':'de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})} mm`;
      const halfWidth=label.offsetWidth/2,halfHeight=label.offsetHeight/2;
      const minY=Math.max(110,halfHeight+4),maxY=Math.max(minY,rect.height-96);
      x=Math.max(halfWidth+4,Math.min(rect.width-halfWidth-4,x));
      y=Math.max(minY,Math.min(maxY,y));
      const overlap=position=>occupied.some(p=>Math.abs(x-p.x)<halfWidth+p.halfWidth+4&&Math.abs(position-p.y)<halfHeight+p.halfHeight+4);
      if(overlap(y)){
        const candidates=[minY,maxY,...occupied.flatMap(p=>[p.y-p.halfHeight-halfHeight-5,p.y+p.halfHeight+halfHeight+5])];
        const available=candidates.filter(candidate=>candidate>=minY&&candidate<=maxY&&!overlap(candidate));
        if(available.length)y=available.reduce((closest,candidate)=>Math.abs(candidate-y)<Math.abs(closest-y)?candidate:closest);
      }
      occupied.push({x,y,halfWidth,halfHeight});
      label.style.left=x+'px';label.style.top=y+'px';
    });
  }
  return {update,draw,hide(){state=null;lastDraw=null;overlay.hidden=true;},dispose(){overlay.remove();}};
}
