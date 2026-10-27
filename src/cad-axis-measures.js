export function cadAxisMeasures(localBounds,transform,worldMatrix){
 const geometrySize=[...localBounds.size],own=[0,4,8].map(i=>Math.hypot(...transform.slice(i,i+3))),world=[0,4,8].map(i=>Math.hypot(...worldMatrix.slice(i,i+3)));
 return {measures:{geometrySize,editSize:geometrySize.map((v,i)=>v*own[i]),worldAxisSize:geometrySize.map((v,i)=>v*world[i])},editFrame:'source-axes-parent-frame-after-node.transform',sizeToWorldAxisFactors:world.map((v,i)=>v/own[i]),worldAxisDirections:[0,4,8].map((i,k)=>worldMatrix.slice(i,i+3).map(v=>v/world[k]))};
}
