import { validateCadSolid, writeCadBrep, readCadBrep } from './cad-native-kernel.js';
import { planCadStepImportTree } from './cad-step-import-tree.js';

const MAX_STEP_IMPORT_BYTES = 40 * 1024 * 1024,
  MAX_STEP_DEFINITION_BYTES = 12 * 1024 * 1024;

// XCAF structure is organization, never a Boolean union of overlapping parts.
// The native document is validated and planned before any BRep is read, so an
// older world-baked bridge and the occurrence bridge reach the same leaf shape:
// local geometry plus a Formnaro column-major world transform.
export function importCadStepAssembly(oc, bytes) {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > MAX_STEP_BYTES)
    throw Error('STEP-Import benötigt eine Datei bis 30 MB.');
  if (!/ISO-10303-21\s*;/i.test(new TextDecoder().decode(bytes.subarray(0, 256))))
    throw Error('Keine STEP-Datei im unterstützten Textformat.');
  const path = filePath();
  try {
    oc.FS.writeFile(path, bytes);
    let document;
    try {
      document = oc.FormnaroCadBridge.ReadStepAssemblyJson(path);
    } catch {
      throw Error(
        'STEP-Baugruppe konnte nicht vollständig gelesen werden. Unterstützt werden eigenständige Dateien mit geschlossenen CAD-Teilen, bis 500 Teilen und 12 Ebenen. Externe STEP-Referenzen bitte vorher in eine Datei einbetten.',
      );
    }
    let raw;
    try {
      raw = JSON.parse(document);
    } catch {
      throw Error('STEP-Baugruppe konnte nicht gelesen werden: Die native Antwort ist kein gültiges JSON.');
    }
    return importCadStepTree(oc, raw);
  } finally {
    try {
      oc.FS.unlink(path);
    } catch {}
  }
}

function stepImportFailure(error) {
  const failure = error instanceof Error ? error : Error(String(error));
  failure.message = `STEP-Baugruppe konnte nicht gelesen werden: ${failure.message}`;
  return failure;
}

// Read every distinct definition exactly once. Occurrences of one definition
// share the resulting bytes; each leaf receives its own wrapper and stats copy.
export function importCadStepTree(oc, document) {
  let plan;
  try {
    plan = planCadStepImportTree(document);
  } catch (error) {
    throw stepImportFailure(error);
  }
  const encoder = new TextEncoder(),
    definitions = new Map();
  let totalBytes = 0;
  for (const definition of plan.definitions) {
    const label = definition.name ?? definition.definitionId,
      shape = readCadBrep(oc, definition.brep);
    let data, checked;
    try {
      checked = validateCadSolid(oc, shape);
      data = writeCadBrep(oc, shape);
    } catch (error) {
      error.message += ` [${label}]`;
      throw error;
    } finally {
      shape.delete();
    }
    const bytes = encoder.encode(data).length;
    if (bytes > MAX_STEP_DEFINITION_BYTES) throw Error(`STEP-Teil "${label}" überschreitet die BRep-Grenze.`);
    totalBytes += bytes;
    if (totalBytes > MAX_STEP_IMPORT_BYTES) throw Error('STEP-Baugruppe überschreitet das CAD-Projektbudget.');
    definitions.set(definition.definitionId, {
      brep: { format: 'OpenCascade-BRep', data, triangulation: false },
      stats: {
        bounds: { min: [...checked.bounds.min], max: [...checked.bounds.max] },
        volume: checked.volume,
        solids: checked.solids,
      },
    });
  }
  return plan.tree.map((node) => stepImportNode(node, definitions, plan.geometry === 'definition'));
}

