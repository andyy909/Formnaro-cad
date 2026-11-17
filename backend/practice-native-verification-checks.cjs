const assert=require('node:assert/strict');
async function checkPlateOpening(js,project,body,bounds){
 const center=[(bounds.min[0]+bounds.max[0])/2,(bounds.min[1]+bounds.max[1])/2];
 const clearance=await js(`(async()=>{
  const controller=window.__cadTest.controller,preview=await controller.restoreAITaskCandidate(${JSON.stringify(project)});
  try{
   const [x,y]=${JSON.stringify(center)},z=${JSON.stringify(bounds.min[2])};
   const check=x=>controller.checkPreview(preview.previewId,[{kind:'clearance',target:${JSON.stringify(body.id)},
    from:[x,y,z-1],to:[x,y,z+6],diameter:7.99,tolerance:.001}],{collectFailures:true});
   return {center:(await check(x)).passed,shifted:(await check(x-5)).passed};
  }finally{controller.discard(preview.previewId);}
 })()`);
 assert.deepEqual(clearance,{center:true,shifted:false});
 return clearance;
}
module.exports={checkPlateOpening};
