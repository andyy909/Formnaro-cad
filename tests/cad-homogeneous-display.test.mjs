import assert from 'node:assert/strict';
import test from 'node:test';
import { cadIdentity } from '../src/cad-affine.js';
import { loadCadKernel } from '../src/cad-kernel-loader.js';
import { paintPartFaces } from '../src/cad-part-properties.js';
import { createCadProject } from '../src/cad-project.js';
import { createCadService } from '../src/cad-service.js';
import { importCadStep } from '../src/cad-step-io.js';

const oc = await loadCadKernel({ print: () => {}, printErr: () => {} });

test('Uniform source colors mesh the finished local solid and preserve root styling and production regions', async () => {
  const service = createCadService({ oc });
  const style = { color: '#227799', opacity: 0.65 };
  const quality = { deflection: 0.02, angleDegrees: 8 };
  try {
    const recipe = { type: 'box', size: [10, 10, 10] };
    const left = service.nativeNode(recipe, { id: 'left', name: 'Left block', ...style });
    const right = service.nativeNode(recipe, { id: 'right', name: 'Right block' });
    const suppressed = service.nativeNode(recipe, { id: 'suppressed', suppressed: true, color: '#0000ff' });
    const hole = service.nativeNode(
      { type: 'cylinder', size: [4, 4, 14] },
      { id: 'hole', solid: false, color: '#ff0000' },
    );
    right.transform[12] = 6;
    const nested = {
      id: 'nested',
      kind: 'cad',
      source: 'group',
      name: 'Nested material',
      ...style,
      solid: true,
      multicolor: true,
      transform: cadIdentity(),
      operation: 'union',
      children: [left, right],
      brep: left.brep,
      stats: left.stats,
    };
    const root = { ...nested, id: 'root', name: 'Bored block', children: [nested, hole, suppressed] };
    const project = await service.rebuild(createCadProject({ nodes: [root] }));

    const step = service.exportStep(project);
    const stepText = new TextDecoder().decode(step);
    assert.match(stepText, /Left block/);
    assert.match(stepText, /Right block/);
    const roundtrip = importCadStep(oc, step);
    assert.equal(roundtrip.stats.solids, 2);
    assert.ok(Math.abs(roundtrip.stats.volume - project.nodes[0].stats.volume) < 1e-6);

    const node = project.nodes[0];
    node.transform = [1.4, 0, 0, 0, 0.25, 0.8, 0, 0, 0, 0, 1.1, 0, 10, -7, 3, 1];
    const before = structuredClone(project);
    const coldTimings = {};
    const colored = service.display(project, quality, { colored: true, timings: coldTimings });
    assert.equal(coldTimings.colorPartitionMs, undefined);
    assert.ok(coldTimings.tessellationMs >= 0);
    const [plain] = service.display(project, quality);
    assert.deepEqual(colored, [{ ...plain, rootId: node.id, name: node.name, ...style }]);
    assert.ok(plain.mesh.faceGroups.length > 0);
    assert.deepEqual(project, before);

    node.transform = [0, -1.4, 0, 0, 0.8, -0.25, 0, 0, 0, 0, 1.1, 0, 17, 9, -5, 1];
    node.name = 'Renamed bored block';
    const warmTimings = {};
    assert.deepEqual(service.display(project, quality, { colored: true, timings: warmTimings }), [
      { ...colored[0], transform: node.transform, name: node.name },
    ]);
    assert.equal(warmTimings.colorPartitionMs, undefined);
    assert.equal(warmTimings.brepReadMs, undefined);
    assert.equal(warmTimings.tessellationMs, undefined);

    // A leaf without its own style inherits the nested group's opacity.
    node.transform = cadIdentity();
    node.children[0].opacity = 0.4;
    const partitionTimings = {};
    const partitioned = service.display(project, quality, { colored: true, timings: partitionTimings });
    assert.ok(partitionTimings.colorPartitionMs >= 0);
    assert.deepEqual(
      partitioned.map(({ name, color, opacity }) => [name, color, opacity]),
      [
        ['Left block', style.color, style.opacity],
        ['Right block', style.color, 0.4],
      ],
    );

    node.multicolor = false;
    const faceIndex = plain.mesh.faceGroups[2];
    node.metadata = paintPartFaces(node, { name: 'Painted face', color: '#ee7722', faceIds: [faceIndex] }).metadata;
    const [painted] = service.display(project, quality, { colored: true });
    assert.deepEqual(painted.faceColors, [
      { faceIndex, color: '#ee7722', opacity: style.opacity, name: 'Painted face' },
    ]);
  } finally {
    service.dispose();
  }
});

test('A plain boolean group with one material renders its finished solid even when the root fallback differs', async () => {
  const service = createCadService({ oc });
  const quality = { deflection: 0.02, angleDegrees: 8 };
  const color = '#526675';
  try {
    const recipe = { type: 'box', size: [10, 10, 10] };
    const first = service.nativeNode(recipe, { id: 'first', name: 'First source', color });
    const second = service.nativeNode(recipe, { id: 'second', name: 'Second source', color });
    const hole = service.nativeNode({ type: 'cylinder', size: [4, 4, 14] }, { id: 'hole', solid: false, color: '#ff0000' });
    second.transform[12] = 6;
    const project = await service.rebuild(createCadProject({
      nodes: [{
        id: 'group',
        kind: 'cad',
        source: 'group',
        name: 'Finished group',
        color: '#4321e8',
        solid: true,
        multicolor: true,
        transform: cadIdentity(),
        operation: 'union',
        children: [first, second, hole],
        brep: first.brep,
        stats: first.stats,
      }],
    }));
    const before = structuredClone(project);
    const timings = {};
    const [plain] = service.display(project, quality);
    const styled = service.display(project, quality, { colored: true, timings });
    assert.equal(timings.colorPartitionMs, undefined);
    assert.deepEqual(styled, [{ ...plain, rootId: 'group', name: 'Finished group', color, opacity: 1 }]);
    assert.deepEqual(project, before);

    const step = service.exportStep(project);
    const stepText = new TextDecoder().decode(step);
    assert.match(stepText, /First source/);
    assert.match(stepText, /Second source/);
    const roundtrip = importCadStep(oc, step);
    assert.ok(Math.abs(roundtrip.stats.volume - project.nodes[0].stats.volume) < 1e-6);
  } finally {
    service.dispose();
  }
});
