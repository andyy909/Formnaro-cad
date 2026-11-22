import { showLabProject, showLabProposal } from './cad-lab-preview-assets.js';
import settings from '../ai/lab-plate-frontier.json' with { type: 'json' };
import { plateTask } from './cad-lab-plate-task.js';
import { createCadAutomationAccess } from './cad-automation-access.js';
import { runCadAIRequest } from './cad-ai-request.js';

export { plateTask } from './cad-lab-plate-task.js';

function referenceCommands(task, phase, root) {
  const { width, length, extension, axes, changed } = task;
  if (phase === 0)
    return [
      { op: 'create', type: 'box', name: 'Rohling', size: [length, width, 6], pos: [length / 2, 0, 3], as: 'base' },
      ...axes(length).map((x, i) => ({
        op: 'create',
        type: 'cylinder',
        name: 'Loch ' + i,
        solid: false,
        size: [6, 6, 8],
        pos: [x, 0, 3],
        as: 'hole' + i,
      })),
      { op: 'group', targets: ['$base', ...axes(length).map((_, i) => '$hole' + i)], name: 'Platte' },
    ];
  const target = (name) => ({ rootId: root.id, path: [root.children.find((n) => n.name === name).id] });
  const shift = (name, dx) => ({ op: 'transform', target: target(name), translate: [dx, 0, 0], space: 'world' });
  const resize = (name, size) => ({ op: 'update', target: target(name), set: { size, sizeAnchor: 'center' } });
  const old = axes(length);
  if (phase === 1)
    return [
      resize('Rohling', [length + extension, width, 6]),
      shift('Rohling', extension / 2),
      ...axes(length + extension).flatMap((x, i) => (i ? [shift('Loch ' + i, x - old[i])] : [])),
    ];
  return old.flatMap((_, i) => (changed(i) ? [resize('Loch ' + i, [8, 8, 8])] : []));
}

export async function measurePlate(cad, task, phase, checks, label) {
  const nodes = cad.snapshot().nodes;
  const add = (name, passed, actual) => checks.push({ label: label + ' · ' + name, passed, actual });
  add('ein Bauteil', nodes.length === 1 && nodes[0].stats?.solids === 1, nodes.length);
  if (!checks.at(-1).passed) return false;
  const target = nodes[0].id;
  const span = task.length + (phase ? task.extension : 0);
  const bores = task.axes(span).map((x, i) => ({
    kind: 'bore',
    target,
    from: [x, 0, 0],
    to: [x, 0, 6],
    diameter: phase === 2 && task.changed(i) ? 8 : 6,
    minWall: 1,
  }));
  const volume = 6 * (span * task.width - bores.reduce((a, b) => a + Math.PI * (b.diameter / 2) ** 2, 0));
  const requests = [
    { kind: 'bounds', target, edge: 'min', expected: [0, -task.width / 2, 0] },
    { kind: 'bounds', target, edge: 'max', expected: [span, task.width / 2, 6] },
    { kind: 'volume', target, expected: volume, tolerance: 0.05 },
    ...bores,
  ];
  for (const check of requests) {
    try {
      await cad.query('aiResultChecks', { checks: [check], aliases: {} });
    } catch (e) {
      if (e.code !== 'AI_RESULT_MISMATCH') throw e;
      add(check.kind, false, {
        expected: check.expected ?? { from: check.from, to: check.to, diameter: check.diameter },
        measured: e.feedback?.actual,
      });
      return false;
    }
  }
  add('Außenmaße, Volumen und alle Durchgänge nativ gemessen', true, {
    length: span,
    width: task.width,
    holes: bores.length,
  });
  return true;
}

export async function runPlateLevel(test, { createController, signal, generate, showReference }) {
  const task = plateTask(test.level, test.repeat);
  const finalSpan = task.length + task.extension;
  showReference?.({
    size: [finalSpan, task.width, 6], from: [0, -task.width / 2, 0],
    bores: task.axes(finalSpan).map((x, i) => ({
      from: [x, 0, 0], to: [x, 0, 6], diameter: task.changed(i) ? 8 : 6,
    })),
  });
  const cad = createController(),
    checks = [],
    input = {
      version: settings.version,
      context: settings.context,
      level: test.level,
      repeat: test.repeat,
      prompts: task.prompts,
    };
  let opened, beforeEdit;
  const cancel = () => {
    cad.cancel();
    opened?.cancel();
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    if (test.level === 1 && showReference) {
      const commands = referenceCommands({ ...task, length: finalSpan }, 0).map((command) => {
        const index = command.as?.startsWith('hole') ? Number(command.as.slice(4)) : -1;
        return index >= 0 && task.changed(index) ? { ...command, size: [8, 8, 8] } : command;
      });
      await showLabProposal({ signal, showReference }, cad, () => cad.preview({ kind: 'batch', commands }));
    }
    input.steps = [];
    for (const [phase, prompt] of task.prompts.entries()) {
      const started = performance.now();
      const step = { name: ['Erstellen', 'Verlängern', 'Bohrungsänderung'][phase] };
      input.steps.push(step);
      try {
        signal.throwIfAborted();
        const scene = await cad.describe(),
          root = cad.snapshot().nodes[0];
        const selection = root ? [{ rootId: root.id, path: [] }] : [];
        const access = createCadAutomationAccess({
          controller: cad,
          getScene: () => scene,
          getSelection: () => selection,
        });
        if (phase === 2) beforeEdit = cad.serialize();
        const { proposal } = await runCadAIRequest({
          input: { prompt: settings.context ? settings.context + '\n' + prompt : prompt, modelChecks: false },
          access,
          isCurrent: () => !signal.aborted,
          visualReview: false,
          maxCorrections: 1,
          generate:
            generate ?? (async () => ({ revision: scene.revision, commands: referenceCommands(task, phase, root) })),
        });
        if (!proposal) {
          checks.push({ label: prompt + ' · keine Modellvorschau', passed: false });
          break;
        }
        cad.apply(proposal);
        await showLabProject({ signal, showReference }, cad, { role: 'result' });
        if (!(await measurePlate(cad, task, phase, checks, ['Erstellen', 'Verlängern', 'Bohrungsänderung'][phase])))
          break;
        if (phase === 2) {
          const saved = cad.serialize();
          opened = createController();
          await opened.open(saved);
          await measurePlate(opened, task, 2, checks, 'Wiederöffnen der serialisierten Projektdatei');
          checks.push({
            label: 'Projekt einschließlich Quellen nach Wiederöffnen identisch',
            passed: opened.serialize() === saved,
          });
          cad.undo();
          checks.push({
            label: 'Undo stellt vorherige Platte einschließlich Quellen wieder her',
            passed: cad.serialize() === beforeEdit,
          });
        }
      } finally {
        step.elapsedMs = Math.round(performance.now() - started);
      }
    }
    return { checks, input };
  } finally {
    signal.removeEventListener('abort', cancel);
    opened?.dispose();
    cad.dispose();
  }
}
