"""Python port of the admitted outer-skin method ``outer-skin-v1`` (N03-B).

The rule is defined once in ``src/mesh-outer-skin.js``. This module reproduces
it for the converter so that the same evidence decides a repair admission:

* planar zones of at least 20 mm² are grouped (canonical plane, welded edges),
* a triangle may be excluded only when its centroid and support points are
  proven inside material on both sides of the plane (epsilon 0.02 mm) with all
  five fixed, non axis-aligned ray directions,
* excluded triangles are removed from the reference; boundary and ambiguous
  triangles stay in the reference,
* only candidate points within 0.5 mm of an excluded triangle may be treated as
  internal material; the raw comparison is always reported as well,
* the admitted budget stays 0.15 mm.

The measurements are deterministic samples, not a mathematical bound.
"""
from __future__ import annotations

import hashlib
import math
from collections import OrderedDict

import numpy as np
import trimesh


OUTER_SKIN_METHOD = "outer-skin-v1"
OUTER_SKIN_BUDGET_MM = 0.15
OUTER_SKIN_EXCLUDED_NEIGHBOURHOOD_MM = 0.5
OUTER_SKIN_MIN_PATCH_AREA_MM2 = 20.0
OUTER_SKIN_EPSILON_MM = 0.02
OUTER_SKIN_REFINE_LEVEL = 2
OUTER_SKIN_SEED = 20261124
OUTER_SKIN_NORMAL_TOLERANCE = 2e-3
OUTER_SKIN_OFFSET_TOLERANCE = 2e-2

RAY_DIRECTIONS = np.asarray([
    [0.371390676, 0.557086014, 0.742781353],
    [-0.624695048, 0.468521286, 0.624695048],
    [0.707106781, -0.408248290, 0.577350269],
    [-0.301511345, -0.904534034, 0.301511345],
    [0.267261242, 0.534522484, -0.801783726],
], dtype=np.float64)
RAY_DIRECTIONS /= np.linalg.norm(RAY_DIRECTIONS, axis=1, keepdims=True)

SCREEN_PARAMETERS = ((1 / 3, 1 / 3), (0.6, 0.2), (0.2, 0.6), (0.2, 0.2))

_REFERENCE_CACHE: "OrderedDict[tuple, dict]" = OrderedDict()
_REFERENCE_CACHE_SIZE = 2


class OuterSkinError(ValueError):
    """A user-readable rejection by the outer-skin method."""


def _js_round(value):
    """JavaScript ``Math.round`` semantics (half rounds towards +infinity)."""
    return int(math.floor(float(value) + 0.5))


def _validate_mesh(mesh, label):
    if (not isinstance(mesh, trimesh.Trimesh) or not len(mesh.faces)
            or not len(mesh.vertices) or not np.isfinite(mesh.vertices).all()
            or np.min(mesh.faces) < 0 or np.max(mesh.faces) >= len(mesh.vertices)):
        raise OuterSkinError(f"{label}: endliche Dreiecksnetze mit gültigen Indizes erwartet.")


def _face_geometry(mesh):
    tri = np.asarray(mesh.vertices, dtype=np.float64)[np.asarray(mesh.faces)]
    cross = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    length = np.linalg.norm(cross, axis=1)
    area = length / 2.0
    normals = np.zeros_like(cross)
    valid = area > 0
    normals[valid] = cross[valid] / (2.0 * area[valid, None])
    return tri, area, normals, valid


def _canonical_planes(normals, points):
    """Canonicalise every plane so the grouping is rotation invariant."""
    planes = np.zeros_like(normals)
    offsets = np.zeros(len(normals))
    for index, (normal, point) in enumerate(zip(normals, points)):
        length = float(np.linalg.norm(normal))
        if length <= 0:
            continue
        unit = normal / length
        offset = float(np.dot(unit, point))
        flip = offset < -1e-9 or (
            abs(offset) <= 1e-9
            and (unit[2] < -1e-9 or (
                abs(unit[2]) <= 1e-9
                and (unit[1] < -1e-9 or (abs(unit[1]) <= 1e-9 and unit[0] < 0)))))
        planes[index] = -unit if flip else unit
        offsets[index] = -offset if flip else offset
    return planes, offsets


