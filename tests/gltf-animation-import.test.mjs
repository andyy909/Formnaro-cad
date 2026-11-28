import test from 'node:test';
import assert from 'node:assert/strict';
import { CAD_GLTF_PART_ID_KEY } from '../src/cad-gltf-node-identity.js';
import { cadGltf } from '../src/cad-mesh-formats.js';
import { gltfToGlb, parseGltf, readExchangeFile } from '../src/exchange-formats.js';
import { GLTF_ANIMATION_LIMITS } from '../src/gltf-animation-import.js';
import { Matrix4, Vector3 } from 'three';
import { cadMotionScene, compileCadMotionClip } from '../src/cad-motion-clips.js';
import { createCadProject, parseCadProject, serializeCadProject } from '../src/cad-project.js';
import { encodeFnpackProject } from '../src/cad-fnpack-data.js';
import { openFnpack, writeFnpack } from '../backend/fnpack.cjs';
import { mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const encoder = new TextEncoder();

function packGlb(document, binary) {
  const json = encoder.encode(JSON.stringify(document)),
    jsonLength = (json.length + 3) & ~3,
    total = 20 + jsonLength + 8 + binary.length,
    bytes = new Uint8Array(total),
    view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(0x20, 20, 20 + jsonLength);
  bytes.set(json, 20);
  view.setUint32(20 + jsonLength, binary.length, true);
  view.setUint32(24 + jsonLength, 0x004e4942, true);
  bytes.set(binary, 28 + jsonLength);
  return bytes;
}

// One triangle/quad mesh instanced by two equal-named parts under a moved root.
// The moving part has a three-keyframe translation track and a two-keyframe
// STEP rotation track; both stay in glTF local Y-up metres.
function syntheticGlb({
  translationTimes = [0, 1, 2],
  translationValues = [0, 0, 0, 0, 0.25, 0, 0, 0.5, 0],
  rotationTimes = [0, 2],
  rotationValues = [0, 0, 0, 1, 0, 0, 1, 0],
} = {}) {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
    indices = new Uint16Array([0, 1, 2, 0, 2, 3]),
    translationTime = new Float32Array(translationTimes),
    translationValue = new Float32Array(translationValues),
    rotationTime = new Float32Array(rotationTimes),
    rotationValue = new Float32Array(rotationValues),
    sections = [positions, indices, translationTime, translationValue, rotationTime, rotationValue],
    bufferViews = [],
    packed = [];
  let byteLength = 0;
  for (const array of sections) {
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: array.byteLength });
    packed.push(array);
    byteLength += array.byteLength;
  }
  const binary = new Uint8Array(byteLength);
  packed.forEach((array, index) =>
    binary.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), bufferViews[index].byteOffset),
  );
  const document = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      {
        name: 'Baugruppe',
        matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.5, 0, 1],
        children: [1, 2],
      },
      {
        name: 'Schlitten',
        extras: { [CAD_GLTF_PART_ID_KEY]: 'slider-a' },
        mesh: 0,
        translation: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      },
      {
        name: 'Schlitten',
        extras: { [CAD_GLTF_PART_ID_KEY]: 'slider-b' },
        mesh: 0,
        translation: [2, 0, 0],
      },
    ],
    meshes: [
      {
        name: 'Platte',
        primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }],
      },
    ],
    materials: [{ name: 'Platte', pbrMetallicRoughness: { baseColorFactor: [0.2, 0.4, 0.6, 1] } }],
    buffers: [{ byteLength }],
    bufferViews,
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5123, count: 6, type: 'SCALAR' },
      { bufferView: 2, componentType: 5126, count: translationTimes.length, type: 'SCALAR' },
      { bufferView: 3, componentType: 5126, count: translationTimes.length, type: 'VEC3' },
      { bufferView: 4, componentType: 5126, count: rotationTimes.length, type: 'SCALAR' },
      { bufferView: 5, componentType: 5126, count: rotationTimes.length, type: 'VEC4' },
    ],
    animations: [
      {
        name: 'Bewegung',
        samplers: [
          { input: 2, output: 3, interpolation: 'LINEAR' },
          { input: 4, output: 5, interpolation: 'STEP' },
        ],
        channels: [
          { sampler: 0, target: { node: 1, path: 'translation' } },
          { sampler: 1, target: { node: 1, path: 'rotation' } },
        ],
      },
    ],
  };
  return { document, binary, encode: (changed = document) => packGlb(changed, binary) };
}

