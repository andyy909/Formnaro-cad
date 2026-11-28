import { repairFassungFromReport, meshRepairFassungSummary } from './mesh-repair-fassung.js';

export const hasLocalStlConverter = () => typeof globalThis.window?.offlinecadDesktop?.convertStl === 'function';
export function conversionControls(prefix) {
  return `<label class="dialog-label">Abweichungsbudget (mm)<input id="${prefix}-tolerance" type="number" min="0.0001" max="100" step="0.01" value="0.15"></label><label class="dialog-label">Verfahren<select id="${prefix}-mode"><option value="auto">Automatisch · Flächen, Profile und Freiformen</option><option value="smooth">Gekrümmte Flächen</option><option value="planar">Planare Näherung</option><option value="exact">Originalfacetten</option></select></label><label class="check-line"><input id="${prefix}-fallback" type="checkbox" checked> Facetten als Rückfall erlauben</label><p class="small-note">Zusammenhängende Ebenen, Zylinder, Kegel und geeignete Freiformen werden geprüft. Schwierige Bereiche können facettiert bleiben. Abweichungen sind beidseitige Stichproben gegen die Original-STL, keine garantierten Maximalfehler. Konstruktionshistorie wird nicht wiederhergestellt.</p>`;
}
export function readConversionControls(prefix) {
  const element = (suffix) => document.getElementById(prefix + '-' + suffix),
    tolerance = Number(element('tolerance').value);
  if (!Number.isFinite(tolerance) || tolerance < 0.0001 || tolerance > 100)
    throw Error('Die Toleranz muss zwischen 0,0001 und 100 mm liegen.');
  return { tolerance, mode: element('mode').value, fallback: element('fallback').checked };
}
/** Topology, threshold, both measured directions and the admitted repair version. */
export function repairAdmissionSummary(report) {
  const admission = report?.repairs?.admission;
  if (!admission || typeof admission !== 'object' || Array.isArray(admission)) return '';
  const before = admission.topology?.before,
    after = admission.topology?.after,
    measurement = admission.measurement,
    directions = measurement?.directions,
    parts = [];
  if (before && after)
    parts.push(
      `Netz ${before.faces}→${after.faces} Flächen, ${before.edges}→${after.edges} Kanten, ${before.openings}→${after.openings} Löcher.`,
    );
  if (admission.kind === 'unchanged') parts.push('Netz unverändert; keine Reparaturmessung nötig.');
  else if (directions?.original_to_repaired && directions?.repaired_to_original)
    parts.push(
      `Stichprobe ${Number(measurement.samples_per_direction).toLocaleString('de-DE')} Punkte je Richtung: Original→Reparatur ${Number(directions.original_to_repaired.max_mm).toFixed(6)} mm, Reparatur→Original ${Number(directions.repaired_to_original.max_mm).toFixed(6)} mm.`,
    );
  const outer = measurement?.outer_skin,
    raw = measurement?.raw?.directions;
  if (measurement?.decided_by === 'outer-skin' && outer && raw?.original_to_repaired && raw?.repaired_to_original)
    parts.push(
      `Außenhaut ${outer.method}: ${Number(outer.excluded_faces).toLocaleString('de-DE')} Dreiecke / ${Number(outer.excluded_area_mm2).toFixed(3)} mm² ausgeschlossen, Nachbarschaft ${Number(outer.excluded_neighbourhood_mm).toLocaleString('de-DE')} mm; Rohwert Original→Reparatur ${Number(raw.original_to_repaired.max_mm).toFixed(6)} mm, Reparatur→Original ${Number(raw.repaired_to_original.max_mm).toFixed(6)} mm.`,
    );
  parts.push(`Schwelle ${Number(admission.threshold_mm).toLocaleString('de-DE')} mm.`);
  parts.push(admission.accepted ? 'Übernahme freigegeben.' : `Abgelehnt (${admission.reason ?? 'Budget'}).`);
  if (admission.outside_repair_region?.preserved)
    parts.push(`Außerhalb des Reparaturbereichs ${admission.outside_repair_region.faces} Flächen unverändert.`);
  try {
    const fassung = repairFassungFromReport(report);
    if (fassung) parts.push(`Reparaturfassung ${meshRepairFassungSummary(fassung)}.`);
  } catch {
    // An absent or stale version identifier never hides the measured values.
  }
  return ' ' + parts.join(' ');
}

export function conversionSummary(report) {
  const max = Number(report.deviation?.sampled_max_mm),
    allowance = Number(report.tessellation_allowance_mm);
  const methods = [...new Set(report.bodies.map((body) => body.method))].join('; '),
    faceted = report.bodies.some((body) => body.stage === 'exact');
  return `STL-Konverter ${report.version}: ${report.input_triangles} Dreiecke → ${report.output_faces} CAD-Flächen, ${report.solids} Körper. ${methods}. Stichproben-Abstand maximal ${max.toFixed(6)} mm; Vernetzungsreserve ${allowance.toFixed(6)} mm; Budget ${report.options.tolerance} mm.${faceted ? ' Rundungen bleiben facettiert.' : ''}${repairAdmissionSummary(report)} Keine ursprüngliche Konstruktionshistorie.`;
}
export function createLocalStlConversion({
  desktop = globalThis.window?.offlinecadDesktop,
  onProgress = () => {},
} = {}) {
  const id = crypto.randomUUID();
  let cancelled = false;
  const unsubscribe =
    desktop.onStlProgress?.((value) => {
      if (value.id === id && !cancelled) onProgress(value.message);
    }) ?? (() => {});
  const abort = () => {
    if (cancelled) {
      const e = Error('Konvertierung abgebrochen.');
      e.name = 'AbortError';
      throw e;
    }
  };
  return {
    cancel: () => {
      cancelled = true;
      unsubscribe();
      return desktop.cancelStl({ id });
    },
    run: async (file, options) => {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        abort();
        const result = await desktop.convertStl({ id, name: file.name, bytes, options });
        abort();
        return result;
      } finally {
        unsubscribe();
      }
    },
  };
}

export function createLocalStlAnalysis({ desktop = globalThis.window?.offlinecadDesktop, onProgress = () => {} } = {}) {
  const id = crypto.randomUUID();
  let cancelled = false;
  const unsubscribe =
    desktop.onStlProgress?.((value) => {
      if (value.id === id && !cancelled) onProgress(value.message);
    }) ?? (() => {});
  const abort = () => {
    if (cancelled) {
      const e = Error('Flächenanalyse abgebrochen.');
      e.name = 'AbortError';
      throw e;
    }
  };
  return {
    cancel: () => {
      cancelled = true;
      unsubscribe();
      return desktop.cancelStl({ id });
    },
    run: async (file, options, { edits = null, commands = [] } = {}) => {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        abort();
        const result = await desktop.analyseStl({ id, name: file.name, bytes, options, edits, commands });
        abort();
        return result.analysis;
      } finally {
        unsubscribe();
      }
    },
  };
}
