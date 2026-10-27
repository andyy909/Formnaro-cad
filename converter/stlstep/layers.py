"""Bounded reconstruction of stepped, constant-section mechanical parts.

Horizontal caps determine height intervals. Three sections inside every
interval must agree before profiles with circular arcs are extruded and fused.
The resulting proposal still requires the engine's native, topology, distance
and actual STEP checks. Sloped walls and arbitrary freeform parts are excluded.
"""
from __future__ import annotations

import cadquery as cq
import numpy as np
from shapely.ops import unary_union


MAX_LEVELS = 18
MAX_PROFILES = 40
MAX_WIRE_EDGES = 2000


def _clean_ring(ring, epsilon):
    from shapely.geometry import LineString, Polygon
    points = np.asarray(ring.coords[:-1], dtype=float)
    original = LineString(ring.coords)
    while len(points) > 4:
        removed = False
        for index in range(len(points)):
            first, middle, last = points[index - 1], points[index], points[(index + 1) % len(points)]
            chord = last - first
            squared = float(chord @ chord)
            if squared <= epsilon**2:
                continue
            parameter = float((middle - first) @ chord / squared)
            if 0 < parameter < 1 and np.linalg.norm(middle - (first + parameter * chord)) <= epsilon:
                points = np.delete(points, index, axis=0)
                removed = True
                break
        if not removed:
            break
    closed = np.vstack((points, points[0]))
    if not Polygon(closed).is_valid or original.hausdorff_distance(LineString(closed)) > epsilon:
        return ring.coords
    return closed


def _wire(ring, z, options, numeric):
    from .engine import _circle, profile_wire
    if options.rounds == "keep":
        circle = _circle(ring.coords, options.tolerance * .35)
        if circle is not None:
            centre, radius = circle
            return cq.Wire.makeCircle(radius, (float(centre[0]), float(centre[1]), z), (0, 0, 1))
        from .recognition import profile_wire as arc_wire
        cleaned = _clean_ring(ring, min(options.tolerance * .01, numeric * 4))
        wire = arc_wire(cleaned, options.tolerance * .35)
        if wire is not None:
            return wire.translate((0, 0, z))
    simplified = ring.simplify(options.tolerance * .25, preserve_topology=True)
    return profile_wire(simplified.coords, z, options)


def layered_shape(local, options, progress=None):
    """Return (local native shape, details), or None for an unsuitable part."""
    if (local.metadata.get("preserve_vertex_identity") or not local.is_watertight
            or not local.is_winding_consistent or local.volume <= 0):
        return None
    scale = float(local.scale)
    numeric = max(1e-8, scale * 2e-7)
    normals = np.abs(local.face_normals[:, 2])
    # True straight extrusions have horizontal cap normals and vertical walls.
    # STL coordinates are float32. After rotation, a narrow cap triangle can
    # have a visibly tilted normal although every vertex lies at the same
    # height within the coordinate uncertainty. Test that height directly;
    # shallow but resolved recesses must not become horizontal merely because
    # their normals or total area are close to those of the surrounding cap.
    caps = np.ptp(local.triangles[:, :, 2], axis=1) <= numeric * 4
    suitable = (normals < .002) | caps
    if np.any(~suitable):
        return None
    if np.count_nonzero(caps) < 4:
        return None
    values = np.sort(np.r_[local.bounds[:, 2], local.triangles_center[caps, 2]])
    groups = []
    for value in values:
        if not groups or value - groups[-1][0] > numeric * 4:
            groups.append([float(value)])
        else:
            groups[-1].append(float(value))
    levels = np.asarray([np.mean(group) for group in groups])
    # One prism is already covered by the existing profile reconstruction.
    if len(levels) < 3 or len(levels) > MAX_LEVELS or np.min(np.diff(levels)) < numeric * 12:
        return None
    if progress:
        progress(f"Prüfe gestufte Profile mit {len(levels) - 1} Höhenabschnitten …")
    from .engine import section_polygons
    pieces, profile_count, edge_count = [], 0, 0
    arc_radii = []
    layer_details = []
    for bottom, top in zip(levels[:-1], levels[1:]):
        sections = [section_polygons(local, (0, 0, bottom + (top - bottom) * fraction),
                                     (0, 0, 1), [0, 1]) for fraction in (.2, .5, .8)]
        if any(not polys or len(polys) > 8 for polys in sections):
            return None
        middle = sections[1]
        hole_count = sum(len(poly.interiors) for poly in middle)
        boundary = unary_union(middle).boundary
        for polys in (sections[0], sections[2]):
            if (len(polys) != len(middle) or sum(len(poly.interiors) for poly in polys) != hole_count
                    or unary_union(polys).boundary.hausdorff_distance(boundary) > options.tolerance * .1):
                return None
        profile_count += len(middle)
        if profile_count > MAX_PROFILES:
            return None
        for poly in middle:
            rings = [poly.exterior, *poly.interiors]
            if any(len(ring.coords) > 1200 for ring in rings):
                return None
            wires = [_wire(ring, float(bottom), options, numeric) for ring in rings]
            edge_count += sum(len(wire.Edges()) for wire in wires)
            if edge_count > MAX_WIRE_EDGES:
                return None
            for wire in wires:
                for edge in wire.Edges():
                    if edge.geomType() == "CIRCLE":
                        arc_radii.append(float(edge.radius()))
            pieces.append(cq.Solid.extrudeLinear(wires[0], wires[1:], (0, 0, float(top - bottom))))
        layer_details.append({"bottom_mm": float(bottom), "top_mm": float(top),
                              "profiles": len(middle), "holes": hole_count})
    if not pieces:
        return None
    shape = pieces[0].fuse(*pieces[1:], tol=numeric * 4).clean() if len(pieces) > 1 else pieces[0].clean()
    if (not shape.isValid() or len(shape.Solids()) != 1 or shape.Volume() <= 0
            or any(not shell.Closed() or not shell.isValid() for shell in shape.Shells())):
        return None
    details = {"regional_model": "stepped_constant_profiles", "layers": layer_details,
               "profile_count": profile_count, "reconstructed_wire_edges": edge_count,
               "curve_radii_mm": sorted(arc_radii),
               "scope": "constant_sections_between_observed_horizontal_caps_not_general_freeform"}
    return shape, details
