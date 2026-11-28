// C1-C5: project integration for the STEP assembly reader.
//
// The reader owns the native validation and returns one of two leaf contracts:
// - new: local `brep`/`stats` of the shared definition, `definitionId`,
//   `occurrencePath`, `worldTransform` (Formnaro column-major 4x4) and
//   optionally `definitionName`;
// - old: `brep`/`stats` already baked into world coordinates.
//
// This module maps those validated reader values into the Formnaro project:
// nested project folders from the occurrence tree, exactly one node with its
// own project node id per instance, the world placement as the node transform
// and an import-local definition mapping under project format 36. Identity is
// never inferred from matching names or equal geometry: only the reader's
// `definitionId` groups instances, and every file import creates fresh project
// definition ids.

import { cadIdentity, multiplyCadMatrices } from './cad-affine.js';
import { cadProjectSnapshot, validateAffineMatrix } from './cad-project.js';
import { COMPONENT_DEFINITIONS_VERSION, validateComponentDefinition } from './cad-component-definitions.js';

const MAX_TREE_ENTRIES = 1000,
  MAX_TREE_LEVELS = 12,
  MAX_NAME_LENGTH = 200,
  MAX_OCCURRENCE_SEGMENTS = 12,
  LEAF_FIELDS = [
    'name',
    'brep',
    'stats',
    'appearance',
    'faceColors',
    'definitionId',
    'definitionName',
    'occurrencePath',
    'worldTransform',
  ],
  NEW_CONTRACT_FIELDS = ['worldTransform', 'occurrencePath', 'definitionId', 'definitionName'],
  // Assembly entries are organization only. The native reader attaches an empty
  // `appearance` to them; it never describes a body.
  ASSEMBLY_FIELDS = ['name', 'children', 'appearance'];

function invalid(message) {
  throw Error(message);
}

function plainObject(value, message) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    invalid(message);
  return value;
}

function checkFields(value, allowed, message) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) invalid(`${message}: unbekanntes Feld ${key}.`);
}

function nodeName(value, message) {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_NAME_LENGTH) invalid(message);
  return value;
}

function optionalName(value, message) {
  if (value === undefined || value === null) return null;
  return nodeName(value, message);
}

function opacity(value, message) {
  if (!Number.isFinite(value) || value < 0 || value > 1) invalid(message);
  return value;
}

function color(value, message) {
  if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) invalid(message);
  return value;
}

function occurrencePath(value) {
  if (typeof value !== 'string' || !value || value.length > 4096)
    invalid('Ungültiger STEP-Vorkommenspfad im Leserbaum.');
  const segments = value.split('/');
  if (segments.length > MAX_OCCURRENCE_SEGMENTS || segments.some((segment) => !segment || /\s/.test(segment)))
    invalid('Ungültiger STEP-Vorkommenspfad im Leserbaum.');
}

// Per-file import identity. The reader only knows file-local definition ids;
// the project receives fresh definition ids, so importing the same file twice
// never merges or overwrites an earlier import.
function newDefinitionId(taken) {
  let id;
  do id = `step-${globalThis.crypto.randomUUID()}`;
  while (taken.has(id));
  taken.add(id);
  return id;
}

function newNodeId(taken) {
  let id;
  do id = globalThis.crypto.randomUUID();
  while (taken.has(id));
  taken.add(id);
  return id;
}

function leafAppearance(item, node) {
  const appearance = item.appearance === undefined ? null : plainObject(item.appearance, 'Ungültige STEP-Darstellung.');
  if (!appearance) return;
  checkFields(appearance, ['color', 'opacity'], 'Ungültige STEP-Darstellung');
  if (appearance.color !== undefined) node.color = color(appearance.color, 'Ungültige STEP-Farbe.');
  // The project keeps the existing 5 % opacity floor for imported parts; the
  // per-face opacity remains stored for export.
  if (appearance.opacity !== undefined)
    node.opacity = Math.max(0.05, opacity(appearance.opacity, 'Ungültige STEP-Transparenz.'));
}

