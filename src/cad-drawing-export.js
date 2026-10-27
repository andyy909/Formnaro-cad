import {validateCadDrawingSheet,cadDrawingPaperSize,cadDrawingProblems,cadDrawingDimension} from './cad-drawing-data.js';

const TAU=Math.PI*2,mod=a=>(a%TAU+TAU)%TAU;
const num=n=>{if(!Number.isFinite(n))throw Error('Zeichnung enthält keine endlichen Koordinaten.');return String(n===0?0:n);};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const at=(c,t)=>c.kind==='ellipse'?c.center.map((v,k)=>v+c.radii[0]*Math.cos(t)*c.xAxis[k]+c.radii[1]*Math.sin(t)*c.yAxis[k]):c.center.map((v,k)=>v+c.radius*(k?Math.sin(t):Math.cos(t)));
const pathPoint=p=>p.map(num).join(' ');
const paperPoint=(view,scale,p)=>[view.position[0]+p[0]*scale,view.position[1]-p[1]*scale];
const drawingOrder=curves=>[...curves].sort((a,b)=>Number(b.hidden)-Number(a.hidden));

function ready(value,options){const sheet=validateCadDrawingSheet(value),problems=cadDrawingProblems(sheet,options);if(problems.length&&!options.allowStale){const error=Error(problems.map(p=>p.message).join(' '));error.code='CAD_DRAWING_UPDATE_REQUIRED';error.problems=problems;throw error;}return sheet;}
function splitBezier(values){const layers=[values.map(v=>[...v])];while(layers.at(-1).length>1)layers.push(layers.at(-1).slice(0,-1).map((v,i)=>v.map((x,k)=>(x+layers.at(-1)[i+1][k])/2)));return [layers.map(row=>row[0]),layers.map(row=>row.at(-1)).reverse()];}
function lineDistance(p,a,b){const d=b.map((v,k)=>v-a[k]),dd=d[0]**2+d[1]**2,t=dd?Math.max(0,Math.min(1,((p[0]-a[0])*d[0]+(p[1]-a[1])*d[1])/dd)):0;return Math.hypot(p[0]-a[0]-t*d[0],p[1]-a[1]-t*d[1]);}
// Positive rational Bézier curves lie inside their Euclidean control hull.
// Subdivision therefore supplies a conservative distance bound for each chord.
export function cadDrawingBezierPolyline(curve,{tolerance=.01,maxPoints=200000}={}){
 const first=curve.poles[0],points=[[...first]];let maxDeviation=0;
 function visit(h,depth){const p=h.map(v=>[v[0]/v[2],v[1]/v[2]]),bound=Math.max(...p.map(v=>lineDistance(v,p[0],p.at(-1))));if(bound<=tolerance){maxDeviation=Math.max(maxDeviation,bound);points.push(p.at(-1));if(points.length>maxPoints)throw Error('Zeichnung überschreitet die Kurvenpunktgrenze.');return;}if(depth>=30)throw Error('Zeichnungskurve erreicht die geforderte Abweichungsgrenze nicht.');for(const part of splitBezier(h))visit(part,depth+1);}
 visit(curve.poles.map((p,i)=>[p[0]*curve.weights[i],p[1]*curve.weights[i],curve.weights[i]]),0);return {points,maxDeviation,proof:'positive-rational-bezier-control-hull'};
}
function curveSvg(c,tolerance){
 if(c.kind==='line')return `<path d="M${pathPoint(c.a)} L${pathPoint(c.b)}"/>`;
 if(c.kind==='circle')return `<circle cx="${num(c.center[0])}" cy="${num(c.center[1])}" r="${num(c.radius)}"/>`;
 if(c.kind==='polyline')return `<polyline points="${c.points.map(p=>p.map(num).join(',')).join(' ')}" data-max-deviation-mm="${num(c.maxDeviation)}" data-error-bound="${c.proof}"/>`;
 if(c.kind==='bezier'){
  if(c.weights.every(w=>w===c.weights[0])&&c.poles.length<=4){const commands={2:'L',3:'Q',4:'C'};return `<path d="M${pathPoint(c.poles[0])} ${commands[c.poles.length]}${c.poles.slice(1).map(pathPoint).join(' ')}"/>`;}
  return curveSvg({kind:'polyline',...cadDrawingBezierPolyline(c,{tolerance})},tolerance);
 }
 const ellipse=c.kind==='ellipse',span=ellipse?(c.closed?TAU:mod(c.endAngle-c.startAngle)):(c.clockwise?-mod(c.startAngle-c.endAngle):mod(c.endAngle-c.startAngle));
 if(Math.abs(span)<1e-14)return '';
 const count=Math.max(1,Math.ceil(Math.abs(span)/Math.PI)),rx=ellipse?c.radii[0]:c.radius,ry=ellipse?c.radii[1]:c.radius,rotation=ellipse?Math.atan2(c.xAxis[1],c.xAxis[0])*180/Math.PI:0,det=ellipse?c.xAxis[0]*c.yAxis[1]-c.xAxis[1]*c.yAxis[0]:1,sweep=span*det>=0?1:0;
 let d='M'+pathPoint(at(c,c.startAngle));for(let i=1;i<=count;i++)d+=` A${num(rx)} ${num(ry)} ${num(rotation)} 0 ${sweep} ${pathPoint(at(c,c.startAngle+span*i/count))}`;if(ellipse&&c.closed)d+=' Z';return `<path d="${d}"/>`;
}

