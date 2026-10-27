// Only a terminal completed response is usable; partial CAD JSON is never applied.
function planError(code,status){
 const messages={subscription_sharing_usage_limit_exceeded:'ChatGPT-Nutzungslimit erreicht. Bitte „Nutzung verwalten“ öffnen.',subscription_sharing_usage_unavailable:'ChatGPT-Abo-Nutzung derzeit nicht verfügbar. Bitte „Nutzung verwalten“ öffnen.',invalid_grant:'ChatGPT-Anmeldung abgelaufen. Bitte erneut anmelden.'};
 const e=Error(messages[code]||(status===401?'ChatGPT-Anmeldung nicht mehr gültig. Bitte erneut anmelden.':status===403?'ChatGPT-Abo oder Modell nicht freigegeben. Bitte Nutzung in ChatGPT prüfen.':status===429?'ChatGPT-Limit erreicht. Bitte später erneut versuchen oder Nutzung verwalten.':'ChatGPT-Anfrage fehlgeschlagen'+(status?' (HTTP '+status+')':'')+'.'));
 e.code='CHATGPT_REQUEST_FAILED';return e;
}
async function readChatGPTResponse(response){
 if(!response.ok){let code;try{code=(await response.json()).error?.code;}catch{}throw planError(code,response.status);}
 // The live ChatGPT plan endpoint can omit Content-Type on a valid SSE response.
 // Validate the event envelopes and terminal completion below, not this header.
 const decoder=new TextDecoder(),finishedItems=new Map();let size=0,completed;
 function event(block){const data=block.split('\n').filter(s=>s.startsWith('data:')).map(s=>s.slice(5).trimStart()).join('\n');if(!data||data==='[DONE]')return;let item;try{item=JSON.parse(data);}catch{throw Error('Ungültiger ChatGPT-Antwortstream.');}
  if(item.type==='response.failed'||item.type==='error')throw planError(item.response?.error?.code||item.code||item.error?.code);
  if(item.type==='response.incomplete')throw Error('ChatGPT-Antwort unvollständig. Keine Modelländerung übernommen.');
  if(item.type==='response.output_item.done'){
   if(!Number.isSafeInteger(item.output_index)||item.output_index<0||item.output_index>10000||!item.item||typeof item.item.type!=='string')throw Error('Ungültiger ChatGPT-Ausgabeteil.');
   finishedItems.set(item.output_index,item.item);
  }
  if(item.type==='response.completed'){if(item.response?.status!=='completed'||!Array.isArray(item.response?.output))throw Error('Ungültiger ChatGPT-Abschluss.');completed=item.response;}
 }
 // Normalize CRLF after complete lines, including chunks split between CR and LF.
 let line='',block='';function consume(text){line+=text;let n;while((n=line.indexOf('\n'))>=0){const l=line.slice(0,n).replace(/\r$/,'');line=line.slice(n+1);if(l===''){event(block);block='';}else block+=l+'\n';}}
 for await(const part of response.body){size+=part.length;if(size>32*1024*1024)throw Error('ChatGPT-Antwort überschreitet 32 MB.');consume(decoder.decode(part,{stream:true}));}
 consume(decoder.decode());if(line)block+=line;if(block)event(block);
 if(!completed)throw Error('ChatGPT-Verbindung vor Abschluss unterbrochen. Keine Modelländerung übernommen.');
 // Some plan responses finish with output:[]; their full text is in output_item.done.
 // Never promote deltas or unfinished items to a completed CAD proposal.
 if(completed.output.length===0&&finishedItems.size)completed={...completed,output:[...finishedItems].sort((a,b)=>a[0]-b[0]).map(([,item])=>item)};
 return completed;
}
module.exports={readChatGPTResponse};
