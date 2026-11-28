"""N03-B: the admitted outer-skin method decides the repair admission.

Synthetic cases only. The real camera-holder parity run lives in
``work/rueckgabe/paritaet.py`` (local evidence, not committed).

Run from the repository root with the converter environment:
  converter/.venv/Scripts/python.exe -m unittest tests.test_outer_skin
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np
import trimesh

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "converter"))

from stlstep.outer_skin import (  # noqa: E402
    OUTER_SKIN_BUDGET_MM,
    build_outer_skin_reference,
    detect_planar_patches,
    evaluate_outer_skin,
)
from stlstep.repair_budget import assess_repair_candidate  # noqa: E402


def box(minimum=(0, 0, 0), maximum=(40, 40, 40)):
    return trimesh.creation.box(bounds=(np.asarray(minimum, dtype=float),
                                       np.asarray(maximum, dtype=float)))


def split_side_plate():
    """Closed 40×40×20 plate whose side walls are split at z=10.

    The internal wall at z=10 shares the ring vertices with all four side
    walls, so removing it keeps exactly one connected, closed component.
    """
    verts = [
        [0, 0, 0], [40, 0, 0], [40, 40, 0], [0, 40, 0],          # bottom
        [0, 0, 10], [40, 0, 10], [40, 40, 10], [0, 40, 10],      # ring
        [0, 0, 20], [40, 0, 20], [40, 40, 20], [0, 40, 20],      # top
    ]
    faces = [
        [0, 2, 1], [0, 3, 2],                                    # bottom
        [8, 9, 10], [8, 10, 11],                                 # top
        [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5],              # front/right lower
        [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7],              # back/left lower
        [4, 5, 9], [4, 9, 8], [5, 6, 10], [5, 10, 9],            # front/right upper
        [6, 7, 11], [6, 11, 10], [7, 4, 8], [7, 8, 11],          # back/left upper
        [4, 6, 5], [4, 7, 6],                                    # internal wall
    ]
    mesh = trimesh.Trimesh(np.asarray(verts, dtype=float), np.asarray(faces), process=False)
    mesh.fix_normals(multibody=True)
    return mesh


def plate_with_square_hole():
    """Closed plate with one small genuine opening in the top face."""
    half, rim, top = 5.0, 0.1, 2.0
    verts = [
        [-half, -half, 0], [half, -half, 0], [half, half, 0], [-half, half, 0],
        [-rim, -rim, top], [rim, -rim, top], [rim, rim, top], [-rim, rim, top],
        [-half, -half, top], [half, -half, top], [half, half, top], [-half, half, top],
    ]
    faces = [
        [0, 2, 1], [0, 3, 2],
        [0, 1, 9], [0, 9, 8], [1, 2, 10], [1, 10, 9],
        [2, 3, 11], [2, 11, 10], [3, 0, 8], [3, 8, 11],
        [8, 9, 5], [8, 5, 4], [9, 10, 6], [9, 6, 5],
        [10, 11, 7], [10, 7, 6], [11, 8, 4], [11, 4, 7],
    ]
    mesh = trimesh.Trimesh(np.asarray(verts, dtype=float), np.asarray(faces), process=False)
    mesh.fix_normals(multibody=True)
    return mesh


class PlanarPatchTest(unittest.TestCase):
    def test_box_has_six_planar_patches(self):
        found = detect_planar_patches(box())
        self.assertEqual(len(found["patches"]), 6)
        self.assertEqual(found["degenerate"], 0)
        for patch in found["patches"]:
            self.assertEqual(len(patch["faces"]), 2)
            self.assertAlmostEqual(patch["area"], 1600.0, places=6)


class OuterSkinAdmissionTest(unittest.TestCase):
    def test_internal_wall_passes_via_outer_skin_while_raw_exceeds_budget(self):
        original = split_side_plate()
        repair = box(maximum=(40, 40, 20))
        built = build_outer_skin_reference(original)
        self.assertTrue(built["report"]["proven"])
        self.assertEqual(built["report"]["excluded_faces"], 2)
        self.assertAlmostEqual(built["report"]["excluded_area_mm2"], 1600.0, places=6)

        result = evaluate_outer_skin(original=original, candidate=repair,
                                     samples=(1200,), budget=OUTER_SKIN_BUDGET_MM)
        self.assertEqual(result["decided_by"], "outer-skin")
        self.assertGreater(result["runs"][0]["raw"]["worst"], OUTER_SKIN_BUDGET_MM)
        self.assertLess(result["runs"][0]["skin"]["worst"], OUTER_SKIN_BUDGET_MM)

        admission = assess_repair_candidate(original, repair, budget_mm=OUTER_SKIN_BUDGET_MM,
                                            samples=1200, adds_new_surface=False)
        self.assertTrue(admission["accepted"], admission["reasons"])
        measurement = admission["measurement"]
        self.assertEqual(measurement["decided_by"], "outer-skin")
        self.assertEqual(measurement["outer_skin"]["method"], "outer-skin-v1")
        self.assertEqual(measurement["outer_skin"]["excluded_faces"], 2)
        self.assertEqual(measurement["outer_skin"]["excluded_neighbourhood_mm"], 0.5)
        self.assertGreater(measurement["raw"]["directions"]["original_to_repaired"]["max_mm"],
                           OUTER_SKIN_BUDGET_MM)
        self.assertLess(measurement["directions"]["original_to_repaired"]["max_mm"],
                        OUTER_SKIN_BUDGET_MM)
        self.assertTrue(admission["fassung"])

    def test_closed_hole_is_refused_even_when_skin_is_not_proven(self):
        original = plate_with_square_hole()
        repair = box(minimum=(-5, -5, 0), maximum=(5, 5, 2))
        admission = assess_repair_candidate(original, repair, budget_mm=OUTER_SKIN_BUDGET_MM,
                                            samples=1200, adds_new_surface=True)
        self.assertFalse(admission["accepted"])
        self.assertIn("opening_bridged", admission["reasons"])
        self.assertEqual(admission["measurement"]["decided_by"], "raw")
        self.assertFalse(admission["measurement"]["outer_skin"]["proven"])

    def test_shifted_outer_face_stays_measured_outside_the_excluded_neighbourhood(self):
        original = split_side_plate()
        shifted = box(maximum=(40.3, 40, 20))
        admission = assess_repair_candidate(original, shifted, budget_mm=OUTER_SKIN_BUDGET_MM,
                                            samples=1200, adds_new_surface=False)
        self.assertFalse(admission["accepted"])
        self.assertEqual(admission["measurement"]["decided_by"], "outer-skin")
        self.assertIn("deviation_over_budget", admission["reasons"])
        self.assertGreater(admission["measurement"]["max_mm"], OUTER_SKIN_BUDGET_MM)


if __name__ == "__main__":
    unittest.main()
