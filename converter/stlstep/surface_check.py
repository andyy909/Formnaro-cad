"""Deterministic bidirectional surface samples for conversion and repair gates.

Each direction samples deterministic points on one surface and measures the
unsigned distance to the other surface. Every result names its reference,
reports the largest sampled distance and the location of that sample. The
maximum is a sampled value, not a mathematical Hausdorff guarantee. Inputs are
never modified.
"""
from __future__ import annotations

import numpy as np
import trimesh


CHUNK_SIZE = 512
ORIGINAL_SEED = 481
CANDIDATE_SEED = 947


def _validate_mesh(mesh, name):
    if (not isinstance(mesh, trimesh.Trimesh) or not len(mesh.faces)
            or not np.isfinite(mesh.vertices).all()):
        raise ValueError(f"{name}: kein verwendbares Dreiecksnetz.")
    if np.min(mesh.faces) < 0 or np.max(mesh.faces) >= len(mesh.vertices):
        raise ValueError(f"{name}: ungültige Dreiecksindizes.")


def sample_points(mesh: trimesh.Trimesh, count: int, seed: int) -> np.ndarray:
    """Include vertices, triangle centres, edge midpoints and area samples."""
    rng = np.random.default_rng(seed)

    def subset(values, budget):
        if len(values) <= budget:
            return values
        return values[rng.choice(len(values), budget, replace=False)]

    vertices = subset(mesh.vertices, count)
    centres = subset(mesh.triangles_center, count)
    edges = mesh.edges_unique
    edge_points = subset(mesh.vertices[edges].mean(axis=1), count)
    random_points, _ = trimesh.sample.sample_surface(mesh, count=count, seed=seed)
    return np.vstack((vertices, centres, edge_points, random_points))


def distances(mesh: trimesh.Trimesh, points: np.ndarray) -> np.ndarray:
    """Chunked unsigned point distances; avoids large point x triangle blocks."""
    result = []
    for start in range(0, len(points), CHUNK_SIZE):
        _, distance, _ = trimesh.proximity.closest_point(mesh, points[start:start + CHUNK_SIZE])
        result.append(distance)
    values = np.concatenate(result)
    if not np.isfinite(values).all():
        raise ValueError("Die Abweichungsprüfung ergab ungültige Werte.")
    return values


def _stats(values, points, reference):
    index = int(np.argmax(values))
    return {
        "reference": reference,
        "max_mm": float(values[index]),
        "max_point_mm": [float(value) for value in points[index]],
        "p95_mm": float(np.percentile(values, 95)),
        "mean_mm": float(values.mean()),
        "points": int(len(values)),
        "unit": "mm",
    }


def compare_surfaces(reference: trimesh.Trimesh, candidate: trimesh.Trimesh, samples: int) -> dict:
    """Measure ``candidate`` against ``reference`` in both directions.

    ``stl_to_cad`` samples points on ``reference`` and measures their distance to
    ``candidate``; ``cad_to_stl`` samples ``candidate`` against ``reference``.
    The names are kept for the existing conversion report. Each entry carries
    its own reference label, maximum, maximum location and sample count.
    """
    if not isinstance(samples, (int, np.integer)) or not 500 <= samples <= 30_000:
        raise ValueError("Die Zahl der Prüfpunkte muss zwischen 500 und 30000 liegen.")
    _validate_mesh(reference, "Original")
    _validate_mesh(candidate, "Kandidat")
    reference_points = sample_points(reference, samples, ORIGINAL_SEED)
    candidate_points = sample_points(candidate, samples, CANDIDATE_SEED)
    to_candidate = distances(candidate, reference_points)
    to_reference = distances(reference, candidate_points)
    first = _stats(to_candidate, reference_points, "reference_mesh_surface")
    second = _stats(to_reference, candidate_points, "candidate_mesh_surface")
    return {
        "stl_to_cad": first,
        "cad_to_stl": second,
        "sampled_max_mm": float(max(first["max_mm"], second["max_mm"])),
        "samples_per_direction": int(len(reference_points)),
        "kind": "deterministic_surface_samples_not_a_mathematical_bound",
    }
