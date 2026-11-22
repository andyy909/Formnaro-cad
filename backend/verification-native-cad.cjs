const {cadOnlyForVersion}=require('./program-storage.cjs');

async function verifyNativeCadSequence(win,app,{verifyPath,projectDirectory}){
  const result=await require('./cad-verification.cjs').verifyNativeCad(win,app,verifyPath);
  result.overview=await require('./cad-overview-verification.cjs').verifyCadOverview(win,{directory:projectDirectory,output:verifyPath.replace(/\.json$/i,'-overview.json')});
  result.placement=await require('./cad-placement-verification.cjs').verifyCadPlacement(win,{output:verifyPath.replace(/\.json$/i,'-placement.json')});
  result.references=await require('./cad-reference-verification.cjs').verifyCadReferences(win,{output:verifyPath.replace(/\.json$/i,'-references.json')});
  result.sketch=await require('./cad-sketch-verification.cjs').verifyCadSketch(win,{output:verifyPath.replace(/\.json$/i,'-sketch.json')});
  result.partition=await require('./cad-partition-verification.cjs').verifyCadPartition(win,{output:verifyPath.replace(/\.json$/i,'-partition.json')});
  if(cadOnlyForVersion(app.getVersion()))result.extraction=await require('./cad-extraction-verification.cjs').verifyCadExtraction(win,{output:verifyPath.replace(/\.json$/i,'-extraction.json')});
  if(Number(app.getVersion().split('.')[1])>=19)result.annotations=await require('./cad-annotations-verification.cjs').verifyCadAnnotations(win,{output:verifyPath.replace(/\.json$/i,'-annotations.json')});
  if(Number(app.getVersion().split('.')[1])>=20)result.performance=await require('./cad-performance-verification.cjs').verifyCadPerformance(win,{output:verifyPath.replace(/\.json$/i,'-performance.json')});
  return result;
}

module.exports={verifyNativeCadSequence};
