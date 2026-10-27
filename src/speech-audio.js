export const SPEECH_MAX_SECONDS=180;
export function encodeSpeechWav(samples,sampleRate=16000){
 if(sampleRate!==16000||!(samples instanceof Float32Array)||samples.length<4800||samples.length>16000*SPEECH_MAX_SECONDS)throw Error('Die Aufnahme muss zwischen 0,3 und 180 Sekunden lang sein.');
 const bytes=new Uint8Array(44+samples.length*2),view=new DataView(bytes.buffer);
 function str(offset,value){for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));}
 str(0,'RIFF');view.setUint32(4,bytes.length-8,true);str(8,'WAVE');str(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,samples.length*2,true);
 for(let i=0;i<samples.length;i++){if(!Number.isFinite(samples[i]))throw Error('Ungültige Audiodaten.');const v=Math.max(-1,Math.min(1,samples[i]));view.setInt16(44+i*2,Math.round(v<0?v*32768:v*32767),true);}
 return bytes;
}
export async function decodeSpeechRecording(blob,{AudioContext=globalThis.AudioContext,OfflineAudioContext=globalThis.OfflineAudioContext}={}){
 if(blob.size>24*1024*1024)throw Error('Die Aufnahme ist zu groß. Bitte kürzer aufnehmen.');
 const context=new AudioContext();let decoded;try{decoded=await context.decodeAudioData(await blob.arrayBuffer());}finally{await context.close();}
 if(decoded.duration<0.3||decoded.duration>SPEECH_MAX_SECONDS+1)throw Error('Die Aufnahme muss zwischen 0,3 und 180 Sekunden lang sein.');
 const length=Math.min(16000*SPEECH_MAX_SECONDS,Math.round(decoded.duration*16000));
 const offline=new OfflineAudioContext(1,length,16000),source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();
 return encodeSpeechWav((await offline.startRendering()).getChannelData(0));
}
export function appendSpeechText(draft,text,maxLength=10000){
 const result=(draft.trimEnd()?draft.trimEnd()+'\n':'')+text.trim();
 if(result.length>maxLength)throw Error('Der Nachrichtentext wäre zu lang. Den erkannten Text bitte kürzen oder in mehrere Nachrichten teilen.');
 return result;
}
