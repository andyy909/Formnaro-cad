// Report a bounded structural error; never repair or execute model text locally.
function jsonSyntaxFeedback(text){
 const stack=[];let quoted=false,escaped=false;
 for(const char of String(text)){
  if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue;}
  if(char==='"'){quoted=true;continue;}
  if(char==='{'||char==='[')stack.push(char==='{'?'}':']');
  else if(char==='}'||char===']'){if(stack.pop()!==char)return 'Invalid JSON: mismatched object/array closing delimiter. Return one complete JSON object, preserving the task and revision.';}
 }
 if(quoted)return 'Invalid JSON: unterminated string. Return one complete JSON object, preserving the task and revision.';
 if(stack.length)return 'Invalid JSON: response ended with '+stack.length+' unclosed object/array level(s). Expected closing delimiters at the end: '+stack.slice(-8).reverse().join('')+'. Return the COMPLETE corrected JSON object; no actions were executed.';
 return 'Invalid JSON: return one complete JSON object without surrounding prose or provider tags.';
}
module.exports={jsonSyntaxFeedback};
