import { runCadAIRequest } from './cad-ai-request.js';
import { createCadAutomationAccess } from './cad-automation-access.js';
import { cadBytesDigest } from './cad-geometry-digest.js';
import { photoEvidence } from './cad-photo-data.js';
import { analyzePhotoSet, photoSetViewDefault } from './cad-photo-multiview-data.js';
import { reviewPhotoSet } from './cad-photo-multiview-review.js';
import { createPhotoTask } from './cad-photo-task.js';

const width = 600;
const height = 400;
const closeTo = (actual, expected, tolerance = 1e-5) => Math.abs(actual - expected) <= tolerance;
const check = (label, passed, actual) => ({
  label,
  passed: Boolean(passed),
  ...(actual === undefined ? {} : { actual }),
});

function syntheticPhoto({ name, view, outline, holes = [], scale, dimensions = [], perspective, tint = 119 }) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  function paint(points, color) {
    context.beginPath();
    context.moveTo(...points[0]);
    for (const point of points.slice(1)) context.lineTo(...point);
    context.closePath();
    context.fillStyle = color;
    context.fill();
  }
  paint(outline, 'rgb(' + [tint, tint, tint].join(',') + ')');
  for (const hole of holes) paint(hole, '#fff');
  const dataUrl = canvas.toDataURL('image/png'),
    bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), (character) => character.charCodeAt(0)),
    digest = cadBytesDigest(bytes);
  return {
    image: { mimeType: 'image/png', dataUrl },
    reference: {
      version: perspective ? 2 : 1,
      imageId: 'photo-' + digest.slice(0, 16),
      digest,
      name,
      width,
      height,
      view,
      scale,
      dimensions,
      outline,
      holes,
      unknowns: ['Rückseite und nicht sichtbare Innengeometrie'],
      ...(perspective ? { perspective } : {}),
    },
  };
}

function platePhoto({ tilted = false, calibrated = true } = {}) {
  // The analytic skew of the synthetic image is independent of the calibration solver.
  const project = ([x, y]) =>
    tilted
      ? [(x + 0.12 * y + 20) / (0.0006 * x + 0.0002 * y + 1), (0.06 * x + 0.9 * y + 15) / (0.0006 * x + 0.0002 * y + 1)]
      : [x, y];
  const outline = [
    [100, 100],
    [500, 100],
    [500, 300],
    [100, 300],
  ].map(project);
  const opening = [
    [250, 160],
    [350, 160],
    [350, 240],
    [250, 240],
  ].map(project);
  const accuracy = {
    referenceErrorMm: 0.01,
    pickErrorPx: 0.5,
    source: 'user',
    note: 'Bekannte synthetische 40-mm-Referenz',
  };
  const perspective = tilted
    ? {
        kind: 'rectangle',
        points: [
          [100, 50],
          [500, 50],
          [500, 350],
          [100, 350],
        ].map(project),
        sizeMm: [40, 30],
        ...accuracy,
      }
    : undefined;
  return syntheticPhoto({
    name: tilted ? 'Schrägaufnahme der Prüfplatte' : 'Frontaufnahme der Prüfplatte',
    view: 'front',
    outline,
    holes: [opening],
    scale: calibrated
      ? {
          points: [
            [100, 50],
            [500, 50],
          ].map(project),
          mm: 40,
          ...accuracy,
        }
      : null,
    dimensions: calibrated
      ? [
          { name: 'Breite', source: 'measured', points: outline.slice(0, 2) },
          { name: 'Tiefe', source: tilted ? 'assumed' : 'user', mm: 4, note: 'Vorgabe für das synthetische Testteil' },
        ]
      : [],
    perspective,
  });
}

const plateCommands = (plateWidth) => [
  { op: 'create', type: 'box', as: 'plate', name: 'Fotoplatte', size: [plateWidth, 4, 20], pos: [150, 0, 10] },
  { op: 'create', type: 'box', as: 'opening', size: [10, 8, 8], pos: [150, 0, 10], solid: false },
  { op: 'group', targets: ['$plate', '$opening'], as: 'result', name: 'Fotoplatte mit Öffnung' },
];

