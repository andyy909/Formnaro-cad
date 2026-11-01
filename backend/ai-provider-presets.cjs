// Provider families; account/CLI and API entries remain separate credentials.
const API_PROVIDERS=[
 {id:'https://api.openai.com',label:'OpenAI / GPT',baseUrl:'https://api.openai.com/v1',protocol:'responses',docs:'https://platform.openai.com/docs/api-reference/responses'},
 {id:'https://api.anthropic.com',label:'Claude · Anthropic',baseUrl:'https://api.anthropic.com/v1',protocol:'messages',docs:'https://platform.claude.com/docs/en/api/messages/create'},
 {id:'https://generativelanguage.googleapis.com',label:'Gemini · Google',baseUrl:'https://generativelanguage.googleapis.com/v1beta/openai',protocol:'chat',docs:'https://ai.google.dev/gemini-api/docs/openai'},
 {id:'https://api.mistral.ai',label:'Mistral · API',baseUrl:'https://api.mistral.ai/v1',protocol:'chat',docs:'https://docs.mistral.ai/api/endpoint/chat'},
 {id:'https://api.deepseek.com',label:'DeepSeek',baseUrl:'https://api.deepseek.com',protocol:'chat',model:'deepseek-flash',docs:'https://api-docs.deepseek.com/'},
 {id:'https://api.x.ai',label:'Grok · xAI',baseUrl:'https://api.x.ai/v1',protocol:'chat',docs:'https://docs.x.ai/developers/rest-api-reference/inference'},
 {id:'https://api.groq.com',label:'Groq · API',baseUrl:'https://api.groq.com/openai/v1',protocol:'chat',docs:'https://console.groq.com/docs/openai'},
 {id:'https://dashscope-intl.aliyuncs.com',label:'Qwen · Alibaba Cloud',baseUrl:'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',protocol:'chat',docs:'https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope'},
 {id:'https://api.moonshot.ai',label:'Kimi · Moonshot',baseUrl:'https://api.moonshot.ai/v1',protocol:'chat',jsonMode:false,docs:'https://platform.moonshot.ai/docs/api/chat'},
 {id:'https://api.z.ai',label:'GLM · Z.ai',baseUrl:'https://api.z.ai/api/paas/v4',protocol:'chat',docs:'https://docs.z.ai/api-reference/llm/chat-completion'},
 {id:'https://api.minimax.io',label:'MiniMax',baseUrl:'https://api.minimax.io/v1',protocol:'chat',jsonMode:false,docs:'https://platform.minimax.io/docs/api-reference/text-openai-api'}
].map(p=>({model:'',authMode:'api-key',...p}));
const BUILTIN_PROVIDERS=[
 {id:'chatgpt',label:'ChatGPT-Abo',authMode:'chatgpt',baseUrl:'https://api.openai.com/v1',protocol:'responses',model:''},
 {id:'mistral-vibe',label:'Mistral Vibe · Anmeldung',authMode:'mistral-vibe',baseUrl:'https://api.mistral.ai/v1',protocol:'chat',model:'vibe-default'},
 ...API_PROVIDERS
];
function preset(config){const url=new URL(config.baseUrl);return API_PROVIDERS.find(p=>p.id===url.origin)||(/^[a-z0-9-]+\.[a-z0-9-]+\.maas\.aliyuncs\.com$/i.test(url.hostname)?API_PROVIDERS.find(p=>p.id==='https://dashscope-intl.aliyuncs.com'):undefined);}
module.exports={API_PROVIDERS,BUILTIN_PROVIDERS,preset};
