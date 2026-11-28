// Pure STEP import tree. The native XCAF bridge returns either an older
// world-baked document (name, style and BRep per leaf) or the occurrence
// contract (definitionId, occurrencePath and one local 3x4 placement per node,
// with the unplaced definition geometry in `brep`). This module validates that
// document and normalises it for the project importer: one leaf per occurrence
// with a Formnaro column-major world transform, and each distinct definition
// geometry listed once. No OCCT handle, BRep or project state enters here;
// cad-step-io.js reads the definitions natively afterwards.
const MAX_STEP_ENTRIES = 1000,
  MAX_STEP_LEVELS = 12,
  MAX_STEP_PARTS = 500,
  MAX_STEP_NAME = 200,
  MAX_STEP_DEFINITION_ID = 1000,
  MAX_STEP_OCCURRENCE_PATH = 4096,
  MAX_STEP_FACE_COLORS = 40000,
  IDENTITY_KEYS = ['definitionId', 'occurrencePath', 'localTransform'],
  GEOMETRY_MODES = ['definition', 'world'],
  IDENTITY_TRANSFORM = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function stepName(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_STEP_NAME)
    throw Error(`STEP-Baum enthält einen ungültigen Namen (1 bis ${MAX_STEP_NAME} Zeichen).`);
  return value;
}

function stepControlFree(value, label) {
  if (/[\u0000-\u001f\u007f]/.test(value)) throw Error(`Ungültiger STEP-${label}.`);
  return value;
}

function stepDefinitionId(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_STEP_DEFINITION_ID)
    throw Error('Ungültige STEP-Definitionskennung.');
  return stepControlFree(value, 'Definitionskennung');
}

// Native TDF entry paths ("0:1:1:2:1") and their slash-prefixed occurrence
// chains ("0:1/0:1:2") contain no whitespace. Synthetic paths for an older
// bridge use the index chain ("0/1/2") and satisfy the same rule.
function stepOccurrencePath(value) {
  if (
    typeof value !== 'string' ||
    !value.length ||
    value.length > MAX_STEP_OCCURRENCE_PATH ||
    value.split('/').some((segment) => !segment || /\s/.test(segment))
  )
    throw Error('Ungültiger STEP-Vorkommenspfad.');
  return stepControlFree(value, 'Vorkommenspfad');
}

function stepGeometryMode(value, context) {
  if (value === undefined) return undefined;
  if (!GEOMETRY_MODES.includes(value))
    throw Error(`Ungültiger STEP-Geometriemodus (${context}): definition oder world erwartet.`);
  return value;
}

function stepDocument(document) {
  if (Array.isArray(document)) return { roots: document, geometry: undefined };
  if (!document || typeof document !== 'object') throw Error('STEP-Baum besitzt kein gültiges Dokument.');
  for (const key of Object.keys(document))
    if (key !== 'roots' && key !== 'geometry') throw Error('STEP-Baum besitzt unbekannte Dokumentfelder.');
  if (!Array.isArray(document.roots)) throw Error('STEP-Baum benötigt eine Liste von Wurzeln.');
  return { roots: document.roots, geometry: stepGeometryMode(document.geometry, 'Dokument') };
}

/** Convert one native gp_Trsf 3x4 row-major placement into Formnaro's
 * column-major 4x4 affine matrix. Translation stays in the fourth column. */
export function stepColumnMajorTransform(value) {
  if (!Array.isArray(value) || value.length !== 12 || !value.every(Number.isFinite))
    throw Error('STEP-Platzierung benötigt zwölf endliche Matrixwerte.');
  const [a, b, c, tx, d, e, f, ty, g, h, i, tz] = value,
    determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g),
    scale = Math.max(...[a, b, c, d, e, f, g, h, i].map(Math.abs));
  if (!(scale > 0) || !Number.isFinite(determinant) || Math.abs(determinant) <= 1e-12 * scale * scale * scale)
    throw Error('STEP-Platzierung ist singulär.');
  return [a, d, g, 0, b, e, h, 0, c, f, i, 0, tx, ty, tz, 1];
}

/** Column-vector convention: result = parent * child. */
export function composeStepTransforms(parent, child) {
  const result = [];
  for (let column = 0; column < 4; column++)
    for (let row = 0; row < 4; row++)
      result[column * 4 + row] =
        parent[row] * child[column * 4] +
        parent[4 + row] * child[column * 4 + 1] +
        parent[8 + row] * child[column * 4 + 2] +
        parent[12 + row] * child[column * 4 + 3];
  return result;
}

