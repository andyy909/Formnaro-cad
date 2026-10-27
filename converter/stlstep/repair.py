"""Opt-in mesh repair with component retention and an original-surface check.

MeshFix can close large holes and change otherwise useful geometry. A repair is
accepted only after topology, bounds and bidirectional surface sample checks.
These samples are not a mathematical maximum-distance guarantee.
"""
from __future__ import annotations

import asyncio
from importlib import util as import_util
import math
import os

import numpy as np
import trimesh


class RepairError(ValueError):
    """A user-readable mesh repair failure."""


def _face_fans(mesh):
    """Yield vertex, incident-face groups and opposite-link degrees.

    Fan connectivity uses vertex IDs, never coordinate proximity. Two touching
    but intentionally separate copies of the same point therefore stay apart.
    """
    faces = np.asarray(mesh.faces)
    incident = [[] for _ in range(len(mesh.vertices))]
    for face_index, face in enumerate(faces):
        for vertex in face:
            incident[int(vertex)].append(face_index)
    for vertex, face_indices in enumerate(incident):
        if not face_indices:
            continue
        neighbours = {}
        malformed = False
        for face_index in face_indices:
            others = faces[face_index][faces[face_index] != vertex]
            if len(others) != 2 or others[0] == others[1]:
                malformed = True
            for other in others:
                neighbours.setdefault(int(other), []).append(face_index)
        # Joining face owners at every radial edge finds separate triangle fans
        # even when the mesh is globally one edge-connected component.
        adjacency = {face_index: set() for face_index in face_indices}
        for owners in neighbours.values():
            if len(owners) > 1:
                first = owners[0]
                for other in owners[1:]:
                    adjacency[first].add(other)
                    adjacency[other].add(first)
        unseen = set(face_indices)
        groups = []
        while unseen:
            start = min(unseen)
            unseen.remove(start)
            found = [start]
            todo = [start]
            while todo:
                for other in adjacency[todo.pop()]:
                    if other in unseen:
                        unseen.remove(other)
                        found.append(other)
                        todo.append(other)
            groups.append(np.array(sorted(found), dtype=np.int64))
        degrees = [len(owners) for owners in neighbours.values()]
        yield vertex, groups, degrees, malformed


def manifold_vertex_links(mesh):
    """Report whether each used vertex's link is exactly one closed cycle.

    Edge counts alone cannot detect a pinched vertex with two disjoint closed
    fans. Coincident coordinates with different vertex IDs are intentionally
    allowed here: this is a topology diagnostic, not a self-intersection test.
    """
    if not isinstance(mesh, trimesh.Trimesh):
        raise RepairError("Für die Knotenprüfung ist ein Dreiecksnetz erforderlich.")
    bad = []
    disconnected = []
    bad_degrees = []
    extra_fans = 0
    for vertex, groups, degrees, malformed in _face_fans(mesh):
        if len(groups) > 1:
            disconnected.append(vertex)
            extra_fans += len(groups) - 1
        if malformed or any(degree != 2 for degree in degrees):
            bad_degrees.append(vertex)
        if len(groups) != 1 or malformed or any(degree != 2 for degree in degrees):
            bad.append(vertex)
    return {
        "closed_single_cycle": not bad,
        "nonmanifold_vertex_count": len(bad),
        "nonmanifold_vertices": bad,
        "disconnected_fan_vertex_count": len(disconnected),
        "disconnected_fan_vertices": disconnected,
        "extra_fans": extra_fans,
        "noncycle_link_vertex_count": len(bad_degrees),
    }


