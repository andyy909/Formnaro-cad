// A partition plane belongs to the derived body's local frame. Moving that
// body therefore moves both the retained sources and its plane together.
const fields=['version','origin','normal','side'];
function vector(value){if(!Array.isArray(value)||value.length!==3||value.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw Error('Teilung benötigt drei endliche Koordinaten.');return [...value];}
export function cadPartitionDirection(value){const v=vector(value),scale=Math.max(...v.map(Math.abs));if(!scale)throw Error('Die Teilungsnormale darf nicht null sein.');const scaled=v.map(x=>x/scale),length=Math.hypot(...scaled);return scaled.map(x=>x/length);}
export function validateCadPartition(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Object.keys(value).some(k=>!fields.includes(k))||value.version!==1||!['positive','negative'].includes(value.side))throw Error('Ungültiges natives Teilungsrezept.');
  const origin=vector(value.origin),normal=vector(value.normal);if(Math.abs(Math.hypot(...normal)-1)>1e-12)throw Error('Teilungsebene benötigt einen gültigen Ursprung und eine normierte Normale.');
  return {version:1,origin,normal,side:value.side};
}
