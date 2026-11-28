// D5: turn the already visible and selected production parts into the nested
// assemblyTree contract consumed by exportCadStep (D3/D4). Parts are addressed
// only by their index; their identity, definition, placement and colour inputs
// stay on the part and are neither copied nor changed here.
const MAX_STEP_TREE_LEVELS = 12;

function invalid(message) {
  throw Error(message);
}

function folderOfPart(folders, nodes, part) {
  if (!part || typeof part !== 'object' || Array.isArray(part)) invalid('Ungültiger STEP-Exportteil.');
  if (typeof part.id !== 'string' || !part.id) invalid('Ungültiger STEP-Exportteil: Wurzelkennung fehlt.');
  const node = nodes.get(part.id);
  if (!node) invalid('Unbekanntes Teil im STEP-Exportbaum.');
  const folderId = node.folderId ?? null;
  if (folderId === null) return { folderId, chain: [] };
  // The chain is checked bottom-up so a selected part can never make a hidden
  // or orphaned project folder appear in the export. The caller's visibility
  // filter normally removes such parts already.
  const chain = [],
    seen = new Set();
  let current = folderId;
  while (current !== null) {
    const folder = folders.get(current);
    if (!folder) invalid('STEP-Exportbaum verweist auf einen unbekannten Projektordner.');
    if (seen.has(current)) invalid('Projektordner im STEP-Exportbaum enthält einen Zyklus.');
    if (folder.hidden) invalid('STEP-Exportbaum enthält ein Teil aus einem ausgeblendeten Projektordner.');
    seen.add(current);
    chain.push(current);
    current = folder.parentId ?? null;
  }
  return { folderId, chain };
}

export function cadStepProjectTree(project, parts, groups = new Set()) {
  if (!project || typeof project !== 'object' || !Array.isArray(project.nodes) || !Array.isArray(project.folders))
    invalid('Ungültiges CAD-Projekt für den STEP-Exportbaum.');
  if (!Array.isArray(parts) || !parts.length) invalid('STEP-Exportbaum benötigt mindestens ein sichtbares Teil.');

  const nodes = new Map(),
    folders = new Map(),
    childFolders = new Map();
  for (const node of project.nodes) if (node && typeof node.id === 'string') nodes.set(node.id, node);
  for (const folder of project.folders) {
    if (!folder || typeof folder.id !== 'string' || typeof folder.name !== 'string' || !folder.name.trim())
      invalid('Ungültiger Projektordner im STEP-Exportbaum.');
    if (folder.name.length > 1000 || folders.has(folder.id)) invalid('Ungültiger Projektordner im STEP-Exportbaum.');
    folders.set(folder.id, folder);
    const siblings = childFolders.get(folder.parentId ?? null) ?? [];
    siblings.push(folder);
    childFolders.set(folder.parentId ?? null, siblings);
  }

  // Direct leaves per container and the number of selected parts below every
  // folder. The latter keeps ancestors that only exist for a nested selection
  // while pruning folders whose entire content was filtered out.
  const directParts = new Map(),
    usedFolders = new Map(),
    directGroups = new Map();
  for (const [partIndex, part] of parts.entries()) {
    const { folderId, chain } = folderOfPart(folders, nodes, part),
      siblings = directParts.get(folderId) ?? [],
      leaf = { partIndex };
    if (groups.has(part.id)) {
      let group = directGroups.get(part.id);
      if (!group) {
        group = { name: nodes.get(part.id).name, children: [] };
        directGroups.set(part.id, group);
        siblings.push(group);
      }
      group.children.push(leaf);
    } else siblings.push(leaf);
    directParts.set(folderId, siblings);
    for (const id of chain) usedFolders.set(id, (usedFolders.get(id) ?? 0) + 1);
  }

  // Direct leaves keep their order from `parts`; subfolders follow in the
  // project's folder order. This is stable regardless of node/selection order.
  const buildFolder = (folder, depth) => {
    if (depth > MAX_STEP_TREE_LEVELS) invalid(`STEP-Exportbaum überschreitet ${MAX_STEP_TREE_LEVELS} Ebenen.`);
    const node = { name: folder.name, children: [] };
    for (const entry of directParts.get(folder.id) ?? []) {
      if (depth + 1 > MAX_STEP_TREE_LEVELS) invalid(`STEP-Exportbaum überschreitet ${MAX_STEP_TREE_LEVELS} Ebenen.`);
      node.children.push(entry);
    }
    for (const child of childFolders.get(folder.id) ?? [])
      if (usedFolders.has(child.id)) node.children.push(buildFolder(child, depth + 1));
    return node;
  };

  // A nameless project still needs the one named assembly root D3 requires.
  const name = typeof project.name === 'string' && project.name.trim() ? project.name : 'Baugruppe';
  if (name.length > 1000) invalid('Ungültiger STEP-Baugruppenname.');
  const root = { name, children: [] };
  for (const entry of directParts.get(null) ?? []) root.children.push(entry);
  for (const folder of childFolders.get(null) ?? [])
    if (usedFolders.has(folder.id)) root.children.push(buildFolder(folder, 2));
  return root;
}
