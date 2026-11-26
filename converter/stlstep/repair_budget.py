"""N03 admission for repaired meshes: topology, openings and surface budget.

A candidate is admitted only when both sampled surface directions stay within the
unchanged original budget, no opening was bridged by new surface, and the
original surface outside the repair region is retained exactly. An admitted
repair receives a deterministic result identifier (Fassung) built from the
original geometry, the repaired geometry and the gate settings.

The samples are deterministic evidence, not a mathematical maximum guarantee.
"""
from __future__ import annotations

import hashlib
import json
import math

import numpy as np
import trimesh

from .surface_check import compare_surfaces


FASSUNG_VERSION = 1
# STL is commonly stored as float32. Matching reference points to the candidate
# at 0,1 µm therefore stays well below the smallest allowed budget (0,0001 mm)
# while treating a re-exported unchanged point as the same point.
COORDINATE_TOLERANCE_MM = 1e-4


class RepairBudgetError(ValueError):
    """A user-readable rejection by the repair budget gate."""


def _boundary_loop_count(mesh):
    counts = np.bincount(mesh.edges_unique_inverse, minlength=len(mesh.edges_unique))
    boundary = mesh.edges_unique[counts == 1]
    if not len(boundary):
        return 0
    parent = {}

    def find(value):
        parent.setdefault(value, value)
        while parent[value] != value:
            parent[value] = parent[parent[value]]
            value = parent[value]
        return value

    for edge in boundary:
        first, second = find(int(edge[0])), find(int(edge[1]))
        if first != second:
            parent[first] = second
    return len({find(value) for value in parent})


def _component_count(mesh):
    if not len(mesh.faces):
        return 0
    edge_ids = mesh.edges_unique_inverse
    owners = np.repeat(np.arange(len(mesh.faces)), 3)
    order = np.argsort(edge_ids, kind="stable")
    same = edge_ids[order][1:] == edge_ids[order][:-1]
    connections = np.column_stack((owners[order][:-1][same], owners[order][1:][same]))
    return len(trimesh.graph.connected_components(connections, nodes=np.arange(len(mesh.faces))))


def topology_summary(mesh):
    """Faces, edges and genuine boundary loops (Löcher) of a mesh."""
    counts = np.bincount(mesh.edges_unique_inverse, minlength=len(mesh.edges_unique))
    return {
        "vertices": int(len(mesh.vertices)),
        "faces": int(len(mesh.faces)),
        "edges": int(len(mesh.edges_unique)),
        "boundary_edges": int(np.count_nonzero(counts == 1)),
        "openings": int(_boundary_loop_count(mesh)),
        "nonmanifold_edges": int(np.count_nonzero(counts > 2)),
        "components": _component_count(mesh),
        "watertight": bool(mesh.is_watertight),
        "winding_consistent": bool(mesh.is_winding_consistent),
        "bounds_mm": np.asarray(mesh.bounds).tolist(),
        "surface_area_mm2": float(mesh.area),
    }


def _vertex_map(reference, candidate):
    """Map candidate vertices to reference vertices within the coordinate tolerance."""
    cell = COORDINATE_TOLERANCE_MM
    grid = {}
    for index, point in enumerate(reference.vertices):
        key = tuple(int(math.floor(float(value) / cell)) for value in point)
        grid.setdefault(key, []).append(index)
    mapping = np.full(len(candidate.vertices), -1, dtype=np.int64)
    for index, point in enumerate(candidate.vertices):
        centre = tuple(int(math.floor(float(value) / cell)) for value in point)
        best, best_distance = -1, COORDINATE_TOLERANCE_MM
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    for other in grid.get((centre[0] + dx, centre[1] + dy, centre[2] + dz), ()):
                        distance = float(np.linalg.norm(np.asarray(reference.vertices[other]) - point))
                        if distance <= best_distance:
                            best, best_distance = other, distance
        mapping[index] = best
    return mapping


def _repair_region(reference, candidate):
    """Faces whose reference triangle is absent from the candidate surface.

    Candidate vertices are mapped to reference vertices within
    ``COORDINATE_TOLERANCE_MM`` first, so a renumbered or re-exported but
    geometrically unchanged triangle stays outside the repair region.
    """
    mapping = _vertex_map(reference, candidate)
    present = set()
    for face in candidate.faces:
        mapped = [int(mapping[int(vertex)]) for vertex in face]
        if -1 not in mapped and len(set(mapped)) == 3:
            present.add(tuple(sorted(mapped)))
    changed = []
    preserved = []
    for index, face in enumerate(reference.faces):
        key = tuple(sorted(int(vertex) for vertex in face))
        (changed if key not in present else preserved).append(index)
    if changed:
        used = np.unique(np.asarray(reference.faces)[changed])
        bounds = np.asarray(reference.vertices)[used]
        region_bounds = np.stack((bounds.min(axis=0), bounds.max(axis=0))).tolist()
        region_area = float(np.asarray(reference.area_faces)[changed].sum())
    else:
        region_bounds = None
        region_area = 0.0
    return {
        "method": "coordinate_triangle_match",
        "coordinate_tolerance_mm": COORDINATE_TOLERANCE_MM,
        "changed_faces": len(changed),
        "preserved_faces": len(preserved),
        "changed_face_indices": [int(index) for index in changed[:2000]],
        "bounds_mm": region_bounds,
        "area_mm2": region_area,
        "outside_faces": len(preserved),
    }


