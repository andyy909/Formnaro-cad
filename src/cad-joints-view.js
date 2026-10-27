import {Matrix4} from 'three';
import {validateAffineMatrix} from './cad-project.js';

/** A display-only owner. Geometry, project serialization and worker clients are
 * deliberately absent; originals consist solely of sixteen matrix entries. */
export function createCadJointView({objectsForRoot,begin=()=>{},end=()=>{},invalidate=()=>{}}){
 const originals=new Map();let active=false;
 function preview(placements){
  if(!Array.isArray(placements)||placements.length>500||new Set(placements.map(p=>p.rootId)).size!==placements.length)throw Error('Ungültige Gelenkanzeige.');
  for(const p of placements){if(typeof p.rootId!=='string')throw Error('Teilkennung fehlt.');validateAffineMatrix(p.delta);}
  if(!active){begin();active=true;}
  for(const [object,original]of originals){object.matrix.copy(original);object.matrixWorldNeedsUpdate=true;}
  for(const p of placements){const delta=new Matrix4().fromArray(p.delta);for(const object of objectsForRoot(p.rootId)){if(!originals.has(object))originals.set(object,object.matrix.clone());object.matrix.copy(delta).multiply(originals.get(object));object.matrixWorldNeedsUpdate=true;}}
  invalidate('joint-motion');
 }
 function clear({restore=true}={}){if(!active)return false;if(restore)for(const [object,original]of originals){object.matrix.copy(original);object.matrixWorldNeedsUpdate=true;}originals.clear();active=false;end();invalidate('joint-motion-end');return true;}
 return {preview,clear,state:()=>({active,objects:originals.size})};
}
