import { runCadAIRequest } from './cad-ai-request.js';
import { createCadAutomationAccess } from './cad-automation-access.js';
import { cadBytesDigest, cadSourceGeometryDigest } from './cad-geometry-digest.js';
import { photoEvidence } from './cad-photo-data.js';
import { analyzePhotoSet, photoSetDigest, photoSetViewDefault } from './cad-photo-multiview-data.js';
import { reviewPhotoSet, reviewStoredPhotoSet } from './cad-photo-multiview-review.js';
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

async function runPhotoRequest(controller, { prompt, photo, photos = [photo], useReference, generate, signal, showReference }) {
  signal?.throwIfAborted();
  showReference?.({ photos });
  const scene = await controller.describe();
  const access = createCadAutomationAccess({ controller, getScene: () => scene });
  const images = photos.map((item) => ({
    ...item.image, name: photos.length === 1 ? 'Synthetisches-Pruefbild.png' : item.reference.view + '.png',
  }));
  const corrections = [];
  const outcome = await runCadAIRequest({
    input: { prompt, images, ...(useReference ? { photoReferences: photos.map((item) => item.reference) } : {}) },
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

async function calibratedPlate(controller, { tilted, generate, signal, showReference }) {
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
    signal, showReference,
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

async function missingScale(controller, { generate, signal, showReference }) {
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
    showReference,
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

async function multiview(controller, { signal, showReference }) {
  const photos = threeViews(),
    plan = photos.reconstructions[0];
  showReference?.({ photos: photos.items });
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

async function modelFromThreeViews(controller, { generate, signal, showReference }) {
  const photos = threeViews();
  const plan = photos.reconstructions[0];
  await controller.open({ ...controller.snapshot(), photos });
  const before = controller.serialize();
  const prompt = 'Baue den Halter aus diesen drei zueinander gehörenden orthogonalen Ansichten nach. ' +
    'Bild 1 zeigt vorne (X/Z), Bild 2 rechts (Y/Z), Bild 3 oben (X/Y). ' +
    'Der Maßstab beträgt in allen Bildern 10 Pixel/mm. Die linke vordere Unterkante des Körpers liegt bei (70, 0, 5) mm. ' +
    'Das erkennbare Fenster in der Vorderansicht geht vollständig durch. Erzeuge einen nativen Volumenkörper.';
  const reference = async () => ({
    revision: controller.revision(),
    commands: [
      { op: 'create', type: 'box', size: [40, 20, 20], pos: [90, 10, 15], as: 'base' },
      { op: 'create', type: 'box', size: [20, 20, 10], pos: [80, 10, 30], as: 'step' },
      { op: 'create', type: 'box', size: [5, 24, 5], pos: [77.5, 10, 12.5], solid: false, as: 'window' },
      { op: 'group', targets: ['$base', '$step', '$window'], as: 'holder' },
    ],
  });
  const { access, outcome } = await runPhotoRequest(controller, {
    prompt, photos: photos.items, useReference: false, generate: generate ?? reference, signal, showReference,
  });
  const checks = [check('Vorschau lässt die drei Originalansichten unverändert', controller.serialize() === before)];
  if (!outcome.proposal) {
    checks.push(check('Native Modellvorschau aus den drei Ansichten vorhanden', false));
    return { checks };
  }
  await access.apply({ previewId: outcome.proposal.previewId, revision: outcome.proposal.revision });
  const [body, ...others] = controller.snapshot().nodes;
  const single = !others.length && body?.kind === 'cad' && body.stats?.solids === 1;
  checks.push(check('Ein nativer Volumenkörper mit richtigem Restvolumen', single && closeTo(body.stats.volume, 19500, 0.05),
    body?.stats?.volume));
  if (single) {
    const link = { rootId: body.id, sourceDigest: cadSourceGeometryDigest(body), planDigest: photoSetDigest(plan) };
    const result = await reviewStoredPhotoSet(controller, { ...plan, result: link }, { signal });
    const review = result.photoReconstructionReview;
    checks.push(
      check('Alle drei Projektionen stimmen mit den registrierten Fotos überein',
        review.views.length === 3 && review.views.every((view) => view.matches),
        review.views.map(({ view, iou }) => ({ view, iou }))),
      check('Native Außenmaße und freies Fenster stimmen', review.native.passed && review.nativeExtras.passed),
    );
  }
  controller.undo();
  checks.push(check('Undo stellt das Projekt mit allen drei Fotos wieder her', controller.serialize() === before));
  return { checks, input: { prompts: [prompt] } };
}

async function multipleOpenings(controller, { count, generate, signal, photoVariant = 0, showReference }) {
  const span = count * 20,
    scale = 480 / span;
  // Dense plates keep enough pixels inside each opening after rasterization.
  const plateHeight = count >= 12 ? 28 : 20;
  const holeWidth = count >= 12 ? 12 : 10;
  const holeHeight = count >= 12 ? 14 : 8;
  const halfWidth = holeWidth / 2;
  const halfHeight = holeHeight / 2;
  const pixel = ([x, z]) => [60 + x * scale, 200 - z * scale];
  const rect = (x, z, w, h) =>
    [
      [x, z],
      [x + w, z],
      [x + w, z + h],
      [x, z + h],
    ].map(pixel);
  const coords = Array.from({ length: count }, (_, i) => ({
    x: 10 + i * 20 + (photoVariant ? ((i * (photoVariant + 5) + photoVariant) % 7) - 3 : 0),
    z: photoVariant ? ((i * 3 + photoVariant) % 9) - 4 : i % 2 ? 2 : -2,
  }));
  const photo = syntheticPhoto({
    name: 'Kalibrierte Fensterreihe',
    view: 'front',
    outline: rect(0, -plateHeight / 2, span, plateHeight),
    holes: coords.map((p) => rect(p.x - halfWidth, p.z - halfHeight, holeWidth, holeHeight)),
    scale: {
      points: [pixel([0, 0]), pixel([span, 0])],
      mm: span,
      note: 'Bekannte Breite der synthetischen Prüfplatte',
      referenceErrorMm: 0.01,
      pickErrorPx: 0.5,
      source: 'user',
    },
    dimensions: [
      { name: 'Breite', source: 'measured', points: [pixel([0, 0]), pixel([span, 0])] },
      { name: 'Tiefe', source: 'user', mm: 4, note: 'Vorgegebene Dicke der Prüfplatte' },
    ],
  });
  const prompt =
    'Baue die Platte aus dieser kalibrierten Frontansicht mit allen sichtbaren Durchbrüchen nach. Die Tiefe beträgt 4 mm.';
  const replay = async () => ({
    revision: controller.revision(),
    commands: [
      { op: 'create', type: 'box', size: [span, 4, plateHeight], pos: [span / 2, 0, plateHeight / 2], as: 'base' },
      ...coords.map((p, i) => ({
        op: 'create',
        type: 'box',
        size: [holeWidth, 8, holeHeight],
        pos: [p.x, 0, plateHeight / 2 + p.z],
        solid: false,
        as: 'hole' + i,
      })),
      { op: 'group', targets: ['$base', ...coords.map((_, i) => '$hole' + i)] },
    ],
  });
  const { access, outcome } = await runPhotoRequest(controller, {
    prompt,
    photo,
    useReference: true,
    generate: generate ?? replay,
    signal, showReference,
  });
  const proposal = outcome.proposal,
    review = proposal?.photoComparison?.[0],
    checks = [
      check(
        count >= 12 ? 'Rasterkontur und Anzahl der markierten Öffnungen' : 'Alle Öffnungen im Bildvergleich',
        review?.openings?.length === count &&
          // With dense openings, raster edge rounding can exceed 5% even on the exact solid.
          // The per-opening native measurements below decide whether each opening is clear.
          (count >= 12 ? review.iou >= 0.9 : review.matches && review.openings.every((h) => h.blockedFraction <= 0.05)),
        { openings: review?.openings?.length ?? 0, iou: review?.iou, blocked: review?.openings?.map((h) => h.blockedFraction) },
      ),
    ];
  if (!proposal || !checks[0].passed) return { checks };
  await access.apply({ previewId: proposal.previewId, revision: proposal.revision });
  const nodes = controller.snapshot().nodes,
    body = nodes[0],
    bounds = body?.stats?.bounds;
  const size = bounds?.max.map((v, i) => v - bounds.min[i]);
  checks.push(
    check(
      'Maße und Materialvolumen',
      nodes.length === 1 &&
        body?.stats?.solids === 1 &&
        [span, 4, plateHeight].every((x, i) => closeTo(size?.[i], x, 0.15)) &&
        closeTo(body.stats.volume, (span * plateHeight - count * holeWidth * holeHeight) * 4, 1),
    ),
  );
  if (!checks.at(-1).passed) return { checks };
  for (const [i, p] of coords.entries()) {
    let passed = true;
    for (const [dx, dz, open] of [
      [0, 0, true],
      [-halfWidth + 0.2, 0, true],
      [halfWidth - 0.2, 0, true],
      [0, -halfHeight + 0.2, true],
      [0, halfHeight - 0.2, true],
      [-halfWidth - 0.2, 0, false],
      [halfWidth + 0.2, 0, false],
      [0, -halfHeight - 0.2, false],
      [0, halfHeight + 0.2, false],
    ]) {
      const hit = await controller.query(
        'rayPick',
        {
          ids: [body.id],
          ray: {
            origin: [bounds.min[0] + p.x + dx, bounds.min[1] - 2, bounds.min[2] + plateHeight / 2 + p.z + dz],
            direction: [0, 1, 0],
            far: 12,
          },
        },
        { signal },
      );
      if ((hit === null) !== open) passed = false;
    }
    checks.push(check('Lage und Rand des Fensters ' + (i + 1), passed));
  }
  return { checks, input: { prompt, count } };
}

export async function runPhotoDevelopmentCheck(id, { createController, generate, signal, photoVariant, showReference }) {
  signal?.throwIfAborted();
  const controller = createController();
  const cancel = () => controller.cancel();
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    const match = /^photo-openings-([0-9]+)$/.exec(id);
    if (match && +match[1] >= 2 && +match[1] <= 16)
      return await multipleOpenings(controller, { count: +match[1], generate, signal, photoVariant, showReference });
    switch (id) {
      case 'photo-calibrated':
        return await calibratedPlate(controller, { generate, signal, tilted: false, showReference });
      case 'photo-missing-scale':
        return await missingScale(controller, { generate, signal, showReference });
      case 'photo-perspective':
        return await calibratedPlate(controller, { generate, signal, tilted: true, showReference });
      case 'photo-multiview':
        return await multiview(controller, { signal, showReference });
      case 'photo-multiview-live':
        return await modelFromThreeViews(controller, { generate, signal, showReference });
      default:
        throw Error('Unbekannte Foto-Prüfung.');
    }
  } finally {
    signal?.removeEventListener('abort', cancel);
    controller.dispose();
  }
}
