import {cachedMeshJSON} from './render-data.js';

// Preserve native JSON field order/escaping. Only immutable mesh payloads are
// reused; mutable parameters, transforms and metadata are encoded afresh.
function nativeValue(value,key,root=false){
  if(root)return JSON.stringify(value);
  const wrapped=JSON.stringify({[key]:value});
  return wrapped==='{}'?undefined:wrapped.slice(JSON.stringify(key).length+2,-1);
}
function ordinaryJSON(value){
  // Do not read a stateful getter before native JSON's own toJSON lookup.
  for(let current=value;current;current=Object.getPrototypeOf(current)){
    const descriptor=Object.getOwnPropertyDescriptor(current,'toJSON');
    if(descriptor)return Object.hasOwn(descriptor,'value')&&typeof descriptor.value!=='function';
  }
  return true;
}
function plainData(value){
  if(JSON.isRawJSON?.(value))return false;
  if(!value||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return false;
  const descriptors=Object.getOwnPropertyDescriptors(value);
  if(Object.values(descriptors).some(d=>!Object.hasOwn(d,'value')))return false;
  return ordinaryJSON(value);
}
function ordinaryArray(value){
  return Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&ordinaryJSON(value);
}
function alreadyFrozenMeshJSON(mesh){
  if(!mesh||!Object.isFrozen(mesh))return null;
  const verts=Object.getOwnPropertyDescriptor(mesh,'verts'),triangles=Object.getOwnPropertyDescriptor(mesh,'triangles');
  if(!verts||!triangles||!Object.hasOwn(verts,'value')||!Object.hasOwn(triangles,'value')||!Object.isFrozen(verts.value)||!Object.isFrozen(triangles.value))return null;
  return cachedMeshJSON(mesh);
}
function encodeNode(node,key,stack,root=false){
  if(!plainData(node))return nativeValue(node,key,root);
  if(stack.has(node))throw new TypeError('Converting circular structure to JSON');
  stack.add(node);
  try{const fields=[];
    for(const name of Object.keys(node)){const value=node[name];let encoded;
      if(name==='mesh')encoded=alreadyFrozenMeshJSON(value)??nativeValue(value,name);
      else if(name==='children'&&ordinaryArray(value))encoded=encodeNodes(value,stack,name);
      else encoded=nativeValue(value,name);
      if(encoded!==undefined)fields.push(JSON.stringify(name)+':'+encoded);
    }
    return '{'+fields.join(',')+'}';
  }finally{stack.delete(node);}
}
function encodeNodes(nodes,stack,key){
  if(stack.has(nodes))throw new TypeError('Converting circular structure to JSON');
  // Exotic child arrays use native serialization (getters/custom JSON included).
  for(let i=0;i<nodes.length;i++){const descriptor=Object.getOwnPropertyDescriptor(nodes,i);if(descriptor&&!Object.hasOwn(descriptor,'value'))return nativeValue(nodes,key);}
  stack.add(nodes);
  try{return '['+Array.from({length:nodes.length},(_,i)=>encodeNode(nodes[i],String(i),stack)??'null').join(',')+']';}
  finally{stack.delete(nodes);}
}
export function meshNodeJSON(node){return encodeNode(node,'',new Set(),true);}
export function meshProjectJSON(project){
  if(!plainData(project)||!ordinaryArray(project.nodes))return JSON.stringify(project);
  const stack=new Set([project]),fields=[];
  for(const key of Object.keys(project)){const value=project[key],encoded=key==='nodes'?encodeNodes(value,stack,key):nativeValue(value,key);if(encoded!==undefined)fields.push(JSON.stringify(key)+':'+encoded);}
  return '{'+fields.join(',')+'}';
}
