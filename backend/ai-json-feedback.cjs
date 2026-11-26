// Report a bounded structural error; never repair or execute model text locally.
function jsonSyntaxFeedback(text){
 text=String(text);if(!text.trim())return 'Invalid JSON: empty response. Return the next action or an explicit completion as one JSON object; no action was executed.';
 const stack=[];let quoted=false,escaped=false;
 for(let index=0;index<text.length;index++){const char=text[index];
  if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue;}
  if(char==='"'){quoted=true;continue;}
  if(char==='{'||char==='[')stack.push(char==='{'?'}':']');
  else if(char==='}'||char===']'){if(stack.pop()!==char)return 'Invalid JSON: mismatched object/array closing delimiter. Return one complete JSON object, preserving the task and revision.';}
  if(!quoted&&!stack.length&&char==='}'&&text.slice(index+1).trim()){try{JSON.parse(text.slice(0,index+1));return 'Invalid JSON: extra content after the complete JSON object. Stop immediately after one object. Only the application supplies tool results; no action from this rejected response was executed.';}catch{}}
 }
 if(quoted)return 'Invalid JSON: unterminated string. Return one complete JSON object, preserving the task and revision.';
 if(stack.length)return 'Invalid JSON: response ended with '+stack.length+' unclosed object/array level(s). Expected closing delimiters at the end: '+stack.slice(-8).reverse().join('')+'. Return the COMPLETE corrected JSON object; no actions were executed.';
 return 'Invalid JSON: return one complete JSON object without surrounding prose or provider tags.';
}
module.exports={jsonSyntaxFeedback};
