const {policy}=require('./practice-ui-policy.cjs'),{matches}=require('./ai-diagnostic-schema.cjs');
function validatePracticeResultChecks(value){
 if(!matches(value,policy.resultChecks)||JSON.stringify(value).length>6000)throw Error('Ungültige Modellprüfungen: checks erwartet höchstens 32 strukturierte Messprüfungen mit kind und target gemäß practiceResultChecksSchema. Freitext gehört in label. Es wurde noch kein Übungsschritt ausgeführt.');
 return value;
}
module.exports={validatePracticeResultChecks};