export function cadDrawingAnnotationGeometry(sheet,a){
 if(a.kind==='label')return {text:a.text,position:a.position,lines:[],arcs:[]};
 const result=cadDrawingDimension(sheet,a),{view,curves}=result,p=p=>paperPoint(view,sheet.scale,p),lines=[],arcs=[];
 if(a.kind==='distance'){
  const [first,last]=result.points.map(p),axis=a.axis==='x'?0:1,other=1-axis,start=[...first],end=[...last];start[other]=end[other]=a.position[other];lines.push([first,start],[last,end],[start,end]);
  if(a.position[axis]<Math.min(start[axis],end[axis])||a.position[axis]>Math.max(start[axis],end[axis]))lines.push([Math.abs(a.position[axis]-start[axis])<Math.abs(a.position[axis]-end[axis])?start:end,a.position]);
 }else if(a.kind==='length'){
  const [first,last]=result.points.map(p),delta=last.map((x,k)=>x-first[k]),length=Math.hypot(...delta),n=[-delta[1]/length,delta[0]/length],offset=(a.position[0]-first[0])*n[0]+(a.position[1]-first[1])*n[1],start=first.map((x,k)=>x+n[k]*offset),end=last.map((x,k)=>x+n[k]*offset);
  lines.push([first,start],[last,end],[start,end]);
 }else if(a.kind==='angle'){
  const [c,d]=curves,u=c.b.map((x,k)=>x-c.a[k]),v=d.b.map((x,k)=>x-d.a[k]),cross=u[0]*v[1]-u[1]*v[0],w=d.a.map((x,k)=>x-c.a[k]);
  if(Math.abs(cross)>1e-12*Math.hypot(...u)*Math.hypot(...v)){
   const t=(w[0]*v[1]-w[1]*v[0])/cross,center=c.a.map((x,k)=>x+t*u[k]),cp=p(center),r=Math.max(4,Math.min(40,Math.hypot(a.position[0]-cp[0],a.position[1]-cp[1]))),start=Math.atan2(-u[1],u[0]),raw=Math.atan2(-v[1],v[0]),span=Math.atan2(Math.sin(raw-start),Math.cos(raw-start));
   arcs.push({center:cp,radius:r,startAngle:start,endAngle:start+span,clockwise:span<0});lines.push([cp,[cp[0]+r*Math.cos(start),cp[1]+r*Math.sin(start)]],[cp,[cp[0]+r*Math.cos(start+span),cp[1]+r*Math.sin(start+span)]]);
  }else lines.push([p(c.a),a.position],[p(d.a),a.position]);
 }else{
  const c=curves[0],center=p(c.center),direction=a.position.map((x,k)=>x-center[k]),length=Math.hypot(...direction);let unit=length?direction.map(x=>x/length):[1,0];
  if(c.kind==='arc'){const angle=Math.atan2(-unit[1],unit[0]),sweep=c.clockwise?mod(c.startAngle-c.endAngle):mod(c.endAngle-c.startAngle),offset=c.clockwise?mod(c.startAngle-angle):mod(angle-c.startAngle);if(offset>sweep+1e-12){const delta=t=>Math.abs(Math.atan2(Math.sin(t-angle),Math.cos(t-angle))),endpoint=delta(c.startAngle)<=delta(c.endAngle)?c.startAngle:c.endAngle;unit=[Math.cos(endpoint),-Math.sin(endpoint)];}}
  const r=c.radius*sheet.scale,edge=center.map((x,k)=>x+r*unit[k]);
  if(a.kind==='diameter')lines.push([center.map((x,k)=>x-r*unit[k]),edge]);else lines.push([center,edge]);lines.push([edge,a.position]);
 }
 return {text:result.text,position:a.position,lines,arcs};
}