def _geometry_sha256(mesh):
    digest = hashlib.sha256()
    digest.update(np.ascontiguousarray(mesh.vertices, dtype="<f8").tobytes())
    digest.update(np.ascontiguousarray(mesh.faces, dtype="<i4").tobytes())
    return digest.hexdigest()


def _fassung(reference, candidate, budget_mm, samples):
    origin = _geometry_sha256(reference)
    result = _geometry_sha256(candidate)
    identity = json.dumps({"origin": origin, "result": result,
                           "budget_mm": float(budget_mm), "samples": int(samples)},
                          sort_keys=True, separators=(",", ":"))
    return {
        "version": FASSUNG_VERSION,
        "id": hashlib.sha256(identity.encode("utf-8")).hexdigest(),
        "origin_sha256": origin,
        "result_sha256": result,
        "budget_mm": float(budget_mm),
        "samples": int(samples),
        "accepted": True,
    }


def _measurement(deviation):
    first = dict(deviation["stl_to_cad"])
    second = dict(deviation["cad_to_stl"])
    first.update({"reference": "original", "measured_on": "reference_surface"})
    second.update({"reference": "repaired", "measured_on": "repaired_surface"})
    return {
        "unit": "mm",
        "samples_per_direction": int(deviation.get("samples_per_direction", 0)),
        "max_mm": float(deviation["sampled_max_mm"]),
        "decided_by": "raw",
        "directions": {"original_to_repaired": first, "repaired_to_original": second},
        "kind": deviation.get("kind", "deterministic_surface_samples_not_a_mathematical_bound"),
    }


def _reusable_outer_skin(result, budget_mm, samples):
    """True when ``result`` is an outer-skin run for exactly these settings."""
    from .outer_skin import OUTER_SKIN_METHOD

    if not isinstance(result, dict):
        return False
    runs = result.get("runs")
    report = result.get("report")
    return (
        isinstance(runs, list) and len(runs) == 1
        and isinstance(report, dict) and report.get("method") == OUTER_SKIN_METHOD
        and float(result.get("budget", math.nan)) == float(budget_mm)
        and int(runs[0].get("samples", -1)) == int(samples)
    )


def _outer_skin_measurement(reference, candidate, budget_mm, samples, raw_measurement,
                            result=None):
    """Let outer-skin-v1 decide, but always keep the raw comparison in the report.

    ``result`` may be a run already computed by the repair path. It is reused
    only when it was measured with the same rule, budget and sample count, so
    the admission and the earlier budget gate cannot disagree.
    """
    from .outer_skin import OUTER_SKIN_METHOD, evaluate_outer_skin

    if not _reusable_outer_skin(result, budget_mm, samples):
        result = evaluate_outer_skin(original=reference, candidate=candidate,
                                     samples=(int(samples),), budget=budget_mm)
    run = result["runs"][0]
    summary = {
        "method": result["report"]["method"],
        "budget_mm": float(result["budget"]),
        "proven": bool(result["proven"]),
        "decided_by": result["decided_by"],
        "excluded_faces": int(result["excluded_faces"]),
        "excluded_area_mm2": float(result["excluded_area_mm2"]),
        "excluded_neighbourhood_mm": result["excluded_neighbourhood_mm"],
        "excluded_face_ids": list(result["excluded_face_ids"]),
        "min_patch_area_mm2": result["report"]["min_patch_area_mm2"],
        "epsilon_mm": result["report"]["epsilon_mm"],
        "samples_per_direction": int(samples),
        "raw_max_mm": float(run["raw"]["worst"]),
        "skin_max_mm": float(run["skin"]["worst"]),
        "skin_reference_to_candidate_mm": float(run["skin"]["maximum"]),
        "skin_candidate_to_reference_mm": float(run["skin"]["reverse"]),
    }
    if not result["proven"] or result["report"]["method"] != OUTER_SKIN_METHOD:
        measurement = dict(raw_measurement)
        measurement["outer_skin"] = summary
        return measurement, summary

    skin = run["skin"]["directions"]
    first = dict(skin["reference_to_candidate"])
    second = dict(skin["candidate_to_reference"])
    first.update({"reference": "original", "measured_on": "reference_surface"})
    second.update({"reference": "repaired", "measured_on": "repaired_surface"})
    measurement = {
        "unit": "mm",
        "samples_per_direction": int(samples),
        "max_mm": float(run["skin"]["worst"]),
        "decided_by": "outer-skin",
        "directions": {"original_to_repaired": first, "repaired_to_original": second},
        "raw": dict(raw_measurement, decided_by="raw"),
        "outer_skin": summary,
        "kind": "outer_skin_v1_decides_raw_comparison_reported",
    }
    return measurement, summary


