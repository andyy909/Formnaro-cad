"""Local Windows Printing3D repair, preserving the provider's explicit topology.

The result deliberately retains distinct indices at coincident coordinates.
Do not round-trip it through STL or merge its vertices before validating vertex
fans and constructing index-based CAD topology. The Windows algorithm can also
change geometry or remove shells: this adapter does not certify its result.
"""
from __future__ import annotations

import asyncio
from importlib import metadata
import math
import os
from pathlib import Path
import platform
import tempfile
import time
import xml.etree.ElementTree as ET
import zipfile

import numpy as np
import trimesh


class WindowsRepairError(ValueError):
    """A readable Windows provider failure."""


_CORE_NS = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
_PACKAGES = (
    "winrt-runtime", "winrt-Windows.Foundation", "winrt-Windows.Foundation.Collections",
    "winrt-Windows.Graphics.Printing3D", "winrt-Windows.Storage", "winrt-Windows.Storage.Streams",
)
_SOURCES = {
    "slicer_api_call_chain": "https://github.com/SoftFever/OrcaSlicer/blob/v2.3.0/src/slic3r/Utils/FixModelByWin10.cpp",
    "windows_api": "https://learn.microsoft.com/en-us/uwp/api/windows.graphics.printing3d.printing3dmodel.repairasync",
    "python_projection": "https://github.com/pywinrt/pywinrt",
}


def _provider_metadata():
    """Record the runtime registered for this public Windows API."""
    import winreg
    key_path = (r"SOFTWARE\Microsoft\WindowsRuntime\ActivatableClassId"
                r"\Windows.Graphics.Printing3D.Printing3DModel")
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path) as key:
            dll_path = winreg.QueryValueEx(key, "DllPath")[0]
            activation_type = winreg.QueryValueEx(key, "ActivationType")[0]
    except OSError as exc:
        raise WindowsRepairError("Der lokale Windows-3D-Reparaturdienst ist nicht verfügbar.") from exc
    if activation_type != 0 or not Path(os.path.expandvars(dll_path)).is_file():
        raise WindowsRepairError("Der Windows-3D-Reparaturdienst ist nicht als lokale DLL verfügbar.")
    return {
        "api": "Windows.Graphics.Printing3D.Printing3DModel.RepairAsync",
        "provider_dll": os.path.expandvars(dll_path),
        "activation_type": int(activation_type),
        "execution": "local_in_process_windows_runtime",
        "windows_version": platform.version(),
        "projection_versions": {name: metadata.version(name) for name in _PACKAGES},
        "sources": dict(_SOURCES),
        "result_requires_topology_and_original_geometry_validation": True,
    }


def _write_input_package(mesh, path):
    """Store geometry as one identity-positioned, millimetre 3MF resource."""
    ET.register_namespace("", _CORE_NS)
    model = ET.Element(f"{{{_CORE_NS}}}model", unit="millimeter")
    resources = ET.SubElement(model, f"{{{_CORE_NS}}}resources")
    obj = ET.SubElement(resources, f"{{{_CORE_NS}}}object", id="1", type="model")
    part = ET.SubElement(obj, f"{{{_CORE_NS}}}mesh")
    vertices = ET.SubElement(part, f"{{{_CORE_NS}}}vertices")
    for vertex in mesh.vertices:
        ET.SubElement(vertices, f"{{{_CORE_NS}}}vertex",
                      x=format(vertex[0], ".17g"), y=format(vertex[1], ".17g"),
                      z=format(vertex[2], ".17g"))
    triangles = ET.SubElement(part, f"{{{_CORE_NS}}}triangles")
    for face in mesh.faces:
        ET.SubElement(triangles, f"{{{_CORE_NS}}}triangle",
                      v1=str(face[0]), v2=str(face[1]), v3=str(face[2]))
    build = ET.SubElement(model, f"{{{_CORE_NS}}}build")
    ET.SubElement(build, f"{{{_CORE_NS}}}item", objectid="1")
    content_types = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>'
        '</Types>')
    relationships = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Target="/3D/3dmodel.model" Id="rel0" '
        'Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>'
        '</Relationships>')
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", relationships)
        archive.writestr("3D/3dmodel.model", ET.tostring(model, encoding="utf-8", xml_declaration=True))


