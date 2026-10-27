"""Bounded constant outer profiles with explicitly reconstructed conical holes.

Every input vertex height defines a section boundary.  All resolved wall
triangles must belong to the unchanged vertical outer boundary or to an
observed circular cylinder/cone.  Unknown sloped details cause rejection,
including details that happen to fall between the three interior sections.
The engine still performs its independent topology, distance and STEP checks.
"""
from __future__ import annotations

from collections import Counter
import math

import cadquery as cq
import numpy as np
from OCP.Standard import Standard_Failure
from shapely import distance, points
from shapely.geometry import LineString


MAX_LEVELS = 40
MAX_HOLES = 16
MAX_SEGMENTS = 48
MAX_RAW_SEGMENTS = 320
MAX_RING_POINTS = 1200
MAX_WIRE_EDGES = 600
MAX_PROBES = 100_000


def _levels(values, numeric):
    groups = []
    for value in np.sort(values):
        if not groups or value - groups[-1][0] > numeric * 4:
            groups.append([float(value)])
        else:
            groups[-1].append(float(value))
        if len(groups) > MAX_LEVELS:
            return None
    levels = np.asarray([np.mean(group) for group in groups])
    if len(levels) < 2 or np.min(np.diff(levels)) <= numeric * 12:
        return None
    return levels


def _circle_ring(ring, budget, numeric):
    from .engine import _circle
    from .layers import _clean_ring
    if len(ring.coords) > MAX_RING_POINTS:
        return None
    cleaned = _clean_ring(ring, numeric * 4)
    fitted = _circle(cleaned, budget)
    if fitted is None:
        return None
    centre, radius = fitted
    return np.asarray(centre), float(radius)


def _refine_segment(local, centre, bottom, top, r0, r1, numeric, budget):
    """Fit the actual wall vertices rather than interpolated chord points."""
    slope = (r1 - r0) / (top - bottom)
    triangles = local.triangles
    caps = np.ptp(triangles[:, :, 2], axis=1) <= numeric * 4
    nearby = np.all(abs(np.linalg.norm(triangles[:, :, :2] - centre, axis=2)
                        - (r0 + slope * (triangles[:, :, 2] - bottom))) <= budget, axis=1)
    overlaps = ((triangles[:, :, 2].min(axis=1) < top - numeric * 4)
                & (triangles[:, :, 2].max(axis=1) > bottom + numeric * 4))
    inner = np.einsum("ij,ij->i", local.face_normals[:, :2],
                      local.triangles_center[:, :2] - centre) < 0
    indices = np.unique(local.faces[nearby & overlaps & inner & ~caps].reshape(-1))
    if len(indices) < 8:
        return None
    original = local.vertices[indices]
    centers = []
    # Real circular vertices at a constant height constrain the common axis.
    # Mesh section vertices inside a chord need not themselves lie on a circle.
    for height in np.unique(np.round(original[:, 2] / (numeric * 4))):
        ring = original[np.abs(original[:, 2] / (numeric * 4) - height) < 1, :2]
        if len(ring) < 8:
            continue
        origin = ring.mean(axis=0)
        p = ring - origin
        matrix = np.column_stack((2 * p, np.ones(len(p))))
        values, _, rank, _ = np.linalg.lstsq(matrix, (p * p).sum(axis=1), rcond=None)
        if rank != 3:
            return None
        fitted = origin + values[:2]
        radius = np.linalg.norm(ring - fitted, axis=1)
        if np.max(abs(radius - radius.mean())) > numeric * 16:
            return None
        centers.append(fitted)
    if not centers:
        return None
    refined = np.mean(centers, axis=0)
    if (np.max(np.linalg.norm(np.asarray(centers) - refined, axis=1)) > numeric * 16
            or np.linalg.norm(refined - centre) > budget):
        return None
    radii = np.linalg.norm(original[:, :2] - refined, axis=1)
    refined_slope, intercept = np.polyfit(original[:, 2] - bottom, radii, 1)
    if np.max(abs(radii - (intercept + refined_slope * (original[:, 2] - bottom)))) > numeric * 16:
        return None
    return refined, float(intercept), float(intercept + refined_slope * (top - bottom))