def _weld_key(point):
    return ",".join(str(_js_round(value * 1e4)) for value in point)


def detect_planar_patches(mesh, min_area=OUTER_SKIN_MIN_PATCH_AREA_MM2,
                          normal_tolerance=OUTER_SKIN_NORMAL_TOLERANCE,
                          offset_tolerance=OUTER_SKIN_OFFSET_TOLERANCE):
    """Connected coplanar patches with canonical plane and welded edges."""
    _validate_mesh(mesh, "Ebenenprüfung")
    if not min_area > 0:
        raise OuterSkinError("Mindestfläche der Ebenenprüfung muss positiv sein.")
    tri, area, normals, valid = _face_geometry(mesh)
    planes, offsets = _canonical_planes(normals, tri[:, 0])
    groups = {}
    degenerate = int(np.count_nonzero(~valid))
    for face in np.flatnonzero(valid):
        key = (
            _js_round(planes[face, 0] / normal_tolerance),
            _js_round(planes[face, 1] / normal_tolerance),
            _js_round(planes[face, 2] / normal_tolerance),
            _js_round(offsets[face] / offset_tolerance),
        )
        groups.setdefault(key, []).append(int(face))

    weld = np.empty((len(mesh.vertices),), dtype=object)
    for index, point in enumerate(mesh.vertices):
        weld[index] = _weld_key(point)

    patches = []
    for faces in groups.values():
        edge_owners = {}
        for face in faces:
            keys = [weld[index] for index in mesh.faces[face]]
            for corner in range(3):
                edge = tuple(sorted((keys[corner], keys[(corner + 1) % 3])))
                edge_owners.setdefault(edge, []).append(face)
        members = {face: set() for face in faces}
        for owners in edge_owners.values():
            if len(owners) < 2:
                continue
            for first in owners:
                for second in owners:
                    if first != second:
                        members[first].add(second)
        seen = set()
        for start in faces:
            if start in seen:
                continue
            stack = [start]
            seen.add(start)
            component = []
            while stack:
                face = stack.pop()
                component.append(face)
                for other in members[face]:
                    if other not in seen:
                        seen.add(other)
                        stack.append(other)
            component_area = float(area[component].sum())
            if component_area < min_area:
                continue
            weights = area[component]
            normal = (planes[component] * weights[:, None]).sum(axis=0)
            length = float(np.linalg.norm(normal))
            normal = normal / length if length > 0 else planes[component[0]]
            offset = float((offsets[component] * weights).sum() / component_area)
            corners = tri[component].reshape(-1, 3)
            patches.append({
                "id": len(patches),
                "faces": [int(face) for face in component],
                "area": component_area,
                "normal": [float(value) for value in normal],
                "offset": offset,
                "planePoint": [float(value) for value in normal * offset],
                "bounds": {"min": corners.min(axis=0).tolist(),
                           "max": corners.max(axis=0).tolist()},
            })
    patches.sort(key=lambda patch: patch["area"], reverse=True)
    for index, patch in enumerate(patches):
        patch["id"] = index
    return {"patches": patches, "degenerate": degenerate, "facePlanes": int(np.count_nonzero(valid))}


def _crossing_counts(mesh, points, direction):
    """Number of collapsed ray crossings per origin, matching the JS probe."""
    points = np.asarray(points, dtype=np.float64)
    counts = np.zeros(len(points), dtype=np.int64)
    if not len(points):
        return counts
    origins = np.ascontiguousarray(points)
    directions = np.tile(np.asarray(direction, dtype=np.float64), (len(points), 1))
    locations, ray_index, _ = mesh.ray.intersects_location(origins, directions, multiple_hits=True)
    if not len(locations):
        return counts
    distance = np.linalg.norm(locations - points[ray_index], axis=1)
    keep = distance > 1e-7
    ray_index, distance = ray_index[keep], distance[keep]
    if not len(distance):
        return counts
    order = np.lexsort((distance, ray_index))
    ray_index, distance = ray_index[order], distance[order]
    boundary = np.ones(len(distance), dtype=bool)
    boundary[1:] = (ray_index[1:] != ray_index[:-1]) | (distance[1:] - distance[:-1] > 1e-6)
    return np.bincount(ray_index[boundary], minlength=len(points))


