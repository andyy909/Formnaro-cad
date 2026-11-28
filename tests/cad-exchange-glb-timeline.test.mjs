import test from 'node:test';
import assert from 'node:assert/strict';
import { AnimationMixer, LoopOnce, Matrix4, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { cadGltf, encodeCadMeshes } from '../src/cad-mesh-formats.js';
import { createCadProject } from '../src/cad-project.js';
import { createCadJoint, compileCadJointMotion, cadJointProblems } from '../src/cad-joints-data.js';
import { cadPoint } from '../src/cad-affine.js';

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

function readFloatAccessorFromView(view, document, accessorIndex, binary = 0) {
  const accessor = document.accessors[accessorIndex],
    bufferView = document.bufferViews[accessor.bufferView],
    components = COMPONENTS[accessor.type],
    base = binary + (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0),
    values = [];
  assert.equal(accessor.componentType, 5126);
  assert.ok(components);
  for (let i = 0; i < accessor.count * components; i++) values.push(view.getFloat32(base + i * 4, true));
  return values;
}

const readGlbAccessor = (glb, index) => readFloatAccessorFromView(glb.view, glb.json, index, glb.binary);

function readGltfJsonAccessor(document, index) {
  const bufferView = document.bufferViews[document.accessors[index].bufferView],
    bytes = Uint8Array.from(atob(document.buffers[bufferView.buffer].uri.split(',')[1]), (c) => c.charCodeAt(0));
  return readFloatAccessorFromView(new DataView(bytes.buffer), document, index);
}

function box(x0, y0, z0, x1, y1, z1) {
  return {
    vertices: [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y1, z0],
      [x0, y1, z0],
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1],
    ].flat(),
    triangles: [
      0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0,
    ],
  };
}

function transformed(matrix, mesh) {
  const transform = new Matrix4().fromArray(matrix),
    vertices = [];
  for (let i = 0; i < mesh.vertices.length; i += 3)
    vertices.push(
      ...new Vector3(mesh.vertices[i], mesh.vertices[i + 1], mesh.vertices[i + 2]).applyMatrix4(transform).toArray(),
    );
  return { vertices, triangles: mesh.triangles };
}

const close = (actual, expected, message, tolerance = 1e-6) =>
    assert.ok(Math.abs(actual - expected) < tolerance, `${message}: ${actual} versus ${expected}`),
  closePoint = (actual, expected, message) =>
    [0, 1, 2].forEach((axis) => close(actual.getComponent(axis), expected[axis], `${message} axis ${axis}`)),
  // CAD point in millimetres to glTF world metres (Z-up to Y-up).
  gltfPoint = ([x, y, z]) => [x / 1000, z / 1000, -y / 1000],
  boundsOf = ({ vertices }) => ({
    min: [0, 1, 2].map((axis) => Math.min(...vertices.filter((_, index) => index % 3 === axis))),
    max: [0, 1, 2].map((axis) => Math.max(...vertices.filter((_, index) => index % 3 === axis))),
  });

// work/Referenz-Mechanismus.json: a base shifted by (17, -31, 20) and turned by
// 90 degrees about Z, a slider travelling 0/20/40 mm along its local X axis and
// a lever turning 0/45/90 degrees about its local Z axis.
const baseTransform = new Matrix4()
    .makeTranslation(17, -31, 20)
    .multiply(new Matrix4().makeRotationZ(Math.PI / 2))
    .toArray(),
  sliderTransform = baseTransform,
  leverTransform = new Matrix4()
    .fromArray(baseTransform)
    .multiply(new Matrix4().makeTranslation(20, 0, 10))
    .toArray(),
  localBoxes = {
    base: box(-20, -20, -10, 20, 20, 0),
    slider: box(0, -10, 0, 40, 10, 20),
    lever: box(0, -10, 0, 100, 10, 20),
  },
  parts = [
    { id: 'base', name: 'Basis', color: '#135ac1', mesh: transformed(baseTransform, localBoxes.base) },
    { id: 'slider', name: 'Schlitten', color: '#2c8a4b', mesh: transformed(sliderTransform, localBoxes.slider) },
    { id: 'lever', name: 'Hebel', color: '#c13f24', mesh: transformed(leverTransform, localBoxes.lever) },
  ],
  // Probes in each part's own CAD-local millimetres: a base corner, the slider
  // nose and the 100 mm lever tip beyond its pivot.
  probes = { base: [20, 20, 0], slider: [40, 10, 20], lever: [100, 0, 10] },
  samples = [
    { time: 0, slider: 0, lever: 0 },
    { time: 1, slider: 20, lever: 45 },
    { time: 2, slider: 40, lever: 90 },
  ],
  times = samples.map((sample) => sample.time);

