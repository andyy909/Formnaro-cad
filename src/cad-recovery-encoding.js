import {createCadWorkspaceSerializer} from './cad-project.js';
import {encodeFnpackProject} from './cad-fnpack-data.js';
import {geometryRefs} from './cad-geometry-ref.js';
import {validateCadWorkspace,cadWorkspaceStoredProjectVersion} from './cad-workspace.js';

export function createRecoveryEncoding(){
 let model,workspaceSerializer,packageModel;
 return ({format,model:confirmed,workspace})=>{
  if(confirmed){model=confirmed;workspaceSerializer=packageModel=undefined;}
  if(!model)throw Error('Bestätigtes Modell für die Autosicherung fehlt.');
  let modelEncodes=0;
  if(format==='ocad'){
   if(!workspaceSerializer){workspaceSerializer=createCadWorkspaceSerializer(model);modelEncodes++;}
   return {value:workspaceSerializer.bytes(workspace),modelEncodes};
  }
  if(format!=='fnpack')throw Error('Ungültiges Format für die Autosicherung.');
  if(!packageModel){
   const encoded=encodeFnpackProject(model);
   packageModel={...encoded,hashes:[...geometryRefs(encoded.project).keys()]};
   modelEncodes++;
  }
  if(workspace===undefined)return {value:packageModel,modelEncodes};
  const project={...packageModel.project,workspace:validateCadWorkspace(workspace)};
  project.version=cadWorkspaceStoredProjectVersion(project.version,workspace);
  return {value:{...packageModel,project},modelEncodes};
 };
}
