const policy=require('../ai/FORMNARO-PRACTICE-UI.json');
function isPracticeUICommand(c){
 if(!c||typeof c!=='object'||Array.isArray(c))return false;
 const schema=policy.commands.find(s=>s.properties.op.const===c.op&&(c.op!=='joint'||s.properties.action.const===c.action));
 return !!schema&&Object.keys(c).every(k=>Object.hasOwn(schema.properties,k))&&schema.required.every(k=>Object.hasOwn(c,k))&&(c.op!=='create'||schema.properties.type.enum.includes(c.type));
}
module.exports={isPracticeUICommand,policy};