function stepImportNode(node, definitions, hasNativeIdentity) {
  if (node.children)
    return {
      name: node.name,
      appearance: node.appearance,
      children: node.children.map((child) => stepImportNode(child, definitions, hasNativeIdentity)),
    };
  const definition = definitions.get(node.definitionId);
  if (!definition) throw Error(`STEP-Definition "${node.definitionId}" fehlt.`);
  return {
    name: node.name,
    appearance: node.appearance,
    faceColors: node.faceColors,
    brep: { ...definition.brep },
    stats: structuredClone(definition.stats),
    ...(hasNativeIdentity
      ? {
          definitionId: node.definitionId,
          occurrencePath: node.occurrencePath,
          worldTransform: [...node.worldTransform],
          ...(node.definitionName === undefined ? {} : { definitionName: node.definitionName }),
        }
      : {}),
  };
}

let sequence = 0;
export const MAX_STEP_BYTES = 30 * 1024 * 1024;
function scope() {
  const values = [];
  return {
    keep: (value) => (values.push(value), value),
    close: () => {
      for (const value of values.reverse()) value?.delete?.();
    },
  };
}
function filePath() {
  return `/formnaro-cad-${++sequence}.step`;
}

// OCCT preserves explicit Part 21 character directives but writes an ordinary
// UTF-8 label literally. Encode the temporary export label for readers of the
// AP214/Part21-2002 string grammar, without changing the actual model name.
export function stepPartName(name) {
  if (typeof name !== 'string' || !name.length || name.length > 1000) throw Error('Ungültiger STEP-Teilename.');
  const points = Array.from(name, (v) => v.codePointAt(0));
  if (points.some((v) => v >= 0xd800 && v <= 0xdfff))
    throw Error('STEP-Teilename enthält ein ungültiges Unicode-Zeichen.');
  if (points.every((v) => v >= 32 && v <= 126 && v !== 92)) return name;
  const wide = points.some((v) => v > 0xffff),
    digits = wide ? 8 : 4;
  return (
    '\\X' +
    (wide ? '4' : '2') +
    '\\' +
    points.map((v) => v.toString(16).toUpperCase().padStart(digits, '0')).join('') +
    '\\X0\\'
  );
}

// OCCT may wrap an encoded name in the middle of a hexadecimal code unit.
// Keep each escape intact, using plain ASCII for the characters it can represent.
function normalizeStepNames(bytes) {
  const text = new TextDecoder().decode(bytes);
  const fixed = text.replace(/\\X([24])\\([0-9A-F\r\n]+)\\X0\\/g, (encoded, width, hex) => {
    if (!/[\r\n]/.test(hex)) return encoded;
    const digits = Number(width) * 2;
    const joined = hex.replace(/[\r\n]/g, '');
    let name = '';
    for (let i = 0; i < joined.length; i += digits) {
      const unit = joined.slice(i, i + digits);
      const point = Number.parseInt(unit, 16);
      name +=
        point >= 32 && point <= 126 && point !== 92
          ? point === 39
            ? "''"
            : String.fromCodePoint(point)
          : `\\X${width}\\${unit}\\X0\\`;
    }
    return name;
  });
  return fixed === text ? bytes : new TextEncoder().encode(fixed);
}

// The imported body remains in original millimetre coordinates. Placement and
// optional centering belong to the caller's full affine matrix, never a mesh.
export function importCadStep(oc, bytes) {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > MAX_STEP_BYTES)
    throw Error('STEP-Import benötigt eine Datei bis 30 MB.');
  if (!/ISO-10303-21\s*;/i.test(new TextDecoder().decode(bytes.subarray(0, 256))))
    throw Error('Keine STEP-Datei im unterstützten Textformat.');
  const path = filePath(),
    objects = scope();
  try {
    oc.FS.writeFile(path, bytes);
    const reader = objects.keep(new oc.STEPControl_Reader());
    if (reader.ReadFile(path) !== oc.IFSelect_ReturnStatus.IFSelect_RetDone)
      throw Error('STEP-Datei konnte nicht gelesen werden.');
    reader.SetSystemLengthUnit(1);
    if (!reader.TransferRoots()) throw Error('STEP-Datei enthält keine übertragbaren Körper.');
    const shape = objects.keep(reader.OneShape()),
      checked = validateCadSolid(oc, shape);
    return {
      brep: { format: 'OpenCascade-BRep', data: writeCadBrep(oc, shape), triangulation: false },
      stats: {
        bounds: { min: checked.bounds.min, max: checked.bounds.max },
        volume: checked.volume,
        solids: checked.solids,
      },
    };
  } finally {
    objects.close();
    try {
      oc.FS.unlink(path);
    } catch {}
  }
}

