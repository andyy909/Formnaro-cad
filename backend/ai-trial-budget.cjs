// A final review has a reserved part of the same total trial budget.
function trialBudget(parent,totalMs,{full=true,reserveMs=110000}={}){
 if(!Number.isSafeInteger(totalMs)||totalMs<1||!Number.isFinite(reserveMs)||reserveMs<0)throw Error('Ungültiges Versuchsbudget.');
 const reserved=full?Math.min(reserveMs,Math.floor(totalMs/3)):0;
 const finalSignal=AbortSignal.any([parent,AbortSignal.timeout(totalMs)]);
 return {executionSignal:reserved?AbortSignal.any([finalSignal,AbortSignal.timeout(totalMs-reserved)]):finalSignal,finalSignal,reservedMs:reserved,totalMs};
}
module.exports={trialBudget};