function stepAppearance(value, context) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error(`Ungültige STEP-Darstellung (${context}).`);
  const appearance = {};
  for (const key of Object.keys(value)) {
    if (key === 'color') {
      if (typeof value.color !== 'string' || !/^#[\da-f]{6}$/i.test(value.color))
        throw Error(`Ungültige STEP-Farbe (${context}).`);
      appearance.color = value.color.toLowerCase();
    } else if (key === 'opacity') {
      if (!Number.isFinite(value.opacity) || value.opacity < 0 || value.opacity > 1)
        throw Error(`Ungültige STEP-Transparenz (${context}).`);
      appearance.opacity = value.opacity;
    } else throw Error(`Ungültige STEP-Darstellung (${context}).`);
  }
  return appearance;
}

function stepFaceColors(value, context) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_STEP_FACE_COLORS)
    throw Error(`Ungültige STEP-Flächenfarben (${context}).`);
  return value.map((style) => {
    if (!style || typeof style !== 'object' || Array.isArray(style))
      throw Error(`Ungültige STEP-Flächenfarbe (${context}).`);
    const keys = Object.keys(style);
    if (keys.length !== 2 || !keys.includes('faceIndex') || !keys.includes('appearance'))
      throw Error(`Ungültige STEP-Flächenfarbe (${context}).`);
    if (!Number.isInteger(style.faceIndex) || style.faceIndex < 1)
      throw Error(`Ungültige STEP-Flächenfarbe (${context}).`);
    const appearance = stepAppearance(style.appearance, context);
    if (!appearance.color) throw Error(`Ungültige STEP-Flächenfarbe (${context}).`);
    return { faceIndex: style.faceIndex, appearance };
  });
}

function stepIdentity(node) {
  const present = IDENTITY_KEYS.filter((key) => node[key] !== undefined);
  if (!present.length) return null;
  if (present.length !== IDENTITY_KEYS.length)
    throw Error(
      'STEP-Brücke liefert Vorkommensidentität unvollständig (definitionId, occurrencePath, localTransform).',
    );
  return {
    definitionId: stepDefinitionId(node.definitionId),
    occurrencePath: stepOccurrencePath(node.occurrencePath),
    localTransform: stepColumnMajorTransform(node.localTransform),
  };
}

function registerPath(state, occurrencePath) {
  if (state.paths.has(occurrencePath)) throw Error(`STEP-Vorkommenspfad ist nicht eindeutig (${occurrencePath}).`);
  state.paths.add(occurrencePath);
}

// Equal ids must describe one and the same local definition. The first
// occurrence supplies the geometry; a later occurrence may omit it, which keeps
// the bridge free to serialise a shared definition only once.
function registerDefinition(state, definitionId, brep, definitionName) {
  const existing = state.definitions.get(definitionId),
    label = definitionName === undefined ? undefined : stepName(definitionName);
  if (!existing) {
    const definition = { definitionId, brep: brep ?? null, name: label };
    state.definitions.set(definitionId, definition);
    return definition;
  }
  if (label !== undefined && existing.name !== undefined && label !== existing.name)
    throw Error(
      `Widersprüchliche STEP-Definition "${definitionId}": gleiche Kennung erlaubt nur gleiche Definitionsnamen.`,
    );
  if (label !== undefined && existing.name === undefined) existing.name = label;
  if (brep === undefined) return existing;
  if (existing.brep === null) {
    existing.brep = brep;
    return existing;
  }
  if (existing.brep !== brep)
    throw Error(
      `Widersprüchliche STEP-Definition "${definitionId}": gleiche Kennung erlaubt nur gleiche Definitionsform.`,
    );
  return existing;
}

