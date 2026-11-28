"""N03: Reparaturen nur innerhalb des Abweichungsbudgets übernehmen.

The repaired probe against the unchanged original is measured for real when the
private camera-holder files exist. Synthetic cases cover an accepted local
repair (Fassung), a deliberately shifted repair region and a bridged opening.

Run with the converter environment:
  converter/.venv/Scripts/python.exe -m unittest tests.test_n03_repair_budget
"""
from pathlib import Path
import json
import math
import os
import sys
import unittest
from unittest import mock

import numpy as np
import trimesh

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "converter"))

from stlstep.repair import RepairError, repair_mesh  # noqa: E402
import stlstep.repair as repair_module  # noqa: E402
from stlstep.repair_budget import assess_repair_candidate, topology_summary  # noqa: E402
from stlstep.surface_check import compare_surfaces  # noqa: E402


ORIGINAL = Path(os.environ["FORMNARO_N03_ORIGINAL"]) if "FORMNARO_N03_ORIGINAL" in os.environ else None
REPAIRED = Path(os.environ["FORMNARO_N03_REPAIRED"]) if "FORMNARO_N03_REPAIRED" in os.environ else None


def plate_with_square_hole(edge=10.0, thickness=2.0, hole=0.2):
    """Closed plate with one small genuine opening in the top face."""
    half, rim, top = edge / 2, hole / 2, thickness
    verts = [
        [-half, -half, 0], [half, -half, 0], [half, half, 0], [-half, half, 0],
        [-rim, -rim, top], [rim, -rim, top], [rim, rim, top], [-rim, rim, top],
        [-half, -half, top], [half, -half, top], [half, half, top], [-half, half, top],
    ]
    faces = [
        [0, 2, 1], [0, 3, 2],                                  # bottom
        [0, 1, 9], [0, 9, 8],                                  # front wall
        [1, 2, 10], [1, 10, 9],                                # right wall
        [2, 3, 11], [2, 11, 10],                               # back wall
        [3, 0, 8], [3, 8, 11],                                 # left wall
        [8, 9, 5], [8, 5, 4],                                  # top front strip
        [9, 10, 6], [9, 6, 5],                                 # top right strip
        [10, 11, 7], [10, 7, 6],                               # top back strip
        [11, 8, 4], [11, 4, 7],                                # top left strip
    ]
    mesh = trimesh.Trimesh(np.asarray(verts, dtype=float), np.asarray(faces), process=False)
    mesh.fix_normals(multibody=True)
    return mesh


def cap_hole(plate):
    """Add two coplanar triangles over the small square opening."""
    faces = np.vstack((plate.faces, np.asarray([[4, 5, 6], [4, 6, 7]])))
    mesh = trimesh.Trimesh(plate.vertices.copy(), faces, process=False)
    mesh.fix_normals(multibody=True)
    return mesh


def shift_vertex(mesh, index, offset):
    repaired = mesh.copy()
    repaired.vertices[index] = repaired.vertices[index] + np.asarray(offset, dtype=float)
    return repaired


def split_one_face(mesh):
    """Subdivide one triangle in its plane; coordinates and surface stay equal."""
    repaired, _ = subdivide_first_face(mesh)
    return repaired


def subdivide_first_face(mesh):
    """Subdivide one triangle and return the new centre vertex index too."""
    face = np.asarray(mesh.faces[0])
    centroid = mesh.vertices[face].mean(axis=0)
    vertices = np.vstack((mesh.vertices, centroid))
    middle = len(mesh.vertices)
    faces = np.vstack((mesh.faces[1:], np.asarray([
        [face[0], face[1], middle],
        [face[1], face[2], middle],
        [face[2], face[0], middle],
    ])))
    repaired = trimesh.Trimesh(vertices, faces, process=False)
    repaired.fix_normals(multibody=True)
    return repaired, middle


def split_side_plate():
    """Closed 40×40×20 plate with an internal wall at z=10 (outer-skin case)."""
    verts = [
        [0, 0, 0], [40, 0, 0], [40, 40, 0], [0, 40, 0],
        [0, 0, 10], [40, 0, 10], [40, 40, 10], [0, 40, 10],
        [0, 0, 20], [40, 0, 20], [40, 40, 20], [0, 40, 20],
    ]
    faces = [
        [0, 2, 1], [0, 3, 2],
        [8, 9, 10], [8, 10, 11],
        [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5],
        [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7],
        [4, 5, 9], [4, 9, 8], [5, 6, 10], [5, 10, 9],
        [6, 7, 11], [6, 11, 10], [7, 4, 8], [7, 8, 11],
        [4, 6, 5], [4, 7, 6],
    ]
    mesh = trimesh.Trimesh(np.asarray(verts, dtype=float), np.asarray(faces), process=False)
    mesh.fix_normals(multibody=True)
    return mesh


