"""Bounded PN triangle reconstruction using native OpenCascade surfaces.

Adapted from Formnaro's cad-stl-surfaces.js (Curved PN Triangles, Vlachos et al.,
DOI 10.1145/364338.364387). Each triangle becomes a cubic Bernstein patch,
represented exactly as a bicubic B-spline with one collapsed parameter edge.
The correspondence bound applies to the input triangles before CAD sewing;
it is not an independent STEP or original-model Hausdorff certificate.
"""
from __future__ import annotations

import math

import cadquery as cq
import numpy as np
import trimesh
from OCP.BRep import BRep_Tool
from OCP.BRepBuilderAPI import (BRepBuilderAPI_MakeEdge, BRepBuilderAPI_MakeFace,
                               BRepBuilderAPI_MakeSolid, BRepBuilderAPI_MakeWire,
                               BRepBuilderAPI_Sewing)
from OCP.BRepLib import BRepLib
from OCP.BRepCheck import BRepCheck_Shell, BRepCheck_NoError
from OCP.Geom import Geom_BezierCurve, Geom_BSplineSurface
from OCP.TColgp import TColgp_Array1OfPnt, TColgp_Array2OfPnt
from OCP.TColStd import TColStd_Array1OfInteger, TColStd_Array1OfReal
from OCP.gp import gp_Pnt


MAX_TRIANGLES = 8000
MAX_DISPLACEMENT_MM = 0.02
SHARP_ANGLE_DEGREES = 35.0
MAX_VOLUME_CHANGE = 0.01
_NATIVE_TOLERANCE = 1e-7
_EXPONENTS = np.array([(3, 0, 0), (0, 3, 0), (0, 0, 3), (2, 1, 0),
                       (1, 2, 0), (0, 2, 1), (0, 1, 2), (1, 0, 2),
                       (2, 0, 1), (1, 1, 1)])
_MULTIPLIERS = np.array([1, 1, 1, 3, 3, 3, 3, 3, 3, 6])
_INVERSE = np.array([(1, 0, 0, 0), (-5 / 6, 3, -1.5, 1 / 3),
                     (1 / 3, -1.5, 3, -5 / 6), (0, 0, 0, 1)])
_POWERS = np.array([(2, 0, 0), (1, 1, 0), (1, 0, 1),
                    (0, 2, 0), (0, 1, 1), (0, 0, 2)])
_LOOKUP = {tuple(p): i for i, p in enumerate(_EXPONENTS)}
_DA = np.array([_LOOKUP[tuple(p + (1, 0, 0))] for p in _POWERS])
_DB = np.array([_LOOKUP[tuple(p + (0, 1, 0))] for p in _POWERS])
_DC = np.array([_LOOKUP[tuple(p + (0, 0, 1))] for p in _POWERS])
_PRODUCT_POWERS = _POWERS[:, None, :] + _POWERS[None, :, :]
_PRODUCT_TERMS = []
for _exponent in np.unique(_PRODUCT_POWERS.reshape(-1, 3), axis=0):
    _mask = np.all(_PRODUCT_POWERS == _exponent, axis=2)
    _multiplier = 24 / math.prod(math.factorial(int(v)) for v in _exponent)
    _weights = np.array([1, 2, 2, 1, 2, 1])
    _PRODUCT_TERMS.append(_mask * _weights[:, None] * _weights[None, :] / _multiplier)
_PRODUCT_TERMS = np.asarray(_PRODUCT_TERMS)


class SurfaceError(ValueError):
    """A rejected smooth reconstruction; other conversion routes may continue."""


def _cap(point, linear, limit):
    delta = point - linear
    length = np.linalg.norm(delta, axis=-1, keepdims=True)
    return linear + delta * np.minimum(1, np.asarray(limit)[..., None] / np.maximum(length, 1e-300))


def patch_value(controls, s, t):
    """Evaluate triangular controls under a collapsed-square parameterization."""
    barycentric = np.array([(1 - s) * (1 - t), s * (1 - t), t])
    basis = _MULTIPLIERS * np.prod(barycentric ** _EXPONENTS, axis=1)
    return np.einsum("p,...pk->...k", basis, controls)


def patch_tensor(controls):
    """Exactly convert cubic triangular polynomials to bicubic tensor controls."""
    samples = np.array([[patch_value(controls, i / 3, j / 3)
                         for j in range(4)] for i in range(4)])
    return np.einsum("ia,jb,abk->ijk", _INVERSE, _INVERSE, samples)