export function cadDrawingSvg(value,options={}){
 const sheet=ready(value,options),[width,height]=cadDrawingPaperSize(sheet),interactive=options.interactive===true,attrs=(name,id)=>interactive?` data-drawing-${name}="${esc(id)}"`:'';
 const title=sheet.titleBlock,margin=10,blockWidth=Math.min(180,width-20),blockX=width-margin-blockWidth,blockY=height-40,content=[];
 content.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="white"/><g fill="none" stroke="#222" stroke-width="0.25"><rect x="${margin}" y="${margin}" width="${width-2*margin}" height="${height-2*margin}"/><rect x="${blockX}" y="${blockY}" width="${blockWidth}" height="30"/><path d="M${blockX} ${blockY+15} H${width-margin} M${blockX+blockWidth*.55} ${blockY+15} V${height-margin}"/></g>`);
 content.push(`<g fill="#111" font-family="Arial, sans-serif" font-size="3.2"><text x="${blockX+3}" y="${blockY+6}">${esc(title.title||sheet.name)}</text><text x="${blockX+3}" y="${blockY+12}">${esc(title.number)}</text><text x="${blockX+3}" y="${blockY+21}">${esc(title.author)} · ${esc(title.date)}</text><text x="${blockX+3}" y="${blockY+27}">Rev. ${esc(title.revision)}</text><text x="${blockX+blockWidth*.55+3}" y="${blockY+21}">${sheet.paper} · ${esc(sheet.scale>=1?num(sheet.scale)+':1':'1:'+num(1/sheet.scale))}</text><text x="${blockX+blockWidth*.55+3}" y="${blockY+27}">mm · Formnaro</text></g>`);
 for(const view of sheet.views){
  if(!view.projection){if(interactive)content.push(`<g${attrs('view',view.id)}><rect x="${view.position[0]-20}" y="${view.position[1]-15}" width="40" height="30" fill="#f4f4f4" stroke="#777" stroke-dasharray="2 1"/><text x="${view.position[0]}" y="${view.position[1]}" text-anchor="middle" font-size="3">Blatt aktualisieren</text></g>`);continue;}
  const curves=drawingOrder(view.projection.curves).map(c=>{const geometry=curveSvg(c,view.projection.tolerance);return `<g${attrs('curve',c.id)}${c.hidden?' stroke-dasharray="'+num(1/sheet.scale)+' '+num(1/sheet.scale)+'"':''}>${interactive?`<g stroke="transparent" stroke-width="${num(3/sheet.scale)}" pointer-events="stroke">${geometry}</g><g pointer-events="none">${geometry}</g>`:geometry}</g>`;}).join('');
  content.push(`<g${attrs('view',view.id)} transform="translate(${view.position.map(num).join(' ')}) scale(${num(sheet.scale)} ${num(-sheet.scale)})" fill="none" stroke="#111" stroke-width="${num(.25/sheet.scale)}" stroke-linecap="round" stroke-linejoin="round">${curves}</g>`);
 }
 for(const a of sheet.annotations){
  let g;try{g=cadDrawingAnnotationGeometry(sheet,a);}catch(error){if(!options.allowStale)throw error;g={text:'Bezug verloren',position:a.position,lines:[],arcs:[]};}
  const lines=g.lines.map(([p,q])=>`<path d="M${pathPoint(p)} L${pathPoint(q)}"/>`).join(''),arcs=g.arcs.map(c=>curveSvg({kind:'arc',...c},.01)).join('');
  content.push(`<g${attrs('annotation',a.id)}><g fill="none" stroke="#333" stroke-width="0.18">${lines}${arcs}</g><text x="${num(g.position[0])}" y="${num(g.position[1]-.7)}" text-anchor="middle" fill="#111" stroke="white" stroke-width="0.8" paint-order="stroke" font-family="Arial, sans-serif" font-size="3.5">${esc(g.text)}</text></g>`);
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" data-formnaro-drawing="1" role="img" aria-label="${esc(sheet.name)}">${content.join('')}</svg>`;
}