test('GLB animation import reads three local keyframes and keeps parts world-space', async () => {
  const { document, encode } = syntheticGlb(),
    imported = await parseGltf(encode(), { binary: true, animations: true });

  assert.equal(imported.clips.length, 1);
  const clip = imported.clips[0];
  assert.equal(clip.name, 'Bewegung');
  assert.equal(clip.duration, 2);
  assert.equal(clip.tracks.length, 2);
  assert.deepEqual(clip.tracks[0], {
    nodeIndex: 1,
    path: 'translation',
    interpolation: 'LINEAR',
    times: [0, 1, 2],
    values: [0, 0, 0, 0, 0.25, 0, 0, 0.5, 0],
  });
  assert.deepEqual(clip.tracks[1], {
    nodeIndex: 1,
    path: 'rotation',
    interpolation: 'STEP',
    times: [0, 2],
    values: [0, 0, 0, 1, 0, 0, 1, 0],
  });

  // The original local hierarchy is preserved next to the world meshes.
  assert.deepEqual(imported.roots, [0]);
  assert.deepEqual(
    imported.nodes.map((node) => node.index),
    [0, 1, 2],
  );
  assert.deepEqual(imported.nodes[0], {
    index: 0,
    name: 'Baugruppe',
    mesh: null,
    parent: null,
    children: [1, 2],
    matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.5, 0, 1],
    translation: null,
    rotation: null,
    scale: null,
    partId: null,
  });
  assert.equal(imported.nodes[1].parent, 0);
  assert.deepEqual(imported.nodes[1].translation, document.nodes[1].translation);
  assert.deepEqual(imported.nodes[1].rotation, document.nodes[1].rotation);
  assert.deepEqual(imported.nodes[1].scale, document.nodes[1].scale);
  assert.deepEqual(imported.nodes[2].translation, [2, 0, 0]);
  assert.equal(imported.nodes[2].rotation, null);
  assert.equal(imported.nodes[2].parent, 0);

  // Stable IDs bind clips and parts without relying on the equal names.
  assert.deepEqual(
    imported.parts.map((part) => part.name),
    ['Schlitten', 'Schlitten'],
  );
  assert.deepEqual(
    imported.parts.map((part) => [part.nodeIndex, part.partId]),
    [
      [1, 'slider-a'],
      [2, 'slider-b'],
    ],
  );
  assert.deepEqual(
    imported.nodes.map((node) => node.partId),
    [null, 'slider-a', 'slider-b'],
  );

  // Geometry stays in world millimetres (glTF Y-up metres to Z-up mm).
  assert.deepEqual(imported.parts[0].mesh.verts.slice(0, 3), [0, 0, 500]);
  assert.deepEqual(imported.parts[1].mesh.verts.slice(0, 3), [2000, 0, 500]);

  // The static default keeps the previous result shape, warning and geometry.
  const statics = await parseGltf(encode(), { binary: true });
  assert.deepEqual(Object.keys(statics).sort(), ['parts', 'warnings']);
  assert.match(statics.warnings[0], /Animationen werden als statische Ausgangsstellung importiert/);
  assert.equal(statics.parts[0].nodeIndex, undefined);
  assert.equal(statics.parts[0].partId, undefined);
  assert.deepEqual(
    imported.parts.map((part) => part.mesh),
    statics.parts.map((part) => part.mesh),
  );
});