function leafFaceColors(item) {
  if (item.faceColors === undefined) return null;
  if (!Array.isArray(item.faceColors) || item.faceColors.length > 40000)
    invalid('Ungültige STEP-Flächenfarben im Leserbaum.');
  const seen = new Set();
  return item.faceColors.map((entry) => {
    plainObject(entry, 'Ungültige STEP-Flächenfarbe.');
    checkFields(entry, ['faceIndex', 'appearance'], 'Ungültige STEP-Flächenfarbe');
    const faceIndex = entry.faceIndex;
    if (!Number.isSafeInteger(faceIndex) || faceIndex < 1 || faceIndex > 40000 || seen.has(faceIndex))
      invalid('Ungültige STEP-Flächenfarbe im Leserbaum.');
    seen.add(faceIndex);
    const appearance = plainObject(entry.appearance, 'Ungültige STEP-Flächenfarbe.');
    checkFields(appearance, ['color', 'opacity'], 'Ungültige STEP-Flächenfarbe');
    return {
      faceIndex,
      color: color(appearance.color, 'Ungültige STEP-Flächenfarbe im Leserbaum.'),
      opacity: Math.max(0.05, opacity(appearance.opacity ?? 1, 'Ungültige STEP-Flächenfarbe im Leserbaum.')),
    };
  });
}

// Both reader contracts are accepted side by side. A leaf that carries any of
// the definition fields is read as the new contract, so an old world-baked
// body stays exactly where it already is.
function leafFrame(item) {
  const current = NEW_CONTRACT_FIELDS.some((key) => Object.hasOwn(item, key));
  if (!current) return { current, worldTransform: null, definitionId: null, definitionName: null };
  const definitionId = item.definitionId ?? null;
  if (definitionId !== null && (typeof definitionId !== 'string' || !definitionId.trim() || definitionId.length > 1000))
    invalid('Ungültige STEP-Definitionskennung im Leserbaum.');
  if (item.definitionName !== undefined && definitionId === null)
    invalid('Ein STEP-Definitionsname benötigt eine Definitionskennung.');
  const definitionName = optionalName(item.definitionName, 'Ungültiger STEP-Definitionsname im Leserbaum.');
  if (Object.hasOwn(item, 'occurrencePath')) occurrencePath(item.occurrencePath);
  const worldTransform = Object.hasOwn(item, 'worldTransform')
    ? validateAffineMatrix(item.worldTransform, 'STEP-weltTransform')
    : cadIdentity();
  return { current, worldTransform, definitionId, definitionName };
}

/**
 * Import one validated STEP reader tree into a CAD project.
 *
 * The project is changed only after the complete result passed the normal
 * project validation, so a rejected reader tree leaves the caller's project
 * untouched.
 *
 * @param {object} project validated mutable CAD project
 * @param {Array<object>} tree reader tree: `{name,children}` assemblies and
 *   `{name,brep,stats,...}` leaves
 * @param {object} [options] `{name,id,layerId,folderId,metadata,transform}`
 * @returns {string[]} the new node ids in tree order
 */
