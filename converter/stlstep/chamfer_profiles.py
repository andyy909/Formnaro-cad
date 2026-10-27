"""Bounded straight chamfers between fully observed horizontal mesh levels.

This family covers parallel-sided polygon profiles and circular rings whose
parameters vary linearly through a small number of height bands. Every mesh
vertex height contributes a level; a small blind recess cannot hide between
the three validation slices. Native STEP, topology and bidirectional distance
acceptance remain the engine's responsibility. General lofts are unsupported.
"""
from __future__ import annotations

import cadquery as cq
import numpy as np
from scipy.optimize import linear_sum_assignment
from shapely.geometry import LineString, Polygon

MAX_LEVELS = 12
MAX_PROFILES = 24
MAX_RING_POINTS = 600
MAX_POLYGON_EDGES = 80
MAX_WIRE_EDGES = 500
MAX_SLOPED_BANDS = 8
MIN_NATIVE_TESSELLATION_MM = .0005


def _clean_points(ring, numeric):
    """Remove only section-created points on the same original straight chord."""
    original = LineString(ring.coords)
    points = np.asarray(ring.coords[:-1], dtype=float)
    if len(points) > MAX_RING_POINTS:
        return None
    epsilon = numeric * 4
    for _ in range(16):
        first, last = np.roll(points, 1, axis=0), np.roll(points, -1, axis=0)
        chord = last - first
        squared = np.einsum("ij,ij->i", chord, chord)
        parameter = np.einsum("ij,ij->i", points - first, chord) / np.maximum(squared, epsilon**2)
        distance = np.linalg.norm(points - (first + parameter[:, None] * chord), axis=1)
        remove = (squared > epsilon**2) & (parameter > 0) & (parameter < 1) & (distance <= epsilon)
        if not remove.any():
            break
        if np.count_nonzero(~remove) < 3:
            return None
        points = points[~remove]
    closed = np.vstack((points, points[:1]))
    if not Polygon(closed).is_valid or original.hausdorff_distance(LineString(closed)) > epsilon:
        return None
    return points


def _ring(ring, options, numeric):
    from .engine import _circle
    points = _clean_points(ring, numeric)
    if points is None:
        return None
    if options.rounds == "keep":
        circle = _circle(np.vstack((points, points[:1])), options.tolerance * .3)
        if circle is not None:
            centre, radius = circle
            # Chord error has its own user budget. Vertex parameters must still
            # support a circular family, rather than averaging an oval away.
            residual = np.max(abs(np.linalg.norm(points - centre, axis=1) - radius))
            if residual <= min(options.tolerance * .02, max(numeric * 8, local_scale(points) * 2e-4)):
                return "circle", np.r_[centre, radius]
    if len(points) > MAX_POLYGON_EDGES:
        return None
    return "polygon", points


def local_scale(points):
    return float(np.linalg.norm(np.ptp(points, axis=0)))


def _match_points(first, other):
    if first.shape != other.shape:
        return None
    offsets = [np.max(np.linalg.norm(first - np.roll(other, shift, axis=0), axis=1))
               for shift in range(len(first))]
    return np.roll(other, int(np.argmin(offsets)), axis=0)


