// Nothing is loaded until a Python preview is explicitly requested. The public
// command contains source code, never renderer functions or runtime URLs.
export async function runCadPython(options){
 const {runPython}=await import('./cad-python-runtime.js');
 return runPython(options);
}
