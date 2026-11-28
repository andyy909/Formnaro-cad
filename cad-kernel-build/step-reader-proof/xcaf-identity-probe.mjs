// Native XCAF identity probe for the STEP occurrence contract.
//
// The productive importer keeps the fast C++ bridge for geometry. This probe
// records what the current WASM ABI exposes from JS, validates the native label
// derivation (shared definition, unique occurrence path, local placement) on an
// XCAF document built through the public writer API, and checks the bridge JSON
// contract on the rotated nested fixture.
//
// Contract per element: definitionId, occurrencePath and localTransform (row
// major 3x4, the element's own XCAF placement). A leaf additionally carries
// definitionName when the definition label really names the definition, and its
// BRep as the shared definition geometry in intrinsic local CAD pose, marked by
// brepVersion 2. The accumulated build pose is parent * localTransform, so the
// occurrence placement is never baked into the BRep as well.
//
//   node cad-kernel-build/step-reader-proof/xcaf-identity-probe.mjs
//   node cad-kernel-build/step-reader-proof/xcaf-identity-probe.mjs --require-identity
//
// Without --require-identity a runtime whose bridge predates the identity
// fields reports PATCHED-READER-NOT-IN-RUNTIME and still succeeds. With the flag
// that state, a missing brepVersion 2 marker or a placement baked into a leaf
// BRep is a failure, so a rebuilt runtime can gate the real contract.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadCadKernel } from '../../src/cad-kernel-loader.js';
import { stepPartName } from '../../src/cad-step-io.js';
import { buildCadRecipe } from '../../src/cad-recipes.js';
import { readCadBrep, transformCad, cadBounds } from '../../src/cad-native-kernel.js';
import { stepOccurrenceFixture } from '../../tests/fixtures/cad-exchange-step-occurrences.mjs';
import { importStepWorldTree } from '../../tests/fixtures/cad-step-world-tree.mjs';

