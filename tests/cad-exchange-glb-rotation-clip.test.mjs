import test from 'node:test';
import assert from 'node:assert/strict';
import { AnimationMixer, LoopOnce, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { cadGltf, encodeCadMeshes } from '../src/cad-mesh-formats.js';

const COMPONENTS = { SCALAR: 1, VEC3: 3, VEC4: 4 };

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

function box(x0, y0, z0, x1, y1, z1) {
  const vertices = [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y1, z0],
      [x0, y1, z0],
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1],
    ].flat(),
    triangles = [
      0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0,
    ];
  return { vertices, triangles };
}

// The lever is 100 mm long along +X, so its bounding-box centre (70, 0, 10)
// clearly differs from the hinge pivot (20, 0, 10) on the Z axis.
const lever = { id: 'lever', name: 'Hebel', color: '#c13f24', mesh: box(20, -10, 0, 120, 10, 20) },
  base = { id: 'base', name: 'Basis', color: '#135ac1', mesh: box(-10, -10, -10, 10, 10, 0) },
  parts = [base, lever],
  centre = [70, 0, 10],
  pivot = [20, 0, 10];

// XYZW quaternions in CAD world axes around +Z at 0/45/90 degrees.
const cadRotation = (degrees) => [0, 0, Math.sin((degrees * Math.PI) / 360), Math.cos((degrees * Math.PI) / 360)],
  clip = {
    name: 'Hebel',
    partId: 'lever',
    times: [0, 1, 2],
    quaternions: [cadRotation(0), cadRotation(45), cadRotation(90)],
    pivot,
  };

const staticQuaternion = new Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);

const staticDocument = () => JSON.parse(cadGltf(parts, { roundingBudget: 0.005 }));