def inside_material(mesh, points):
    """True only when all five fixed rays report an odd crossing count."""
    points = np.asarray(points, dtype=np.float64)
    alive = np.ones(len(points), dtype=bool)
    for direction in RAY_DIRECTIONS:
        active = np.flatnonzero(alive)
        if not len(active):
            break
        counts = _crossing_counts(mesh, points[active], direction)
        alive[active] = (counts % 2) == 1
    return alive


def crossing_counts(mesh, point):
    """All five crossing counts for one point (parity evidence)."""
    point = np.asarray(point, dtype=np.float64).reshape(1, 3)
    return [int(_crossing_counts(mesh, point, direction)[0]) for direction in RAY_DIRECTIONS]


def create_material_probe(mesh):
    """Reusable material probe with the fixed, reproducible ray directions."""
    _validate_mesh(mesh, "Materialprobe")
    return {
        "inside": lambda points: inside_material(mesh, points),
        "crossingCounts": lambda point: crossing_counts(mesh, point),
    }


def _barycentric(tri, faces, u, v):
    a = tri[faces, 0]
    b = tri[faces, 1]
    c = tri[faces, 2]
    if u + v > 1:
        u, v = 1 - u, 1 - v
    return a + (b - a) * u + (c - a) * v


def _refine_parameters(level):
    n = 2 ** level
    out = []
    for i in range(n):
        for j in range(n):
            u = (i + 0.5) / n
            v = (j + 0.5) / n
            if u + v >= 1 - 1e-9:
                continue
            out.append((u, v))
    return out


def _subset_mesh(mesh, keep):
    return trimesh.Trimesh(vertices=np.asarray(mesh.vertices, dtype=np.float64),
                           faces=np.asarray(mesh.faces)[keep], process=False)


def _geometry_key(mesh, options):
    digest = hashlib.sha256()
    digest.update(np.ascontiguousarray(mesh.vertices, dtype="<f8").tobytes())
    digest.update(np.ascontiguousarray(mesh.faces, dtype="<i4").tobytes())
    return (digest.hexdigest(),) + tuple(sorted(options.items()))


