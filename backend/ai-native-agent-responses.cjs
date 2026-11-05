const {completeNativeAgentResponse}=require('./ai-provider.cjs');

function createNativeAgentConversation(config,key,{instructions,definitions,allowed,history,user,effort}){
 const supportsImages=/flash/i.test(config.model);
 const tools=definitions.filter(tool=>allowed.has(tool.name)&&(supportsImages||tool.name!=='offlinecad_screenshot'))
  .map(({name,description,inputSchema})=>({type:'function',name,description,parameters:inputSchema,strict:false}));
 const offered=new Set(tools.map(tool=>tool.name));
 const input=[...history.map(turn=>({role:turn.role,content:turn.text})),{role:'user',content:user}];
 const ids=new Set();
 return {
  async next(signal){
   if(!tools.length)throw Error('Keine strukturierten Formnaro-Werkzeuge verfügbar.');
   if(JSON.stringify(input).length+JSON.stringify(tools).length+instructions.length>700000)throw Error('Agentenkontext ist zu groß.');
   const data=await completeNativeAgentResponse(config,key,{
    instructions,input,tools,effort,
   },signal);
   if(data.status==='incomplete')return {data,calls:[],message:null};
   if(data.status==='failed'||!Array.isArray(data.output))throw Error('Ungültige strukturierte Agentenantwort.');
   const calls=data.output.filter(item=>item.type==='function_call');
   for(const call of calls){
    if(typeof call.call_id!=='string'||!call.call_id||call.call_id.length>256||ids.has(call.call_id))throw Error('Ungültige Werkzeugaufrufkennung.');
    ids.add(call.call_id);
   }
   input.push(...data.output);
   const message=data.output.filter(item=>item.type==='message').flatMap(item=>item.content??[])
    .filter(item=>item.type==='output_text'&&typeof item.text==='string').map(item=>item.text).join('\n');
   return {data,calls,message};
  },
  arguments(call){
   if(!offered.has(call.name)||typeof call.arguments!=='string'||call.arguments.length>200000)throw Error('Unzulässige Agenten-Werkzeuganfrage.');
   const args=JSON.parse(call.arguments);
   if(!args||typeof args!=='object'||Array.isArray(args))throw Error('Werkzeugargumente müssen ein Objekt sein.');
   return args;
  },
  result(call,report,images=[]){
   const text=JSON.stringify(report);
   const output=supportsImages&&images.length?[{type:'input_text',text},...images.map(image_url=>({type:'input_image',image_url}))]:text;
   input.push({type:'function_call_output',call_id:call.call_id,output});
  },
 };
}

module.exports={createNativeAgentConversation};