def split_vertex_fans(mesh):
    """Return ``(copy, report)`` with separate IDs for disconnected fans.

    Duplicate only the relevant vertices; every triangle retains its exact
    original corner coordinates, winding and order. This closes no hole and
    does not resolve self-intersections or an edge shared by over two faces.
    Callers must not merge coincident vertex IDs after this explicit repair.
    """
    if (not isinstance(mesh, trimesh.Trimesh) or not len(mesh.faces)
            or not np.isfinite(mesh.vertices).all()):
        raise RepairError("Für die Knotentrennung ist ein verwendbares Dreiecksnetz erforderlich.")
    before = manifold_vertex_links(mesh)
    vertices = np.asarray(mesh.vertices).copy().tolist()
    faces = np.asarray(mesh.faces).copy()
    splits = []
    for vertex, groups, _, _ in _face_fans(mesh):
        if len(groups) <= 1:
            continue
        duplicated = []
        for group in groups[1:]:
            new_index = len(vertices)
            vertices.append(mesh.vertices[vertex].tolist())
            rows, columns = np.nonzero(faces[group] == vertex)
            faces[group[rows], columns] = new_index
            duplicated.append(new_index)
        splits.append({"original_vertex": vertex, "fan_count": len(groups),
                       "duplicate_vertices": duplicated})
    # process=False is essential: coordinate merging would undo this operation.
    repaired = trimesh.Trimesh(np.asarray(vertices, dtype=mesh.vertices.dtype), faces, process=False,
                               metadata=dict(mesh.metadata))
    if not np.array_equal(mesh.triangles, repaired.triangles):
        raise RepairError("Die Knotentrennung würde Dreieckspositionen ändern; Ergebnis verworfen.")
    after = manifold_vertex_links(repaired)
    report = {
        "method": "split_vertex_fans_without_coordinate_changes",
        "split_vertices": len(splits),
        "added_vertices": len(repaired.vertices) - len(mesh.vertices),
        "triangles_changed": 0,
        "geometry_changed": False,
        "before": before,
        "after": after,
        "splits": splits,
    }
    if report["added_vertices"]:
        repaired.metadata["preserve_vertex_identity"] = True
    return repaired, report


def _fan_summary(report):
    """Keep repair reports compact; detailed index lists belong to diagnostics."""
    summary = {key: report[key] for key in ("method", "split_vertices", "added_vertices",
                                           "triangles_changed", "geometry_changed")}
    for phase in ("before", "after"):
        summary[phase] = {key: value for key, value in report[phase].items()
                          if not isinstance(value, list)}
    return summary


def _windows_available():
    if os.name != "nt":
        return False
    try:
        return import_util.find_spec("winrt.windows.graphics.printing3d") is not None
    except (ImportError, ValueError):
        return False


def _windows_candidate(part):
    from .windows_repair import repair_with_windows
    # The converter runs this synchronous helper in its cancellable CAD worker.
    return asyncio.run(repair_with_windows(part))


def _components(mesh):
    """Connect faces at *all* shared edges, including non-manifold seams.

    Trimesh's normal face adjacency excludes edges shared by over two faces.
    That would mistake damaged patches for separate original components.
    """
    edge_ids = mesh.edges_unique_inverse
    owners = np.repeat(np.arange(len(mesh.faces)), 3)
    order = np.argsort(edge_ids, kind="stable")
    same = edge_ids[order[1:]] == edge_ids[order[:-1]]
    connections = np.column_stack((owners[order[:-1]][same], owners[order[1:]][same]))
    groups = trimesh.graph.connected_components(connections, nodes=np.arange(len(mesh.faces)))
    return [mesh.submesh([indices], append=True, repair=False) for indices in groups]


def _topology(mesh):
    counts = np.bincount(mesh.edges_unique_inverse, minlength=len(mesh.edges_unique))
    vertex_links = manifold_vertex_links(mesh)
    return {
        "vertices": int(len(mesh.vertices)),
        "triangles": int(len(mesh.faces)),
        "components": len(_components(mesh)),
        "boundary_edges": int(np.count_nonzero(counts == 1)),
        "nonmanifold_edges": int(np.count_nonzero(counts > 2)),
        "all_edges_have_two_faces": bool(len(counts) and np.all(counts == 2)),
        "watertight": bool(mesh.is_watertight),
        "winding_consistent": bool(mesh.is_winding_consistent),
        "vertex_links_manifold": vertex_links["closed_single_cycle"],
        "nonmanifold_vertices": vertex_links["nonmanifold_vertex_count"],
        "bounds_mm": np.asarray(mesh.bounds).tolist(),
        "surface_area_mm2": float(mesh.area),
    }


def _closed(topology):
    return (topology["all_edges_have_two_faces"] and topology["watertight"]
            and topology["winding_consistent"] and topology["vertex_links_manifold"])


def _zero_deviation():
    stats = {"max_mm": 0.0, "p95_mm": 0.0, "mean_mm": 0.0, "points": 0}
    return {
        "stl_to_cad": dict(stats), "cad_to_stl": dict(stats),
        "sampled_max_mm": 0.0,
        "kind": "unchanged_vertex_and_face_arrays",
    }


