// Placement changes only the affine pose. Original mesh points and CAD sources
// keep their file coordinates, including the relative placement of assemblies.
export function combinedPlacementBounds(bounds){
  if(!bounds.length)throw Error('Keine Modellgrenzen für die Platzierung vorhanden.');
  for(const b of bounds)if(!b||!['min','max'].every(key=>Array.isArray(b[key])&&b[key].length===3&&b[key].every(Number.isFinite))||b.min.some((v,k)=>v>b.max[k]))throw Error('Ungültige Modellgrenzen für die Platzierung.');
  return {min:[0,1,2].map(k=>Math.min(...bounds.map(b=>b.min[k]))),max:[0,1,2].map(k=>Math.max(...bounds.map(b=>b.max[k])))};
}

export function modelPlacementDelta(bounds,index=0){
  if(!Number.isSafeInteger(index)||index<0)throw Error('Ungültige Importposition.');
  const {min,max}=combinedPlacementBounds([bounds]),offset=index*15;
  return [offset-(min[0]+max[0])/2,offset-(min[1]+max[1])/2,-min[2]];
}