def _read_raw_mesh(mesh, buffer_format):
    vertex_description = mesh.vertex_positions_description
    face_description = mesh.triangle_indices_description
    dtypes = {
        buffer_format.PRINTING_3D_DOUBLE: np.dtype("<f8"),
        buffer_format.R32_G32_B32_FLOAT: np.dtype("<f4"),
    }
    dtype = dtypes.get(vertex_description.format)
    if (dtype is None or vertex_description.stride != 3
            or face_description.format not in (buffer_format.PRINTING_3D_UINT,
                                                buffer_format.R32_G32_B32_UINT)
            or face_description.stride != 3):
        raise WindowsRepairError("Windows hat ein unbekanntes Netz-Pufferformat zurückgegeben.")
    vertex_buffer = memoryview(mesh.get_vertex_positions())
    face_buffer = memoryview(mesh.get_triangle_indices())
    if (vertex_buffer.nbytes != mesh.vertex_count * 3 * dtype.itemsize
            or face_buffer.nbytes != mesh.index_count * 3 * 4):
        raise WindowsRepairError("Windows hat widersprüchliche Netz-Puffergrößen zurückgegeben.")
    vertices = np.frombuffer(vertex_buffer, dtype=dtype).reshape((-1, 3)).astype(np.float64, copy=True)
    faces = np.frombuffer(face_buffer, dtype="<u4").reshape((-1, 3)).astype(np.int64, copy=True)
    if (not len(faces) or not len(vertices) or not np.isfinite(vertices).all()
            or int(faces.max()) >= len(vertices)):
        raise WindowsRepairError("Windows hat kein verwendbares repariertes Dreiecksnetz zurückgegeben.")
    return vertices, faces


async def repair_with_windows(mesh: trimesh.Trimesh, *, timeout_seconds: float = 300):
    """Return ``(raw_mesh, provider_report)`` without welding or certifying it.

    Input/output coordinates are millimetres. Input arrays remain unchanged.
    The public OS API is loaded lazily so this module remains importable without
    its optional Windows-only projections. Run inside a cancellable CAD worker.
    """
    if os.name != "nt":
        raise WindowsRepairError("Die Windows-Netzreparatur ist nur unter Windows verfügbar.")
    if not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
        raise WindowsRepairError("Die Zeitgrenze für Windows-Reparatur muss positiv sein.")
    if (not isinstance(mesh, trimesh.Trimesh) or len(mesh.faces) < 4
            or not np.isfinite(mesh.vertices).all() or not len(mesh.vertices)
            or int(mesh.faces.min()) < 0 or int(mesh.faces.max()) >= len(mesh.vertices)):
        raise WindowsRepairError("Die Windows-Reparatur benötigt ein verwendbares Dreiecksnetz.")
    try:
        from winrt.windows.graphics.printing3d import (
            Printing3D3MFPackage, Printing3DBufferFormat, Printing3DModelUnit)
        from winrt.windows.storage import StorageFile, FileAccessMode
        report = _provider_metadata()
    except (ImportError, metadata.PackageNotFoundError) as exc:
        raise WindowsRepairError("Die Python-Anbindung für die Windows-Netzreparatur fehlt.") from exc

    started = time.monotonic()
    stream = None
    action = None
    try:
        with tempfile.TemporaryDirectory(prefix="stlstep-windows-repair-") as directory:
            input_path = Path(directory) / "input.3mf"
            _write_input_package(mesh, input_path)
            storage_file = await StorageFile.get_file_from_path_async(str(input_path))
            stream = await storage_file.open_async(FileAccessMode.READ)
            package = Printing3D3MFPackage()
            try:
                model = await package.load_model_from_package_async(stream)
            finally:
                stream.close()
                stream = None
            if model.unit != Printing3DModelUnit.MILLIMETER:
                raise WindowsRepairError("Windows hat die erwartete Millimeter-Einheit geändert.")
            report["loaded_vertices"] = sum(int(m.vertex_count) for m in model.meshes)
            report["loaded_triangles"] = sum(int(m.index_count) for m in model.meshes)
            action = model.repair_async()
            await asyncio.wait_for(action, timeout=timeout_seconds)
            vertices, faces = [], []
            offset = 0
            for repaired_mesh in model.meshes:
                v, f = _read_raw_mesh(repaired_mesh, Printing3DBufferFormat)
                vertices.append(v)
                faces.append(f + offset)
                offset += len(v)
            if not vertices:
                raise WindowsRepairError("Windows hat alle Netze aus dem Modell entfernt.")
            # Keep identity and precision: no process=True, no geometric welding.
            result = trimesh.Trimesh(vertices=np.vstack(vertices), faces=np.vstack(faces), process=False)
            report.update({"seconds": time.monotonic() - started,
                           "input_vertices": int(len(mesh.vertices)), "input_triangles": int(len(mesh.faces)),
                           "output_meshes": len(vertices), "output_vertices": int(len(result.vertices)),
                           "output_triangles": int(len(result.faces)),
                           "unit": "millimeter", "geometric_vertices_merged": False})
            return result, report
    except asyncio.TimeoutError as exc:
        if action is not None:
            action.cancel()
        raise WindowsRepairError("Die Windows-Netzreparatur hat ihre Zeitgrenze überschritten.") from exc
    except asyncio.CancelledError:
        if action is not None:
            action.cancel()
        raise
    except WindowsRepairError:
        raise
    except Exception as exc:
        raise WindowsRepairError(f"Windows-Netzreparatur fehlgeschlagen: {exc}") from exc
    finally:
        if stream is not None:
            stream.close()