def duplicate_first_face(mesh):
    """Non-manifold defect (one face repeated) that forces the repair backend.

    A genuine boundary hole would be refused by the unchanged
    ``opening_bridged`` rule of ``_admit``; the real repair path is therefore
    exercised with a non-manifold opening that has no boundary loop.
    """
    faces = np.vstack((mesh.faces, mesh.faces[[0]]))
    damaged = trimesh.Trimesh(mesh.vertices.copy(), faces, process=False)
    damaged.fix_normals(multibody=True)
    return damaged


class N03RepairBudgetTests(unittest.TestCase):
    def test_accepted_local_repair_carries_topology_budget_and_fassung(self):
        reference = trimesh.creation.box(extents=[10, 10, 10])
        candidate = split_one_face(reference)
        admission = assess_repair_candidate(reference, candidate, budget_mm=0.15, samples=600)
        self.assertTrue(admission["accepted"], admission["reasons"])
        self.assertEqual(admission["kind"], "repaired")
        self.assertAlmostEqual(admission["threshold_mm"], 0.15)
        first = admission["measurement"]["directions"]["original_to_repaired"]
        second = admission["measurement"]["directions"]["repaired_to_original"]
        self.assertEqual(first["reference"], "original")
        self.assertEqual(second["reference"], "repaired")
        self.assertEqual(first["points"], admission["measurement"]["samples_per_direction"])
        self.assertLessEqual(admission["measurement"]["max_mm"], 0.15)
        self.assertEqual(admission["topology"]["before"]["faces"] + 2,
                         admission["topology"]["after"]["faces"])
        self.assertEqual(admission["repair_region"]["changed_faces"], 1)
        self.assertGreater(admission["outside_repair_region"]["faces"], 0)
        self.assertTrue(admission["outside_repair_region"]["preserved"])
        fassung = admission["fassung"]
        self.assertRegex(fassung["id"], r"^[a-f0-9]{64}$")
        self.assertRegex(fassung["origin_sha256"], r"^[a-f0-9]{64}$")
        self.assertRegex(fassung["result_sha256"], r"^[a-f0-9]{64}$")
        self.assertNotEqual(fassung["origin_sha256"], fassung["result_sha256"])
        again = assess_repair_candidate(reference, candidate, budget_mm=0.15, samples=600)
        self.assertEqual(again["fassung"]["id"], fassung["id"])
        json.dumps(admission, ensure_ascii=False)

    def test_deliberately_shifted_repair_region_is_refused_over_budget(self):
        reference = trimesh.creation.box(extents=[10, 10, 10])
        candidate = shift_vertex(reference, 0, [0.4, 0.0, 0.0])
        admission = assess_repair_candidate(reference, candidate, budget_mm=0.15, samples=600)
        self.assertFalse(admission["accepted"])
        self.assertIn("deviation_over_budget", admission["reasons"])
        self.assertGreater(admission["measurement"]["max_mm"], 0.15)
        self.assertGreater(admission["repair_region"]["changed_faces"], 0)
        self.assertIsNone(admission["fassung"])

    def test_bridged_opening_is_refused_even_within_distance_budget(self):
        reference = plate_with_square_hole()
        self.assertEqual(topology_summary(reference)["openings"], 1)
        candidate = cap_hole(reference)
        self.assertEqual(topology_summary(candidate)["openings"], 0)
        admission = assess_repair_candidate(reference, candidate, budget_mm=0.15,
                                            samples=600, adds_new_surface=True)
        self.assertLessEqual(admission["measurement"]["max_mm"], 0.15)
        self.assertTrue(admission["openings"]["bridged"])
        self.assertIn("opening_bridged", admission["reasons"])
        self.assertFalse(admission["accepted"])
        self.assertIsNone(admission["fassung"])

    @unittest.skipUnless(ORIGINAL is not None and REPAIRED is not None and ORIGINAL.is_file() and REPAIRED.is_file(),
                         "Private Kamerahalter-Prüfdateien fehlen; synthetische Fälle oben gelten.")
    def test_camera_holder_repaired_probe_is_admitted_by_the_outer_skin(self):
        reference = trimesh.load_mesh(str(ORIGINAL))
        reference.merge_vertices(digits_vertex=10)
        candidate = trimesh.load_mesh(str(REPAIRED))
        deviation = compare_surfaces(reference, candidate, 6000)
        self.assertAlmostEqual(deviation["sampled_max_mm"], 3.0136669003147323, places=6)
        self.assertEqual(deviation["stl_to_cad"]["reference"], "reference_mesh_surface")
        self.assertEqual(deviation["cad_to_stl"]["reference"], "candidate_mesh_surface")
        self.assertEqual(deviation["stl_to_cad"]["points"], 24000)
        self.assertEqual(len(deviation["stl_to_cad"]["max_point_mm"]), 3)
        self.assertEqual(round(deviation["stl_to_cad"]["max_point_mm"][2], 3), 9.037)
        admission = assess_repair_candidate(reference, candidate, budget_mm=0.15, samples=6000,
                                            adds_new_surface=False, deviation=deviation)
        # N03-B: the admitted outer-skin zone decides, while the raw comparison
        # (3.01 mm from the internal wall) stays visible in the report.
        self.assertTrue(admission["accepted"], admission["reasons"])
        self.assertEqual(admission["reasons"], [])
        self.assertEqual(admission["threshold_mm"], 0.15)
        self.assertEqual(admission["measurement"]["decided_by"], "outer-skin")
        outer = admission["measurement"]["outer_skin"]
        self.assertEqual(outer["method"], "outer-skin-v1")
        self.assertEqual(outer["excluded_faces"], 4)
        self.assertAlmostEqual(outer["excluded_area_mm2"], 212.375, places=3)
        self.assertEqual(outer["excluded_neighbourhood_mm"], 0.5)
        self.assertGreater(admission["measurement"]["raw"]["directions"]["original_to_repaired"]["max_mm"], 0.15)
        self.assertLess(admission["measurement"]["directions"]["original_to_repaired"]["max_mm"], 0.15)
        self.assertLess(admission["measurement"]["directions"]["repaired_to_original"]["max_mm"], 0.15)
        self.assertEqual(admission["topology"]["before"]["faces"], 22009)
        self.assertEqual(admission["topology"]["after"]["faces"], 22004)
        self.assertEqual(admission["topology"]["before"]["openings"], 2)
        self.assertEqual(admission["topology"]["after"]["openings"], 0)
        self.assertGreater(admission["outside_repair_region"]["faces"], 20000)
        self.assertTrue(admission["outside_repair_region"]["preserved"])
        self.assertIsNotNone(admission["fassung"])
        self.assertTrue(math.isfinite(admission["bounds_change_max_mm"]))
        self.assertLessEqual(admission["bounds_change_max_mm"], 1e-6)