def _linear_ring(rings, options, numeric):
    descriptors = [_ring(ring, options, numeric) for ring in rings]
    if any(item is None for item in descriptors) or len({item[0] for item in descriptors}) != 1:
        return None
    kind = descriptors[0][0]
    first, middle, last = [item[1] for item in descriptors]
    if kind == "polygon":
        middle, last = _match_points(first, middle), _match_points(first, last)
        if middle is None or last is None:
            return None
        # A straight chamfer offsets parallel profile sides. Rotating or
        # twisting polygons would require unconstrained ruled spline surfaces.
        vectors = [np.roll(value, -1, axis=0) - value for value in (first, middle, last)]
        lengths = [np.linalg.norm(value, axis=1) for value in vectors]
        if any(np.any(length <= numeric * 8) for length in lengths):
            return None
        unit = [value / length[:, None] for value, length in zip(vectors, lengths)]
        if any(np.max(np.linalg.norm(value - unit[0], axis=1)) > .002 for value in unit[1:]):
            return None
    linear_budget = (numeric * 12 if kind == "polygon" else
                     min(options.tolerance * .02, max(numeric * 12, float(first[2]) * 2e-4)))
    if np.max(abs(middle - (first + last) * .5)) > linear_budget:
        return None
    slope = (last - first) / .6
    low, high = first - slope * .2, last + slope * .2
    changed = np.max(abs(high - low)) > numeric * 12
    if kind == "circle":
        if min(low[2], high[2]) <= numeric * 12:
            return None  # A pointed blind cone is deliberately unsupported.
        if np.linalg.norm(high[:2] - low[:2]) > numeric * 12:
            return None  # Oblique cone lofts are outside this analytic family.
    else:
        # Float32 STL rotation leaves micron-scale nonparallel edge noise.
        # Intersect common side directions at each height so native quadrilateral
        # faces are truly planar and share the same reconstructed vertices.
        directions = np.mean(unit, axis=0)
        directions /= np.linalg.norm(directions, axis=1)[:, None]
        normals = np.column_stack((-directions[:, 1], directions[:, 0]))
        reconstructed = []
        for values in (low, high):
            offsets = np.einsum("ij,ij->i", normals, (values + np.roll(values, -1, axis=0)) * .5)
            corners = []
            for index in range(len(values)):
                matrix = np.vstack((normals[index - 1], normals[index]))
                if abs(np.linalg.det(matrix)) < 1e-5:
                    return None
                corners.append(np.linalg.solve(matrix, offsets[[index - 1, index]]))
            rebuilt = np.asarray(corners)
            if np.max(np.linalg.norm(rebuilt - values, axis=1)) > numeric * 12:
                return None
            reconstructed.append(rebuilt)
        low, high = reconstructed
        if any(not Polygon(value).is_valid or Polygon(value).area <= numeric**2 * 16
               for value in (low, high)):
            return None
    return kind, low, high, bool(changed)


def _matched(polys, reference):
    """Assign by loop centres, never by unstable area order of separate islands."""
    if len(polys) != len(reference):
        return None
    centres = np.asarray([[p.centroid.x, p.centroid.y] for p in polys])
    target = np.asarray([[p.centroid.x, p.centroid.y] for p in reference])
    row, col = linear_sum_assignment(np.linalg.norm(target[:, None] - centres[None, :], axis=2))
    ordered = [polys[int(col[i])] for i in range(len(row))]
    return ordered


def _wire(kind, values, z):
    if kind == "circle":
        return cq.Wire.makeCircle(float(values[2]), (float(values[0]), float(values[1]), z), (0, 0, 1))
    return cq.Wire.makePolygon([(float(x), float(y), z) for x, y in values], close=True)


def _polygon_frustum(low, high, bottom, top):
    """Sew actual planar side faces rather than obtaining planar BSpline lofts."""
    lower = [(float(x), float(y), bottom) for x, y in low]
    upper = [(float(x), float(y), top) for x, y in high]
    faces = [cq.Face.makeFromWires(cq.Wire.makePolygon(ring, close=True))
             for ring in (lower, upper)]
    for index in range(len(lower)):
        other = (index + 1) % len(lower)
        quad = [lower[index], lower[other], upper[other], upper[index]]
        faces.append(cq.Face.makeFromWires(cq.Wire.makePolygon(quad, close=True)))
    return cq.Solid.makeSolid(cq.Shell.makeShell(faces))


