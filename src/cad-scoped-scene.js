import {selectCadScene} from './cad-command-reference.js';
import {cadScopedJointState} from './cad-joints-automation.js';
import {cadProjectParameterCatalogSummary} from './cad-project-parameters-automation.js';

export function cadScopedScene(scene,project,options){
 const scoped=selectCadScene(scene,options);
 if(scoped===scene)return scene;
 const joints=cadScopedJointState(project,scoped.objects.map(object=>object.target.rootId));
 if(joints)scoped.joints=joints;
 if(project.projectParameters&&(options.ids||options.targets)){
  const targets=scoped.objects.filter(object=>object.kind==='cad').map(object=>object.target);
  scoped.projectParameterCatalog=cadProjectParameterCatalogSummary(project,{targets});
 }
 return scoped;
}
