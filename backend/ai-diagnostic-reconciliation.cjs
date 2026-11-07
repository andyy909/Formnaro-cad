const fs=require('node:fs'),path=require('node:path');
function readReconciliation(directory){
 try{
  const file=path.join(directory,'Anbieterabgleich.json');if(fs.statSync(file).size>65536)return null;
  const value=JSON.parse(fs.readFileSync(file,'utf8')),amount=Number(value.providerCostUSD),difference=Number(value.costDifferenceUSD);
  if(!Number.isFinite(amount)||amount<0||!Number.isFinite(difference)||!Number.isSafeInteger(value.localRequestsStarted)||value.localRequestsStarted<0||!Number.isFinite(Date.parse(value.checkedAt)))return null;
  return {checkedAt:value.checkedAt,costUSD:amount,differenceUSD:difference,requests:value.localRequestsStarted,requestCountMatches:value.requestCountMatchesIncludingUnsettled===true,costsMatchTokenRows:value.providerCostsMatchTokenRows===true};
 }catch{return null;}
}
module.exports={readReconciliation};