def _snap_circle(values, z, vertices, numeric, options):
    """Use observed horizontal ring vertices to avoid triangulation radius bias."""
    from .engine import _circle
    points = vertices[abs(vertices[:, 2] - z) <= numeric * 4, :2]
    distances = abs(np.linalg.norm(points - values[:2], axis=1) - values[2])
    points = points[distances <= options.tolerance * .04]
    if len(points) < 8:
        return values
    angles = np.arctan2(points[:, 1] - values[1], points[:, 0] - values[0])
    points = points[np.argsort(angles)]
    result = _circle(np.vstack((points, points[:1])), options.tolerance * .3)
    if result is None:
        return values
    centre, radius = result
    if (np.max(abs(np.linalg.norm(points - centre, axis=1) - radius)) > numeric * 8
            or np.linalg.norm(centre - values[:2]) > numeric * 12
            or abs(radius - values[2]) > options.tolerance * .02):
        return values
    return np.r_[centre, radius]


def _constant_circle_groups(plans, numeric):
    """Share numerically identical cylindrical sections across observed bands."""
    groups = []
    for _, _, profiles, _ in plans:
        for rings in profiles:
            for index, (kind, low, high, changed) in enumerate(rings):
                if kind != "circle" or changed:
                    continue
                values = (low + high) * .5
                group = next((item for item in groups
                              if np.linalg.norm(item[0][:2] - values[:2]) <= numeric * 4
                              and abs(item[0][2] - values[2]) <= numeric * 4), None)
                if group is None:
                    group = [values, []]
                    groups.append(group)
                group[1].append((rings, index, low, high))
    for _, members in groups:
        target = np.mean([value for _, _, low, high in members for value in (low, high)], axis=0)
        for rings, index, _, _ in members:
            rings[index] = ("circle", target.copy(), target.copy(), False)
    return sum(len(members) > 1 for _, members in groups)