test('Old static GLB exports import unchanged and expose shared part IDs', async () => {
  const plate = (x) => ({
      vertices: [x, 0, 0, x + 10, 0, 0, x + 10, 10, 0, x, 10, 0],
      triangles: [0, 1, 2, 0, 2, 3],
    }),
    parts = [
      { id: 'slider-a', name: 'Schlitten', color: '#c13f24', opacity: 1, mesh: plate(0) },
      { id: 'slider-b', name: 'Schlitten', color: '#135ac1', opacity: 1, mesh: plate(40) },
    ],
    bytes = gltfToGlb(cadGltf(parts, { roundingBudget: 0.005 })),
    imported = await parseGltf(bytes, { binary: true, animations: true }),
    statics = await parseGltf(bytes, { binary: true });

  assert.deepEqual(imported.clips, []);
  assert.equal(
    imported.warnings.some((warning) => /Animationen/.test(warning)),
    false,
  );
  assert.deepEqual(imported.roots, [0, 1]);
  assert.deepEqual(
    imported.parts.map((part) => part.partId),
    ['slider-a', 'slider-b'],
  );
  for (const part of imported.parts) {
    assert.equal(imported.nodes[part.nodeIndex].partId, part.partId);
    assert.equal(imported.nodes[part.nodeIndex].parent, null);
  }
  assert.equal(imported.parts[0].name, imported.parts[1].name);
  assert.deepEqual(
    imported.parts.map((part) => part.mesh),
    statics.parts.map((part) => part.mesh),
  );
});

test('Malformed or unsupported animation data fails only in the opt-in import', async () => {
  const reject = async (mutate, pattern) => {
      const { document, encode } = syntheticGlb();
      mutate(document);
      await assert.rejects(parseGltf(encode(), { binary: true, animations: true }), pattern);
    },
    animation = () => syntheticGlb();

  await reject((document) => (document.animations[0].channels[0].target.path = 'weights'), /Animationspfad/);
  await reject((document) => (document.animations[0].samplers[0].interpolation = 'CUBICSPLINE'), /Interpolation/);
  await reject((document) => {
    document.animations[0].channels.push(structuredClone(document.animations[0].channels[0]));
  }, /Doppelter glTF-Animationskanal/);
  await reject((document) => (document.accessors[3].count = 2), /Animationswerte/);
  await reject((document) => (document.accessors[2].componentType = 5123), /Accessor/);
  await reject((document) => (document.animations[0].channels[0].target.node = 99), /gültigen Knoten/);
  await reject((document) => (document.animations[0].channels[0].sampler = 7), /sampler fehlt/i);

  await assert.rejects(
    parseGltf(
      syntheticGlb({ translationTimes: [0, 1, 1], translationValues: [0, 0, 0, 0, 0.25, 0, 0, 0.5, 0] }).encode(),
      { binary: true, animations: true },
    ),
    /streng aufsteigend/,
  );
  await assert.rejects(
    parseGltf(
      syntheticGlb({ translationTimes: [-1, 0, 1], translationValues: [0, 0, 0, 0, 0.25, 0, 0, 0.5, 0] }).encode(),
      { binary: true, animations: true },
    ),
    /nicht negativ/,
  );
  await assert.rejects(
    parseGltf(
      syntheticGlb({
        translationTimes: [0, GLTF_ANIMATION_LIMITS.seconds + 1],
        translationValues: [0, 0, 0, 0, 0.25, 0],
      }).encode(),
      { binary: true, animations: true },
    ),
    /Zeitbudget/,
  );

  const tooMany = animation();
  tooMany.document.animations = Array.from({ length: GLTF_ANIMATION_LIMITS.animations + 1 }, () =>
    structuredClone(tooMany.document.animations[0]),
  );
  await assert.rejects(parseGltf(tooMany.encode(), { binary: true, animations: true }), /zu viele Animationen/);

  // The static reader still accepts the same file and only warns.
  const unsupported = animation();
  unsupported.document.animations[0].samplers[0].interpolation = 'CUBICSPLINE';
  const statics = await parseGltf(unsupported.encode(), { binary: true });
  assert.match(statics.warnings[0], /statische Ausgangsstellung/);
  assert.equal(statics.parts.length, 2);
  await assert.rejects(parseGltf(unsupported.encode(), { binary: true, animations: true }), /Interpolation/);
});

test('a constant key is accepted and channels from a different scene are omitted', async () => {
  const { document, encode } = syntheticGlb({ translationTimes: [1], translationValues: [0, 0.25, 0] });
  document.nodes.push({ name: 'Andere Szene', mesh: 0 });
  document.animations[0].channels[1].target.node = 3;
  const result = await parseGltf(encode(), { binary: true, animations: true });
  assert.equal(result.clips[0].duration, 1);
  assert.deepEqual(
    result.clips[0].tracks.map((track) => track.times),
    [[1]],
  );
});