const dxfText=s=>String(s).replace(/\\/g,'\\U+005C').replace(/[^\x20-\x7e]/g,c=>'\\U+'+c.charCodeAt(0).toString(16).toUpperCase().padStart(4,'0')).replace(/[\r\n]/g,' ');
function ellipseDxf(c){
 const swap=c.radii[1]>c.radii[0],axis=swap?c.yAxis:c.xAxis,major=swap?c.radii[1]:c.radii[0],minor=swap?c.radii[0]:c.radii[1],det=c.xAxis[0]*c.yAxis[1]-c.xAxis[1]*c.yAxis[0],normal=Math.sign(det),shift=swap?-Math.PI/2:0;
 return {major:axis.map(x=>x*major),ratio:minor/major,normal,start:c.closed?0:mod(c.startAngle+shift),end:c.closed?TAU:mod(c.endAngle+shift)};
}
/** Model-space export: independent views are tiled without scaling. Paper
 * scale and paper moves cannot change any geometric length, radius or area. */
export function cadDrawingDxf(value,options={}){
 const sheet=ready(value,options),pairs=[],put=(...values)=>{for(let i=0;i<values.length;i+=2)pairs.push(String(values[i]),String(values[i+1]));},point=(code,p)=>put(code,num(p[0]),code+10,num(p[1]),code+20,0),layers=['0','ANNOTATIONS',...sheet.views.map((_,i)=>'VIEW_'+(i+1))];let handle=256;
 put(0,'SECTION',2,'HEADER',9,'$ACADVER',1,'AC1015',9,'$DWGCODEPAGE',3,'ANSI_1252',9,'$INSUNITS',70,4,9,'$MEASUREMENT',70,1,9,'$DIMASSOC',280,0,0,'ENDSEC');
 put(0,'SECTION',2,'TABLES',0,'TABLE',2,'LTYPE',5,(handle++).toString(16),330,0,100,'AcDbSymbolTable',70,2,0,'LTYPE',5,(handle++).toString(16),100,'AcDbSymbolTableRecord',100,'AcDbLinetypeTableRecord',2,'CONTINUOUS',70,0,3,'Solid line',72,65,73,0,40,0,0,'LTYPE',5,(handle++).toString(16),100,'AcDbSymbolTableRecord',100,'AcDbLinetypeTableRecord',2,'HIDDEN',70,0,3,'Hidden edge',72,65,73,2,40,3,49,2,74,0,49,-1,74,0,0,'ENDTAB');
 put(0,'TABLE',2,'LAYER',5,(handle++).toString(16),330,0,100,'AcDbSymbolTable',70,layers.length);for(const layer of layers)put(0,'LAYER',5,(handle++).toString(16),100,'AcDbSymbolTableRecord',100,'AcDbLayerTableRecord',2,layer,70,0,62,7,6,'CONTINUOUS');put(0,'ENDTAB',0,'ENDSEC',0,'SECTION',2,'BLOCKS',0,'ENDSEC',0,'SECTION',2,'ENTITIES');
 const entity=(kind,layer,subclass,hidden=false)=>{put(0,kind,5,(handle++).toString(16),100,'AcDbEntity',8,layer);if(hidden)put(6,'HIDDEN');put(100,subclass);};
 const line=(a,b,layer,hidden=false)=>{entity('LINE',layer,'AcDbLine',hidden);point(10,a);point(11,b);};
 const label=(text,p,layer='ANNOTATIONS',height=2.5)=>{entity('TEXT',layer,'AcDbText');point(10,p);put(40,height,1,dxfText(text),50,0,100,'AcDbText');};
 function writeCurve(c,offset,layer){
  const p=v=>v.map((x,k)=>x+offset[k]);
  if(c.kind==='line'){line(p(c.a),p(c.b),layer,c.hidden);return;}
  if(c.kind==='circle'||c.kind==='arc'){entity(c.kind==='circle'?'CIRCLE':'ARC',layer,'AcDbCircle',c.hidden);point(10,p(c.center));put(40,num(c.radius));if(c.kind==='arc'){put(100,'AcDbArc',50,num(mod(c.clockwise?c.endAngle:c.startAngle)*180/Math.PI),51,num(mod(c.clockwise?c.startAngle:c.endAngle)*180/Math.PI));}return;}
  if(c.kind==='ellipse'){const e=ellipseDxf(c);entity('ELLIPSE',layer,'AcDbEllipse',c.hidden);point(10,p(c.center));point(11,e.major);put(210,0,220,0,230,e.normal,40,num(e.ratio),41,num(e.start),42,num(e.end));return;}
  if(c.kind==='bezier'){
   const degree=c.poles.length-1,rational=!c.weights.every(w=>w===c.weights[0]);entity('SPLINE',layer,'AcDbSpline',c.hidden);put(210,0,220,0,230,1,70,8+(rational?4:0)+(degree===1?16:0),71,degree,72,2*(degree+1),73,c.poles.length,74,0);for(let i=0;i<=degree;i++)put(40,0);for(let i=0;i<=degree;i++)put(40,1);if(rational)for(const weight of c.weights)put(41,num(weight));for(const pole of c.poles)point(10,p(pole));return;
  }
  entity('LWPOLYLINE',layer,'AcDbPolyline',c.hidden);put(90,c.points.length,70,0);for(const v of c.points){const q=p(v);put(10,num(q[0]),20,num(q[1]));}
 }
 let cursor=0;
 for(const [index,view]of sheet.views.entries()){
  if(!view.projection)continue;const bounds=view.projection.bounds,offset=[cursor-bounds.min[0],-bounds.min[1]],width=bounds.max[0]-bounds.min[0],height=bounds.max[1]-bounds.min[1],layer='VIEW_'+(index+1);
  for(const c of drawingOrder(view.projection.curves))writeCurve(c,offset,layer);
  label(({front:'Vorderansicht',side:'Seitenansicht',top:'Draufsicht',section:'Schnitt'})[view.kind],[cursor,height+8],layer);
  for(const a of sheet.annotations.filter(a=>a.kind!=='label'&&a.viewId===view.id)){
   const g=cadDrawingAnnotationGeometry(sheet,a),toModel=p=>[(p[0]-view.position[0])/sheet.scale+offset[0],-(p[1]-view.position[1])/sheet.scale+offset[1]];
   for(const [p,q]of g.lines)line(toModel(p),toModel(q),'ANNOTATIONS');
   for(const arc of g.arcs)writeCurve({kind:'arc',center:toModel(arc.center),radius:arc.radius/sheet.scale,startAngle:-arc.startAngle,endAngle:-arc.endAngle,clockwise:!arc.clockwise},[0,0],'ANNOTATIONS');
   label(g.text,toModel(g.position));
  }
  cursor+=width+20;
 }
 let labelY=-15;for(const a of sheet.annotations.filter(a=>a.kind==='label')){label(a.text,[0,labelY]);labelY-=5;}
 const title=sheet.titleBlock;label(title.title||sheet.name,[0,labelY]);label([title.number,title.revision,title.author,title.date].filter(Boolean).join(' | '),[0,labelY-5]);
 put(0,'ENDSEC',0,'EOF');return pairs.join('\r\n')+'\r\n';
}
