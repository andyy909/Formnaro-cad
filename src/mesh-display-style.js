export const MESH_DISPLAY_STYLES = Object.freeze({
  blue: {
    label: 'Technisch · Blau',
    color: '#879eb8',
    edge: '#34495e',
    opacity: 0.48,
    roughness: 0.62,
    metalness: 0.03,
  },
  white: { label: 'Technisch · Weiß', color: '#e8e5dd', edge: '#253449', opacity: 0.8, roughness: 0.9, metalness: 0 },
  sand: { label: 'Matt · Sand', color: '#bd9670', edge: '#654b37', opacity: 0.24, roughness: 1, metalness: 0 },
  graphite: {
    label: 'Graphit · Hell umrandet',
    color: '#334452',
    edge: '#d2e4f0',
    opacity: 0.65,
    roughness: 0.72,
    metalness: 0.08,
  },
  fusion: {
    label: 'Fusion-inspiriert',
    color: '#b6b8ba',
    edge: '#34383d',
    opacity: 0.72,
    roughness: 0.56,
    metalness: 0.08,
    background: '#f3f3f3',
    ambient: 2.4,
    light: 2.8,
  },
  solidworks: {
    label: 'SolidWorks-inspiriert',
    color: '#8b99ae',
    edge: '#151c27',
    opacity: 0.95,
    roughness: 0.38,
    metalness: 0.12,
    background: '#e5ebf5',
    ambient: 1.75,
    light: 3.6,
  },
});

// Never change the project, per-face colors, cutters, or preview/diagnostic colors.
export function applyMeshDisplayStyle(mesh, style = 'blue', enabled = true) {
  const preset = MESH_DISPLAY_STYLES[style] ?? MESH_DISPLAY_STYLES.blue;
  const active = enabled && !mesh.userData.cutout && !mesh.material.vertexColors;
  const color = mesh.userData.objectColor ?? mesh.userData.record?.color;
  // Keep the six view presets for the neutral import default; saved custom
  // object colors take priority and remain correct after Save/Open and Undo.
  const objectColor = typeof color === 'string' && color.toLowerCase() !== '#8294aa';
  const key = `${style}:${active}:${objectColor ? color : ''}`;
  if (mesh.userData.meshStyleKey === key) return;
  mesh.userData.meshStyleKey = key;
  if (active) mesh.material.color.set(objectColor ? color : preset.color);
  mesh.material.roughness = active ? preset.roughness : 0.62;
  mesh.material.metalness = active ? preset.metalness : 0.03;
  for (const child of mesh.children)
    if (child.userData.meshContour) {
      child.material.color.set(active ? preset.edge : '#34495e');
      child.material.opacity = active ? preset.opacity : 0.48;
    }
}
