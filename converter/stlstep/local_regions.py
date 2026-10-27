"""Connected plane/cylinder proposals and a shared-boundary CAD builder.

Recognition is a proposal, never an exemption from engine or STEP checks.
Cylinders are limited to straight ruled sectors with planar cap/side neighbours.
Unknown surfaces remain indexed planar facets; no gap-filling sewing is used.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
import math

import numpy as np

MAX_FACES = 20_000
MAX_SEEDS = 12_000
COLOURS = {"PLANE": "#58b9e7", "CYLINDER": "#ffa54b", "CONE": "#77ce8d",
           "GRAPH": "#e980bd", "REVOLUTION": "#58d3c6", "REST": "#a298b5"}


class RegionCancelled(ValueError):
    pass


def _cancel(event):
    if event is not None and event.is_set():
        raise RegionCancelled("Flächenerkennung abgebrochen.")


def _basis(axis):
    first = np.eye(3)[np.argmin(np.abs(axis))]
    first = np.cross(first, axis)
    first /= np.linalg.norm(first)
    return first, np.cross(axis, first)


@dataclass
class Analysis:
    face_regions: np.ndarray
    regions: list[dict]
    planes: list[dict]
    plane_ids: np.ndarray
    boundary_edges: np.ndarray
    numeric_mm: float
    edits: dict | None = None

    def report(self, include_faces=False):
        result = {"kind": "connected_surface_proposals_not_CAD_acceptance",
                  "numeric_mm": self.numeric_mm,
                  "counts": dict(Counter(r["type"] for r in self.regions)),
                  "triangles_by_type": dict(Counter(
                      self.regions[int(i)]["type"] for i in self.face_regions)),
                  "regions": self.regions}
        if include_faces:
            result["face_regions"] = self.face_regions.tolist()
        return result


def _planes(mesh, numeric, event):
    normals = np.asarray(mesh.face_normals)
    parent = np.arange(len(mesh.faces))

    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    triangles = np.asarray(mesh.triangles)
    for a, b in np.asarray(mesh.face_adjacency):
        if np.dot(normals[a], normals[b]) > math.cos(.001):
            if np.max(np.abs((triangles[b] - triangles[a, 0]) @ normals[a])) <= numeric:
                a, b = root(a), root(b)
                parent[b] = a
    groups = defaultdict(list)
    for i in range(len(parent)):
        groups[root(i)].append(i)
    planes, ids = [], np.zeros(len(parent), dtype=int)
    for indices in groups.values():
        _cancel(event)
        pts = np.asarray(mesh.vertices)[np.unique(mesh.faces[indices])]
        weights = mesh.area_faces[indices]
        if float(weights.sum()) > 0:
            normal = np.average(normals[indices], axis=0, weights=weights)
            normal /= max(np.linalg.norm(normal), 1e-30)
        else:
            # Display meshes may contain collapsed apex facets. Preserve their
            # original indices as rest faces instead of failing the preview.
            normal = np.zeros(3)
        centre = pts.mean(axis=0)
        residual = float(np.max(np.abs((pts - centre) @ normal)))
        # Region growing must not accumulate a large departure from a plane.
        chunks = [indices] if residual <= numeric * 2 else [[i] for i in indices]
        for chunk in chunks:
            vertices = np.unique(mesh.faces[chunk])
            n = normal if len(chunks) == 1 else normals[chunk[0]]
            p = np.asarray(mesh.vertices)[vertices].mean(axis=0)
            ids[chunk] = len(planes)
            planes.append({"faces": chunk, "vertices": vertices, "normal": n,
                           "centre": p, "area": float(mesh.area_faces[chunk].sum()),
                           "residual_mm": float(np.max(np.abs((mesh.vertices[vertices] - p) @ n)))})
    return planes, ids


def _circle(points):
    unique = np.unique(np.round(points, 9), axis=0)
    if len(unique) < 3:
        return None
    origin = unique.mean(axis=0)
    local = unique - origin
    matrix = np.column_stack((2 * local, np.ones(len(local))))
    fit, _, _, values = np.linalg.lstsq(matrix, np.sum(local * local, axis=1), rcond=None)
    if values[-1] < values[0] * 1e-5:
        return None
    radius2 = float(fit[2] + np.dot(fit[:2], fit[:2]))
    if radius2 <= 0:
        return None
    return fit[:2] + origin, math.sqrt(radius2)


def _cylinders(mesh, planes, plane_ids, numeric, tolerance, event):
    neighbours = defaultdict(set)
    for a, b in mesh.face_adjacency:
        a, b = int(plane_ids[a]), int(plane_ids[b])
        if a != b:
            neighbours[a].add(b)
            neighbours[b].add(a)
    axes = []
    for plane in sorted(planes, key=lambda p: -p["area"])[:16]:
        axis = plane["normal"].copy()
        if np.linalg.norm(axis) < .5:
            continue
        if axis[np.argmax(np.abs(axis))] < 0:
            axis *= -1
        if all(abs(np.dot(axis, other)) < 1 - 1e-8 for other in axes):
            axes.append(axis)
    used, proposals, seeds = set(), [], 0
    origin = np.asarray(mesh.bounds).mean(axis=0)
    points = np.asarray(mesh.vertices) - origin
    for axis in axes:
        _cancel(event)
        x, y = _basis(axis)
        xy = np.column_stack((points @ x, points @ y))
        side = {i for i, p in enumerate(planes) if abs(np.dot(p["normal"], axis)) < 2e-4}
        pairs = sorted({tuple(sorted((a, b))) for a in side for b in neighbours[a]
                        if b in side and np.dot(planes[a]["normal"], planes[b]["normal"]) > math.cos(math.radians(35))})
        for a, b in pairs:
            _cancel(event)
            if a in used or b in used:
                continue
            seeds += 1
            if seeds > MAX_SEEDS:
                return proposals
            ids = np.unique(np.concatenate((planes[a]["vertices"], planes[b]["vertices"])))
            circle = _circle(xy[ids])
            if circle is None:
                continue
            centre, radius = circle
            if radius < numeric * 100 or radius > mesh.scale * 5:
                continue

            def matches(i):
                p = planes[i]
                radial = xy[p["vertices"]] - centre
                if np.max(np.abs(np.linalg.norm(radial, axis=1) - radius)) > numeric * 4:
                    return False
                radial3 = x * (radial[:, 0].mean()) + y * (radial[:, 1].mean())
                length = np.linalg.norm(radial3)
                return length > numeric and abs(np.dot(radial3 / length, p["normal"])) > math.cos(math.radians(16))

            if not matches(a) or not matches(b):
                continue
            found = {a, b}
            # Refit growing support: a short float32 arc can give an unstable
            # extrapolated centre although a longer arc is well determined.
            expanded = True
            while expanded:
                _cancel(event)
                expanded = False
                pending = sorted(set().union(*(neighbours[i] for i in found)) - found - used)
                for i in pending:
                    if i not in side:
                        continue
                    trial_ids = np.unique(np.concatenate([planes[j]["vertices"] for j in found | {i}]))
                    trial = _circle(xy[trial_ids])
                    if trial is None:
                        continue
                    trial_centre, trial_radius = trial
                    if (trial_radius < numeric * 100 or trial_radius > mesh.scale * 5
                            or np.max(np.abs(np.linalg.norm(xy[trial_ids] - trial_centre, axis=1) - trial_radius)) > numeric * 4):
                        continue
                    old_centre, old_radius = centre, radius
                    centre, radius = trial_centre, trial_radius
                    if matches(i) and all(matches(j) for j in found):
                        found.add(i)
                        expanded = True
                    else:
                        centre, radius = old_centre, old_radius
            if len(found) < 4:
                continue
            vertex_ids = np.unique(np.concatenate([planes[i]["vertices"] for i in found]))
            circle = _circle(xy[vertex_ids])
            if circle is None:
                continue
            centre, radius = circle
            residual = float(np.max(np.abs(np.linalg.norm(xy[vertex_ids] - centre, axis=1) - radius)))
            if residual > numeric * 4 or any(not matches(i) for i in found):
                continue
            faces = sorted(f for i in found for f in planes[i]["faces"])
            tri = mesh.triangles[faces] - origin
            radial_points = np.column_stack(((tri.reshape(-1, 3) @ x), (tri.reshape(-1, 3) @ y))) - centre
            centres = mesh.triangles_center[faces] - origin
            centres_xy = np.column_stack((centres @ x, centres @ y)) - centre
            # Vertex fitting alone would smooth a coarse polygon at no cost.
            probes = np.vstack((centres_xy, (radial_points.reshape(-1, 3, 2) +
                                np.roll(radial_points.reshape(-1, 3, 2), 1, axis=1)).reshape(-1, 2) / 2))
            chord_error = float(np.max(np.abs(np.linalg.norm(probes, axis=1) - radius)))
            if chord_error > tolerance * .45:
                continue
            sign = float(np.sum(mesh.area_faces[faces] * np.einsum(
                "ij,ij->i", mesh.face_normals[faces], centres_xy[:, :1] * x + centres_xy[:, 1:] * y)))
            axis_origin = origin + centre[0] * x + centre[1] * y
            proposals.append({"type": "CYLINDER", "faces": faces, "plane_groups": sorted(found),
                              "axis": axis.tolist(), "origin": axis_origin.tolist(),
                              "radius_mm": radius, "vertex_residual_mm": residual,
                              "chord_probe_mm": chord_error, "outward": sign > 0})
            used.update(found)
    return proposals


def analyse_regions(mesh, tolerance=.15, cancel_event=None):
    if len(mesh.faces) > MAX_FACES:
        raise ValueError(f"Flächenerkennung unterstützt bis {MAX_FACES} Dreiecke.")
    if not math.isfinite(tolerance) or tolerance <= 0 or not np.isfinite(mesh.vertices).all():
        raise ValueError("Ungültiges Netz oder Abweichungsbudget.")
    numeric = max(1e-7, float(mesh.scale) * 3e-8)
    planes, plane_ids = _planes(mesh, numeric, cancel_event)
    cylinders = _cylinders(mesh, planes, plane_ids, numeric, tolerance, cancel_event)
    regions, face_regions = [], np.full(len(mesh.faces), -1, dtype=int)
    for cylinder in cylinders:
        face_regions[cylinder["faces"]] = len(regions)
        regions.append({**cylinder, "id": len(regions), "reconstructible": False,
                        "reason": "Gemeinsame Ränder noch nicht geprüft"})
    for plane in planes:
        indices = [i for i in plane["faces"] if face_regions[i] < 0]
        if not indices:
            continue
        face_regions[indices] = len(regions)
        regions.append({"id": len(regions), "type": "PLANE" if len(indices) > 1 else "REST",
                        "faces": indices, "normal": plane["normal"].tolist(),
                        "residual_mm": plane["residual_mm"], "reconstructible": True,
                        "reason": "Zusammenhängender ebener Bereich" if len(indices) > 1 else "Einzelne Restfacette"})
    adjacency = np.asarray(mesh.face_adjacency)
    different = face_regions[adjacency[:, 0]] != face_regions[adjacency[:, 1]] if len(adjacency) else []
    edges = np.asarray(mesh.face_adjacency_edges)[different]
    analysis = Analysis(face_regions, regions, planes, plane_ids, edges, numeric)
    _check_cylinder_boundaries(mesh, analysis)
    return analysis


def _boundary_edges(mesh, face_ids):
    faces = mesh.faces[face_ids]
    edges = np.vstack((faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]))
    keys = np.sort(edges, axis=1)
    _, inverse, counts = np.unique(keys, axis=0, return_inverse=True, return_counts=True)
    return edges[counts[inverse] == 1]


def _check_cylinder_boundaries(mesh, analysis):
    edge_faces = defaultdict(list)
    for i, face in enumerate(mesh.faces):
        for a, b in zip(face, np.roll(face, -1)):
            edge_faces[tuple(sorted((int(a), int(b))))].append(i)
    for r in analysis.regions:
        if r["type"] != "CYLINDER":
            continue
        reason = None
        axis = np.array(r["axis"])
        points = mesh.vertices - r["origin"]
        heights = points @ axis
        vertex_ids = np.unique(mesh.faces[r["faces"]])
        low, high = float(heights[vertex_ids].min()), float(heights[vertex_ids].max())
        if high - low < analysis.numeric_mm * 20:
            reason = "Zylinderbereich zu kurz"
        ids = set(r["faces"])
        caps = {"low": set(), "high": set()}
        sides = set()
        boundary = _boundary_edges(mesh, r["faces"])
        for a, b in boundary:
            others = [i for i in edge_faces[tuple(sorted((int(a), int(b))))] if i not in ids]
            if len(others) != 1:
                reason = "Offener oder mehrfach belegter Regionsrand"
                break
            p_id = int(analysis.plane_ids[others[0]])
            p = analysis.planes[p_id]
            h = heights[[a, b]]
            cap = "low" if np.max(np.abs(h - low)) <= analysis.numeric_mm * 4 else (
                  "high" if np.max(np.abs(h - high)) <= analysis.numeric_mm * 4 else None)
            if cap:
                if abs(np.dot(p["normal"], axis)) < 1 - 1e-7:
                    reason = "Zylinderrand trifft keine senkrechte ebene Kappe"
                    break
                caps[cap].add(p_id)
            else:
                radial = points[[a, b]] - h[:, None] * axis
                if np.linalg.norm(radial[0] - radial[1]) > analysis.numeric_mm * 4:
                    reason = "Nicht rechteckiger Zylinderbereich oder unbekannter Ausschnitt"
                    break
                sides.add(p_id)
        if reason is None and (len(caps["low"]) != 1 or len(caps["high"]) != 1 or len(sides) not in (0, 2)):
            reason = "Zylinder benötigt zwei durchgehende Kappen und null oder zwei Seitenränder"
        r.update(reconstructible=reason is None, reason=reason or "Ebene Kappen und gerade gemeinsame Seitenränder belegt",
                 height_min_mm=low, height_max_mm=high, cap_groups={k: sorted(v) for k, v in caps.items()},
                 side_groups=sorted(sides))


def face_colours(analysis, indices):
    from matplotlib.colors import to_rgba
    return np.array([to_rgba(COLOURS[analysis.regions[int(analysis.face_regions[i])]["type"]]) for i in indices])


def _shared_chains(mesh, region_ids):
    """One chain per connected boundary between two regions; split at junctions."""
    pairs, degree = defaultdict(set), Counter()
    for (a, b), edge in zip(mesh.face_adjacency, mesh.face_adjacency_edges):
        first, second = int(region_ids[a]), int(region_ids[b])
        if first == second:
            continue
        key = tuple(sorted(map(int, edge)))
        pairs[tuple(sorted((first, second)))].add(key)
        degree.update(key)
    chains = []
    for pair, edges in sorted(pairs.items()):
        adjacency = defaultdict(set)
        for a, b in edges:
            adjacency[a].add(b)
            adjacency[b].add(a)
        unused = set(edges)
        while unused:
            first_edge = min(unused)
            stop = {i for i in adjacency if len(adjacency[i]) != 2 or degree[i] != 2}
            candidates = sorted(i for e in unused for i in e if i in stop)
            start = candidates[0] if candidates else first_edge[0]
            nodes = [start]
            while True:
                next_nodes = sorted(i for i in adjacency[nodes[-1]]
                                    if tuple(sorted((i, nodes[-1]))) in unused)
                if not next_nodes:
                    break
                next_node = next_nodes[0]
                unused.remove(tuple(sorted((next_node, nodes[-1]))))
                nodes.append(next_node)
                if next_node == start or next_node in stop:
                    break
            if len(nodes) < 2:
                raise ValueError("Ungültige gemeinsame Randkette")
            chains.append({"pair": pair, "nodes": nodes})
    return chains


def _native_cylinder(mesh, region, chains, numeric):
    import cadquery as cq
    from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeFace
    from OCP.gp import gp_Ax3, gp_Cylinder, gp_Dir, gp_Pnt
    axis = np.asarray(region["axis"])
    origin = np.asarray(region["origin"])
    x, y = _basis(axis)
    vertex_ids = np.unique(mesh.faces[region["faces"]])
    xy = np.column_stack(((mesh.vertices[vertex_ids] - origin) @ x,
                          (mesh.vertices[vertex_ids] - origin) @ y))
    vertical = [c for c in chains if np.ptp((mesh.vertices[c["nodes"]] - origin) @ axis) > numeric * 4]
    if vertical:
        if len(chains) != 4 or len(vertical) != 2:
            raise ValueError("Zylindersektor benötigt vier ungeteilte gemeinsame Ränder")
        # Keep the two side generators exactly in their existing planar walls.
        endpoints = np.array([mesh.vertices[c["nodes"][0]] for c in vertical]) - origin
        ends = np.column_stack((endpoints @ x, endpoints @ y))
        midpoint = ends.mean(axis=0)
        direction = ends[1] - ends[0]
        length = np.linalg.norm(direction)
        if length < numeric * 10:
            raise ValueError("Zylindersektor ist numerisch nicht aufgelöst")
        perpendicular = np.array([-direction[1], direction[0]]) / length
        local = xy - midpoint
        matrix = 2 * (local @ perpendicular)
        rhs = np.sum(local * local, axis=1) - np.sum((ends[0] - midpoint) ** 2)
        if np.dot(matrix, matrix) < numeric ** 2:
            raise ValueError("Kreisfit mit gemeinsamen Endpunkten nicht bestimmt")
        centre = midpoint + perpendicular * (np.dot(matrix, rhs) / np.dot(matrix, matrix))
        radius = float(np.linalg.norm(ends[0] - centre))
        origin = origin + centre[0] * x + centre[1] * y
        if np.max(np.abs(np.linalg.norm(xy - centre, axis=1) - radius)) > numeric * 8:
            raise ValueError("Gemeinsame Zylinderendpunkte widersprechen dem Kreisfit")
        angle = np.mod(np.arctan2(xy[:, 1] - centre[1], xy[:, 0] - centre[0]), 2 * math.pi)
        ordered = np.sort(angle)
        gaps = np.diff(np.r_[ordered, ordered[0] + 2 * math.pi])
        cut = int(np.argmax(gaps))
        start = float(ordered[(cut + 1) % len(ordered)])
        width = float(2 * math.pi - gaps[cut])
        if width < math.radians(8) or width > 2 * math.pi - .001:
            raise ValueError("Zylindersektor außerhalb belegbarer Winkelgrenzen")
        radial_x = math.cos(start) * x + math.sin(start) * y
    else:
        if len(chains) != 2 or any(c["nodes"][0] != c["nodes"][-1] for c in chains):
            raise ValueError("Vollzylinder benötigt zwei geschlossene gemeinsame Kreisränder")
        radius = region["radius_mm"]
        point = mesh.vertices[chains[0]["nodes"][0]] - origin
        radial_x = point - np.dot(point, axis) * axis
        radial_x /= np.linalg.norm(radial_x)
        width = 2 * math.pi
    maker = BRepBuilderAPI_MakeFace(gp_Cylinder(gp_Ax3(gp_Pnt(*origin), gp_Dir(*axis), gp_Dir(*radial_x)), radius),
                                  0., width, region["height_min_mm"], region["height_max_mm"])
    if not maker.IsDone():
        raise ValueError("Native Zylinderfläche konnte nicht erzeugt werden")
    face = cq.Face(maker.Face())
    if not region["outward"]:
        from OCP.TopoDS import TopoDS
        face = cq.Face(TopoDS.Face_s(face.wrapped.Reversed()))
    return face


def shared_region_shape(mesh, tolerance, progress=None, analysis=None):
    """Build indexed regions using the same native edge objects on both sides.

    Only supported cylinders replace facets. Plane and remaining facet boundaries
    use the same global graph. No Sewing or enlarged gap-closing tolerance.
    """
    import cadquery as cq
    from OCP.BRep import BRep_Builder, BRep_Tool
    from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeEdge, BRepBuilderAPI_MakeWire, BRepBuilderAPI_MakeFace
    from OCP.BRepCheck import BRepCheck_Shell, BRepCheck_NoError
    from OCP.TopoDS import TopoDS, TopoDS_Shell, TopoDS_Solid
    from OCP.gp import gp_Dir, gp_Pln, gp_Pnt
    from .repair import manifold_vertex_links
    if (len(mesh.faces) > MAX_FACES or not mesh.is_watertight or not mesh.is_winding_consistent
            or np.any(mesh.area_faces <= 0)
            or mesh.metadata.get("preserve_vertex_identity")
            or not manifold_vertex_links(mesh)["closed_single_cycle"]):
        return None
    analysis = analysis or analyse_regions(mesh, tolerance)
    cylinders = [r for r in analysis.regions if r["type"] == "CYLINDER" and r["reconstructible"]]
    if not cylinders:
        return None
    ids = analysis.plane_ids.copy()
    plane_count = len(analysis.planes)
    for i, region in enumerate(cylinders):
        ids[region["faces"]] = plane_count + i
    chains = _shared_chains(mesh, ids)
    by_region = defaultdict(list)
    for i, chain in enumerate(chains):
        for owner in chain["pair"]:
            by_region[owner].append(i)
    faces, chain_edges, vertex_override = [], {}, {}
    numeric = analysis.numeric_mm
    for i, region in enumerate(cylinders):
        if progress:
            progress(f"Baue gemeinsame Ebenen-/Zylinderränder {i + 1}/{len(cylinders)} …")
        owner = plane_count + i
        face = _native_cylinder(mesh, region, [chains[j] for j in by_region[owner]], numeric)
        faces.append(face)
        edges = face.Edges()
        matched = set()
        for j in by_region[owner]:
            chain = chains[j]
            raw = mesh.vertices[chain["nodes"]]
            height = (raw - region["origin"]) @ region["axis"]
            is_arc = np.ptp(height) <= numeric * 4
            candidates = [(k, e) for k, e in enumerate(edges) if k not in matched
                          and e.geomType() == ("CIRCLE" if is_arc else "LINE")]
            if is_arc:
                candidates.sort(key=lambda item: abs(np.dot(np.asarray(item[1].Center().toTuple()) -
                                                region["origin"], region["axis"]) - height.mean()))
            else:
                candidates.sort(key=lambda item: min(
                    np.linalg.norm(np.array(item[1].startPoint().toTuple()) - raw[0]) +
                    np.linalg.norm(np.array(item[1].endPoint().toTuple()) - raw[-1]),
                    np.linalg.norm(np.array(item[1].endPoint().toTuple()) - raw[0]) +
                    np.linalg.norm(np.array(item[1].startPoint().toTuple()) - raw[-1])))
            if not candidates:
                raise ValueError("Gemeinsamer Zylinderrand fehlt")
            k, edge = candidates[0]
            matched.add(k)
            chain_edges[j] = [edge]
            if chain["nodes"][0] != chain["nodes"][-1]:
                for mesh_id in (chain["nodes"][0], chain["nodes"][-1]):
                    vertex = min(edge.Vertices(), key=lambda v: np.linalg.norm(np.asarray(v.toTuple()) - mesh.vertices[mesh_id]))
                    if np.linalg.norm(np.asarray(vertex.toTuple()) - mesh.vertices[mesh_id]) > numeric * 16:
                        raise ValueError("Native Randendpunkte verlassen die numerische Fitreserve")
                    if mesh_id in vertex_override and not vertex_override[mesh_id].isSame(vertex):
                        # Independent surfaces at one junction require a joint
                        # vertex solve; do not hide this with geometric sewing.
                        raise ValueError("Mehrere Zylinder benötigen eine gemeinsame Eckpunktlösung")
                    vertex_override[mesh_id] = vertex
    vertices = {i: vertex_override.get(i) or cq.Vertex.makeVertex(*point) for i, point in enumerate(mesh.vertices)}
    for j, chain in enumerate(chains):
        if j in chain_edges:
            continue
        nodes = chain["nodes"]
        pts = np.array([vertices[i].toTuple() for i in nodes])
        vector = pts[-1] - pts[0]
        length = np.linalg.norm(vector)
        # Collapse only an entire chain between the same two regions.
        if length > numeric and np.max(np.linalg.norm(np.cross(pts - pts[0], vector / length), axis=1)) <= numeric:
            segments = [(nodes[0], nodes[-1])]
        else:
            segments = list(zip(nodes, nodes[1:]))
        chain_edges[j] = []
        for a, b in segments:
            maker = BRepBuilderAPI_MakeEdge(vertices[a].wrapped, vertices[b].wrapped)
            if not maker.IsDone():
                raise ValueError("Gemeinsame lineare Randkante konnte nicht erzeugt werden")
            chain_edges[j].append(cq.Edge(maker.Edge()))
    raw_to_chain = {}
    for j, chain in enumerate(chains):
        for a, b in zip(chain["nodes"], chain["nodes"][1:]):
            raw_to_chain[tuple(sorted((a, b)))] = j
    for owner, plane in enumerate(analysis.planes):
        indices = [i for i in plane["faces"] if ids[i] == owner]
        if not indices:
            continue
        boundary = _boundary_edges(mesh, indices)
        next_vertex = {}
        for a, b in boundary:
            if int(a) in next_vertex:
                raise ValueError("Berührender oder verzweigter ebener Regionsrand")
            next_vertex[int(a)] = int(b)
        loops = []
        while next_vertex:
            start = min(next_vertex)
            nodes = [start]
            while nodes[-1] in next_vertex:
                nodes.append(next_vertex.pop(nodes[-1]))
                if nodes[-1] == start:
                    break
            if nodes[-1] != start:
                raise ValueError("Offene ebene Regionsgrenze")
            chain_ids = []
            for a, b in zip(nodes, nodes[1:]):
                j = raw_to_chain[tuple(sorted((a, b)))]
                if j not in chain_ids:
                    chain_ids.append(j)
            wire = cq.Wire.assembleEdges(e for j in chain_ids for e in chain_edges[j])
            if not wire.IsClosed():
                raise ValueError("Native Regionsgrenze nicht geschlossen")
            x, y = _basis(plane["normal"])
            pts = mesh.vertices[nodes[:-1]] - plane["centre"]
            xy = np.column_stack((pts @ x, pts @ y))
            area = abs(float(np.sum(xy[:, 0] * np.roll(xy[:, 1], -1) - xy[:, 1] * np.roll(xy[:, 0], -1))))
            loops.append((area, wire))
        loops.sort(key=lambda item: -item[0])
        maker = BRepBuilderAPI_MakeFace(gp_Pln(gp_Pnt(*plane["centre"]), gp_Dir(*plane["normal"])), loops[0][1].wrapped, True)
        for _, wire in loops[1:]:
            maker.Add(wire.wrapped)
        if not maker.IsDone():
            raise ValueError("Ebene Region konnte nicht aufgebaut werden")
        # Face orientation fixes hole winding without sewing surfaces together.
        from OCP.ShapeFix import ShapeFix_Face
        fixer = ShapeFix_Face(maker.Face())
        fixer.FixOrientation()
        face = cq.Face(fixer.Face())
        if np.dot(face.normalAt().toTuple(), plane["normal"]) < 0:
            face = cq.Face(TopoDS.Face_s(face.wrapped.Reversed()))
        faces.append(face)
    builder = BRep_Builder()
    shell = TopoDS_Shell()
    builder.MakeShell(shell)
    for face in faces:
        builder.Add(shell, face.wrapped)
    checker = BRepCheck_Shell(shell)
    if checker.Closed() != BRepCheck_NoError:
        raise ValueError("Gemeinsame Ränder ergeben keine native geschlossene Hülle")
    shell.Closed(True)
    solid = TopoDS_Solid()
    builder.MakeSolid(solid)
    builder.Add(solid, shell)
    shape = cq.Shape.cast(solid)
    # Each shared 3D edge needs consistent parameters on both face surfaces.
    # This supplies missing/approximate pcurves; it does not sew separate edges.
    from OCP.BRepLib import BRepLib
    for face in faces:
        if face.geomType() == "PLANE":
            for edge in face.Edges():
                BRepLib.BuildPCurveForEdgeOnPlane_s(edge.wrapped, face.wrapped)
    BRepLib.SameParameter_s(shape.wrapped, 1e-7, True)
    native_tolerance = max(BRep_Tool.Tolerance_s(e.wrapped) for e in shape.Edges())
    if native_tolerance > numeric * 16:
        raise ValueError("Native Randkurven überschreiten die numerische Fitreserve")
    if not shape.isValid() or shape.Volume() <= 0 or len(shape.Solids()) != 1:
        raise ValueError("Lokaler Regionenaufbau ergibt keinen gültigen Körper")
    details = {"kind": "shared_native_plane_cylinder_boundaries", "cylinders": len(cylinders),
               "shared_boundary_chains": len(chains), "faces_before": len(mesh.faces),
               "faces_after": len(shape.Faces()), "sewing_used": False,
               "max_native_edge_tolerance_mm": native_tolerance,
               "recognition": analysis.report(), "native_closed": True}
    return shape, details
