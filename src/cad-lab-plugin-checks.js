import { showLabProject } from './cad-lab-preview-assets.js';
import { createFunctionPlugins, FUNCTION_PLUGIN_KEY } from './cad-function-plugins.js';
import { parseCadPlugin, loadCadPlugins, CAD_PLUGIN } from './cad-plugin-manifest.js';
import { runStlDevelopmentCheck } from './cad-lab-converter-checks.js';

const measure = { id: 'measure', name: 'Messen', action: 'measure' };
const functionPack = {
  format: 'Formnaro-FunctionPlugin',
  version: 1,
  id: 'lab-functions',
  name: 'Laborfunktionen',
  functions: [measure, { id: 'convert', name: 'STL zu STEP', action: 'stl-to-step' }],
};

function functionLifecycle() {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  const checks = [];
  const add = (label, passed) => checks.push({ label, passed });
  const plugin = (store) => store.list().find((item) => item.manifest.id === functionPack.id);
  const store = createFunctionPlugins(storage);
  store.import(functionPack);
  add('Funktions-Plugin mit zwei registrierten Werkzeugen', plugin(store)?.manifest.functions.length === 2);
  store.enable(functionPack.id, false);
  const reopened = createFunctionPlugins(storage);
  add('Deaktivierung über einen neuen Store hinweg erhalten', plugin(reopened)?.enabled === false);
  reopened.enable(functionPack.id, true);
  const before = storage.getItem(FUNCTION_PLUGIN_KEY);
  let rejected = false;
  try {
    reopened.import({ ...functionPack, functions: [{ ...measure, action: 'unknown' }] });
  } catch {
    rejected = true;
  }
  add(
    'Unbekanntes Werkzeug abgelehnt und gespeichertes Plugin erhalten',
    rejected && before === storage.getItem(FUNCTION_PLUGIN_KEY),
  );
  const action = plugin(reopened)?.manifest.functions.find((entry) => entry.id === 'convert')?.action;
  reopened.remove(functionPack.id);
  add(
    'Eigenes Paket entfernt, mitgelieferte Funktionen verfügbar',
    !plugin(createFunctionPlugins(storage)) && reopened.list().filter((item) => item.builtin).length === 2,
  );
  return { checks, action };
}

async function shapePackage(runtime, drilled) {
  const size = [30, 20, 6],
    [x, y] = [-7, 7],
    diameter = 4;
  const manifest = parseCadPlugin({
    format: CAD_PLUGIN.format,
    version: CAD_PLUGIN.version,
    id: 'lab-forms',
    name: 'Laborformen',
    shapes: [
      {
        id: 'plate',
        name: 'Laborplatte',
        nodes: [
          { type: 'box', size, pos: [0, 0, 3] },
          ...(drilled
            ? [x, y].map((position) => ({
                type: 'cylinder',
                size: [diameter, diameter, 10],
                pos: [position, 0, 3],
                solid: false,
              }))
            : []),
        ],
      },
    ],
  });
  const entries = JSON.stringify([{ manifest, enabled: true }]);
  const loaded = loadCadPlugins({ getItem: (key) => (key === CAD_PLUGIN.storageKey ? entries : null) });
  const cad = runtime.createController();
  const abort = () => cad.cancel();
  runtime.signal.addEventListener('abort', abort, { once: true });
  try {
    const before = cad.serialize();
    const proposal = await cad.preview(
      { kind: 'plugin', manifest: loaded[0].manifest, shapeId: 'plate' },
      { signal: runtime.signal },
    );
    const body = proposal.project.nodes[0];
    const volume = 3600 - (drilled ? 48 * Math.PI : 0);
    const checks = [
      { label: 'Formenpaket aus dem Plugin-Speicher geladen', passed: loaded[0]?.enabled === true },
      { label: 'Plugin-Vorschau lässt das Modell unverändert', passed: cad.serialize() === before },
      {
        label: 'Ein nativer Körper mit Sollvolumen',
        passed: body.stats.solids === 1 && Math.abs(body.stats.volume - volume) < 1e-5,
        actual: body.stats.volume,
      },
      {
        label: 'Paket und Form als Quelle hinterlegt',
        passed: body.metadata.plugin?.id === manifest.id && body.metadata.plugin?.shapeId === 'plate',
      },
    ];
    if (drilled) {
      const { checks: bores } = await cad.checkPreview(
        proposal.previewId,
        [x, y].map((center) => ({
          kind: 'bore',
          target: body.id,
          from: [center, 0, 0],
          to: [center, 0, 6],
          diameter,
          minWall: 1,
        })),
        { collectFailures: true },
      );
      checks.push({
        label: 'Zwei echte Durchgangsbohrungen mit getrennten Quellen',
        passed:
          bores.length === 2 &&
          bores.every((bore) => bore.passed !== false) &&
          body.children?.filter((child) => !child.solid).length === 2,
        actual: bores.map((bore) => bore.actual),
      });
    }
    cad.apply(proposal);
    await showLabProject(runtime, cad, { role: 'result' });
    cad.undo();
    checks.push({ label: 'Undo stellt den Ausgangszustand wieder her', passed: cad.serialize() === before });
    return { checks };
  } finally {
    runtime.signal.removeEventListener('abort', abort);
    cad.dispose();
  }
}

export async function runPluginDevelopmentCheck(id, runtime) {
  if (id === 'plugin-form') return shapePackage(runtime, false);
  if (id === 'plugin-drilled-form') return shapePackage(runtime, true);
  const { checks, action } = functionLifecycle();
  if (id === 'plugin-functions') return { checks };
  if (id !== 'plugin-convert') throw Error('Unbekannte Plugin-Prüfung.');
  if (action !== 'stl-to-step') return { checks: [...checks, { label: 'STL-Konverter registriert', passed: false }] };
  const result = await runStlDevelopmentCheck('stl-countersinks', runtime);
  return { ...result, checks: [...checks, ...result.checks] };
}
