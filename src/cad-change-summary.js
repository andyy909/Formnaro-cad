const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const measures=n=>({...(n?.recipe?{parameters:Object.fromEntries(Object.entries(n.recipe).filter(([,v])=>typeof v==='number'||Array.isArray(v)&&v.length<=16&&v.every(Number.isFinite)))}:{}),...(n?.stats?{bounds:n.stats.bounds,volume:n.stats.volume,solids:n.stats.solids}:{})});
const ignored=new Set(['children','meshSource','brep','mesh','recipe','stats','transform','geometryIdentity']);
const propertyKeys=(a,b)=>[...new Set([...Object.keys(a??{}),...Object.keys(b??{})])].filter(k=>!ignored.has(k)&&!equal(a?.[k],b?.[k]));
function sources(a,b,path=[]){
 const changes=[],left=new Map((a?.children??[]).map(n=>[n.id,n])),right=new Map((b?.children??[]).map(n=>[n.id,n]));
 for(const id of new Set([...left.keys(),...right.keys()])){const x=left.get(id),y=right.get(id),target=[...path,id],properties=propertyKeys(x,y),placement=!equal(x?.transform,y?.transform),dimensions=!equal(measures(x),measures(y)),geometry=x?.brep?.data!==y?.brep?.data||!equal(x?.recipe,y?.recipe);
  if(!x||!y||properties.length||placement||dimensions||geometry)changes.push({path:target,id,name:y?.name??x?.name,status:!x?'added':!y?'removed':'changed',properties,...(placement?{placement:{before:x?.transform??null,after:y?.transform??null}}:{}),...(dimensions?{dimensions:{before:measures(x),after:measures(y)}}:{}),geometryChanged:geometry});
  changes.push(...sources(x,y,target));
 }
 return changes;
}
/** Diff confirmed vs candidate metadata without serializing BReps or scenes. */
export function cadChangeSummary(before,after,{revision,previewId,verification,warnings=[],changes=[]}={}){
 const left=new Map(before.nodes.map(n=>[n.id,n])),right=new Map(after.nodes.map(n=>[n.id,n])),parts=[];
 for(const id of new Set([...left.keys(),...right.keys()])){
  const a=left.get(id),b=right.get(id);if(a===b)continue;
  const positionChanged=!equal(a?.transform,b?.transform),dimensionsChanged=!equal(measures(a),measures(b)),geometryChanged=a?.brep?.data!==b?.brep?.data||a?.mesh!==b?.mesh&&!equal(a?.mesh,b?.mesh),properties=propertyKeys(a,b),propertiesChanged=properties.length>0,sourceChanges=sources(a,b),meshSourceChanged=!equal(a?.meshSource,b?.meshSource),recipeChanged=!equal(a?.recipe,b?.recipe);
  if(!a||!b||positionChanged||dimensionsChanged||geometryChanged||propertiesChanged||sourceChanges.length||meshSourceChanged||recipeChanged)parts.push({id,name:b?.name??a?.name,status:!a?'added':!b?'removed':'changed',properties,...(positionChanged?{placement:{before:a?.transform??null,after:b?.transform??null}}:{}),...(dimensionsChanged?{dimensions:{before:measures(a),after:measures(b)}}:{}),...(sourceChanges.length?{sourceChanges}:{}),meshSourceChanged,recipeChanged,geometryChanged,propertiesChanged});
 }
 const oldJoints=new Map((before.joints?.joints??[]).map(j=>[j.id,j])),jointChanges=(after.joints?.joints??[]).filter(j=>!equal(oldJoints.get(j.id),j)).map(j=>({jointId:j.id,name:j.name,kind:j.kind,before:oldJoints.get(j.id)?.value??null,after:j.value,limits:j.limits}));
 for(const j of before.joints?.joints??[])if(!after.joints?.joints.some(n=>n.id===j.id))jointChanges.push({jointId:j.id,name:j.name,status:'removed'});
 return {revision,inspectionChanged:!equal(before.inspection,after.inspection),parts,joints:jointChanges,couplingsChanged:!equal(before.joints?.gears,after.joints?.gears)||!equal(before.joints?.drives,after.joints?.drives),changes:structuredClone(changes),warnings:structuredClone(warnings),verification:verification?structuredClone(verification):{status:'not-requested'},...(previewId?{previewId,nextActions:['apply','discard','scene','analysis']}:{nextActions:['scene','analysis']})};
}
export function compactCadChangeResponse(response,summary,detail){
 if(detail==='full')return {...response,summary};
 const {scene,before,after,...small}=response;return {...small,summary,sceneOmitted:true};
}
