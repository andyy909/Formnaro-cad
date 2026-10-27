// This validates replies; the renderer resolves the trusted target catalogue.
function assistantReply(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||JSON.stringify(value).length>250000)throw Error('Invalid program assistant response.');
 const fields={help:['kind','query'],guide:['kind','steps'],demonstrate:['kind','title','stages','checks'],note:['kind','text']}[value.kind];if(!fields||Object.keys(value).some(k=>!fields.includes(k)))throw Error('Invalid program assistant operation.');
 const target=v=>typeof v==='string'&&/^[a-z][a-z0-9-]*(?::[a-z0-9-]+)?$/.test(v)&&v.length<=100;
 if(value.kind==='help'&&(typeof value.query!=='string'||value.query.length>500))throw Error('Invalid help query.');
 if(value.kind==='note'&&(typeof value.text!=='string'||!value.text.trim()||value.text.length>2000))throw Error('Invalid context note.');
 if(value.kind==='guide'){
  if(!Array.isArray(value.steps)||!value.steps.length||value.steps.length>24)throw Error('Invalid guide steps.');
  for(const s of value.steps)if(!s||Object.keys(s).some(k=>!['action','target','text','value'].includes(k))||!['point','click','set'].includes(s.action)||!target(s.target)||s.text!==undefined&&(typeof s.text!=='string'||s.text.length>600)||s.value!==undefined&&!['string','number','boolean'].includes(typeof s.value))throw Error('Invalid guide step.');
 }
 if(value.kind==='demonstrate'){
  if(typeof value.title!=='string'||value.title.length>200||!Array.isArray(value.stages)||!value.stages.length||value.stages.length>8||value.checks!==undefined&&(!Array.isArray(value.checks)||value.checks.length>32))throw Error('Invalid model demonstration.');let total=0;
  for(const s of value.stages){if(!s||Object.keys(s).some(k=>!['text','target','commands'].includes(k))||typeof s.text!=='string'||s.text.length>1000||!Array.isArray(s.commands)||!s.commands.length||s.target!==undefined&&!target(s.target))throw Error('Invalid demonstration stage.');total+=s.commands.length;}if(total>200)throw Error('Demonstration exceeds command budget.');
 }
 return value;
}
module.exports={assistantReply};
