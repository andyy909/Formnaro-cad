export const AI_MODEL_STRICTNESS_KEY='formnaro-ai-model-strictness-v1';
export function validateAIModelStrictness(value=100){if(!Number.isInteger(value)||value<0||value>100)throw Error('KI-Modellstrenge: eine ganze Zahl von 0 bis 100 wählen.');return value;}
export function readAIModelStrictness(storage=globalThis.localStorage){try{return validateAIModelStrictness(Number(storage?.getItem(AI_MODEL_STRICTNESS_KEY)??100));}catch{return 100;}}
export function aiModellingPolicy(value=100){
 const strictness=validateAIModelStrictness(value),toleranceScale=strictness?100/strictness:null;
 return {version:1,strictness,toleranceScale,measurementEnforcement:strictness===0?'advisory':'scaled',instructions:strictness===0?'The user selected free modelling (0/100). Dimensional checks and photo differences are advisory and must remain visible as measured; do not retry solely to satisfy them. You may approximate the requested shape and dimensions within the task and disclose assumptions. Keep file/schema validity, inherited locks, protected sources, original archives, unrelated parts, revision checks and explicit Apply. Never claim an unmet requirement passed.':`The user selected modelling strictness ${strictness}/100. Dimensional acceptance allows ${toleranceScale} times the original tolerance; retain original expected values and measured failures in reports. Surface deviation allows the same scale of its threshold. Discrete body counts and checks without numeric evidence remain strict. At 100 enforce original requirements. Never loosen this user-selected policy yourself. Data integrity, protected sources and explicit Apply always remain active.`};
}
export function aiStrictnessDecision(verification,value=100){
 const policy=aiModellingPolicy(value),failures=verification?.checks?.filter(c=>c.passed===false)??[];
 const blocking=failures.filter(check=>{
  if(value===0)return false;const feedback=check.feedback??{},kind=check.kind??feedback.checkKind;if(value===100||kind==='solids')return true;
  const expected=check.expected??feedback.expected,actual=check.actual??feedback.actual,tolerance=check.tolerance??feedback.tolerance??.01;
  if(kind==='surfaceDeviation')return !Number.isFinite(actual?.sampledMaximum)||actual.sampledMaximum>expected*policy.toleranceScale;
  if(!['size','bounds','volume','distance'].includes(kind))return true;
  const difference=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length?Math.max(...a.map((v,i)=>difference(v,b[i]))):Number.isFinite(a)&&Number.isFinite(b)?Math.abs(a-b):Infinity;
  return difference(expected,actual)>tolerance*policy.toleranceScale;
 });
 return {...policy,measuredFailures:failures.length,blockingFailures:blocking.length,accepted:blocking.length===0};
}
export function mountAIModelStrictness(host,{storage=globalThis.localStorage,id='ai-model-strictness',language=()=> 'de'}={}){
 const label=document.createElement('label');label.className='dialog-label ai-model-strictness';
 const text=document.createElement('span'),input=document.createElement('input'),output=document.createElement('output'),help=document.createElement('span');
 text.textContent=language()==='en'?'AI modelling strictness':'KI-Modellstrenge';input.type='range';input.id=id;input.min='0';input.max='100';input.step='1';input.value=String(readAIModelStrictness(storage));input.setAttribute('aria-label',text.textContent);output.htmlFor=id;help.className='small-note';
 help.textContent=language()==='en'?'0: free shape and dimensional requirements · 100: strict requirements. File integrity, protected parts and explicit Apply remain active.':'0: freie Form- und Maßvorgaben · 100: strenge Vorgaben. Dateiintegrität, geschützte Teile und ausdrückliches Übernehmen bleiben aktiv.';
 const refresh=()=>{output.textContent=input.value+' / 100';input.setAttribute('aria-valuetext',output.textContent);};refresh();
 input.oninput=()=>{validateAIModelStrictness(Number(input.value));storage?.setItem(AI_MODEL_STRICTNESS_KEY,input.value);refresh();};label.append(text,input,output,help);host.append(label);
 return {element:label,input,get:()=>Number(input.value),setBusy:busy=>{input.disabled=busy;}};
}
