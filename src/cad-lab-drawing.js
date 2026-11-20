import { checkedRequest, labDrawingDefinition as definition } from './cad-lab-fixture.js';
import { showLabProject, showLabProposal } from './cad-lab-preview-assets.js';
import {
  cadDrawingDimension,
  cadDrawingProblems,
  cadDrawingSourceSignatures,
  createCadDrawingSheet,
} from './cad-drawing-data.js';
import { exportCadDrawing, previewCadDrawingCommands } from './cad-drawing-automation.js';

const prompts = [
  'Erstelle das native Zeichnungsblatt Grundplatte im Format A4 quer, Maßstab 1:1. Verknüpfe ausschließlich die Grundplatte in Vorder-, Seiten- und Draufsicht und aktualisiere die Ansichten.',
  'Ergänze auf dem bestehenden Blatt die nativen Außenmaße 60 × 36 × 8 der Grundplatte sowie die sichtbaren Bohrungsdurchmesser Ø8 und Ø14. Verwende an der Geometrie verknüpfte Maße. Erhalte die Ansichten.',
  'Ergänze auf dem bemaßten Blatt eine Schnittansicht in Längsrichtung durch die Stufenbohrung auf der positiven Y-Seite. Die Bohrungsmitte liegt 6 mm von der Mittelebene nach +Y versetzt. Erhalte die drei Ansichten und die vorhandenen Maße. Aktualisiere das ganze Blatt.',
  'Führe das vorhandene Einzelteilblatt Grundplatte als Zeichnungsnummer Z-04 mit Revision B weiter. Erhalte seine vier Ansichten mit den nativen Maßen und ausschließlich der Grundplatte als Quelle. Ergänze ein eigenes A4-Querformat-Blatt Baugruppe im Maßstab 1:2. Dessen Vorder-, Seiten- und Draufsicht sowie sein Längsschnitt bei Y=6 zeigen Grundplatte und Klemmleiste gemeinsam. Aktualisiere beide Blätter mit nativen Projektionen.',
  'Ergänze das A3-Querformat-Blatt Bohrungsdetail im Maßstab 2:1 ausschließlich zur Grundplatte. Zeige die Draufsicht und zwei getrennte Längsschnitte bei Y=+6 und Y=−6. Der positive Schnitt zeigt die Stufenbohrung, der negative die einfache Durchgangsbohrung. Berechne die Projektionen nativ. Erhalte beide vorhandenen Blätter unverändert.',
  'Die Klemmleiste wurde im Modell bereits verlängert und verschoben. Setze im bestehenden Blatt Baugruppe die Revision C und aktualisiere dessen vier Ansichten. Ergänze ein eigenes Blatt Klemmleiste, A4 quer im Maßstab 1:1, mit Vorder-, Seiten- und Draufsicht ausschließlich dieses Teils. Berechne die Projektionen nativ. Lasse die Blätter Grundplatte und Bohrungsdetail unverändert.',
  'Die Stufenbohrung wurde im Modell in Y von +6 auf +10 verschoben. Führe Grundplatte, Baugruppe und Bohrungsdetail als Revision D weiter. Passe in diesen drei Blättern die Längsschnitte durch die versetzte Stufenbohrung auf Y=+10 an. Erhalte den zweiten Schnitt im Bohrungsdetail bei Y=−6 sowie Blattgrößen, Maßstäbe, Quellen und Ansichten. Entferne die alten Bemaßungen auf Grundplatte und Bohrungsdetail, sodass sie nach der Aktualisierung neu gebunden werden können. Aktualisiere die drei Blätter nativ. Das Blatt Klemmleiste bleibt vollständig unverändert.',
];

const revisedSheets = ['Grundplatte', 'Baugruppe', 'Bohrungsdetail'];
const revisedOffset = 10;
const revision7 = 'D';
const movedBoreName = 'Stufenbohrung Durchgang';
const movedSeatName = 'Stufenbohrung Senkung';

