import { showLabProject } from './cad-lab-preview-assets.js';
import { createCadAutomationAccess } from './cad-automation-access.js';
import { runCadAIRequest } from './cad-ai-request.js';

const width = 12;
const depth = 18;
const height = 6;
const near = (a, b, tolerance = 1e-5) => Number.isFinite(a) && Math.abs(a - b) <= tolerance;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function segmentCommands(segment, i) {
  return [
    { op: 'create', type: 'box', size: [width, depth, height], pos: [segment.x, 0, height / 2], as: 'base' + i },
    {
      op: 'create',
      type: 'cylinder',
      size: [segment.diameter, segment.diameter, height + 2],
      pos: [segment.x, segment.y, height / 2],
      solid: false,
      as: 'bore' + i,
    },
    { op: 'group', targets: ['$base' + i, '$bore' + i], name: 'Segment ' + (i + 1), as: 'segment' + i },
  ];
}

async function measureBores(cad, preview, body, segments) {
  const measured = [];
  // The preview API accepts at most 32 measurements at once.
  for (let offset = 0; offset < segments.length; offset += 16) {
    const request = segments.slice(offset, offset + 16).map(({ x, y, diameter }) => ({
      kind: 'bore',
      target: body.id,
      from: [x, y, 0],
      to: [x, y, height],
      diameter,
      minWall: 1,
    }));
    const { checks } = await cad.checkPreview(preview.previewId, request, { collectFailures: true });
    measured.push(...checks.map((result) => result.passed !== false));
  }
  return measured;
}

function sourcePath(root, id) {
  if (root.id === id) return [];
  for (const child of root.children ?? []) {
    const path = sourcePath(child, id);
    if (path) return [child.id, ...path];
  }
  return null;
}

function unionPlan(segmentIds, prefix) {
  const commands = [],
    levels = [];
  let ids = segmentIds;
  let leafSets = ids.map((id) => [id]);
  while (ids.length > 1) {
    const next = [],
      nextLeaves = [];
    for (let index = 0; index < ids.length; index += 4) {
      const alias = prefix + 'group' + commands.length;
      const leaves = leafSets.slice(index, index + 4).flat();
      commands.push({
        op: 'group',
        targets: ids.slice(index, index + 4),
        as: alias,
        name: 'Verbund ' + (commands.length + 1),
      });
      next.push('$' + alias);
      nextLeaves.push(leaves);
      levels.push(leaves.slice().sort().join(','));
    }
    ids = next;
    leafSets = nextLeaves;
  }
  return { commands, levels: levels.sort() };
}

function actualLevels(body, segmentIds) {
  const levels = [];
  function visit(node) {
    if (segmentIds.has(node.id)) return [node.id];
    const leaves = (node.children ?? []).flatMap(visit);
    if (leaves.length > 1) levels.push(leaves.slice().sort().join(','));
    return leaves;
  }
  visit(body);
  return levels.sort();
}

async function modelProposal(cad, { scene, selection, prompt, commands, generate, signal }) {
  const access = createCadAutomationAccess({ controller: cad, getScene: () => scene, getSelection: () => selection });
  const { proposal } = await runCadAIRequest({
    input: { prompt, modelChecks: false },
    access: { ...access, sceneForAI: () => access.sceneForAI('selection') },
    generate: generate ?? (async () => ({ revision: scene.revision, commands })),
    isCurrent: () => !signal.aborted,
    visualReview: false,
    maxCorrections: 1,
  });
  return proposal;
}

const followupPrompt =
  'Ändere nur die folgenden Bohrungsquellen in den sechs fertig verbundenen Leisten. In den Leisten bei Y=0, 52 und 104 die erste Bohrung von links auf Ø5 mm setzen. In den Leisten bei Y=26, 78 und 130 die letzte Bohrung von links auf Ø5 mm setzen. In jeder Leiste außerdem die sechste Bohrung von links auf Ø7 mm und die elfte auf Ø3 mm setzen. Die Reihenfolge richtet sich nach Welt-X, die Bohrungsachsen liegen bis zu 2 mm neben der Leistenmitte in Y. Alle 18 Änderungen am vorhandenen Quellzylinder durchführen. Positionen, übrige Bohrungen, Leisten, Gruppenstruktur und das Schutzteil erhalten.';

