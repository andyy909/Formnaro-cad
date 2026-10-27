// A translation preserves exact native geometry, volume, topology and extrema.
// Only a view previously produced by the native worker for this exact baseline
// may supply its proofs. Display triangles never establish a geometry proof.
function equal(a,b){
 if(a===b)return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&equal(a[key],b[key]));
}
const unsupported=node=>node.kind!=='cad'||node.annotations?.length||node.partition||node.extraction||node.children?.some(unsupported);
export function prepareCadTranslationView(baseline,project,view,revision){
 if(!view?.scene||view.scene.revision!==view.revision||baseline.workplane.reference||project.workplane.reference||baseline.nodes.length!==project.nodes.length||baseline.nodes.some(unsupported))return null;
 const {nodes:oldNodes,...oldGlobals}=baseline,{nodes,...globals}=project;if(!equal(oldGlobals,globals))return null;
 const deltas=new Map();
 for(let i=0;i<nodes.length;i++){
  const {transform:oldMatrix,...old}=oldNodes[i],{transform:nextMatrix,...next}=nodes[i];
  if(!equal(old,next)||oldMatrix.some((value,k)=>k<12||k>14?value!==nextMatrix[k]:!Number.isFinite(nextMatrix[k])))return null;
  deltas.set(next.id,nextMatrix.slice(12,15).map((value,k)=>value-oldMatrix[12+k]));
 }
 const roots=new Map(nodes.map(node=>[node.id,node]));
 for(const node of nodes){const proof=view.scene.objects.find(item=>item.id===node.id&&item.target.rootId===node.id&&!item.target.path.length),delta=deltas.get(node.id);if(!proof?.worldBounds||[...proof.worldBounds.min,...proof.worldBounds.max].some((v,k)=>Math.abs(v+delta[k%3])>100000)||proof.worldBounds.size.some(v=>v<.01||v>10000))return null;}
 const translatedMatrix=(matrix,delta)=>matrix.map((value,k)=>k>=12&&k<=14?value+delta[k-12]:value);
 const objects=view.scene.objects.map(object=>{
  const delta=deltas.get(object.target.rootId);if(!delta)throw Error('Native Verschiebeansicht enthält eine fremde Quelle.');
  const bounds=object.worldBounds,worldBounds={...bounds};for(const key of ['min','max','center'])worldBounds[key]=bounds[key].map((value,k)=>value+delta[k]);
  return {...object,transform:object.target.path.length?object.transform:roots.get(object.id).transform,worldMatrix:translatedMatrix(object.worldMatrix,delta),worldBounds};
 });
 const meshes=view.meshes.map(record=>{const delta=deltas.get(record.rootId??record.id);if(!delta)throw Error('Native Verschiebeansicht enthält ein fremdes Teil.');return {...record,transform:translatedMatrix(record.transform,delta)};});
 return {revision,scene:{...view.scene,revision,objects},meshes};
}
