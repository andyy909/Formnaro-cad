import test from 'node:test';
import assert from 'node:assert/strict';
import { cadGltf } from '../src/cad-mesh-formats.js';
import { gltfToGlb } from '../src/exchange-formats.js';
import { CAD_GLTF_PART_ID_KEY, cadGltfNodeIdentity } from '../src/cad-gltf-node-identity.js';

function glbJson(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x46546c67, 'GLB magic');
  assert.equal(view.getUint32(4, true), 2, 'GLB version');
  assert.equal(view.getUint32(8, true), bytes.byteLength, 'GLB length');
  const jsonLength = view.getUint32(12, true);
  assert.equal(view.getUint32(16, true), 0x4e4f534a, 'JSON chunk');
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
}

const plate = (x) => ({
  vertices: [x, 0, 0, x + 10, 0, 0, x + 10, 10, 0, x, 10, 0],
  triangles: [0, 1, 2, 0, 2, 3],
});

// Synthetic counterpart of the reference mechanism's moving parts: two small
// bodies at different local positions. Both intentionally share one name.
const parts = [
  {
    id: 'slider-a',
    name: 'Schlitten',
    color: '#c13f24',
    opacity: 1,
    mesh: plate(0),
  },
  {
    id: 'slider-b',
    name: 'Schlitten',
    color: '#135ac1',
    opacity: 1,
    mesh: plate(40),
  },
];

test('GLB export writes the stable part ID next to the display name, so equal-named parts stay distinguishable', () => {
  const text = cadGltf(parts, { roundingBudget: 0.005 }),
    document = glbJson(gltfToGlb(text));

  // The static export contains one flat mesh node per part and no animation.
  assert.equal(document.nodes.length, 2);
  assert.equal(document.animations, undefined, 'static export carries no motion track');
  assert.deepEqual(
    document.nodes.map((node) => node.name),
    ['Schlitten', 'Schlitten'],
  );
  assert.equal(document.nodes[0].extras[CAD_GLTF_PART_ID_KEY], 'slider-a');
  assert.equal(document.nodes[1].extras[CAD_GLTF_PART_ID_KEY], 'slider-b');
  assert.equal(text.includes('"slider-a"'), true);
  assert.equal(text.includes('"slider-b"'), true);
  assert.deepEqual(document.scenes[0].nodes, [0, 1]);

  // The ID is the stable key; the equal display names remain ambiguous.
  const identity = cadGltfNodeIdentity(document);
  assert.equal(identity.complete, true);
  assert.deepEqual(identity.ambiguousNames, ['Schlitten']);
  assert.equal(identity.byPartId.get('slider-a'), 0);
  assert.equal(identity.byPartId.get('slider-b'), 1);
  assert.deepEqual(identity.unidentified, []);
  assert.deepEqual(identity.duplicatePartIds, []);

  // A filtered export renumbers the remaining node, but keeps its own ID.
  const subset = glbJson(gltfToGlb(cadGltf([parts[1]], { roundingBudget: 0.005 })));
  assert.deepEqual(
    subset.nodes.map((node) => node.name),
    ['Schlitten'],
  );
  assert.equal(subset.nodes[0].extras[CAD_GLTF_PART_ID_KEY], 'slider-b');
  assert.equal(cadGltfNodeIdentity(subset).byPartId.get('slider-b'), 0);

  // Reordering the nodes breaks name/order lookups but not the ID lookup.
  const reordered = structuredClone(document);
  reordered.nodes.reverse();
  reordered.scenes[0].nodes.reverse();
  const reorderedIdentity = cadGltfNodeIdentity(reordered);
  assert.equal(reorderedIdentity.byPartId.get('slider-a'), 1);
  assert.equal(reorderedIdentity.byPartId.get('slider-b'), 0);
  assert.deepEqual(
    reordered.nodes[reorderedIdentity.byPartId.get('slider-a')].translation,
    document.nodes[0].translation,
    'the part ID still resolves to its own local transform',
  );
});

test('Parts without an ID stay unannotated and invalid IDs are rejected', () => {
  const anonymous = glbJson(
    gltfToGlb(cadGltf([{ name: 'Ohne ID', color: '#bbbbbb', opacity: 1, mesh: plate(0) }], { roundingBudget: 0.005 })),
  );
  assert.equal(Object.hasOwn(anonymous.nodes[0], 'extras'), false);
  assert.deepEqual(cadGltfNodeIdentity(anonymous).unidentified, [0]);

  assert.throws(() => cadGltf([{ ...parts[0], id: 7 }], { roundingBudget: 0.005 }), /Exportmetadaten/);
  assert.throws(() => cadGltf([{ ...parts[0], id: '' }], { roundingBudget: 0.005 }), /Exportmetadaten/);
});
