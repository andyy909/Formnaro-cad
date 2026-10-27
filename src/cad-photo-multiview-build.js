import {analyzePhotoSet,photoSetDigest,PHOTO_SET_AXES,PHOTO_SET_LABELS} from './cad-photo-multiview-data.js';
import {upsertPhotoSet} from './cad-photo-project.js';
import {createCadProjectParameters,stampCadProjectParameters} from './cad-project-parameters-data.js';
import {cadSourceGeometryDigest} from './cad-geometry-digest.js';

export function preparePhotoSetReconstruction(items,plan){
 const analysis=analyzePhotoSet(items,plan);if(!analysis.canBuild)throw Object.assign(Error(analysis.issues.map(i=>i.message).join('\n')),{code:'PHOTO_SET_INCOMPLETE',issues:analysis.issues});
 const commands=[],dimensions=analysis.plan.dimensions.map(d=>d.mm),ranges=analysis.ranges;
 for(const view of analysis.views){
  const [u,v,n]=PHOTO_SET_AXES[view.view],front=view.view==='front',sign=front?-1:1,pad=dimensions[n]+.02<=10000?.01:0;
  // All three extrusion normals point along a positive world axis. The front
  // profile uses -Z as its second sketch axis. Shared dimension edits can then
  // extend every source from a fixed minimum without moving a negative sweep.
  const right=[0,0,0],up=[0,0,0],normal=[0,0,0];right[u]=1;up[v]=sign;normal[n]=1;
  const position=[...analysis.plan.placement];position[n]+=ranges[n].min-pad;
  const frame=[...right,0,...up,0,...normal,0,...position,1],elements=[],loops=[];
  const loopsIn=[{role:'outer',points:view.points},...view.holes.map(points=>({role:'hole',points}))];
  for(const [index,loop]of loopsIn.entries()){
   const expression=p=>[`${ranges[u].min}+${(p[0]-view.bounds.min[0])/(view.bounds.max[0]-view.bounds.min[0])}*mass_${u}`,`${sign}*(${ranges[v].min}+${(p[1]-view.bounds.min[1])/(view.bounds.max[1]-view.bounds.min[1])}*mass_${v})`];
   const ids=[];loop.points.forEach((p,i)=>{const id=`v${index}_e${i}`;ids.push(id);elements.push({id,type:'line',start:expression(p),end:expression(loop.points[(i+1)%loop.points.length])});});loops.push({id:'loop'+index,role:loop.role,elements:ids});
  }
  const sketch={version:2,kind:'profile',variables:dimensions.map((value,axis)=>({name:'mass_'+axis,value:String(value)})),dimensions:{height:`mass_${n}+${2*pad}`},elements,loops};
  commands.push({op:'sketch',as:'photo_'+view.view,name:PHOTO_SET_LABELS[view.view]+' · '+plan.name,sketch,frame,color:'#278faf'});
 }
 commands.push({op:'group',operation:'intersection',targets:analysis.views.map(v=>'$photo_'+v.view),as:'photo_result',name:plan.name});
 return {analysis,commands};
}

export function finishPhotoSetReconstruction(project,aliases,prepared){
 const {analysis}=prepared,rootId=aliases.photo_result,root=project.nodes.find(n=>n.id===rootId);if(!root||root.source!=='group'||root.operation!=='intersection'||root.children.length!==3)throw Error('Die native Rekonstruktion liefert keine eindeutigen drei Profilquellen.');
 const {result,...plan}=analysis.plan;
 root.metadata={...root.metadata,photoReconstruction:{version:1,plan},notes:'Technische Fotorekonstruktion aus drei bestätigten Konturen. Unsichtbare Geometrie: '+plan.assumptions.join('; ')};
 const data=structuredClone(project.projectParameters??createCadProjectParameters()),names=new Set(data.parameters.map(p=>p.name)),parameters=[];
 for(const d of plan.dimensions){let name='foto_'+root.id.replace(/[^a-zA-Z0-9]/g,'').slice(0,12)+'_'+['x','y','z'][d.axis],suffix=1;while(names.has(name))name=name.slice(0,32)+'_'+suffix++;names.add(name);const id='photo-parameter-'+crypto.randomUUID();parameters.push({id,name,axis:d.axis});data.parameters.push({id,name,value:d.mm});
  for(const view of analysis.views){const target=aliases['photo_'+view.view];if(!target||target.rootId!==rootId||target.path?.length!==1)throw Error('Profilquelle wurde bei der Gruppierung nicht erhalten.');data.bindings.push({id:'photo-binding-'+crypto.randomUUID(),parameterId:id,target,field:'sketch.variables.mass_'+d.axis});}
 }
 project.projectParameters=stampCadProjectParameters(project,data);
 const sourceDigest=cadSourceGeometryDigest(root),planDigest=photoSetDigest(plan);project.photos=upsertPhotoSet(project.photos,{...plan,result:{rootId,sourceDigest,planDigest}});
 return {rootId,planDigest,parameters,ranges:analysis.ranges,assumptions:plan.assumptions,scope:analysis.scope};
}

export function nativePhotoSetDimensions(scene,rootId,plan){
 const body=scene.objects.find(n=>n.id===rootId&&n.target.path.length===0),size=body?.measures?.worldAxisSize;
 if(body?.kind!=='cad'||!Array.isArray(size)||size.length!==3||size.some(n=>!Number.isFinite(n)))throw Error('Native CAD-Achsmaße der rekonstruierten Variante fehlen.');
 return {passed:plan.dimensions.every(d=>Math.abs(size[d.axis]-d.mm)<=d.toleranceMm),checks:plan.dimensions.map(d=>({axis:d.axis,expectedMm:d.mm,actualMm:size[d.axis],toleranceMm:d.toleranceMm,passed:Math.abs(size[d.axis]-d.mm)<=d.toleranceMm,source:d.source,note:d.note})),scope:'Native finished CAD world-axis extents. Image uncertainty does not relax these functional tolerances.'};
}
export function photoSetNativeChecks(plan,rootId){return (plan.functionalChecks??[]).map(c=>({kind:c.kind,target:rootId,from:c.from.map((n,k)=>n+plan.placement[k]),to:c.to.map((n,k)=>n+plan.placement[k]),diameter:c.diameter,tolerance:c.tolerance,...(c.kind==='bore'?{minWall:c.minWall}:{})}));}
