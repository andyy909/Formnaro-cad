import test from 'node:test';
import { importStepWorldTree } from './fixtures/cad-step-world-tree.mjs';
import assert from 'node:assert/strict';
import { loadCadKernel } from '../src/cad-kernel-loader.js';
import { buildCadRecipe, buildCadWire } from '../src/cad-recipes.js';
import { transformCad } from '../src/cad-native-kernel.js';
import { exportCadStep } from '../src/cad-step-io.js';

// D4: a nested part may pass an explicit `definitionId` and a local
// `placement`. Its shape is then the unplaced definition; equal ids share one
// XCAF label and every occurrence carries its own local TopLoc_Location.
// Assembly nodes themselves keep the D3 identity location.
const oc = await loadCadKernel({ print: () => {}, printErr: () => {} });

const near = (actual, expected, message) =>
    assert.ok(Math.abs(actual - expected) < 1e-5, message ?? `${actual} != ${expected}`),
  nearBounds = (stats, min, max) => {
    min.forEach((value, index) => near(stats.bounds.min[index], value, `min[${index}]`));
    max.forEach((value, index) => near(stats.bounds.max[index], value, `max[${index}]`));
  },
  extents = (stats) => stats.bounds.max.map((value, index) => value - stats.bounds.min[index]),
  colors = (nodes) => nodes.map((node) => node.appearance),
  stepText = (bytes) => new TextDecoder().decode(bytes);

// Independent target values from work/Referenz-Baugruppe.json: one 100x60x5
// plate at the origin, a subassembly "Antrieb" rotated 90 degrees about Z and
// translated to x=40, and two occurrences of one 10x6x4 bearing definition at
// local x=0 and x=12. Assembly nodes keep identity locations, so the part
// placements carry the composed world transform: the 12 mm local spacing turns
// into a 12 mm world offset on Y and the rotation swaps the X/Y extents.
function placedFixture() {
  const plate = buildCadRecipe(oc, { type: 'box', size: [100, 60, 5] }),
    bearing = () => buildCadRecipe(oc, { type: 'box', size: [10, 6, 4] }),
    first = bearing(),
    second = bearing(),
    parts = [
      { shape: plate, name: 'Grundplatte', color: '#cc3322', opacity: 1 },
      {
        shape: first,
        name: 'Lager',
        color: '#2277cc',
        opacity: 1,
        definitionId: 'lager-10x6x4',
        placement: { translation: [40, 0, 0], rotationZ: Math.PI / 2 },
      },
      {
        shape: second,
        name: 'Lager',
        color: '#2277cc',
        opacity: 1,
        definitionId: 'lager-10x6x4',
        placement: { translation: [40, 12, 0], rotationZ: Math.PI / 2 },
      },
    ],
    tree = {
      name: 'Prüfbaugruppe',
      children: [{ partIndex: 0 }, { name: 'Antrieb', children: [{ partIndex: 1 }, { partIndex: 2 }] }],
    };
  return {
    plate,
    first,
    second,
    parts,
    tree,
    close() {
      for (const shape of [plate, first, second]) shape.delete();
    },
  };
}

// D3 comparison fixture: the same world positions baked into independent,
// already placed bodies without any definition input.
function bakedFixture() {
  const plate = buildCadRecipe(oc, { type: 'box', size: [100, 60, 5] }),
    bearing = (x, y) =>
      transformCad(oc, buildCadRecipe(oc, { type: 'box', size: [10, 6, 4] }), [
        0,
        -1,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        0,
        1,
        0,
        x,
        y,
        0,
        1,
      ]),
    first = bearing(40, 0),
    second = bearing(40, 12),
    parts = [
      { shape: plate, name: 'Grundplatte', color: '#cc3322', opacity: 1 },
      { shape: first, name: 'Lager', color: '#2277cc', opacity: 1 },
      { shape: second, name: 'Lager', color: '#2277cc', opacity: 1 },
    ];
  return {
    parts,
    tree: {
      name: 'Prüfbaugruppe',
      children: [{ partIndex: 0 }, { name: 'Antrieb', children: [{ partIndex: 1 }, { partIndex: 2 }] }],
    },
    close() {
      for (const shape of [plate, first, second]) shape.delete();
    },
  };
}