async function editSelectedBores(cad, { rows, bodies, paths, guard, generate, signal, add }) {
  const expected = rows.map((row, i) => {
    const requested = new Map([
      [i % 2 ? row.segmentData.length - 1 : 0, 5],
      [5, 7],
      [10, 3],
    ]);
    return row.segmentData.map((segment, j) => ({ ...segment, diameter: requested.get(j) ?? segment.diameter }));
  });
  const targets = paths.map((path, i) => ({ rootId: bodies[Math.floor(i / rows[0].segmentData.length)].id, path }));
  const commands = expected.flatMap((row, i) =>
    row.flatMap((segment, j) =>
      segment.diameter === rows[i].segmentData[j].diameter
        ? []
        : [
            {
              op: 'update',
              target: targets[i * row.length + j],
              set: { size: [segment.diameter, segment.diameter, height + 2], sizeAnchor: 'center' },
            },
          ],
    ),
  );
  const before = cad.serialize();
  const scene = await cad.describe();
  const proposal = await modelProposal(cad, {
    scene,
    selection: targets,
    prompt: followupPrompt,
    commands,
    generate,
    signal,
  });
  add(
    'Nachbearbeitung berechnet eine eigene Vorschau und erhält den Verbund bis Apply',
    !!proposal && cad.serialize() === before,
  );
  if (!proposal) return;

  const nodes = cad.getPreview(proposal.previewId).project.nodes;
  const edited = bodies.map((body) => nodes.find((node) => node.id === body.id));
  const preserved =
    edited.every(Boolean) &&
    nodes.length === bodies.length + 1 &&
    same(
      nodes.find((node) => node.id === guard.id),
      guard,
    ) &&
    edited.every(
      (body, i) => body.stats.solids === 1 && same(actualLevels(body, new Set(rows[i].ids)), rows[i].levels),
    );
  add('Alle Leisten, Untergruppen und das Schutzteil bleiben erhalten', preserved);
  if (!preserved) return;
  const measured = [];
  for (const [i, body] of edited.entries()) measured.push(...(await measureBores(cad, proposal, body, expected[i])));
  add(
    '18 geänderte und 78 unveränderte Bohrungen entsprechen nativ dem Folgeauftrag',
    measured.length === 96 && measured.every(Boolean),
    {
      passed: measured.filter(Boolean).length,
      expected: measured.length,
    },
  );
  cad.apply(proposal);
  cad.undo();
  add('Undo der Nachbearbeitung stellt alle sechs Leisten wieder her', cad.serialize() === before);
}

