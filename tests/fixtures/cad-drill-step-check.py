"""Independent native reader: topology and physical volume, no GUI/profile."""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(sys.argv[1]) / 'lib'))
import FreeCAD
import Part

shape = Part.Shape()
shape.read(sys.argv[2])
assert shape.isValid() and shape.isClosed() and len(shape.Solids) == 1
shape.check(True)
expected = float(sys.argv[3])
assert abs(shape.Volume - expected) < 0.0001, (shape.Volume, expected)
print(json.dumps(dict(ok=True, valid=True, closed=True, solids=1,
                     booleanCheck=True, volume=shape.Volume,
                     expectedVolume=expected, volumeDelta=shape.Volume-expected)))
