// A global property edit invalidates an open native tool's source revision.
// Diagnose that conflict before replay; never substitute another model action.
export function assertPracticeToolSequence(actions){
 const editors={
  'ui:tool:edges':{kind:'edge',prefix:'ui:id:cad-edge-',field:'ui:id:cad-edge-amount'},
  'ui:tool:cad-shell':{kind:'face',prefix:'ui:id:cad-modeling-',field:'ui:id:cad-modeling-thickness'},
  'ui:tool:cad-face-offset':{kind:'face',prefix:'ui:id:cad-modeling-',field:'ui:id:cad-modeling-offset'}
 };
 let active;
 for(const [index,action]of actions.entries()){
  if(action.kind==='ui'&&action.action==='click'&&editors[action.target]){active={...editors[action.target]};continue;}
  if(action.kind==='set'&&active)active.changed={field:action.field,index};
  if(!active)continue;
  if(action.kind==='ui'&&/-cancel$|-close$/.test(action.target??'')){active=null;continue;}
  if(active.changed&&(action.kind===active.kind||action.kind==='ui'&&action.target?.startsWith(active.prefix)))throw Error('Schritt '+(active.changed.index+1)+': '+active.changed.field+' ändert das ganze Bauteil und macht den geöffneten Werkzeugdialog ungültig. Für Werkzeugmaße '+active.field+' verwenden; eine beabsichtigte Bauteiländerung vor dem Öffnen ausführen oder den Dialog danach erneut öffnen.');
  if(action.kind==='ui'&&action.action==='click'&&action.target?.endsWith('-apply'))active=null;
 }
}