def _orientation_bound(controls, normals):
    # Every coefficient of the quartic Bernstein polynomial J dot N must be
    # positive. Convexity then certifies positive local orientation everywhere.
    du = 3 * (controls[:, _DB] - controls[:, _DA])
    dv = 3 * (controls[:, _DC] - controls[:, _DA])
    products = np.einsum("nijk,nk->nij", np.cross(du[:, :, None], dv[:, None, :]), normals)
    return np.einsum("nij,pij->np", products, _PRODUCT_TERMS).min(axis=1)


def _corner_normals(points, faces, normals, edges, owners, hard):
    parent = np.arange(len(faces) * 3)

    def find(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return int(index)

    for edge, pair, sharp in zip(edges, owners, hard):
        if sharp:
            continue
        for vertex in edge:
            a = pair[0] * 3 + int(np.flatnonzero(faces[pair[0]] == vertex)[0])
            b = pair[1] * 3 + int(np.flatnonzero(faces[pair[1]] == vertex)[0])
            parent[find(b)] = find(a)
    groups = np.array([find(i) for i in range(len(parent))])
    triangles = points[faces]
    a = np.roll(triangles, -1, axis=1) - triangles
    b = np.roll(triangles, -2, axis=1) - triangles
    cosines = np.einsum("nck,nck->nc", a, b) / (np.linalg.norm(a, axis=2) * np.linalg.norm(b, axis=2))
    angles = np.arccos(np.clip(cosines, -1, 1))
    sums = np.zeros((len(parent), 3))
    np.add.at(sums, groups, (normals[:, None] * angles[:, :, None]).reshape(-1, 3))
    result = sums[groups].reshape(-1, 3, 3)
    lengths = np.linalg.norm(result, axis=2, keepdims=True)
    if np.any(lengths <= 1e-12):
        raise SurfaceError("Die Flächennormalen ergeben keine eindeutige Glättungsrichtung.")
    return result / lengths


def reconstruct_patches(mesh, tolerance):
    """Prepare bounded patches without mutating or welding the source mesh."""
    if not math.isfinite(tolerance) or tolerance < 1e-5:
        raise SurfaceError("Das Toleranzbudget ist für gekrümmte Flächen zu klein.")
    if not isinstance(mesh, trimesh.Trimesh) or len(mesh.faces) < 4:
        raise SurfaceError("Die Flächenrekonstruktion benötigt ein geschlossenes Dreiecksnetz.")
    if mesh.metadata.get("preserve_vertex_identity"):
        raise SurfaceError("Getrennte Kontaktknoten werden aus Gründen des Topologieerhalts nicht geglättet.")
    if len(mesh.faces) > MAX_TRIANGLES:
        raise SurfaceError(f"Die Flächenrekonstruktion ist auf {MAX_TRIANGLES} Dreiecke begrenzt.")
    if (not np.isfinite(mesh.vertices).all() or not mesh.is_watertight
            or not mesh.is_winding_consistent or not math.isfinite(float(mesh.volume))
            or mesh.volume <= 1e-12):
        raise SurfaceError("Die Flächenrekonstruktion benötigt eine geschlossene, nach außen orientierte Hülle.")
    from .repair import manifold_vertex_links
    if not manifold_vertex_links(mesh)["closed_single_cycle"]:
        raise SurfaceError("Nichtmannigfaltige Kontaktknoten dürfen nicht geglättet werden.")
    groups = trimesh.graph.connected_components(mesh.face_adjacency, nodes=np.arange(len(mesh.faces)))
    if len(groups) != 1:
        raise SurfaceError("Die Flächenrekonstruktion verarbeitet jeweils genau eine zusammenhängende Hülle.")
    # Coincident topology IDs could be intentional contact repairs even when
    # their metadata was lost. Geometric sewing must not weld them back together.
    if len(np.unique(mesh.vertices, axis=0)) != len(mesh.vertices):
        raise SurfaceError("Koordinatengleiche getrennte Knoten werden nicht geglättet.")
    origin = mesh.bounds.mean(axis=0)
    points = np.asarray(mesh.vertices) - origin
    faces = np.asarray(mesh.faces)
    normals = np.asarray(mesh.face_normals)
    areas = np.asarray(mesh.area_faces)
    if np.any(areas <= max(1e-14, float(mesh.scale) ** 2 * 1e-16)):
        raise SurfaceError("Zu kleine oder entartete Dreiecke verhindern eine stabile Flächenrekonstruktion.")
    edges = np.asarray(mesh.edges_unique)
    edge_ids = np.asarray(mesh.edges_unique_inverse).reshape(-1, 3)
    owners = np.repeat(np.arange(len(faces)), 3)[np.argsort(edge_ids.ravel(), kind="stable")].reshape(-1, 2)
    hard = np.einsum("nk,nk->n", normals[owners[:, 0]], normals[owners[:, 1]]) < math.cos(math.radians(SHARP_ANGLE_DEGREES))
    corner_normals = _corner_normals(points, faces, normals, edges, owners, hard)
    p, q = points[edges[:, 0]], points[edges[:, 1]]
    linear_edges = np.stack(((2 * p + q) / 3, (2 * q + p) / 3), axis=1)
    limit = min(MAX_DISPLACEMENT_MM, tolerance * 0.35)
    edge_limits = np.minimum(limit, np.linalg.norm(p - q, axis=1) * 0.08)
    controls_edges = linear_edges.copy()
    scores = np.zeros(len(edges))
    for side in range(2):
        face_ids = owners[:, side]
        corner_a = np.argmax(faces[face_ids] == edges[:, 0, None], axis=1)
        corner_b = np.argmax(faces[face_ids] == edges[:, 1, None], axis=1)
        na, nb = corner_normals[face_ids, corner_a], corner_normals[face_ids, corner_b]
        ca = _cap(linear_edges[:, 0] - na * np.einsum("nk,nk->n", q - p, na)[:, None] / 3,
                  linear_edges[:, 0], edge_limits)
        cb = _cap(linear_edges[:, 1] - nb * np.einsum("nk,nk->n", p - q, nb)[:, None] / 3,
                  linear_edges[:, 1], edge_limits)
        score = np.linalg.norm(ca - linear_edges[:, 0], axis=1) + np.linalg.norm(cb - linear_edges[:, 1], axis=1)
        selected = (score > scores) & ~hard
        controls_edges[selected] = np.stack((ca, cb), axis=1)[selected]
        scores[selected] = score[selected]
    triangles = points[faces]
    linear = np.einsum("pc,nck->npk", _EXPONENTS / 3, triangles)
    controls = linear.copy()
    factors = np.ones(len(edges))
    limited = np.zeros(len(faces), dtype=bool)
    for iteration in range(17):
        current_edges = linear_edges + (controls_edges - linear_edges) * factors[:, None, None]
        for corner in range(3):
            ids = edge_ids[:, corner]
            forward = faces[:, corner] == edges[ids, 0]
            controls[:, 3 + corner * 2] = current_edges[ids, np.where(forward, 0, 1)]
            controls[:, 4 + corner * 2] = current_edges[ids, np.where(forward, 1, 0)]
        average = controls[:, 3:9].mean(axis=1)
        controls[:, 9] = _cap(average + (average - linear[:, 9]) * 0.5, linear[:, 9], limit)
        jacobians = _orientation_bound(controls, normals)
        bad = jacobians <= np.maximum(1e-14, areas * 0.1)
        if not bad.any():
            break
        if iteration == 16:
            raise SurfaceError("Ein gekrümmter Flächenpatch könnte sich falten; Rekonstruktion verworfen.")
        limited |= bad
        factors[np.unique(edge_ids[bad])] *= 0.5
    displacement = np.linalg.norm(controls - linear, axis=2).max(axis=1)
    planar = np.abs(np.einsum("npk,nk->np", controls - triangles[:, 0, None], normals)).max(axis=1) < 1e-9
    details = {
        "method": "PN-Bernstein-Flächen", "input_triangles": len(faces),
        "curved_patches": int(np.count_nonzero(~planar)), "planar_patches": int(planar.sum()),
        "hard_edges": int(hard.sum()), "hard_edges_preserved": True,
        "control_displacement_limit_mm": limit, "patch_bound_mm": float(displacement.max()),
        "minimum_jacobian_ratio": float(np.min(jacobians / (2 * areas))),
        "local_orientation_certified": True, "limited_patches": int(limited.sum()),
        "bound_kind": "Bernstein_control_correspondence_before_sewing",
    }
    return controls, planar, origin, details


def _native_face(controls, planar):
    if planar:
        wire = BRepBuilderAPI_MakeWire()
        for i in range(3):
            poles = TColgp_Array1OfPnt(1, 4)
            for j, point in enumerate(controls[[i, 3 + 2 * i, 4 + 2 * i, (i + 1) % 3]]):
                poles.SetValue(j + 1, gp_Pnt(*point))
            edge = BRepBuilderAPI_MakeEdge(Geom_BezierCurve(poles))
            if not edge.IsDone():
                raise SurfaceError("Eine ebene Patchkante konnte nicht aufgebaut werden.")
            wire.Add(edge.Edge())
        maker = BRepBuilderAPI_MakeFace(wire.Wire(), True)
    else:
        tensor = patch_tensor(controls)
        poles = TColgp_Array2OfPnt(1, 4, 1, 4)
        for i in range(4):
            for j in range(4):
                poles.SetValue(i + 1, j + 1, gp_Pnt(*tensor[i, j]))
        knots, mult = TColStd_Array1OfReal(1, 2), TColStd_Array1OfInteger(1, 2)
        for i, value in enumerate((0.0, 1.0)):
            knots.SetValue(i + 1, value)
            mult.SetValue(i + 1, 4)
        surface = Geom_BSplineSurface(poles, knots, knots, mult, mult, 3, 3, False, False)
        maker = BRepBuilderAPI_MakeFace(surface, _NATIVE_TOLERANCE)
    if not maker.IsDone():
        raise SurfaceError("Eine gekrümmte CAD-Fläche konnte nicht aufgebaut werden.")
    return maker.Face()


def _validate_shape(shape):
    if (shape.isNull() or not shape.isValid() or len(shape.Solids()) != 1
            or shape.Volume() <= 0 or len(shape.Shells()) != 1):
        return False
    for shell in shape.Shells():
        if (not shell.isValid() or not BRep_Tool.IsClosed_s(shell.wrapped)
                or BRepCheck_Shell(shell.wrapped).Closed() != BRepCheck_NoError):
            return False
        # Sewing of collapsed-square patches can leave this cached flag unset.
        # Set it only after both native topological closure checks succeeded.
        shell.wrapped.Closed(True)
    return True


def smooth_shape(mesh, tolerance, progress=None):
    """Return ``(native_shape, details)`` or reject safely with SurfaceError.

    No source vertex moves and no topology IDs are merged in the input. The
    returned surface does move between vertices, by at most its Bernstein
    control bound before sewing. Callers must validate their exported STEP
    against the original source independently, including any earlier repair.
    """
    controls, planar, origin, details = reconstruct_patches(mesh, tolerance)
    if not details["curved_patches"]:
        raise SurfaceError("Das Netz enthält keine für PN-Flächen geeigneten gekrümmten Bereiche.")
    if progress:
        progress(f"Rekonstruiere {details['curved_patches']} begrenzte gekrümmte Flächen …")
    try:
        sewing = BRepBuilderAPI_Sewing(1e-6)
        for index, (patch, is_planar) in enumerate(zip(controls, planar)):
            sewing.Add(_native_face(patch, bool(is_planar)))
            if progress and index and index % 500 == 0:
                progress(f"Gekrümmte Flächen: {index}/{len(controls)} aufgebaut …")
        sewing.Perform()
        if sewing.NbFreeEdges() or sewing.NbMultipleEdges():
            raise SurfaceError("Die gekrümmten Flächen ergeben keine eindeutige geschlossene Hülle.")
        sewn = cq.Shape.cast(sewing.SewedShape())
        shells = sewn.Shells()
        if len(shells) != 1:
            raise SurfaceError("Die gekrümmte Rekonstruktion enthält nicht genau eine CAD-Hülle.")
        maker = BRepBuilderAPI_MakeSolid(shells[0].wrapped)
        solid = maker.Solid()
        if not BRepLib.OrientClosedSolid_s(solid):
            raise SurfaceError("Die gekrümmte CAD-Hülle lässt sich nicht eindeutig orientieren.")
        shape = cq.Shape.cast(solid)
        if not _validate_shape(shape):
            raise SurfaceError("Die gekrümmten Flächen erzeugen keinen gültigen geschlossenen CAD-Körper.")
        try:
            clean = shape.clean()
            if _validate_shape(clean):
                shape = clean
        except Exception:
            pass
        native_tolerance = max(BRep_Tool.Tolerance_s(item.wrapped)
                               for item in [*shape.Faces(), *shape.Edges(), *shape.Vertices()])
        if not math.isfinite(native_tolerance) or native_tolerance > min(5e-6, tolerance * 0.05):
            raise SurfaceError("Die native Flächentoleranz überschreitet das reservierte Budget.")
        delta = abs(shape.Volume() / float(mesh.volume) - 1)
        if not math.isfinite(delta) or delta > MAX_VOLUME_CHANGE:
            raise SurfaceError("Die gekrümmten Flächen überschreiten 1 % Volumenänderung.")
        shape = shape.translate(tuple(origin))
        if not _validate_shape(shape):
            raise SurfaceError("Der positionierte gekrümmte CAD-Körper ist ungültig.")
        details.update(native_tolerance_mm=float(native_tolerance), volume_change_percent=100 * delta,
                       output_faces=len(shape.Faces()), surface_bound_with_native_tolerance_mm=details["patch_bound_mm"] + native_tolerance)
        return shape, details
    except SurfaceError:
        raise
    except Exception as exc:
        raise SurfaceError(f"Native Flächenrekonstruktion abgelehnt: {exc}") from exc
