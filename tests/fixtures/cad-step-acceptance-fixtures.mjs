// Independent STEP reference and counterexample fixtures for the E1-E3
// acceptance. Every file is produced by the OCCT XCAF/STEP writers directly;
// neither `importCadStepAssembly` nor `exportCadStep` from src/cad-step-io.js
// participates in creating the inputs. The tests check the written Part 21
// structure before reading it, so a fixture cannot silently degrade into a
// plain single body.
import { buildCadRecipe, buildCadWire } from '../../src/cad-recipes.js';

// Write one XCAF document and return its STEP bytes. All names are ASCII, so the
// fixture does not depend on Formnaro's Part 21 label encoder either.
function writeXcaf(oc, path, build) {
  const values = [];
  const keep = (value) => (values.push(value), value);
  try {
    const document = keep(new oc.TDocStd_Document(keep(new oc.TCollection_ExtendedString('BinXCAF', true)))),
      main = keep(document.Main()),
      shapes = keep(oc.XCAFDoc_DocumentTool.ShapeTool(main)),
      colors = keep(oc.XCAFDoc_DocumentTool.ColorTool(main));
    oc.XCAFDoc_DocumentTool.SetLengthUnit(document, 0.001);
    const name = (label, text) =>
      keep(oc.TDataStd_Name.Set(label, keep(new oc.TCollection_ExtendedString(text, true))));
    const color = (label, hex, opacity = 1) => {
      const rgba = keep(new oc.Quantity_ColorRGBA());
      if (!oc.Quantity_ColorRGBA.ColorFromHex(hex, rgba, true)) throw Error(`Ungültige Fixture-Farbe ${hex}.`);
      rgba.SetAlpha(opacity);
      colors.SetColor(label, rgba, oc.XCAFDoc_ColorType.XCAFDoc_ColorSurf);
    };
    // Placement is deliberately not restricted to Formnaro's exporter subset:
    // any rotation axis and angle are accepted, exactly like a foreign CAD file.
    const add = (parent, part, translation, title, { axis = [0, 0, 1], angle = 0, hex, opacity = 1 } = {}) => {
      const transform = keep(new oc.gp_Trsf());
      if (angle) {
        const origin = keep(new oc.gp_Pnt(0, 0, 0)),
          direction = keep(new oc.gp_Dir(...axis));
        transform.SetRotation(keep(new oc.gp_Ax1(origin, direction)), angle);
      }
      transform.SetTranslationPart(keep(new oc.gp_Vec(...translation)));
      const component = keep(shapes.AddComponent(parent, part, keep(new oc.TopLoc_Location(transform))));
      name(component, title);
      if (hex) color(component, hex, opacity);
      return component;
    };
    build({ shapes, name, color, add });
    shapes.UpdateAssemblies();
    const writer = keep(new oc.STEPCAFControl_Writer()),
      progress = keep(new oc.Message_ProgressRange());
    writer.SetColorMode(true);
    writer.SetNameMode(true);
    oc.Interface_Static.SetCVal('write.step.unit', 'MM');
    oc.Interface_Static.SetIVal('write.step.schema', 4);
    if (!writer.Perform(document, path, progress)) throw Error('Acceptance fixture STEP writer failed');
    return oc.FS.readFile(path).slice();
  } finally {
    for (const value of values.reverse()) value?.delete?.();
    try {
      oc.FS.unlink(path);
    } catch {}
  }
}

function box(oc, size) {
  return buildCadRecipe(oc, { type: 'box', size });
}

// The rotated reference assembly from the accepted target values: a
// 100 x 60 x 5 plate at the origin, one "Antrieb" subassembly at [40,0,0]
// rotated 90 degrees about Z, and two occurrences of one 10 x 6 x 4 "Lager"
// definition at local [0,0,0] and [12,0,0]. The bearing origins in world
// coordinates are therefore [40,0,0] and [40,12,0] mm.
export function stepReferenceAssembly(oc) {
  return writeXcaf(oc, '/acceptance-reference.step', ({ shapes, name, add }) => {
    const root = shapes.NewShape(),
      drive = shapes.NewShape(),
      plate = shapes.AddShape(box(oc, [100, 60, 5]), false, true),
      bearing = shapes.AddShape(box(oc, [10, 6, 4]), false, true);
    name(root, 'Referenzbaugruppe');
    name(drive, 'Antrieb');
    name(plate, 'Grundplatte');
    name(bearing, 'Lager');
    add(root, plate, [0, 0, 0], 'Grundplatte', { hex: '#cc3322' });
    add(root, drive, [40, 0, 0], 'Antrieb', { angle: Math.PI / 2 });
    add(drive, bearing, [0, 0, 0], 'Lager', { hex: '#2277cc' });
    add(drive, bearing, [12, 0, 0], 'Lager', { hex: '#2277cc' });
  });
}

