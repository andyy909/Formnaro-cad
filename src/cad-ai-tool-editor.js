export function aiToolEditorCode(tool){
 if(tool.language!=='python'||!tool.tags?.includes('FreeCAD'))return tool.code;
 const script={version:1,name:tool.name,code:tool.code,parameters:{},modules:tool.modules??{},...(tool.tags.includes('GUI')?{gui:true}:{})};
 const command={op:'tool',engine:'freecad',operation:{kind:'build',script}};
 return '# Natives FreeCAD-Werkzeug; gemessene Parameter im Auftrag ergänzen.\nfrom formnaro import model\nimport json\nmodel.command(json.loads('+JSON.stringify(JSON.stringify(command))+'))\nawait model.flush()\n';
}
