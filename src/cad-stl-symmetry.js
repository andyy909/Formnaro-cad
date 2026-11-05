
import {compactImportPositions,inspectImportTopology,readImportStl} from './mesh-import-core.js';
import {fromMesh,meshData,stlBinary} from './mesh-engine/geometry.js';
import {createDistanceTree} from './model-deviation.js';
import {cadBoolean,cadExportMesh,readCadBrep,transformCad} from './cad-native-kernel.js';
import {exportCadStep,importCadStep} from './cad-step-io.js';
import {cadStlAscii} from './cad-mesh-formats.js';

const MAX_SOURCE_TRIANGLES=40000, MAX_HALF_TRIANGLES=20000, CHECK_MS=20000;
const surface=({verts,triangles})=>({vertices:Array.from(verts),triangles:Array.from(triangles)});

// Every triangle centroid and every vertex of the two bounded surfaces is measured.
function measure(left,right,axis,plane,band){
  const deadline=performance.now()+CHECK_MS;
  const budget=()=>{if(performance.now()>deadline)throw Error('Zeitgrenze der Symmetrie- oder Nahtprüfung erreicht.');};
  function direction(source,target){
    const tree=createDistanceTree(target,{budget});
    let max=0,seamMax=0,points=0,seamPoints=0;
    const check=point=>{
      if(!(points++%256))budget();
      const {distance}=tree.nearest(point);
      if(!Number.isFinite(distance))throw Error('Die Oberfläche konnte nicht vollständig gemessen werden.');
      max=Math.max(max,distance);
      if(Math.abs(point[axis]-plane)<=band){seamMax=Math.max(seamMax,distance);seamPoints++;}
    };
    const {vertices,triangles}=source;
    for(let i=0;i<vertices.length;i+=3)check(vertices.slice(i,i+3));
    for(let i=0;i<triangles.length;i+=3){
      const corners=triangles.slice(i,i+3).map(vertex=>vertices.slice(3*vertex,3*vertex+3));
      check([0,1,2].map(k=>(corners[0][k]+corners[1][k]+corners[2][k])/3));
      // Long triangles can cross the entire seam without a vertex or centroid
      // in it. Sample actual crossings and their midpoint too.
      for(const location of [plane-band/2,plane,plane+band/2]){
        const intersections=[];
        for(let edge=0;edge<3;edge++){
          const a=corners[edge],b=corners[(edge+1)%3],distance=b[axis]-a[axis];
          if(!distance)continue;
          const t=(location-a[axis])/distance;
          if(t>=0&&t<=1)intersections.push(a.map((v,k)=>v+t*(b[k]-v)));
        }
        for(const point of intersections)check(point);
        if(intersections.length===2)check(intersections[0].map((v,k)=>(v+intersections[1][k])/2));
      }
    }
    return {max_mm:max,seam_max_mm:seamMax,points,seam_points:seamPoints};
  }
  const forward=direction(left,right),reverse=direction(right,left);
  return {stl_to_cad:forward,cad_to_stl:reverse,sampled_max_mm:Math.max(forward.max_mm,reverse.max_mm),
    seam_sampled_max_mm:Math.max(forward.seam_max_mm,reverse.seam_max_mm)};
}

