export const defaultOrganization=()=>({layers:[{id:'default',name:'Standard',hidden:false,locked:false}],folders:[],activeLayerId:'default',activeFolderId:null});
export function validateOrganization(s,nodes){
  if(!s||!Array.isArray(s.layers)||!s.layers.length||s.layers.length>500||!Array.isArray(s.folders)||s.folders.length>500)throw new Error('Ungültige Layer-/Ordnerverwaltung.');
  const valid=x=>x&&typeof x.id==='string'&&x.id.length>0&&typeof x.name==='string'&&x.name.trim()&&x.name.length<=200&&typeof x.hidden==='boolean'&&typeof x.locked==='boolean';
  if(!s.layers.every(valid)||!s.folders.every(valid)||!s.layers.some(x=>x.id==='default'))throw new Error('Ungültiger Layer oder Ordner.');
  const ids=new Set([...s.layers,...s.folders].map(x=>x.id));if(ids.size!==s.layers.length+s.folders.length)throw new Error('Doppelte Layer-/Ordnerkennungen.');
  const layer=id=>s.layers.some(x=>x.id===id),folder=id=>s.folders.find(x=>x.id===id);
  for(const f of s.folders){if(!layer(f.layerId)||(f.parentId!==null&&(!folder(f.parentId)||folder(f.parentId).layerId!==f.layerId)))throw new Error('Ungültiger Ordnerbezug.');const seen=new Set([f.id]);let parent=f.parentId;while(parent){if(seen.has(parent)||seen.size>12)throw new Error('Ordner enthalten einen Zyklus oder zu viele Ebenen.');seen.add(parent);parent=folder(parent).parentId;}}
  for(const n of nodes)if(!layer(n.layerId)||(n.folderId!==null&&(!folder(n.folderId)||folder(n.folderId).layerId!==n.layerId)))throw new Error('Ungültige Objektzuordnung.');
  if(!layer(s.activeLayerId)||(s.activeFolderId!==null&&(!folder(s.activeFolderId)||folder(s.activeFolderId).layerId!==s.activeLayerId)))throw new Error('Ungültiger aktiver Layer/Ordner.');return s;
}
export function ancestors(node,s){const chain=[],layer=s.layers.find(x=>x.id===node.layerId);if(layer)chain.push(layer);let id=node.folderId;const seen=new Set();while(id&&!seen.has(id)){seen.add(id);const f=s.folders.find(x=>x.id===id);if(!f)break;chain.push(f);id=f.parentId;}return chain;}
export function flags(node,s){const chain=ancestors(node,s);return {hidden:!!node.hidden||chain.some(x=>x.hidden),locked:!!node.locked||chain.some(x=>x.locked)};}
export function containerNodes(container,s,nodes){return nodes.filter(n=>ancestors(n,s).some(x=>x.id===container.id));}
export function assign(node,s,layerId=s.activeLayerId,folderId=s.activeFolderId){node.layerId=layerId;node.folderId=folderId;return node;}
export function repairAssignments(nodes,s){for(const n of nodes){if(!s.layers.some(x=>x.id===n.layerId))assign(n,s);if(n.folderId&&!s.folders.some(x=>x.id===n.folderId&&x.layerId===n.layerId))n.folderId=null;if(n.folderId===undefined)n.folderId=null;}}
export function removeContainer(id,s,nodes){
  const layer=s.layers.find(x=>x.id===id);if(layer){if(id==='default')throw new Error('Der Standardlayer bleibt erhalten.');s.layers=s.layers.filter(x=>x.id!==id);s.folders=s.folders.filter(x=>x.layerId!==id);for(const n of nodes)if(n.layerId===id)assign(n,s,'default',null);if(s.activeLayerId===id){s.activeLayerId='default';s.activeFolderId=null;}return;}
  const f=s.folders.find(x=>x.id===id);if(!f)return;for(const child of s.folders)if(child.parentId===id)child.parentId=f.parentId;for(const n of nodes)if(n.folderId===id)n.folderId=f.parentId;s.folders=s.folders.filter(x=>x.id!==id);if(s.activeFolderId===id)s.activeFolderId=f.parentId;
}
