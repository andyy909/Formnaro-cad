// Stable import interface. STL measurements generate planes and bounded
// polynomial CAD surfaces rather than the former heuristic pocket loft.
import {reconstructStlPatches,buildStlSurfaceCad,STL_CAD_LIMITS,stlError} from './cad-stl-surfaces.js';
import {buildStlFacetedCad,stlVertexFans} from './cad-stl-faceted.js';
export {reconstructStlPatches as analyzeStlHousing,STL_CAD_LIMITS};
export function buildStlHousingCad(oc,definition){
  if(definition.quality.surfaceBound>STL_CAD_LIMITS.surfaceTolerance||definition.quality.criticalBound>STL_CAD_LIMITS.criticalTolerance)throw stlError('STL_QUALITY','Die CAD-Flächen überschreiten die zulässige STL-Abweichung.');
  // Coincident independent vertex fans must keep their distinct topology.
  // Polynomial smoothing and proximity sewing cannot preserve that identity.
  const fans=stlVertexFans(definition);let smoothError;
  if(!fans.splitVertices){try{return buildStlSurfaceCad(oc,definition);}catch(error){if(error.code==='STL_LIMIT'||error.code==='STL_QUALITY'||error instanceof WebAssembly.RuntimeError)throw error;smoothError=error;}}
  try{const result=buildStlFacetedCad(oc,definition);result.quality.fallbackReason=fans.splitVertices?'touching-vertex-fans':'invalid-smoothed-solid';return result;}
  catch(error){if(error.code==='STL_LIMIT')throw error;throw stlError('STL_UNSUPPORTED','Die STL-Flächen konnten nicht als gültiger geschlossener CAD-Körper aufgebaut werden. '+(smoothError?'Auch die Rekonstruktion mit unveränderten STL-Flächen ist fehlgeschlagen. ':'')+'Bitte Netz auf überlappende Flächen und Selbstüberschneidungen prüfen.');}
}