const requireIdentity = process.argv.includes('--require-identity');
const oc = await loadCadKernel({ print: () => {}, printErr: () => {} });
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
const report = (label, value) => console.log(`${label}: ${value}`);
const near = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? 'value'}: ${actual} != ${expected}`);
const nearValues = (actual, expected, message) => {
  assert.ok(
    Array.isArray(actual) && actual.length === expected.length,
    `${message}: ${expected.length} Werte erwartet`,
  );
  actual.forEach((value, index) => {
    assert.ok(Number.isFinite(value), `${message}: Wert ${index} ist nicht endlich`);
    near(value, expected[index], `${message}[${index}]`);
  });
};
const nearMatrix = (actual, expected, message) => {
  assert.ok(Array.isArray(actual) && actual.length === 12, `${message}: 12 Matrixwerte erwartet`);
  nearValues(actual, expected, message);
};
const failure = (run) => {
  try {
    run();
    return null;
  } catch (error) {
    return String(error?.message ?? error).split('\n')[0];
  }
};
// Row-major 3x4 product: the accumulated build pose of a child element.
const multiply = (parent, local) => {
  const out = new Array(12).fill(0);
  for (let row = 0; row < 3; row++)
    for (let column = 0; column < 4; column++) {
      let sum = column === 3 ? parent[row * 4 + 3] : 0;
      for (let step = 0; step < 3; step++) sum += parent[row * 4 + step] * local[step * 4 + column];
      out[row * 4 + column] = sum;
    }
  return out;
};
// The kernel's 16-value affine array is column-major (translation at 12..14).
const toAffine16 = (m) => {
  const out = new Array(16).fill(0);
  for (let row = 0; row < 3; row++)
    for (let column = 0; column < 4; column++) out[column * 4 + row] = m[row * 4 + column];
  out[15] = 1;
  return out;
};
// World bounds of a leaf BRep, optionally placed by an accumulated 3x4 pose.
const boundsOf = (brep, matrix) => {
  const shape = readCadBrep(oc, brep);
  let placed;
  try {
    placed = matrix ? transformCad(oc, shape, toAffine16(matrix)) : shape;
    const bounds = cadBounds(oc, placed);
    return [...bounds.min, ...bounds.max];
  } finally {
    if (placed && placed !== shape) placed.delete();
    shape.delete();
  }
};
// The occurrence chain is read top-down; parents * localTransform is the pose.
const chainOf = (roots, target) => {
  let chain = null;
  const walk = (node, parents) => {
    const poses = [...parents, node.localTransform ?? identity];
    if (node === target) {
      chain = poses;
      return true;
    }
    return (node.children ?? []).some((child) => walk(child, poses));
  };
  (Array.isArray(roots) ? roots : [roots]).some((root) => walk(root, []));
  assert.ok(chain, 'Zielknoten liegt nicht im Baum');
  return chain.reduce(multiply);
};

// --- 0. Source contract of the C++ bridge (no kernel build in this lane) ---
const source = fs.readFileSync(new URL('../wrappers/formnaro-cad-bridge.cpp', import.meta.url), 'utf8');
const sourceContract = {
  'brepVersion-2-Marker': source.includes('brepVersion\\":2'),
  'definitionName am Blatt': source.includes('definitionName\\":') && source.includes('definitionTitle(definition)'),
  Definitionsgeometrie: source.includes('WriteNoTriangles(local)'),
  'keine eingebackene Platzierung': !source.includes('Moved(location)'),
};
console.log('Quellvertrag der Brücke');
for (const [name, present] of Object.entries(sourceContract)) report(`  ${name}`, present ? 'ja' : 'nein');
for (const [name, present] of Object.entries(sourceContract))
  assert.ok(present, `C++-Brücke verletzt den Vertrag: ${name}`);

// --- 1. What the current WASM ABI actually offers -------------------------
const abi = {
    STEPCAFControl_Writer: typeof oc.STEPCAFControl_Writer,
    STEPCAFControl_Reader: typeof oc.STEPCAFControl_Reader,
    STEPControl_Reader: typeof oc.STEPControl_Reader,
    TDF_Tool: typeof oc.TDF_Tool,
    'XCAFDoc_ShapeTool.GetReferredShape': typeof oc.XCAFDoc_ShapeTool?.GetReferredShape,
    'XCAFDoc_ShapeTool.GetComponents': typeof oc.XCAFDoc_ShapeTool?.GetComponents,
    'XCAFDoc_ShapeTool.GetLocation': typeof oc.XCAFDoc_ShapeTool?.GetLocation,
    'XCAFDoc_ShapeTool.prototype.GetFreeShapes': typeof oc.XCAFDoc_ShapeTool?.prototype?.GetFreeShapes,
    'FormnaroCadBridge.ReadStepAssemblyJson': typeof oc.FormnaroCadBridge?.ReadStepAssemblyJson,
  },
  sequenceFailure = failure(() => new oc.NCollection_Sequence_TDF_Label()),
  nameIdFailure = failure(() => oc.TDataStd_Name.GetID());
console.log('ABI des geladenen CAD-Kerns');
for (const [name, type] of Object.entries(abi)) report(`  ${name}`, type);
report('  new NCollection_Sequence_TDF_Label()', sequenceFailure ?? 'ok');
report('  TDataStd_Name.GetID()', nameIdFailure ?? 'ok');

// The productive bridge and its placement accessors are the minimum this
// contract relies on. Only XCAF writer-side APIs are usable from JS today.
assert.equal(abi['STEPCAFControl_Writer'], 'function');
assert.equal(abi['XCAFDoc_ShapeTool.GetReferredShape'], 'function');
assert.equal(abi['XCAFDoc_ShapeTool.GetComponents'], 'function');
assert.equal(abi['XCAFDoc_ShapeTool.GetLocation'], 'function');
assert.equal(abi['FormnaroCadBridge.ReadStepAssemblyJson'], 'function');

const jsIdentityGap = [];
if (abi['STEPCAFControl_Reader'] !== 'function') jsIdentityGap.push('STEPCAFControl_Reader ist nicht gebunden');
if (abi['TDF_Tool'] !== 'function') jsIdentityGap.push('TDF_Tool ist nicht gebunden');
if (sequenceFailure) jsIdentityGap.push('TDF_LabelSequence ist nicht konstruierbar');
if (nameIdFailure) jsIdentityGap.push('TDataStd_Name.GetID ist nicht aufrufbar');
report('  Lücke für einen reinen JS-Weg', jsIdentityGap.length ? jsIdentityGap.join('; ') : 'keine');

// --- 2. Native XCAF labels carry the identity contract --------------------
// Build the same topology as the fixture and keep the document alive. The
// labels come from the public XCAF writer API, not from STEP text.
function buildIdentityDocument() {
  const values = [],
    keep = (value) => (values.push(value), value),
    doc = keep(new oc.TDocStd_Document(keep(new oc.TCollection_ExtendedString('BinXCAF', true)))),
    main = keep(doc.Main()),
    shapes = keep(oc.XCAFDoc_DocumentTool.ShapeTool(main)),
    name = (label, text) =>
      keep(oc.TDataStd_Name.Set(label, keep(new oc.TCollection_ExtendedString(stepPartName(text), true)))),
    root = keep(shapes.NewShape()),
    drive = keep(shapes.NewShape()),
    plate = keep(shapes.AddShape(keep(buildCadRecipe(oc, { type: 'box', size: [100, 60, 5] })), false, true)),
    bearing = keep(shapes.AddShape(keep(buildCadRecipe(oc, { type: 'box', size: [10, 6, 4] })), false, true));
  oc.XCAFDoc_DocumentTool.SetLengthUnit(doc, 0.001);
  name(root, 'Prüfbaugruppe');
  name(drive, 'Antrieb');
  name(plate, 'Grundplatte');
  name(bearing, 'Lager');
  const add = (parent, part, xyz, title, angle = 0) => {
    const transform = keep(new oc.gp_Trsf()),
      vector = keep(new oc.gp_Vec(...xyz));
    if (angle) {
      const axis = keep(new oc.gp_Ax1(keep(new oc.gp_Pnt(0, 0, 0)), keep(new oc.gp_Dir(0, 0, 1))));
      transform.SetRotation(axis, angle);
      transform.SetTranslationPart(vector);
    } else transform.SetTranslation(vector);
    const component = keep(shapes.AddComponent(parent, part, keep(new oc.TopLoc_Location(transform))));
    name(component, title);
    return component;
  };
  const plateOccurrence = add(root, plate, [0, 0, 0], 'Grundplatte'),
    driveOccurrence = add(root, drive, [40, 0, 0], 'Antrieb', Math.PI / 2),
    bearingOne = add(drive, bearing, [0, 0, 0], 'Lager'),
    bearingTwo = add(drive, bearing, [12, 0, 0], 'Lager'),
    // A third usage with a different name proves identity comes from the label,
    // not from equal occurrence names.
    bearingThree = add(drive, bearing, [24, 0, 0], 'Lager rechts');
  shapes.UpdateAssemblies();
  // A native occurrence path is the ancestor tag chain of the label.
  const entry = (label) => {
    const tags = [];
    let current = label;
    while (!current.IsNull() && !current.IsRoot()) {
      tags.unshift(current.Tag());
      current = keep(current.Father());
    }
    return '0' + tags.map((tag) => ':' + tag).join('');
  };
  const matrix = (location) => {
    if (!location || location.IsIdentity()) return identity.slice();
    const transform = location.Transformation(),
      values = [];
    for (let row = 1; row <= 3; row++)
      for (let column = 1; column <= 4; column++) values.push(transform.Value(row, column));
    return values;
  };
  const placement = (label) => {
    const referred = keep(new oc.TDF_Label()),
      reference = oc.XCAFDoc_ShapeTool.GetReferredShape(label, referred),
      definition = reference ? referred : label;
    return {
      path: entry(label),
      reference,
      definitionPath: entry(definition),
      local: matrix(reference ? oc.XCAFDoc_ShapeTool.GetLocation(label) : null),
    };
  };
  return {
    root: placement(root),
    plate: placement(plateOccurrence),
    drive: placement(driveOccurrence),
    bearingOne: placement(bearingOne),
    bearingTwo: placement(bearingTwo),
    bearingThree: placement(bearingThree),
    close: () => values.reverse().forEach((value) => value?.delete?.()),
  };
}

const document = buildIdentityDocument();
try {
  report('Nativer Definitionspfad beider Lager', document.bearingOne.definitionPath);
  assert.equal(document.bearingOne.reference, true);
  assert.equal(document.bearingTwo.reference, true);
  assert.equal(document.bearingOne.definitionPath, document.bearingTwo.definitionPath);
  assert.equal(document.bearingThree.definitionPath, document.bearingOne.definitionPath);
  assert.notEqual(document.bearingOne.path, document.bearingTwo.path);
  assert.notEqual(document.bearingThree.path, document.bearingOne.path);
  nearMatrix(document.bearingOne.local, identity, 'Lager 1 lokal');
  nearMatrix(document.bearingTwo.local, [1, 0, 0, 12, 0, 1, 0, 0, 0, 0, 1, 0], 'Lager 2 lokal');
  nearMatrix(document.bearingThree.local, [1, 0, 0, 24, 0, 1, 0, 0, 0, 0, 1, 0], 'Lager 3 lokal');
  nearMatrix(document.drive.local, [0, -1, 0, 40, 1, 0, 0, 0, 0, 0, 1, 0], 'Antrieb lokal');
  nearMatrix(document.plate.local, identity, 'Grundplatte lokal');
  nearMatrix(document.root.local, identity, 'Wurzel lokal');
  const paths = [
    document.root.path,
    document.plate.path,
    document.drive.path,
    document.bearingOne.path,
    document.bearingTwo.path,
    document.bearingThree.path,
  ];
  assert.equal(new Set(paths).size, paths.length, 'Vorkommenspfade müssen eindeutig sein');
} finally {
  document.close();
}

// --- 3. Bridge JSON contract on the rotated nested fixture ----------------
const bytes = stepOccurrenceFixture(oc),
  tree = importStepWorldTree(oc, bytes);
assert.equal(tree.length, 1);
assert.equal(tree[0].name, 'Prüfbaugruppe');
assert.deepEqual(
  tree[0].children.map((child) => child.name),
  ['Grundplatte', 'Antrieb'],
);
const [plateNode, driveNode] = tree[0].children,
  [bearingOneNode, bearingTwoNode] = driveNode.children;
assert.deepEqual(
  driveNode.children.map((child) => child.name),
  ['Lager', 'Lager'],
);
// Measure both reader generations in the assembled world frame.
near(plateNode.stats.volume, 30000, 'Plattenvolumen');
nearValues(
  [...plateNode.stats.bounds.min, ...plateNode.stats.bounds.max],
  [-50, -30, -2.5, 50, 30, 2.5],
  'Plattengrenzen',
);
for (const [node, expected] of [
  [bearingOneNode, [37, -5, -2, 43, 5, 2]],
  [bearingTwoNode, [37, 7, -2, 43, 17, 2]],
]) {
  near(node.stats.volume, 240, 'Lagervolumen');
  nearValues([...node.stats.bounds.min, ...node.stats.bounds.max], expected, 'Lagergrenzen');
}

const readBridge = (stepBytes, name) => {
  const path = `/${name}.step`;
  oc.FS.writeFile(path, stepBytes);
  try {
    return JSON.parse(oc.FormnaroCadBridge.ReadStepAssemblyJson(path));
  } finally {
    try {
      oc.FS.unlink(path);
    } catch {}
  }
};

const raw = readBridge(bytes, 'xcaf-identity-probe');
assert.equal(raw.length, 1);
assert.equal(raw[0].name, 'Prüfbaugruppe');
assert.deepEqual(
  raw[0].children.map((child) => child.name),
  ['Grundplatte', 'Antrieb'],
);
const rawPlate = raw[0].children[0],
  rawDrive = raw[0].children[1],
  [rawBearingOne, rawBearingTwo] = rawDrive.children,
  nodes = [raw[0], rawPlate, rawDrive, rawBearingOne, rawBearingTwo],
  identityKeys = ['definitionId', 'occurrencePath', 'localTransform'],
  present = nodes.map((node) => identityKeys.filter((key) => key in node));

report('Brückenfelder je Knoten', JSON.stringify(present));
assert.ok(
  present.every((keys) => keys.length === 0) || present.every((keys) => keys.length === identityKeys.length),
  'Identitätsfelder müssen je Knoten vollständig oder gar nicht vorhanden sein',
);
if (present[0].length === 0) {
  console.log(
    'PATCHED-READER-NOT-IN-RUNTIME: Die geladene WASM-Brücke liefert noch keine Definition-ID, keinen Vorkommenspfad und keine lokale Transform.',
  );
  if (requireIdentity)
    assert.fail(
      'Die geladene WASM-Brücke enthält den C++-Leserpatch noch nicht; Runtime neu bauen und materialisieren.',
    );
} else {
  for (const node of nodes) {
    assert.match(node.definitionId, /^0(?::\d+)+$/, 'Definition-ID ist ein nativer TDF-Pfad');
    assert.match(node.occurrencePath, /^0(?::\d+)+(?:\/0(?::\d+)+)*$/, 'Vorkommenspfad ist ein nativer TDF-Pfad');
    assert.ok(Array.isArray(node.localTransform) && node.localTransform.length === 12);
  }
  const paths = nodes.map((node) => node.occurrencePath);
  assert.equal(new Set(paths).size, paths.length, 'Vorkommenspfade müssen eindeutig sein');
  assert.equal(rawBearingOne.definitionId, rawBearingTwo.definitionId, 'beide Lager teilen eine Definition');
  assert.notEqual(rawBearingOne.occurrencePath, rawBearingTwo.occurrencePath);
  assert.notEqual(rawPlate.definitionId, rawBearingOne.definitionId, 'Grundplatte ist eine eigene Definition');
  nearMatrix(rawBearingOne.localTransform, identity, 'Brücke Lager 1 lokal');
  nearMatrix(rawBearingTwo.localTransform, [1, 0, 0, 12, 0, 1, 0, 0, 0, 0, 1, 0], 'Brücke Lager 2 lokal');
  nearMatrix(rawDrive.localTransform, [0, -1, 0, 40, 1, 0, 0, 0, 0, 0, 1, 0], 'Brücke Antrieb lokal');
  nearMatrix(rawPlate.localTransform, identity, 'Brücke Grundplatte lokal');
  nearMatrix(raw[0].localTransform, identity, 'Brücke Wurzel lokal');

  // One shared definition geometry in intrinsic local CAD pose: not one BRep per
  // occurrence, and never the occurrence placement inside the geometry.
  for (const leaf of [rawPlate, rawBearingOne, rawBearingTwo]) {
    assert.equal(leaf.brepVersion, 2, 'Blatt trägt den versionierten Geometriemarker');
    assert.ok(
      typeof leaf.definitionName === 'undefined' ||
        (typeof leaf.definitionName === 'string' &&
          leaf.definitionName.length > 0 &&
          !leaf.definitionName.startsWith('=>')),
      'definitionName ist nur als sauberer Definitionsname vorhanden',
    );
  }
  assert.equal(rawBearingOne.brep, rawBearingTwo.brep, 'beide Lager teilen genau eine Definitionsgeometrie');
  assert.notEqual(rawPlate.brep, rawBearingOne.brep, 'verschiedene Definitionen bleiben verschieden');
  assert.equal(rawBearingTwo.definitionName, rawBearingOne.definitionName, 'gleiche Definition, gleicher Name');
  report('Definitionsname der Lager', rawBearingOne.definitionName ?? 'nicht verfügbar');

  // Intrinsic pose of the shared bearing definition, then the accumulated build
  // pose from the tree. A geometry that still carried the placement would now be
  // placed a second time.
  nearValues(boundsOf(rawBearingOne.brep), [-5, -3, -2, 5, 3, 2], 'Lager-Definitionsgeometrie');
  nearValues(boundsOf(rawPlate.brep), [-50, -30, -2.5, 50, 30, 2.5], 'Platten-Definitionsgeometrie');
  nearValues(boundsOf(rawBearingOne.brep, chainOf(raw, rawBearingOne)), [37, -5, -2, 43, 5, 2], 'Lager 1 Einbaulage');
  nearValues(boundsOf(rawBearingOne.brep, chainOf(raw, rawBearingTwo)), [37, 7, -2, 43, 17, 2], 'Lager 2 Einbaulage');
  nearValues(boundsOf(rawPlate.brep, chainOf(raw, rawPlate)), [-50, -30, -2.5, 50, 30, 2.5], 'Grundplattenlage');
  console.log(
    'IDENTITY-CONTRACT-OK: gemeinsame Definition, eindeutige Vorkommenspfade, intrinsische Definitionsgeometrie und lokale Platzierungen stimmen.',
  );
}

// --- 4. Own-location definition, colours/faces and reference chains ------
// A definition whose own XCAF location is part of its shape, painted on the part
// and on one face, used twice inside a subassembly that is placed rotated, and
// that subassembly used twice itself. A reader can wrongly read the own location
// twice: inside the geometry *and* as the element's own transform.
function writeOwnLocationFixture() {
  const values = [],
    keep = (value) => (values.push(value), value),
    path = '/xcaf-own-location.step',
    doc = keep(new oc.TDocStd_Document(keep(new oc.TCollection_ExtendedString('BinXCAF', true)))),
    main = keep(doc.Main()),
    shapes = keep(oc.XCAFDoc_DocumentTool.ShapeTool(main)),
    colors = keep(oc.XCAFDoc_DocumentTool.ColorTool(main));
  try {
    oc.XCAFDoc_DocumentTool.SetLengthUnit(doc, 0.001);
    const name = (label, text) =>
      keep(oc.TDataStd_Name.Set(label, keep(new oc.TCollection_ExtendedString(stepPartName(text), true))));
    const paint = (label, hex, alpha = 1) => {
      const colour = keep(new oc.Quantity_ColorRGBA());
      oc.Quantity_ColorRGBA.ColorFromHex(hex, colour, true);
      colour.SetAlpha(alpha);
      colors.SetColor(label, colour, oc.XCAFDoc_ColorType.XCAFDoc_ColorSurf);
    };
    const transform = (xyz, angle = 0) => {
      const value = keep(new oc.gp_Trsf()),
        vector = keep(new oc.gp_Vec(...xyz));
      if (angle) {
        const axis = keep(new oc.gp_Ax1(keep(new oc.gp_Pnt(0, 0, 0)), keep(new oc.gp_Dir(0, 0, 1))));
        value.SetRotation(axis, angle);
        value.SetTranslationPart(vector);
      } else value.SetTranslation(vector);
      return value;
    };
    const component = (parent, part, xyz, title, hex, angle = 0) => {
      const label = keep(shapes.AddComponent(parent, part, keep(new oc.TopLoc_Location(transform(xyz, angle)))));
      name(label, title);
      if (hex) paint(label, hex);
      return label;
    };
    // The definition shape itself carries an own location: [0,0,5] mm. A reader
    // can read that pose twice, once inside the geometry and once as the
    // element's own transform.
    const rawBoss = keep(buildCadRecipe(oc, { type: 'box', size: [10, 6, 4] })),
      locatedBoss = keep(rawBoss.Moved(keep(new oc.TopLoc_Location(transform([0, 0, 5]))))),
      boss = keep(shapes.AddShape(locatedBoss, false, true));
    name(boss, 'Bock');
    // A second definition without own location carries the part colour and one
    // painted face. The STEP writer drops definition colours of located shapes,
    // so colour coverage needs this separate definition.
    const decoratedShape = keep(buildCadRecipe(oc, { type: 'box', size: [10, 6, 4] })),
      decorated = keep(shapes.AddShape(decoratedShape, false, true));
    name(decorated, 'Farbteil');
    paint(decorated, '#3366cc', 0.5);
    const explorer = keep(new oc.TopExp_Explorer(decoratedShape, oc.TopAbs_ShapeEnum.TopAbs_FACE)),
      faceLabel = keep(shapes.AddSubShape(decorated, keep(explorer.Current()))),
      facePainted = !faceLabel.IsNull();
    if (facePainted) paint(faceLabel, '#ffcc22');
    const root = keep(shapes.NewShape()),
      carrier = keep(shapes.NewShape());
    name(root, 'Eigene-Lage-Baugruppe');
    name(carrier, 'Traeger');
    component(root, carrier, [30, 0, 0], 'Traeger links', undefined, Math.PI / 2);
    component(root, carrier, [0, 40, 0], 'Traeger hinten');
    component(carrier, boss, [0, 0, 0], 'Bock 1');
    component(carrier, boss, [20, 0, 0], 'Bock 2', '#22bb55');
    component(carrier, decorated, [0, -25, 0], 'Farbe 1');
    component(carrier, decorated, [15, -25, 0], 'Farbe 2', '#22bb55');
    shapes.UpdateAssemblies();
    const writer = keep(new oc.STEPCAFControl_Writer()),
      progress = keep(new oc.Message_ProgressRange());
    writer.SetColorMode(true);
    writer.SetNameMode(true);
    oc.Interface_Static.SetCVal('write.step.unit', 'MM');
    oc.Interface_Static.SetIVal('write.step.schema', 4);
    if (!writer.Perform(doc, path, progress)) throw Error('Own-location fixture STEP writer failed');
    return { bytes: oc.FS.readFile(path).slice(), facePainted };
  } finally {
    for (const value of values.reverse()) value?.delete?.();
    try {
      oc.FS.unlink(path);
    } catch {}
  }
}

const ownFixture = writeOwnLocationFixture(),
  own = readBridge(ownFixture.bytes, 'xcaf-own-location-probe');
assert.equal(own.length, 1);
assert.equal(own[0].name, 'Eigene-Lage-Baugruppe');
assert.deepEqual(
  own[0].children.map((child) => child.name),
  ['Traeger links', 'Traeger hinten'],
);
const [ownCarrierOne, ownCarrierTwo] = own[0].children,
  [ownFirst, ownSecond, ownPaintOne, ownPaintTwo] = ownCarrierOne.children ?? [],
  [ownBackFirst, ownBackSecond] = ownCarrierTwo.children ?? [];
assert.ok(
  ownFirst && ownSecond && ownPaintOne && ownPaintTwo && ownBackFirst && ownBackSecond,
  'je zwei Bock- und zwei Farbteil-Vorkommen erwartet',
);
report(
  'Eigene-Lage-Böcke',
  JSON.stringify(
    [ownFirst, ownSecond, ownPaintOne, ownPaintTwo].map((leaf) => [
      leaf.name,
      leaf.appearance?.color ?? null,
      leaf.appearance?.opacity ?? null,
    ]),
  ),
);
// Colours: the part colour is inherited from the definition, the instance colour
// overrides it, and the painted definition face stays a face colour.
assert.equal(ownPaintOne.appearance.color, '#3366cc');
assert.ok(Math.abs(ownPaintOne.appearance.opacity - 0.5) < 1e-6, `Deckkraft ${ownPaintOne.appearance.opacity}`);
assert.equal(ownPaintTwo.appearance.color, '#22bb55');
assert.equal(ownSecond.appearance.color, '#22bb55');
if (ownFixture.facePainted)
  for (const leaf of [ownPaintOne, ownPaintTwo])
    assert.ok(
      (leaf.faceColors ?? []).some((style) => style.appearance.color === '#ffcc22'),
      `Flächenfarbe der Definitionsfläche fehlt an ${leaf.name}`,
    );

// World pose: own pose [0,0,5] inside the Bock definition, carrier one rotated
// 90 degrees about Z at [30,0,0], carrier two at [0,40,0], the reference chain is
// therefore two levels deep and used twice.
const ownWorld = [
  [ownFirst, [27, -5, 3, 33, 5, 7]],
  [ownSecond, [27, 15, 3, 33, 25, 7]],
  [ownBackFirst, [-5, 37, 3, 5, 43, 7]],
  [ownBackSecond, [15, 37, 3, 25, 43, 7]],
  [ownPaintOne, [52, -5, -2, 58, 5, 2]],
];
if (present[0].length === 0) {
  // Unpatched runtime: the bridge already returns the placed geometry.
  for (const [leaf, expected] of ownWorld) nearValues(boundsOf(leaf.brep), expected, `Weltlage ${leaf.name}`);
} else {
  for (const [leaf, expected] of ownWorld)
    nearValues(boundsOf(leaf.brep, chainOf(own, leaf)), expected, `${leaf.name} Einbaulage ohne doppelte Platzierung`);
  // STEPCAF represents this fixture's authored 5 mm definition offset in the
  // transferred placement chain. The BRep and the chain must carry it once.
  for (const leaf of [ownFirst, ownSecond, ownBackFirst, ownBackSecond]) {
    nearValues(boundsOf(leaf.brep), [-5, -3, -2, 5, 3, 2], `${leaf.name} lokale Definitionsgrenzen`);
    near(chainOf(own, leaf)[11], 5, `${leaf.name} übertragener Z-Versatz`);
  }
  for (const leaf of [ownPaintOne, ownPaintTwo])
    nearValues(boundsOf(leaf.brep), [-5, -3, -2, 5, 3, 2], `${leaf.name} Definitionsgeometrie ohne Einbaulage`);
  assert.equal(ownFirst.definitionId, ownBackSecond.definitionId, 'alle Bock-Vorkommen teilen eine Definition');
  assert.equal(ownFirst.brep, ownBackSecond.brep, 'eine Definitionsgeometrie für alle Bock-Vorkommen');
  const ownPaths = [
    ownCarrierOne,
    ownCarrierTwo,
    ownFirst,
    ownSecond,
    ownPaintOne,
    ownPaintTwo,
    ownBackFirst,
    ownBackSecond,
  ].map((node) => node.occurrencePath);
  assert.equal(new Set(ownPaths).size, ownPaths.length, 'Vorkommenspfade bleiben über alle Verwendungen eindeutig');
  assert.ok(ownFirst.occurrencePath.startsWith(`${ownCarrierOne.occurrencePath}/`), 'Blattpfad enthält den Elternpfad');
  assert.ok(
    ownBackFirst.occurrencePath.startsWith(`${ownCarrierTwo.occurrencePath}/`),
    'zweite Verwendung der Unterbaugruppe hat einen eigenen Elternpfad',
  );
  assert.notEqual(ownCarrierOne.definitionId, ownFirst.definitionId, 'Traeger und Bock sind eigene Definitionen');
  console.log('OWN-LOCATION-OK: eigene Definitionslage, Farben/Flächen und Referenzkette ohne doppelte Platzierung.');
}