test('Shared definition writes one Lager product with two separately placed occurrences', () => {
  const f = placedFixture();
  try {
    const bytes = exportCadStep(oc, f.parts, { assemblyTree: f.tree }),
      text = stepText(bytes),
      tree = importStepWorldTree(oc, bytes);
    assert.equal(tree.length, 1);
    const root = tree[0];
    assert.equal(root.name, 'Prüfbaugruppe');
    assert.deepEqual(
      root.children.map((child) => child.name),
      ['Grundplatte', 'Antrieb'],
    );
    const [plate, drive] = root.children;
    assert.equal(drive.stats, undefined, 'Baugruppe bleibt Organisation ohne Körper');
    assert.deepEqual(
      drive.children.map((child) => child.name),
      ['Lager', 'Lager'],
    );
    near(plate.stats.volume, 100 * 60 * 5);
    nearBounds(plate.stats, [-50, -30, -2.5], [50, 30, 2.5]);

    const [first, second] = drive.children;
    for (const bearing of [first, second]) {
      near(bearing.stats.volume, 10 * 6 * 4);
      // 90 degree rotation: world extents are 6 x 10 x 4.
      [6, 10, 4].forEach((value, index) => near(extents(bearing.stats)[index], value, `Ausdehnung[${index}]`));
    }
    nearBounds(first.stats, [37, -5, -2], [43, 5, 2]);
    nearBounds(second.stats, [37, 7, -2], [43, 17, 2]);
    const delta = second.stats.bounds.min.map((value, index) => value - first.stats.bounds.min[index]);
    [0, 12, 0].forEach((value, index) => near(delta[index], value, `Weltversatz[${index}]`));
    assert.deepEqual(colors([plate, first, second]), [
      { color: '#cc3322', opacity: 1 },
      { color: '#2277cc', opacity: 1 },
      { color: '#2277cc', opacity: 1 },
    ]);

    // Written STEP: one PRODUCT for the shared Lager definition, and exactly two
    // usage occurrences that reference that same product entity.
    assert.equal([...text.matchAll(/PRODUCT\(/g)].length, 4, 'zwei Baugruppen, Platte und eine Lager-Definition');
    assert.equal([...text.matchAll(/NEXT_ASSEMBLY_USAGE_OCCURRENCE\(/g)].length, 4, 'Platte, Antrieb und zwei Lager');
    assert.equal([...text.matchAll(/PRODUCT\(\s*'Lager'/g)].length, 1, 'genau eine Lager-Definition');
    const usages = [
      ...text.matchAll(
        /NEXT_ASSEMBLY_USAGE_OCCURRENCE\(\s*'[^']*'\s*,\s*'Lager'\s*,\s*''\s*,\s*#\d+\s*,\s*#(\d+)\s*,\s*\$\)/g,
      ),
    ];
    assert.equal(usages.length, 2, 'genau zwei Lager-Vorkommen');
    assert.equal(usages[0][1], usages[1][1], 'beide Vorkommen referenzieren dieselbe Definition');
    // Placement is an occurrence location, not a second copy of the definition
    // body: the file contains the plate and the bearing geometry once each.
    assert.equal([...text.matchAll(/MANIFOLD_SOLID_BREP/g)].length, 2, 'Definitionen werden nur einmal geschrieben');
    assert.doesNotMatch(text, /TRIANGULATED_FACE|TESSELLATED_SHAPE|POLYGONAL_FACE_SET/);
  } finally {
    f.close();
  }
});

test('A shared definition keeps the individual occurrence names', () => {
  const f = placedFixture();
  try {
    const parts = f.parts.map((part, index) => (index === 2 ? { ...part, name: 'Lager rechts' } : part)),
      bytes = exportCadStep(oc, parts, { assemblyTree: f.tree }),
      text = stepText(bytes),
      drives = [
        ...text.matchAll(
          /NEXT_ASSEMBLY_USAGE_OCCURRENCE\(\s*'[^']*'\s*,\s*'([^']*)'\s*,\s*''\s*,\s*#[^,]+\s*,\s*#(\d+)/g,
        ),
      ].filter((match) => match[1].startsWith('Lager'));
    assert.deepEqual(
      drives.map((match) => match[1]),
      ['Lager', 'Lager rechts'],
      'Vorkommensnamen bleiben erhalten',
    );
    assert.equal(drives[0][2], drives[1][2], 'ein gemeinsames Produkt');
    assert.equal([...text.matchAll(/PRODUCT\(\s*'Lager'/g)].length, 1);
    const drive = importStepWorldTree(oc, bytes)[0].children[1];
    assert.deepEqual(
      drive.children.map((child) => child.name),
      ['Lager', 'Lager rechts'],
    );
    nearBounds(drive.children[0].stats, [37, -5, -2], [43, 5, 2]);
    nearBounds(drive.children[1].stats, [37, 7, -2], [43, 17, 2]);
  } finally {
    f.close();
  }
});

test('Parts without an id or with different ids stay separate definitions', () => {
  const baked = bakedFixture();
  try {
    const text = stepText(exportCadStep(oc, baked.parts, { assemblyTree: baked.tree })),
      usages = [
        ...text.matchAll(
          /NEXT_ASSEMBLY_USAGE_OCCURRENCE\(\s*'[^']*'\s*,\s*'Lager'\s*,\s*''\s*,\s*#\d+\s*,\s*#(\d+)\s*,\s*\$\)/g,
        ),
      ];
    assert.equal(
      [...text.matchAll(/PRODUCT\(\s*'Lager'/g)].length,
      2,
      'gleiche Geometrie ohne Kennung bleibt getrennt',
    );
    assert.equal(usages.length, 2);
    assert.notEqual(usages[0][1], usages[1][1], 'keine gemeinsame Definition');
    // The read-back placement is unchanged compared with the D4 fixture.
    const drive = importStepWorldTree(oc, exportCadStep(oc, baked.parts, { assemblyTree: baked.tree }))[0]
      .children[1];
    nearBounds(drive.children[0].stats, [37, -5, -2], [43, 5, 2]);
    nearBounds(drive.children[1].stats, [37, 7, -2], [43, 17, 2]);
  } finally {
    baked.close();
  }

  const placed = placedFixture();
  try {
    const parts = placed.parts.map((part, index) =>
        index === 2 ? { ...part, definitionId: 'lager-10x6x4-zweite' } : part,
      ),
      text = stepText(exportCadStep(oc, parts, { assemblyTree: placed.tree }));
    assert.equal([...text.matchAll(/PRODUCT\(\s*'Lager'/g)].length, 2, 'verschiedene Kennungen bleiben getrennt');
  } finally {
    placed.close();
  }
});

test('A reused native shape instance never shares a definition implicitly', () => {
  const shape = buildCadRecipe(oc, { type: 'box', size: [10, 6, 4] }),
    tree = { name: 'Prüfbaugruppe', children: [{ partIndex: 0 }, { partIndex: 1 }] },
    usages = (text) => [
      ...text.matchAll(
        /NEXT_ASSEMBLY_USAGE_OCCURRENCE\(\s*'[^']*'\s*,\s*'([^']*)'\s*,\s*''\s*,\s*#[^,]+\s*,\s*#(\d+)/g,
      ),
    ];
  try {
    // Same JS wrapper and therefore the same native TShape, but no ids. XCAF
    // would merge both AddShape calls into one PRODUCT named after the last part.
    const independent = [
        { shape, name: 'Unabhaengig A', color: '#cc3322', opacity: 1 },
        { shape, name: 'Unabhaengig B', color: '#2277cc', opacity: 1 },
      ],
      bytes = exportCadStep(oc, independent, { assemblyTree: tree }),
      text = stepText(bytes),
      lines = usages(text);
    assert.equal([...text.matchAll(/PRODUCT\(/g)].length, 3, 'Wurzel und zwei getrennte Teile');
    assert.equal([...text.matchAll(/PRODUCT\('Unabhaengig A'/g)].length, 1);
    assert.equal([...text.matchAll(/PRODUCT\('Unabhaengig B'/g)].length, 1);
    assert.deepEqual(
      lines.map((match) => match[1]),
      ['Unabhaengig A', 'Unabhaengig B'],
    );
    assert.notEqual(lines[0][2], lines[1][2], 'verschiedene Definitionen');
    const round = importStepWorldTree(oc, bytes)[0];
    assert.deepEqual(
      round.children.map((child) => child.name),
      ['Unabhaengig A', 'Unabhaengig B'],
    );
    assert.deepEqual(colors(round.children), [
      { color: '#cc3322', opacity: 1 },
      { color: '#2277cc', opacity: 1 },
    ]);

    // The same instance under two different explicit ids stays two definitions.
    const distinctText = stepText(
        exportCadStep(
          oc,
          [
            { ...independent[0], definitionId: 'unabhaengig-a' },
            { ...independent[1], definitionId: 'unabhaengig-b' },
          ],
          { assemblyTree: tree },
        ),
      ),
      distinctLines = usages(distinctText);
    assert.equal([...distinctText.matchAll(/PRODUCT\(/g)].length, 3);
    assert.deepEqual(
      distinctLines.map((match) => match[1]),
      ['Unabhaengig A', 'Unabhaengig B'],
    );
    assert.notEqual(distinctLines[0][2], distinctLines[1][2]);

    // An explicit shared id still references exactly one definition for the
    // same instance; only the unshared cases are isolated.
    const sharedLines = usages(
      stepText(
        exportCadStep(
          oc,
          [
            {
              shape,
              name: 'Lager',
              color: '#2277cc',
              definitionId: 'lager',
              placement: { translation: [0, 0, 0] },
            },
            {
              shape,
              name: 'Lager',
              color: '#2277cc',
              definitionId: 'lager',
              placement: { translation: [12, 0, 0] },
            },
          ],
          { assemblyTree: tree },
        ),
      ),
    );
    assert.equal(sharedLines.length, 2);
    assert.equal(sharedLines[0][2], sharedLines[1][2], 'ausdrückliche Definition bleibt gemeinsam');

    // A shared definition and an independent part must not share a TShape either.
    const mixedLines = usages(
      stepText(
        exportCadStep(
          oc,
          [
            {
              shape,
              name: 'Lager',
              color: '#2277cc',
              definitionId: 'lager',
              placement: { translation: [0, 0, 0] },
            },
            { shape, name: 'Einzelteil', color: '#22cc77', opacity: 1 },
          ],
          { assemblyTree: tree },
        ),
      ),
    );
    assert.deepEqual(
      mixedLines.map((match) => match[1]),
      ['Lager', 'Einzelteil'],
    );
    assert.notEqual(mixedLines[0][2], mixedLines[1][2]);
  } finally {
    shape.delete();
  }
});

test('Identity placement keeps the unrotated local definition placeable', () => {
  const f = placedFixture();
  try {
    const parts = f.parts.map((part, index) =>
        index === 0 ? part : { ...part, placement: { translation: [index * 20, 0, 0], rotationZ: 0 } },
      ),
      tree = importStepWorldTree(oc, exportCadStep(oc, parts, { assemblyTree: f.tree }))[0],
      [first, second] = tree.children[1].children;
    nearBounds(first.stats, [15, -3, -2], [25, 3, 2]);
    nearBounds(second.stats, [35, -3, -2], [45, 3, 2]);
    near(second.stats.bounds.min[0] - first.stats.bounds.min[0], 20);
  } finally {
    f.close();
  }
});

test('Conflicting definitions of one id are rejected unambiguously', () => {
  const f = placedFixture();
  try {
    const valid = f.parts,
      withSecond = (patch) => [valid[0], valid[1], { ...valid[2], ...patch }],
      rejects = (parts, message) => {
        assert.throws(
          () => exportCadStep(oc, parts, { assemblyTree: f.tree }),
          (error) => {
            assert.match(error.message, /Widersprüchliche STEP-Definition "lager-10x6x4"/);
            assert.match(error.message, message);
            return true;
          },
        );
      };
    // Different local geometry under the same id.
    const other = buildCadRecipe(oc, { type: 'box', size: [10, 6, 5] });
    try {
      rejects(withSecond({ shape: other }), /Definitionsform/);
    } finally {
      other.delete();
    }
    rejects(withSecond({ color: '#22cc77' }), /Darstellung/);
    rejects(withSecond({ opacity: 0.5 }), /Darstellung/);
    rejects(withSecond({ faceColors: [{ faceIndex: 1, color: '#112233', opacity: 1 }] }), /Darstellung/);
    // A body that already carries a different world placement cannot stand in
    // for the shared local definition either.
    const moved = transformCad(
      oc,
      buildCadRecipe(oc, { type: 'box', size: [10, 6, 4] }),
      [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 0, 0, 1],
    );
    try {
      rejects(withSecond({ shape: moved, placement: undefined }), /Definitionsform/);
    } finally {
      moved.delete();
    }
  } finally {
    f.close();
  }
});

test('Definition and placement inputs are validated before export', () => {
  const f = placedFixture();
  try {
    const parts = f.parts,
      tree = f.tree;
    for (const definitionId of ['', '   ', 42, true, 'x'.repeat(1001)])
      assert.throws(
        () => exportCadStep(oc, [parts[0], { ...parts[1], definitionId }, parts[2]], { assemblyTree: tree }),
        /Definitionskennung/,
      );
    for (const placement of [
      [],
      'Ort',
      7,
      { translation: [1, 2] },
      { translation: [0, 0, NaN] },
      { translation: [0, 0, 0, 0] },
      { rotationZ: '90' },
      { rotationZ: Infinity },
      { translation: [0, 0, 0], rotationZ: 0, extra: true },
    ])
      assert.throws(
        () => exportCadStep(oc, [parts[0], { ...parts[1], placement }, parts[2]], { assemblyTree: tree }),
        /STEP-Platzierung/,
      );
    // A placement only makes sense together with a definition id.
    assert.throws(
      () => exportCadStep(oc, [parts[0], { ...parts[1], definitionId: undefined }, parts[2]], { assemblyTree: tree }),
      /Platzierung benötigt eine Definitionskennung/,
    );
    // A shared occurrence keeps its own non-empty name; it is checked before
    // the shared label is reused.
    for (const name of ['', 42, 'x'.repeat(1001)])
      assert.throws(
        () => exportCadStep(oc, [parts[0], parts[1], { ...parts[2], name }], { assemblyTree: tree }),
        /STEP-Teilename/,
      );
    // Definition and placement inputs only exist inside the nested tree.
    const detached = parts.map((part) => ({ ...part, placement: undefined }));
    assert.throws(() => exportCadStep(oc, detached), /Definitionen benötigen einen Baugruppenbaum/);
    assert.throws(
      () => exportCadStep(oc, detached, { assemblyName: 'Baugruppe' }),
      /Definitionen benötigen einen Baugruppenbaum/,
    );
    assert.throws(
      () => exportCadStep(oc, [{ ...parts[0], definitionId: undefined, placement: { translation: [0, 0, 0] } }]),
      /Platzierungen benötigen einen Baugruppenbaum/,
    );
    // An invalid D4 body fails the same solid check as every other part.
    const wire = buildCadWire(oc, [
      { kind: 'line', start: [0, 0], end: [1, 0] },
      { kind: 'line', start: [1, 0], end: [1, 1] },
      { kind: 'line', start: [1, 1], end: [0, 0] },
    ]);
    try {
      assert.throws(
        () => exportCadStep(oc, [parts[0], { ...parts[1], shape: wire }, parts[2]], { assemblyTree: tree }),
        /CAD-Körper/,
      );
    } finally {
      wire.delete();
    }
  } finally {
    f.close();
  }
});

test('Assembly occurrences support a rigid placement around X and reject scaling and reflections', () => {
  const f = placedFixture();
  try {
    const pose = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 40, 20, 30, 1];
    const placed = [...f.parts];
    placed[2] = { ...placed[2], placement: { matrix: pose } };
    const result = importStepWorldTree(oc, exportCadStep(oc, placed, { assemblyTree: f.tree }));
    const bearing = result[0].children[1].children[1];
    // The box is centred at the local origin. Rotation about X swaps its
    // 6 mm depth and 4 mm height around the translated centre.
    nearBounds(bearing.stats, [35, 18, 27], [45, 22, 33]);
    for (const x of [-1, 2]) {
      const invalid = [...pose];
      invalid[0] = x;
      placed[2].placement = { matrix: invalid };
      assert.throws(() => exportCadStep(oc, placed, { assemblyTree: f.tree }), /starre Lage/);
    }
  } finally {
    f.close();
  }
});
