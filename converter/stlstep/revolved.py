"""Conservative circular-arc reconstruction of axial turning profiles.

Only axisymmetric section evidence proposes a native solid.  Acceptance against
the complete unchanged STL remains the responsibility of the engine, including
the STEP export/import check.  This module does not restore a design history.
"""
from __future__ import annotations

from collections import Counter
import math

import cadquery as cq
import numpy as np
from shapely import affinity
from shapely.geometry import LineString, MultiPolygon, Polygon, box
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

from .recognition import profile_wire


MIN_REVOLVED_TESSELLATION_MM = 0.0005


def _single_polygon(geometry):
    """Ignore only empty cut results; disconnected material is unsupported."""
    if isinstance(geometry, Polygon):
        return geometry if not geometry.is_empty and geometry.area > 1e-12 else None
    if isinstance(geometry, MultiPolygon) and len(geometry.geoms) == 1:
        return _single_polygon(geometry.geoms[0])
    return None


def _meridian(mesh, angle, section_polygons, limit, budget):
    cutting = mesh.copy()
    cutting.apply_transform(np.array([
        [math.cos(angle), math.sin(angle), 0, 0],
        [-math.sin(angle), math.cos(angle), 0, 0],
        [0, 0, 1, 0], [0, 0, 0, 1],
    ]))
    sections = section_polygons(cutting, (0, 0, 0), (0, 1, 0), [0, 2])
    if not sections:
        return None
    all_material = unary_union(sections)
    positive = _single_polygon(all_material.intersection(box(0, -limit, limit, limit)))
    negative = _single_polygon(all_material.intersection(box(-limit, -limit, 0, limit)))
    if positive is None or negative is None or not positive.is_valid or not negative.is_valid:
        return None
    reflected = affinity.scale(negative, xfact=-1, yfact=1, origin=(0, 0))
    if (len(positive.interiors) != len(reflected.interiors) or
            positive.hausdorff_distance(reflected) > budget):
        return None
    return orient(positive, sign=1)


def _wire(ring, budget, numeric):
    curved = profile_wire(ring.coords, budget)
    if curved is not None:
        return curved, [float(edge.radius()) for edge in curved.Edges() if edge.geomType() == "CIRCLE"]
    # An unrounded hole or straight boundary remains unchanged apart from
    # numerical collinear points created when the plane cuts STL triangles.
    points = np.asarray(LineString(ring.coords).simplify(numeric).coords[:-1])
    if len(points) < 3 or len(points) > 1200:
        return None, []
    return cq.Wire.makePolygon([(float(r), float(z), 0) for r, z in points], close=True), []


def rounded_revolution_shape(local_mesh, tolerance, progress=None):
    """Return ``(native_shape, details)`` for supported rounded turning parts.

    The supplied mesh is in a local frame with its prospective axis along Z.
    Outer and inner axial sections must be concentric circles at three heights.
    Three meridians must agree, with material/void loops and hard boundaries
    preserved.  At least one supported circular profile arc is required; callers
    should use the original straight-profile reconstruction otherwise.
    """
    if (not math.isfinite(tolerance) or tolerance <= 0 or
            len(local_mesh.faces) < 20 or not local_mesh.is_watertight or
            local_mesh.metadata.get("preserve_vertex_identity") or
            not np.isfinite(local_mesh.vertices).all()):
        return None
    # Lazy import keeps the independent reconstruction module free of an engine
    # import cycle; the established section/circle rules are shared unchanged.
    from .engine import _circle, section_polygons

    scale = float(local_mesh.scale)
    # Small toroidal patches may make the native kernel generate an excessive
    # verification mesh at microscopic deflection.  Leave these requests to a
    # checked simpler/exact fallback before constructing the curved proposal.
    tessellation_budget = max(1e-6, min(tolerance / 15, scale / 2000))
    if tessellation_budget < MIN_REVOLVED_TESSELLATION_MM:
        return None
    numeric = max(1e-10, scale * 2e-8)
    zmin, zmax = map(float, local_mesh.bounds[:, 2])
    height = zmax - zmin
    if height <= numeric:
        return None
    centres = []
    for fraction in (0.2, 0.5, 0.8):
        sections = section_polygons(local_mesh, (0, 0, zmin + fraction * height), (0, 0, 1), [0, 1])
        if len(sections) != 1:
            return None
        for ring in (sections[0].exterior, *sections[0].interiors):
            fitted = _circle(ring.coords, tolerance * 0.45)
            if fitted is None:
                return None
            centres.append(fitted[0])
    centre = np.mean(centres, axis=0)
    if max(np.linalg.norm(c - centre) for c in centres) > max(numeric, tolerance * 0.12):
        return None
    shifted = local_mesh.copy()
    shifted.apply_translation((-centre[0], -centre[1], 0))
    limit = max(scale, float(np.max(abs(shifted.vertices))), 1.0) * 2
    meridians = [_meridian(shifted, angle, section_polygons, limit, tolerance * 0.45)
                 for angle in (0, math.pi / 4, math.pi / 2)]
    if any(profile is None for profile in meridians):
        return None
    first = meridians[0]
    if any(len(profile.interiors) != len(first.interiors) or
           profile.hausdorff_distance(first) > tolerance * 0.45
           for profile in meridians[1:]):
        return None
    if progress is not None:
        progress("Kreisbögen und unterschiedliche Radien im Rotationsprofil erkennen …")

    proposals = []
    for index, profile in enumerate(meridians):
        try:
            outer, radii = _wire(profile.exterior, tolerance * 0.6, numeric)
            if outer is None:
                continue
            inner = []
            for ring in profile.interiors:
                wire, inner_radii = _wire(ring, tolerance * 0.6, numeric)
                if wire is None:
                    break
                inner.append(wire)
                radii.extend(inner_radii)
            if len(inner) != len(profile.interiors) or not radii:
                continue
            # The recognition API uses XY=(radius,height); rotate into XZ before
            # revolving around the actual local Z axis.
            outer = outer.rotate((0, 0, 0), (1, 0, 0), 90)
            inner = [wire.rotate((0, 0, 0), (1, 0, 0), 90) for wire in inner]
            shape = cq.Solid.revolve(outer, inner, 360, (0, 0, 0), (0, 0, 1)).clean()
            if (not shape.isValid() or len(shape.Solids()) != 1 or shape.Volume() <= 0 or
                    any(not shell.Closed() for shell in shape.Shells())):
                continue
            shape = shape.translate((float(centre[0]), float(centre[1]), 0))
            # Count groups with the same conservative residual used to recognise
            # an arc.  Unequal radius groups are never averaged into one radius.
            radius_groups = []
            fit_epsilon = min(tolerance * 0.024, max(1e-12, scale * 2e-5))
            for radius in sorted(radii):
                if not radius_groups or abs(radius - radius_groups[-1]) > fit_epsilon * 2:
                    radius_groups.append(radius)
            details = {
                "family": "rounded_revolution",
                "profile_arcs": len(radii),
                "profile_arc_radii_mm": sorted(radii),
                "radius_groups_mm": radius_groups,
                "meridian_sections_checked": 3,
                "axial_sections_checked": 3,
                "profile_holes": len(profile.interiors),
                "selected_meridian_degrees": index * 45,
                "surface_types": dict(Counter(face.geomType() for face in shape.Faces())),
            }
            proposals.append((shape, details))
        except (ValueError, RuntimeError):
            continue
    return min(proposals, key=lambda item: len(item[0].Faces())) if proposals else None
