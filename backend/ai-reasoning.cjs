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
 if(host==='api.groq.com'){
  if(/^openai\/gpt-oss-(?:20b|120b)$/.test(config.model))return ['low','medium','high'];
  if(config.model==='qwen/qwen3.8-27b')return ['none','low','medium','high'];
  if(config.model==='meta-models/muse-spark-open')return ['low','medium','high','xhigh'];
  return [];
 }
 // Official provider reasoning docs checked 2026-11-01; unknown IDs stay automatic.
 if(host==='generativelanguage.googleapis.com')return /^gemini-(?:2\.5|3(?:\.\d+)?|4(?:\.\d+)?)(?:-|$)/.test(config.model)&&!/(?:image|tts|audio|robotics)/.test(config.model)?[...(/^gemini-2\.5-flash(?:-|$)/.test(config.model)?['none']:[]),'minimal','low','medium','high']:[];
 if(host==='api.anthropic.com'){
  if(/^claude-(?:(?:opus|sonnet)-(?:5(?:[.-]5)?|4[.-][78])|haiku-5[.-]5|(?:fable|mythos)-5(?:[.-]1)?)(?:-|$)/.test(config.model))return ['low','medium','high','xhigh','max'];
  if(/^claude-(?:opus|sonnet)-4[.-]6(?:-|$)/.test(config.model))return ['low','medium','high','max'];
  if(/^claude-opus-4[.-]5(?:-|$)/.test(config.model))return ['low','medium','high'];
  return [];
 }
 if(host==='api.x.ai')return /^grok-4\.[67](?:-|$)/.test(config.model)?['low','medium','high','xhigh']:/^grok-4\.5(?:-|$)/.test(config.model)?['low','medium','high']:[];
 if(require('./ai-provider-presets.cjs').preset(config)?.id==='https://dashscope-intl.aliyuncs.com')return /^qwen3\.(?:8-(?:max|flash)|7-(?:max|plus|flash)|6-plus)(?:-|$)/.test(config.model)?['disabled','enabled']:[];
 if(host==='api.moonshot.ai')return /^kimi-k2\.6(?:-\d{8})?$/.test(config.model)?['disabled','enabled']:[];
 if(host==='api.z.ai')return /^glm-(?:4\.[567](?:-flash)?|5(?:\.[12])?)(?:-\d{8})?$/.test(config.model)?['disabled','enabled']:[];
 if(host==='api.mistral.ai'){
  const declared=declaredEfforts(model);if(declared!==null)return declared;
  if(/^mistral-large-4(?:-0)?$/.test(config.model))return ['low','medium','high'];
  if(/^(?:mistral-medium-(?:3[.-]5|2604)|mistral-small-(?:2603|4(?:-0)?))$/.test(config.model))return ['none','high'];
  return [];
 }
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
function configuredEffort(config){
 const host=new URL(config.baseUrl).hostname,value=host==='api.deepseek.com'?config.reasoningEffort:host==='api.openai.com'?config.openAIReasoningEffort:host==='api.mistral.ai'?config.mistralReasoningEffort:config.providerReasoningEffort;
 return value&&value!=='auto'?value:undefined;
}
function requestEffort(config,model){
 const host=new URL(config.baseUrl).hostname;if(host==='api.deepseek.com')return config.reasoningEffort;
 if(host==='api.mistral.ai'){
  const effort=config.mistralReasoningEffort??'auto';if(effort==='auto')return undefined;
  if(config.authMode!=='mistral-vibe'&&!reasoningEfforts(config,model).includes(effort))throw Error('Diese Mistral-Denkstufe ist für das gewählte Modell nicht bestätigt.');
  return effort;
 }
 const effort=configuredEffort(config);if(!effort)return undefined;
 if(!reasoningEfforts(config,model).includes(effort))throw Error('Diese Denkstufe ist für das gewählte Modell nicht bestätigt. Bitte Automatisch oder eine angebotene Denkstufe wählen.');
 return effort;
}
function chatReasoning(config,effort){
 if(!effort||new URL(config.baseUrl).hostname==='api.deepseek.com')return {};
 if(require('./ai-provider-presets.cjs').preset(config)?.id==='https://dashscope-intl.aliyuncs.com')return {enable_thinking:effort==='enabled'};
 if(['api.moonshot.ai','api.z.ai'].includes(new URL(config.baseUrl).hostname))return {thinking:{type:effort}};
 return {reasoning_effort:effort};
}
module.exports={OPENAI_EFFORTS,declaredEfforts,reasoningEfforts,requestEffort,configuredEffort,chatReasoning};
