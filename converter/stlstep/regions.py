"""Conservative reconstruction from connected planar surface regions.

The first supported regional model is a box with the same rolling-ball radius
on all twelve edges. Six large connected plane supports determine its frame;
the complete mesh must then fit the rounded-box signed-distance function.
This is a proposal generator. The engine must still validate the native solid,
its actual STEP round trip, and both directions of surface deviation.
"""
from __future__ import annotations

from itertools import combinations

import cadquery as cq
import numpy as np
from scipy.optimize import minimize_scalar
from scipy.spatial import ConvexHull, QhullError


MAX_HULL_PROJECTION_PAIRS = 50_000_000


def _notify(progress, message):
    if progress:
        progress(message)


def _plane_regions(mesh, origin, numeric_mm):
    """Segment edge-connected almost parallel facets, then verify coplanarity."""
    normals = np.asarray(mesh.face_normals)
    areas = np.asarray(mesh.area_faces)
    adjacency = np.asarray(mesh.face_adjacency)
    parents = np.arange(len(mesh.faces))

    def find(index):
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    if len(adjacency):
        parallel = np.einsum("ij,ij->i", normals[adjacency[:, 0]],
                             normals[adjacency[:, 1]]) >= np.cos(.0005)
        for first, second in adjacency[parallel]:
            a, b = find(first), find(second)
            if a != b:
                parents[b] = a
    groups = {}
    for index in range(len(parents)):
        groups.setdefault(find(index), []).append(index)
    regions = []
    minimum_area = float(mesh.area) * .003
    for indices in groups.values():
        indices = np.asarray(indices, dtype=int)
        area = float(areas[indices].sum())
        if len(indices) < 2 or area < minimum_area:
            continue
        vertices = np.unique(mesh.faces[indices])
        points = np.asarray(mesh.vertices)[vertices] - origin
        normal = np.sum(normals[indices] * areas[indices, None], axis=0)
        length = float(np.linalg.norm(normal))
        if length <= 1e-12:
            continue
        normal /= length
        centres = np.asarray(mesh.triangles_center)[indices] - origin
        centre = np.average(centres, axis=0, weights=areas[indices])
        residual = float(np.max(np.abs((points - centre) @ normal)))
        # This threshold describes measured coordinate precision, not the
        # user's approximation budget. A broad curved patch is not a plane.
        if residual > numeric_mm * 4:
            continue
        if np.min(normals[indices] @ normal) < np.cos(.001):
            continue
        regions.append({"indices": indices, "vertices": vertices,
                        "normal": normal, "centre": centre,
                        "area": area, "residual": residual})
    return sorted(regions, key=lambda region: region["area"], reverse=True)


def _rounded_box_sdf(points, half_extents, radius):
    """Exact signed distance to a box expanded from an inset box by radius."""
    q = np.abs(points) - (half_extents - radius)
    return np.linalg.norm(np.maximum(q, 0), axis=1) + np.minimum(q.max(axis=1), 0) - radius


def _feature_support(points, half_extents, radius):
    """Require evidence for every edge band and every spherical corner."""
    q = np.abs(points) - (half_extents - radius)
    active = q > radius * .02
    signs = np.where(points >= 0, 1, -1)
    edges, corners = {}, {}
    for axes in combinations(range(3), 2):
        mask = active[:, axes[0]] & active[:, axes[1]] & (active.sum(axis=1) == 2)
        for first in (-1, 1):
            for second in (-1, 1):
                count = int(np.count_nonzero(mask & (signs[:, axes[0]] == first)
                                            & (signs[:, axes[1]] == second)))
                edges[f"{axes[0]}:{first},{axes[1]}:{second}"] = count
    mask = active.all(axis=1)
    for first in (-1, 1):
        for second in (-1, 1):
            for third in (-1, 1):
                count = int(np.count_nonzero(mask & (signs == (first, second, third)).all(axis=1)))
                corners[f"{first},{second},{third}"] = count
    return edges, corners