const dimensionPrompts = {
  5: 'Ergänze auf Bohrungsdetail in der Draufsicht native Durchmesser Ø8 und Ø14 sowie die X-Abstände beider Lochmitten vom linken Plattenrand. Verwende geometrisch gebundene Maße und erhalte die Schnitte. Die vorhandenen Blätter bleiben unverändert.',
  6: 'Bemaße das Blatt Klemmleiste nativ mit den drei tatsächlichen Außenmaßen. Erhalte alle vier Blätter und ihre vorhandenen Ansichten.',
  7: 'Bemaße die aktualisierte Grundplatte und das Bohrungsdetail in ihren bestehenden Draufsichten nativ. Die verkleinerte Senkung hat jetzt Ø12. Grundplatte behält ihre drei Außenmaße und die sichtbaren Durchmesser, Bohrungsdetail zeigt beide Durchmesser und die X-Abstände beider Lochmitten zum linken Rand. Erhalte alle vier Blattdefinitionen, insbesondere das Blatt Klemmleiste.',
};
const visualSheets = { 5: ['Bohrungsdetail'], 6: ['Baugruppe', 'Klemmleiste'], 7: revisedSheets };
const near = (actual, expected) => Math.abs(actual - expected) < 0.015;
const put = (sheet) => ({ op: 'drawing', action: 'put', sheet });
const update = (sheetId) => ({ op: 'drawing', action: 'update', sheetId });
const basic = (sheetId) => ({ op: 'drawing', action: 'dimension', sheetId, mode: 'basic' });
const section = (sourceIds) => ({
  id: sourceIds.length > 1 ? 'assembly-longitudinal' : 'part-longitudinal',
  kind: 'section',
  sourceIds,
  position: [165, 165],
  section: { axis: 1, offset: 6 },
});



async function seed(cad, level) {
  await cad.execute({
    kind: 'batch',
    commands: [
      { op: 'create', as: 'stock', type: 'box', size: [60, 36, 8], pos: [0, 0, 4], solid: true },
      { op: 'create', as: 'left', type: 'cylinder', size: [8, 8, 10], pos: [-14, -6, 4], solid: false },
      { op: 'create', as: 'right', ...(level === 7 ? { name: movedBoreName } : {}), type: 'cylinder', size: [8, 8, 10], pos: [14, 6, 4], solid: false },
      { op: 'create', as: 'recess', ...(level === 7 ? { name: movedSeatName } : {}), type: 'cylinder', size: [14, 14, 6], pos: [14, 6, 8], solid: false },
      { op: 'group', name: 'Grundplatte', targets: ['$stock', '$left', '$right', '$recess'] },
      ...(level >= 4
        ? [{ op: 'create', type: 'box', name: 'Klemmleiste', size: [34, 10, 4], pos: [0, 10, 10], solid: true }]
        : []),
    ],
  });
}

async function moveClamp(cad) {
  const clamp = cad.snapshot().nodes.find((node) => node.name === 'Klemmleiste');
  await cad.execute({
    kind: 'batch',
    commands: [
      { op: 'update', target: clamp.id, set: { size: [42, 10, 4], sizeAnchor: 'center' } },
      { op: 'transform', target: clamp.id, translate: [3, 0, 0], space: 'world' },
    ],
  });
}

async function moveBore(cad) {
  const plate = cad.snapshot().nodes.find((node) => node.name === 'Grundplatte');
  const target = (name) => ({ rootId: plate.id, path: [plate.children.find((node) => node.name === name).id] });
  await cad.execute({
    kind: 'batch',
    commands: [
      { op: 'transform', target: target(movedBoreName), translate: [0, 4, 0], space: 'world' },
      { op: 'transform', target: target(movedSeatName), translate: [0, 4, 0], space: 'world' },
      { op: 'update', target: target(movedSeatName), set: { size: [12, 12, 6], sizeAnchor: 'center' } },
    ],
  });
}

