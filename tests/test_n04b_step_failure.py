"""N04-B: a confirmed repair survives a failed STEP build.

Synthetic geometry only. The real converter EXE run is performed by the
orchestrator.

Run from the repository root with the converter environment:
  converter/.venv/Scripts/python.exe -m unittest tests.test_n04b_step_failure
"""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from unittest import mock

import numpy as np
import trimesh

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "converter"))

import stlstep.engine as engine  # noqa: E402
from stlstep.engine import ConversionError, Options, StepConversionError  # noqa: E402

CORE_NS = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02"


def damaged_box():
    """Box with one clipped triangle edge (a real, repairable T seam)."""
    mesh = trimesh.creation.box(extents=(10.0, 20.0, 30.0))
    mesh.apply_translation((1.5, -2.5, 3.5))
    mesh.merge_vertices(digits_vertex=10)
    face = np.asarray(mesh.faces[0])
    first, second, third = mesh.vertices[face]
    middle = (first + second) / 2
    vertices = np.vstack((mesh.vertices, middle))
    index = len(mesh.vertices)
    faces = np.vstack((mesh.faces[1:], np.asarray([
        [face[0], index, face[2]],
        [index, face[1], face[2]],
    ])))
    damaged = trimesh.Trimesh(vertices, faces, process=False)
    damaged.fix_normals(multibody=True)
    return damaged


def plate_with_square_hole(edge=10.0, thickness=2.0, hole=0.2):
    """Closed plate with one genuine opening; the repair must be refused."""
    half, rim, top = edge / 2, hole / 2, thickness
    vertices = [
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
    plate = trimesh.Trimesh(np.asarray(vertices, dtype=float),
                            np.asarray(faces), process=False)
    plate.fix_normals(multibody=True)
    return plate


def read_3mf(path):
    with zipfile.ZipFile(path) as archive:
        model = ET.fromstring(archive.read("3D/3dmodel.model"))
    vertices = [[float(vertex.get(axis)) for axis in ("x", "y", "z")]
                for vertex in model.iter(f"{{{CORE_NS}}}vertex")]
    faces = [[int(triangle.get(axis)) for axis in ("v1", "v2", "v3")]
             for triangle in model.iter(f"{{{CORE_NS}}}triangle")]
    return trimesh.Trimesh(np.asarray(vertices, dtype=float),
                           np.asarray(faces, dtype=np.int64), process=False), model


class StepFailureKeepsRepairTest(unittest.TestCase):
    def setUp(self):
        self.mesh = damaged_box()
        self.options = Options(mode="exact", repair=True, samples=600)

    def convert(self, source, output):
        return engine.convert(source, output, self.options)

    def test_confirmed_repair_is_exported_when_the_step_build_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            source = directory / "kaputt.stl"
            destination = directory / "teil.step"
            self.mesh.export(source, file_type="stl")
            with mock.patch.object(engine, "_roundtrip_candidates",
                                   side_effect=ConversionError("STEP-Testfehler")):
                with self.assertRaises(StepConversionError) as caught:
                    self.convert(source, destination)
            self.assertIn("STEP-Testfehler", str(caught.exception))
            report = caught.exception.report
            self.assertEqual(report["step"]["status"], "failed")
            self.assertIn("STEP-Testfehler", report["step"]["message"])
            self.assertEqual(report["status"], "repair_only")
            self.assertIsNone(report["output"])
            self.assertFalse(report["valid"])
            self.assertTrue(report["repair_valid"])
            # Original, repair state and STEP outcome stay separate.
            self.assertEqual(report["original"]["triangles"], 13)
            self.assertEqual(report["repair"]["triangles"], 14)
            self.assertTrue(report["repair"]["accepted"])
            self.assertTrue(report["repair"]["changed"])
            self.assertEqual(report["repair"]["backend"], "local.split_collinear_seams")
            self.assertEqual(report["repair"]["unit"], "mm")
            self.assertEqual(report["step"]["status"], "failed")
            # Report is on disk and no STEP or preview was published.
            on_disk = json.loads((directory / "teil.bericht.json").read_text(encoding="utf-8"))
            self.assertEqual(on_disk["step"]["status"], "failed")
            self.assertFalse(destination.exists())
            self.assertFalse((directory / "teil.vorschau.stl").exists())

    def test_repaired_stl_and_3mf_read_back_watertight_with_repair_bounds(self):
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            source = directory / "kaputt.stl"
            destination = directory / "teil.step"
            self.mesh.export(source, file_type="stl")
            with mock.patch.object(engine, "_roundtrip_candidates",
                                   side_effect=ConversionError("STEP-Testfehler")):
                with self.assertRaises(StepConversionError) as caught:
                    self.convert(source, destination)
            report = caught.exception.report
            expected_bounds = np.asarray(report["repair"]["bounds_mm"], dtype=float)
            stl_path = directory / "teil.repariert.stl"
            stl = trimesh.load(stl_path, file_type="stl")
            self.assertTrue(stl.is_watertight)
            self.assertEqual(len(stl.faces), report["repair"]["triangles"])
            np.testing.assert_allclose(stl.bounds, expected_bounds, atol=1e-6)
            three_mf, model = read_3mf(directory / "teil.repariert.3mf")
            self.assertEqual(model.get("unit"), "millimeter")
            three_mf.merge_vertices()
            self.assertTrue(three_mf.is_watertight)
            self.assertEqual(len(three_mf.faces), report["repair"]["triangles"])
            np.testing.assert_allclose(three_mf.bounds, expected_bounds, atol=1e-9)
            self.assertEqual(report["repaired_mesh"], str(stl_path))
            self.assertEqual(report["repaired_3mf"], str(directory / "teil.repariert.3mf"))

    def test_refused_repair_writes_no_repair_files_and_no_report(self):
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            source = directory / "loch.stl"
            destination = directory / "teil.step"
            plate_with_square_hole().export(source, file_type="stl")
            with self.assertRaises(ConversionError) as caught:
                self.convert(source, destination)
            self.assertNotIsInstance(caught.exception, StepConversionError)
            self.assertEqual(sorted(p.name for p in directory.iterdir()), ["loch.stl"])


if __name__ == "__main__":
    unittest.main()
