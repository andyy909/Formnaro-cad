const HEX64 = /^[a-f0-9]{64}$/;
const FIELDS = [
  'version',
  'id',
  'origin_sha256',
  'result_sha256',
  'budget_mm',
  'samples',
  'accepted',
  'input',
  'input_sha256',
  'repaired_stl_sha256',
];

export const MESH_REPAIR_FASSUNG_VERSION = 1;

const fail = (path, message) => {
  throw Error(`${path}: ${message}`);
};

/** A separately identifiable repair result: origin, result and gate settings. */
export function validateMeshRepairFassung(value, path = 'metadata.meshRepair') {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    fail(path, 'Objekt erwartet.');
  for (const key of Object.keys(value)) if (!FIELDS.includes(key)) fail(path, `Unbekanntes Feld ${key}.`);
  if (value.version !== MESH_REPAIR_FASSUNG_VERSION) fail(path, 'Unbekannte Fassungsversion.');
  for (const key of ['id', 'origin_sha256', 'result_sha256'])
    if (typeof value[key] !== 'string' || !HEX64.test(value[key])) fail(path, `Ungültige Kennung ${key}.`);
  if (
    typeof value.budget_mm !== 'number' ||
    !Number.isFinite(value.budget_mm) ||
    value.budget_mm < 0.0001 ||
    value.budget_mm > 100
  )
    fail(path, 'Ungültige Schwelle.');
  if (!Number.isSafeInteger(value.samples) || value.samples < 500 || value.samples > 30000)
    fail(path, 'Ungültige Prüfpunktzahl.');
  if (value.accepted !== undefined && value.accepted !== true)
    fail(path, 'Nur akzeptierte Reparaturen werden gespeichert.');
  const result = {
    version: MESH_REPAIR_FASSUNG_VERSION,
    id: value.id,
    origin_sha256: value.origin_sha256,
    result_sha256: value.result_sha256,
    budget_mm: value.budget_mm,
    samples: value.samples,
    accepted: true,
  };
  if (value.input !== undefined) {
    if (typeof value.input !== 'string' || !value.input.trim() || value.input.length > 1000)
      fail(path, 'Ungültiger Herkunftsname.');
    result.input = value.input;
  }
  for (const key of ['input_sha256', 'repaired_stl_sha256'])
    if (value[key] !== undefined) {
      if (typeof value[key] !== 'string' || !HEX64.test(value[key])) fail(path, `Ungültige Kennung ${key}.`);
      result[key] = value[key];
    }
  return result;
}

/** Extract the admitted Fassung from a converter report, or null without a repair. */
export function repairFassungFromReport(report) {
  if (report?.repairs?.applied !== true || report?.repairs?.admission?.accepted !== true) return null;
  const value = report.repair_fassung ?? report.repairs.admission.fassung;
  if (!value) return null;
  return validateMeshRepairFassung(value, 'repair_fassung');
}

export function meshRepairFassungSummary(fassung) {
  return `Fassung ${fassung.id.slice(0, 12)}… · Herkunft ${fassung.origin_sha256.slice(0, 12)}… → Ergebnis ${fassung.result_sha256.slice(0, 12)}… · Schwelle ${Number(fassung.budget_mm).toLocaleString('de-DE')} mm`;
}
