const key=target=>JSON.stringify([target.rootId,target.path]);
export function cadPatternConsumerInputEdits(config,fields){return fields.some(input=>{const old=config.inputs.find(old=>old.name===input.name);return !old||key(old.target)!==key(input.target)||old.unresolved&&input.confirmedUnresolved;})?fields.map(({name,target})=>({name,target:structuredClone(target)})):null;}
export function cadPatternConsumerSourceRows(project,patterns){
 const copies=new Map(patterns.flatMap(pattern=>pattern.instances.map(instance=>[instance.id,{pattern,instance}]))),rows=new Map();
 function add(target,label){if(!target?.path?.length||!copies.has(target.rootId))return;const id=key(target),known=rows.get(id);if(known){known.labels.push(label);return;}rows.set(id,{target:structuredClone(target),...copies.get(target.rootId),labels:[label]});}
 for(const link of project.contourLinks?.links??[])add(link.source,'Kontur '+link.id);
 for(const run of project.projectParameters?.freecad??[])for(const input of run.inputs)add(input.target,'FreeCAD '+input.name);
 for(const reference of project.featureReferences?.items??[]){add(reference.target,reference.name);add(reference.origin?.target,'Merkmalsquelle '+reference.name);}
 return [...rows.values()];
}

/** Draft child IDs are temporary. Only an explicit current template address
 * may translate an existing authored address into the eventual new clone. */
export function stableCadPatternConsumerChoices(project,choices,request,bindings){
 const next=structuredClone(bindings),sources=next.sources??=[],addresses=choices.sourceAddresses??[];
 function stable(target,prior){if(!target?.path?.length)return structuredClone(target);const fresh=addresses.find(entry=>key(entry.target)===key(target));if(!fresh)return structuredClone(target);if(fresh.retained===false)throw Error('Eine vorhandene erhaltene Musterposition als Ziel wählen.');let mapped=sources.find(entry=>entry.target.rootId===target.rootId&&JSON.stringify(entry.sourcePath)===JSON.stringify(fresh.source.path));
  if(!mapped&&prior?.rootId===target.rootId&&prior.path.length){mapped={target:structuredClone(prior),sourcePath:[...fresh.source.path]};const existing=sources.findIndex(entry=>key(entry.target)===key(prior));if(existing>=0)sources[existing]=mapped;else sources.push(mapped);}
  if(!mapped)throw Error('Für diese kopierte Kindquelle zuerst den vorhandenen Quellenbezug einer Vorlagenquelle ausdrücklich zuordnen oder das vollständige Musterteil wählen.');return structuredClone(mapped.target);
 }
 const result=structuredClone(request);for(const binding of result.features??[]){const old=project.featureReferences?.items.find(reference=>reference.id===binding.id);binding.target=stable(binding.target,old?.target);if(binding.originTarget)binding.originTarget=stable(binding.originTarget,old?.origin?.target);}
 for(const binding of result.contours??[]){const old=project.contourLinks?.links.find(link=>link.id===binding.id);binding.source=stable(binding.source??old.source,old?.source);}
 if(sources.length)next.sources=sources;return {request:result,bindings:next};
}
