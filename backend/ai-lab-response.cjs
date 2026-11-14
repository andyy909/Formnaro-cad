const METHODS=['context','scene','project','command_info','tool_info','preview','apply','discard','analyze','screenshot','ui'];
const CONTRACT='Return one JSON object: {"tool":"offlinecad_TOOL","arguments":{...}} for the next action, {"status":"completed","message":"verified result or honest remaining failure"} to finish, or {"status":"question","message":"necessary clarification"}. Optional diagnosis describes an observed blocker. Do not use message alone to describe future work; next/tool calls must never be nested. A completion claim is still independently checked.';
function validateAgentResponse(value){
 const fail=message=>{throw Object.assign(Error(message),{code:'INVALID_AGENT_RESPONSE'});};
 if(!value||typeof value!=='object'||Array.isArray(value))fail('Antwort muss ein JSON-Objekt sein. '+CONTRACT);
 const allowed=value.tool!==undefined?['tool','arguments','diagnosis']:['status','message','diagnosis'];
 const extra=Object.keys(value).filter(k=>!allowed.includes(k));
 if(extra.length)fail('Unzulässige Antwortfelder: '+extra.join(', ')+'. Erlaubt: '+allowed.join(', ')+'. '+CONTRACT);
 if(value.diagnosis!==undefined&&typeof value.diagnosis!=='string')fail('diagnosis muss Text sein.');
 if(value.tool!==undefined){
  if(!METHODS.map(m=>'offlinecad_'+m).includes(value.tool))fail('Unbekanntes Werkzeug '+String(value.tool)+'. Verfügbar: '+METHODS.map(m=>'offlinecad_'+m).join(', ')+'. Messungen: offlinecad_analyze; Werkzeugauskunft: offlinecad_tool_info.');
  if(!value.arguments||typeof value.arguments!=='object'||Array.isArray(value.arguments))fail('arguments muss ein Objekt sein.');
  return 'tool';
 }
 if(!['completed','question'].includes(value.status)||typeof value.message!=='string'||!value.message.trim())fail('Zum Beenden status="completed", für eine nötige Rückfrage status="question" und message angeben. Weiterarbeiten erfordert tool und arguments.');
 return value.status;
}
function assertOwnedPreview(previews,args){
 if(!previews.has(args.previewId))throw Object.assign(Error('Vorschau gehört nicht zu diesem Versuch. Eine eigene Vorschau berechnen und deren previewId und oberste revision verwenden.'),{code:'PREVIEW_NOT_OWNED'});
 const expected=previews.get(args.previewId);
 if(args.revision!==expected)throw Object.assign(Error('Falsche Ausgangsrevision für diese eigene Vorschau. Verwende '+JSON.stringify({previewId:args.previewId,revision:expected})+'. Die oberste revision der Vorschau gilt; scene.revision beschreibt den vorgeschlagenen Folgezustand.'),{code:'PREVIEW_REVISION_MISMATCH'});
}
module.exports={METHODS,CONTRACT,validateAgentResponse,assertOwnedPreview};