const MAX_ASSEMBLY_LEVELS = 12,
  MAX_DEFINITION_ID_LENGTH = 1000;

function assemblyNodeName(name) {
  if (typeof name !== 'string' || !name.trim() || name.length > 1000) throw Error('Ungültiger STEP-Baugruppenname.');
  // stepPartName rejects invalid Unicode surrogates for the Part 21 grammar.
  stepPartName(name);
}

// A definition id groups repeated occurrences of one part. It is never written
// to the STEP document; only the resulting shared XCAF label and its per
// occurrence location are. `null` keeps the D3 behaviour of a standalone part.
function stepDefinitionId(part) {
  if (part.definitionId === undefined || part.definitionId === null) return null;
  if (
    typeof part.definitionId !== 'string' ||
    !part.definitionId.trim() ||
    part.definitionId.length > MAX_DEFINITION_ID_LENGTH
  )
    throw Error('Ungültige STEP-Definitionskennung.');
  return part.definitionId;
}

// Everything a shared definition must agree on besides its shape: surface
// colour, transparency and the per-face presentation. The definition name comes
// from the first occurrence; further occurrences keep their own name as the
// STEP usage name, exactly like Formnaro's definition/instance name split. The
// canonical string is only compared inside one export, so a stable order is
// sufficient. An explicit definitionName lets a package give the definition
// its own stable label independently of every occurrence label.
function stepPartPresentation(part) {
  if (part.color !== undefined && !/^#[\da-f]{6}$/i.test(part.color)) throw Error('Ungültige STEP-Farbe.');
  if (part.opacity !== undefined && (!Number.isFinite(part.opacity) || part.opacity < 0 || part.opacity > 1))
    throw Error('Ungültige STEP-Transparenz.');
  if (part.faceColors !== undefined && !Array.isArray(part.faceColors)) throw Error('Ungültige STEP-Flächenfarbe.');
  const faces = (part.faceColors ?? []).map((style) => {
    if (
      !style ||
      !Number.isInteger(style.faceIndex) ||
      style.faceIndex < 1 ||
      typeof style.color !== 'string' ||
      !/^#[\da-f]{6}$/i.test(style.color) ||
      !Number.isFinite(style.opacity) ||
      style.opacity < 0 ||
      style.opacity > 1
    )
      throw Error('Ungültige STEP-Flächenfarbe.');
    return `${style.faceIndex}/${style.color.toLowerCase()}/${style.opacity}`;
  });
  faces.sort();
  return JSON.stringify([(part.color ?? '').toLowerCase(), part.opacity ?? 1, faces]);
}

// STEP occurrences take a proper rigid transform. Formnaro matrices store
// columns and millimetres. gp_Trsf.SetValues takes rows.
export function isRigidStepPlacement(matrix) {
  if (
    !Array.isArray(matrix) ||
    matrix.length !== 16 ||
    !Array.from(matrix).every(Number.isFinite) ||
    matrix[3] ||
    matrix[7] ||
    matrix[11] ||
    matrix[15] !== 1
  )
    return false;
  const [a, b, c] = [0, 4, 8].map((index) => matrix.slice(index, index + 3));
  const dot = (left, right) => left.reduce((sum, value, index) => sum + value * right[index], 0);
  const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return [dot(a, a) - 1, dot(b, b) - 1, dot(c, c) - 1, dot(a, b), dot(a, c), dot(b, c), dot(cross, c) - 1].every(
    (value) => Math.abs(value) <= 1e-8,
  );
}

function stepPlacement(placement) {
  if (placement === undefined || placement === null) return null;
  if (typeof placement !== 'object' || Array.isArray(placement)) throw Error('Ungültige STEP-Platzierung.');
  if (Object.hasOwn(placement, 'matrix')) {
    if (Object.keys(placement).length !== 1 || !isRigidStepPlacement(placement.matrix))
      throw Error('Ungültige STEP-Platzierung: Die Matrix muss eine starre Lage beschreiben.');
    return [...placement.matrix];
  }
  if (Object.keys(placement).some((key) => key !== 'translation' && key !== 'rotationZ'))
    throw Error('Ungültige STEP-Platzierung.');
  const translation = placement.translation ?? [0, 0, 0],
    rotationZ = placement.rotationZ ?? 0;
  if (!Array.isArray(translation) || translation.length !== 3 || !translation.every(Number.isFinite))
    throw Error('Ungültige STEP-Platzierung: translation benötigt drei endliche Zahlen.');
  if (!Number.isFinite(rotationZ))
    throw Error('Ungültige STEP-Platzierung: rotationZ benötigt eine endliche Zahl in Radiant.');
  const cos = Math.cos(rotationZ),
    sin = Math.sin(rotationZ);
  return [cos, sin, 0, 0, -sin, cos, 0, 0, 0, 0, 1, 0, ...translation, 1];
}

// Resolve every optional definition input before any XCAF label exists. Parts
// with one explicit id must describe the same definition: same local shape and
// same presentation share exactly one label. Any disagreement is rejected with
// the offending id, so an ambiguous file can never be written. Parts without an
// id, or with different ids, stay separate definitions even if geometrically
// equal. Returns the normalised per-part placement for the tree leaves.
function planStepDefinitions(oc, parts) {
  const definitions = new Map(),
    placements = new Array(parts.length).fill(null);
  for (const [index, part] of parts.entries()) {
    if (!part || typeof part !== 'object' || Array.isArray(part)) continue;
    const definitionId = stepDefinitionId(part);
    placements[index] = stepPlacement(part.placement);
    if (placements[index] && definitionId === null) throw Error('STEP-Platzierung benötigt eine Definitionskennung.');
    if (part.occurrenceStyle !== undefined) {
      const style = part.occurrenceStyle;
      if (
        !style ||
        typeof style !== 'object' ||
        !style.color ||
        Object.keys(style).some((key) => key !== 'color' && key !== 'opacity')
      )
        throw Error('Ungültige STEP-Vorkommensfarbe.');
      stepPartPresentation(style);
    }
    if (definitionId === null) continue;
    validateCadSolid(oc, part.shape);
    const presentation = stepPartPresentation(part),
      definitionName = part.definitionName,
      existing = definitions.get(definitionId);
    if (definitionName !== undefined) stepPartName(definitionName);
    if (!existing) {
      definitions.set(definitionId, { index, presentation, definitionName, brep: null });
      continue;
    }
    // The first serialised BRep is cached only once a second occurrence proves
    // that the definition is shared.
    if (existing.brep === null) existing.brep = writeCadBrep(oc, parts[existing.index].shape);
    if (
      definitionName !== existing.definitionName ||
      presentation !== existing.presentation ||
      writeCadBrep(oc, part.shape) !== existing.brep
    )
      throw Error(
        `Widersprüchliche STEP-Definition "${definitionId}": gleiche Kennung erlaubt nur gleiche Definitionsform und Darstellung.`,
      );
  }
  return placements;
}

function occurrenceLocation(oc, objects, placement) {
  const transform = objects.keep(new oc.gp_Trsf());
  transform.SetValues(
    ...[0, 1, 2].flatMap((row) => [placement[row], placement[4 + row], placement[8 + row], placement[12 + row]]),
  );
  return objects.keep(new oc.TopLoc_Location(transform));
}

// XCAF AddShape reuses the underlying native shape when the same instance is
// added twice, silently merging two parts into one PRODUCT. Only an explicit
// definitionId may share a definition, so every further use of an already added
// native shape gets a private BRep copy. IsPartner compares the TShape
// regardless of a cached location, not only the current JS wrapper.
function uniqueDefinitionShape(oc, objects, used, shape, explicitDefinition) {
  const reused = used.some((other) => {
    if (other === shape) return true;
    try {
      return shape.IsPartner(other);
    } catch {
      return false;
    }
  });
  // The STEP writer can change native orientation flags. Keep the caller's
  // definition stable for comparisons and repeated exports.
  if (!explicitDefinition && !reused) {
    used.push(shape);
    return shape;
  }
  const copy = objects.keep(readCadBrep(oc, writeCadBrep(oc, shape)));
  used.push(copy);
  return copy;
}

// The nested tree is exactly {name,children:[{partIndex}|{name,children:[...]}]}.
// Validate it completely before any XCAF label exists: every part occurs exactly
// once, names stay writable, the depth matches the 12-level import limit, no
// branch is empty and the object graph has no cycle. Every entry counts as one
// level, part leaves included, because the reader applies the same limit to all
// entries; a twelfth assembly level would put its parts on level 13.
function validateAssemblyTree(parts, tree) {
  const used = new Set();
  function visit(node, depth, path) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) throw Error('Ungültiger STEP-Baugruppenbaum.');
    if (path.has(node)) throw Error('STEP-Baugruppenbaum enthält einen Zyklus.');
    if (depth > MAX_ASSEMBLY_LEVELS) throw Error(`STEP-Baugruppenbaum überschreitet ${MAX_ASSEMBLY_LEVELS} Ebenen.`);
    assemblyNodeName(node.name);
    const keys = Object.keys(node);
    if (keys.length !== 2 || !keys.includes('name') || !keys.includes('children'))
      throw Error('Ungültiger STEP-Baugruppenbaum.');
    if (!Array.isArray(node.children) || !node.children.length)
      throw Error('STEP-Baugruppenbaum enthält einen leeren Ast.');
    path.add(node);
    for (const child of node.children) {
      if (child && typeof child === 'object' && !Array.isArray(child) && Object.hasOwn(child, 'partIndex')) {
        if (Object.keys(child).length !== 1 || !Number.isInteger(child.partIndex))
          throw Error('Ungültiger STEP-Baugruppenbaum.');
        if (child.partIndex < 0 || child.partIndex >= parts.length)
          throw Error('STEP-Baugruppenbaum verweist auf einen unbekannten Teil.');
        if (depth + 1 > MAX_ASSEMBLY_LEVELS)
          throw Error(`STEP-Baugruppenbaum überschreitet ${MAX_ASSEMBLY_LEVELS} Ebenen.`);
        if (used.has(child.partIndex)) throw Error('STEP-Baugruppenbaum muss jeden Teil genau einmal enthalten.');
        used.add(child.partIndex);
        continue;
      }
      visit(child, depth + 1, path);
    }
    path.delete(node);
  }
  visit(tree, 1, new Set());
  if (used.size !== parts.length) throw Error('STEP-Baugruppenbaum muss jeden Teil genau einmal enthalten.');
}