function reference(cad, level) {
  const ids = cad.snapshot().nodes.map((node) => node.id);
  if (level === 1) {
    const sheet = createCadDrawingSheet({ id: 'single', name: 'Grundplatte', sourceIds: [ids[0]] });
    return [put(sheet), update(sheet.id)];
  }
  if (level === 2) return [basic('single')];
  const sheets = cad.snapshot().drawings.sheets;
  if (level === 7) {
    return revisedSheets.flatMap((name) => {
      const sheet = definition(sheets.find((candidate) => candidate.name === name));
      sheet.titleBlock.revision = revision7;
      if (name !== 'Baugruppe') sheet.annotations = sheet.annotations.filter((annotation) => annotation.kind === 'label');
      for (const view of sheet.views)
        if (view.kind === 'section' && view.section.offset === 6) view.section.offset = revisedOffset;
      return [put(sheet), update(sheet.id)];
    });
  }
  if (level === 5) {
    const detail = createCadDrawingSheet({
      id: 'bore-detail',
      name: 'Bohrungsdetail',
      sourceIds: [ids[0]],
      paper: 'A3',
      scale: 2,
    });
    const top = detail.views.find((view) => view.kind === 'top');
    detail.views = [
      { ...top, position: [94, 90] },
      { ...section([ids[0]]), id: 'detail-recess', position: [94, 235] },
      { ...section([ids[0]]), id: 'detail-through', position: [282, 235], section: { axis: 1, offset: -6 } },
    ];
    return [put(detail), update(detail.id)];
  }
  if (level === 6) {
    const assembly = definition(sheets.find((sheet) => sheet.name === 'Baugruppe'));
    assembly.titleBlock.revision = 'C';
    const clamp = createCadDrawingSheet({ id: 'clamp', name: 'Klemmleiste', sourceIds: [ids[1]] });
    return [put(assembly), put(clamp), update(assembly.id), update(clamp.id)];
  }
  const sheet = definition(sheets[0]);
  if (level === 3) {
    sheet.views.push(section([ids[0]]));
    return [put(sheet), update(sheet.id)];
  }
  sheet.titleBlock = { ...sheet.titleBlock, number: 'Z-04', revision: 'B' };
  const assembly = createCadDrawingSheet({ id: 'assembly', name: 'Baugruppe', sourceIds: ids, scale: 0.5 });
  assembly.views.push(section(ids));
  return [put(sheet), put(assembly), update(sheet.id), update(assembly.id)];
}

function dimensionCommands(cad, level) {
  if (level === 7) {
    const sheets = cad.snapshot().drawings.sheets;
    return [
      basic(sheets.find((sheet) => sheet.name === 'Grundplatte').id),
      { ...basic(sheets.find((sheet) => sheet.name === 'Bohrungsdetail').id), mode: 'detailed' },
    ];
  }
  const name = visualSheets[level].at(-1);
  const sheet = cad.snapshot().drawings?.sheets.find((item) => item.name === name);
  if (!sheet) throw Error('Blatt für die Sollbemaßung fehlt.');
  return [{ ...basic(sheet.id), mode: level === 5 ? 'detailed' : 'basic' }];
}

async function applyReference(cad, level) {
  const apply = async (commands) =>
    cad.apply(await previewCadDrawingCommands(cad, { revision: cad.revision(), commands }));
  await apply(reference(cad, level));
  if (dimensionPrompts[level]) await apply(dimensionCommands(cad, level));
}

function measuredDimensions(sheet, viewId) {
  return (sheet?.annotations ?? []).flatMap((annotation) => {
    if (annotation.kind === 'label' || (viewId && annotation.viewId !== viewId)) return [];
    try {
      return [{ kind: annotation.kind, axis: annotation.axis, value: cadDrawingDimension(sheet, annotation).value }];
    } catch {
      return [];
    }
  });
}

function sectionPoints(view) {
  return view?.projection?.curves.filter((curve) => curve.kind === 'line').flatMap((curve) => [curve.a, curve.b]) ?? [];
}

function passesThrough(points, expected) {
  return expected.every(([x, z]) => points.some(([a, b]) => near(a, x) && near(b, z)));
}

function expectedViews(sheet, sourceIds, withSection) {
  const kinds = ['front', 'side', 'top', ...(withSection ? ['section'] : [])];
  return (
    sheet?.views.length === kinds.length &&
    kinds.every((kind) =>
      sheet.views.some(
        (view) =>
          view.kind === kind &&
          view.sourceIds.length === sourceIds.length &&
          sourceIds.every((id) => view.sourceIds.includes(id)) &&
          view.projection?.curves?.length,
      ),
    )
  );
}

