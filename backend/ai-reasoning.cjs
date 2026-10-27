// Explicit server capabilities take precedence. Conservative fallback from official
// OpenAI reasoning/deployment docs, checked 2026-10-26. Unknown models stay automatic.
const OPENAI_EFFORTS=['none','minimal','low','medium','high','xhigh','max'];
function declaredEfforts(model){
 const values=model?.supported_reasoning_levels??model?.supported_reasoning_efforts;
 return Array.isArray(values)?[...new Set(values.map(v=>typeof v==='string'?v:v?.effort).filter(v=>OPENAI_EFFORTS.includes(v)))]:null;
}
function reasoningEfforts(config,model){
 const host=new URL(config.baseUrl).hostname;
 if(host==='api.deepseek.com')return ['low','high','max'];
 if(host!=='api.openai.com')return [];
 const declared=declaredEfforts(model);if(declared!==null)return declared;
 if(/^gpt-(?:6-astra|6\.1-sol)(?:-\d{4}-\d{2}-\d{2})?$/.test(config.model))return ['low','medium','high','xhigh','max'];
 if(/^gpt-6-(?:sol|luna)(?:-\d{4}-\d{2}-\d{2})?$/.test(config.model))return ['none','low','medium','high','xhigh','max'];
 if(/^gpt-5\.6(?:-\d{4}-\d{2}-\d{2})?$/.test(config.model))return ['none','low','medium','high','xhigh','max'];
 if(/^gpt-5\.(?:5|4|2)(?:-\d{4}-\d{2}-\d{2})?$/.test(config.model))return ['none','low','medium','high','xhigh'];
 if(/^gpt-5\.1(?:-\d{4}-\d{2}-\d{2})?$/.test(config.model))return ['none','low','medium','high'];
 if(/^gpt-5(?:-\d{4}-\d{2}-\d{2})?$/.test(config.model))return ['minimal','low','medium','high'];
 return [];
}
function requestEffort(config,model){
 const host=new URL(config.baseUrl).hostname;if(host==='api.deepseek.com')return config.reasoningEffort;
 if(host!=='api.openai.com'||!config.openAIReasoningEffort||config.openAIReasoningEffort==='auto')return undefined;
 if(!reasoningEfforts(config,model).includes(config.openAIReasoningEffort))throw Error('Diese Denkstufe ist für das gewählte Modell nicht bestätigt. Bitte Automatisch oder eine angebotene Denkstufe wählen.');
 return config.openAIReasoningEffort;
}
module.exports={OPENAI_EFFORTS,declaredEfforts,reasoningEfforts,requestEffort};
