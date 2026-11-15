const {policy}=require('./practice-ui-policy.cjs'),{matches}=require('./ai-diagnostic-schema.cjs');
function validatePracticeResultChecks(value){
 const invalidTolerance=Array.isArray(value)&&value.find(check=>{
  const tolerance=policy.resultChecks.items.oneOf.find(schema=>schema.properties.kind.const===check?.kind)?.properties.tolerance;
  return tolerance&&typeof check.tolerance==='number'&&check.tolerance>tolerance.maximum;
 });
 if(invalidTolerance)throw Error('Ungültige Modellprüfung '+invalidTolerance.kind+': tolerance '+invalidTolerance.tolerance+' mm überschreitet 0,1 mm. Verwende höchstens 0.1 als JSON-Zahl oder lasse die optionale Modellprüfung weg. Es wurde noch kein Übungsschritt ausgeführt.');
 if(!matches(value,policy.resultChecks)||JSON.stringify(value).length>6000)throw Error('Ungültige Modellprüfungen: checks erwartet höchstens 32 strukturierte Messprüfungen mit kind und target gemäß practiceResultChecksSchema. Freitext gehört in label. Es wurde noch kein Übungsschritt ausgeführt.');
 return value;
}
module.exports={validatePracticeResultChecks};
