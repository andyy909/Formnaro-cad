// Kept separate so loading the UI never loads the simplifier/WASM.
export const MESH_IMPORT_LIMITS=Object.freeze({bytes:256*1024*1024,asciiBytes:64*1024*1024,triangles:5000000,workingTriangles:500000,targetTriangles:250000});
