"""Conservative line/circle reconstruction of one closed planar STL section.

This module proposes native analytic geometry; callers still have to validate
the complete solid against the original mesh.  Only well supported circles are
recognised.  General curves remain the caller's polygonal fallback.
"""
from __future__ import annotations

from dataclasses import dataclass
import math

import cadquery as cq
import numpy as np
from shapely.geometry import LineString, Polygon


@dataclass(frozen=True)
class _Arc:
    centre: np.ndarray
    radius: float
    start: float
    sweep: float

    def at(self, fraction):
        angle = self.start + self.sweep * fraction
        return self.centre + self.radius * np.array([math.cos(angle), math.sin(angle)])


def _circle_fit(points, tolerance, fit_tolerance):
    """Fit a circle constrained through both unchanged chain endpoints."""
    first, last = points[0], points[-1]
    chord = last - first
    chord_length = float(np.linalg.norm(chord))
    if chord_length <= fit_tolerance:
        return None
    middle = (first + last) * 0.5
    perpendicular = np.array([-chord[1], chord[0]]) / chord_length
    local = points - middle
    along = local @ perpendicular
    denominator = float(2 * np.dot(along, along))
    if denominator <= fit_tolerance**2:
        return None
    offset = float(np.dot(along, np.einsum("ij,ij->i", local, local) - chord_length**2 / 4) / denominator)
    centre = middle + offset * perpendicular
    radius = math.hypot(chord_length / 2, offset)
    vectors = points - centre
    if radius <= fit_tolerance or np.max(abs(np.linalg.norm(vectors, axis=1) - radius)) > fit_tolerance:
        return None
    angles = np.unwrap(np.arctan2(vectors[:, 1], vectors[:, 0]))
    steps = np.diff(angles)
    direction = 1 if angles[-1] > angles[0] else -1
    # Require a consistently ordered arc with adequate samples; never replace
    # a rectangular corner or sparse chamfer merely because three points fit.
    if np.any(steps * direction <= 1e-9) or np.max(abs(steps)) > math.pi / 3:
        return None
    sweep = float(angles[-1] - angles[0])
    if not 0.1 <= abs(sweep) <= math.pi * 1.95:
        return None
    midpoints = (points[:-1] + points[1:]) * 0.5
    if np.max(abs(np.linalg.norm(midpoints - centre, axis=1) - radius)) > tolerance:
        return None
    return _Arc(centre, radius, float(angles[0]), sweep)


def _whole_circle(points, tolerance, fit_tolerance):
    if len(points) < 8:
        return None
    origin = points.mean(axis=0)
    local = points - origin
    matrix = np.column_stack((2 * local, np.ones(len(points))))
    values, _, rank, _ = np.linalg.lstsq(matrix, np.einsum("ij,ij->i", local, local), rcond=None)
    if rank != 3:
        return None
    centre = origin + values[:2]
    radii = np.linalg.norm(points - centre, axis=1)
    radius = float(np.mean(radii))
    if radius <= fit_tolerance or np.max(abs(radii - radius)) > fit_tolerance:
        return None
    vectors = np.vstack((points, points[:1])) - centre
    angles = np.unwrap(np.arctan2(vectors[:, 1], vectors[:, 0]))
    steps = np.diff(angles)
    direction = 1 if angles[-1] > angles[0] else -1
    if np.any(steps * direction <= 1e-9) or np.max(abs(steps)) > math.pi / 3:
        return None
    if abs(abs(angles[-1] - angles[0]) - 2 * math.pi) > 1e-6:
        return None
    midpoints = (points + np.roll(points, -1, axis=0)) * 0.5
    if np.max(abs(np.linalg.norm(midpoints - centre, axis=1) - radius)) > tolerance:
        return None
    return cq.Wire.makeCircle(radius, (float(centre[0]), float(centre[1]), 0), (0, 0, direction))


