import { exportCadStep, importCadStepAssembly, isRigidStepPlacement, MAX_STEP_BYTES } from './cad-step-io.js';
import {
  createCadExchangeManifest,
  validateCadExchangeManifest,
  validateCadExchangeParts,
} from './cad-exchange-manifest.js';

const definitionAlias = (id) => 'FORMNARO-D-' + id,
  occurrenceAlias = (id) => 'FORMNARO-O-' + id;

async function stepDigest(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Write the package's own bound STEP payload. Shapes and placements are
 * supplied as for the ordinary STEP exporter, with an occurrenceId per leaf. */
export async function exportCadExchangeStep(oc, catalog, parts, assemblyTree) {
  const manifestParts = validateCadExchangeParts(catalog),
    byId = new Map(manifestParts.occurrences.map((occurrence) => [occurrence.id, occurrence]));
  if (!assemblyTree || !Array.isArray(parts) || parts.length !== byId.size)
    throw Error('CAD-Austauschgeometrie benötigt einen Baugruppenbaum mit genau einem Körper je Vorkommen.');
  const stepParts = Array.from(parts, (part) => {
    const occurrence = byId.get(part?.occurrenceId);
    if (!occurrence) throw Error('Fehlendes oder mehrfach belegtes CAD-Austauschvorkommen in den STEP-Körpern.');
    byId.delete(occurrence.id);
    return {
      ...part,
      definitionId: occurrence.definitionId,
      definitionName: definitionAlias(occurrence.definitionId),
      name: occurrenceAlias(occurrence.id),
      // Give even an identity placement its own native datum so OCCT can
      // attach separate STEP usage names to two coincident occurrences.
      placement: part.placement ?? {},
    };
  });
  const stepBytes = exportCadStep(oc, stepParts, { assemblyTree });
  bindStepGeometry(oc, manifestParts, stepBytes);
  const manifest = createCadExchangeManifest(manifestParts, await stepDigest(stepBytes));
  return { manifest, stepBytes };
}

/** Return an exact, purely local geometry tree with manifest IDs. The native
 * IDs are used only to check STEP consistency within this load. */
export async function importCadExchangeStep(oc, manifest, stepBytes) {
  const validated = validateCadExchangeManifest(manifest);
  if (!(stepBytes instanceof Uint8Array) || !stepBytes.length || stepBytes.length > MAX_STEP_BYTES)
    throw Error('Fehlende oder zu große STEP-Geometrie im CAD-Austauschpaket.');
  // Check and parse the same bytes even if the caller reuses its buffer.
  const bytes = new Uint8Array(stepBytes);
  if ((await stepDigest(bytes)) !== validated.step.sha256)
    throw Error('Die STEP-Geometrie stimmt nicht mit der SHA-256-Prüfsumme im CAD-Austauschmanifest überein.');
  return bindStepGeometry(oc, validated, bytes);
}

function bindStepGeometry(oc, manifestParts, bytes) {
  const definitions = new Map(manifestParts.definitions.map((definition) => [definition.id, definition])),
    remaining = new Map(manifestParts.occurrences.map((occurrence) => [occurrenceAlias(occurrence.id), occurrence])),
    nativeById = new Map(),
    idByNative = new Map();
  function bind(node) {
    if (node.children) return { ...node, children: node.children.map(bind) };
    const occurrence = remaining.get(node.name);
    if (!occurrence) throw Error('Unbekanntes STEP-Vorkommen im CAD-Austauschpaket (' + node.name + ').');
    const definition = definitions.get(occurrence.definitionId),
      nativeId = node.definitionId;
    if (
      !nativeId ||
      node.definitionName !== definitionAlias(definition.id) ||
      (nativeById.has(definition.id) && nativeById.get(definition.id) !== nativeId) ||
      (idByNative.has(nativeId) && idByNative.get(nativeId) !== definition.id)
    )
      throw Error('CAD-Austauschvorkommen verweist auf eine widersprüchliche STEP-Definition (' + occurrence.id + ').');
    if (!isRigidStepPlacement(node.worldTransform))
      throw Error('CAD-Austauschvorkommen benötigt eine starre STEP-Platzierung (' + occurrence.id + ').');
    remaining.delete(node.name);
    nativeById.set(definition.id, nativeId);
    idByNative.set(nativeId, definition.id);
    return {
      ...node,
      name: occurrence.name,
      occurrenceId: occurrence.id,
      definitionId: definition.id,
      definitionName: definition.name,
    };
  }

  const tree = importCadStepAssembly(oc, bytes).map(bind);
  if (remaining.size) {
    const first = remaining.values().next().value;
    throw Error('CAD-Austauschvorkommen fehlt in der STEP-Geometrie (' + first.id + ').');
  }
  return tree;
}