def _validate_result(reference, candidate, budget_mm, samples):
    if not len(candidate.faces) or not np.isfinite(candidate.vertices).all():
        raise RepairError("Die Netzreparatur hat keinen verwendbaren Körper erzeugt.")
    topology = _topology(candidate)
    if not _closed(topology):
        raise RepairError("Die Netzreparatur hat offene Kanten oder nicht mannigfaltige Bereiche hinterlassen.")
    if any(abs(part.volume) <= 1e-12 for part in _components(candidate)):
        raise RepairError("Die Netzreparatur hat eine Hülle ohne verwendbares Volumen erzeugt.")
    bounds_change = float(np.max(np.abs(candidate.bounds - reference.bounds)))
    if bounds_change > budget_mm + 1e-9:
        raise RepairError(
            f"Netzreparatur abgelehnt: Die Begrenzung würde sich um {bounds_change:.6g} mm "
            f"ändern (Reparaturbudget {budget_mm:.6g} mm).")
    # Import lazily: engine may use this helper while loading an STL.
    from .engine import compare_meshes
    try:
        deviation = compare_meshes(reference, candidate, samples)
    except Exception as exc:
        raise RepairError(f"Die Formabweichung der Netzreparatur konnte nicht geprüft werden: {exc}") from exc
    measured = deviation["sampled_max_mm"]
    if not math.isfinite(measured) or measured > budget_mm + 1e-9:
        raise RepairError(
            f"Netzreparatur abgelehnt: Die gemessene Formabweichung beträgt {measured:.6g} mm "
            f"(Reparaturbudget {budget_mm:.6g} mm). Große Löcher werden nicht ungeprüft geschlossen.")
    return topology, deviation, bounds_change


def validate_repair_candidate(reference, candidate, *, budget_mm, samples=6000):
    """Validate a candidate from any backend without changing either mesh.

    Returns ``before``, ``after``, ``deviation`` and ``bounds_change_max_mm``.
    Genuine separate components must still be repaired independently by the
    caller: the count check is an additional guard, not a shell correspondence
    proof. Reference and candidate coordinates are in millimetres.
    """
    if not math.isfinite(budget_mm) or budget_mm <= 0:
        raise RepairError("Das Reparaturbudget muss eine positive Zahl in mm sein.")
    if not isinstance(samples, (int, np.integer)) or not 500 <= samples <= 30_000:
        raise RepairError("Die Zahl der Reparatur-Prüfpunkte muss zwischen 500 und 30000 liegen.")
    if (not isinstance(reference, trimesh.Trimesh) or len(reference.faces) < 4
            or not np.isfinite(reference.vertices).all()
            or not isinstance(candidate, trimesh.Trimesh)):
        raise RepairError("Für die Reparaturprüfung sind zwei verwendbare Dreiecksnetze erforderlich.")
    before = _topology(reference)
    after, deviation, bounds_change = _validate_result(reference, candidate, budget_mm, samples)
    if after["components"] < before["components"]:
        raise RepairError("Die Netzreparatur würde getrennte Hüllen verlieren; Ergebnis verworfen.")
    return {"before": before, "after": after, "deviation": deviation,
            "bounds_change_max_mm": bounds_change}


def _meshfix_candidate(part, pymeshfix, method):
    vertices = np.array(part.vertices, dtype=np.float64, copy=True)
    faces = np.array(part.faces, dtype=np.int32, copy=True)
    if method == "repair":
        fixer = pymeshfix.MeshFix(vertices, faces, verbose=False)
        # The default removes all but the largest component; explicitly refuse it.
        fixer.repair(joincomp=False, remove_smallest_components=False)
        vertices, faces = fixer.points, fixer.faces
    else:
        fixer = pymeshfix.PyTMesh()
        fixer.set_quiet(True)
        fixer.load_array(vertices, faces)
        if method == "connectivity_and_fill":
            fixer.fix_connectivity()
        # No smoothing/refinement of the filled patches.
        fixer.fill_small_boundaries(0, False)
        vertices, faces = fixer.return_arrays()
    candidate = trimesh.Trimesh(vertices, faces, process=False)
    # MeshFix may emit distinct indices for the same geometric seam. Merge them
    # before checking manifoldness, otherwise a doubled seam can appear valid.
    candidate.merge_vertices(digits_vertex=10)
    candidate.remove_unreferenced_vertices()
    candidate.fix_normals(multibody=True)
    return candidate