async function runPhotoRequest(controller, { prompt, photo, useReference, generate, signal }) {
  signal?.throwIfAborted();
  const scene = await controller.describe();
  const access = createCadAutomationAccess({ controller, getScene: () => scene });
  const image = { ...photo.image, name: 'Synthetisches-Pruefbild.png' };
  const corrections = [];
  const outcome = await runCadAIRequest({
    input: { prompt, images: [image], ...(useReference ? { photoReferences: [photo.reference] } : {}) },
    generate,
    access,
    visualReview: false,
    maxCorrections: 1,
    onCorrection: (_attempt, error) => corrections.push(error.code),
    isCurrent: () => !signal?.aborted,
  });
  signal?.throwIfAborted();
  return { access, outcome, corrections };
}

async function openingRays(controller, id, bounds) {
  const center = bounds.min.map((n, axis) => (n + bounds.max[axis]) / 2);
  // Material immediately outside the four expected edges and open rays just inside them.
  const samples = [
    [0, 0, true],
    [-4.9, 0, true],
    [4.9, 0, true],
    [0, -3.9, true],
    [0, 3.9, true],
    [-5.1, 0, false],
    [5.1, 0, false],
    [0, -4.1, false],
    [0, 4.1, false],
  ];
  const rays = [];
  for (const [x, z, expectedOpen] of samples) {
    const hit = await controller.query('rayPick', {
      ids: [id],
      ray: { origin: [center[0] + x, bounds.min[1] - 2, center[2] + z], direction: [0, 1, 0], far: 12 },
    });
    rays.push({ x, z, expectedOpen, open: hit === null });
  }
  return check(
    'Native Durchgangsöffnung misst 10 × 8 mm',
    rays.every((r) => r.open === r.expectedOpen),
    rays,
  );
}

async function calibratedPlate(controller, { tilted, generate, signal }) {
  const photo = platePhoto({ tilted });
  const evidence = photoEvidence(photo.reference);
  const base = controller.serialize(),
    undo = controller.state().undo;
  let replies = 0;
  const prompt = tilted
    ? 'Bau die Platte mit der Öffnung nach. Nimm für die Tiefe 4 mm an.'
    : 'Baue die Platte aus dem Bild, 4 mm dick, mit der Öffnung.';
  const replay = async () => ({
    revision: controller.revision(),
    commands: plateCommands(++replies === 1 ? 48 : 40),
    checks: [{ kind: 'solids', target: '$result', expected: 1 }],
  });
  const { access, outcome, corrections } = await runPhotoRequest(controller, {
    prompt,
    photo,
    useReference: true,
    generate: generate ?? replay,
    signal,
  });
  const measurement = evidence.dimensions[0];
  const report = outcome.proposal?.photoComparison?.[0];
  const preview = check(
    'Vorschau ändert bestätigtes Modell und Undo-Stand nicht',
    controller.serialize() === base && controller.state().undo === undo,
  );
  const checks = [
    check(
      'Kalibrierte Bildbreite ist 40 mm mit ausgewiesener Unsicherheit',
      closeTo(measurement.mm, 40) && measurement.uncertaintyMm > 0,
      measurement,
    ),
    check(
      'Tiefe ist separat mit 4 mm angegeben',
      evidence.dimensions[1].source === (tilted ? 'assumed' : 'user') && evidence.dimensions[1].mm === 4,
    ),
    preview,
    check(
      'Fotovergleich bestätigt Außenkontur und freie Öffnung',
      report?.matches && report.openings.length === 1 && report.openings[0].blockedFraction <= 0.05,
      report && { iou: report.iou, sizeMm: report.modelSizeMm, blockedFraction: report.openings?.[0]?.blockedFraction },
    ),
  ];
  if (!generate)
    checks.push(
      check(
        'Abweichender Entwurf durchläuft die normale Foto-Korrekturschleife',
        replies === 2 && outcome.correctionAttempts === 1 && corrections.includes('PHOTO_MISMATCH'),
        { replies, corrections },
      ),
    );
  const candidate = outcome.proposal;
  if (!candidate || candidate.correctionError || !checks.every((row) => row.passed)) {
    if (candidate) access.discard(candidate.previewId);
    if (checks.every((row) => row.passed))
      checks.push(check('Geprüfte Vorschau ist übernehmbar', false, candidate?.correctionError ?? outcome.question));
    return { checks };
  }

  await access.apply({ previewId: candidate.previewId, revision: candidate.revision });
  signal?.throwIfAborted();
  const parts = controller.snapshot().nodes;
  const body = parts[0];
  const bounds = body?.stats?.bounds;
  const size = bounds?.max.map((n, axis) => n - bounds.min[axis]);
  checks.push(
    check(
      'Ein nativer CAD-Körper mit 40 × 4 × 20 mm und 2880 mm³',
      parts.length === 1 &&
        body?.kind === 'cad' &&
        body.stats.solids === 1 &&
        [40, 4, 20].every((mm, axis) => closeTo(size?.[axis], mm)) &&
        closeTo(body.stats.volume, 2880),
      { size, volume: body?.stats?.volume },
    ),
  );
  if (parts.length === 1 && body.kind === 'cad' && bounds) checks.push(await openingRays(controller, body.id, bounds));
  const oneUndo = controller.state().undo === undo + 1;
  if (oneUndo) controller.undo();
  checks.push(
    check('Ein Undo stellt den Originalzustand exakt wieder her', oneUndo && controller.serialize() === base),
  );
  return { checks };
}