// The project and joints are the product's own motion model; the export clips
// below are only a translation of its world placements into the E2/E3 API.
const projectNode = (id, matrix) => ({
    id,
    kind: 'cad',
    name: id,
    source: 'native',
    solid: true,
    transform: matrix,
    recipe: { type: 'box', size: [1, 1, 1] },
    brep: { format: 'OpenCascade-BRep', data: 'storage-only-' + id, triangulation: false },
    stats: { bounds: boundsOf(localBoxes[id]), volume: 1, solids: 1 },
  }),
  project = createCadProject({
    nodes: [
      projectNode('base', baseTransform),
      projectNode('slider', sliderTransform),
      projectNode('lever', leverTransform),
    ],
  });

project.joints = createCadJoint(project, {
  id: 'slider-joint',
  name: 'Schlitten',
  kind: 'prismatic',
  parentId: 'base',
  childId: 'slider',
  origin: cadPoint(baseTransform, [0, 0, 0]),
  axis: [0, 1, 0],
  limits: { min: 0, max: 40 },
});
project.joints = createCadJoint(project, {
  id: 'lever-joint',
  name: 'Hebel',
  kind: 'revolute',
  parentId: 'slider',
  childId: 'lever',
  origin: cadPoint(leverTransform, [0, 0, 0]),
  axis: [0, 0, 1],
  limits: { min: 0, max: 90 },
});
assert.deepEqual(cadJointProblems(project), []);

const motion = compileCadJointMotion(project),
  // An unmoved child receives no placement, so fall back to its stored frame.
  worldTransforms = samples.map(({ slider, lever }) => {
    const placements = motion.preview([
        { jointId: 'slider-joint', value: slider },
        { jointId: 'lever-joint', value: lever },
      ]),
      placement = (rootId) => placements.placements.find((item) => item.rootId === rootId)?.transform;
    return { slider: placement('slider') ?? sliderTransform, lever: placement('lever') ?? leverTransform };
  }),
  sliderRest = cadPoint(sliderTransform, [0, 0, 0]),
  // E2 translation offsets are CAD world millimetres relative to the static
  // pose. The slider's local X axis becomes the base frame's world +Y axis.
  sliderOffsets = worldTransforms.map(({ slider }) => {
    const moved = cadPoint(slider, [0, 0, 0]);
    return moved.map((value, axis) => value - sliderRest[axis]);
  }),
  leverRestRotation = new Quaternion().setFromRotationMatrix(new Matrix4().fromArray(leverTransform)),
  leverRotations = worldTransforms.map(({ lever }) =>
    new Quaternion()
      .setFromRotationMatrix(new Matrix4().fromArray(lever))
      .multiply(leverRestRotation.clone().invert())
      .toArray(),
  ),
  leverPivot = cadPoint(leverTransform, [0, 0, 0]),
  sliderClip = { name: 'Schlitten', partId: 'slider', times, offsets: sliderOffsets },
  leverClip = { name: 'Hebel', partId: 'lever', times, quaternions: leverRotations, pivot: leverPivot },
  // The lever pivot rides on the slider, so its shared translation track uses
  // exactly the slider's world offsets while the rotation stays on the pivot.
  leverTranslationClip = { name: 'Hebel', partId: 'lever', times, offsets: sliderOffsets };

// Bounding-box centres of the exported static meshes and the static world
// positions of the probes. Node-local coordinates are (world - centre) / 1000
// in CAD axes; the node's static conversion rotation turns them into glTF Y-up.
const centres = Object.fromEntries(parts.map((part) => [part.id, boundsOf(part.mesh)])),
  staticCentre = (id) => centres[id].min.map((value, axis) => (value + centres[id].max[axis]) / 2),
  staticProbe = {
    base: cadPoint(baseTransform, probes.base),
    slider: cadPoint(sliderTransform, probes.slider),
    lever: cadPoint(leverTransform, probes.lever),
  },
  localProbe = (point, centre) => new Vector3(...point.map((value, axis) => (value - centre[axis]) / 1000));