// The caller owns the verified CAD bodies. XCAF writes names and colors on
// separate part labels; no display tessellation enters the STEP document.
// `assemblyName` optionally adds exactly one named assembly node above the
// separately named part labels. `assemblyTree` optionally writes a nested
// subassembly structure whose leaves name parts by index. Without a tree each
// part keeps its already placed shape and an identity occurrence location.
// Inside a tree a part may instead pass `{definitionId, placement}`: its shape
// is then the local definition before placement, equal ids share one XCAF label
// and every occurrence carries its own local TopLoc_Location. Assembly nodes
// themselves keep the D3 identity location.
export function exportCadStep(oc, parts, { assemblyName, assemblyTree } = {}) {
  if (!Array.isArray(parts) || !parts.length || parts.length > 500)
    throw Error('STEP-Export benötigt mindestens einen sichtbaren CAD-Körper.');
  if (
    assemblyName !== undefined &&
    (typeof assemblyName !== 'string' || !assemblyName.length || assemblyName.length > 1000)
  )
    throw Error('Ungültiger STEP-Baugruppenname.');
  if (assemblyName !== undefined && assemblyTree !== undefined)
    throw Error('STEP-Baugruppe erlaubt entweder Namen oder Baum, nicht beides.');
  // Definition and placement inputs belong to the nested tree; refusing them
  // elsewhere beats silently writing a placed body twice or dropping the id.
  if (assemblyTree === undefined) {
    for (const part of parts) {
      if (part?.definitionId !== undefined && part?.definitionId !== null)
        throw Error('STEP-Definitionen benötigen einen Baugruppenbaum.');
      if (part?.placement !== undefined && part?.placement !== null)
        throw Error('STEP-Platzierungen benötigen einen Baugruppenbaum.');
      if (part?.occurrenceStyle !== undefined) throw Error('STEP-Vorkommensfarben benötigen einen Baugruppenbaum.');
    }
  }
  if (assemblyTree !== undefined) validateAssemblyTree(parts, assemblyTree);
  const placements = assemblyTree === undefined ? [] : planStepDefinitions(oc, parts);
  const path = filePath(),
    objects = scope();
  try {
    const format = objects.keep(new oc.TCollection_ExtendedString('BinXCAF', true)),
      document = objects.keep(new oc.TDocStd_Document(format)),
      main = objects.keep(document.Main()),
      shapes = objects.keep(oc.XCAFDoc_DocumentTool.ShapeTool(main)),
      colors = objects.keep(oc.XCAFDoc_DocumentTool.ColorTool(main));
    oc.XCAFDoc_DocumentTool.SetLengthUnit(document, 0.001);
    const setSurfaceColor = (label, style) => {
      const rgba = objects.keep(new oc.Quantity_ColorRGBA());
      if (!oc.Quantity_ColorRGBA.ColorFromHex(style.color, rgba, true))
        throw Error('STEP-Farbe konnte nicht übertragen werden.');
      rgba.SetAlpha(style.opacity ?? 1);
      colors.SetColor(label, rgba, oc.XCAFDoc_ColorType.XCAFDoc_ColorSurf);
    };
    const partLabels = [],
      definitionLabels = new Map(),
      definitionShapes = [];
    for (const part of parts) {
      const definitionId = stepDefinitionId(part),
        shared = definitionId === null ? undefined : definitionLabels.get(definitionId);
      if (shared) {
        // planStepDefinitions already proved equal shape and presentation, but
        // every occurrence still needs its own writable name.
        stepPartName(part.name);
        partLabels.push(shared);
        continue;
      }
      validateCadSolid(oc, part.shape);
      if (typeof part.name !== 'string' || !part.name.length || part.name.length > 1000)
        throw Error('Ungültiger STEP-Teilename.');
      if (part.color !== undefined && !/^#[\da-f]{6}$/i.test(part.color)) throw Error('Ungültige STEP-Farbe.');
      if (part.opacity !== undefined && (!Number.isFinite(part.opacity) || part.opacity < 0 || part.opacity > 1))
        throw Error('Ungültige STEP-Transparenz.');
      const label = objects.keep(
          shapes.AddShape(
            uniqueDefinitionShape(oc, objects, definitionShapes, part.shape, definitionId !== null),
            false,
            true,
          ),
        ),
        name = objects.keep(
          new oc.TCollection_ExtendedString(
            stepPartName(definitionId === null ? part.name : (part.definitionName ?? part.name)),
            true,
          ),
        );
      objects.keep(oc.TDataStd_Name.Set(label, name));
      partLabels.push(label);
      if (definitionId !== null) definitionLabels.set(definitionId, label);
      if (part.color) setSurfaceColor(label, part);
      if (part.faceColors?.length) {
        const reference = objects.keep(new oc.TDF_Label()),
          isReference = oc.XCAFDoc_ShapeTool.GetReferredShape(label, reference),
          definition = isReference ? reference : label,
          definitionShape = objects.keep(oc.XCAFDoc_ShapeTool.GetShape(definition)),
          explorer = objects.keep(new oc.TopExp_Explorer(definitionShape, oc.TopAbs_ShapeEnum.TopAbs_FACE)),
          faces = [],
          buckets = new Map();
        while (explorer.More()) {
          const raw = explorer.Current(),
            hash = oc.ReplicadShapeHasher.HashCode(raw, 2147483647),
            bucket = buckets.get(hash) ?? [];
          if (!bucket.some((f) => f.IsSame(raw))) {
            objects.keep(raw);
            faces.push(raw);
            bucket.push(raw);
            buckets.set(hash, bucket);
          } else raw.delete();
          explorer.Next();
        }
        for (const style of part.faceColors) {
          const face = faces[style.faceIndex - 1];
          if (!face) throw Error('STEP-Flächenfarbe besitzt keine zugehörige Fläche.');
          setSurfaceColor(objects.keep(shapes.AddSubShape(definition, face)), style);
        }
      }
    }
    if (assemblyName !== undefined) {
      // One assembly label owns every part label as an identity occurrence. The
      // part shapes are already placed, so no local transform is added here.
      const root = objects.keep(shapes.NewShape()),
        rootName = objects.keep(new oc.TCollection_ExtendedString(stepPartName(assemblyName), true));
      objects.keep(oc.TDataStd_Name.Set(root, rootName));
      for (const [index, label] of partLabels.entries()) {
        const component = objects.keep(shapes.AddComponent(root, label, objects.keep(new oc.TopLoc_Location()))),
          occurrence = objects.keep(new oc.TCollection_ExtendedString(stepPartName(parts[index].name), true));
        objects.keep(oc.TDataStd_Name.Set(component, occurrence));
      }
      shapes.UpdateAssemblies();
    }
    if (assemblyTree !== undefined) {
      // Each nested node is an assembly label and keeps the D3 identity
      // location. Part leaves either keep their already placed shape or, with a
      // D4 placement, carry the local occurrence location of a shared
      // definition label.
      const buildTree = (node) => {
        const label = objects.keep(shapes.NewShape());
        objects.keep(
          oc.TDataStd_Name.Set(label, objects.keep(new oc.TCollection_ExtendedString(stepPartName(node.name), true))),
        );
        for (const child of node.children) {
          const isPart = Object.hasOwn(child, 'partIndex'),
            part = isPart ? parts[child.partIndex] : null,
            target = isPart ? partLabels[child.partIndex] : buildTree(child),
            title = isPart ? part.name : child.name,
            placement = isPart ? placements[child.partIndex] : null,
            component = objects.keep(
              shapes.AddComponent(
                label,
                target,
                placement ? occurrenceLocation(oc, objects, placement) : objects.keep(new oc.TopLoc_Location()),
              ),
            );
          objects.keep(
            oc.TDataStd_Name.Set(component, objects.keep(new oc.TCollection_ExtendedString(stepPartName(title), true))),
          );
          if (part?.occurrenceStyle) setSurfaceColor(component, part.occurrenceStyle);
        }
        return label;
      };
      buildTree(assemblyTree);
      shapes.UpdateAssemblies();
    }
    const writer = objects.keep(new oc.STEPCAFControl_Writer()),
      progress = objects.keep(new oc.Message_ProgressRange());
    writer.SetColorMode(true);
    writer.SetNameMode(true);
    // The first writer registers these parameters. Configuring them before
    // construction silently leaves the first export at its default schema.
    if (!oc.Interface_Static.SetCVal('write.step.unit', 'MM') || !oc.Interface_Static.SetIVal('write.step.schema', 4))
      throw Error('STEP-Exporter konnte Millimeter/AP214 nicht einstellen.');
    // Perform uses the native null multi-file prefix. Passing an empty string
    // to Transfer would still select external files and omit body geometry.
    if (!writer.Perform(document, path, progress)) throw Error('Direkter CAD-STEP-Export fehlgeschlagen.');
    const bytes = normalizeStepNames(oc.FS.readFile(path).slice());
    if (bytes.length > MAX_STEP_BYTES) throw Error('STEP-Ausgabe überschreitet die Dateigrenze.');
    return bytes;
  } finally {
    objects.close();
    try {
      oc.FS.unlink(path);
    } catch {}
  }
}
