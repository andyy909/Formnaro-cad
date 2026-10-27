export const MESH_DISPLAY_STYLES=Object.freeze({
  blue:{label:'Technisch · Blau',color:'#879eb8',edge:'#34495e',opacity:.48,roughness:.62,metalness:.03},
  white:{label:'Technisch · Weiß',color:'#e8e5dd',edge:'#253449',opacity:.8,roughness:.9,metalness:0},
  sand:{label:'Matt · Sand',color:'#bd9670',edge:'#654b37',opacity:.24,roughness:1,metalness:0},
  graphite:{label:'Graphit · Hell umrandet',color:'#334452',edge:'#d2e4f0',opacity:.65,roughness:.72,metalness:.08},
  fusion:{label:'Fusion-inspiriert',color:'#b6b8ba',edge:'#34383d',opacity:.72,roughness:.56,metalness:.08,background:'#f3f3f3',ambient:2.4,light:2.8},
  solidworks:{label:'SolidWorks-inspiriert',color:'#8b99ae',edge:'#151c27',opacity:.95,roughness:.38,metalness:.12,background:'#e5ebf5',ambient:1.75,light:3.6}
});

// Never change the project, per-face colors, cutters, or preview/diagnostic colors.
export function applyMeshDisplayStyle(mesh,style='blue',enabled=true){
  const preset=MESH_DISPLAY_STYLES[style]??MESH_DISPLAY_STYLES.blue;
  const active=enabled&&!mesh.userData.cutout&&!mesh.material.vertexColors;
  const key=`${style}:${active}`;
  if(mesh.userData.meshStyleKey===key)return;
  mesh.userData.meshStyleKey=key;
  if(active)mesh.material.color.set(preset.color);
  mesh.material.roughness=active?preset.roughness:.62;
  mesh.material.metalness=active?preset.metalness:.03;
  for(const child of mesh.children)if(child.userData.meshContour){
    child.material.color.set(active?preset.edge:'#34495e');
    child.material.opacity=active?preset.opacity:.48;
  }
}
