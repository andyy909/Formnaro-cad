"""Bounded preview measurements; independent of the conversion acceptance gate.

Each sample is the unsigned distance from one displayed result triangle centre
to the original STL surface. This one-way display sample is deliberately not a
replacement for the report's two-way geometry checks.
"""
from __future__ import annotations

from dataclasses import dataclass
from threading import Event

import numpy as np
import trimesh


DISPLAY_FACE_LIMIT = 20000
CHUNK_SIZE = 256


class DeviationCancelled(Exception):
    """The preview request was superseded or cancelled."""


@dataclass(frozen=True)
class DeviationSamples:
    face_indices: np.ndarray
    distances_mm: np.ndarray


def display_face_indices(face_count: int) -> np.ndarray:
    """Use exactly the same triangle selection for rendering and measurement."""
    if face_count < 0:
        raise ValueError("Negative triangle count.")
    if face_count == 0:
        return np.empty(0, dtype=np.int64)
    return np.linspace(0, face_count - 1, min(DISPLAY_FACE_LIMIT, face_count), dtype=np.int64)


def _cancelled(cancel: Event | None) -> None:
    if cancel is not None and cancel.is_set():
        raise DeviationCancelled("Preview measurement cancelled.")


def _validate_mesh(mesh: trimesh.Trimesh, name: str) -> None:
    if not isinstance(mesh, trimesh.Trimesh) or not len(mesh.faces):
        raise ValueError(f"{name}: no triangle surface available.")
    if not np.isfinite(mesh.vertices).all():
        raise ValueError(f"{name}: coordinates must be finite.")
    if np.min(mesh.faces) < 0 or np.max(mesh.faces) >= len(mesh.vertices):
        raise ValueError(f"{name}: invalid triangle indices.")


def measure_deviation(reference: trimesh.Trimesh, result: trimesh.Trimesh,
                      reference_unit_mm: float, cancel: Event | None = None) -> DeviationSamples:
    """Measure <=20,000 displayed triangle centres against the original surface.

    ``reference`` uses the selected STL input unit; ``result`` is already in mm.
    Inputs are never modified. Cancellation is checked around each bounded
    distance batch; no Tk or native CAD calls occur here.
    """
    _cancelled(cancel)
    if not np.isfinite(reference_unit_mm) or reference_unit_mm <= 0:
        raise ValueError("STL unit scale must be a positive finite number.")
    _validate_mesh(reference, "Original")
    _validate_mesh(result, "Result")
    _cancelled(cancel)
    original_mm = trimesh.Trimesh(vertices=np.asarray(reference.vertices, dtype=float) * reference_unit_mm,
                                 faces=np.asarray(reference.faces).copy(), process=False)
    indices = display_face_indices(len(result.faces))
    centres = np.asarray(result.triangles_center)[indices]
    values = np.empty(len(indices), dtype=float)
    for start in range(0, len(indices), CHUNK_SIZE):
        _cancelled(cancel)
        _, distances, _ = trimesh.proximity.closest_point(original_mm, centres[start:start + CHUNK_SIZE])
        _cancelled(cancel)
        if not np.isfinite(distances).all() or np.any(distances < 0):
            raise ValueError("Preview measurement did not produce finite unsigned distances.")
        values[start:start + len(distances)] = distances
    indices.setflags(write=False)
    values.setflags(write=False)
    return DeviationSamples(indices, values)


def colour_limit(tolerance: float) -> float:
    """Keep the mm colour scale within the same allowed range as the UI budget."""
    if not np.isfinite(tolerance):
        raise ValueError("Colour scale must be finite.")
    return float(np.clip(tolerance, 0.0001, 100.0))