def _convex_hull_interior_depth(points):
    """Largest vertex distance inside the convex hull, in normalized units.

    Local facet-dihedral tests are unsuitable: native parametric tessellations
    can have concave triangle diagonals although every vertex is on a convex
    surface. A true recess instead places vertices inside the enclosing hull.
    For an interior point its distance to a convex polytope's boundary equals
    the smallest distance to any supporting plane. Extreme hull vertices
    have zero depth and need no matrix queries.
    """
    try:
        hull = ConvexHull(points)
    except QhullError:
        return None
    queried = np.ones(len(points), dtype=bool)
    queried[hull.vertices] = False
    queried = points[queried]
    if not len(queried):
        return 0.0
    equations = np.unique(hull.equations, axis=0)
    if len(queried) * len(equations) > MAX_HULL_PROJECTION_PAIRS:
        return None
    chunk = max(1, min(256, 1_000_000 // len(equations)))
    deepest = 0.0
    for start in range(0, len(queried), chunk):
        signed = queried[start:start + chunk] @ equations[:, :3].T + equations[:, 3]
        deepest = max(deepest, float(np.max(-signed.max(axis=1))))
    return deepest


def regional_candidates(mesh, tolerance, progress=None):
    """Yield native rounded boxes supported by six connected planar regions.

    Arbitrary rigid placement, dimensions and unit scales are supported. Local
    concavity exceeding measured coordinate precision is rejected, even when
    it lies within the user's distance budget. Numerical and sampled limits
    still apply; this is not a proof that every microscopic feature survives.
    Tight tolerances are rejected by inexpensive analytic probes before any
    native surface meshing is attempted.
    """
    if (not np.isfinite(tolerance) or tolerance <= 0
            or mesh.metadata.get("preserve_vertex_identity")
            or not mesh.is_watertight or not mesh.is_winding_consistent
            or mesh.euler_number != 2 or mesh.volume <= 0
            or mesh.body_count != 1 or len(mesh.faces) < 40):
        return
    vertices = np.asarray(mesh.vertices)
    if not np.isfinite(vertices).all():
        return
    scale = float(mesh.scale)
    if scale <= 1e-7:
        return
    origin = np.asarray(mesh.bounds).mean(axis=0)
    # STL coordinates are commonly float32 even though Trimesh stores doubles.
    # Account for that quantization, while refusing precision-poor requests.
    numeric_mm = max(scale * 2e-7, float(np.abs(vertices).max()) * np.finfo(np.float32).eps)
    if numeric_mm > tolerance * .025 or numeric_mm > scale * .0001:
        return
    _notify(progress, "Erkenne zusammenhängende Ebenen und gemeinsame Kantenrundungen …")
    regions = _plane_regions(mesh, origin, numeric_mm)
    if len(regions) < 6:
        return
    segmented_count = len(regions)
    # A coarsely tessellated cylinder contains small planar two-triangle
    # strips too. Use the six dominant supports only; the complete SDF fit
    # independently rejects chamfers, additional holes, and wrong hypotheses.
    regions = regions[:6]
    normals = np.asarray([region["normal"] for region in regions])
    unused = set(range(6))
    pairs = []
    while unused:
        first = min(unused)
        opposite = [other for other in unused if other != first
                    and normals[first] @ normals[other] <= -np.cos(.002)]
        if len(opposite) != 1:
            return
        second = opposite[0]
        pairs.append((first, second))
        unused.difference_update((first, second))
    raw_axes = np.asarray([(normals[first] - normals[second]) / 2 for first, second in pairs])
    raw_axes /= np.linalg.norm(raw_axes, axis=1)[:, None]
    if np.max(np.abs(raw_axes @ raw_axes.T - np.eye(3))) > .002:
        return
    # The nearest orthogonal frame removes only measured normal noise. All
    # mesh vertices must independently pass the full model residual below.
    u, _, vt = np.linalg.svd(raw_axes)
    axes = u @ vt
    if np.linalg.det(axes) < 0:
        axes[2] *= -1
    lows, highs = [], []
    for axis, (first, second) in zip(axes, pairs):
        offsets = sorted((float(regions[first]["centre"] @ axis),
                          float(regions[second]["centre"] @ axis)))
        lows.append(offsets[0])
        highs.append(offsets[1])
    half_extents = (np.asarray(highs) - lows) / 2
    if np.min(half_extents) <= numeric_mm * 20:
        return
    centre_local = (np.asarray(highs) + lows) / 2
    centre = origin + centre_local @ axes
    local = (vertices - centre) @ axes.T
    # Normalize the optimization so a mm/cm/inch change cannot alter its
    # convergence criterion. Fit is bounded and uses a deterministic subset.
    normalized = local / scale
    half = half_extents / scale
    indices = np.linspace(0, len(local) - 1, min(len(local), 6000), dtype=int)
    fit_points = normalized[indices]

    def loss(radius):
        distances = _rounded_box_sdf(fit_points, half, radius)
        return float(distances @ distances / len(distances))

    fitted = minimize_scalar(loss, bounds=(max(numeric_mm * 8 / scale, half.min() * .0001),
                                           half.min() * .98), method="bounded",
                             options={"xatol": 1e-12, "maxiter": 100})
    if not fitted.success:
        return
    radius = float(fitted.x) * scale
    # A measurable curved region is required; a sharp box is handled by the
    # existing profile route, and vanishing rounds are not invented here.
    if radius <= max(numeric_mm * 20, half_extents.min() * .002):
        return
    vertex_error = float(np.max(np.abs(_rounded_box_sdf(local, half_extents, radius))))
    fit_limit = max(numeric_mm * 5, min(tolerance * .08, radius * .002, scale * .0002))
    if fit_limit > tolerance * .12 or vertex_error > fit_limit:
        return
    centres = (np.asarray(mesh.triangles_center) - centre) @ axes.T
    midpoints = (vertices[mesh.edges_unique].mean(axis=1) - centre) @ axes.T
    probe = np.vstack((centres, midpoints))
    probe_error = float(np.max(np.abs(_rounded_box_sdf(probe, half_extents, radius))))
    if probe_error > tolerance * .82:
        return
    interior_depth = _convex_hull_interior_depth(normalized)
    if interior_depth is None or interior_depth * scale > numeric_mm * 4:
        return
    edge_support, corner_support = _feature_support(centres, half_extents, radius)
    if min(edge_support.values()) < 2 or min(corner_support.values()) < 1:
        return
    # Native construction is intentionally last: unsuitable coarse or damaged
    # surfaces never cause an expensive native CAD tessellation here.
    shape = cq.Workplane("XY").box(*(half_extents * 2)).edges().fillet(radius).val()
    plane = cq.Plane(origin=tuple(centre), xDir=tuple(axes[0]), normal=tuple(axes[2]))
    shape = shape.located(cq.Location(plane))
    if (not shape.isValid() or len(shape.Solids()) != 1
            or any(not shell.Closed() or not shell.isValid() for shell in shape.Shells())):
        return
    types = {}
    for face in shape.Faces():
        name = face.geomType()
        types[name] = types.get(name, 0) + 1
    if types != {"PLANE": 6, "CYLINDER": 12, "SPHERE": 8}:
        return
    supports = []
    for region in regions:
        supports.append({"triangles": int(len(region["indices"])),
                         "area_mm2": region["area"],
                         "normal_world": region["normal"].tolist(),
                         "planarity_max_mm": region["residual"]})
    details = {"regional_model": "uniform_edge_rounded_box", "planar_regions": 6,
               "segmented_planar_patch_count": segmented_count,
               "cylindrical_regions": 12, "spherical_regions": 8,
               "plane_supports": supports, "edge_support_triangles": edge_support,
               "corner_support_triangles": corner_support,
               "dimensions_mm": (half_extents * 2).tolist(), "radius_mm": radius,
               "centre_mm": centre.tolist(), "axes_world": axes.tolist(),
               "vertex_fit_max_mm": vertex_error,
               "mesh_probe_max_mm": probe_error,
               "convex_hull_vertex_interior_max_mm": interior_depth * scale,
               "convex_hull_numeric_allowance_mm": numeric_mm * 4,
               "convex_hull_projection_pair_limit": MAX_HULL_PROJECTION_PAIRS,
               "scope": "six_plane_uniform_fillet_box_not_general_surface_merging"}
    yield shape, "Regionale Rekonstruktion: Quader mit Kantenrundungen", details
