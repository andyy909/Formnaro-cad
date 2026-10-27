import {resolveSketchProfile,profileGeometryHandles,profileGeometryMidpoints} from './sketch-profile.js';

/** A sketch dialog owns one mutable draft. Only draft edits invalidate its
 * geometry; camera and selection changes reuse it. Modelling still validates
 * independently through its existing native/mesh preview path. */
export function createSketchViewCache({resolve,expression}){
  let cached=null;
  function read(sketch){
    if(cached?.sketch===sketch)return cached;
    let resolved=null,error=null,geometry=null,handles=[],midpoints=[];
    try{resolved=resolve(sketch);}catch(failure){error=failure;}
    if([2,3,4].includes(sketch.version)){
      // Open or crossing contours remain visible and editable while the full
      // validation error is retained. Invalid formulas never reuse old points.
      try{geometry=resolved??resolveSketchProfile(sketch,expression,{geometryOnly:true});handles=profileGeometryHandles(geometry.elements);midpoints=profileGeometryMidpoints(geometry.elements,handles);}catch{}
    }
    return cached={sketch,resolved,error,geometry,handles,midpoints};
  }
  return {read,invalidate:()=>{cached=null;}};
}