test('The nested joint chain becomes per-part clips with unique seconds', () => {
  // The reference mechanism itself: the shifted 90 degree base turns the local
  // slider travel into world +Y and the lever tip ends on world -X at 90 degrees.
  assert.deepEqual(
    leverPivot.map((value) => +value.toFixed(9)),
    [17, -11, 30],
  );
  assert.deepEqual(
    sliderOffsets.map((offset) => offset.map((value) => +value.toFixed(9))),
    [
      [0, 0, 0],
      [0, 20, 0],
      [0, 40, 0],
    ],
  );
  assert.deepEqual(
    cadPoint(worldTransforms[2].lever, [100, 0, 10]).map((value) => +value.toFixed(9)),
    [-83, 29, 40],
  );

  // The existing export API resolves one translation clip and one rotation
  // clip per file, so the same assembly is exported once per moved body. Both
  // exports carry the static pose of the other parts unchanged.
  const sliderGlb = decodeGlb(encodeCadMeshes(parts, 'glb', { roundingBudget: 0.005, translationClip: sliderClip })),
    leverGlb = decodeGlb(
      encodeCadMeshes(parts, 'glb', {
        roundingBudget: 0.005,
        translationClip: leverTranslationClip,
        rotationClip: leverClip,
      }),
    ),
    statics = JSON.parse(cadGltf(parts, { roundingBudget: 0.005 }));

  const checkTimes = (glb) => {
    const animation = glb.json.animations?.[0];
    assert.ok(animation);
    const inputs = [...new Set(animation.samplers.map((sampler) => sampler.input))];
    assert.ok(inputs.length >= 1);
    for (const input of inputs) {
      assert.deepEqual(readGlbAccessor(glb, input), times);
      assert.equal(new Set(readGlbAccessor(glb, input)).size, times.length, 'unique seconds');
      assert.deepEqual(glb.json.accessors[input].min, [times[0]]);
      assert.deepEqual(glb.json.accessors[input].max, [times.at(-1)]);
    }
    return animation;
  };

  // The 90 degree base turns the slider's local X travel into world +Y.
  const sliderAnimation = checkTimes(sliderGlb);
  assert.equal(sliderGlb.json.animations.length, 1);
  assert.equal(sliderAnimation.name, 'Schlitten');
  assert.deepEqual(
    sliderAnimation.channels.map((channel) => `${channel.target.node}:${channel.target.path}`),
    ['1:translation'],
  );
  const sliderValues = readGlbAccessor(sliderGlb, sliderAnimation.samplers[sliderAnimation.channels[0].sampler].output),
    sliderBase = statics.nodes[1].translation,
    expectedSlider = sliderOffsets.map(([x, y, z]) => [
      sliderBase[0] + x / 1000,
      sliderBase[1] + z / 1000,
      sliderBase[2] - y / 1000,
    ]);
  assert.equal(sliderValues.length, times.length * 3);
  expectedSlider.forEach((value, sample) =>
    value.forEach((component, axis) =>
      close(sliderValues[sample * 3 + axis], component, `slider sample ${sample} axis ${axis}`),
    ),
  );

  // The lever turns about its pivot and rides on the slider; the shared
  // translation track adds the slider's world offset after the rotation.
  const leverAnimation = checkTimes(leverGlb);
  assert.equal(leverGlb.json.animations.length, 1);
  assert.equal(leverAnimation.name, 'Hebel');
  assert.deepEqual(leverAnimation.channels.map((channel) => `${channel.target.node}:${channel.target.path}`).sort(), [
    '2:rotation',
    '2:translation',
  ]);
  const leverTypes = new Map(leverAnimation.channels.map((channel) => [channel.target.path, channel])),
    leverTranslations = readGlbAccessor(
      leverGlb,
      leverAnimation.samplers[leverTypes.get('translation').sampler].output,
    ),
    leverBase = statics.nodes[2].translation;
  // The first sample is exactly the static pose; the 90 degree sample moves
  // the rotated lever centre with the same world offset as the slider.
  leverTranslations.slice(0, 3).forEach((value, axis) => close(value, leverBase[axis], `lever rest axis ${axis}`));
  assert.ok(Math.abs(leverTranslations[6] - leverBase[0]) > 0.01, 'the turned lever centre leaves the static X');

  // No node record is rewritten by the animation and the fixed base stays idle.
  for (const glb of [sliderGlb, leverGlb]) {
    assert.deepEqual(
      glb.json.nodes.map((node) => node.extras.formnaroPartId),
      ['base', 'slider', 'lever'],
    );
    assert.deepEqual(
      glb.json.nodes.map((node) => node.translation),
      statics.nodes.map((node) => node.translation),
    );
    assert.deepEqual(
      glb.json.nodes.map((node) => node.rotation),
      statics.nodes.map((node) => node.rotation),
    );
    assert.equal(
      glb.json.animations[0].channels.some((channel) => channel.target.node === 0),
      false,
      'the fixed base receives no channel',
    );
  }
});

