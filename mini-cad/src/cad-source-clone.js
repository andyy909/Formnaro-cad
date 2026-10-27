export function renewCadSource(source,rootId){
 const ids=new Map();function visit(node,root=false){const old=node.id;node.id=root?rootId:crypto.randomUUID();ids.set(old,node.id);for(const mark of node.annotations??[])mark.id=crypto.randomUUID();node.children?.forEach(n=>visit(n));}visit(source,true);
 function references(node){for(const step of node.finish?.steps??[])for(const edge of step.edges??[]){edge.origin.rootId=ids.get(edge.origin.rootId)??edge.origin.rootId;edge.origin.path=edge.origin.path.map(id=>ids.get(id)??id);}node.children?.forEach(references);}references(source);return source;
}
