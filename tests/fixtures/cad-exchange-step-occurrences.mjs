// Synthetic XCAF fixture for the occurrence-identity probe. It is deliberately
// independent of the STEP reader under test and mirrors the independent target
// values in work/Referenz-Baugruppe.json: one plate, one rotated subassembly and
// two occurrences of the same bearing definition with the same occurrence name.
import {buildCadRecipe} from '../../src/cad-recipes.js';
import {stepPartName} from '../../src/cad-step-io.js';

export function stepOccurrenceFixture(oc) {
  const values = [],
    keep = (value) => (values.push(value), value),
    path = '/occurrences-fixture.step';
  try {
    const doc = keep(new oc.TDocStd_Document(keep(new oc.TCollection_ExtendedString('BinXCAF', true)))),
      main = keep(doc.Main()),
      shapes = keep(oc.XCAFDoc_DocumentTool.ShapeTool(main));
    oc.XCAFDoc_DocumentTool.SetLengthUnit(doc, 0.001);
    const name = (label, text) =>
      keep(oc.TDataStd_Name.Set(label, keep(new oc.TCollection_ExtendedString(stepPartName(text), true))));
    const root = keep(shapes.NewShape()),
      drive = keep(shapes.NewShape()),
      plate = keep(shapes.AddShape(keep(buildCadRecipe(oc, {type: 'box', size: [100, 60, 5]})), false, true)),
      bearing = keep(shapes.AddShape(keep(buildCadRecipe(oc, {type: 'box', size: [10, 6, 4]})), false, true));
    name(root, 'Prüfbaugruppe');
    name(drive, 'Antrieb');
    name(plate, 'Grundplatte');
    name(bearing, 'Lager');
    function add(parent, part, xyz, title, angle = 0) {
      const transform = keep(new oc.gp_Trsf()),
        vector = keep(new oc.gp_Vec(...xyz));
      if (angle) {
        const axis = keep(new oc.gp_Ax1(keep(new oc.gp_Pnt(0, 0, 0)), keep(new oc.gp_Dir(0, 0, 1))));
        transform.SetRotation(axis, angle);
        transform.SetTranslationPart(vector);
      } else transform.SetTranslation(vector);
      const location = keep(new oc.TopLoc_Location(transform)),
        component = keep(shapes.AddComponent(parent, part, location));
      name(component, title);
      return component;
    }
    add(root, plate, [0, 0, 0], 'Grundplatte');
    add(root, drive, [40, 0, 0], 'Antrieb', Math.PI / 2);
    // Both occurrences refer to the same `bearing` part label, so the written
    // STEP file contains one definition and two usage occurrences.
    add(drive, bearing, [0, 0, 0], 'Lager');
    add(drive, bearing, [12, 0, 0], 'Lager');
    shapes.UpdateAssemblies();
    const writer = keep(new oc.STEPCAFControl_Writer()),
      progress = keep(new oc.Message_ProgressRange());
    writer.SetColorMode(true);
    writer.SetNameMode(true);
    oc.Interface_Static.SetCVal('write.step.unit', 'MM');
    oc.Interface_Static.SetIVal('write.step.schema', 4);
    if (!writer.Perform(doc, path, progress)) throw Error('Occurrence fixture STEP writer failed');
    return oc.FS.readFile(path).slice();
  } finally {
    for (const value of values.reverse()) value?.delete?.();
    try {
      oc.FS.unlink(path);
    } catch {}
  }
}