export async function runDrawingBenchmark(level, runtime) {
  const cad = runtime.createController();
  const { signal } = runtime;
  const cancel = () => cad.cancel();
  signal.addEventListener('abort', cancel, { once: true });
  const checks = [];
  const prompt = prompts[level - 1];
  const add = (label, passed, actual) => checks.push({ label, passed: Boolean(passed), actual });
  try {
    signal.throwIfAborted();
    await seed(cad, level);
    for (let step = 1; step < level; step++) {
      signal.throwIfAborted();
      if (step === 6) await moveClamp(cad);
      await applyReference(cad, step);
    }
    if (level === 6) await moveClamp(cad);
    if (level === 7) await moveBore(cad);
    const visualOptions = { model: false, drawings: true, sheetNames: visualSheets[level] };
    if (dimensionPrompts[level] && runtime.showReference && typeof document !== 'undefined') {
      const expected = runtime.createController();
      try {
        await expected.open(cad.serialize());
        await applyReference(expected, level);
        await showLabProject(runtime, expected, visualOptions);
      } catch {
        /* A visual reference does not affect native acceptance. */
      } finally {
        expected.dispose();
      }
    } else {
      await showLabProposal(
        runtime,
        cad,
        () => previewCadDrawingCommands(cad, { revision: cad.revision(), commands: reference(cad, level) }),
        visualOptions,
      );
    }
    if (runtime.previewOnly) return { checks, input: { prompt } };
    signal.throwIfAborted();
    const before = cad.snapshot(),
      serialized = cad.serialize(),
      undo = cad.state().undo;
    const scoped = {
      ...runtime,
      ...(runtime.generate
        ? {
            generate: (args) =>
              runtime.generate({
                ...args,
                scene: {
                  revision: args.scene.revision,
                  objects: args.scene.objects
                    .filter((o) => !o.target.path.length)
                    .map(({ id, name, worldBounds }) => ({ id, name, worldBounds })),
                  drawings: (cad.snapshot().drawings?.sheets ?? []).map(definition),
                },
              }),
          }
        : {}),
    };
    if (!(await checkedRequest(cad, scoped, prompt, () => reference(cad, level), checks)))
      return { checks, input: { prompt } };
    if (
      dimensionPrompts[level] &&
      !(await checkedRequest(cad, scoped, dimensionPrompts[level], () => dimensionCommands(cad, level), checks))
    )
      return { checks, input: { prompt, prompts: [prompt, dimensionPrompts[level]] } };
    await showLabProject(runtime, cad, { ...visualOptions, role: 'result' });
    const project = cad.snapshot(),
      ids = before.nodes.map((node) => node.id);
    const sheets = project.drawings?.sheets ?? [];
    const single = sheets.find((sheet) => sheet.name === 'Grundplatte');
    const boreOffset = level === 7 ? revisedOffset : 6;
    const seatDiameter = level === 7 ? 12 : 14;
    add('Modellgeometrie unverändert', JSON.stringify(project.nodes) === JSON.stringify(before.nodes));
    add(
      'Einzelteilblatt mit verknüpften nativen Projektionen',
      single?.paper === 'A4' &&
        single.orientation === 'landscape' &&
        single.scale === 1 &&
        expectedViews(single, [ids[0]], level >= 3),
    );
    if (level >= 2 && single) {
      const dimensions = measuredDimensions(single);
      add(
        'Native Maße für Breite, Höhe, Tiefe und beide Durchmesser',
        [60, 36, 8].every((n) => dimensions.some((m) => m.kind !== 'diameter' && near(m.value, n))) &&
          [8, seatDiameter].every((n) => dimensions.some((m) => m.kind === 'diameter' && near(m.value, n))),
        dimensions,
      );
      if (level >= 3) {
        const original = before.drawings.sheets[0].annotations.map((a) => a.id);
        if (level !== 7) add(
          'Bestehende Maßbezüge erhalten',
          original.every((id) => single.annotations.some((a) => a.id === id)),
        );
        const cut = single.views.find((v) => v.kind === 'section');
        const points = sectionPoints(cut);
        add(
          'Versetzter Schnitt zeigt Absatz und Durchgang der Bohrung',
          cut?.section?.axis === 1 &&
            near(cut.section.offset, boreOffset) &&
            passesThrough(points, [
              [14 - seatDiameter / 2, 5],
              [14 + seatDiameter / 2, 5],
              [10, 0],
              [18, 0],
            ]),
          points,
        );
      }
    }
    if (level >= 4) {
      const assembly = sheets.find((sheet) => sheet.name === 'Baugruppe');
      const cut = assembly?.views.find((v) => v.kind === 'section');
      add(
        'Einzelteilblatt Z-04 mit aktueller Revision',
        single?.titleBlock.number === 'Z-04' && single.titleBlock.revision === (level === 7 ? revision7 : 'B'),
      );
      add(
        'Separates Baugruppenblatt A4 quer 1:2 mit Schnitt durch beide Teile',
        assembly?.paper === 'A4' &&
          assembly.orientation === 'landscape' &&
          assembly.scale === 0.5 &&
          expectedViews(assembly, ids, true) &&
          cut?.section.axis === 1 &&
          near(cut.section.offset, boreOffset),
      );
    }
    const findSheet = (name) => sheets.find((sheet) => sheet.name === name);
    const unchanged = (name) =>
      JSON.stringify(findSheet(name)) === JSON.stringify(before.drawings?.sheets.find((sheet) => sheet.name === name));
    if (level === 5 || level === 7) {
      const detail = findSheet('Bohrungsdetail');
      const top = detail?.views.find((view) => view.kind === 'top');
      const cuts = detail?.views.filter((view) => view.kind === 'section') ?? [];
      const at = (offset) => cuts.find((view) => view.section.axis === 1 && near(view.section.offset, offset));
      add(
        'Detailblatt A3 2:1 nutzt nur die Grundplatte',
        detail?.paper === 'A3' &&
          detail.orientation === 'landscape' &&
          detail.scale === 2 &&
          detail.views.length === 3 &&
          top &&
          detail.views.every(
            (view) => view.sourceIds.length === 1 && view.sourceIds[0] === ids[0] && view.projection?.curves.length,
          ),
      );
      add(
        'Beide Schnitte gehen durch die jeweils richtige Bohrung',
        passesThrough(sectionPoints(at(boreOffset)), [
          [14 - seatDiameter / 2, 5],
          [14 + seatDiameter / 2, 5],
        ]) &&
          passesThrough(sectionPoints(at(-6)), [
            [-18, 0],
            [-10, 0],
            [-18, 8],
            [-10, 8],
          ]),
      );
      const dims = measuredDimensions(detail, top?.id);
      add(
        'Durchmesser und Lagen sind geometrisch bemaßt',
        [8, seatDiameter].every((n) => dims.some((m) => m.kind === 'diameter' && near(m.value, n))) &&
          [16, 44].every((n) => dims.some((m) => m.kind === 'distance' && m.axis === 'x' && near(m.value, n))),
        dims,
      );
      if (level === 5)
        add('Vorhandene Blätter bleiben vollständig unverändert', unchanged('Grundplatte') && unchanged('Baugruppe'));
      else {
        add('Baugruppe und Bohrungsdetail als Revision D',
          findSheet('Baugruppe')?.titleBlock.revision === revision7 && detail?.titleBlock.revision === revision7);
        const cut = findSheet('Baugruppe')?.views.find((view) => view.kind === 'section');
        add('Aktualisierter Baugruppenschnitt zeigt die versetzte Senkung im Modell',
          passesThrough(sectionPoints(cut), [[8, 5], [20, 5], [10, 0], [18, 0]]));
        add('Separates Fertigungsblatt Klemmleiste vollständig erhalten', unchanged('Klemmleiste'));
      }
    }
    if (level === 6) {
      const clamp = findSheet('Klemmleiste');
      const dims = measuredDimensions(clamp);
      add('Baugruppe ist als Revision C aktualisiert', findSheet('Baugruppe')?.titleBlock.revision === 'C');
      add(
        'Einzelblatt Klemmleiste zeigt nur das geänderte Teil',
        clamp?.paper === 'A4' &&
          clamp.orientation === 'landscape' &&
          clamp.scale === 1 &&
          expectedViews(clamp, [ids[1]], false),
      );
      add(
        'Klemmleiste ist mit den aktuellen Außenmaßen bemaßt',
        [42, 10, 4].every((n) => dims.some((m) => near(m.value, n))),
        dims,
      );
      add(
        'Grundplatte und Bohrungsdetail bleiben vollständig unverändert',
        unchanged('Grundplatte') && unchanged('Bohrungsdetail'),
      );
    }
    add('Erwarteter Blattumfang', sheets.length === Math.max(1, Math.min(4, level - 2)));
    for (const sheet of sheets) {
      const issues = cadDrawingProblems(sheet, { sourceSignatures: cadDrawingSourceSignatures(project) });
      const svg = issues.length ? null : await exportCadDrawing(cad, { format: 'drawing-svg', sheetId: sheet.id });
      add('Aktuelles SVG aus nativen Referenzen · ' + sheet.name, svg?.mime === 'image/svg+xml', issues);
    }
    while (cad.state().undo > undo) cad.undo();
    add('Undo stellt den Ausgangszustand wieder her', cad.serialize() === serialized);
    return {
      checks,
      input: { prompt, ...(dimensionPrompts[level] ? { prompts: [prompt, dimensionPrompts[level]] } : {}) },
    };
  } finally {
    signal.removeEventListener('abort', cancel);
    cad.dispose();
  }
}
