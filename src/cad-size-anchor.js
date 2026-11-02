export const CAD_SIZE_ANCHOR_SCHEMA={oneOf:[{enum:['legacy','center']},{type:'object',additionalProperties:false,required:['corner'],properties:{corner:{type:'array',minItems:3,maxItems:3,items:{enum:[-1,1]}}}}],description:'legacy keeps the local minimum corner; center keeps the local bounds center; corner [-1|1,-1|1,-1|1] fixes an explicit local min/max corner. Positions are transformed through the full parent placement.'};
export function cadSizeAnchorPoint(bounds,anchor='legacy'){
 if(anchor==='legacy')return [...bounds.min];if(anchor==='center')return bounds.min.map((v,k)=>(v+bounds.max[k])/2);
 if(!anchor||typeof anchor!=='object'||Array.isArray(anchor)||Object.keys(anchor).length!==1||!Array.isArray(anchor.corner)||anchor.corner.length!==3||anchor.corner.some(v=>v!==-1&&v!==1))throw Object.assign(Error('Größenanker: legacy, center oder eine ausdrückliche lokale min/max-Ecke wählen.'),{code:'INVALID_SIZE_ANCHOR'});
 return anchor.corner.map((v,k)=>v===-1?bounds.min[k]:bounds.max[k]);
}