export function importStepProject(project, tree, options = {}) {
  plainObject(project, 'Für den STEP-Import wird ein CAD-Projekt benötigt.');
  if (!Array.isArray(project.nodes) || !Array.isArray(project.folders) || !Array.isArray(project.layers))
    invalid('Das CAD-Projekt benötigt Knoten, Ordner und Layer.');
  if (!Array.isArray(tree) || !tree.length) invalid('Der STEP-Leser liefert keinen Baumbestand.');
  if (options === null || typeof options !== 'object' || Array.isArray(options))
    invalid('Ungültige STEP-Importoptionen.');
  if (options.metadata !== undefined) plainObject(options.metadata, 'Ungültige STEP-Importmetadaten.');

  const layerId = options.layerId ?? project.activeLayerId,
    parentId = options.folderId ?? project.activeFolderId ?? null,
    hasAssembly = tree.length > 1 || Array.isArray(tree[0]?.children),
    base =
      options.transform === undefined || options.transform === null ? null : validateAffineMatrix(options.transform),
    takenNodeIds = new Set(),
    takenDefinitionIds = new Set((project.componentDefinitions?.definitions ?? []).map((entry) => entry.id));
  for (const node of project.nodes) takenNodeIds.add(node?.id);
  const ids = [],
    nodes = [],
    folders = [],
    definitions = [],
    byNativeDefinition = new Map();
  let entries = 0;

  function folder(name, parent) {
    const id = newNodeId(takenNodeIds);
    folders.push({ id, name, hidden: false, locked: false, layerId, parentId: parent });
    return id;
  }

  function definition(nativeId, definitionName, fallbackName, sourceNodeId) {
    const existing = byNativeDefinition.get(nativeId);
    if (existing) {
      // The reader may report the same product name on every occurrence. A
      // contradiction is rejected instead of silently picking one name.
      if (definitionName !== null && existing.nameSource !== null && definitionName !== existing.nameSource)
        invalid(`Widersprüchliche STEP-Definitionsnamen für "${nativeId}".`);
      if (existing.nameSource === null && definitionName !== null) {
        existing.nameSource = definitionName;
        Object.assign(
          existing.definition,
          validateComponentDefinition({ ...existing.definition, name: definitionName }),
        );
      }
      return existing.definition.id;
    }
    const valid = validateComponentDefinition({
      id: newDefinitionId(takenDefinitionIds),
      name: definitionName ?? fallbackName,
      sourceNodeId,
    });
    const entry = { definition: valid, nameSource: definitionName };
    definitions.push(valid);
    byNativeDefinition.set(nativeId, entry);
    return valid.id;
  }

  function leaf(item, targetFolder) {
    plainObject(item, 'Ungültiges STEP-Blatt im Leserbaum.');
    checkFields(item, LEAF_FIELDS, 'Ungültiges STEP-Blatt im Leserbaum');
    const name = nodeName(item.name, 'Ungültiger STEP-Teilname im Leserbaum.'),
      frame = leafFrame(item),
      node = {
        id: ids.length === 0 && options.id !== undefined ? options.id : null,
        kind: 'cad',
        name,
        source: 'step',
        solid: true,
        transform: frame.current
          ? base === null
            ? frame.worldTransform
            : multiplyCadMatrices(base, frame.worldTransform)
          : (base ?? cadIdentity()),
        layerId,
        folderId: targetFolder,
        brep: item.brep,
        stats: item.stats,
        metadata: structuredClone(options.metadata ?? {}),
      };
    if (node.id === null) node.id = newNodeId(takenNodeIds);
    else {
      if (typeof node.id !== 'string' || !node.id.trim() || takenNodeIds.has(node.id))
        invalid('Die vorgegebene STEP-Importkennung ist unbrauchbar oder bereits vergeben.');
      takenNodeIds.add(node.id);
    }
    leafAppearance(item, node);
    const faces = leafFaceColors(item);
    if (faces?.length) node.metadata.stepFaceColors = faces;
    if (hasAssembly && frame.definitionId !== null)
      node.definitionId = definition(frame.definitionId, frame.definitionName, name, node.id);
    nodes.push(node);
    ids.push(node.id);
  }

  function visit(item, targetFolder, level) {
    if (++entries > MAX_TREE_ENTRIES) invalid('STEP-Baum überschreitet 1000 Einträge.');
    if (level > MAX_TREE_LEVELS) invalid(`STEP-Baum überschreitet ${MAX_TREE_LEVELS} Ebenen.`);
    plainObject(item, 'Ungültiger STEP-Baumknoten im Leserbaum.');
    if (Object.hasOwn(item, 'children')) {
      checkFields(item, ASSEMBLY_FIELDS, 'Ungültige STEP-Baugruppe im Leserbaum');
      const name = nodeName(item.name, 'Ungültiger STEP-Baugruppenname im Leserbaum.');
      if (!Array.isArray(item.children) || !item.children.length) invalid('STEP-Baugruppe enthält einen leeren Ast.');
      const id = folder(name, targetFolder);
      for (const child of item.children) visit(child, id, level + 1);
      return;
    }
    leaf(item, targetFolder);
  }

  // One project folder per import keeps two imports of the same file apart,
  // exactly like a normal file import. The tree then adds its own folders.
  const rootFolder = folder(options.name ?? 'STEP', parentId);
  for (const item of tree) visit(item, rootFolder, 1);

  const draft = {
    ...project,
    nodes: [...project.nodes, ...nodes],
    folders: [...project.folders, ...folders],
  };
  if (definitions.length)
    draft.componentDefinitions = {
      version: COMPONENT_DEFINITIONS_VERSION,
      definitions: [...(project.componentDefinitions?.definitions ?? []), ...definitions],
    };
  // Validate the complete result before the caller's project changes. The
  // validated snapshot also raises the in-memory format to 36 as soon as a
  // component definition exists, so the next rebuild sees the same version the
  // saved file will carry.
  const validated = cadProjectSnapshot(draft);
  project.nodes = validated.nodes;
  project.folders = validated.folders;
  project.version = validated.version;
  if (validated.componentDefinitions) project.componentDefinitions = validated.componentDefinitions;
  return ids;
}
