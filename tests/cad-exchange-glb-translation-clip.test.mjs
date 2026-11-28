import test from 'node:test';
import assert from 'node:assert/strict';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { cadGltf, encodeCadMeshes } from '../src/cad-mesh-formats.js';
import { cadGltfNodeIdentity } from '../src/cad-gltf-node-identity.js';
import { gltfToGlb } from '../src/exchange-formats.js';

const COMPONENTS = { SCALAR: 1, VEC3: 3 };

function decodeGlb(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x46546c67, 'GLB magic');
  assert.equal(view.getUint32(4, true), 2, 'GLB version');
  assert.equal(view.getUint32(8, true), bytes.byteLength, 'GLB length');
  const jsonLength = view.getUint32(12, true);
  assert.equal(view.getUint32(16, true), 0x4e4f534a, 'JSON chunk');
  assert.equal(view.getUint32(20 + jsonLength + 4, true), 0x004e4942, 'BIN chunk');
  return {
    view,
    json: JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))),
    binary: 20 + jsonLength + 8,
  };
}

function readFloatAccessorFromView(view, document, accessorIndex, binary = 0, buffers = null) {
  const accessor = document.accessors[accessorIndex],
    bufferView = document.bufferViews[accessor.bufferView];
  assert.equal(accessor.componentType, 5126);
  const components = COMPONENTS[accessor.type],
    base = buffers
      ? (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
      : binary + (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0),
    values = [];
  assert.ok(components);
  for (let i = 0; i < accessor.count * components; i++) values.push(view.getFloat32(base + i * 4, true));
  return values;
}

const readGlbAccessor = (glb, index) => readFloatAccessorFromView(glb.view, glb.json, index, glb.binary);

function readGltfJsonAccessor(document, index) {
  const bufferView = document.bufferViews[document.accessors[index].bufferView],
    bytes = Uint8Array.from(atob(document.buffers[bufferView.buffer].uri.split(',')[1]), (c) => c.charCodeAt(0));
  return readFloatAccessorFromView(new DataView(bytes.buffer), document, index, 0, bytes);
}

const plate = (x) => ({
  vertices: [x, 0, 0, x + 10, 0, 0, x + 10, 10, 0, x, 10, 0],
  triangles: [0, 1, 2, 0, 2, 3],
});

// Two parts share the display name, so only the stable part ID can select the
// moving body. The static pose of "slider-b" is centered at CAD (45, 5, 0).
const parts = [
  { id: 'slider-a', name: 'Schlitten', color: '#c13f24', opacity: 1, mesh: plate(0) },
  { id: 'slider-b', name: 'Schlitten', color: '#135ac1', opacity: 1, mesh: plate(40) },
];

// The ticket contract: times in seconds, offsets in CAD world millimetres
// relative to the static pose of the part.
const clip = {
  name: 'Schlitten',
  partId: 'slider-b',
  times: [0, 1, 2],
  offsets: [
    [0, 0, 0],
    [20, 0, 0],
    [40, 0, 0],
  ],
};

const staticDocument = () => JSON.parse(cadGltf(parts, { roundingBudget: 0.005 }));

const close = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} versus ${expected}`);

test('GLB translation clip animates only the part with the matching ID and stores absolute metres in Y-up', () => {
  const bytes = encodeCadMeshes(parts, 'glb', { roundingBudget: 0.005, translationClip: clip }),
    glb = decodeGlb(bytes),
    animation = glb.json.animations?.[0],
    base = staticDocument().nodes[1].translation;

  assert.equal(glb.json.animations.length, 1);
  assert.equal(animation.name, 'Schlitten');
  assert.equal(animation.channels.length, 1);
  assert.equal(animation.channels[0].target.node, 1);
  assert.equal(animation.channels[0].target.path, 'translation');
  assert.equal(animation.samplers[0].interpolation, 'LINEAR');

  // Track times are seconds, not milliseconds.
  const sampler = animation.samplers[0],
    times = readGlbAccessor(glb, sampler.input);
  assert.deepEqual(times, [0, 1, 2]);
  assert.deepEqual(glb.json.accessors[sampler.input].min, [0]);
  assert.deepEqual(glb.json.accessors[sampler.input].max, [2]);

  // The output contains absolute TRS translations. glTF is Y-up while the CAD
  // offset axis is Z-up, so +X stays +X in metres.
  const translations = readGlbAccessor(glb, sampler.output),
    expected = clip.offsets.map(([x, y, z]) => [base[0] + x / 1000, base[1] + z / 1000, base[2] - y / 1000]);
  assert.equal(translations.length, expected.length * 3);
  expected.forEach((value, sample) =>
    value.forEach((component, axis) =>
      close(translations[sample * 3 + axis], component, `sample ${sample} axis ${axis}`),
    ),
  );
  close(translations[0], base[0], 'first sample equals the static pose');
  close(translations[3], base[0] + 0.02, 'second sample adds 20 mm');
  close(translations[6], base[0] + 0.04, 'third sample adds 40 mm');

  // Neither the static pose of the moving node nor the equal-named idle node
  // changes; the idle node receives no channel at all.
  assert.deepEqual(glb.json.nodes[1].translation, base);
  assert.deepEqual(glb.json.nodes[0].translation, staticDocument().nodes[0].translation);
  assert.deepEqual(
    glb.json.nodes.map((node) => node.extras.formnaroPartId),
    ['slider-a', 'slider-b'],
  );
  assert.equal(
    glb.json.animations.some((item) => item.channels.some((channel) => channel.target.node === 0)),
    false,
  );
});

test('A translated part split into material groups animates every node that carries its ID', () => {
  // Native face-color splitting exports one node per material group; all of
  // them share the part ID of their logical body.
  const grouped = [
      { ...parts[1], id: 'housing', name: 'Gehäuse' },
      { ...parts[0], id: 'housing', name: 'Gehäuse' },
    ],
    staticNodes = JSON.parse(cadGltf(grouped, { roundingBudget: 0.005 })).nodes,
    document = JSON.parse(cadGltf(grouped, { roundingBudget: 0.005, translationClip: { ...clip, partId: 'housing' } })),
    animation = document.animations[0];

  assert.deepEqual(
    document.nodes.map((node) => node.extras.formnaroPartId),
    ['housing', 'housing'],
  );
  assert.deepEqual(cadGltfNodeIdentity(document).duplicatePartIds, ['housing']);
  assert.equal(animation.channels.length, 2);
  assert.deepEqual(
    animation.channels.map((channel) => channel.target.node),
    [0, 1],
  );
  animation.channels.forEach((channel, node) => {
    const values = readGltfJsonAccessor(document, animation.samplers[channel.sampler].output),
      base = staticNodes[node].translation;
    close(values[0], base[0], `node ${node} starts at its own static pose`);
    close(values[6], base[0] + 0.04, `node ${node} X after 40 mm`);
    close(values[7], base[1], `node ${node} Y unchanged`);
    close(values[8], base[2], `node ${node} Z unchanged`);
  });
});

test('CAD world axes convert to Y-up metres for every offset component', () => {
  const document = JSON.parse(
      cadGltf(parts, {
        roundingBudget: 0.005,
        translationClip: {
          name: 'Raum',
          partId: 'slider-b',
          times: [0, 1],
          offsets: [
            [0, 0, 0],
            [0, 30, 20],
          ],
        },
      }),
    ),
    base = staticDocument().nodes[1].translation,
    translations = readGltfJsonAccessor(document, document.animations[0].samplers[0].output);

  close(translations[3], base[0], 'CAD X offset');
  close(translations[4], base[1] + 0.02, 'CAD Z becomes glTF Y');
  close(translations[5], base[2] - 0.03, 'CAD Y becomes negative glTF Z');
});

test('encodeCadMeshes forwards the clip through the glTF text path as well', () => {
  const text = new TextDecoder().decode(
      encodeCadMeshes(parts, 'gltf', { roundingBudget: 0.005, translationClip: clip }),
    ),
    document = JSON.parse(text),
    glb = decodeGlb(gltfToGlb(text));

  assert.equal(document.animations.length, 1);
  assert.deepEqual(readGltfJsonAccessor(document, document.animations[0].samplers[0].input), [0, 1, 2]);
  assert.deepEqual(
    readGltfJsonAccessor(document, document.animations[0].samplers[0].output),
    readGlbAccessor(glb, glb.json.animations[0].samplers[0].output),
  );
});

test('An independent GLTF loader reads the translated track values', async () => {
  const previous = globalThis.ProgressEvent;
  globalThis.ProgressEvent = class ProgressEvent {
    constructor(type, init) {
      Object.assign(this, { type }, init);
    }
  };
  try {
    const bytes = encodeCadMeshes(parts, 'glb', { roundingBudget: 0.005, translationClip: clip }),
      result = await new GLTFLoader().parseAsync(bytes.buffer, ''),
      base = staticDocument().nodes[1].translation;

    assert.equal(result.animations.length, 1);
    assert.equal(result.animations[0].tracks.length, 1);
    const track = result.animations[0].tracks[0];
    assert.deepEqual([...track.times], [0, 1, 2]);
    assert.equal(track.values.length, 9);
    clip.offsets.forEach(([x, y, z], sample) => {
      close(track.values[sample * 3], base[0] + x / 1000, `loader sample ${sample} X`);
      close(track.values[sample * 3 + 1], base[1] + z / 1000, `loader sample ${sample} Y`);
      close(track.values[sample * 3 + 2], base[2] - y / 1000, `loader sample ${sample} Z`);
    });
    const moving = result.scene.children.find((child) => child.userData.formnaroPartId === 'slider-b');
    assert.ok(moving);
    assert.equal(moving.name.startsWith('Schlitten'), true);
  } finally {
    if (previous === undefined) delete globalThis.ProgressEvent;
    else globalThis.ProgressEvent = previous;
  }
});

test('Translation clips resolve by part ID and reject invalid or ambiguous tracks', () => {
  // A name-only track is not resolved through the display name.
  assert.throws(
    () =>
      cadGltf(parts, {
        translationClip: {
          name: 'Schlitten',
          times: [0, 1],
          offsets: [
            [0, 0, 0],
            [1, 0, 0],
          ],
        },
      }),
    /Teile-ID/,
  );
  assert.throws(() => cadGltf(parts, { translationClip: { ...clip, partId: 'fehlt' } }), /kein exportiertes Teil/);
  // The name is only a label; the ID selects the part.
  assert.throws(
    () => cadGltf([parts[0]], { translationClip: clip }),
    /kein exportiertes Teil/,
    'a clip for the removed part no longer resolves',
  );
  assert.throws(() => cadGltf(parts, { translationClip: { ...clip, times: [0] } }), /mindestens zwei/);
  assert.throws(() => cadGltf(parts, { translationClip: { ...clip, times: [0, 2, 1] } }), /aufsteigend/);
  assert.throws(() => cadGltf(parts, { translationClip: { ...clip, times: [0, 1, 1] } }), /aufsteigend/);
  assert.throws(() => cadGltf(parts, { translationClip: { ...clip, times: [-1, 0, 1] } }), /aufsteigend/);
  assert.throws(
    () =>
      cadGltf(parts, {
        translationClip: {
          ...clip,
          offsets: [
            [0, 0, 0],
            [1, 0, 0],
          ],
        },
      }),
    /je Zeitpunkt/,
  );
  assert.throws(
    () =>
      cadGltf(parts, {
        translationClip: {
          ...clip,
          offsets: [
            [0, 0],
            [1, 0],
            [2, 0],
          ],
        },
      }),
    /versatz/i,
  );
  assert.throws(
    () =>
      cadGltf(parts, {
        translationClip: {
          ...clip,
          offsets: [
            [0, 0, 0],
            [NaN, 0, 0],
            [2, 0, 0],
          ],
        },
      }),
    /versatz/i,
  );
  assert.throws(() => cadGltf(parts, { translationClip: { ...clip, name: 5 } }), /Translationsspurname/);
  // An absent clip keeps the static export unchanged.
  assert.equal(cadGltf(parts, { translationClip: null }).includes('"animations"'), false);
});