def chamfered_profile_shape(local_mesh, options, progress=None):
    """Return a local native solid and canonical details, or reject this family."""
    if (local_mesh.metadata.get("preserve_vertex_identity") or not local_mesh.is_watertight
            or not local_mesh.is_winding_consistent or local_mesh.volume <= 0
            or len(local_mesh.faces) > 16_000 or not np.isfinite(local_mesh.vertices).all()):
        return None
    scale = float(local_mesh.scale)
    numeric = max(1e-8, scale * 2e-7)
    if min(options.tolerance / 15, scale / 2000) < MIN_NATIVE_TESSELLATION_MM:
        return None
    # Include every resolved vertex level, not merely planar caps: shallow
    # internal recesses and changes in slopes must create their own interval.
    groups = []
    for value in np.sort(local_mesh.vertices[:, 2]):
        if not groups or value - groups[-1][0] > numeric * 4:
            groups.append([float(value)])
            if len(groups) > MAX_LEVELS:
                return None
        else:
            groups[-1].append(float(value))
    levels = np.asarray([np.mean(group) for group in groups])
    if len(levels) < 2 or np.min(np.diff(levels)) <= numeric * 12:
        return None
    caps = np.ptp(local_mesh.triangles[:, :, 2], axis=1) <= numeric * 4
    if not np.any((~caps) & (abs(local_mesh.face_normals[:, 2]) > .002)):
        return None  # Constant and ordinary stepped parts belong to 0.5.
    from .engine import section_polygons
    if progress:
        progress(f"Prüfe gerade Fasen in {len(levels) - 1} belegten Höhenabschnitten …")
    plans, count, edge_count, sloped_bands = [], 0, 0, 0
    for bottom, top in zip(levels[:-1], levels[1:]):
        sections = [section_polygons(local_mesh, (0, 0, bottom + (top - bottom) * f),
                                     (0, 0, 1), [0, 1]) for f in (.2, .5, .8)]
        middle = sections[1]
        if not middle or len(middle) > 6:
            return None
        first, last = _matched(sections[0], middle), _matched(sections[2], middle)
        if first is None or last is None:
            return None
        count += len(middle)
        if count > MAX_PROFILES:
            return None
        profiles, band_changed = [], False
        for a, b, c in zip(first, middle, last):
            if len(a.interiors) != len(b.interiors) or len(c.interiors) != len(b.interiors):
                return None
            ah = _matched([Polygon(r) for r in a.interiors], [Polygon(r) for r in b.interiors]) if b.interiors else []
            ch = _matched([Polygon(r) for r in c.interiors], [Polygon(r) for r in b.interiors]) if b.interiors else []
            triples = [(a.exterior, b.exterior, c.exterior)]
            triples.extend((x.exterior, y, z.exterior) for x, y, z in zip(ah, b.interiors, ch))
            rings = [_linear_ring(triple, options, numeric) for triple in triples]
            if any(ring is None for ring in rings):
                return None
            rings = [(kind, _snap_circle(low, bottom, local_mesh.vertices, numeric, options),
                       _snap_circle(high, top, local_mesh.vertices, numeric, options), changed)
                      if kind == "circle" else (kind, low, high, changed)
                      for kind, low, high, changed in rings]
            band_changed |= any(ring[3] for ring in rings)
            edge_count += sum(2 if ring[0] == "circle" else 2 * len(ring[1]) for ring in rings)
            if edge_count > MAX_WIRE_EDGES:
                return None
            profiles.append(rings)
        sloped_bands += int(band_changed)
        if sloped_bands > MAX_SLOPED_BANDS:
            return None
        plans.append((float(bottom), float(top), profiles, band_changed))
    if not sloped_bands:
        return None
    numerical_circle_groups = _constant_circle_groups(plans, numeric)
    pieces, bands = [], []
    try:
        for bottom, top, profiles, changed in plans:
            for rings in profiles:
                solids = []
                for kind, low, high, ring_changed in rings:
                    if ring_changed:
                        if kind == "polygon":
                            solid = _polygon_frustum(low, high, bottom, top)
                        else:
                            solid = cq.Solid.makeCone(float(low[2]), float(high[2]), top - bottom,
                                                     cq.Vector(float(low[0]), float(low[1]), bottom))
                    else:
                        start = _wire(kind, low, bottom)
                        solid = cq.Solid.extrudeLinear(start, [], (0, 0, top - bottom))
                    solids.append(solid)
                body = solids[0].cut(*solids[1:]) if len(solids) > 1 else solids[0]
                pieces.append(body)
            bands.append({"bottom_mm": bottom, "top_mm": top, "profiles": len(profiles),
                          "holes": sum(len(rings) - 1 for rings in profiles), "linear_slope": bool(changed)})
        shape = pieces[0].fuse(*pieces[1:], tol=numeric * 4).clean() if len(pieces) > 1 else pieces[0].clean()
        if (not shape.isValid() or len(shape.Solids()) != 1 or shape.Volume() <= 0
                or any(not shell.Closed() or not shell.isValid() for shell in shape.Shells())
                or any(face.geomType() not in ("PLANE", "CYLINDER", "CONE") for face in shape.Faces())):
            return None
        # Probe the actual boundary, including facet centres and edge centres.
        # A solid distance would be zero for a wrongly filled blind recess.
        from OCP.BRepExtrema import BRepExtrema_DistShapeShape
        boundary = cq.Compound.makeCompound(shape.Faces())
        probes = np.vstack((local_mesh.vertices, local_mesh.triangles_center,
                            local_mesh.vertices[local_mesh.edges_unique].mean(axis=1)))
        if len(probes) > 45_000:
            return None
        maximum = 0.0
        budget = options.tolerance * .35
        for point in probes:
            probe = cq.Vertex.makeVertex(*map(float, point))
            distance = BRepExtrema_DistShapeShape(probe.wrapped, boundary.wrapped)
            if not distance.IsDone() or distance.Value() > budget:
                return None
            maximum = max(maximum, float(distance.Value()))
    except (ValueError, RuntimeError):
        return None
    details = {"regional_model": "linear_chamfered_profiles", "bands": bands,
               "sloped_bands": sloped_bands, "profile_count": count,
               "reconstructed_wire_edges": edge_count, "observed_height_levels": len(levels),
               "numerically_shared_cylinders": numerical_circle_groups,
               "native_boundary_probe_count": len(probes), "native_boundary_probe_max_mm": maximum,
               "scope": "parallel_polygon_sides_and_circular_rings_between_all_observed_vertex_heights"}
    return shape, details
