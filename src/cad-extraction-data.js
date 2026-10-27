const fields=['version','sourceSignature','bodySignature','solidSignature','constructionFrame'];
export function validateCadExtraction(value,validateMatrix){
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Object.keys(value).some(k=>!fields.includes(k))||value.version!==1||['sourceSignature','bodySignature','solidSignature'].some(k=>typeof value[k]!=='string'||!/^[0-9a-f]{64}$/.test(value[k])))throw Error('Ungültiger nativer Geometriebezug des herausgelösten Körpers.');
 return {version:1,sourceSignature:value.sourceSignature,bodySignature:value.bodySignature,solidSignature:value.solidSignature,constructionFrame:validateMatrix(value.constructionFrame)};
}