test('external glTF buffers resolve relative to their document and can supply animations offline', async () => {
  const { document, binary, encode } = syntheticGlb();
  const expected = await parseGltf(encode(), { binary: true, animations: true });
  document.buffers[0].uri = '../Daten/Motor%20links.bin';
  const input = gltfFile('Welle.gltf', 'Projekt/Modelle/Welle.gltf', JSON.stringify(document));
  const buffer = gltfFile('Motor links.bin', 'Projekt/Daten/Motor links.bin', binary);
  const different = gltfFile('Motor links.bin', 'Projekt/Anders/Motor links.bin', new Uint8Array(0));
  const result = await readExchangeFile(input, { files: [input, different, buffer], animations: true });
  assert.deepEqual(result, expected);
  await assert.rejects(readExchangeFile(input, { files: [different], animations: true }), /Begleitdatei fehlt/);
  await assert.rejects(readExchangeFile(input, { files: [buffer, buffer], animations: true }), /mehrdeutig/);
  document.buffers[0].uri = 'https://example.invalid/Motor.bin';
  await assert.rejects(
    readExchangeFile(gltfFile('Welle.gltf', '', JSON.stringify(document)), { files: [buffer], animations: true }),
    /Externe oder ungültige/,
  );
});

function gltfFile(name, relativePath, content) {
  const file = new File([content], name);
  Object.defineProperty(file, 'webkitRelativePath', { value: relativePath });
  return file;
}

test('motion samples CAD millimetres, restores independent placements and survives both project formats', async (t) => {
  const { encode } = syntheticGlb();
  const result = await parseGltf(encode(), { binary: true, animations: true });
  const ids = ['moving', 'same-name'];
  const transform = new Matrix4().makeRotationY(Math.PI / 2).setPosition(10, 20, 30);
  const project = createCadProject({
    nodes: result.parts.map((part, i) => ({
      id: ids[i],
      kind: 'referenceMesh',
      name: part.name,
      layerId: 'default',
      mesh: part.mesh,
      color: part.color,
      transform: transform.toArray(),
    })),
    motionClips: { version: 1, scenes: [cadMotionScene(result, ids, 'Antrieb.glb')] },
  });
  assert.equal(project.version, 42);
  assert.equal(createCadProject().version, 5);
  assert.throws(() => parseCadProject({ ...project, version: 41 }), /Bewegungsclips/);
  const reopened = parseCadProject(serializeCadProject(project));
  const scene = reopened.motionClips.scenes[0];
  const playback = compileCadMotionClip(scene, scene.clips[0], reopened.nodes);
  assert.equal(playback.boundParts, 1);
  const near = (actual, expected) => actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-8));
  const restVertex = new Vector3(1000, 0, 500);
  for (const [time, localResult] of [
    [0, [1000, 0, 500]],
    [0.5, [1000, 0, 625]],
    [1, [1000, 0, 750]],
    [1.5, [1000, 0, 875]],
    [2, [-1000, 0, 1000]],
  ]) {
    const [sample] = playback.placements(time);
    assert.equal(sample.rootId, 'moving');
    const displayed = restVertex.clone().applyMatrix4(transform).applyMatrix4(new Matrix4().fromArray(sample.delta));
    near(displayed.toArray(), new Vector3(...localResult).applyMatrix4(transform).toArray());
  }
  assert.deepEqual(compileCadMotionClip(scene, scene.clips[0], [reopened.nodes[1]]).placements(1), []);
  assert.deepEqual(reopened, project);
  const folder = await mkdtemp(join(tmpdir(), 'formnaro-motion-test-'));
  const file = join(folder, 'animation.fnpack');
  t.after(async () => {
    await unlink(file).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
    await rmdir(folder);
  });
  await writeFnpack(file, encodeFnpackProject(project));
  const packed = await openFnpack(file);
  try {
    assert.deepEqual(parseCadProject(packed.index.project).motionClips, project.motionClips);
  } finally {
    await packed.close();
  }
});