export async function prepareStlSymmetry(bytes,{unit,tolerance,axis,plane,side,overlap}){
  if(![0,1,2].includes(axis)||![1,-1].includes(side)||!Number.isFinite(tolerance)||tolerance<.0001||tolerance>100||
    (plane!==null&&!Number.isFinite(plane))||(overlap!==null&&(!Number.isFinite(overlap)||overlap<=2*tolerance)))
    throw Error('Symmetrieebene, Vorlagenseite und Überlappung prüfen. Die Überlappung muss größer als das doppelte Abweichungsbudget sein.');
  const input=readImportStl(bytes,{unit,maxTriangles:MAX_SOURCE_TRIANGLES,auditPrecision:true});
  const coordinateRoundoff=input.coordinateRoundoffMM;
  if(coordinateRoundoff>tolerance/20)throw Error('Die Koordinatengenauigkeit reicht für dieses Symmetrie-Abweichungsbudget nicht aus.');
  const raw=await compactImportPositions(input.positions);
  const topology=inspectImportTopology(raw);
  if(topology.components!==1||topology.boundary||topology.nonmanifold||topology.orientation||topology.degenerate||!(topology.volume>0))
    throw Error('Für die Symmetrieprüfung ein einzelnes geschlossenes, konsistent orientiertes Netz wählen.');
  const original=surface(raw);
  const normal=[0,0,0];normal[axis]=1;
  const lo=topology.bounds.min[axis],hi=topology.bounds.max[axis];
  const midpoint=plane??(lo+hi)/2,overlapMM=overlap??5*tolerance,band=overlapMM/2+tolerance;
  if(midpoint-overlapMM/2<=lo||midpoint+overlapMM/2>=hi)throw Error('Die Ebene und die Überlappung müssen innerhalb des Modells liegen.');
  const model=fromMesh(raw);
  let reflected,shifted,missing,extra,half,components=[];
  try{
    reflected=model.mirror(normal);
    shifted=reflected.translate(normal.map(v=>v*2*midpoint));
    missing=model.subtract(shifted);extra=shifted.subtract(model);
    const unmatchedVolume=Math.abs(missing.volume())+Math.abs(extra.volume());
    if(missing.status()!=='NoError'||extra.status()!=='NoError'||!Number.isFinite(unmatchedVolume)||
      unmatchedVolume>Math.max(1e-9,topology.volume*1e-5))
      throw Error('Die Spiegelhälften unterscheiden sich im Volumen. Einseitige Merkmale bleiben in der Originalgeometrie erhalten.');
    const symmetry=measure(original,surface(meshData(shifted)),axis,midpoint,band);
    const symmetryLimit=Math.min(.01,tolerance/10);
    if(symmetry.sampled_max_mm+2*coordinateRoundoff>symmetryLimit)throw Error('Die gewählte Ebene ist geometrisch nicht ausreichend symmetrisch. Original unverändert.');
    const orientedNormal=normal.map(value=>value*side);
    half=model.trimByPlane(orientedNormal,side*midpoint-overlapMM/2);
    components=half.decompose();
    if(half.status()!=='NoError'||!(half.volume()>0)||components.length!==1||half.numTri()>MAX_HALF_TRIANGLES)
      throw Error('Das überlappende Teilstück muss geschlossen und zusammenhängend sein und höchstens 20.000 Dreiecke haben.');
    return {halfBytes:stlBinary(half),original,axis,plane:midpoint,side,overlapMM,band,tolerance,
      bounds:topology.bounds,volume:topology.volume,halfTriangles:half.numTri(),unmatchedVolume,symmetryLimit,symmetryDeviation:symmetry.sampled_max_mm,coordinateRoundoff};
  }finally{
    for(const solid of [...components,half,extra,missing,shifted,reflected,model])solid?.delete();
  }
}

export function finishStlSymmetry(oc,state,halfStep){
  const {original,axis,plane,side,overlapMM,band,tolerance,bounds,volume,halfTriangles,unmatchedVolume,symmetryLimit,symmetryDeviation,coordinateRoundoff}=state;
  const half=importCadStep(oc,halfStep);
  if(half.stats.solids!==1)throw Error('Das rekonstruierte Teilstück muss genau einen CAD-Volumenkörper ergeben.');
  const reflection=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  reflection[5*axis]=-1;reflection[12+axis]=2*plane;
  const shape=readCadBrep(oc,half.brep.data);
  let reflected,joined,reopenedShape;
  try{
    reflected=transformCad(oc,shape,reflection);
    joined=cadBoolean(oc,'union',shape,reflected);
    const bytes=exportCadStep(oc,[{name:'Symmetry reconstruction',shape:joined}]);
    const reopened=importCadStep(oc,bytes);
    if(reopened.stats.solids!==1)throw Error('Die Naht ergibt nach STEP-Wiederimport keinen einzelnen CAD-Volumenkörper.');
    reopenedShape=readCadBrep(oc,reopened.brep.data);
    const reserve=Math.min(.003,tolerance/15);
    const mesh=cadExportMesh(oc,reopenedShape,{deflection:reserve,angleDegrees:3});
    const deviation=measure(original,mesh,axis,plane,band);
    if(!deviation.stl_to_cad.seam_points||!deviation.cad_to_stl.seam_points||
      deviation.sampled_max_mm+reserve+coordinateRoundoff>tolerance||deviation.seam_sampled_max_mm+reserve+coordinateRoundoff>tolerance)
      throw Error('Gesamtform oder Naht überschreiten nach STEP-Wiederimport das Abweichungsbudget.');
    const preview=new TextEncoder().encode(cadStlAscii([{name:'Symmetry reconstruction',mesh}]));
    const report={valid:true,version:'0.10.0',options:{tolerance},input_triangles:original.triangles.length/3,
      output_faces:new Set(mesh.faceGroups.filter((_,i)=>i%3===2)).size,solids:1,
      bodies:[{method:'Symmetrie · überlappend rekonstruiert und vereinigt',stage:'symmetry'}],
      input_bounds_mm:[bounds.min,bounds.max],output_bounds_mm:[reopened.stats.bounds.min,reopened.stats.bounds.max],
      input_volume_mm3:volume,output_volume_mm3:reopened.stats.volume,deviation:{...deviation,kind:'bidirectional_stl_step_samples_not_global_bound'},
      tessellation_allowance_mm:reserve,
      symmetry:{axis:'XYZ'[axis],plane_mm:plane,side,overlap_mm:overlapMM,seam_band_mm:band,half_triangles:halfTriangles,
        source_unmatched_volume_mm3:unmatchedVolume,source_sampled_deviation_mm:symmetryDeviation,source_symmetry_limit_mm:symmetryLimit,source_coordinate_roundoff_bound_mm:coordinateRoundoff}};
    return {bytes,report,artifacts:{preview}};
  }finally{reopenedShape?.delete();joined?.delete();reflected?.delete();shape.delete();}
}