async function missingScale(controller, { generate, signal }) {
  const photo = platePhoto({ calibrated: false }),
    image = { ...photo.image, name: 'Synthetisches-Pruefbild.png' };
  const base = controller.serialize(),
    undo = controller.state().undo;
  let rejectionCode;
  try {
    await createPhotoTask({ images: [image], photoReferences: [photo.reference] });
  } catch (error) {
    if (error.code !== 'PHOTO_INVALID') throw error;
    rejectionCode = error.code;
  }
  const { access, outcome } = await runPhotoRequest(controller, {
    prompt: 'Mach daraus ein maßgenaues 3D-Modell.',
    photo,
    useReference: false,
    generate: generate ?? (async () => ({ question: 'Welches Maß dient als Referenz und wie dick ist die Platte?' })),
    signal,
  });
  const reply = outcome.question || outcome.message || '';
  const asksForData = !!outcome.question || /\?|benötig|brauch|fehl|unbekannt|nicht\s+(?:ermittel|ableit)/i.test(reply);
  const noGeometry = !outcome.proposal && !outcome.commands;
  if (outcome.proposal) access.discard(outcome.proposal.previewId);
  return {
    checks: [
      check(
        'Unkalibrierte Fotoreferenz wird vor der Messung abgewiesen',
        rejectionCode === 'PHOTO_INVALID',
        rejectionCode,
      ),
      check(
        'Antwort fordert Maßstab und Bauteiltiefe an',
        noGeometry &&
          asksForData &&
          /Referenz|Maßstab|Skalierung|Vergleichsmaß|Skala|bekannt.{0,35}(?:maß|länge|breite)|Kalibriermaß/i.test(
            reply,
          ) &&
          /Tiefe|Dicke|Stärke|dick/i.test(reply),
        reply.slice(0, 500),
      ),
      check(
        'Projekt und Undo-Stand bleiben unverändert',
        controller.serialize() === base && controller.state().undo === undo,
      ),
    ],
  };
}

function threeViews() {
  const dimensions = [40, 20, 30];
  const outlines = [
    [
      [0, 0],
      [40, 0],
      [40, 20],
      [20, 20],
      [20, 30],
      [0, 30],
    ],
    [
      [0, 0],
      [20, 0],
      [20, 30],
      [0, 30],
    ],
    [
      [0, 0],
      [40, 0],
      [40, 20],
      [0, 20],
    ],
  ];
  const pixel = ([x, y]) => [100 + 10 * x, 350 - 10 * y];
  const items = ['front', 'right', 'top'].map((view, index) =>
    syntheticPhoto({
      name: 'Synthetische Ansicht ' + view,
      view,
      outline: outlines[index].map(pixel),
      holes:
        view === 'front'
          ? [
              [
                [5, 5],
                [10, 5],
                [10, 10],
                [5, 10],
              ].map(pixel),
            ]
          : [],
      scale: {
        points: [
          [50, 30],
          [450, 30],
        ],
        mm: 40,
        referenceErrorMm: 0.01,
        pickErrorPx: 0.25,
        source: 'user',
        note: 'Bekannte synthetische 40-mm-Referenz',
      },
      tint: 119 + index,
    }),
  );
  const plan = {
    version: 1,
    id: 'lab-photo-three-views',
    name: 'Halter aus drei Ansichten',
    views: items.map(({ reference }) => photoSetViewDefault(reference)),
    dimensions: dimensions.map((mm, axis) => ({
      axis,
      mm,
      toleranceMm: 0.001,
      source: 'user',
      note: 'Bekanntes Prüfmaß',
    })),
    placement: [70, 0, 5],
    fitDimensions: true,
    assumptions: ['Geprüfte Außenkonturen und bestätigte Öffnung begrenzen das Material.'],
    functionalChecks: [
      {
        id: 'known-clearance',
        name: 'Vier-Millimeter-Durchgang',
        kind: 'clearance',
        from: [7.5, -1, 7.5],
        to: [7.5, 21, 7.5],
        diameter: 4,
        tolerance: 0.001,
        source: 'user',
        note: 'Freier Durchgang durch das 5-mm-Fenster',
      },
    ],
  };
  plan.views[0].holeMode = 'through';
  return { version: 2, items, reconstructions: [plan] };
}

