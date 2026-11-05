export const MODEL_CHECK_CONFIG_KEY='formnaro-model-checks-v1';
export const MODEL_CHECK_KINDS=['size','bounds','volume','solids','distance','bore','clearance','radialClearance','surfaceDeviation'];
export const defaultModelCheckConfig=()=>({
 version:1,mode:'checked',strictness:95,
 checks:Object.fromEntries(MODEL_CHECK_KINDS.map(kind=>[kind,kind!=='volume'&&kind!=='surfaceDeviation'])),
 freecad:false,photo:true,visual:true,autoCorrect:true,maxCorrections:2
});
export function validateModelCheckConfig(value){
 const defaults=defaultModelCheckConfig(),plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
 if(!plain(value)||Object.keys(value).some(k=>!Object.hasOwn(defaults,k))||value.version!==1||!['normal','checked'].includes(value.mode)||!Number.isInteger(value.strictness)||value.strictness<0||value.strictness>100||!plain(value.checks)||Object.keys(value.checks).length!==MODEL_CHECK_KINDS.length||MODEL_CHECK_KINDS.some(k=>typeof value.checks[k]!=='boolean')||['freecad','photo','visual','autoCorrect'].some(k=>typeof value[k]!=='boolean')||!Number.isInteger(value.maxCorrections)||value.maxCorrections<0||value.maxCorrections>6)throw Error('Ungültige Modellprüfungs-Konfiguration. Version, Modus, Prüfarten und Grenzen prüfen.');
 return structuredClone(value);
}
let configuredStorage;
export function configureModelCheckStorage(storage){configuredStorage=storage;}
const storageOrDefault=storage=>storage??configuredStorage??globalThis.localStorage;
export function readModelCheckConfig(storage){const raw=storageOrDefault(storage)?.getItem(MODEL_CHECK_CONFIG_KEY);return raw?validateModelCheckConfig(JSON.parse(raw)):defaultModelCheckConfig();}
export function saveModelCheckConfig(value,storage){const config=validateModelCheckConfig(value);storageOrDefault(storage)?.setItem(MODEL_CHECK_CONFIG_KEY,JSON.stringify(config,null,2));return config;}
export function selectModelChecks(checks=[],config){if(!config)return checks;const c=validateModelCheckConfig(config);return c.mode==='normal'?[]:checks.filter(check=>c.checks[check.kind]!==false);}
