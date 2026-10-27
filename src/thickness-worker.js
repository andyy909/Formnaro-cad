import {thicknessMap} from './thickness-map.js';
import {buildMeshSelectionTopology} from './mesh-selection-data.js';
import {inspectMeshTopology} from './mesh-inspector.js';
self.onmessage=({data})=>{try{if(data.validateTopology){const t=buildMeshSelectionTopology({verts:data.vertices,triangles:data.triangles}),r=inspectMeshTopology(t,{smallTriangleLimit:0});if(Object.entries(r.categories).some(([k,v])=>k!=='small'&&v.count))throw Error('Offenes oder topologisch fehlerhaftes Netz. Zuerst mit dem Netzinspektor prüfen.');}const result=thicknessMap(data,value=>self.postMessage({type:'progress',value}));self.postMessage({type:'result',result},[result.values.buffer]);}catch(error){self.postMessage({type:'error',message:error.message});}};
