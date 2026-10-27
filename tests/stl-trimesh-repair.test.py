"""Geometry-preserving cleanup and explicit small-hole behavior."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

import numpy as np
import trimesh

spec = importlib.util.spec_from_file_location('repair', Path(__file__).parents[1] / 'scripts/repair-stl-trimesh.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RepairTests(unittest.TestCase):
    def test_clean_box_preserves_surface_volume_and_dimensions(self):
        mesh = trimesh.creation.box(extents=[20, 30, 40])
        result, report = module.repair(mesh)
        self.assertTrue(report['candidateClosedSingleBody'])
        self.assertEqual(report['boundsMaxChange'], 0)
        self.assertEqual(report['relativeVolumeChange'], 0)
        self.assertEqual(report['addedFaces'], 0)
        self.assertEqual(len(result.faces), len(mesh.faces))

    def test_degenerate_duplicate_and_reversed_face(self):
        mesh = trimesh.creation.box()
        faces = mesh.faces.copy()
        faces[0] = faces[0][::-1]
        mesh = trimesh.Trimesh(mesh.vertices, np.vstack([faces, faces[1], [0, 0, 0]]), process=False)
        result, report = module.repair(mesh)
        self.assertEqual(report['removedDegenerateFaces'], 1)
        self.assertEqual(report['removedDuplicateFaces'], 1)
        self.assertGreater(report['flippedFaces'], 0)
        self.assertTrue(report['candidateClosedSingleBody'])
        self.assertAlmostEqual(result.volume, 1)

    def test_inverted_shell_reports_material_volume_unchanged(self):
        box = trimesh.creation.box()
        box.invert()
        result, report = module.repair(box)
        self.assertTrue(report['candidateClosedSingleBody'])
        self.assertEqual(report['relativeVolumeChange'], 0)
        self.assertEqual(result.volume, 1)

    def test_hole_is_only_closed_when_requested(self):
        box = trimesh.creation.box()
        mesh = trimesh.Trimesh(box.vertices, box.faces[1:], process=False)
        unchanged, report = module.repair(mesh)
        self.assertFalse(report['candidateClosedSingleBody'])
        result, report = module.repair(mesh, True)
        self.assertTrue(report['candidateClosedSingleBody'])
        self.assertEqual(report['addedFaces'], 1)
        self.assertAlmostEqual(result.volume, box.volume)
        self.assertFalse(unchanged.is_watertight)

    def test_large_boundary_is_not_filled(self):
        box = trimesh.creation.icosphere(subdivisions=2)
        mesh = trimesh.Trimesh(box.vertices, box.faces[box.triangles_center[:, 2] < .3], process=False)
        _, report = module.repair(mesh, True)
        self.assertFalse(report['candidateClosedSingleBody'])
        self.assertEqual(report['addedFaces'], 0)

    def test_export_retains_ascii_precision_and_refuses_overwrite(self):
        mesh = trimesh.creation.box()
        mesh.apply_translation([12345.123456789, 0, 0])
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'mesh.stl'
            module.write_ascii_stl(mesh, output)
            reopened = trimesh.load_mesh(output, process=False)
            self.assertTrue(np.array_equal(mesh.bounds, reopened.bounds))
            with self.assertRaises(FileExistsError):
                module.write_ascii_stl(mesh, output)

    def test_multibody_remains_multibody(self):
        a, b = trimesh.creation.box(), trimesh.creation.box()
        b.apply_translation([3, 0, 0])
        _, report = module.repair(trimesh.util.concatenate([a, b]))
        self.assertFalse(report['candidateClosedSingleBody'])
        self.assertEqual(report['after']['components'], 2)

    def test_collinear_t_junction_preserves_surface_without_hole_filling(self):
        box = trimesh.creation.box()
        a, b, c = box.faces[0]
        vertices = np.vstack([box.vertices, (box.vertices[a] + box.vertices[b]) / 2])
        middle = len(vertices) - 1
        faces = np.vstack([box.faces[1:], [a, middle, c], [middle, b, c], [a, b, middle]])
        mesh = trimesh.Trimesh(vertices, faces, process=False)
        _, simple = module.repair(mesh)
        self.assertFalse(simple['candidateClosedSingleBody'])
        result, report = module.repair(mesh, resolve_collinear=True)
        self.assertTrue(report['candidateClosedSingleBody'])
        self.assertEqual(report['splitNeighborFaces'], 1)
        self.assertEqual(report['addedFaces'], 0)
        self.assertEqual(report['boundsMaxChange'], 0)
        self.assertEqual(result.area, box.area)
        self.assertEqual(result.volume, box.volume)


if __name__ == '__main__':
    unittest.main()