def assess_repair_candidate(reference, candidate, *, budget_mm, samples=6000,
                            adds_new_surface=False, deviation=None, changed=None,
                            outer_skin=True, outer_skin_result=None):
    """Return an admission report for a repair candidate without modifying it.

    ``adds_new_surface`` marks backends that may close an opening by adding a
    surface (for example a hole fill). Such a candidate is refused as soon as
    boundary edges or boundary loops decrease. Repairs that only split, remove
    or reorient existing triangles pass this check. ``deviation`` may reuse an
    already measured :func:`surface_check.compare_surfaces` result. With
    ``outer_skin`` the admitted ``outer-skin-v1`` proof decides when it exists;
    the raw comparison stays in the report either way. ``outer_skin_result``
    lets the repair path hand over a run it already measured, so the gate and
    the admission cannot disagree and the expensive probe is not repeated.
    """
    if not isinstance(budget_mm, (int, float)) or not math.isfinite(budget_mm) or budget_mm <= 0:
        raise RepairBudgetError("Das Reparaturbudget muss eine positive Zahl in mm sein.")
    if not isinstance(samples, (int, np.integer)) or not 500 <= samples <= 30_000:
        raise RepairBudgetError("Die Zahl der Reparatur-Prüfpunkte muss zwischen 500 und 30000 liegen.")
    if (not isinstance(reference, trimesh.Trimesh) or len(reference.faces) < 4
            or not np.isfinite(reference.vertices).all()
            or not isinstance(candidate, trimesh.Trimesh) or not len(candidate.faces)
            or not np.isfinite(candidate.vertices).all()):
        raise RepairBudgetError("Für die Abweichungsprüfung sind zwei verwendbare Dreiecksnetze erforderlich.")
    if deviation is None:
        deviation = compare_surfaces(reference, candidate, samples)
    before = topology_summary(reference)
    after = topology_summary(candidate)
    region = _repair_region(reference, candidate)
    changed = bool(region["changed_faces"]) if changed is None else bool(changed)
    raw_measurement = _measurement(deviation)
    measurement = raw_measurement
    if outer_skin:
        measurement, _ = _outer_skin_measurement(
            reference, candidate, budget_mm, samples, raw_measurement,
            result=outer_skin_result)
    bounds_change = float(np.max(np.abs(np.asarray(candidate.bounds) - np.asarray(reference.bounds))))
    bridged = bool(adds_new_surface and (
        after["boundary_edges"] < before["boundary_edges"] or after["openings"] < before["openings"]))
    openings = {
        "before": before["openings"],
        "after": after["openings"],
        "boundary_edges_before": before["boundary_edges"],
        "boundary_edges_after": after["boundary_edges"],
        "bridged": bridged,
        "adds_new_surface": bool(adds_new_surface),
    }
    reasons = []
    if not math.isfinite(measurement["max_mm"]) or measurement["max_mm"] > budget_mm + 1e-9:
        reasons.append("deviation_over_budget")
    if bridged:
        reasons.append("opening_bridged")
    if not region["outside_faces"]:
        reasons.append("outside_region_not_preserved")
    if after["components"] < before["components"]:
        reasons.append("component_lost")
    if not math.isfinite(bounds_change) or bounds_change > budget_mm + 1e-9:
        reasons.append("bounds_over_budget")
    accepted = not reasons
    fassung = _fassung(reference, candidate, budget_mm, samples) if accepted and changed else None
    return {
        "version": 1,
        "accepted": accepted,
        "kind": "repaired" if changed else "unchanged",
        "reasons": reasons,
        "reason": reasons[0] if reasons else None,
        "threshold_mm": float(budget_mm),
        "measurement": measurement,
        "topology": {"before": before, "after": after},
        "openings": openings,
        "bounds_change_max_mm": bounds_change,
        "repair_region": region,
        "outside_repair_region": {
            "faces": region["outside_faces"],
            "changed_faces": region["changed_faces"],
            "preserved": bool(region["outside_faces"]),
            "method": region["method"],
            "coordinate_tolerance_mm": COORDINATE_TOLERANCE_MM,
            "max_mm": 0.0,
        },
        "fassung": fassung,
    }


