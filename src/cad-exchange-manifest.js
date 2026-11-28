const FORMAT = 'formnaro-cad-exchange',
  VERSION = 1,
  UNITS = Object.freeze({ length: 'mm', angle: 'rad' }),
  COORDINATES = Object.freeze({ handedness: 'right', up: '+Z' }),
  MAX_PARTS = 500,
  ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/,
  SHA256 = /^[0-9a-f]{64}$/;

function fields(value, keys, label) {
  if (
    !value ||
    typeof value !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Object.keys(value).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(value, key))
  )
    throw Error('Ungültige Felder im CAD-Austauschmanifest (' + label + ').');
  return value;
}

function readParts(source, keys, label) {
  if (!Array.isArray(source) || !source.length || source.length > MAX_PARTS)
    throw Error(label + ' im CAD-Austauschmanifest erfordern 1 bis ' + MAX_PARTS + ' Einträge.');

  return Array.from(source, (entry) => {
    const value = fields(entry, keys, label);
    if (typeof value.id !== 'string' || !ID.test(value.id)) throw Error('Ungültige CAD-Austausch-ID (' + label + ').');
    if (
      typeof value.name !== 'string' ||
      !value.name.trim() ||
      value.name.length > 200 ||
      !value.name.isWellFormed() ||
      /[\u0000-\u001f\u007f]/.test(value.name)
    )
      throw Error('Ungültiger CAD-Austauschname (' + label + ').');
    return { ...value };
  });
}

/** Validate and copy the part of the manifest that binds solid geometry. */
export function validateCadExchangeParts(source) {
  const definitions = readParts(source?.definitions, ['id', 'name'], 'Definitionen'),
    occurrences = readParts(source?.occurrences, ['id', 'name', 'definitionId'], 'Vorkommen'),
    definitionIds = new Set(definitions.map(({ id }) => id)),
    occurrenceIds = new Set(),
    usedDefinitions = new Set();
  if (definitionIds.size !== definitions.length) throw Error('Doppelte Definitionskennung im CAD-Austauschmanifest.');
  for (const { id, definitionId } of occurrences) {
    if (occurrenceIds.has(id)) throw Error('Doppelte Vorkommenskennung im CAD-Austauschmanifest (' + id + ').');
    if (!definitionIds.has(definitionId)) throw Error('Unbekannte Definition für CAD-Austauschvorkommen (' + id + ').');
    occurrenceIds.add(id);
    usedDefinitions.add(definitionId);
  }
  if (usedDefinitions.size !== definitions.length) throw Error('CAD-Austauschdefinition ohne Vorkommen.');
  return { definitions, occurrences };
}

export function createCadExchangeManifest(parts, sha256) {
  return {
    format: FORMAT,
    version: VERSION,
    units: { ...UNITS },
    coordinates: { ...COORDINATES },
    step: { sha256 },
    definitions: parts.definitions,
    occurrences: parts.occurrences,
  };
}

export function validateCadExchangeManifest(source) {
  const value = fields(source, ['format', 'version', 'units', 'coordinates', 'step', 'definitions', 'occurrences'], 'Kopf'),
    units = fields(value.units, ['length', 'angle'], 'Einheiten'),
    coordinates = fields(value.coordinates, ['handedness', 'up'], 'Koordinatensystem'),
    step = fields(value.step, ['sha256'], 'STEP');
  if (value.format !== FORMAT) throw Error('Unbekanntes CAD-Austauschformat.');
  if (value.version !== VERSION) throw Error('Nicht unterstützte CAD-Austauschversion.');
  if (units.length !== UNITS.length || units.angle !== UNITS.angle)
    throw Error('Nicht unterstützte CAD-Austauscheinheiten.');
  if (coordinates.handedness !== COORDINATES.handedness || coordinates.up !== COORDINATES.up)
    throw Error('Nicht unterstütztes CAD-Austauschkoordinatensystem.');
  if (typeof step.sha256 !== 'string' || !SHA256.test(step.sha256))
    throw Error('CAD-Austauschmanifest benötigt eine SHA-256-Prüfsumme für STEP.');
  return createCadExchangeManifest(validateCadExchangeParts(value), step.sha256);
}