class N03RepairPathTests(unittest.TestCase):
    """N03-C: the real ``repair_mesh`` path must reach the outer-skin decision."""

    def _repair_with_backend(self, original, candidate, samples=1200):
        """Run ``repair_mesh`` with only the geometry backend replaced.

        The defect, the budget gate, admission and report stay the production
        code. A fixed candidate keeps the synthetic outcome deterministic.
        """
        with mock.patch.object(repair_module, "_windows_available", return_value=False), \
                mock.patch.object(repair_module, "_meshfix_candidate",
                                  side_effect=lambda part, pymeshfix, method: candidate.copy()):
            return repair_mesh(original, budget_mm=0.15, samples=samples)

    def test_internal_wall_with_defect_is_admitted_via_outer_skin(self):
        original = duplicate_first_face(split_side_plate())
        candidate = trimesh.creation.box(bounds=([0, 0, 0], [40, 40, 20]))
        repaired, report = self._repair_with_backend(original, candidate)
        admission = report["admission"]
        self.assertTrue(report["applied"])
        self.assertIn("pymeshfix", report["backend"])
        self.assertTrue(admission["accepted"], admission["reasons"])
        self.assertEqual(admission["measurement"]["decided_by"], "outer-skin")
        self.assertEqual(admission["measurement"]["outer_skin"]["method"], "outer-skin-v1")
        self.assertEqual(admission["measurement"]["outer_skin"]["excluded_faces"], 2)
        # The raw comparison stays visible in the report and exceeds the budget.
        self.assertGreater(report["deviation"]["sampled_max_mm"], 0.15)
        raw = admission["measurement"]["raw"]["directions"]["original_to_repaired"]["max_mm"]
        self.assertGreater(raw, 0.15)
        self.assertLessEqual(admission["measurement"]["max_mm"], 0.15)
        self.assertLessEqual(admission["measurement"]["directions"]["original_to_repaired"]["max_mm"],
                             0.15)
        self.assertLessEqual(admission["measurement"]["directions"]["repaired_to_original"]["max_mm"],
                             0.15)
        self.assertIsNotNone(admission["fassung"])
        self.assertTrue(repaired.is_watertight)

    def test_shifted_outer_face_without_exclusion_keeps_raw_rejection(self):
        base = trimesh.creation.box(extents=[40, 40, 20])
        subdivided, middle = subdivide_first_face(base)
        candidate = subdivided.copy()
        # Move the new centre point into the body; bounds do not change.
        candidate.vertices[middle] = (
            candidate.vertices[middle] - 0.3 * np.asarray(base.face_normals[0], dtype=float))
        original = duplicate_first_face(subdivided)
        with self.assertRaises(RepairError) as raised:
            self._repair_with_backend(original, candidate)
        message = str(raised.exception)
        self.assertIn("Netzreparatur abgelehnt: Formabweichung", message)
        self.assertIn("Große Löcher werden nicht ungeprüft geschlossen.", message)

    def test_closed_through_hole_is_still_refused_as_bridged(self):
        original = plate_with_square_hole()
        candidate = trimesh.creation.box(bounds=([-5, -5, 0], [5, 5, 2]))
        with self.assertRaises(RepairError) as raised:
            self._repair_with_backend(original, candidate)
        self.assertIn("opening_bridged", str(raised.exception))


if __name__ == "__main__":
    unittest.main()