function visit(node, path, depth, parentTransform, state) {
  if (++state.entries > MAX_STEP_ENTRIES)
    throw Error('STEP-Baum überschreitet die Projektgrenzen (1000 Einträge, 12 Ebenen, Namen bis 200 Zeichen).');
  if (depth >= MAX_STEP_LEVELS) throw Error(`STEP-Baum überschreitet ${MAX_STEP_LEVELS} Ebenen.`);
  if (!node || typeof node !== 'object' || Array.isArray(node))
    throw Error('STEP-Baum enthält einen ungültigen Eintrag.');
  if (state.nodes.has(node)) throw Error('STEP-Baum enthält einen Zyklus.');
  state.nodes.add(node);
  const name = stepName(node.name),
    identity = stepIdentity(node),
    hasIdentity = identity !== null,
    nodeGeometry = stepGeometryMode(node.geometry, name);
  if (nodeGeometry !== undefined && state.explicitGeometry !== undefined && nodeGeometry !== state.explicitGeometry)
    throw Error('STEP-Brücke liefert gemischte Geometrieverträge.');
  const explicitGeometry = nodeGeometry ?? state.explicitGeometry;
  // Partially identified trees lack the complete chain of placements.
  if (state.hasIdentity === undefined) state.hasIdentity = hasIdentity;
  else if (state.hasIdentity !== hasIdentity && explicitGeometry === undefined)
    throw Error('STEP-Brücke liefert Vorkommensidentität nur teilweise.');
  const placement = identity ? composeStepTransforms(parentTransform, identity.localTransform) : parentTransform;
  if (!placement.every(Number.isFinite)) throw Error('STEP-Platzierung überschreitet den Zahlenbereich.');
  if (node.children !== undefined) {
    if (!Array.isArray(node.children) || !node.children.length) throw Error('STEP-Baum enthält einen leeren Ast.');
    if (node.brep !== undefined || node.faceColors !== undefined || node.brepVersion !== undefined)
      throw Error('STEP-Knoten ist gleichzeitig Baugruppe und Körper.');
    registerPath(state, identity?.occurrencePath ?? path.join('/'));
    return {
      name,
      // Assembly nodes stay organisation only, but keep the validated style the
      // previous reader exposed to callers.
      appearance: stepAppearance(node.appearance, name),
      children: node.children.map((child, index) => visit(child, [...path, index], depth + 1, placement, state)),
    };
  }
  if (++state.parts > MAX_STEP_PARTS) throw Error('STEP-Datei enthält mehr als 500 Körper.');
  if (node.brep !== undefined && (typeof node.brep !== 'string' || !node.brep.length))
    throw Error(`STEP-Körper "${name}" besitzt keine Geometrie.`);
  if (node.brepVersion !== undefined && node.brepVersion !== 1 && node.brepVersion !== 2)
    throw Error('Unbekannte STEP-BRep-Version.');
  const markedGeometry = node.brepVersion === undefined ? undefined : node.brepVersion === 2 ? 'definition' : 'world';
  if (markedGeometry && explicitGeometry && markedGeometry !== explicitGeometry)
    throw Error('STEP-Brücke liefert gemischte Geometrieverträge.');
  const geometry = markedGeometry ?? explicitGeometry ?? 'world';
  if (state.geometry === undefined) state.geometry = geometry;
  else if (state.geometry !== geometry) throw Error('STEP-Brücke liefert gemischte Geometrieverträge.');
  if (geometry === 'definition' && identity === null)
    throw Error('STEP-Definition benötigt definitionId, occurrencePath und localTransform.');
  const occurrencePath = identity?.occurrencePath ?? path.join('/'),
    definitionId = geometry === 'definition' ? identity.definitionId : `world:${occurrencePath}`;
  // Only a later occurrence of an already known definition may omit the
  // shared BRep text; the first occurrence always supplies the local geometry.
  if (node.brep === undefined && !state.definitions.has(definitionId))
    throw Error(`STEP-Körper "${name}" besitzt keine Geometrie.`);
  const definition = registerDefinition(
      state,
      definitionId,
      node.brep,
      geometry === 'definition' ? node.definitionName : undefined,
    ),
    leaf = {
      name,
      appearance: stepAppearance(node.appearance, name),
      faceColors: stepFaceColors(node.faceColors, name),
      definitionId,
      occurrencePath,
      worldTransform: geometry === 'definition' ? placement : IDENTITY_TRANSFORM,
    };
  registerPath(state, occurrencePath);
  if (definition.name !== undefined) leaf.definitionName = definition.name;
  return leaf;
}

/** Validate a native STEP document and return the normalised import plan:
 * `tree` (branches with names/children, leaves with identity and transform),
 * `definitions` (one local BRep text per distinct definition) and `counts`.
 * `geometry` names the recognised contract: `definition` for the occurrence
 * bridge or `world` for an older world-baked bridge. */
export function planCadStepImportTree(document) {
  const { roots, geometry } = stepDocument(document);
  if (!roots.length) throw Error('STEP-Datei enthält keine Bauteile.');
  if (roots.length > MAX_STEP_ENTRIES)
    throw Error('STEP-Baum überschreitet die Projektgrenzen (1000 Einträge, 12 Ebenen, Namen bis 200 Zeichen).');
  const state = {
    geometry,
    explicitGeometry: geometry,
    entries: 0,
    parts: 0,
    definitions: new Map(),
    paths: new Set(),
    nodes: new Set(),
  };
  // The geometry mode is only known after the first node; leaves need their
  // geometry list complete before any native BRep is read.
  const tree = roots.map((node, index) => visit(node, [index], 0, IDENTITY_TRANSFORM, state));
  for (const definition of state.definitions.values())
    if (definition.brep === null) throw Error(`STEP-Definition "${definition.definitionId}" besitzt keine Geometrie.`);
  return {
    geometry: state.geometry,
    tree,
    definitions: [...state.definitions.values()],
    counts: { entries: state.entries, parts: state.parts, definitions: state.definitions.size },
  };
}
