// Only completed Responses envelopes may be used as executable proposals.
async function readDiagnosticStream(response,onEvent=()=>{}){
 const decoder=new TextDecoder(),items=new Map();let bytes=0,line='',block='',terminal;
 function event(text){
  const data=text.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
  if(!data||data==='[DONE]')return;
  const e=JSON.parse(data);
  if(e.type==='error'||e.type==='response.failed')throw Object.assign(Error(e.error?.message||e.response?.error?.message||'Anbieterstream fehlgeschlagen.'),{code:'AI_STREAM_FAILED'});
  if(/reasoning.*\.delta$/.test(e.type)&&typeof e.delta==='string')onEvent({type:'reasoning',text:e.delta});
  if(e.type==='response.output_text.delta')onEvent({type:'answer',text:e.delta});
  if(e.type==='response.output_item.done')items.set(e.output_index,e.item);
  if(['response.completed','response.incomplete'].includes(e.type))terminal=e.response;
 }
 function consume(text){line+=text;let n;while((n=line.indexOf('\n'))!==-1){const l=line.slice(0,n).replace(/\r$/,'');line=line.slice(n+1);if(!l){event(block);block='';}else block+=l+'\n';}}
 for await(const chunk of response.body){bytes+=chunk.length;if(bytes>32*1024*1024)throw Error('Diagnoseantwort überschreitet 32 MiB.');consume(decoder.decode(chunk,{stream:true}));}
 consume(decoder.decode());if(line)block+=line;if(block)event(block);
 if(!terminal||!['completed','incomplete'].includes(terminal.status))throw Object.assign(Error('Anbieterstream ohne bestätigten Abschluss.'),{code:'AI_STREAM_INTERRUPTED'});
 if(!terminal.output?.length&&items.size)terminal={...terminal,output:[...items].sort((a,b)=>a[0]-b[0]).map(x=>x[1])};
 return terminal;
}
function exposedReasoning(data){return (data.output??[]).filter(i=>i.type==='reasoning').flatMap(i=>[...(i.content??[]),...(i.summary??[]),...(i.text?[{text:i.text}]:[])]).map(i=>i.text??'').join('\n');}
module.exports={readDiagnosticStream,exposedReasoning};
