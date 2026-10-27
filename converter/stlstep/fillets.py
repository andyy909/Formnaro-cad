"""Conservative reconstruction of box edges with distinct constant radii.

Six connected planes establish the box frame. Each of the twelve edge bands
must independently support a circular cylinder tangent to its two planes.
OpenCascade constructs the corner transitions; every input vertex and all
triangle-centre/edge-midpoint probes are then checked against that actual
native boundary. The engine still owns the bidirectional STEP acceptance gate.
"""
from __future__ import annotations

import cadquery as cq
import numpy as np
from OCP.BRepExtrema import BRepExtrema_DistShapeShape
from OCP.BRepFilletAPI import BRepFilletAPI_MakeFillet

from .regions import (_convex_hull_interior_depth, _notify, _plane_regions,
                      MAX_HULL_PROJECTION_PAIRS)


MAX_NATIVE_PROBE_POINTS = 100_000
MIN_FREEFORM_TESSELLATION_MM = .0005


def _box_frame(mesh, numeric_mm):
    """Use six dominant connected supports, as in the uniform-radius model."""
    origin = np.asarray(mesh.bounds).mean(axis=0)
    segmented = _plane_regions(mesh, origin, numeric_mm)
    if len(segmented) < 6:
        return None
    regions = segmented[:6]
    normals = np.asarray([region["normal"] for region in regions])
    unused = set(range(6))
    pairs = []
    while unused:
        first = min(unused)
        opposite = [other for other in unused if other != first
                    and normals[first] @ normals[other] <= -np.cos(.002)]
        if len(opposite) != 1:
            return None
        second = opposite[0]
        pairs.append((first, second))
        unused.difference_update((first, second))
    raw_axes = np.asarray([(normals[first] - normals[second]) / 2
                           for first, second in pairs])
    raw_axes /= np.linalg.norm(raw_axes, axis=1)[:, None]
    if np.max(np.abs(raw_axes @ raw_axes.T - np.eye(3))) > .002:
        return None
    u, _, vt = np.linalg.svd(raw_axes)
    axes = u @ vt
    if np.linalg.det(axes) < 0:
        axes[2] *= -1
    offsets = np.asarray([sorted((float(regions[first]["centre"] @ axis),
                                 float(regions[second]["centre"] @ axis)))
                          for axis, (first, second) in zip(axes, pairs)])
    half = (offsets[:, 1] - offsets[:, 0]) / 2
    if half.min() <= numeric_mm * 20:
        return None
    centre = origin + offsets.mean(axis=1) @ axes
    return centre, axes, half, regions, len(segmented)


def _edge_key(axis, signs):
    transverse = [other for other in range(3) if other != axis]
    return f"axis{axis}:{transverse[0]}={signs[0]},{transverse[1]}={signs[1]}"


def _edge_radii(mesh, local, axes, half, numeric_mm, tolerance):
    """Fit all circular bands, excluding curved corner transition normals."""
    normals = np.asarray(mesh.face_normals) @ axes.T
    local_centres = local[np.asarray(mesh.faces)].mean(axis=1)
    edge_models = []
    for axis in range(3):
        first, second = [other for other in range(3) if other != axis]
        # Cylinder normals have no axial component. The middle axial band
        # prevents the nearly equatorial facets of corner blends joining it.
        axial = (np.abs(normals[:, axis]) < .002
                 ) & (np.abs(local_centres[:, axis]) < half[axis] * .56)
        for sign_a in (-1, 1):
            for sign_b in (-1, 1):
                selected = np.flatnonzero(axial
                    & (normals[:, first] * sign_a > .025)
                    & (normals[:, second] * sign_b > .025))
                if len(selected) < 4:
                    return None
                ids = np.unique(np.asarray(mesh.faces)[selected])
                points = local[ids]
                da = half[first] - sign_a * points[:, first]
                db = half[second] - sign_b * points[:, second]
                if np.min(da) < -numeric_mm * 4 or np.min(db) < -numeric_mm * 4:
                    return None
                da, db = np.maximum(da, 0), np.maximum(db, 0)
                measured = da + db + np.sqrt(2 * da * db)
                radius = float(np.median(measured))
                if (radius <= max(numeric_mm * 20, half.min() * .002)
                        or radius >= min(half[first], half[second]) * .98):
                    return None
                fit_limit = max(numeric_mm * 5,
                                min(tolerance * .06, radius * .002, float(mesh.scale) * .0002))
                if fit_limit > tolerance * .12:
                    return None
                # Radius estimates amplify coordinate noise near tangency.
                # Evaluate the actual circle residual for every support vertex.
                error = np.abs(np.hypot(radius - da, radius - db) - radius)
                if float(error.max()) > fit_limit:
                    return None
                # A planar chamfer has only its two endpoints on the circle;
                # demand angular evidence over a substantial curved band.
                angles = np.arctan2(radius - db, radius - da)
                if len(np.unique(np.round(angles, 3))) < 4 or np.ptp(angles) < .7:
                    return None
                probe = local_centres[selected]
                pa = half[first] - sign_a * probe[:, first]
                pb = half[second] - sign_b * probe[:, second]
                probe_error = float(np.max(np.abs(np.hypot(radius - pa, radius - pb) - radius)))
                if probe_error > tolerance * .82:
                    return None
                edge_models.append({"axis": axis, "signs": (sign_a, sign_b),
                    "key": _edge_key(axis, (sign_a, sign_b)), "radius_mm": radius,
                    "triangles": len(selected), "vertices": len(ids),
                    "vertex_fit_max_mm": float(error.max()),
                    "mesh_probe_max_mm": probe_error})
    return edge_models


