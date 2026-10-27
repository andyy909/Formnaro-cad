/** Browser and Node verification workers use the same operation dispatcher. */
export async function meshEngineRequest(adapter,request){
  if(request?.job==='importLegacy')return adapter.importLegacy(request.encoded);
  if(request?.job==='inspectSolid')return adapter.inspectSolid(request.node);
  if(request?.job==='analyzeEdges')return adapter.analyzeEdges(request.node);
  if(request?.job==='toolsQuery')return adapter.toolsQuery(request);
  if(request?.job==='edit')return adapter.edit({project:request.project,operation:request.operation});
  throw Error('Unbekannter Netzauftrag.');
}
