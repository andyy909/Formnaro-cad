"""Converted freeform/analytic STEP bodies must pass the extended curve-on-surface check.

Run with the converter environment from the repository root:
  converter/.venv/Scripts/python.exe -m unittest tests.test_stl_step_curve_on_surface
"""
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / 'converter'))

import cadquery as cq  # noqa: E402
from stlstep.engine import Options, convert  # noqa: E402
from stlstep.freeform_verification import curve_on_surface_faults  # noqa: E402

EXAMPLES = ROOT / 'converter/examples'


def convert_example(name, **options):
    with tempfile.TemporaryDirectory() as directory:
        target = Path(directory) / (Path(name).stem + '.step')
        report = convert(EXAMPLES / name, target, Options(**options), lambda _: None, overwrite=True)
        shape = cq.importers.importStep(str(target)).val()
        return report, shape


def drill(shape):
    box = shape.BoundingBox()
    tool = cq.Workplane('XY').workplane(offset=box.zmin - 1).center((box.xmin + box.xmax) / 2, (box.ymin + box.ymax) / 2) \
        .circle(.5).extrude(box.zlen + 2).val()
    return shape.cut(tool)


class CurveOnSurfaceTests(unittest.TestCase):
    def check_case(self, name, **options):
        report, shape = convert_example(name, **options)
        self.assertTrue(report['valid'])
        self.assertEqual(report['solids'], 1)
        self.assertEqual(curve_on_surface_faults(shape), [], 'reimported STEP')
        self.assertLessEqual(report['deviation']['sampled_max_mm'] + report['tessellation_allowance_mm'], options.get('tolerance', .15))
        drilled = drill(shape)
        self.assertTrue(drilled.isValid())
        self.assertLess(drilled.Volume(), shape.Volume())
        self.assertEqual(curve_on_surface_faults(drilled), [], 'after follow-up drilling')
        return report

    def test_sinusoidal_freeform_edges_stay_within_tolerance(self):
        report = self.check_case('freiform-sinusoidal.stl', fallback=False)
        self.assertEqual(report['surface_types'].get('BSPLINE'), 1)

    def test_known_good_countersunk_plate_unchanged(self):
        report = self.check_case('platte-mit-zwei-senkungen.stl')
        self.assertEqual(report['output_faces'], 14)


if __name__ == '__main__':
    unittest.main()
