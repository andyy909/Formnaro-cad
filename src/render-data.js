import {localManifold,meshData} from './geometry.js';
import {GENERATORS} from './parameters.js';
import {coloredParts} from './exports.js';
export function geometrySignature(n){return JSON.stringify([n.id,n.type,n.segments,n.text,n.mesh,n.params,n.params&&!GENERATORS.has(n.type)?n.size:null]);}
export const colorSignature=n=>JSON.stringify(n);
export function computedRenderData(nodes){const renders=[];function visit(n){const m=localManifold(n);try{renders.push({id:n.id,key:geometrySignature(n),data:meshData(m),colorKey:colorSignature(n),parts:n.multicolor&&n.children?coloredParts(n):null});}finally{m.delete();}for(const child of n.children||[])visit(child);}nodes.forEach(visit);return renders;}
