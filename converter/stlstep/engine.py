"""Conservative profile reconstruction and checked planar mesh approximation.

Distances are deterministic samples against tessellated CAD, not Hausdorff
certificates. The unchanged input surface remains the geometric reference.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import asdict, dataclass, field, replace
from pathlib import Path
from typing import Callable
import json
import math
import os
import tempfile
import time

import cadquery as cq
import numpy as np
import trimesh
from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeEdge, BRepBuilderAPI_MakeWire, BRepBuilderAPI_MakeFace
from OCP.BRep import BRep_Builder
from OCP.TopAbs import TopAbs_EDGE
from OCP.TopExp import TopExp
from OCP.TopTools import TopTools_IndexedMapOfShape
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.BRepTools import BRepTools
from OCP.TopoDS import TopoDS, TopoDS_Shell, TopoDS_Solid
from shapely.geometry import Polygon, MultiPolygon, LineString, box
from shapely.geometry.polygon import orient


class ConversionError(ValueError):
    """A user-readable conversion failure."""


MIN_SMOOTH_TESSELLATION_MM = 0.0005


@dataclass(frozen=True)
class Options:
    tolerance: float = 0.15
    unit: float = 1.0
    mode: str = "auto"  # auto, smooth, planar, exact
    rounds: str = "keep"  # keep analytic circles, or planar chord approximation
    target_faces: int = 500
    samples: int = 6000
    max_triangles: int = 100_000
    fallback: bool = True
    repair: bool = False
    region_edits: dict | None = None

    def validate(self):
        if not math.isfinite(self.tolerance) or not 0.0001 <= self.tolerance <= 100:
            raise ConversionError("Die Toleranz muss zwischen 0,0001 und 100 mm liegen.")
        if self.unit not in (1.0, 10.0, 25.4):
            raise ConversionError("Unbekannte STL-Einheit.")
        if self.mode not in ("auto", "smooth", "planar", "exact") or self.rounds not in ("keep", "chamfer"):
            raise ConversionError("Unbekannter Konvertierungsmodus.")
        if not 20 <= self.target_faces <= 20_000:
            raise ConversionError("Die Ziel-Flächenzahl muss zwischen 20 und 20000 liegen.")
        if not 500 <= self.samples <= 30_000:
            raise ConversionError("Die Zahl der Prüfpunkte muss zwischen 500 und 30000 liegen.")
        if not isinstance(self.repair, bool):
            raise ConversionError("Ungültige Netzreparaturoption.")
        if self.region_edits is not None:
            if not isinstance(self.region_edits,dict) or self.mode!='auto' or self.rounds!='keep':
                raise ConversionError("Regionskorrekturen benötigen Automatisch erkennen und erhaltene Kreisbögen.")


@dataclass
class Candidate:
    shape: cq.Shape
    mesh: trimesh.Trimesh
    method: str
    error: dict
    faces: int
    volume_change_percent: float
    analytic: bool = False
    stage: str = "exact"
    details: dict = field(default_factory=dict)


def _notify(progress, message):
    if progress:
        progress(message)


def load_mesh(path: str | Path, options: Options, progress=None):
    path = Path(path)
    if path.suffix.lower() != ".stl":
        raise ConversionError("Bitte eine STL-Datei auswählen.")
    if not path.is_file():
        raise ConversionError("Die STL-Datei wurde nicht gefunden.")
    if path.stat().st_size > 100_000_000:
        raise ConversionError("Diese erste Version unterstützt STL-Dateien bis 100 MB.")
    try:
        mesh = trimesh.load_mesh(path, file_type="stl", process=False)
    except Exception as exc:
        raise ConversionError(f"STL konnte nicht gelesen werden: {exc}") from exc
    if not isinstance(mesh, trimesh.Trimesh) or len(mesh.faces) < 4:
        raise ConversionError("Die STL enthält keinen verwendbaren Körper.")
    if len(mesh.faces) > options.max_triangles:
        raise ConversionError(f"Zu viele Dreiecke ({len(mesh.faces):,}). Grenze: {options.max_triangles:,}.")
    if not np.isfinite(mesh.vertices).all():
        raise ConversionError("Die STL enthält ungültige Koordinaten.")
    mesh.apply_scale(options.unit)
    # Repairs below remove redundant faces only; no hole fill or smoothing.
    before = len(mesh.faces)
    mesh.merge_vertices(digits_vertex=10)
    mesh.update_faces(mesh.nondegenerate_faces(height=1e-10))
    mesh.update_faces(mesh.unique_faces())
    mesh.remove_unreferenced_vertices()
    repairs = {"original_triangles": before, "removed_redundant_triangles": before - len(mesh.faces),
               "requested": options.repair, "changed": False}
    reference = mesh.copy()
    if options.repair:
        _notify(progress, "Prüfe und repariere das STL-Netz vor dem CAD-Aufbau …")
        from .repair import repair_mesh, RepairError
        try:
            mesh, details = repair_mesh(mesh, budget_mm=options.tolerance, samples=options.samples)
        except RepairError as exc:
            raise ConversionError(str(exc)) from exc
        repairs.update(details)
        repairs["changed"] = bool(details.get("applied", details.get("changed", False)))
    if not mesh.is_watertight:
        raise ConversionError("Die STL ist offen oder nicht mannigfaltig. Bitte zuerst das Netz reparieren. Löcher werden hier nicht automatisch gefüllt.")
    mesh.fix_normals(multibody=True)
    if not mesh.is_winding_consistent or abs(mesh.volume) < 1e-12:
        raise ConversionError("Die STL hat keine konsistente geschlossene Körperorientierung.")
    # Keep the assembly-level identity information for its indexed 3MF/report.
    # A split component inherits Trimesh metadata even when only a distant
    # neighbour required fan separation, so the topology exemption must be
    # narrowed independently for each actual body below.
    repairs["preserve_vertex_identity"] = bool(mesh.metadata.get("preserve_vertex_identity"))
    components = list(mesh.split(only_watertight=False))
    if len(components) > 32:
        raise ConversionError("Mehr als 32 getrennte Hüllen: bitte einzelne Bauteile exportieren.")
    # Nested disconnected shells can be cavities, not independent positive solids.
    # Refuse them until explicit shell nesting is implemented.
    for i, first in enumerate(components):
        for second in components[i + 1:]:
            low = np.maximum(first.bounds[0], second.bounds[0])
            high = np.minimum(first.bounds[1], second.bounds[1])
            if np.all(high > low + 1e-9):
                raise ConversionError("Getrennte Hüllen mit überlappenden Begrenzungen werden noch nicht unterstützt (mögliche Innenhohlräume). Bitte getrennt exportieren.")
    for part in components:
        if part.metadata.get("preserve_vertex_identity"):
            part.metadata = dict(part.metadata)
            if len(np.unique(np.asarray(part.vertices), axis=0)) == len(part.vertices):
                part.metadata.pop("preserve_vertex_identity", None)
        if part.volume < 0:
            part.invert()
    if not repairs["changed"]:
        reference = mesh.copy()
    repairs["original_volume_valid"] = reference.is_watertight and reference.is_winding_consistent
    return reference, components, repairs


def surface_points(mesh: trimesh.Trimesh, count: int, seed: int):
    """Include vertices, triangle centres, edge midpoints and area samples."""
    rng = np.random.default_rng(seed)
    def subset(values, budget):
        if len(values) <= budget:
            return values
        return values[rng.choice(len(values), budget, replace=False)]
    vertices = subset(mesh.vertices, count)
    centres = subset(mesh.triangles_center, count)
    edges = mesh.edges_unique
    edge_points = subset(mesh.vertices[edges].mean(axis=1), count)
    random_points, _ = trimesh.sample.sample_surface(mesh, count=count, seed=seed)
    return np.vstack((vertices, centres, edge_points, random_points))


def _distances(mesh, points):
    # Chunked queries avoid the large point x candidate-triangle allocations
    # produced by Trimesh's vectorised nearest-surface implementation.
    result = []
    for start in range(0, len(points), 512):
        _, distance, _ = trimesh.proximity.closest_point(mesh, points[start:start + 512])
        result.append(distance)
    values = np.concatenate(result)
    if not np.isfinite(values).all():
        raise ConversionError("Die Abweichungsprüfung ergab ungültige Werte.")
    return values


def compare_meshes(reference, candidate, samples):
    a = _distances(candidate, surface_points(reference, samples, 481))
    b = _distances(reference, surface_points(candidate, samples, 947))
    def stats(values):
        return {"max_mm": float(values.max()), "p95_mm": float(np.percentile(values, 95)),
                "mean_mm": float(values.mean()), "points": len(values)}
    return {"stl_to_cad": stats(a), "cad_to_stl": stats(b),
            "sampled_max_mm": float(max(a.max(), b.max())),
            "kind": "deterministic_surface_samples_not_a_mathematical_bound"}


def shape_mesh(shape: cq.Shape, tolerance: float):
    # CadQuery.mesh defaults to relative deflection. Use an absolute millimetre
    # budget explicitly and serial meshing (the Windows parallel exporter can
    # crash on some fillet surfaces in this OCCT build).
    BRepTools.Clean_s(shape.wrapped)
    BRepMesh_IncrementalMesh(shape.wrapped, tolerance, False, 0.08, False)
    vertices, faces = shape.tessellate(tolerance, angularTolerance=0.08)
    mesh = trimesh.Trimesh(vertices=[v.toTuple() for v in vertices], faces=faces, process=True)
    # Collapsed parameter edges at PN patch tips and quadrics may contribute
    # zero-area triangles. Remove only redundant display faces, never move points.
    mesh.update_faces(mesh.nondegenerate_faces(height=1e-10))
    mesh.update_faces(mesh.unique_faces())
    mesh.remove_unreferenced_vertices()
    mesh.fix_normals(multibody=True)
    return mesh


def native_faceted_topology(shape):
    """Euler characteristic of a closed, straight-edged planar BRep.

    A mesher can split adjacent sliver edges at different positions or omit
    tiny triangles even when the actual BRep is valid. Count native identities
    instead of welding display coordinates. Each planar face contributes one
    disk minus its inner wires. This deliberately excludes curved/degenerate
    parameter domains, for which this simple cell count is not applicable.
    """
    faces = shape.Faces()
    if (not faces or len(shape.Solids()) != 1 or not shape.isValid()
            or shape.Volume() <= 0
            or any(not s.Closed() or not s.isValid() for s in shape.Shells())):
        return None
    edges = TopTools_IndexedMapOfShape()
    TopExp.MapShapes_s(shape.wrapped, TopAbs_EDGE, edges)
    owners = np.zeros(edges.Extent(), dtype=np.int64)
    face_cells = 0
    for face in faces:
        if face.geomType() != "PLANE" or not face.Wires():
            return None
        face_cells += 2 - len(face.Wires())
        for edge in face.Edges():
            if edge.geomType() != "LINE":
                return None
            owners[edges.FindIndex(edge.wrapped) - 1] += 1
    if not np.all(owners == 2):
        return None
    return {"euler_number": len(shape.Vertices()) - edges.Extent() + face_cells,
            "vertices": len(shape.Vertices()), "edges": edges.Extent(),
            "faces": len(faces), "inner_wires": len(faces) - face_cells,
            "all_edges_have_two_faces": True}


def check_candidate(shape, reference, options, method, *, analytic=False, stage="exact", details=None):
    if shape.isNull() or not shape.isValid() or len(shape.Solids()) != 1 or shape.Volume() <= 0:
        return None
    if any(not s.isValid() or not s.Closed() for s in shape.Shells()):
        return None
    tess_tol = max(1e-6, min(options.tolerance / 15, float(reference.scale) / 2000))
    if stage == "smooth" and tess_tol < MIN_SMOOTH_TESSELLATION_MM:
        return None
    cad_mesh = shape_mesh(shape, tess_tol)
    tessellated_closed = bool(cad_mesh.is_watertight)
    # Explicitly separate coincident vertex/edge identities can be valid CAD
    # topology, yet welding the display tessellation by position rejoins them.
    # The native solid/shell checks above remain mandatory in this case.
    native_topology = None
    if (not reference.metadata.get("preserve_vertex_identity")
            and (not tessellated_closed or cad_mesh.euler_number != reference.euler_number)):
        if stage not in ("exact", "planar"):
            return None
        native_topology = native_faceted_topology(shape)
        if native_topology is None or native_topology["euler_number"] != reference.euler_number:
            return None  # A small distance must not silently remove a through-hole.
    error = compare_meshes(reference, cad_mesh, options.samples)
    # Reserve tessellation uncertainty inside the user-selected budget.
    if error["sampled_max_mm"] + tess_tol > options.tolerance:
        return None
    error["cad_tessellation_mm"] = tess_tol
    error["tessellated_mesh_watertight_after_coordinate_weld"] = tessellated_closed
    error["preserved_vertex_identity"] = bool(reference.metadata.get("preserve_vertex_identity"))
    if native_topology is not None:
        error["native_faceted_topology"] = native_topology
    volume_change = 100 * abs(shape.Volume() - reference.volume) / abs(reference.volume)
    return Candidate(shape, cad_mesh, method, error, len(shape.Faces()), volume_change,
                     analytic, stage, details or {})


def axis_frames(mesh):
    """World axes, dominant planar face normals, and principal axes."""
    candidates = [*np.eye(3)]
    order = np.argsort(mesh.area_faces)[::-1]
    for index in order[:150]:
        n = mesh.face_normals[index]
        if not any(abs(np.dot(n, c)) > 0.998 for c in candidates):
            candidates.append(n)
        if len(candidates) >= 7:
            break
    _, eigenvectors = np.linalg.eigh(np.cov(mesh.vertices.T))
    for n in eigenvectors.T:
        if not any(abs(np.dot(n, c)) > 0.998 for c in candidates):
            candidates.append(n)
    # Prioritise axes with many parallel cap triangles; rotated prisms first.
    weights = [float(mesh.area_faces[np.abs(mesh.face_normals @ n) > 0.999].sum()) for n in candidates]
    for index in np.argsort(weights)[::-1][:7]:
        n = np.asarray(candidates[index], dtype=float)
        if n[np.argmax(np.abs(n))] < 0:
            n = -n
        helper = np.eye(3)[np.argmin(abs(n))]
        u = np.cross(helper, n)
        u /= np.linalg.norm(u)
        v = np.cross(n, u)
        rotation = np.column_stack((u, v, n))
        transform = np.eye(4)
        transform[:3, :3] = rotation
        transform[:3, 3] = mesh.bounds.mean(axis=0)
        local = mesh.copy()
        local.apply_transform(np.linalg.inv(transform))
        yield local, transform


def section_polygons(mesh, origin, normal, coordinate_axes):
    section = mesh.section(plane_origin=origin, plane_normal=normal)
    if section is None:
        return []
    loops = []
    for path in section.discrete:
        pts = path[:, coordinate_axes]
        if len(pts) < 4 or np.linalg.norm(pts[0] - pts[-1]) > 1e-6:
            return []
        poly = Polygon(pts)
        if not poly.is_valid or poly.area < 1e-12:
            return []
        loops.append(poly)
    loops.sort(key=lambda p: p.area, reverse=True)
    # A loop's containment depth determines material vs holes vs nested islands.
    depths = [sum(other.contains(p.representative_point()) for other in loops[:i])
              for i, p in enumerate(loops)]
    result = []
    for i, poly in enumerate(loops):
        if depths[i] % 2:
            continue
        holes = [list(p.exterior.coords) for j, p in enumerate(loops)
                 if depths[j] == depths[i] + 1 and poly.contains(p.representative_point())]
        out = Polygon(poly.exterior.coords, holes)
        if not out.is_valid:
            return []
        result.append(orient(out, sign=1))
    return result


def _circle(points, budget):
    pts = np.asarray(points, float)
    if len(pts) > 1 and np.linalg.norm(pts[0] - pts[-1]) < 1e-8:
        pts = pts[:-1]
    if len(pts) < 8:
        return None
    centre0 = pts.mean(axis=0)
    p = pts - centre0
    matrix = np.column_stack((2 * p[:, 0], 2 * p[:, 1], np.ones(len(p))))
    values, _, rank, _ = np.linalg.lstsq(matrix, (p * p).sum(axis=1), rcond=None)
    if rank != 3:
        return None
    centre = values[:2] + centre0
    radius = np.mean(np.linalg.norm(pts - centre, axis=1))
    angles = np.unwrap(np.arctan2(pts[:, 1] - centre[1], pts[:, 0] - centre[0]))
    gaps = np.abs(np.diff(np.r_[angles, angles[0] + np.sign(np.median(np.diff(angles))) * 2 * np.pi]))
    # Both vertices and chords must lie close to the circle, not just vertices.
    mid = (pts + np.roll(pts, -1, axis=0)) / 2
    residual = max(np.max(abs(np.linalg.norm(pts - centre, axis=1) - radius)),
                   np.max(abs(np.linalg.norm(mid - centre, axis=1) - radius)))
    if radius <= 1e-8 or gaps.max() > np.pi / 2 or residual > budget:
        return None
    return centre, float(radius)


def profile_wire(coords, z, options, allow_circle=True):
    coords = np.asarray(coords)
    circle = _circle(coords, options.tolerance * 0.6) if allow_circle and options.rounds == "keep" else None
    if circle:
        centre, radius = circle
        return cq.Wire.makeCircle(radius, (centre[0], centre[1], z), (0, 0, 1))
    return cq.Wire.makePolygon([(float(x), float(y), float(z)) for x, y in coords[:-1]], close=True)


def extrusion_shape(local, options):
    zmin, zmax = local.bounds[:, 2]
    height = zmax - zmin
    if height <= 1e-8:
        return None
    sections = [section_polygons(local, (0, 0, zmin + f * height), (0, 0, 1), [0, 1])
                for f in (0.08, 0.25, 0.5, 0.75, 0.92)]
    # This first profile implementation supports one outer loop with holes.
    if any(len(polys) != 1 for polys in sections):
        return None
    middle = sections[2][0]
    if any(len(p[0].interiors) != len(middle.interiors) or
           p[0].hausdorff_distance(middle) > options.tolerance * 0.7 for p in sections):
        return None
    poly = orient(middle.simplify(options.tolerance * 0.65, preserve_topology=True), sign=1)
    def source_ring(original, simplified):
        if options.rounds == "keep" and _circle(original.coords, options.tolerance * 0.6):
            return original.coords
        return simplified.coords
    def reconstructed_ring(original, simplified):
        if options.rounds == "keep":
            from .recognition import profile_wire as curved_profile_wire
            curved = curved_profile_wire(original.coords, options.tolerance * 0.6)
            if curved is not None:
                return curved.translate((0, 0, zmin))
        return profile_wire(source_ring(original, simplified), zmin, options)
    outer = reconstructed_ring(middle.exterior, poly.exterior)
    inner = [reconstructed_ring(a, b)
             for a, b in zip(middle.interiors, poly.interiors)]
    return cq.Solid.extrudeLinear(outer, inner, (0, 0, height)).clean()


def revolution_shape(local, options):
    zmin, zmax = local.bounds[:, 2]
    circles = []
    for fraction in (0.2, 0.5, 0.8):
        polys = section_polygons(local, (0, 0, zmin + fraction * (zmax - zmin)), (0, 0, 1), [0, 1])
        if len(polys) != 1:
            return None
        circle = _circle(polys[0].exterior.coords, options.tolerance * 0.65)
        if circle is None:
            return None
        circles.append(circle)
    centre = np.mean([c[0] for c in circles], axis=0)
    if max(np.linalg.norm(c[0] - centre) for c in circles) > options.tolerance * 0.3:
        return None
    shifted = local.copy()
    shifted.apply_translation((-centre[0], -centre[1], 0))
    profiles = section_polygons(shifted, (0, 0, 0), (0, 1, 0), [0, 2])
    if not profiles:
        return None
    limit = max(float(shifted.scale), 1.0) * 2
    pieces = []
    for profile in profiles:
        clipped = profile.intersection(box(0, -limit, limit, limit))
        polygons = list(clipped.geoms) if isinstance(clipped, MultiPolygon) else [clipped]
        for poly in polygons:
            if not isinstance(poly, Polygon) or poly.area < 1e-10:
                continue
            poly = orient(poly, sign=1)
            def wire(ring):
                fine = LineString(ring.coords).simplify(options.tolerance * 0.001)
                points = np.array(fine.coords[:-1], dtype=float)
                lengths = np.linalg.norm(points - np.roll(points, -1, axis=0), axis=1)
                straight = np.where(lengths > options.tolerance * 3)[0]
                anchors = sorted(set(straight.tolist() + ((straight + 1) % len(points)).tolist()))
                if len(anchors) >= 2:
                    simplified = []
                    for i, begin in enumerate(anchors):
                        end = anchors[(i + 1) % len(anchors)]
                        indices = list(range(begin, end + 1)) if end > begin else list(range(begin, len(points))) + list(range(0, end + 1))
                        chain = LineString(points[indices]).simplify(options.tolerance * 0.65)
                        simplified.extend(list(chain.coords)[:-1])
                    points = np.array(simplified)
                else:
                    points = np.array(LineString(ring.coords).simplify(options.tolerance * 0.65).coords[:-1])
                # STL chords may differ slightly along an otherwise cylindrical
                # wall. Align near-vertical/horizontal runs to recover cylinders
                # and planar caps; full 3D deviation is checked afterwards.
                for coordinate in (0, 1):
                    parent = list(range(len(points)))
                    def root(i):
                        while parent[i] != i:
                            i = parent[i]
                        return i
                    for i in range(len(points)):
                        j = (i + 1) % len(points)
                        if abs(points[i, coordinate] - points[j, coordinate]) < options.tolerance * 0.03:
                            parent[root(j)] = root(i)
                    groups = {}
                    for i in range(len(points)):
                        groups.setdefault(root(i), []).append(i)
                    for indices in groups.values():
                        points[indices, coordinate] = points[indices, coordinate].mean()
                return cq.Wire.makePolygon([(max(0.0, float(r)), 0, float(z)) for r, z in points], close=True)
            piece = cq.Solid.revolve(wire(poly.exterior), [wire(r) for r in poly.interiors],
                                     360, (0, 0, 0), (0, 0, 1))
            pieces.append(piece)
    if len(pieces) != 1:
        return None
    return pieces[0].clean().translate((centre[0], centre[1], 0))


def planar_shape(mesh):
    from .repair import split_vertex_fans, manifold_vertex_links
    mesh, fan_report = split_vertex_fans(mesh)
    if not mesh.is_watertight or not mesh.is_winding_consistent or not manifold_vertex_links(mesh)["closed_single_cycle"]:
        raise ConversionError("Der Flächenaufbau benötigt eine geschlossene, konsistente Netztopologie.")
    # Use shared mesh IDs for native topology. Geometric sewing would weld
    # deliberately separated fans/edges back together at coincident positions.
    vertices = [cq.Vertex.makeVertex(*point).wrapped for point in mesh.vertices]
    edges = {}
    builder = BRep_Builder()
    shell = TopoDS_Shell()
    builder.MakeShell(shell)
    for triangle in mesh.faces:
        wire_maker = BRepBuilderAPI_MakeWire()
        for i in range(3):
            a, b = int(triangle[i]), int(triangle[(i + 1) % 3])
            key = tuple(sorted((a, b)))
            if key not in edges:
                edge_maker = BRepBuilderAPI_MakeEdge(vertices[key[0]], vertices[key[1]])
                if not edge_maker.IsDone():
                    raise ConversionError("Eine native CAD-Kante konnte nicht aufgebaut werden.")
                edges[key] = edge_maker.Edge()
            edge = edges[key] if a == key[0] else TopoDS.Edge_s(edges[key].Reversed())
            wire_maker.Add(edge)
        face_maker = BRepBuilderAPI_MakeFace(wire_maker.Wire(), True)
        if not face_maker.IsDone():
            raise ConversionError("Eine native CAD-Fläche konnte nicht aufgebaut werden.")
        builder.Add(shell, face_maker.Face())
    # Closure is established from the input's two-face edges and single-cycle
    # vertex links, rather than merely setting a flag on an unchecked shell.
    shell.Closed(True)
    native = TopoDS_Solid()
    builder.MakeSolid(native)
    builder.Add(native, shell)
    solid = cq.Shape.cast(native)
    if not solid.isValid() or solid.Volume() <= 0:
        raise ConversionError("Die planare Näherung ergab keinen gültigen CAD-Körper.")
    # Planar unification can rejoin pathological contact regions. Preserve the
    # valid ununified body when simplification creates an invalid candidate.
    try:
        clean = solid.clean()
        if clean.isValid() and len(clean.Solids()) == 1 and clean.Volume() > 0:
            solid = clean
    except Exception:
        pass
    return solid


def convert_part(mesh, options, progress, attempts, disabled_stages=()):
    if mesh.metadata.get('region_edits') is not None:
        if 'manual' in disabled_stages:
            raise ConversionError('Die korrigierten Bereiche haben die STEP-Prüfung nicht bestanden. Korrektur ändern oder rückgängig machen.')
        _notify(progress,'Prüfe manuelle Bereiche und geschützte Originalflächen …')
        try:
            from .advanced_regions import advanced_region_shape
            from .connected_regions import analyse_connected_regions
            from .region_edits import RegionEditSession
            from .edited_regions import fit_edit_analysis
            original = analyse_connected_regions(mesh,options.tolerance)
            session = RegionEditSession.from_dict(mesh,original,options.tolerance,mesh.metadata['region_edits'])
            fitted = fit_edit_analysis(mesh,original,session,options.tolerance)
            affected=session.affected_faces();requested=dict(session.state.requested_types)
            facet_labels={label for label,kind in session.state.base_types
                          if kind=='GRAPH' and label not in requested and not affected.intersection(session.faces(label))}
            variants=[fitted]
            if facet_labels:
                variants.append(fit_edit_analysis(mesh,original,session,options.tolerance,facet_labels=facet_labels))
            last_error=None
            for variant in variants:
                try:
                    proposal = advanced_region_shape(mesh,options.tolerance,progress,analysis=variant)
                    if proposal is None:
                        raise ConversionError('Das korrigierte Netz eignet sich nicht für den gemeinsamen Randaufbau.')
                    shape,details = proposal
                    candidate = check_candidate(shape,mesh,options,'Manuell korrigierte Flächenbereiche',
                                                analytic=True,stage='manual',details=details)
                    attempts.append(dict(method='Manuelle Regionskorrektur',accepted=bool(candidate),details=details))
                    if candidate is None:
                        raise ConversionError('Korrigierte Bereiche überschreiten das Budget oder ergeben keine gültige geschlossene Topologie.')
                    return candidate
                except ValueError as exc:
                    last_error=exc
                    attempts.append(dict(method='Manuelle Regionskorrektur',accepted=False,reason=str(exc)))
            raise last_error
        except Exception as exc:
            raise ConversionError(f'Regionskorrektur nicht übernommen: {exc}') from exc
    candidates = []
    if options.mode == "auto" and options.rounds == "keep" and "regions" not in disabled_stages:
        _notify(progress, "Erkenne zusammengehörige Flächenregionen und Rundungsradien …")
        try:
            from .regions import regional_candidates
            from .fillets import fillet_candidates
            from itertools import chain
            proposals = chain(fillet_candidates(mesh, options.tolerance, progress=progress),
                              regional_candidates(mesh, options.tolerance, progress=progress))
            for shape, title, details in proposals:
                candidate = check_candidate(shape, mesh, options, title, analytic=True,
                                            stage="regions", details=details)
                attempts.append({"method": title, "accepted": bool(candidate), "details": details,
                                 "reason": None if candidate else "Native Gültigkeit oder Abweichungsbudget"})
                if candidate:
                    return candidate
        except Exception as exc:
            attempts.append({"method": "Regionenerkennung", "accepted": False, "reason": str(exc)[:300]})
    if options.mode == "auto" and options.rounds == "keep" and "features" not in disabled_stages:
        from .conical_profiles import conical_profile_shape
        from .chamfer_profiles import chamfered_profile_shape
        feature_candidates = []
        for index, (local, transform) in enumerate(axis_frames(mesh)):
            for builder, title in (
                (conical_profile_shape, "Profil mit erhaltenen Senkungen und konischen Bohrungen"),
                (chamfered_profile_shape, "Profil mit rekonstruierten geraden Fasen"),
            ):
                try:
                    proposal = builder(local, options, progress=progress)
                    if proposal is None:
                        continue
                    shape, details = proposal
                    frame = cq.Plane(origin=tuple(transform[:3, 3]),
                                     xDir=tuple(transform[:3, 0]), normal=tuple(transform[:3, 2]))
                    shape = shape.moved(cq.Location(frame))
                    candidate = check_candidate(shape, mesh, options, title, analytic=True,
                                                stage="features", details=details)
                    attempts.append({"method": title, "axis": index + 1,
                                     "accepted": bool(candidate), "details": details,
                                     "reason": None if candidate else "Native Gültigkeit, Topologie oder Abweichung"})
                    if candidate:
                        feature_candidates.append(candidate)
                except Exception as exc:
                    attempts.append({"method": title, "accepted": False, "reason": str(exc)[:300]})
        if feature_candidates:
            return min(feature_candidates, key=lambda c: (c.faces, c.error["sampled_max_mm"]))

    if options.mode == "auto" and "profiles" not in disabled_stages:
        if options.rounds == "keep":
            from .primitives import primitive_candidates
            _notify(progress, "Prüfe Kugel und Ellipsoid …")
            try:
                for shape, title, details in primitive_candidates(mesh, options.tolerance):
                    candidate = check_candidate(shape, mesh, options, title, analytic=True,
                                                stage="profiles", details=details)
                    attempts.append({"method": title, "accepted": bool(candidate),
                                     "reason": None if candidate else "Oberfläche oder Gültigkeit",
                                     "details": details})
                    if candidate:
                        return candidate
            except Exception as exc:
                attempts.append({"method": "Primitive", "accepted": False, "reason": str(exc)[:300]})
        for index, (local, transform) in enumerate(axis_frames(mesh)):
            if options.rounds == "keep":
                _notify(progress, f"Prüfe Rotationsprofil mit Kreisbögen, Achse {index + 1} …")
                try:
                    from .revolved import rounded_revolution_shape
                    proposal = rounded_revolution_shape(local, options.tolerance, progress=progress)
                    if proposal is not None:
                        shape, details = proposal
                        frame = cq.Plane(origin=tuple(transform[:3, 3]),
                                         xDir=tuple(transform[:3, 0]), normal=tuple(transform[:3, 2]))
                        shape = shape.moved(cq.Location(frame))
                        title = "Rotationsprofil mit erhaltenen Rundungsradien"
                        candidate = check_candidate(shape, mesh, options, title, analytic=True,
                                                    stage="profiles", details=details)
                        attempts.append({"method": title, "accepted": bool(candidate), "details": details,
                                         "reason": None if candidate else "Native Gültigkeit, Topologie oder Abweichung"})
                        if candidate:
                            candidates.append(candidate)
                except Exception as exc:
                    attempts.append({"method": "Rotationsprofil mit Kreisbögen", "accepted": False,
                                     "reason": str(exc)[:300]})
            for builder, title in ((extrusion_shape, "Profil-Extrusion"),
                                   (revolution_shape, "Rotationsprofil mit geraden Übergängen")):
                _notify(progress, f"Prüfe {title}, Achse {index + 1} …")
                try:
                    shape = builder(local, options)
                    if shape is None:
                        continue
                    frame = cq.Plane(origin=tuple(transform[:3, 3]),
                                     xDir=tuple(transform[:3, 0]), normal=tuple(transform[:3, 2]))
                    shape = shape.moved(cq.Location(frame))
                    candidate = check_candidate(shape, mesh, options, title, analytic=True, stage="profiles")
                    if candidate:
                        candidates.append(candidate)
                        attempts.append({"method": title, "accepted": True, "faces": candidate.faces})
                        # Six or fewer faces already represent a simple analytic primitive.
                        if candidate.faces <= 6:
                            return candidate
                    else:
                        attempts.append({"method": title, "accepted": False, "reason": "Gültigkeit oder Abweichungsbudget"})
                except Exception as exc:
                    attempts.append({"method": title, "accepted": False, "reason": str(exc)[:300]})
        if candidates:
            return min(candidates, key=lambda c: (c.faces, c.error["sampled_max_mm"]))

    if options.mode == "auto" and "layers" not in disabled_stages:
        from .layers import layered_shape
        for index, (local, transform) in enumerate(axis_frames(mesh)):
            try:
                proposal = layered_shape(local, options, progress)
                if proposal is None:
                    continue
                shape, details = proposal
                frame = cq.Plane(origin=tuple(transform[:3, 3]),
                                 xDir=tuple(transform[:3, 0]), normal=tuple(transform[:3, 2]))
                shape = shape.moved(cq.Location(frame))
                title = "Gestufte Profile mit Bohrungen und Kreisbögen"
                candidate = check_candidate(shape, mesh, options, title, analytic=True,
                                            stage="layers", details=details)
                attempts.append({"method": title, "accepted": bool(candidate), "details": details,
                                 "reason": None if candidate else "Native Gültigkeit, Topologie oder Abweichung"})
                if candidate:
                    candidates.append(candidate)
            except Exception as exc:
                attempts.append({"method": "Gestufte Profile", "accepted": False, "reason": str(exc)[:300]})
        if candidates:
            return min(candidates, key=lambda c: (c.faces, c.error["sampled_max_mm"]))

    if options.mode in ("auto","smooth") and options.rounds == "keep" and "patches" not in disabled_stages:
        _notify(progress, "Prüfe zusammenhängende Freiformflächen mit gemeinsamen Rändern …")
        try:
            from .connected_regions import connected_region_shapes
            for shape,details in connected_region_shapes(mesh,options.tolerance,progress):
                title = "Zusammenhängende Freiformflächen mit gemeinsamen Rändern"
                candidate = check_candidate(shape,mesh,options,title,stage="patches",details=details)
                attempts.append({"method":title,"accepted":bool(candidate),"details":details,
                                 "reason":None if candidate else "Native Gültigkeit, Topologie oder Abweichung"})
                if candidate:
                    return candidate
        except Exception as exc:
            attempts.append({"method":"Zusammenhängende Freiformflächen","accepted":False,"reason":str(exc)[:300]})

    if options.mode == "auto" and options.rounds == "keep" and "advanced" not in disabled_stages:
        _notify(progress, "Erkenne Zylinder und Kegel mit gemeinsamen Schnittkurven …")
        try:
            from .advanced_regions import advanced_region_shape
            proposal = advanced_region_shape(mesh,options.tolerance,progress)
            if proposal is not None:
                shape,details = proposal
                title = "Lokale Ebenen, Zylinder und Kegel mit gemeinsamen Schnittkurven"
                candidate = check_candidate(shape,mesh,options,title,analytic=True,
                                            stage="advanced",details=details)
                attempts.append({"method":title,"accepted":bool(candidate),"details":details,
                                 "reason":None if candidate else "Native Gültigkeit, Topologie oder Abweichung"})
                if candidate:
                    return candidate
        except Exception as exc:
            attempts.append({"method":"Analytische Schnittkurven","accepted":False,"reason":str(exc)[:300]})

    if options.mode == "auto" and options.rounds == "keep" and "local" not in disabled_stages:
        _notify(progress, "Erkenne lokale Ebenen und Zylinder mit gemeinsamen Rändern …")
        try:
            from .local_regions import shared_region_shape
            proposal = shared_region_shape(mesh, options.tolerance, progress)
            if proposal is not None:
                shape, details = proposal
                title = "Lokale Ebenen und Zylinder mit gemeinsamen Rändern"
                candidate = check_candidate(shape, mesh, options, title, analytic=True,
                                            stage="local", details=details)
                attempts.append({"method": title, "accepted": bool(candidate), "details": details,
                                 "reason": None if candidate else "Native Gültigkeit, Topologie oder Abweichung"})
                if candidate:
                    return candidate
        except Exception as exc:
            attempts.append({"method": "Lokale Flächenregionen", "accepted": False, "reason": str(exc)[:300]})

    if (options.mode == "smooth" or (options.mode == "auto" and options.rounds == "keep")) and "smooth" not in disabled_stages:
        _notify(progress, "Prüfe gekrümmte Flächen nach dem Formnaro-Verfahren …")
        try:
            from .surfaces import smooth_shape
            tess_budget = max(1e-6, min(options.tolerance / 15, float(mesh.scale) / 2000))
            if tess_budget < MIN_SMOOTH_TESSELLATION_MM:
                raise ConversionError("Gekrümmte Patches benötigen hier eine zu feine Vernetzung; "
                                      "unter 0,0005 mm Vernetzungsbudget wird ein anderes Verfahren verwendet.")
            shape, details = smooth_shape(mesh, options.tolerance, progress=progress)
            candidate = check_candidate(shape, mesh, options, "Gekrümmte Flächen (Formnaro)",
                                        stage="smooth", details=details)
            if candidate:
                attempts.append({"method": "smooth", "accepted": True, "faces": candidate.faces,
                                 "details": details})
                return candidate
            attempts.append({"method": "smooth", "accepted": False,
                             "reason": "Native Gültigkeit oder Abweichungsbudget"})
        except Exception as exc:
            attempts.append({"method": "smooth", "accepted": False, "reason": str(exc)[:300]})
        _notify(progress, "Gekrümmte Rekonstruktion nicht geeignet; prüfe planare Näherung …")

    if options.mode != "exact" and "planar" not in disabled_stages:
        # Aggressive reduction is tried first, then progressively finer levels.
        targets = sorted(set(min(len(mesh.faces), n) for n in
                             (max(20, options.target_faces // 4), options.target_faces,
                              options.target_faces * 3, options.target_faces * 8, 20_000)))
        for target in targets:
            if target >= len(mesh.faces):
                continue
            _notify(progress, f"Prüfe planare Näherung mit etwa {target} Dreiecken …")
            try:
                reduced = mesh.simplify_quadric_decimation(face_count=target, aggression=7)
                if len(reduced.faces) >= len(mesh.faces):
                    continue
                reduced.remove_unreferenced_vertices()
                reduced.fix_normals()
                if not reduced.is_watertight or len(reduced.split()) != 1 or reduced.euler_number != mesh.euler_number:
                    attempts.append({"method": "planar", "target": target, "accepted": False, "reason": "Topologie geändert"})
                    continue
                # Cheap gate before building a native BRep.
                error = compare_meshes(mesh, reduced, min(options.samples, 1000))
                if error["sampled_max_mm"] > options.tolerance * 0.94:
                    attempts.append({"method": "planar", "target": target, "accepted": False, "reason": "Abweichung", "sampled_max_mm": error["sampled_max_mm"]})
                    continue
                if len(reduced.faces) > 20_000:
                    continue
                shape = planar_shape(reduced)
                candidate = check_candidate(shape, mesh, options, "Planare Näherung / Fasenabschnitte", stage="planar")
                if candidate:
                    attempts.append({"method": "planar", "target": target, "accepted": True, "faces": candidate.faces})
                    return candidate
                attempts.append({"method": "planar", "target": target, "accepted": False, "reason": "Native Gültigkeit oder Abweichungsbudget"})
            except Exception as exc:
                attempts.append({"method": "planar", "target": target, "accepted": False, "reason": str(exc)[:300]})

    if not options.fallback and options.mode != "exact":
        raise ConversionError("Keine gültige Vereinfachung innerhalb der Toleranz gefunden. Toleranz erhöhen oder den Facetten-Rückfall erlauben.")
    if "exact" in disabled_stages:
        raise ConversionError("Keines der geprüften Verfahren konnte einen gültigen STEP erzeugen.")
    if len(mesh.faces) > 20_000:
        raise ConversionError("Keine passende Rekonstruktion gefunden. Der exakte Facetten-Rückfall ist auf 20000 Dreiecke pro Körper begrenzt.")
    faceted_title = "Repariertes Netz (facettiert)" if mesh.metadata.get("preserve_vertex_identity") else "Originalfacetten (Rückfall)"
    _notify(progress, f"Baue {faceted_title}; keine erfolgreiche Rundungsrekonstruktion …")
    shape = planar_shape(mesh)
    candidate = check_candidate(shape, mesh, options, faceted_title)
    if candidate is None:
        raise ConversionError("Auch der exakte Facettenaufbau ergab keinen gültigen geschlossenen Körper.")
    attempts.append({"method": "exact", "accepted": True, "faces": candidate.faces})
    return candidate


def _roundtrip_candidates(candidates, reference, options, step_file, progress):
    """Verify the actual STEP before accepting a reconstruction strategy."""
    result = cq.Compound.makeCompound([c.shape for c in candidates])
    if not result.isValid() or len(result.Solids()) != len(candidates):
        raise ConversionError("Die fertige Körpergruppe ist ungültig.")
    _notify(progress, "Schreibe STEP und lese die Datei zur Kontrolle erneut ein …")
    cq.exporters.export(result, str(step_file), exportType="STEP")
    _notify(progress, "Lese die exportierte STEP-Datei erneut ein …")
    imported = cq.importers.importStep(str(step_file)).val()
    _notify(progress, "Prüfe die native STEP-Körpergültigkeit …")
    if (not imported.isValid() or len(imported.Solids()) != len(candidates)
            or any(not shell.Closed() or not shell.isValid() for shell in imported.Shells())):
        raise ConversionError("Die STEP-Datei konnte nicht als gültiger Körper zurückgelesen werden.")
    volume_error = abs(imported.Volume() - result.Volume()) / max(result.Volume(), 1e-12)
    if volume_error > 1e-6:
        raise ConversionError("Das STEP-Rücklesen hat das Volumen unerwartet verändert.")
    _notify(progress, "Vernetze die zurückgelesene STEP für den Formvergleich …")
    # Reserve the coarsest accepted absolute deflection for the final comparison.
    # A tiny second body must not force an already accepted curved body into an
    # arbitrarily fine native tessellation (potentially millions of triangles).
    margin = max(c.error["cad_tessellation_mm"] for c in candidates)
    remaining = set(range(len(candidates)))
    imported_meshes = []
    expected_bounds = [np.asarray([c.shape.BoundingBox().xmin, c.shape.BoundingBox().ymin,
                                  c.shape.BoundingBox().zmin, c.shape.BoundingBox().xmax,
                                  c.shape.BoundingBox().ymax, c.shape.BoundingBox().zmax]) for c in candidates]
    for solid in imported.Solids():
        bounds = solid.BoundingBox()
        actual_bounds = np.asarray([bounds.xmin, bounds.ymin, bounds.zmin,
                                    bounds.xmax, bounds.ymax, bounds.zmax])
        # STEP readers may reorder solids. Spatially match disjoint bodies
        # instead of using list position or a welded compound's topology.
        index = min(remaining, key=lambda i: float(np.sum((expected_bounds[i] - actual_bounds)**2)))
        remaining.remove(index)
        candidate = candidates[index]
        if candidate.stage=='manual':
            from .edited_regions import verify_protected_faces
            manual = candidate.details['manual_regions']
            manual['step_protection_proof'] = verify_protected_faces(solid,manual['protected_triangles_mm'])
        mesh = shape_mesh(solid, margin)
        if candidate.error.get("native_faceted_topology") is not None:
            topology = native_faceted_topology(solid)
            if (topology is None or topology["euler_number"] !=
                    candidate.error["native_faceted_topology"]["euler_number"]):
                raise ConversionError("Das STEP-Rücklesen hat die native Facettentopologie geändert (mögliche verlorene Bohrung).")
        elif not candidate.error.get("preserved_vertex_identity", False):
            if not mesh.is_watertight or mesh.euler_number != candidate.mesh.euler_number:
                before = native_faceted_topology(candidate.shape) if candidate.stage in ("exact", "planar") else None
                after = native_faceted_topology(solid) if before is not None else None
                if (before is None or after is None
                        or before["euler_number"] != candidate.mesh.euler_number
                        or after["euler_number"] != before["euler_number"]):
                    raise ConversionError("Das STEP-Rücklesen hat die geschlossene Topologie geändert (mögliche verlorene Bohrung).")
                candidate.error["native_faceted_topology"] = before
        imported_meshes.append(mesh)
    reimport_mesh = trimesh.util.concatenate(imported_meshes)
    _notify(progress, "Vergleiche die STEP-Oberfläche in beiden Richtungen mit der Original-STL …")
    error = compare_meshes(reference, reimport_mesh, options.samples)
    error["tessellated_mesh_watertight_after_coordinate_weld"] = bool(reimport_mesh.is_watertight)
    if error["sampled_max_mm"] + margin > options.tolerance:
        raise ConversionError("Die zurückgelesene STEP überschreitet das Abweichungsbudget.")
    return imported, reimport_mesh, volume_error, error, margin


def convert(input_path: str | Path, output_path: str | Path, options: Options | None = None,
            progress: Callable[[str], None] | None = None, *, overwrite=False):
    """Write validated STEP and JSON report; existing results require overwrite."""
    started = time.monotonic()
    options = options or Options()
    options.validate()
    source = Path(input_path).resolve()
    destination = Path(output_path).resolve()
    if destination.suffix.lower() not in (".step", ".stp"):
        raise ConversionError("Die Ausgabedatei muss auf .step oder .stp enden.")
    report_path = destination.with_suffix(".bericht.json")
    preview_path = destination.with_suffix(".vorschau.stl")
    repaired_path = destination.with_suffix(".repariert.stl") if options.repair else None
    repaired_3mf = destination.with_suffix(".repariert.3mf") if options.repair else None
    outputs = (destination, report_path, preview_path) + ((repaired_path, repaired_3mf) if repaired_path else ())
    if not overwrite and any(p.exists() for p in outputs):
        raise ConversionError("Eine Ausgabedatei existiert bereits. Anderen Namen wählen oder Überschreiben bestätigen.")
    if source in outputs:
        raise ConversionError("Die Eingabedatei darf nicht überschrieben werden.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    _notify(progress, "Lese STL und prüfe die geschlossene Hülle …")
    reference, components, repairs = load_mesh(source, options, progress)
    if options.region_edits is not None:
        from .region_edits import normalise_edit_mesh,RegionEditSession,RegionEditError
        from .connected_regions import analyse_connected_regions
        from .edited_regions import component_edit_payload
        try:
            original_mesh = normalise_edit_mesh(trimesh.load_mesh(source,process=False),options.unit)
            original_analysis = analyse_connected_regions(original_mesh,options.tolerance)
            session = RegionEditSession.from_dict(original_mesh,original_analysis,options.tolerance,options.region_edits)
            covered = sum(len(part.faces) for part in components)
            if covered!=len(original_mesh.faces):
                raise RegionEditError('Netzreparatur verändert die Dreiecksanzahl. Repariertes Netz zuerst neu analysieren.')
            affected = session.affected_faces()
            seen = set()
            for component in components:
                fragment,source_ids = component_edit_payload(original_mesh,component,session.to_dict())
                if seen.intersection(source_ids):
                    raise RegionEditError('Reparierte Körper verwenden korrigierte Dreiecke mehrfach.')
                seen.update(source_ids)
                if affected.intersection(source_ids):
                    component.metadata['region_edits'] = fragment
            if len(seen)!=len(original_mesh.faces):
                raise RegionEditError('Netzreparatur entfernt korrigierte Dreiecke. Repariertes Netz zuerst neu analysieren.')
        except RegionEditError as exc:
            raise ConversionError(str(exc)) from exc
    reconstructed_reference = trimesh.util.concatenate(components)
    candidates, attempts = [], []
    repair_error = float(repairs.get("deviation", {}).get("sampled_max_mm", 0.0))
    remaining_budget = options.tolerance - repair_error
    if remaining_budget < 0.0001:
        raise ConversionError("Die Netzreparatur verbraucht bereits das Abweichungsbudget. Bitte eine etwas größere Toleranz wählen.")
    cad_options = replace(options, tolerance=remaining_budget)
    for i, component in enumerate(components):
        _notify(progress, f"Körper {i + 1} von {len(components)} …")
        candidates.append(convert_part(component, cad_options, progress, attempts))
    # Stage all files in the destination directory; a failed conversion never
    # replaces an existing output. The STEP is committed last as success marker.
    with tempfile.TemporaryDirectory(prefix=".stl-step-", dir=destination.parent) as temporary:
        staged = Path(temporary)
        step_file = staged / "result.step"
        stages = ("manual", "regions", "features", "profiles", "layers", "patches", "advanced", "local", "smooth", "planar", "exact")
        disabled = [set() for _ in components]
        while True:
            try:
                imported, reimport_mesh, roundtrip_volume_error, roundtrip_error, margin = _roundtrip_candidates(
                    candidates, reference, options, step_file, progress)
                break
            except OSError:
                raise  # Another geometry strategy cannot fix a filesystem error.
            except Exception as exc:
                attempts.append({"method": "STEP-Rundlauf", "accepted": False,
                                 "stages": [c.stage for c in candidates], "reason": str(exc)[:500]})
                if all(c.stage == "exact" for c in candidates):
                    raise ConversionError(str(exc)) from exc
                _notify(progress, "STEP-Prüfung fehlgeschlagen; versuche das nächste Rekonstruktionsverfahren …")
                # Identify the failed body before changing successful profiles.
                # These diagnostic checks use repaired components; the combined
                # result is still gated against the original on the next loop.
                failed = []
                if len(candidates) > 1:
                    for i, (component, candidate) in enumerate(zip(components, candidates)):
                        try:
                            _roundtrip_candidates([candidate], component, cad_options,
                                                  staged / f"probe-{i}.step", progress)
                        except OSError:
                            raise
                        except Exception:
                            failed.append(i)
                else:
                    failed = [0]
                retry_indices = failed or list(range(len(candidates)))
                advanced = False
                for i in retry_indices:
                    candidate = candidates[i]
                    if candidate.stage == "exact":
                        if failed:
                            raise ConversionError(str(exc)) from exc
                        continue
                    next_disabled = disabled[i] | set(stages[:stages.index(candidate.stage) + 1])
                    try:
                        replacement = convert_part(components[i], cad_options, progress, attempts, next_disabled)
                    except ConversionError:
                        if failed:
                            raise
                        continue
                    disabled[i] = next_disabled
                    candidates[i] = replacement
                    advanced = True
                    if not failed:
                        break  # Global-only failure: change just one body first.
                if not advanced:
                    raise ConversionError(str(exc)) from exc
        # Use the final STEP's tessellation for the saved preview as well.
        combined_mesh = reimport_mesh
        types = dict(Counter(f.geomType() for f in imported.Faces()))
        notes = ["Oberflächenabweichungen sind Stichproben, keine mathematische Maximalfehlergarantie.",
                 "STL enthält keine Einheit; verwendet wird die gewählte Eingabeeinheit.",
                 "STEP enthält Geometrie, keine ursprüngliche CAD-Konstruktionshistorie.",
                 "Selbstüberschneidungen und jedes einzelne Funktionsmaß werden nicht vollständig geprüft."]
        if any(c.stage=='manual' for c in candidates):
            notes.append('Manuelle Bereiche wurden neu gefittet und mit gemeinsamen nativen Grenzen aufgebaut. Geschützte Originaldreiecke wurden im CAD und erneut in der tatsächlichen STEP auf unveränderte Ebenen, Kanten und Eckpunkte geprüft. Ungeeignete Vorgaben werden ausdrücklich abgelehnt; andere automatische Verfahren übergehen sie nicht.')
        if any(c.method.startswith("Originalfacetten") or c.method == "Repariertes Netz (facettiert)" for c in candidates):
            notes.append("Mindestens ein Körper enthält Originalfacetten. Für diesen Körper ist keine Flächenrückführung gelungen.")
        if any(c.error.get("native_faceted_topology") is not None for c in candidates):
            notes.append("Bei mindestens einem ebenen Facettenkörper enthält die CAD-Vernetzung numerische Nahtfehler. Geschlossenheit und Öffnungstopologie wurden direkt am nativen CAD-Körper und erneut nach dem STEP-Rücklesen geprüft; die Vorschauvernetzung kann winzige offene Nähte enthalten.")
        if options.rounds == "chamfer" or any(c.stage == "planar" for c in candidates):
            notes.append("Gerade Abschnitte nähern Rundungen an; dies ist keine allgemeine automatische Erkennung einzelner Konstruktionsfasen.")
        if any(c.stage == "smooth" for c in candidates):
            notes.append("Das integrierte Formnaro-Verfahren erzeugt begrenzte gekrümmte Patches. Übergänge sind nicht überall tangentenstetig; die ursprüngliche Konstruktion wird dadurch nicht wiederhergestellt.")
        if any(c.stage == "patches" for c in candidates):
            notes.append("Zusammenhängende Freiformbereiche werden als einzelne B-Spline-Graphen oder beobachtete Meridian-Drehflächen aufgebaut. Nicht unterstützte Nachbarn behalten analytische Flächen oder Facetten. Gemeinsame Ränder, native Gültigkeit, Öffnungstopologie und Abweichung werden erneut an der tatsächlichen STEP geprüft. Die lokale Graphparametrisierung beweist keine allgemeine Selbstschnittfreiheit oder ursprüngliche CAD-Historie.")
        if any(c.stage == "regions" for c in candidates):
            notes.append("Die regionale Rekonstruktion unterstützt Quader mit konstanten, auch unterschiedlichen Kantenradien. Erkannte Abmessungen und Radien stehen je Körper im Bericht; dies ist noch keine allgemeine Flächenzusammenführung.")
        if any(c.stage == "local" for c in candidates):
            notes.append("Lokale Zylinder mit belegten ebenen Kappen/geraden Seitenrändern teilen native CAD-Kanten mit den Nachbarflächen. Nicht unterstützte Bereiche bleiben planar; die Erkennung allein beweist keine CAD-Übernahme oder allgemeine Freiformrekonstruktion.")
        if any(c.stage == "advanced" for c in candidates):
            notes.append("Lokale Ebenen, Zylinder und Kegel teilen analytische Schnittkurven, auch an schrägen Abschlüssen und Senkungen. Belegte konische Bänder nähern Rundungen an; sie stellen keinen Nachweis ursprünglicher Kegelfeatures oder tangentenstetiger Freiformflächen dar. Periodische Flächen behalten explizite Nähte. Native Gültigkeit, Öffnungstopologie und Abweichung wurden auch nach STEP-Rücklesen geprüft.")
        if any(c.stage == "layers" for c in candidates):
            notes.append("Gestufte Profile werden zwischen beobachteten ebenen Höhenabschnitten rekonstruiert. Bohrungen und Kreisbögen bleiben Teil der Profile; freie oder schräge Flächen benötigen ein anderes Verfahren.")
        if any(c.stage == "features" for c in candidates):
            notes.append("Profilteile mit Senkungen, konischen Bohrungsabschnitten oder geraden Fasen werden nur für geometrisch belegte, begrenzte Profilfamilien rekonstruiert. Schrägflächen werden ausdrücklich nachgebildet; dies ist keine allgemeine lokale Flächenrekonstruktion.")
        if repairs["changed"]:
            notes.append("Das STL-Netz wurde vor dem CAD-Aufbau repariert. Die endgültige Abweichung wird weiterhin gegen die ursprüngliche STL geprüft.")
        if not repairs["original_volume_valid"]:
            notes.append("Die ursprüngliche STL besitzt kein zuverlässig definiertes Körpervolumen; deshalb wird dafür kein Volumenwert angegeben.")
        if (repairs.get("preserve_vertex_identity")
                or any(component.metadata.get("preserve_vertex_identity") for component in components)):
            notes.append("Die reparierte 3MF und STEP erhalten getrennte Knotenverbindungen an geometrischen Kontakten. STL speichert diese Indizes nicht; ein erneutes geometrisches Verschweißen kann Kontakte wieder verbinden.")
        from . import __version__
        report = {"version": __version__, "input": str(source), "output": str(destination),
                  "options": asdict(options), "input_triangles": repairs["original_triangles"],
                  "output_faces": len(imported.Faces()), "solids": len(imported.Solids()),
                  "surface_types": types, "valid": True, "repairs": repairs,
                  "remaining_cad_budget_mm": remaining_budget,
                  "input_bounds_mm": reference.bounds.tolist(),
                  "output_bounds_mm": reimport_mesh.bounds.tolist(),
                  "input_volume_mm3": float(reference.volume) if repairs["original_volume_valid"] else None,
                  "repaired_volume_mm3": float(reconstructed_reference.volume), "output_volume_mm3": imported.Volume(),
                  "step_roundtrip_relative_volume_error": roundtrip_volume_error,
                  "deviation": roundtrip_error, "tessellation_allowance_mm": margin,
                  "bodies": [{"method": c.method, "stage": c.stage, "details": c.details,
                              "faces": c.faces, "deviation": c.error,
                              "volume_change_percent": c.volume_change_percent} for c in candidates],
                  "attempts": attempts, "notes": notes,
                  "elapsed_seconds": round(time.monotonic() - started, 2),
                  "preview": str(preview_path), "report": str(report_path),
                  "repaired_mesh": str(repaired_path) if repaired_path else None}
        report["repaired_3mf"] = str(repaired_3mf) if repaired_3mf else None
        combined_mesh.export(staged / "preview.stl", file_type="stl")
        _notify(progress, "Speichere geprüfte STEP und Begleitdateien …")
        if repaired_path:
            reconstructed_reference.export(staged / "repaired.stl", file_type="stl")
            from .windows_repair import _write_input_package
            _write_input_package(reconstructed_reference, staged / "repaired.3mf")
        (staged / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
        # Check again in case another process created an output during calculation.
        if not overwrite and any(p.exists() for p in outputs):
            raise ConversionError("Während der Berechnung wurde bereits eine gleichnamige Ausgabe erstellt.")
        os.replace(staged / "preview.stl", preview_path)
        os.replace(staged / "report.json", report_path)
        if repaired_path:
            os.replace(staged / "repaired.stl", repaired_path)
            os.replace(staged / "repaired.3mf", repaired_3mf)
        os.replace(step_file, destination)
    _notify(progress, f"Fertig: {report['output_faces']} CAD-Flächen, {report['solids']} Körper.")
    return report