def build_outer_skin_reference(mesh, options=None):
    """Remove only planar faces proven to lie inside material on both sides."""
    options = dict(options or {})
    min_area = float(options.get("min_area", OUTER_SKIN_MIN_PATCH_AREA_MM2))
    epsilon = float(options.get("epsilon", OUTER_SKIN_EPSILON_MM))
    refine_level = int(options.get("refine_level", OUTER_SKIN_REFINE_LEVEL))
    budget = float(options.get("budget", OUTER_SKIN_BUDGET_MM))
    if not epsilon > 0:
        raise OuterSkinError("Der Prüfabstand muss positiv sein.")
    _validate_mesh(mesh, "Außenhaut")
    key = _geometry_key(mesh, {"min_area": min_area, "epsilon": epsilon,
                               "refine_level": refine_level})
    cached = _REFERENCE_CACHE.get(key)
    if cached is not None:
        _REFERENCE_CACHE.move_to_end(key)
        return {"reference": cached["reference"].copy(), "report": dict(cached["report"])}

    detected = detect_planar_patches(mesh, min_area=min_area)
    tri, area, normals, valid = _face_geometry(mesh)
    excluded = set()
    regions = []
    proven_both_sides = 0
    refused_outside = 0
    ambiguous = 0
    refined = _refine_parameters(refine_level)

    for patch in detected["patches"]:
        keep = np.ones(len(mesh.faces), dtype=bool)
        keep[patch["faces"]] = False
        probe = _subset_mesh(mesh, keep)
        active = np.asarray(patch["faces"], dtype=np.int64)
        refused_patch = 0
        ambiguous_patch = 0
        for u, v in SCREEN_PARAMETERS:
            if not len(active):
                break
            points = _barycentric(tri, active, u, v)
            ok = inside_material(probe, points + normals[active] * epsilon)
            active = active[ok]
            if not len(active):
                break
            points = _barycentric(tri, active, u, v)
            ok = inside_material(probe, points - normals[active] * epsilon)
            active = active[ok]
        screen_failed = len(patch["faces"]) - len(active)
        refused_patch += screen_failed
        refused_outside += screen_failed
        if len(active):
            before_refine = len(active)
            for u, v in refined:
                if not len(active):
                    break
                points = _barycentric(tri, active, u, v)
                ok = inside_material(probe, points + normals[active] * epsilon)
                active = active[ok]
                if not len(active):
                    break
                ok = inside_material(probe, points - normals[active] * epsilon)
                active = active[ok]
            ambiguous_patch = before_refine - len(active)
            ambiguous += ambiguous_patch
        if len(active):
            excluded.update(int(face) for face in active)
            proven_both_sides += len(active)
            patch_faces = [int(face) for face in active]
            corners = tri[patch_faces].reshape(-1, 3)
            regions.append({
                "patch_id": patch["id"],
                "normal": patch["normal"],
                "offset": patch["offset"],
                "plane_point": patch["planePoint"],
                "area": patch["area"],
                "excluded_area": float(area[patch_faces].sum()),
                "excluded_faces": len(patch_faces),
                "faces": len(patch["faces"]),
                "ratio": float(area[patch_faces].sum() / patch["area"]),
                "refused_faces": refused_patch,
                "ambiguous_faces": ambiguous_patch,
                "bounds": patch["bounds"],
                "excluded_bounds": {"min": corners.min(axis=0).tolist(),
                                    "max": corners.max(axis=0).tolist()},
            })
        elif refused_patch or ambiguous_patch:
            regions.append({
                "patch_id": patch["id"], "normal": patch["normal"],
                "offset": patch["offset"], "plane_point": patch["planePoint"],
                "area": patch["area"], "excluded_area": 0.0, "excluded_faces": 0,
                "faces": len(patch["faces"]), "ratio": 0.0,
                "refused_faces": refused_patch, "ambiguous_faces": ambiguous_patch,
                "bounds": patch["bounds"],
            })

    keep = np.ones(len(mesh.faces), dtype=bool)
    if excluded:
        keep[sorted(excluded)] = False
    reference = _subset_mesh(mesh, keep)
    excluded_ids = sorted(excluded)
    excluded_area = float(area[excluded_ids].sum()) if excluded_ids else 0.0
    excluded_bounds = None
    if excluded_ids:
        corners = tri[excluded_ids].reshape(-1, 3)
        excluded_bounds = {"min": corners.min(axis=0).tolist(),
                           "max": corners.max(axis=0).tolist()}
    report = {
        "method": OUTER_SKIN_METHOD,
        "budget_mm": float(budget),
        "min_patch_area_mm2": min_area,
        "epsilon_mm": epsilon,
        "refine_level": refine_level,
        "planar_patches": len(detected["patches"]),
        "degenerate_faces": detected["degenerate"],
        "excluded_faces": len(excluded_ids),
        "excluded_face_ids": excluded_ids,
        "excluded_area_mm2": excluded_area,
        "excluded_bounds": excluded_bounds,
        "reference_faces": int(len(reference.faces)),
        "proven_faces": proven_both_sides,
        "refused_faces": refused_outside,
        "ambiguous_faces": ambiguous,
        "proven": bool(excluded_ids),
        "excluded_region_count": sum(1 for region in regions if region["excluded_area"] > 0),
        "regions": regions,
        "rule": ("Ausgeschlossen wird nur ein Dreieck einer erkannten ebenen Zone, dessen "
                 "Schwerpunkt und dessen Stützpunkte auf beiden Seiten der Fläche mit allen "
                 "fünf festen Strahlrichtungen belegt im Material liegen. Grenz-, Außen- und "
                 "mehrdeutige Dreiecke bleiben Referenz."),
    }
    _REFERENCE_CACHE[key] = {"reference": reference.copy(), "report": dict(report)}
    while len(_REFERENCE_CACHE) > _REFERENCE_CACHE_SIZE:
        _REFERENCE_CACHE.popitem(last=False)
    return {"reference": reference, "report": report}


