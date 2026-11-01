function validateModelCheckConfig(value){
 const keys=['version','mode','strictness','checks','freecad','photo','visual','autoCorrect','maxCorrections'],kinds=['size','bounds','volume','solids','distance','bore','clearance','radialClearance','surfaceDeviation'],plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
 if(!plain(value)||Object.keys(value).some(k=>!keys.includes(k))||value.version!==1||!['normal','checked'].includes(value.mode)||!Number.isInteger(value.strictness)||value.strictness<0||value.strictness>100||!plain(value.checks)||Object.keys(value.checks).length!==kinds.length||kinds.some(k=>typeof value.checks[k]!=='boolean')||['freecad','photo','visual','autoCorrect'].some(k=>typeof value[k]!=='boolean')||!Number.isInteger(value.maxCorrections)||value.maxCorrections<0||value.maxCorrections>6)throw Error('Ungültige Modellprüfungs-Konfiguration.');
 return structuredClone(value);
}
module.exports={validateModelCheckConfig};