def _cluster_radii(models, numeric_mm):
    """Share radii only at coordinate-precision scale, never at user budget."""
    ordered = sorted(models, key=lambda model: model["radius_mm"])
    groups = []
    for model in ordered:
        radius = model["radius_mm"]
        allowance = numeric_mm * 8
        # Bound the entire group spread: a chain of near neighbours must not
        # collapse many genuinely distinct radii into a shared nominal value.
        if not groups or radius - groups[-1][0]["radius_mm"] > allowance:
            groups.append([])
        groups[-1].append(model)
    for group in groups:
        radius = float(np.median([model["radius_mm"] for model in group]))
        for model in group:
            model["radius_mm"] = radius
    return groups


def _native_box(half, models):
    """Give each sharp box edge its independently supported rolling radius."""
    base = cq.Workplane("XY").box(*(half * 2)).val()
    by_key = {model["key"]: model["radius_mm"] for model in models}
    builder = BRepFilletAPI_MakeFillet(base.wrapped)
    for edge in base.Edges():
        first, second = edge.Vertices()
        delta = np.abs(np.asarray(first.Center().toTuple()) - second.Center().toTuple())
        axis = int(delta.argmax())
        transverse = [other for other in range(3) if other != axis]
        centre = edge.Center().toTuple()
        signs = tuple(1 if centre[other] >= 0 else -1 for other in transverse)
        builder.Add(by_key[_edge_key(axis, signs)], edge.wrapped)
    builder.Build()
    if not builder.IsDone():
        return None
    return cq.Shape.cast(builder.Shape())


def _native_max_distance(shape, points, limit):
    """Reuse native boundary acceleration; examine every supplied point."""
    measure = BRepExtrema_DistShapeShape()
    # Query the boundary explicitly. A point inside a native Solid can have
    # zero shape distance even though it is far from every surface.
    boundary = cq.Compound.makeCompound(shape.Faces())
    measure.LoadS2(boundary.wrapped)
    largest = 0.0
    for point in points:
        measure.LoadS1(cq.Vertex.makeVertex(*point).wrapped)
        measure.Perform()
        if not measure.IsDone():
            return None
        value = float(measure.Value())
        if not np.isfinite(value):
            return None
        largest = max(largest, value)
        if largest > limit:
            return None
    return largest