async function multiview(controller, { signal }) {
  const photos = threeViews(),
    plan = photos.reconstructions[0];
  await controller.open({ ...controller.snapshot(), photos });
  signal?.throwIfAborted();
  const base = controller.serialize(),
    undo = controller.state().undo;
  const candidate = await controller.previewPhotoReconstruction(plan, { review: reviewPhotoSet, signal });
  const { rootId } = candidate.photoReconstructionReport;
  const proof = candidate.photoReconstructionReview;
  const root = candidate.project.nodes.find((node) => node.id === rootId);
  const checks = [
    check(
      'Drei registrierte Ansichten stimmen mit der Vorschau überein',
      proof.views.length === 3 && proof.views.every((view) => view.matches && view.registration === 'common-origin'),
      proof.views.map(({ view, iou, registrationOffsetMm }) => ({ view, iou, registrationOffsetMm })),
    ),
    check('Native Maße, Volumen und freier Durchgang stimmen', proof.passed && closeTo(root?.stats?.volume, 19500), {
      dimensions: proof.native.checks,
      volume: root?.stats?.volume,
      functional: proof.nativeExtras.passed,
    }),
    check(
      'Mehrbild-Vorschau erhält bestätigten Modellstand',
      controller.serialize() === base && controller.state().undo === undo,
    ),
  ];
  if (checks.every((row) => row.passed)) {
    controller.apply(candidate);
    const oneUndo = controller.state().undo === undo + 1;
    if (oneUndo) controller.undo();
    checks.push(
      check('Ein Undo stellt die Originalfotos und Geometrie wieder her', oneUndo && controller.serialize() === base),
    );
  } else controller.discard(candidate.previewId);

  // Change one photographic scale and re-register that view so the validator sees
  // an actual metric conflict, rather than just a stale photo reference.
  const inconsistent = structuredClone(photos);
  const top = inconsistent.items[2].reference;
  top.scale.mm = 32;
  const badPlan = inconsistent.reconstructions[0];
  badPlan.views[2] = photoSetViewDefault(top);
  await controller.open({ ...controller.snapshot(), photos: inconsistent });
  const analysis = analyzePhotoSet(inconsistent.items, badPlan);
  const conflictingBase = controller.serialize(),
    conflictingUndo = controller.state().undo;
  let rejectionCode;
  try {
    const wrong = await controller.previewPhotoReconstruction(badPlan, { review: reviewPhotoSet, signal });
    controller.discard(wrong.previewId);
  } catch (error) {
    if (error.code !== 'PHOTO_SET_INCOMPLETE') throw error;
    rejectionCode = error.code;
  }
  checks.push(
    check(
      'Widersprüchlicher Maßstab blockiert die Mehrbild-Vorschau',
      rejectionCode === 'PHOTO_SET_INCOMPLETE' &&
        analysis.issues.some((issue) => issue.code === 'AXIS_CONFLICT') &&
        controller.serialize() === conflictingBase &&
        controller.state().undo === conflictingUndo,
      {
        code: rejectionCode,
        issues: analysis.issues.map((issue) => issue.code),
      },
    ),
  );
  return { checks };
}

export async function runPhotoDevelopmentCheck(id, { createController, generate, signal }) {
  signal?.throwIfAborted();
  const controller = createController();
  const cancel = () => controller.cancel();
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    switch (id) {
      case 'photo-calibrated':
        return await calibratedPlate(controller, { generate, signal, tilted: false });
      case 'photo-missing-scale':
        return await missingScale(controller, { generate, signal });
      case 'photo-perspective':
        return await calibratedPlate(controller, { generate, signal, tilted: true });
      case 'photo-multiview':
        return await multiview(controller, { signal });
      default:
        throw Error('Unbekannte Foto-Prüfung.');
    }
  } finally {
    signal?.removeEventListener('abort', cancel);
    controller.dispose();
  }
}
