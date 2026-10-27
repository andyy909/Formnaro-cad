import {SCHEMAS} from './parameters.js';

// Faithful arithmetic grammar from the original personal-template contract.
// No eval, calls, property access, scripts or executable template content.
export function formula(text,variables){
  if(typeof text!=='string'||text.length>300)throw Error('Ungültige Maßformel.');
  const tokens=text.match(/[A-Za-z_][A-Za-z_0-9]*|(?:\d+(?:\.\d*)?|\.\d+)|[()+*/-]/g)||[];if(tokens.join('')!==text.replace(/\s/g,'')||tokens.length>100)throw Error('Formel: nur Zahlen, Parameternamen und + − * / ( ).');let i=0;
  function atom(){const t=tokens[i++];if(t==='+'||t==='-')return(t==='-'?-1:1)*atom();if(t==='('){const n=add();if(tokens[i++]!==')')throw Error('Formel: Klammer fehlt.');return n;}if(t!==undefined&&/^\d|^\./.test(t))return Number(t);if(Object.hasOwn(variables,t))return variables[t];throw Error('Unbekannter Formelparameter: '+t);}
  function mul(){let n=atom();while(['*','/'].includes(tokens[i])){const op=tokens[i++],b=atom();n=op==='*'?n*b:n/b;}return n;}
  function add(){let n=mul();while(['+','-'].includes(tokens[i])){const op=tokens[i++],b=mul();n=op==='+'?n+b:n-b;}return n;}
  const n=add();if(i!==tokens.length||!Number.isFinite(n))throw Error('Ungültiges Formelergebnis.');return n;
}
function record(value,fields){if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Object.keys(value).some(key=>!fields.includes(key)))throw Error('Ungültiger Vorlagenparametervertrag.');}
export function cadTemplateSource(project,binding){let node=project.nodes[binding.index];for(const id of binding.path)node=node?.children?.find(child=>child.id===id);if(!['cad','mesh','referenceMesh'].includes(node?.kind))throw Error('Vorlagenquelle fehlt.');return node;}
export function validateCadTemplateData(project,{controls=[],bindings=[]}={}){
  if(!Array.isArray(controls)||controls.length>20)throw Error('Maximal 20 Vorlagenparameter.');const names=new Set();
  const validatedControls=controls.map(control=>{record(control,['name','value']);if(typeof control.name!=='string'||!/^[A-Za-z_][A-Za-z_0-9]{0,30}$/.test(control.name)||names.has(control.name)||!Number.isFinite(control.value)||Math.abs(control.value)>10000)throw Error('Ungültige Vorlagenparameter.');names.add(control.name);return {name:control.name,value:control.value};});
  if(!Array.isArray(bindings)||bindings.length>100)throw Error('Maximal 100 native Maßabhängigkeiten.');const variables=Object.fromEntries(validatedControls.map(control=>[control.name,control.value]));
  const validatedBindings=bindings.map(binding=>{
    record(binding,['index','path','field','formula']);if(!Number.isInteger(binding.index)||binding.index<0||binding.index>=project.nodes.length||!Array.isArray(binding.path)||binding.path.length>12||binding.path.some(id=>typeof id!=='string'||!id)||typeof binding.field!=='string'||typeof binding.formula!=='string'||binding.formula.length>300)throw Error('Ungültige native Maßabhängigkeit.');
    const source=cadTemplateSource(project,binding),key=binding.field.slice(7),numeric=(SCHEMAS[source.recipe?.type]||[]).some(field=>field.key===key&&!field.options&&field.key!=='edgeSteps');
    if(!/^(?:size|pos)\.[012]$/.test(binding.field)&&(!/^params\.[A-Za-z]+$/.test(binding.field)||source.source!=='native'||!numeric||!Object.hasOwn(source.recipe.params||{},key)))throw Error('Ziel: size.0–2, pos.0–2 oder vorhandener nativer params.Name.');
    formula(binding.formula,variables);return {index:binding.index,path:[...binding.path],field:binding.field,formula:binding.formula};
  });return {controls:validatedControls,bindings:validatedBindings};
}
export function cadTemplateVariables(controls,values={}){
  if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).some(key=>!controls.some(control=>control.name===key)))throw Error('Unbekannter Vorlagenparameter.');
  const result=Object.fromEntries(controls.map(control=>[control.name,values[control.name]??control.value]));if(Object.values(result).some(value=>!Number.isFinite(value)||Math.abs(value)>10000))throw Error('Vorlagenparameter: endliche Zahlen bis ±10000.');return result;
}