test('An independent glTF reader reproduces the nested world poses at 0, 1 and 2 seconds', async () => {
  const previous = globalThis.ProgressEvent;
  globalThis.ProgressEvent = class ProgressEvent {
    constructor(type, init) {
      Object.assign(this, { type }, init);
    }
  };
  try {
    const parse = async (options) => {
        const bytes = encodeCadMeshes(parts, 'glb', { roundingBudget: 0.005, ...options });
        return new GLTFLoader().parseAsync(bytes.buffer, '');
      },
      sliderResult = await parse({ translationClip: sliderClip }),
      leverResult = await parse({ translationClip: leverTranslationClip, rotationClip: leverClip }),
      animate = (result) => {
        assert.equal(result.animations.length, 1);
        const animation = result.animations[0];
        for (const track of animation.tracks) {
          assert.equal(new Set(track.times).size, track.times.length, `${track.name} unique seconds`);
          assert.deepEqual([...track.times], times);
        }
        const mixer = new AnimationMixer(result.scene),
          action = mixer.clipAction(animation);
        action.setLoop(LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();
        return {
          mixer,
          nodeFor: (rootId) => result.scene.children.find((child) => child.userData.formnaroPartId === rootId),
        };
      };

    // First export: the slider's local travel on the rotated, shifted base.
    {
      const { mixer, nodeFor } = animate(sliderResult),
        base = nodeFor('base'),
        slider = nodeFor('slider');
      assert.ok(base && slider);
      assert.equal(sliderResult.animations[0].tracks.length, 1);
      assert.ok(sliderResult.animations[0].tracks[0].name.endsWith('.position'));
      samples.forEach(({ time }, sample) => {
        mixer.setTime(time);
        sliderResult.scene.updateMatrixWorld(true);
        closePoint(
          base.localToWorld(localProbe(staticProbe.base, staticCentre('base'))),
          gltfPoint(cadPoint(baseTransform, probes.base)),
          `slider export sample ${sample} base`,
        );
        closePoint(
          slider.localToWorld(localProbe(staticProbe.slider, staticCentre('slider'))),
          gltfPoint(cadPoint(worldTransforms[sample].slider, probes.slider)),
          `slider export sample ${sample} slider`,
        );
      });
    }

    // Second export: the lever pivot rides on the slider, the tip turns about it.
    {
      const { mixer, nodeFor } = animate(leverResult),
        base = nodeFor('base'),
        slider = nodeFor('slider'),
        lever = nodeFor('lever');
      assert.ok(base && slider && lever);
      assert.equal(leverResult.animations[0].tracks.length, 2);
      samples.forEach(({ time }, sample) => {
        mixer.setTime(time);
        leverResult.scene.updateMatrixWorld(true);
        closePoint(
          base.localToWorld(localProbe(staticProbe.base, staticCentre('base'))),
          gltfPoint(cadPoint(baseTransform, probes.base)),
          `lever export sample ${sample} base`,
        );
        // The slider is static in this export; only the lever carries motion.
        closePoint(
          slider.localToWorld(localProbe(staticProbe.slider, staticCentre('slider'))),
          gltfPoint(cadPoint(sliderTransform, probes.slider)),
          `lever export sample ${sample} static slider`,
        );
        closePoint(
          lever.localToWorld(localProbe(leverPivot, staticCentre('lever'))),
          gltfPoint(cadPoint(worldTransforms[sample].lever, [0, 0, 0])),
          `lever export sample ${sample} lever pivot`,
        );
        closePoint(
          lever.localToWorld(localProbe(staticProbe.lever, staticCentre('lever'))),
          gltfPoint(cadPoint(worldTransforms[sample].lever, probes.lever)),
          `lever export sample ${sample} lever tip`,
        );
      });
    }
  } finally {
    if (previous === undefined) delete globalThis.ProgressEvent;
    else globalThis.ProgressEvent = previous;
  }
});

test('Clip seconds that collapse in Float32 are rejected before output', () => {
  // Distinct as doubles (1.000000001 > 1) but the same Float32 key.
  const collapsed = 1 + 1e-9;
  assert.notEqual(collapsed, 1);
  assert.equal(Math.fround(collapsed), 1);
  assert.throws(() => cadGltf(parts, { translationClip: { ...sliderClip, times: [0, 1, collapsed] } }), /Float32/);
  assert.throws(() => cadGltf(parts, { rotationClip: { ...leverClip, times: [0, 1, collapsed] } }), /Float32/);

  // A larger offset stays representable and is exported as a unique second.
  const near = 1 + 1e-6,
    document = JSON.parse(cadGltf(parts, { translationClip: { ...sliderClip, times: [0, 1, near] } })),
    stored = readGltfJsonAccessor(document, document.animations[0].samplers[0].input);
  assert.deepEqual(stored, [0, 1, Math.fround(near)]);
  assert.notEqual(stored[1], stored[2]);
});
