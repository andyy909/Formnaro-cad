const fs=require('node:fs');
// Single writer for verification reports. The caller keeps building the whole
// payload; this helper only serialises it with the historical two-space
// indentation, preserves the caller's property order and lets write errors
// propagate synchronously so the existing verification error path stays intact.
// It is required lazily from the verification branch only: the portable package
// filter drops every file name containing "verification".
function writeVerificationReport(file,payload){
 fs.writeFileSync(file,JSON.stringify(payload,null,2));
}
module.exports={writeVerificationReport};
