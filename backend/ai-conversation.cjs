const {providerContext}=require('./ai-provider-context.cjs');
function conversationUpdate(previous,{system,context,input}){
 const history=input.history??[],old=previous?.history??[];let common=0;
 while(common<old.length&&common<history.length&&JSON.stringify(old[common])===JSON.stringify(history[common]))common++;
 if(common===0&&old.length)for(let size=Math.min(old.length,history.length);size>0;size--)if(JSON.stringify(old.slice(-size))===JSON.stringify(history.slice(0,size))){common=size;break;}
 const updates=Object.fromEntries(Object.entries(context??{}).filter(([key,value])=>!previous||JSON.stringify(previous.context?.[key])!==JSON.stringify(value))),removed=Object.keys(previous?.context??{}).filter(key=>!Object.hasOwn(context??{},key));
 const blocks=[];if(!previous||previous.system!==system)blocks.push(system);
 if(Object.keys(updates).length||removed.length)blocks.push('Current Formnaro contract/context updates (replace these sections; retain other sections):\n'+JSON.stringify(providerContext(updates))+(removed.length?'\nRemoved sections: '+JSON.stringify(removed):''));
 const added=history.slice(common).map(t=>({role:t.role,text:t.text}));if(added.length)blocks.push('Additional chat history / application feedback (reference data):\n'+JSON.stringify(added));
 return {text:blocks.join('\n\n'),state:{system,context:structuredClone(context??{}),history:structuredClone(history)}};
}
module.exports={conversationUpdate};