const close = (actual, expected, message, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${message}: ${actual} versus ${expected}`);

const sampleChannels = (animation) => {
  const byPath = new Map(animation.channels.map((channel) => [channel.target.path, channel]));
  assert.ok(byPath.has('rotation'), 'rotation channel');
  return byPath;
};

// CAD point in millimetres to glTF world metres (Z-up to Y-up).
const gltfPoint = ([x, y, z]) => [x / 1000, z / 1000, -y / 1000];

const samplePose = (glb, animation, channel, sample) => {
  const sampler = animation.samplers[channel.sampler],
    values = readGlbAccessor(glb, sampler.output),
    components = channel.target.path === 'rotation' ? 4 : 3,
    offset = sample * components;
  return channel.target.path === 'rotation'
    ? new Quaternion(values[offset], values[offset + 1], values[offset + 2], values[offset + 3])
    : new Vector3(values[offset], values[offset + 1], values[offset + 2]);
};

test('GLB rotation clip composes the relative CAD world rotation with the static glTF conversion', () => {
  const bytes = encodeCadMeshes(parts, 'glb', { roundingBudget: 0.005, rotationClip: clip }),
    glb = decodeGlb(bytes),
    animation = glb.json.animations?.[0],
    statics = staticDocument();

  assert.ok(animation);
  assert.equal(glb.json.animations.length, 1);
  assert.equal(animation.name, 'Hebel');
  assert.equal(animation.channels.length, 2);
  assert.equal(animation.samplers[0].interpolation, 'LINEAR');

  const channels = sampleChannels(animation);
  assert.equal(channels.get('rotation').target.node, 1);
  assert.equal(channels.get('translation').target.node, 1, 'off-centre pivot needs a translation channel');

  const rotationSampler = animation.samplers[channels.get('rotation').sampler];
  assert.deepEqual(readGlbAccessor(glb, rotationSampler.input), [0, 1, 2]);
  assert.deepEqual(glb.json.accessors[rotationSampler.input].min, [0]);
  assert.deepEqual(glb.json.accessors[rotationSampler.input].max, [2]);

  // The static node keeps its original conversion rotation; animation samples
  // are the conversion composed with the relative CAD rotation.
  const rotations = readGlbAccessor(glb, rotationSampler.output),
    translations = readGlbAccessor(glb, animation.samplers[channels.get('translation').sampler].output);
  assert.equal(rotations.length, 12);
  assert.equal(translations.length, 9);
  clip.quaternions.forEach((relative, sample) => {
    const expected = staticQuaternion.clone().multiply(new Quaternion(...relative)),
      actual = new Quaternion(
        rotations[sample * 4],
        rotations[sample * 4 + 1],
        rotations[sample * 4 + 2],
        rotations[sample * 4 + 3],
      );
    // q and -q describe the same orientation; the sample must match exactly.
    assert.ok(Math.abs(actual.dot(expected)) > 1 - 1e-6, `sample ${sample} rotation orientation`);
  });
  statics.nodes[1].rotation.forEach((value, axis) =>
    close(rotations[axis], value, `first sample static rotation axis ${axis}`),
  );

  // Every sample keeps the hinge pivot fixed. The local pivot is the pivot
  // offset from the exported geometry centre in CAD millimetres.
  const localPivot = new Vector3(
      (pivot[0] - centre[0]) / 1000,
      (pivot[1] - centre[1]) / 1000,
      (pivot[2] - centre[2]) / 1000,
    ),
    expectedPivot = new Vector3(...gltfPoint(pivot));
  [0, 1, 2].forEach((sample) => {
    const rotation = samplePose(glb, animation, channels.get('rotation'), sample),
      translation = samplePose(glb, animation, channels.get('translation'), sample),
      worldPivot = localPivot.clone().applyQuaternion(rotation).add(translation);
    [0, 1, 2].forEach((axis) =>
      close(worldPivot.getComponent(axis), expectedPivot.getComponent(axis), `sample ${sample} pivot axis ${axis}`),
    );

    // The analytical translation follows the rotated geometry centre exactly.
    const angle = (sample * Math.PI) / 4,
      expectedCentre = gltfPoint([pivot[0] + 50 * Math.cos(angle), 50 * Math.sin(angle), pivot[2]]);
    [0, 1, 2].forEach((axis) =>
      close(translation.getComponent(axis), expectedCentre[axis], `sample ${sample} centre axis ${axis}`),
    );
  });

  // The idle part receives no channel and the static node record is unchanged.
  assert.equal(
    animation.channels.some((channel) => channel.target.node === 0),
    false,
  );
  assert.deepEqual(glb.json.nodes[1].rotation, statics.nodes[1].rotation);
  assert.deepEqual(glb.json.nodes[1].translation, statics.nodes[1].translation);
  assert.deepEqual(
    glb.json.nodes.map((node) => node.extras.formnaroPartId),
    ['base', 'lever'],
  );
});

test('A rotation through the geometry centre needs no redundant translation channel', () => {
  const centredClip = { ...clip, pivot: centre },
    glb = decodeGlb(encodeCadMeshes(parts, 'glb', { rotationClip: centredClip })),
    animation = glb.json.animations[0],
    channels = sampleChannels(animation),
    statics = staticDocument();

  assert.equal(animation.channels.length, 1);
  assert.equal(channels.get('rotation').target.path, 'rotation');
  assert.equal(channels.has('translation'), false);
  // Rotating around the bounding-box centre leaves the static translation.
  statics.nodes[1].translation.forEach((value, axis) =>
    close(glb.json.nodes[1].translation[axis], value, `centred translation axis ${axis}`),
  );
  gltfPoint(centre).forEach((value, axis) => close(glb.json.nodes[1].translation[axis], value, `centre axis ${axis}`));

  const rotation = samplePose(glb, animation, channels.get('rotation'), 2),
    expected = staticQuaternion.clone().multiply(new Quaternion(...clip.quaternions[2]));
  assert.ok(Math.abs(rotation.dot(expected)) > 1 - 1e-6, '90 degree rotation applied');
});

test('An independent GLTF loader reproduces the rotated off-centre poses at 0, 1 and 2 seconds', async () => {
  const previous = globalThis.ProgressEvent;
  globalThis.ProgressEvent = class ProgressEvent {
    constructor(type, init) {
      Object.assign(this, { type }, init);
    }
  };
  try {
    const bytes = encodeCadMeshes(parts, 'glb', { roundingBudget: 0.005, rotationClip: clip }),
      result = await new GLTFLoader().parseAsync(bytes.buffer, ''),
      moving = result.scene.children.find((child) => child.userData.formnaroPartId === 'lever');

    assert.ok(moving, 'lever node');
    assert.equal(moving.name.startsWith('Hebel'), true);
    assert.equal(result.animations.length, 1);
    const animation = result.animations[0],
      rotationTrack = animation.tracks.find((track) => track.name.endsWith('.quaternion')),
      translationTrack = animation.tracks.find((track) => track.name.endsWith('.position'));
    assert.ok(rotationTrack, 'quaternion track');
    assert.ok(translationTrack, 'translation track');
    assert.deepEqual([...rotationTrack.times], [0, 1, 2]);
    assert.equal(rotationTrack.values.length, 12);
    assert.equal(translationTrack.values.length, 9);

    const mixer = new AnimationMixer(result.scene),
      action = mixer.clipAction(animation);
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    const localPivot = new Vector3(-0.05, 0, 0),
      localTip = new Vector3(0.05, 0, 0),
      expectedPivot = new Vector3(...gltfPoint(pivot)),
      // 100 mm lever tip around the pivot at 0/45/90 degrees.
      expectedTips = [
        gltfPoint([pivot[0] + 100, pivot[1], pivot[2]]),
        gltfPoint([pivot[0] + 100 * Math.cos(Math.PI / 4), 100 * Math.sin(Math.PI / 4), pivot[2]]),
        gltfPoint([pivot[0], pivot[1] + 100, pivot[2]]),
      ];
    [0, 1, 2].forEach((sample) => {
      mixer.setTime(sample);
      result.scene.updateMatrixWorld(true);
      const worldPivot = moving.localToWorld(localPivot.clone()),
        worldTip = moving.localToWorld(localTip.clone());
      [0, 1, 2].forEach((axis) => {
        close(
          worldPivot.getComponent(axis),
          expectedPivot.getComponent(axis),
          `loader sample ${sample} pivot axis ${axis}`,
        );
        close(worldTip.getComponent(axis), expectedTips[sample][axis], `loader sample ${sample} tip axis ${axis}`);
      });
    });
  } finally {
    if (previous === undefined) delete globalThis.ProgressEvent;
    else globalThis.ProgressEvent = previous;
  }
});

test('Rotation clips resolve by part ID and reject invalid tracks', () => {
  const reject = (overrides, pattern) =>
    assert.throws(() => cadGltf(parts, { rotationClip: { ...clip, ...overrides } }), pattern);

  // An absent clip keeps the static export unchanged.
  assert.equal(cadGltf(parts, { rotationClip: null }).includes('"animations"'), false);
  assert.equal(cadGltf(parts).includes('"animations"'), false);

  reject({ partId: undefined }, /Teile-ID/);
  reject({ partId: 'fehlt' }, /kein exportiertes Teil/);
  reject({ name: 5 }, /Rotationsspurname/);
  reject({ times: [0] }, /mindestens zwei/);
  reject({ times: [0, 2, 1] }, /aufsteigend/);
  reject({ times: [0, 1, 1] }, /aufsteigend/);
  reject({ times: [-1, 0, 1] }, /aufsteigend/);
  reject({ quaternions: [clip.quaternions[0]] }, /je Zeitpunkt eine Quaternion/);
  reject({ quaternions: [[0, 0, 0], clip.quaternions[1], clip.quaternions[2]] }, /Rotationsquaternion/);
  reject({ quaternions: [[0, 0, 0, NaN], clip.quaternions[1], clip.quaternions[2]] }, /Rotationsquaternion/);
  reject({ quaternions: [[0, 0, 0, 0], clip.quaternions[1], clip.quaternions[2]] }, /Rotationsquaternion/);
  reject({ pivot: undefined }, /Drehpunkt/);
  reject({ pivot: [20, 0] }, /Drehpunkt/);
  reject({ pivot: [20, NaN, 10] }, /Drehpunkt/);

  // Non-unit input quaternions are normalised, so the same pose is exported.
  const scaled = JSON.parse(
      cadGltf(parts, {
        rotationClip: { ...clip, quaternions: clip.quaternions.map((value) => value.map((part) => part * 2)) },
      }),
    ),
    plain = JSON.parse(cadGltf(parts, { rotationClip: clip }));
  assert.deepEqual(
    readGltfJsonAccessor(scaled, scaled.animations[0].samplers[0].output),
    readGltfJsonAccessor(plain, plain.animations[0].samplers[0].output),
  );
});

test('A shared translation clip is applied after the pivot rotation of the same part', () => {
  const translationClip = {
      name: 'Hebel',
      partId: 'lever',
      times: [0, 1, 2],
      offsets: [
        [0, 0, 0],
        [10, 0, 0],
        [20, 0, 0],
      ],
    },
    combined = JSON.parse(cadGltf(parts, { rotationClip: clip, translationClip })),
    rotationOnly = JSON.parse(cadGltf(parts, { rotationClip: clip })),
    channels = new Map(combined.animations[0].channels.map((channel) => [channel.target.path, channel])),
    rotationChannels = new Map(rotationOnly.animations[0].channels.map((channel) => [channel.target.path, channel])),
    values = readGltfJsonAccessor(
      combined,
      combined.animations[0].samplers[channels.get('translation').sampler].output,
    ),
    base = readGltfJsonAccessor(
      rotationOnly,
      rotationOnly.animations[0].samplers[rotationChannels.get('translation').sampler].output,
    );

  assert.deepEqual([...channels.keys()].sort(), ['rotation', 'translation']);
  assert.equal(values.length, 9);
  [0, 1, 2].forEach((sample) => {
    close(values[sample * 3], base[sample * 3] + sample * 0.01, `combined sample ${sample} X`);
    close(values[sample * 3 + 1], base[sample * 3 + 1], `combined sample ${sample} Y`);
    close(values[sample * 3 + 2], base[sample * 3 + 2], `combined sample ${sample} Z`);
  });

  // A shared node needs aligned sample times; different times cannot compose.
  assert.throws(
    () =>
      cadGltf(parts, {
        rotationClip: clip,
        translationClip: { ...translationClip, times: [0, 1.5, 2] },
      }),
    /identische Zeitpunkte/,
  );
});
