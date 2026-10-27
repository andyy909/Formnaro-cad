import {cadPoint} from './cad-affine.js';

// Nine persistent DOM controls follow native bounds in the chosen CAD frame.
// Screen-space leaders keep the targets usable at every camera zoom.
export function createCadAlignMarkers({viewport,projectPoint,getPreferences,onAlign,onPreview,onClearPreview}){
  const ns='http://www.w3.org/2000/svg',root=document.createElement('div'),svg=document.createElementNS(ns,'svg');
  root.className='cad-align-markers';root.hidden=true;root.append(svg);viewport.append(root);let state=null,lastDraw=null;
  const box=document.createElementNS(ns,'path');box.classList.add('cad-align-box');svg.append(box);
  const rows=[];
  for(let axis=0;axis<3;axis++)for(const mode of ['min','center','max']){
    const line=document.createElementNS(ns,'path'),button=document.createElement('button');
    button.className='cad-align-marker';button.dataset.alignAxis=String(axis);button.dataset.alignMode=mode;
    button.innerHTML='<span class="cad-align-dot"></span>';svg.append(line);root.append(button);
    button.addEventListener('pointerdown',event=>event.stopPropagation());
    button.onclick=()=>onAlign(axis,mode);
    button.onpointerenter=button.onfocus=()=>{if(!button.disabled)onPreview(axis,mode);};
    button.onpointerleave=button.onblur=()=>onClearPreview();
    rows.push({axis,mode,line,button});
  }
  function draw(){
    if(!state)return;
    const rect=viewport.getBoundingClientRect(),{bounds,frame,axisNames,plans}=state;
    const corners=Array.from({length:8},(_,n)=>projectPoint(cadPoint(frame,[0,1,2].map(k=>n&(1<<k)?bounds.max[k]:bounds.min[k]))));
    const signature=JSON.stringify([corners,rect.left,rect.top,rect.width,rect.height,axisNames,plans,getPreferences().language]);if(signature===lastDraw)return;lastDraw=signature;
    root.hidden=corners.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.z < -1||p.z > 1);if(root.hidden)return;
    const origin={x:corners.reduce((s,p)=>s+p.x,0)/8,y:corners.reduce((s,p)=>s+p.y,0)/8},occupied=[];
    const edgePaths=[];for(let n=0;n<8;n++)for(let k=0;k<3;k++)if(!(n&(1<<k))){const a=corners[n],b=corners[n|(1<<k)];edgePaths.push(`M ${a.x-rect.left} ${a.y-rect.top} L ${b.x-rect.left} ${b.y-rect.top}`);}box.setAttribute('d',edgePaths.join(' '));
    for(let axis=0;axis<3;axis++){
      // Choose the outermost projected parallel edge, away from the part centre.
      const edges=corners.flatMap((a,n)=>{
        if(n&(1<<axis))return [];const b=corners[n|(1<<axis)],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
        let nx=length>2?-dy/length:axis===2?1:-1,ny=length>2?dx/length:0;
        if(nx*(mx-origin.x)+ny*(my-origin.y)<0){nx=-nx;ny=-ny;}
        return [{a,b,length,nx,ny,mx,my,score:axis===0?my-origin.y:axis===1?origin.x-mx:mx-origin.x}];
      }).sort((a,b)=>b.score-a.score);
      const edge=edges[0];
      for(let index=0;index<3;index++){
        const row=rows[axis*3+index],t=index/2,a={x:edge.a.x+(edge.b.x-edge.a.x)*t,y:edge.a.y+(edge.b.y-edge.a.y)*t};
        let x=a.x+edge.nx*62-rect.left,y=a.y+edge.ny*62-rect.top;
        if(edge.length<80){const ux=edge.length>3?(edge.b.x-edge.a.x)/edge.length:0,uy=edge.length>3?(edge.b.y-edge.a.y)/edge.length:-1;x=edge.mx+edge.nx*62-rect.left+(index-1)*40*ux;y=edge.my+edge.ny*62-rect.top+(index-1)*40*uy;}
        x=Math.max(30,Math.min(rect.width-30,x));y=Math.max(104,Math.min(rect.height-78,y));
        for(let tries=0;tries<16&&occupied.some(p=>Math.hypot(x-p.x,y-p.y)<35);tries++){x=Math.max(30,Math.min(rect.width-30,x+edge.nx*36));y=Math.max(104,Math.min(rect.height-78,y+(edge.ny||-1)*36));}
        occupied.push({x,y});row.button.style.left=x+'px';row.button.style.top=y+'px';
        row.line.setAttribute('d',`M ${a.x-rect.left} ${a.y-rect.top} L ${x} ${y}`);
        const english=getPreferences().language==='en',label=axisNames[axis]+': '+(english?['Minimum','Centre','Maximum']:['Minimum','Mitte','Maximum'])[index]+(english?' align':' ausrichten');
        row.button.title=label;row.button.setAttribute('aria-label',label);
        row.button.classList.toggle('already-aligned',!plans[axis][row.mode].length);row.button.disabled=!plans[axis][row.mode].length;
      }
    }
  }
  return {set(value){onClearPreview();state=value;lastDraw=null;root.hidden=!value;if(value)draw();},draw,hide(){state=null;lastDraw=null;root.hidden=true;onClearPreview();},dispose(){root.remove();onClearPreview();}};
}
