// Geometric witnesses, not stored numeric overrides. Paper placement and scale
// never enter these calculations. Unsupported fitted/spline curves are explicit.
const TAU=Math.PI*2,mod=a=>(a%TAU+TAU)%TAU;
export const CAD_DRAWING_POINT_ROLES=Object.freeze(['a','b','center','minX','maxX','minY','maxY']);
function fail(){throw Error('Dieser Maßbezug benötigt eine gerade Kante, einen Kreis, Kreisbogen oder eine Ellipse.');}
function at(c,t){return c.kind==='ellipse'?c.center.map((v,k)=>v+c.radii[0]*Math.cos(t)*c.xAxis[k]+c.radii[1]*Math.sin(t)*c.yAxis[k]):c.center.map((v,k)=>v+c.radius*(k?Math.sin(t):Math.cos(t)));}
function onArc(c,t){if(c.kind==='circle'||c.closed)return true;const reverse=c.kind!=='ellipse'&&c.clockwise,span=reverse?mod(c.startAngle-c.endAngle):mod(c.endAngle-c.startAngle),offset=reverse?mod(c.startAngle-t):mod(t-c.startAngle);return offset<=span+1e-12;}
export function cadDrawingCurvePoint(c,role){
 if(!c||!CAD_DRAWING_POINT_ROLES.includes(role))fail();
 if(role==='a'||role==='b'){if(c.kind!=='line')fail();return [...c[role]];}
 if(role==='center'){if(!['circle','arc','ellipse'].includes(c.kind))fail();return [...c.center];}
 if(c.kind==='line'){const axis=role.endsWith('X')?0:1,low=role.startsWith('min');return [...((c.a[axis]<=c.b[axis])===low?c.a:c.b)];}
 if(!['circle','arc','ellipse'].includes(c.kind))fail();
 const axis=role.endsWith('X')?0:1,low=role.startsWith('min'),t=c.kind==='ellipse'?Math.atan2(c.radii[1]*c.yAxis[axis],c.radii[0]*c.xAxis[axis]):axis?Math.PI/2:0;
 const candidates=[t,t+Math.PI].filter(a=>onArc(c,a)).map(a=>at(c,a));
 if(c.kind!=='circle'&&!c.closed)candidates.push(at(c,c.startAngle),at(c,c.endAngle));
 if(!candidates.length)fail();
 return candidates.reduce((a,b)=>(low?b[axis]<a[axis]:b[axis]>a[axis])?b:a);
}
export function cadDrawingCurveBounds(c){
 const points=['minX','maxX','minY','maxY'].map(role=>cadDrawingCurvePoint(c,role));
 return {min:[points[0][0],points[2][1]],max:[points[1][0],points[3][1]]};
}