def _match_holes(reference, other, numeric):
    remaining, matched = list(other), []
    for centre, _ in reference:
        if not remaining:
            return None
        index = min(range(len(remaining)), key=lambda i: np.linalg.norm(remaining[i][0] - centre))
        item = remaining.pop(index)
        if np.linalg.norm(item[0] - centre) > numeric * 16:
            return None
        matched.append(item)
    return matched if not remaining else None


def _verified_walls(local, outer, holes, constant_profiles, numeric, budget):
    triangles = local.triangles
    caps = np.ptp(triangles[:, :, 2], axis=1) <= numeric * 4
    probes = np.concatenate((triangles, (triangles + np.roll(triangles, -1, axis=1)) * .5,
                             triangles.mean(axis=1)[:, None, :]), axis=1)
    if probes.size // 3 > MAX_PROBES:
        return None
    boundary_distances = np.asarray(distance(points(probes[:, :, :2].reshape((-1, 2))),
                                             LineString(outer.coords))).reshape((-1, 7))
    outer_walls = ((abs(local.face_normals[:, 2]) < .002)
                   & np.all(boundary_distances <= numeric * 16, axis=1))
    verified = caps | outer_walls
    for profile in constant_profiles:
        on_ring = np.asarray(distance(points(probes[:, :, :2].reshape((-1, 2))),
                                     LineString(profile["ring"].coords))).reshape((-1, 7))
        in_band = ((triangles[:, :, 2].min(axis=1) >= profile["bottom_mm"] - numeric * 4)
                   & (triangles[:, :, 2].max(axis=1) <= profile["top_mm"] + numeric * 4))
        verified |= in_band & (abs(local.face_normals[:, 2]) < .002) & np.all(on_ring <= numeric * 16, axis=1)
    for hole in holes:
        centre = np.asarray(hole["centre_mm"])
        for first in range(len(hole["segments"])):
            # STL walls can cross levels introduced by an unrelated hole. Test
            # each contiguous sequence of matching slopes as one observed law.
            chain = [hole["segments"][first]]
            slope = ((chain[0]["top_radius_mm"] - chain[0]["bottom_radius_mm"])
                     / (chain[0]["top_mm"] - chain[0]["bottom_mm"]))
            for following in hole["segments"][first + 1:]:
                previous = chain[-1]
                next_slope = ((following["top_radius_mm"] - following["bottom_radius_mm"])
                              / (following["top_mm"] - following["bottom_mm"]))
                if (abs(previous["top_mm"] - following["bottom_mm"]) > numeric * 4
                        or abs(previous["top_radius_mm"] - following["bottom_radius_mm"]) > numeric * 16
                        or abs(next_slope - slope) * local.extents[2] > numeric * 16):
                    break
                chain.append(following)
            bottom, top = chain[0]["bottom_mm"], chain[-1]["top_mm"]
            in_band = ((np.min(triangles[:, :, 2], axis=1) >= bottom - numeric * 4)
                       & (np.max(triangles[:, :, 2], axis=1) <= top + numeric * 4))
            indices = np.flatnonzero(in_band & ~verified)
            if not len(indices):
                continue
            selected = probes[indices]
            radius = np.linalg.norm(selected[:, :, :2] - centre, axis=2)
            expected = (chain[0]["bottom_radius_mm"]
                        + slope * (selected[:, :, 2] - bottom))
            # Original vertices must support the circular family numerically;
            # chord interiors may differ by the bounded STL tessellation sag.
            exact_vertices = np.all(abs(radius[:, :3] - expected[:, :3]) <= numeric * 16, axis=1)
            bounded_chords = np.all(abs(radius - expected) <= budget, axis=1)
            normals = local.face_normals[indices]
            radial = local.triangles_center[indices, :2] - centre
            inner = np.einsum("ij,ij->i", normals[:, :2], radial) < 0
            # A native cone may have differently phased circular vertex rings.
            # Their short triangulation faces can have misleading slopes even
            # though every original vertex follows the same exact radius law.
            # Vertex support, inward orientation and all chord probes provide
            # the evidence; an arbitrary face-normal slope is not averaged.
            verified[indices[exact_vertices & bounded_chords & inner]] = True
    if not np.all(verified):
        return None
    return int(probes.size // 3)


def _merged_segments(segments, numeric, height):
    result = []
    for segment in segments:
        segment = dict(segment)
        if result:
            previous = result[-1]
            slope = ((previous["top_radius_mm"] - previous["bottom_radius_mm"])
                     / (previous["top_mm"] - previous["bottom_mm"]))
            next_slope = ((segment["top_radius_mm"] - segment["bottom_radius_mm"])
                          / (segment["top_mm"] - segment["bottom_mm"]))
            if (abs(previous["top_mm"] - segment["bottom_mm"]) <= numeric * 4
                    and abs(previous["top_radius_mm"] - segment["bottom_radius_mm"]) <= numeric * 16
                    and abs(slope - next_slope) * height <= numeric * 16):
                previous["top_mm"] = segment["top_mm"]
                previous["top_radius_mm"] = segment["top_radius_mm"]
                continue
        result.append(segment)
    return result


def conical_profile_shape(local_mesh, options, progress=None):
    """Return ``(shape, JSON details)`` for constant exteriors/conical holes.

    The prospective axis is local Z. Only circular inner walls are supported;
    all other sloped geometry is rejected before construction. Plain cylindrical
    holes are left to the established prism/layer families.
    """
    local = local_mesh
    if (local.metadata.get("preserve_vertex_identity") or not local.is_watertight
            or not local.is_winding_consistent or local.volume <= 0
            or not np.isfinite(local.vertices).all() or not math.isfinite(options.tolerance)
            or options.tolerance <= 0 or options.rounds != "keep"
            or len(local.faces) * 7 > MAX_PROBES):
        return None
    numeric = max(1e-8, float(local.scale) * 2e-7)
    levels = _levels(local.vertices[:, 2], numeric)
    if levels is None:
        return None
    from .engine import section_polygons
    from .layers import _wire
    outer, holes, constant_profiles = None, [], []
    section_count = 0
    for bottom, top in zip(levels[:-1], levels[1:]):
        heights = bottom + (top - bottom) * np.asarray([.2, .5, .8])
        sections = [section_polygons(local, (0, 0, float(z)), (0, 0, 1), [0, 1]) for z in heights]
        section_count += 3
        if any(len(polys) != 1 or len(polys[0].interiors) > MAX_HOLES for polys in sections):
            return None
        polygons = [polys[0] for polys in sections]
        if outer is None:
            outer = polygons[1].exterior
            if len(outer.coords) > MAX_RING_POINTS:
                return None
        if any(LineString(poly.exterior.coords).hausdorff_distance(LineString(outer.coords)) > numeric * 16
               for poly in polygons):
            return None
        fits, noncircular = [], []
        for poly in polygons:
            circles, fixed = [], []
            for ring in poly.interiors:
                if len(ring.coords) > MAX_RING_POINTS:
                    return None
                circle = _circle_ring(ring, options.tolerance * .35, numeric)
                (fixed if circle is None else circles).append(ring if circle is None else circle)
            fits.append(circles)
            noncircular.append(fixed)
        if len(noncircular[0]) != len(noncircular[1]) or len(noncircular[2]) != len(noncircular[1]):
            return None
        for ring in noncircular[1]:
            for others in (noncircular[0], noncircular[2]):
                if not others:
                    return None
                index = min(range(len(others)), key=lambda i: ring.hausdorff_distance(others[i]))
                if ring.hausdorff_distance(others.pop(index)) > numeric * 16:
                    return None
            matching = [profile for profile in constant_profiles
                        if abs(profile["top_mm"] - bottom) <= numeric * 4
                        and ring.hausdorff_distance(profile["ring"]) <= numeric * 16]
            if matching:
                matching[0]["top_mm"] = float(top)
            else:
                constant_profiles.append({"ring": ring, "bottom_mm": float(bottom), "top_mm": float(top)})
            if len(constant_profiles) > MAX_HOLES:
                return None
        lower = _match_holes(fits[1], fits[0], numeric)
        upper = _match_holes(fits[1], fits[2], numeric)
        if lower is None or upper is None:
            return None
        for a, b, c in zip(lower, fits[1], upper):
            centres = np.asarray([a[0], b[0], c[0]])
            centre = centres.mean(axis=0)
            radii = np.asarray([a[1], b[1], c[1]])
            slope, intercept = np.polyfit(heights - bottom, radii, 1)
            if np.max(abs(radii - (intercept + slope * (heights - bottom)))) > options.tolerance * .1:
                return None
            r0, r1 = float(intercept), float(intercept + slope * (top - bottom))
            refined = _refine_segment(local, centre, float(bottom), float(top), r0, r1,
                                      numeric, options.tolerance * .35)
            if refined is None:
                return None
            centre, r0, r1 = refined
            if min(r0, r1) < -numeric * 16 or max(r0, r1) <= numeric * 16:
                return None
            if min(r0, r1) <= numeric * 16:
                # A tip radius is zero only when the unchanged vertices give
                # that evidence; the wall verification below checks the tip.
                r0 = 0. if r0 <= numeric * 16 else r0
                r1 = 0. if r1 <= numeric * 16 else r1
            matching = [hole for hole in holes if np.linalg.norm(np.asarray(hole["centre_mm"]) - centre) <= numeric * 16]
            if not matching:
                holes.append({"centre_mm": centre.tolist(), "segments": []})
                if len(holes) > MAX_HOLES:
                    return None
                matching = [holes[-1]]
            matching[0]["segments"].append({"bottom_mm": float(bottom), "top_mm": float(top),
                                              "bottom_radius_mm": r0, "top_radius_mm": r1})
    if not holes or sum(len(hole["segments"]) for hole in holes) > MAX_RAW_SEGMENTS:
        return None
    for hole in holes:
        hole["segments"] = _merged_segments(hole["segments"], numeric, float(local.extents[2]))
    if sum(len(hole["segments"]) for hole in holes) > MAX_SEGMENTS:
        return None
    cones = sum(abs(segment["top_radius_mm"] - segment["bottom_radius_mm"]) > numeric * 16
                for hole in holes for segment in hole["segments"])
    if not cones:
        return None
    probes = _verified_walls(local, outer, holes, constant_profiles, numeric, options.tolerance * .35)
    if probes is None:
        return None
    if progress:
        progress(f"Rekonstruiere {cones} belegte konische Bohrungsabschnitte …")
    try:
        wire = _wire(outer, float(levels[0]), options, numeric)
        if wire is None or len(wire.Edges()) > MAX_WIRE_EDGES:
            return None
        shape = cq.Solid.extrudeLinear(wire, [], (0, 0, float(levels[-1] - levels[0])))
        cutters = []
        edge_count = len(wire.Edges())
        from .layers import _clean_ring
        for profile in constant_profiles:
            coordinates = _clean_ring(profile["ring"], numeric * 4)
            fixed = cq.Wire.makePolygon([(float(x), float(y), profile["bottom_mm"])
                                         for x, y in coordinates[:-1]], close=True)
            edge_count += len(fixed.Edges())
            if edge_count > MAX_WIRE_EDGES:
                return None
            cutters.append(cq.Solid.extrudeLinear(fixed, [],
                           (0, 0, profile["top_mm"] - profile["bottom_mm"])))
        for hole in holes:
            x, y = hole["centre_mm"]
            for segment in hole["segments"]:
                r0, r1 = segment["bottom_radius_mm"], segment["top_radius_mm"]
                origin = cq.Vector(x, y, segment["bottom_mm"])
                height = segment["top_mm"] - segment["bottom_mm"]
                if abs(r1 - r0) <= numeric * 16:
                    cutters.append(cq.Solid.makeCylinder((r0 + r1) * .5, height, origin))
                else:
                    cutters.append(cq.Solid.makeCone(r0, r1, height, origin))
        shape = shape.cut(*cutters, tol=numeric * 4).clean()
        if (not shape.isValid() or len(shape.Solids()) != 1 or shape.Volume() <= 0
                or any(not shell.Closed() or not shell.isValid() for shell in shape.Shells())):
            return None
        details = {"family": "constant_profile_conical_holes", "holes": holes,
                   "constant_profile_voids": [{"bottom_mm": profile["bottom_mm"],
                                               "top_mm": profile["top_mm"],
                                               "section_vertices": len(profile["ring"].coords) - 1}
                                              for profile in constant_profiles],
                   "conical_sections": int(cones), "axial_sections_checked": section_count,
                   "source_height_levels_mm": levels.tolist(), "all_triangle_probes_checked": probes,
                   "numeric_family_residual_mm": numeric * 16,
                   "surface_types": dict(Counter(face.geomType() for face in shape.Faces())),
                   "scope": "constant_outer_profile_with_observed_circular_cylindrical_and_conical_voids"}
        return shape, details
    except (ValueError, RuntimeError, Standard_Failure):
        return None
