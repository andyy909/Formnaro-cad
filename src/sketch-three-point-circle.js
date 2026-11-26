import {circleThrough} from './sketch-profile.js';
// Shared planar circle through three points. No editor or kernel dependency.
// sketch-profile.js keeps its join tolerance private, so the same 1e-7 mm
// limit is applied here for coincident points and relative straightness.
const POINT_TOLERANCE=1e-7;
const fail=message=>{throw Error('Skizze: '+message);};
const finitePoint=point=>Array.isArray(point)&&point.length===2&&point.every(value=>Number.isFinite(value));
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function sketchCircleFromThreePoints(start,through,end){
 const points=[start,through,end];
 if(!points.every(finitePoint))fail('Drei Punkte als [x,y] mit endlichen Zahlen angeben.');
 for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)if(distance(points[i],points[j])<=POINT_TOLERANCE)fail('Kreis benötigt drei verschiedene Punkte.');
 const scale=Math.max(distance(start,through),distance(through,end),distance(start,end));
 const twiceArea=Math.abs((through[0]-start[0])*(end[1]-start[1])-(through[1]-start[1])*(end[0]-start[0]));
 if(twiceArea<=POINT_TOLERANCE*scale*scale)fail('Kreisbogen benötigt drei nicht geradlinige Punkte.');
 const {center,radius}=circleThrough(start,through,end);
 return {center,radius};
}