def admission_message(admission):
    """One German sentence with threshold, both directions, sample and result."""
    measurement = admission["measurement"]
    directions = measurement["directions"]
    first = directions["original_to_repaired"]
    second = directions["repaired_to_original"]
    if admission["kind"] == "unchanged":
        before, after = admission["topology"]["before"], admission["topology"]["after"]
        return (
            "Das Netz blieb unverändert. "
            f"Schwelle {admission['threshold_mm']:.6g} mm; keine Reparaturmessung nötig; "
            f"Flächen {before['faces']}, Kanten {before['edges']}, Löcher {before['openings']}.")
    worst = first if first["max_mm"] >= second["max_mm"] else second
    location = worst.get("max_point_mm")
    point = "[" + ", ".join(f"{value:.6g}" for value in location) + "]" if location else "unbekannt"
    before, after = admission["topology"]["before"], admission["topology"]["after"]
    if measurement.get("decided_by") == "outer-skin":
        skin = measurement.get("outer_skin") or {}
        raw = measurement.get("raw") or {}
        raw_directions = raw.get("directions") or {}
        raw_first = raw_directions.get("original_to_repaired", {})
        raw_second = raw_directions.get("repaired_to_original", {})
        return (
            f"Außenhaut {skin.get('method', 'outer-skin-v1')} entscheidet: "
            f"{skin.get('excluded_faces', 0)} Dreiecke / "
            f"{skin.get('excluded_area_mm2', 0.0):.6g} mm² ausgeschlossen, "
            f"Nachbarschaft {skin.get('excluded_neighbourhood_mm', 0.5):.6g} mm; "
            f"Schwelle {admission['threshold_mm']:.6g} mm; Stichprobe "
            f"{measurement['samples_per_direction']} Punkte je Richtung; Außenhaut "
            f"{first['max_mm']:.6g} mm Original→Reparatur und {second['max_mm']:.6g} mm "
            f"Reparatur→Original (Roh {raw_first.get('max_mm', 0.0):.6g} mm und "
            f"{raw_second.get('max_mm', 0.0):.6g} mm); größter Punkt {point}. "
            f"Flächen {before['faces']}→{after['faces']}, Kanten {before['edges']}→{after['edges']}, "
            f"Löcher {before['openings']}→{after['openings']}.")
    return (
        f"Schwelle {admission['threshold_mm']:.6g} mm; Stichprobe "
        f"{measurement['samples_per_direction']} Punkte je Richtung; gemessen "
        f"{first['max_mm']:.6g} mm Original→Reparatur und {second['max_mm']:.6g} mm "
        f"Reparatur→Original; größter Punkt {point}. "
        f"Flächen {before['faces']}→{after['faces']}, Kanten {before['edges']}→{after['edges']}, "
        f"Löcher {before['openings']}→{after['openings']}.")


def unchanged_admission(reference, *, budget_mm, samples=6000):
    """Report an already closed input without spending a second measurement."""
    topology = topology_summary(reference)
    zero = {
        "reference": "original",
        "measured_on": "reference_surface",
        "max_mm": 0.0,
        "max_point_mm": None,
        "p95_mm": 0.0,
        "mean_mm": 0.0,
        "points": 0,
        "unit": "mm",
    }
    return {
        "version": 1,
        "accepted": True,
        "kind": "unchanged",
        "reasons": [],
        "reason": None,
        "threshold_mm": float(budget_mm),
        "measurement": {
            "unit": "mm",
            "samples_per_direction": 0,
            "max_mm": 0.0,
            "directions": {"original_to_repaired": dict(zero),
                           "repaired_to_original": dict(zero, reference="repaired",
                                                        measured_on="repaired_surface")},
            "kind": "unchanged_vertex_and_face_arrays",
        },
        "topology": {"before": topology, "after": dict(topology)},
        "openings": {"before": topology["openings"], "after": topology["openings"],
                     "boundary_edges_before": topology["boundary_edges"],
                     "boundary_edges_after": topology["boundary_edges"],
                     "bridged": False, "adds_new_surface": False},
        "bounds_change_max_mm": 0.0,
        "repair_region": {"method": "coordinate_triangle_match",
                          "coordinate_tolerance_mm": COORDINATE_TOLERANCE_MM,
                          "changed_faces": 0, "preserved_faces": topology["faces"],
                          "changed_face_indices": [], "bounds_mm": None, "area_mm2": 0.0,
                          "outside_faces": topology["faces"]},
        "outside_repair_region": {"faces": topology["faces"], "changed_faces": 0,
                                  "preserved": True, "method": "coordinate_triangle_match",
                                  "coordinate_tolerance_mm": COORDINATE_TOLERANCE_MM,
                                  "max_mm": 0.0},
        "fassung": None,
    }