// Two independent definitions with the same name and different geometry. A
// reader that merges by name would lose one body or one size.
export function stepSameNameDefinitions(oc, { identicalGeometry = false } = {}) {
  return writeXcaf(oc, '/acceptance-same-name.step', ({ shapes, name, add }) => {
    const root = shapes.NewShape(),
      small = shapes.AddShape(box(oc, [10, 6, 4]), false, true),
      large = shapes.AddShape(box(oc, [10, identicalGeometry ? 6 : 8, 4]), false, true);
    name(root, 'Namensgleiche Teile');
    name(small, 'Lager');
    name(large, 'Lager');
    add(root, small, [0, 0, 0], 'Lager', { hex: '#2277cc' });
    add(root, large, [20, 0, 0], 'Lager', { hex: identicalGeometry ? '#2277cc' : '#cc7722' });
  });
}

// One subassembly definition used by two occurrences. Its single child is a
// shared bearing definition. A reader that caches by name or drops repeated
// subtrees would return one group or one child, not two of each.
export function stepReusedSubgroup(oc) {
  return writeXcaf(oc, '/acceptance-reused-group.step', ({ shapes, name, add }) => {
    const root = shapes.NewShape(),
      drive = shapes.NewShape(),
      bearing = shapes.AddShape(box(oc, [10, 6, 4]), false, true);
    name(root, 'Wiederverwendete Gruppe');
    name(drive, 'Antrieb');
    name(bearing, 'Lager');
    add(drive, bearing, [0, 0, 0], 'Lager', { hex: '#2277cc' });
    add(root, drive, [40, 0, 0], 'Antrieb');
    add(root, drive, [0, 40, 0], 'Antrieb', { angle: Math.PI / 2 });
  });
}

// Rotations about X instead of Z, both on the parent group and on the child
// placement. Build the fixture directly in XCAF to keep it independent of
// the product's placement conversion.
export function stepOtherRotationAxis(oc) {
  return writeXcaf(oc, '/acceptance-axis-x.step', ({ shapes, name, add }) => {
    const root = shapes.NewShape(),
      drive = shapes.NewShape(),
      bearing = shapes.AddShape(box(oc, [10, 6, 4]), false, true);
    name(root, 'Drehachse X');
    name(drive, 'Antrieb X');
    name(bearing, 'Lager');
    add(drive, bearing, [0, 0, 0], 'Lager', { hex: '#2277cc' });
    add(drive, bearing, [0, 12, 0], 'Lager', { hex: '#2277cc' });
    add(root, drive, [40, 0, 0], 'Antrieb X', { axis: [1, 0, 0], angle: Math.PI / 2 });
  });
}

// An open planar sheet without any solid. The documented import contract only
// accepts closed CAD solids, so this file must be rejected as a whole.
export function stepFlatSheet(oc) {
  const values = [];
  const keep = (value) => (values.push(value), value);
  const path = '/acceptance-flat-sheet.step';
  try {
    const wire = keep(
        buildCadWire(oc, [
          { kind: 'line', start: [-25, -15], end: [25, -15] },
          { kind: 'line', start: [25, -15], end: [25, 15] },
          { kind: 'line', start: [25, 15], end: [-25, 15] },
          { kind: 'line', start: [-25, 15], end: [-25, -15] },
        ]),
      ),
      face = keep(keep(new oc.BRepBuilderAPI_MakeFace(wire, true)).Face()),
      writer = keep(new oc.STEPControl_Writer()),
      progress = keep(new oc.Message_ProgressRange());
    oc.Interface_Static.SetCVal('write.step.unit', 'MM');
    if (writer.Transfer(face, oc.STEPControl_StepModelType.STEPControl_AsIs, true, progress) === false)
      throw Error('Flat-sheet fixture transfer failed');
    if (!writer.Write(path)) throw Error('Flat-sheet fixture STEP writer failed');
    return oc.FS.readFile(path).slice();
  } finally {
    for (const value of values.reverse()) value?.delete?.();
    try {
      oc.FS.unlink(path);
    } catch {}
  }
}