export async function runMergeBenchmark(test, { createController, signal, generate, showReference }) {
  const count = test.parts;
  const rails = test.rails ?? 1;
  const perRail = count / rails;
  const segments = Array.from({ length: count }, (_, i) => {
    const railY = 26 * Math.floor(i / perRail);
    return {
      x: width * ((i % perRail) - (perRail - 1) / 2),
      railY,
      y: railY + (i % 2 ? 2 : -2),
      diameter: i % 2 ? 6 : 4,
    };
  });
  const cad = createController();
  const abort = () => cad.cancel();
  signal.addEventListener('abort', abort, { once: true });
  try {
    const templates = segments.slice(0, 2);
    const { aliases } = await cad.execute(
      {
        kind: 'batch',
        commands: [
          ...templates.flatMap(segmentCommands),
          {
            op: 'create',
            type: 'box',
            size: [5, 6, 7],
            pos: [(width * count) / 2 + 18, 0, 4],
            name: 'Schutzteil',
            as: 'guard',
          },
        ],
      },
      { signal },
    );
    const project = cad.snapshot();
    const guard = project.nodes.find((node) => node.id === aliases.guard);
    const templateNodes = templates.map((_, i) => project.nodes.find((node) => node.id === aliases['segment' + i]));
    const boreIds = [];
    // Reuse the two measured segment solids. Fresh IDs and placements keep
    // instances independently editable when the benchmark combines them.
    const copies = segments.map((segment, i) => {
      const index = i % 2;
      const node = structuredClone(templateNodes[index]);
      node.id = crypto.randomUUID();
      node.name = 'Segment ' + (i + 1);
      node.transform[12] += segment.x - templates[index].x;
      node.transform[13] += segment.railY;
      for (const source of node.children) {
        source.id = crypto.randomUUID();
        if (!source.solid) boreIds.push(source.id);
      }
      return node;
    });
    const segmentIds = copies.map((node) => node.id);
    const ordered = test.interleave
      ? copies
          .map((node, index) => ({ node, index }))
          .sort((a, b) => (a.index % perRail) - (b.index % perRail) || b.index - a.index)
          .map(({ node }) => node)
      : copies;
    await cad.open(JSON.stringify({ ...project, nodes: [...ordered, guard] }));
    await showLabProject({ signal, showReference }, cad, { role: 'start' });
    const original = cad.serialize();
    const scene = await cad.describe();
    const rows = Array.from({ length: rails }, (_, i) => {
      const offset = i * perRail;
      const ids = segmentIds.slice(offset, offset + perRail);
      return {
        ids,
        segmentData: segments.slice(offset, offset + perRail),
        boreIds: boreIds.slice(offset, offset + perRail),
        ...unionPlan(ids, 'rail' + i),
      };
    });
    const prompt =
      rails > 1
        ? 'Aus den ' +
          count +
          ' ausgewählten vorgebohrten Segmenten sollen genau ' +
          rails +
          ' getrennte Leisten entstehen. Verbinde nur die ' +
          perRail +
          ' Segmente derselben Y-Reihe miteinander. Nutze ihre Weltpositionen. Bilde in jeder Reihe zuerst Vierergruppen aus den von links nach rechts benachbarten Segmenten. Verbinde anschließend diese Vierergruppen zu einer Leiste mit erhaltenen Untergruppen. Jede Bohrung bleibt offen und als Quelle editierbar. Das Schutzteil unverändert lassen.'
        : 'Vereinige alle ' +
          count +
          ' ausgewählten vorgebohrten Segmente zu einem einzigen nativen Volumenkörper. Jede Bohrung muss durchgehend bleiben und als bearbeitbare Quelle erhalten bleiben. Das Schutzteil bleibt unverändert.' +
          (count > 4
            ? ' Bilde zuerst Gruppen aus jeweils vier aufeinanderfolgenden Segmentnummern (1–4, 5–8, usw.). Fasse dann jeweils bis zu vier benachbarte Gruppen auf dieselbe Weise zusammen, bis ein einziger Verbund übrig ist. Die Untergruppen müssen erhalten bleiben.'
            : '');
    const proposal = await modelProposal(cad, {
      scene,
      selection: segmentIds.map((rootId) => ({ rootId, path: [] })),
      prompt,
      commands: rows.flatMap((row) => row.commands),
      generate,
      signal,
    });
    const checks = [];
    const add = (label, passed, actual) =>
      checks.push({ label, passed: !!passed, ...(actual === undefined ? {} : { actual }) });
    add('Vorschau erhält Ausgangsprojekt und alle Quellen', cad.serialize() === original);
    add('Vorschau für die Vereinigung erstellt', !!proposal);
    const input = { parts: count, rails, prompt, ...(test.followup ? { followupPrompt } : {}) };
    if (!proposal) return { checks, input };

    const nodes = cad.getPreview(proposal.previewId).project.nodes;
    const merged = nodes.filter((node) => node.id !== guard.id);
    const bodies = rows.map((row) => merged.find((node) => sourcePath(node, row.ids[0])?.length));
    const assigned = merged.length === rails && bodies.every(Boolean) && new Set(bodies).size === rails;
    const volume = (data) =>
      data.reduce((sum, { diameter }) => sum + height * (width * depth - Math.PI * (diameter / 2) ** 2), 0);
    add(
      rails === 1 ? 'Genau ein Volumenkörper mit Sollvolumen' : 'Genau ' + rails + ' getrennte Leisten mit Sollvolumen',
      assigned &&
        bodies.every((node, i) => node.stats.solids === 1 && near(node.stats.volume, volume(rows[i].segmentData))),
      { expectedBodies: rails, actualBodies: merged.length, volumes: merged.map((node) => node.stats.volume) },
    );
    add(
      'Schutzteil unverändert',
      same(
        nodes.find((node) => node.id === guard.id),
        guard,
      ),
    );
    if (!assigned) return { checks, input };

    add(
      'Vorgegebene Untergruppen in der Quellenhierarchie erhalten',
      rows.every((row, i) => same(actualLevels(bodies[i], new Set(row.ids)), row.levels)),
    );
    const measured = [];
    const paths = [];
    for (const [i, row] of rows.entries()) {
      const body = bodies[i];
      measured.push(...(await measureBores(cad, proposal, body, row.segmentData)));
      paths.push(...row.boreIds.map((id) => sourcePath(body, id)));
    }
    add(
      'Alle Bohrungen nativ an ihrem ursprünglichen Ort offen',
      measured.length === count && measured.every(Boolean),
      {
        passed: measured.filter(Boolean).length,
        expected: count,
      },
    );
    add(
      'Alle ursprünglichen Bohrungsquellen unter dem Verbund auffindbar',
      paths.every((path) => path?.length > 0),
      paths.filter(Boolean).length,
    );
    cad.apply(proposal);
    await showLabProject({ signal, showReference }, cad, { role: 'result' });
    const combined = cad.serialize();
    if (test.followup && checks.every((check) => check.passed)) {
      await editSelectedBores(cad, { rows, bodies, paths, guard, generate, signal, add });
    } else if (!test.followup && paths.at(-1)?.length) {
      const body = bodies.at(-1);
      const row = rows.at(-1).segmentData;
      const last = row.at(-1);
      const diameter = last.diameter - 1;
      const edited = await cad.preview(
        {
          kind: 'batch',
          commands: [
            {
              op: 'update',
              target: { rootId: body.id, path: paths.at(-1) },
              set: { size: [diameter, diameter, height + 2], sizeAnchor: 'center' },
            },
          ],
        },
        { signal },
      );
      const editedBores = await measureBores(cad, edited, body, [...row.slice(0, -1), { ...last, diameter }]);
      const editedNodes = cad.getPreview(edited.previewId).project.nodes;
      const sameOtherBodies = nodes
        .filter((node) => node.id !== body.id)
        .every((node) =>
          same(
            editedNodes.find((changed) => changed.id === node.id),
            node,
          ),
        );
      add(
        'Letzte Bohrung editierbar, alle übrigen Bohrungen unverändert',
        editedBores.length === perRail && editedBores.every(Boolean) && sameOtherBodies,
        {
          measuredInEditedBody: editedBores.filter(Boolean).length,
          updatedDiameter: diameter,
          otherBodiesUnchanged: sameOtherBodies,
        },
      );
      cad.apply(edited);
      cad.undo();
      add('Undo der Bohrungsänderung bewahrt den Verbund', cad.serialize() === combined);
    }
    cad.undo();
    add('Undo der Vereinigung stellt einzelne Segmente wieder her', cad.serialize() === original);
    return { checks, input };
  } finally {
    signal.removeEventListener('abort', abort);
    cad.dispose();
  }
}