def fillet_candidates(mesh, tolerance, progress=None):
    """Yield a compact native box with up to twelve distinct constant radii.

    This family requires all six main planes and all twelve circular edge
    bands. A full convex-hull guard rejects recesses above numerical precision.
    It does not cover concave parts, missing rounds, or general curved regions.
    """
    if (not np.isfinite(tolerance) or tolerance <= 0
            or mesh.metadata.get("preserve_vertex_identity")
            or not mesh.is_watertight or not mesh.is_winding_consistent
            or mesh.euler_number != 2 or mesh.volume <= 0
            or mesh.body_count != 1 or len(mesh.faces) < 40):
        return
    vertices = np.asarray(mesh.vertices)
    scale = float(mesh.scale)
    if not np.isfinite(vertices).all() or scale <= 1e-7:
        return
    numeric_mm = max(scale * 2e-7,
                     float(np.abs(vertices).max()) * np.finfo(np.float32).eps)
    if numeric_mm > tolerance * .025 or numeric_mm > scale * .0001:
        return
    frame = _box_frame(mesh, numeric_mm)
    if frame is None:
        return
    centre, axes, half, planes, segmented_count = frame
    local = (vertices - centre) @ axes.T
    models = _edge_radii(mesh, local, axes, half, numeric_mm, tolerance)
    if models is None:
        return
    groups = _cluster_radii(models, numeric_mm)
    if len(groups) < 2:
        return  # The uniform-radius family has its own cheaper analytic gate.
    # Inward defects must never be smoothed away just because user tolerance
    # exceeds them. The guard uses only measured coordinate precision.
    interior_depth = _convex_hull_interior_depth(local / scale)
    if interior_depth is None or interior_depth * scale > numeric_mm * 4:
        return
    probe_count = len(vertices) + len(mesh.faces) + len(mesh.edges_unique)
    if probe_count > MAX_NATIVE_PROBE_POINTS:
        return
    _notify(progress, "Erkenne zwölf Kantenregionen mit unterschiedlichen Rundungsradien …")
    try:
        shape = _native_box(half, models)
    except (ValueError, RuntimeError):
        return
    if (shape is None or shape.isNull() or not shape.isValid()
            or len(shape.Solids()) != 1 or shape.Volume() <= 0
            or any(not shell.Closed() or not shell.isValid() for shell in shape.Shells())):
        return
    types = {}
    for face in shape.Faces():
        name = face.geomType()
        types[name] = types.get(name, 0) + 1
    if (types.get("PLANE") != 6 or types.get("CYLINDER") != 12
            or len(shape.Faces()) > 50):
        return
    # Unequal corner blends can contain B-spline surfaces. Reject impossibly
    # fine requested meshing before the engine touches those native surfaces.
    tessellation = max(1e-6, min(tolerance / 15, scale / 2000))
    if types.get("BSPLINE", 0) and tessellation < MIN_FREEFORM_TESSELLATION_MM:
        return
    vertex_limit = max(numeric_mm * 5,
                       min(tolerance * .08, min(model["radius_mm"] for model in models) * .002,
                           scale * .0002))
    vertex_error = _native_max_distance(shape, local, vertex_limit)
    if vertex_error is None:
        return
    centres = local[np.asarray(mesh.faces)].mean(axis=1)
    midpoints = local[np.asarray(mesh.edges_unique)].mean(axis=1)
    probe_error = _native_max_distance(shape, np.vstack((centres, midpoints)), tolerance * .82)
    if probe_error is None:
        return
    plane = cq.Plane(origin=tuple(centre), xDir=tuple(axes[0]), normal=tuple(axes[2]))
    shape = shape.located(cq.Location(plane))
    details = {"regional_model": "distinct_constant_edge_fillet_box",
        "planar_regions": 6, "cylindrical_regions": 12,
        "radius_group_count": len(groups),
        "radius_groups_mm": [group[0]["radius_mm"] for group in groups],
        "edge_regions": [{**model, "signs": list(model["signs"])} for model in models],
        "native_face_types": types,
        "segmented_planar_patch_count": segmented_count,
        "plane_supports": [{"triangles": int(len(region["indices"])),
            "area_mm2": region["area"], "normal_world": region["normal"].tolist(),
            "planarity_max_mm": region["residual"]} for region in planes],
        "dimensions_mm": (half * 2).tolist(), "centre_mm": centre.tolist(),
        "axes_world": axes.tolist(), "vertex_fit_max_mm": vertex_error,
        "mesh_probe_max_mm": probe_error, "native_vertex_probe_count": len(vertices),
        "native_triangle_edge_probe_count": len(centres) + len(midpoints),
        "convex_hull_vertex_interior_max_mm": interior_depth * scale,
        "convex_hull_numeric_allowance_mm": numeric_mm * 4,
        "convex_hull_projection_pair_limit": MAX_HULL_PROJECTION_PAIRS,
        "scope": "six_plane_twelve_constant_edge_fillet_box_not_general_surface_merging"}
    yield shape, "Regionale Rekonstruktion: Quader mit verschiedenen Rundungsradien", details