def sample_surface_points(mesh, count, seed=OUTER_SKIN_SEED):
    if not isinstance(count, (int, np.integer)) or not 1 <= count <= 500_000:
        raise OuterSkinError("Stichprobenzahl muss zwischen 1 und 500.000 liegen.")
    points, _ = trimesh.sample.sample_surface(mesh, int(count), seed=int(seed))
    return np.asarray(points, dtype=np.float64)


def _nearest_distances(target, points):
    if not len(points):
        return np.zeros(0)
    _, distance, _ = trimesh.proximity.closest_point(target, points)
    return np.asarray(distance, dtype=np.float64)


def create_excluded_neighbourhood(mesh, excluded_face_ids,
                                  neighbourhood=OUTER_SKIN_EXCLUDED_NEIGHBOURHOOD_MM):
    if not neighbourhood >= 0:
        raise OuterSkinError("Die Ausschluss-Nachbarschaft muss ≥ 0 sein.")
    if not excluded_face_ids:
        return lambda points: np.zeros(len(points), dtype=bool)
    lookup, vertices, faces = {}, [], []
    for face in excluded_face_ids:
        for corner in range(3):
            index = int(mesh.faces[face][corner])
            if index not in lookup:
                lookup[index] = len(vertices)
                vertices.append(mesh.vertices[index])
            faces.append(lookup[index])
    triangle = trimesh.Trimesh(vertices=np.asarray(vertices, dtype=np.float64),
                               faces=np.asarray(faces).reshape(-1, 3), process=False)

    def within(points):
        return _nearest_distances(triangle, np.asarray(points, dtype=np.float64)) <= neighbourhood

    return within


def measure_directed(*, source, target, samples, seed=OUTER_SKIN_SEED,
                     exact_worst=50, inside_material_check=None, surface_epsilon=1e-4):
    points = sample_surface_points(source, samples, seed)
    distance = _nearest_distances(target, points)
    count = len(points)
    if inside_material_check is not None and count:
        predicate = inside_material_check(points)
        if predicate is not None:
            skip = (distance > surface_epsilon) & np.asarray(predicate)
            if np.any(skip):
                points = points[~skip]
                distance = distance[~skip]
    measured = len(distance)
    order = np.argsort(-distance)
    worst = [{
        "index": int(index),
        "point": points[index].tolist(),
        "sampled_mm": float(distance[index]),
        "exact_mm": float(distance[index]),
        "difference_mm": 0.0,
    } for index in order[:max(0, int(exact_worst))]]
    return {
        "points": count,
        "measured_points": measured,
        "skipped_inside_material": count - measured,
        "samples": int(samples),
        "seed": int(seed),
        "maximum": float(distance.max()) if measured else 0.0,
        "mean": float(distance.mean()) if measured else 0.0,
        "p95": float(np.percentile(distance, 95)) if measured else 0.0,
        "rms": float(np.sqrt(np.mean(distance ** 2))) if measured else 0.0,
        "exact_worst_checked": len(worst),
        "exact_maximum_difference_mm": 0.0,
        "worst": worst,
    }


def measure_surface_deviation(*, reference, candidate, samples, seed=OUTER_SKIN_SEED,
                              exact_worst=50, skip_inside_material=True, inside_scope=None):
    scope = inside_scope
    inside_check = None
    if skip_inside_material:
        def inside_check(points):
            scope_mask = scope(points) if scope is not None else np.ones(len(points), dtype=bool)
            active = np.flatnonzero(scope_mask)
            result = np.zeros(len(points), dtype=bool)
            if len(active):
                result[active] = inside_material(reference, points[active])
            return result

    return {
        "reference_to_candidate": measure_directed(
            source=reference, target=candidate, samples=samples, seed=seed,
            exact_worst=exact_worst),
        "candidate_to_reference": measure_directed(
            source=candidate, target=reference, samples=samples, seed=seed,
            exact_worst=exact_worst, inside_material_check=inside_check),
        "sample_points_per_direction": int(samples),
        "seed": int(seed),
        "rule": ("Referenz→Kandidat misst jede Referenzstichprobe. Kandidat→Referenz "
                 "übergeht nur Stichproben innerhalb der Nachbarschaft ausgeschlossener "
                 "Dreiecke, die belegt im Material der Referenz liegen; alles andere wird "
                 "gemessen."),
    }