def repair_mesh(mesh, *, budget_mm, samples=6000):
    """Return a checked repaired copy and report, retaining original mesh data.

    Input coordinates and ``budget_mm`` are in millimetres. The caller should
    first merge coincident vertices and remove duplicate/degenerate triangles.
    Intact disconnected solids are copied without MeshFix. Each damaged surface
    component is repaired separately, so a smaller genuine solid cannot be
    removed by the backend's largest-component policy.
    """
    if not math.isfinite(budget_mm) or budget_mm <= 0:
        raise RepairError("Das Reparaturbudget muss eine positive Zahl in mm sein.")
    if not isinstance(samples, (int, np.integer)) or not 500 <= samples <= 30_000:
        raise RepairError("Die Zahl der Reparatur-Prüfpunkte muss zwischen 500 und 30000 liegen.")
    if (not isinstance(mesh, trimesh.Trimesh) or len(mesh.faces) < 4
            or not np.isfinite(mesh.vertices).all()):
        raise RepairError("Das Netz enthält keinen verwendbaren Körper für die Reparatur.")
    original = mesh.copy()
    before = _topology(original)
    report = {
        "requested": True,
        "applied": False,
        "backend": None,
        "backend_version": None,
        "budget_mm": float(budget_mm),
        "before": before,
        "after": dict(before),
        "preserved_closed_components": before["components"] if _closed(before) else 0,
        "component_operations": [],
        "geometry_changed": False,
        "deviation": _zero_deviation(),
        "bounds_change_max_mm": 0.0,
        "notes": ["Die unveränderte Eingabe bleibt die geometrische Referenz. "
                  "Beidseitige Oberflächenstichproben sind keine mathematische Fehlergarantie."],
    }
    if _closed(before):
        return original, report

    # Formnaro's exact neighbor subdivision also works after degenerate STL
    # helper triangles have been removed. Try it before geometric backends.
    from .seams import split_collinear_seams
    seamed, seam_count = (split_collinear_seams(original)
                         if before["boundary_edges"] else (None, 0))
    if seam_count:
        seamed.fix_normals(multibody=True)
        seamed, seam_fans = split_vertex_fans(seamed)
        try:
            checked = validate_repair_candidate(original, seamed,
                                                budget_mm=budget_mm, samples=samples)
        except RepairError as exc:
            # A partially closed seam must never bypass full repair validation.
            report["local_seam_rejection"] = str(exc)
        else:
            operations = [{"method": "local.split_collinear_seams",
                           "split_neighbor_faces": seam_count,
                           "seam_subdivisions": seam_count, "added_triangles": seam_count,
                           "coordinates_moved": False, "new_surface_added": False}]
            if seam_fans["added_vertices"]:
                operations.append(_fan_summary(seam_fans))
            report.update({
                "applied": True, "backend": "local.split_collinear_seams",
                "backend_version": "2", "after": checked["after"],
                "deviation": checked["deviation"],
                "bounds_change_max_mm": checked["bounds_change_max_mm"],
                "component_operations": operations,
            })
            report["notes"].append("Exakt kollineare T-Verbindungen wurden durch Teilung "
                                   "vorhandener Dreiecke geschlossen; keine Punkte verschoben "
                                   "und keine neue Oberfläche ergänzt.")
            return seamed, report

    # A pinched closed vertex needs only distinct IDs for its separate fans.
    # This stage changes topology with exactly zero triangle displacement.
    split_mesh, split_report = split_vertex_fans(original)
    if split_report["added_vertices"] and _closed(_topology(split_mesh)):
        topology, deviation, bounds_change = _validate_result(original, split_mesh, budget_mm, samples)
        report.update({
            "applied": True, "backend": "local.split_vertex_fans", "backend_version": "1",
            "after": topology, "deviation": deviation,
            "bounds_change_max_mm": bounds_change,
            "preserved_closed_components": len(_components(original)),
            "component_operations": [_fan_summary(split_report)],
        })
        return split_mesh, report

    components = _components(original)
    repaired_parts = []
    backend_methods = set()
    pymeshfix = None
    windows_version = None
    for number, part in enumerate(components, start=1):
        part_before = _topology(part)
        if _closed(part_before):
            repaired_parts.append(part.copy())
            report["preserved_closed_components"] += 1
            report["component_operations"].append({"component": number, "method": "unchanged",
                                                   "before": part_before, "after": dict(part_before)})
            continue

        # A winding error alone needs no geometric repair or hole fill.
        oriented = part.copy()
        oriented.fix_normals(multibody=True)
        if _closed(_topology(oriented)):
            topology, deviation, _ = _validate_result(part, oriented, budget_mm, samples)
            repaired_parts.append(oriented)
            backend_methods.add("trimesh.fix_normals")
            report["component_operations"].append({"component": number, "method": "trimesh.fix_normals",
                                                   "before": part_before, "after": topology,
                                                   "deviation": deviation})
            continue

        attempts = []
        if _windows_available():
            try:
                raw, provider = _windows_candidate(part)
                candidate, fan_report = split_vertex_fans(raw)
                checked = validate_repair_candidate(part, candidate, budget_mm=budget_mm, samples=samples)
                # Windows's explicit indices can represent coincident geometric
                # contacts. Preserve them through indexed CAD construction.
                has_coincident_ids = len(np.unique(candidate.vertices, axis=0)) < len(candidate.vertices)
                if fan_report["added_vertices"] or has_coincident_ids:
                    candidate.metadata["preserve_vertex_identity"] = True
                repaired_parts.append(candidate)
                backend_methods.add("Windows.Printing3D.RepairAsync")
                windows_version = provider.get("windows_version")
                report["component_operations"].append({
                    "component": number, "method": "Windows.Printing3D.RepairAsync",
                    "before": part_before, "after": checked["after"],
                    "deviation": checked["deviation"], "provider": provider,
                    "vertex_fan_split": _fan_summary(fan_report),
                    "preserve_vertex_identity": bool(candidate.metadata.get("preserve_vertex_identity")),
                })
                continue
            except Exception as exc:
                attempts.append({"method": "Windows.Printing3D.RepairAsync", "rejection": str(exc)})

        if pymeshfix is None:
            try:
                import pymeshfix as meshfix_module
            except ImportError as exc:
                reasons = " ".join(attempt["rejection"] for attempt in attempts)
                raise RepairError("Das optionale Netzreparatur-Modul PyMeshFix ist nicht installiert. "
                                  + reasons) from exc
            pymeshfix = meshfix_module

        for method in ("fill", "connectivity_and_fill", "repair"):
            try:
                candidate = _meshfix_candidate(part, pymeshfix, method)
                topology, deviation, _ = _validate_result(part, candidate, budget_mm, samples)
            except Exception as exc:
                # Native process failures are handled by the caller's worker.
                attempts.append({"method": method, "rejection": str(exc)})
                continue
            repaired_parts.append(candidate)
            backend_methods.add(f"pymeshfix.{method}")
            report["component_operations"].append({"component": number, "method": f"pymeshfix.{method}",
                                                   "before": part_before, "after": topology,
                                                   "deviation": deviation, "rejected_attempts": attempts})
            break
        else:
            reasons = " ".join(f"{attempt['method']}: {attempt['rejection']}" for attempt in attempts)
            raise RepairError(f"Hülle {number} konnte innerhalb des Reparaturbudgets nicht sicher repariert werden. {reasons}")

    # Each original edge-connected component contributed a checked result;
    # no component was silently discarded or joined with its neighbour.
    repaired = trimesh.util.concatenate(repaired_parts)
    if any(part.metadata.get("preserve_vertex_identity") for part in repaired_parts):
        repaired.metadata["preserve_vertex_identity"] = True
    after, deviation, bounds_change = _validate_result(original, repaired, budget_mm, samples)
    if after["components"] < before["components"]:
        raise RepairError("Die Netzreparatur würde getrennte Hüllen verlieren; Ergebnis verworfen.")
    report.update({
        "applied": True,
        "backend": ", ".join(sorted(backend_methods)),
        "backend_version": (getattr(pymeshfix, "__version__", None) if pymeshfix
                            else windows_version or trimesh.__version__),
        "after": after,
        "deviation": deviation,
        "geometry_changed": bool(deviation["sampled_max_mm"] > 1e-9),
        "bounds_change_max_mm": bounds_change,
    })
    if any(method.startswith("pymeshfix") for method in backend_methods):
        report["notes"].append("PyMeshFix kann Dreiecke entfernen, Löcher füllen und die Form verändern. "
                               "Es wurde kein Glätten zusätzlich angefordert; jede Änderung wurde gegen das Original geprüft.")
    if "Windows.Printing3D.RepairAsync" in backend_methods:
        report["notes"].append("Die lokale Windows-3D-Reparatur wurde verwendet. Separate Knotenfächer "
                               "wurden bei Bedarf ohne Änderung der Dreieckspositionen getrennt.")
    return repaired, report
