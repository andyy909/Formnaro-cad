import {zlibSync} from 'fflate';
import {cadBytesDigest} from '../src/cad-geometry-digest.js';
import {polygonContains} from '../src/cad-photo-data.js';
import {photoReferenceDigest,photoSetViewDefault} from '../src/cad-photo-multiview-data.js';
const u32=n=>Uint8Array.of(n>>>24,(n>>>16)&255,(n>>>8)&255,n&255);
const join=arrays=>{const out=new Uint8Array(arrays.reduce((n,a)=>n+a.length,0));let i=0;for(const a of arrays){out.set(a,i);i+=a.length;}return out;};
function chunk(name,data){const type=new TextEncoder().encode(name),bytes=join([type,data]);let crc=-1;for(const value of bytes){crc^=value;for(let k=0;k<8;k++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1;}return join([u32(data.length),bytes,u32((crc^-1)>>>0)]);}
export function polygonPng(outline,holes=[],{width=600,height=400,tint=119}={}){
 const pixels=new Uint8Array(height*(width*4+1));for(let y=0;y<height;y++)for(let x=0;x<width;x++){const on=polygonContains(outline,[x+.5,y+.5])&&!holes.some(h=>polygonContains(h,[x+.5,y+.5])),i=y*(width*4+1)+1+x*4;pixels[i]=pixels[i+1]=pixels[i+2]=on?tint:255;pixels[i+3]=255;}
 return join([Uint8Array.of(137,80,78,71,13,10,26,10),chunk('IHDR',join([u32(width),u32(height),Uint8Array.of(8,6,0,0,0)])),chunk('IDAT',zlibSync(pixels)),chunk('IEND',new Uint8Array())]);
}
export function multiViewFixture({stepped=false,holes=false}={}){
 const dims=[40,20,30],keys=['front','right','top'],worldContours=[stepped?[[0,0],[40,0],[40,20],[20,20],[20,30],[0,30]]:[[0,0],[40,0],[40,30],[0,30]],[[0,0],[20,0],[20,30],[0,30]],[[0,0],[40,0],[40,20],[0,20]]];
 const items=keys.map((view,i)=>{const outline=worldContours[i].map(([x,y])=>[100+10*x,350-10*y]),openings=holes&&i===0?[[[5,5],[10,5],[10,10],[5,10]].map(([x,y])=>[100+10*x,350-10*y])]:[],bytes=polygonPng(outline,openings,{tint:119+i}),digest=cadBytesDigest(bytes),reference={version:1,imageId:'photo-'+digest.slice(0,16),digest,name:'Synthetische '+view,width:600,height:400,view,scale:{points:[[50,30],[450,30]],mm:40,referenceErrorMm:.01,pickErrorPx:.25,source:'user',note:'Bekannte synthetische 40-mm-Referenz'},dimensions:[],outline,holes:openings,unknowns:['Innere Hohlräume nur als ausdrücklich erklärte Annahme']};return {reference,image:{mimeType:'image/png',dataUrl:'data:image/png;base64,'+Buffer.from(bytes).toString('base64')}};});
 const plan={version:1,id:'known-three-views',name:'Technische Prüfvariante',views:items.map(item=>photoSetViewDefault(item.reference)),dimensions:dims.map((mm,axis)=>({axis,mm,toleranceMm:.001,source:'user',note:'Unabhängiges bekanntes Prüfmaß'})),placement:[70,0,5],fitDimensions:true,assumptions:['Die drei bestätigten Außenkonturen begrenzen das Material; keine zusätzlichen unsichtbaren Innenhohlräume.']};
 if(holes){plan.views[0].holeMode='through';plan.functionalChecks=[{id:'known-clearance',name:'Vier-Millimeter-Durchgang',kind:'clearance',from:[7.5,-1,7.5],to:[7.5,21,7.5],diameter:4,tolerance:.001,source:'user',note:'Unabhängig bekannter freier Durchgang durch das 5-mm-Fenster'}];}return {items,plan,photos:{version:2,items,reconstructions:[plan]},expected:{dimensions:dims,volume:(stepped?20000:24000)-(holes?500:0)}};
}