def _direction_of(measurement, reference, measured_on):
    worst = measurement["worst"][0] if measurement["worst"] else None
    return {
        "reference": reference,
        "measured_on": measured_on,
        "max_mm": measurement["maximum"],
        "max_point_mm": worst["point"] if worst else None,
        "p95_mm": measurement["p95"],
        "mean_mm": measurement["mean"],
        "points": measurement["measured_points"],
        "unit": "mm",
    }


def _summary_of(measurement):
    first = measurement["reference_to_candidate"]
    second = measurement["candidate_to_reference"]
    return {
        "maximum": first["maximum"],
        "reverse": second["maximum"],
        "worst": max(first["maximum"], second["maximum"]),
        "mean": (first["mean"] + second["mean"]) / 2,
        "skipped_inside_material": second["skipped_inside_material"],
        "exact_maximum_difference_mm": max(first["exact_maximum_difference_mm"],
                                           second["exact_maximum_difference_mm"]),
        "directions": {
            "reference_to_candidate": _direction_of(first, "reference", "reference_surface"),
            "candidate_to_reference": _direction_of(second, "candidate", "candidate_surface"),
        },
        "worst_points": [
            dict(entry, direction="reference-to-candidate") for entry in first["worst"][:3]
        ] + [
            dict(entry, direction="candidate-to-reference") for entry in second["worst"][:3]
        ],
    }


def evaluate_outer_skin(*, original, candidate, samples=(24000, 48000, 96000),
                        seed=OUTER_SKIN_SEED, budget=OUTER_SKIN_BUDGET_MM,
                        exact_worst=50, excluded_neighbourhood=OUTER_SKIN_EXCLUDED_NEIGHBOURHOOD_MM):
    """Full admission run: raw comparison and outer-skin comparison at every count."""
    built = build_outer_skin_reference(original, {"budget": budget})
    reference, report = built["reference"], built["report"]
    scope = (create_excluded_neighbourhood(original, report["excluded_face_ids"],
                                           excluded_neighbourhood)
             if report["proven"] else None)
    runs = []
    for count in samples:
        raw = measure_surface_deviation(reference=original, candidate=candidate,
                                        samples=int(count), seed=seed,
                                        exact_worst=exact_worst, skip_inside_material=False)
        skin = measure_surface_deviation(reference=reference, candidate=candidate,
                                         samples=int(count), seed=seed,
                                         exact_worst=exact_worst,
                                         skip_inside_material=report["proven"],
                                         inside_scope=scope)
        runs.append({"samples": int(count), "raw": _summary_of(raw), "skin": _summary_of(skin)})
    decided_by = "outer-skin" if report["proven"] else "raw"
    verdicts = [{
        "samples": run["samples"],
        "maximum": run["skin" if decided_by == "outer-skin" else "raw"]["worst"],
        "passed": run["skin" if decided_by == "outer-skin" else "raw"]["worst"] <= budget + 1e-9,
    } for run in runs]
    maxima = [run["skin" if decided_by == "outer-skin" else "raw"]["worst"] for run in runs]
    return {
        "budget": float(budget),
        "seed": int(seed),
        "decided_by": decided_by,
        "proven": report["proven"],
        "excluded_neighbourhood_mm": (float(excluded_neighbourhood)
                                      if report["proven"] else None),
        "excluded_faces": report["excluded_faces"],
        "excluded_area_mm2": report["excluded_area_mm2"],
        "excluded_face_ids": list(report["excluded_face_ids"]),
        "inside_skip_scope": "excluded-neighbourhood" if report["proven"] else "none",
        "passed": all(verdict["passed"] for verdict in verdicts),
        "runs": runs,
        "spread": max(maxima) - min(maxima),
        "verdicts": verdicts,
        "report": report,
        "reference_faces": int(len(reference.faces)),
    }
