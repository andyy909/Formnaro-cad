import { checkedRequest } from './cad-lab-fixture.js';
import { showLabProject, showLabProposal } from './cad-lab-preview-assets.js';

const box = (as, size, pos) => ({ op: 'create', as, type: 'box', size, pos });
const batch = (commands) => ({ kind: 'batch', commands });
const pocketName = 'Aufnahme';
const insertName = 'Einsatz';
const insert = () => [{ ...box('insert', [25.6, 19.8, 7], [42.5, -7.5, 14.3]), name: insertName }];
const prompt =
  'Ergänze einen separaten quaderförmigen Einsatz in der vorhandenen offenen Tasche. ' +
  'Der Einsatz ist 7 mm hoch. Halte zu jeder seitlichen Innenfläche in X 0,7 mm und in Y 0,6 mm Abstand, ' +
  'zur Bodenoberseite 0,8 mm Luft. Nenne das Teil Einsatz und erhalte die komplette Aufnahme.';

export async function runLabFittingPocket(runtime) {
  const cad = runtime.createController();
  const cancel = () => cad.cancel();
  runtime.signal.addEventListener('abort', cancel, { once: true });
  try {
    runtime.signal.throwIfAborted();
    await cad.execute(batch([
      box('floor', [35, 29, 6], [42.5, -7.5, 7]),
      box('west', [4, 29, 12], [27, -7.5, 16]),
      box('east', [4, 29, 12], [58, -7.5, 16]),
      box('south', [27, 4, 12], [42.5, -20, 16]),
      box('north', [27, 4, 12], [42.5, 5, 16]),
      { op: 'group', targets: ['$floor', '$west', '$east', '$south', '$north'], name: pocketName },
    ]));
    const original = cad.snapshot().nodes[0];
    const before = cad.serialize();
    const undo = cad.state().undo;
    const checks = [];
    const input = { prompts: [prompt] };
    await showLabProposal(runtime, cad, () => cad.preview(batch(insert())));
    if (runtime.previewOnly) return { checks, input };
    runtime.signal.throwIfAborted();
    if (!(await checkedRequest(cad, runtime, prompt, insert, checks))) return { checks, input };

    const { nodes } = cad.snapshot();
    const added = nodes.find((body) => body.name === insertName);
    const bounds = (await cad.describe()).objects.find((object) => object.id === added?.id)?.worldBounds;
    const near = (value, expected, tolerance = 0.015) => Math.abs(value - expected) <= tolerance;
    const matches = (values, expected) => expected.every((value, index) => near(values?.[index], value));
    checks.push(
      { label: 'Unveränderte Aufnahme mit allen Quellen', passed: JSON.stringify(nodes.find(({ id }) => id === original.id)) === JSON.stringify(original) },
      { label: 'Ein neuer separater nativer Volumenkörper', passed: nodes.length === 2 && added?.kind === 'cad' && added.stats.solids === 1 },
      { label: 'Seitliches Spiel in X und Y', passed: matches(bounds?.min?.slice(0, 2), [29.7, -17.4]) && matches(bounds?.max?.slice(0, 2), [55.3, 2.4]) },
      { label: 'Bodenluft und Einsatzhöhe', passed: near(bounds?.min?.[2], 10.8) && near(bounds?.max?.[2], 17.8) },
      { label: 'Materialvolumen des Quaders', passed: near(added?.stats?.volume, 3548.16, 0.05) },
    );
    await showLabProject(runtime, cad, { role: 'result' });
    while (cad.state().undo > undo) cad.undo();
    const restored = cad.serialize() === before;
    checks.push({ label: 'Undo stellt den Ausgangszustand wieder her', passed: restored });
    runtime.benchmark?.recordProgramCheck('Undo stellt den Ausgangszustand wieder her', restored);
    return { checks, input };
  } finally {
    runtime.signal.removeEventListener('abort', cancel);
    cad.dispose();
  }
}
