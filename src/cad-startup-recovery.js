// A loaded model remains usable when its initial checkpoint cannot be written.
// Return false for blocked recovery as well as write errors; callers must never
// mark an unsuccessful checkpoint as saved.
export async function writeStartupRecovery({recovery,serialize,version,onError}){
  try{return !!await recovery.write(serialize(),{version});}
  catch(error){onError(error);return false;}
}