def profile_wire(points2d, tolerance):
    """Return a closed analytic wire at Z=0, or None without stable arc evidence.

    ``points2d`` is the original ordered closed ring, before any tolerance based
    simplification.  The fit requires at least five vertices per circular arc,
    sub-budget radial residuals, monotonic angular order and bounded chord sag.
    Arc endpoints stay fixed.  Rings with no recognised arcs are left to the
    existing polygonal reconstruction.  The global solid acceptance gate is
    deliberately not duplicated here.
    """
    points = np.asarray(points2d, dtype=float)
    if (points.ndim != 2 or points.shape[1] != 2 or len(points) < 6 or
            not np.isfinite(points).all() or not math.isfinite(tolerance) or tolerance <= 0):
        return None
    scale = float(np.linalg.norm(np.ptp(points, axis=0)))
    if scale <= 1e-10:
        return None
    epsilon = min(tolerance * 0.01, max(1e-10, scale * 2e-8))
    if np.linalg.norm(points[0] - points[-1]) > epsilon:
        return None
    original = LineString(points)
    polygon = Polygon(points)
    if not polygon.is_valid or polygon.area <= epsilon**2:
        return None
    # Sectioning a triangulated wall inserts points along each STL chord.
    # Remove only this numerical/collinear noise, never tolerance-sized detail.
    points = np.asarray(original.simplify(epsilon, preserve_topology=True).coords[:-1])
    # LineString simplification necessarily keeps its first/last point. A mesh
    # section may start in the middle of a circular chord, so also remove that
    # redundant seam point using the cyclic neighbours. Otherwise one midpoint
    # falsely spoils the full-circle fit and leaves short straight seam edges.
    while len(points) > 4:
        seam_chord = points[1] - points[-1]
        squared_length = float(seam_chord @ seam_chord)
        if squared_length <= epsilon**2:
            break
        parameter = float((points[0] - points[-1]) @ seam_chord / squared_length)
        projection = points[-1] + parameter * seam_chord
        if not 0 < parameter < 1 or np.linalg.norm(points[0] - projection) > epsilon:
            break
        points = points[1:]
    if len(points) < 5 or len(points) > 1200:
        return None
    fit_tolerance = min(tolerance * 0.04, max(1e-12, scale * 2e-5))
    circle = _whole_circle(points, tolerance, fit_tolerance)
    if circle is not None:
        return circle

    count = len(points)
    doubled = np.vstack((points, points))
    candidates = []
    for start in range(count):
        end = start + 4
        arc = _circle_fit(doubled[start:end + 1], tolerance, fit_tolerance)
        if arc is None:
            continue
        # Extend each well-supported seed only while all its original samples
        # continue to support the same circular family.
        while end + 1 < start + count:
            extended = _circle_fit(doubled[start:end + 2], tolerance, fit_tolerance)
            if extended is None:
                break
            arc = extended
            end += 1
        candidates.append((end - start, start, arc))
    if not candidates:
        return None

    # A longest-first edge cover makes the result independent of the arbitrary
    # first vertex returned by the STL section (including a start inside an arc).
    used = np.zeros(count, dtype=bool)
    accepted = {}
    for length, start, arc in sorted(candidates, key=lambda item: (-item[0], item[1])):
        covered = (np.arange(length) + start) % count
        if not used[covered].any():
            used[covered] = True
            accepted[start] = (length, arc)
    if not accepted:
        return None

    begin = min(accepted)
    offset = 0
    edges = []
    sampled = []
    try:
        while offset < count:
            index = (begin + offset) % count
            first = points[index]
            if index in accepted:
                length, arc = accepted[index]
                last = points[(index + length) % count]
                midpoint = arc.at(0.5)
                edges.append(cq.Edge.makeThreePointArc((*first, 0), (*midpoint, 0), (*last, 0)))
                # Check that the mixed boundary is simple, and that its sampled
                # two-way profile distance respects the requested profile budget.
                angular_step = max(0.002, min(0.05, math.sqrt(8 * tolerance * 0.01 / arc.radius)))
                sample_count = max(4, math.ceil(abs(arc.sweep) / angular_step))
                sampled.extend(arc.at(fraction) for fraction in np.linspace(0, 1, sample_count + 1)[:-1])
                offset += length
            else:
                last = points[(index + 1) % count]
                edges.append(cq.Edge.makeLine((*first, 0), (*last, 0)))
                sampled.append(first)
                offset += 1
        sampled.append(sampled[0])
        if not Polygon(sampled).is_valid or original.hausdorff_distance(LineString(sampled)) > tolerance:
            return None
        wire = cq.Wire.assembleEdges(edges)
        if not wire.isValid() or not wire.IsClosed() or not cq.Face.makeFromWires(wire).isValid():
            return None
        return wire
    except (ValueError, RuntimeError):
        return None
