"""Write a foreign STEP sample with the installed FreeCAD, without user data.

Run only through scripts/step-freecad-foreign-sample.mjs, which creates an
isolated FreeCAD profile below work/ and passes the output paths in environment
variables. Positional FreeCAD arguments would be opened as documents after the
script, so the paths travel in the environment. The script is deliberately
independent of Formnaro's STEP reader and exporter: FreeCAD builds the solid and
writes the Part 21 file with its own OCCT kernel.
"""
import json
import math
import os

import FreeCAD
import Part

step_path = os.environ["FORMNARO_STEP_SAMPLE_STEP"]
expected_path = os.environ["FORMNARO_STEP_SAMPLE_EXPECTED"]

document = FreeCAD.newDocument("Fremdprobe")

# 40 x 30 x 6 mm plate, centred in X/Y and resting on Z=0, with one 8 mm
# through hole at (5, 5). The analytic values below are computed from these
# dimensions only, not from the imported STEP.
box = Part.makeBox(40, 30, 6, FreeCAD.Vector(-20, -15, 0))
hole = Part.makeCylinder(4, 6, FreeCAD.Vector(5, 5, 0))
solid = box.cut(hole)
part = document.addObject("Part::Feature", "Fremdplatte")
part.Shape = solid
document.recompute()

Part.export([part], step_path)

volume = 40.0 * 30.0 * 6.0 - math.pi * 4.0 * 4.0 * 6.0
expected = {
    "generator": "FreeCAD",
    "freeCadVersion": ".".join(str(value) for value in FreeCAD.Version()[0:3]),
    "occtVersion": str(getattr(Part, "OCC_VERSION", "unbekannt")),
    "name": "Fremdplatte",
    "bounds": {"min": [-20.0, -15.0, 0.0], "max": [20.0, 15.0, 6.0]},
    "volume": volume,
    "solidCount": 1,
    "feature": "40x30x6 plate with one through hole d8 at (5,5)",
}
with open(expected_path, "w", encoding="utf-8") as handle:
    json.dump(expected, handle, indent=2, ensure_ascii=False)
    handle.write("\n")
print(json.dumps({"step": step_path, "expected": expected}, ensure_ascii=False))
