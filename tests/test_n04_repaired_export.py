"""N04: the confirmed repair state is exported as 3MF and STL unchanged.

Synthetic geometry only. The real conversion run needs the converter EXE and is
performed by the orchestrator.

Run from the repository root with the converter environment:
  converter/.venv/Scripts/python.exe -m unittest tests.n04_repaired_export
"""
from __future__ import annotations

import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

import numpy as np
import trimesh

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "converter"))

from stlstep.windows_repair import _write_input_package  # noqa: E402

CORE_NS = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02"


def read_3mf(path):
    with zipfile.ZipFile(path) as archive:
        model = ET.fromstring(archive.read("3D/3dmodel.model"))
    vertices = [[float(vertex.get(axis)) for axis in ("x", "y", "z")]
                for vertex in model.iter(f"{{{CORE_NS}}}vertex")]
    faces = [[int(triangle.get(axis)) for axis in ("v1", "v2", "v3")]
             for triangle in model.iter(f"{{{CORE_NS}}}triangle")]
    return trimesh.Trimesh(np.asarray(vertices, dtype=float),
                           np.asarray(faces, dtype=np.int64), process=False), model


class RepairedExportTest(unittest.TestCase):
    def setUp(self):
        self.mesh = trimesh.creation.box(extents=(10.0, 20.0, 30.0))
        self.mesh.apply_translation((1.5, -2.5, 3.5))

    def test_3mf_contains_one_millimetre_identity_mesh_and_reads_back(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "repaired.3mf"
            _write_input_package(self.mesh, path)
            loaded, model = read_3mf(path)
            self.assertEqual(model.get("unit"), "millimeter")
            self.assertEqual(len(list(model.iter(f"{{{CORE_NS}}}item"))), 1)
            for item in model.iter(f"{{{CORE_NS}}}item"):
                self.assertIsNone(item.get("transform"))
            loaded.merge_vertices()
            self.assertTrue(loaded.is_watertight)
            self.assertEqual(len(loaded.faces), len(self.mesh.faces))
            np.testing.assert_allclose(loaded.bounds, self.mesh.bounds, atol=1e-9)

    def test_stl_roundtrip_keeps_the_requested_millimetre_size(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "repaired.stl"
            self.mesh.export(path, file_type="stl")
            loaded = trimesh.load(path)
            self.assertTrue(loaded.is_watertight)
            np.testing.assert_allclose(loaded.extents, [10.0, 20.0, 30.0], atol=1e-5)
            np.testing.assert_allclose(loaded.bounds, self.mesh.bounds, atol=1e-5)


if __name__ == "__main__":
    unittest.main()
