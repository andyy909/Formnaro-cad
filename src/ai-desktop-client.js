// Errors crossing Electron contextBridge lose custom properties. Carry the
// existing desktop reply as plain data and recreate errors in the renderer.
export async function generateDesktopAI(desktop,args){
 if(typeof desktop?.generateAIReply!=='function')return desktop.generateAI(args);
 const reply=await desktop.generateAIReply(args);
 if(!reply||typeof reply.ok!=='boolean')throw Error('Ungültige Antwort der lokalen KI-Anbindung.');
 if(reply.ok)return reply.value;
 const error=Error(typeof reply.error==='string'?reply.error:'KI-Anfrage fehlgeschlagen.');
 if(typeof reply.code==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(reply.code))error.code=reply.code;
 if(reply.feedback&&typeof reply.feedback==='object')error.feedback=reply.feedback;
 if(reply.aiUsage&&typeof reply.aiUsage==='object')error.aiUsage=reply.aiUsage;
 if(reply.aiRetryable===true)error.aiRetryable=true;
 void desktop.recordError?.({source:'desktop-ipc',operation:'cad-ai:generate',name:error.name,code:error.code,message:error.message,stack:error.stack}).catch(()=>{});
 throw error;
}
