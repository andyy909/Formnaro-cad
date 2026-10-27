# Independent synthetic physical geometry checker promoted from the accepted local make-solid proof.
"""Independent P25 physical-file checks; stdlib only, no application geometry imports.

Use locally after source/EXE verification, or from Pruefnachweise in an extracted
delivery. Only explicit synthetic artifact paths are read; no user folders scanned.
"""
from collections import Counter, defaultdict, deque
from pathlib import Path
from decimal import Decimal
import heapq
import itertools
import hashlib
import json
import math
import sys
import zipfile

HERE = Path(__file__).resolve().parent
LOCAL = True
WORK = Path(__file__).resolve().parents[1] / "work/mesh-make-solid/checks"
sha = lambda file: hashlib.sha256(Path(file).read_bytes()).hexdigest()
sub = lambda a, b: tuple(x-y for x, y in zip(a, b))
dot = lambda a, b: sum(x*y for x, y in zip(a, b))
cross = lambda a, b: (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
norm = lambda a: math.sqrt(dot(a, a))
mix = lambda a, b, t: tuple(x+(y-x)*t for x, y in zip(a, b))
canonical = lambda face: min(tuple(face[i:]+face[:i]) for i in range(3))

if not LOCAL:
    delivered = json.loads((WORK.parent / "Paket-Pruefung.json").read_text(encoding="utf-8"))
    assert delivered["package25"] and delivered["meshMakeSolid"] and not delivered["includesUserData"]
    delivered_files = {entry["file"]: entry for entry in delivered["files"]}


def delivered_identity(file):
    if LOCAL:
        return
    entry = delivered_files[file.relative_to(WORK.parent).as_posix()]
    assert file.is_file() and not file.is_symlink()
    assert file.stat().st_size == entry["bytes"] and sha(file) == entry["sha256"]


def fixture_data():
    if LOCAL:
        return json.loads((WORK.parents[2] / "backend/mesh-make-solid-fixture.json").read_text(encoding="utf-8"))
    sources = [name for name in delivered_files if name.startswith("Formnaro-Quellcode-v") and name.endswith(".zip")]
    assert len(sources) == 1
    file = WORK.parent / sources[0]
    delivered_identity(file)
    with zipfile.ZipFile(file) as archive:
        return json.loads(archive.read("backend/mesh-make-solid-fixture.json"))


def points(node, world=False):
    values = node["mesh"]["verts"]
    assert len(values) % 3 == 0 and all(math.isfinite(v) for v in values)
    local = [tuple(values[i:i+3]) for i in range(0, len(values), 3)]
    if not world:
        return local
    matrix = node["transform"]
    assert len(matrix) == 16 and all(math.isfinite(v) for v in matrix)
    return [tuple(sum(matrix[k+4*j]*p[j] for j in range(3))+matrix[12+k] for k in range(3)) for p in local]


def triangles(node, world=False):
    positions = points(node, world)
    indices = node["mesh"]["triangles"]
    assert len(indices) % 3 == 0 and all(isinstance(i, int) and 0 <= i < len(positions) for i in indices)
    return [tuple(positions[i] for i in indices[j:j+3]) for j in range(0, len(indices), 3)]


def normal(face):
    value = cross(sub(face[1], face[0]), sub(face[2], face[0]))
    length = norm(value)
    assert length > 1e-12, "Degenerate physical triangle"
    return tuple(x/length for x in value)


def volume(faces):
    return sum(dot(a, cross(b, c)) for a, b, c in faces)/6


def closed_connected(faces):
    edges, adjacent = defaultdict(list), defaultdict(set)
    for face_id, face in enumerate(faces):
        normal(face)
        for i in range(3):
            a, b = face[i], face[(i+1) % 3]
            edges[tuple(sorted((a, b)))].append((a, b, face_id))
    for edge, incident in edges.items():
        assert len(incident) == 2 and incident[0][:2] == incident[1][:2][::-1], edge
        a, b = incident[0][2], incident[1][2]
        adjacent[a].add(b)
        adjacent[b].add(a)
    seen, queue = {0}, deque([0])
    while queue:
        for face in adjacent[queue.popleft()]:
            if face not in seen:
                seen.add(face)
                queue.append(face)
    assert len(seen) == len(faces), "Unexpected disconnected physical result"
    assert volume(faces) > 0, "Nonpositive physical material volume"


def plane_cut(face, origin, plane_normal, epsilon):
    distances = [dot(plane_normal, sub(point, origin)) for point in face]
    result = [p for p, distance in zip(face, distances) if abs(distance) <= epsilon]
    for i in range(3):
        j = (i+1) % 3
        if distances[i]*distances[j] < -epsilon*epsilon:
            result.append(mix(face[i], face[j], distances[i]/(distances[i]-distances[j])))
    return result


def segment_distance(point, a, b):
    direction = sub(b, a)
    parameter = max(0, min(1, dot(sub(point, a), direction)/dot(direction, direction)))
    return norm(sub(point, mix(a, b, parameter)))


def coplanar_clip(first, second, plane_normal, epsilon):
    axis = max(range(3), key=lambda i: abs(plane_normal[i]))
    keep = [i for i in range(3) if i != axis]
    orient = lambda a, b, p: (b[keep[0]]-a[keep[0]])*(p[keep[1]]-a[keep[1]])-(b[keep[1]]-a[keep[1]])*(p[keep[0]]-a[keep[0]])
    direction = 1 if orient(*second) > 0 else -1
    polygon = list(first)
    for i in range(3):
        if not polygon:
            break
        a, b = second[i], second[(i+1) % 3]
        output = []
        for j, current in enumerate(polygon):
            previous = polygon[j-1]
            dc, dp = direction*orient(a, b, current), direction*orient(a, b, previous)
            inside, previous_inside = dc >= -epsilon, dp >= -epsilon
            if inside != previous_inside:
                output.append(mix(previous, current, dp/(dp-dc)))
            if inside:
                output.append(current)
        polygon = output
    return polygon


def no_intersections(faces, cell=1.0):
    """Independent triangle/plane interval and coplanar polygon clipping.

    Shared original mesh edges/vertices may touch; any contact outside that
    shared simplex is rejected. AABBs only prune impossible pairs.
    """
    epsilon = 1e-8
    normals = [normal(face) for face in faces]
    bounds = [(tuple(min(p[k] for p in face) for k in range(3)), tuple(max(p[k] for p in face) for k in range(3))) for face in faces]
    grid = defaultdict(list)
    pairs = set()
    for i, (low, high) in enumerate(bounds):
        ranges = [range(math.floor((low[k]-epsilon)/cell), math.floor((high[k]+epsilon)/cell)+1) for k in range(3)]
        for key in itertools.product(*ranges):
            for j in grid[key]:
                pairs.add((i, j))
            grid[key].append(i)
        assert len(pairs) <= 1000000, "Independent triangle audit pair budget exceeded"
    tested = 0
    for i, j in sorted(pairs):
            first, second = faces[i], faces[j]
            if any(bounds[i][1][k] < bounds[j][0][k]-epsilon or bounds[j][1][k] < bounds[i][0][k]-epsilon for k in range(3)):
                continue
            tested += 1
            shared = list(set(first) & set(second))
            assert len(shared) < 3, "Duplicate physical triangles"
            permitted = lambda point: any(norm(sub(point, vertex)) <= epsilon*4 for vertex in shared) if len(shared) < 2 else segment_distance(point, *shared) <= epsilon*4
            n1, n2 = normals[i], normals[j]
            d1 = [dot(n1, sub(p, first[0])) for p in second]
            d2 = [dot(n2, sub(p, second[0])) for p in first]
            if all(v > epsilon for v in d1) or all(v < -epsilon for v in d1) or all(v > epsilon for v in d2) or all(v < -epsilon for v in d2):
                continue
            direction = cross(n1, n2)
            if norm(direction) < 1e-10 or (norm(direction) < 1e-5 and max(max(abs(v) for v in d1), max(abs(v) for v in d2)) <= epsilon):
                if max(abs(v) for v in d1) > epsilon:
                    continue
                polygon = coplanar_clip(first, second, n1, epsilon)
                assert all(permitted(point) for point in polygon), ("Coplanar self intersection", i, j)
                continue
            direction = tuple(v/norm(direction) for v in direction)
            first_cut, second_cut = plane_cut(first, second[0], n2, epsilon), plane_cut(second, first[0], n1, epsilon)
            if not first_cut or not second_cut:
                continue
            a = [dot(direction, p) for p in first_cut]
            b = [dot(direction, p) for p in second_cut]
            low, high = max(min(a), min(b)), min(max(a), max(b))
            if low > high+epsilon:
                continue
            base = first_cut[0]
            for parameter in [low, high, (low+high)/2]:
                point = tuple(base[k]+direction[k]*(parameter-dot(direction, base)) for k in range(3))
                assert permitted(point), ("Triangle self intersection", i, j, point)
    return tested


def point_triangle_distance(point, face):
    # Closest-point regions of a nondegenerate triangle, Ericson's construction.
    a, b, c = face
    ab, ac, ap = sub(b, a), sub(c, a), sub(point, a)
    d1, d2 = dot(ab, ap), dot(ac, ap)
    if d1 <= 0 and d2 <= 0:
        return norm(ap)
    bp = sub(point, b)
    d3, d4 = dot(ab, bp), dot(ac, bp)
    if d3 >= 0 and d4 <= d3:
        return norm(bp)
    vc = d1*d4-d3*d2
    if vc <= 0 and d1 >= 0 and d3 <= 0:
        t = d1/(d1-d3)
        return norm(sub(ap, tuple(t*v for v in ab)))
    cp = sub(point, c)
    d5, d6 = dot(ab, cp), dot(ac, cp)
    if d6 >= 0 and d5 <= d6:
        return norm(cp)
    vb = d5*d2-d1*d6
    if vb <= 0 and d2 >= 0 and d6 <= 0:
        t = d2/(d2-d6)
        return norm(sub(ap, tuple(t*v for v in ac)))
    va = d3*d6-d5*d4
    if va <= 0 and d4-d3 >= 0 and d5-d6 >= 0:
        t, bc = (d4-d3)/((d4-d3)+(d5-d6)), sub(c, b)
        return norm(sub(bp, tuple(t*v for v in bc)))
    return abs(dot(ap, cross(ab, ac)))/norm(cross(ab, ac))


def samples(faces):
    points = set()
    for face in faces:
        points.update(face)
        points.add(tuple(sum(p[k] for p in face)/3 for k in range(3)))
        for i in range(3):
            points.add(tuple((face[i][k]+face[(i+1) % 3][k])/2 for k in range(3)))
    return points


def js_canonical_json(value):
    """Canonical native geometry JSON, including ECMAScript number notation."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        assert math.isfinite(value)
        if value == 0:
            return "0"
        if float(value).is_integer() and abs(value) < 1e21:
            return str(int(value))
        text = repr(float(value))
        if 1e-6 <= abs(value) < 1e21:
            return format(Decimal(text), "f") if "e" in text else text
        if "e" in text:
            mantissa, exponent = text.split("e")
            exponent = int(exponent)
            return mantissa + "e" + ("+" if exponent >= 0 else "") + str(exponent)
        return text
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, list):
        return "[" + ",".join(js_canonical_json(item) for item in value) + "]"
    assert isinstance(value, dict)
    return "{" + ",".join(js_canonical_json(key) + ":" + js_canonical_json(value[key]) for key in sorted(value)) + "}"


def historical_mesh_digest(source):
    geometry = {"kind": source["kind"], "transform": source["transform"], "mesh": source["mesh"]}
    if "meshRole" in source:
        geometry["meshRole"] = source["meshRole"]
    return hashlib.sha256(js_canonical_json(geometry).encode("utf-8")).hexdigest()


class SurfaceIndex:
    """Independent nearest-triangle search; AABB distances are lower bounds."""
    def __init__(self, faces):
        self.faces = faces
        self.nodes = []
        self.boxes = [(tuple(min(p[k] for p in face) for k in range(3)), tuple(max(p[k] for p in face) for k in range(3))) for face in faces]
        self.root = self.build(list(range(len(faces))))

    def build(self, ids):
        low = tuple(min(self.boxes[i][0][k] for i in ids) for k in range(3))
        high = tuple(max(self.boxes[i][1][k] for i in ids) for k in range(3))
        index = len(self.nodes)
        self.nodes.append(None)
        if len(ids) <= 8:
            self.nodes[index] = (low, high, None, None, ids)
        else:
            axis = max(range(3), key=lambda k: high[k]-low[k])
            ids.sort(key=lambda i: self.boxes[i][0][axis]+self.boxes[i][1][axis])
            middle = len(ids)//2
            left, right = self.build(ids[:middle]), self.build(ids[middle:])
            self.nodes[index] = (low, high, left, right, None)
        return index

    def nearest(self, point):
        def bound(index):
            low, high = self.nodes[index][:2]
            return sum(max(low[k]-point[k], 0, point[k]-high[k])**2 for k in range(3))
        heap, best = [(bound(self.root), self.root)], math.inf
        while heap:
            lower, index = heapq.heappop(heap)
            if lower > best*best:
                break
            _, _, left, right, ids = self.nodes[index]
            if ids is not None:
                for i in ids:
                    best = min(best, point_triangle_distance(point, self.faces[i]))
            else:
                for child in [left, right]:
                    lower = bound(child)
                    if lower <= best*best:
                        heapq.heappush(heap, (lower, child))
        return best


def cast_segment(faces, start, end):
    direction = sub(end, start)
    hits = []
    for a, b, c in faces:
        e1, e2 = sub(b, a), sub(c, a)
        p = cross(direction, e2)
        determinant = dot(e1, p)
        if abs(determinant) < 1e-12:
            continue
        inv = 1/determinant
        q = sub(start, a)
        u = dot(q, p)*inv
        r = cross(q, e1)
        v = dot(direction, r)*inv
        t = dot(e2, r)*inv
        if u >= -1e-9 and v >= -1e-9 and u+v <= 1+1e-9 and -1e-9 <= t <= 1+1e-9:
            if not any(abs(t-old) < 1e-7 for old in hits):
                hits.append(t)
    return sorted(hits)


def inspect_artifacts(report, prefix="source"):
    artifact_file = lambda entry: Path(entry["file"]) if LOCAL else WORK / "MakeSolid" / ("Quelle" if prefix == "source" else "EXE") / entry["name"]
    artifacts = {entry["name"]: artifact_file(entry) for entry in report["syntheticArtifacts"]}
    assert set(artifacts) == {"Make-Solid-Annaeherung.ocad", "Make-Solid-Pruefprojekt.stl", "Make-Solid-Pruefprojekt.zip"}
    for entry in report["syntheticArtifacts"]:
        file = artifact_file(entry)
        assert file.is_absolute() and file.is_file() and not file.is_symlink()
        assert sha(file) == entry["sha256"] and file.stat().st_size == entry["bytes"]
        delivered_identity(file)
    project = json.loads(artifacts["Make-Solid-Annaeherung.ocad"].read_text(encoding="utf-8"))
    assert project["version"] == 8 and len(project["nodes"]) == 3
    nodes = [n for n in project["nodes"] if n.get("meshSource", {}).get("operation", {}).get("type") == "make-solid"]
    assert len(nodes) == 1
    node = nodes[0]
    assert node["meshSource"]["version"] == 3 and len(node["meshSource"]["sources"]) == 1
    source = node["meshSource"]["sources"][0]
    originals = [n for n in project["nodes"] if n["id"] == source["id"]]
    assert len(originals) == 1 and originals[0] == source, "Persisted original differs from its whole archived snapshot"
    assert node["id"] != source["id"] and node["meshRole"] == "solid"
    assert sum(n["kind"] == "cad" for n in project["nodes"]) == 1
    options = node["meshSource"]["operation"]["options"]
    fixture = fixture_data()
    assert fixture["format"] == "FormnaroSyntheticMakeSolidFixture" and fixture["version"] == 1 and fixture["synthetic"]
    assert options["method"] == "voxel-wrap-v1"
    for key, value in fixture["options"].items():
        assert options[key] == value, key
    before, after = triangles(source), triangles(node)
    assert Counter(map(canonical, before)) == Counter(map(canonical, triangles({"mesh": fixture["mesh"]}))), "Original mesh differs from public damaged fixture"
    reference = node["metadata"]["sourceReference"]
    # Historical geometry+pose identity and selected-topology identity are
    # different digest contracts; full source bytes are checked independently.
    assert reference["objectId"] == source["id"] and reference["operation"] == "mesh-edit"
    assert reference["geometryDigest"] == historical_mesh_digest(source), "Historical geometry+pose digest differs from exact source"
    assert len(options["geometryDigest"]) == 64 and all(c in "0123456789abcdef" for c in options["geometryDigest"])
    world_before, world_after = triangles(source, True), triangles(node, True)
    closed_connected(world_after)
    pair_count = no_intersections(world_after, max(options["resolution"], .1))
    assert volume(world_after) > 0 and before != after
    matrix = source["transform"]
    transform = lambda p: tuple(sum(matrix[k+4*j]*p[j] for j in range(3))+matrix[12+k] for k in range(3))
    probes = []
    for x, y in [(0, 0), (.4, 0), (-.4, 0), (0, .4), (0, -.4), (2, 2)]:
        start, end = transform((x, y, -2)), transform((x, y, 10))
        old_hits, new_hits = cast_segment(world_before, start, end), cast_segment(world_after, start, end)
        probes.append({"localXY": [x, y], "originalClear": not old_hits, "newClear": not new_hits, "originalIntersections": len(old_hits), "newIntersections": len(new_hits)})
    assert all(p["originalClear"] for p in probes[:5]), "Original intentional bore is not open"
    assert probes[-1]["originalIntersections"] >= 1, "Independent ray control missed source material"
    source_index, result_index = SurfaceIndex(world_before), SurfaceIndex(world_after)
    original_samples, new_samples = samples(world_before), samples(world_after)
    original_to_new = max(result_index.nearest(point) for point in original_samples)
    new_to_original = max(source_index.nearest(point) for point in new_samples)
    assert all(math.isfinite(value) for value in [original_to_new, new_to_original])
    positions, indices = points(node, True), node["mesh"]["triangles"]
    with zipfile.ZipFile(artifacts["Make-Solid-Pruefprojekt.zip"]) as archive:
        assert archive.testzip() is None
        obj = archive.read("model.obj").decode("utf-8")
    obj_points = [tuple(map(float, line.split()[1:])) for line in obj.splitlines() if line.startswith("v ")]
    obj_indices = [int(value)-1 for line in obj.splitlines() if line.startswith("f ") for value in line.split()[1:]]
    assert obj_points == positions and obj_indices == indices, "Physical OBJ differs from NEW result world geometry"
    stl = artifacts["Make-Solid-Pruefprojekt.stl"].read_text(encoding="utf-8")
    stl_points = [tuple(map(float, line.split()[1:])) for line in stl.splitlines() if line.strip().startswith("vertex ")]
    assert stl_points == [positions[i] for i in indices] and stl.count("facet normal ") == len(indices)//3, "Physical STL differs from NEW result world geometry"
    return {"ok": True, "package25": True, "meshMakeSolid": True, "syntheticOnly": True, "newSolidVerified": True, "originalNodeExact": True, "sourceArchiveExact": True, "newResultId": node["id"], "originalId": source["id"], "sourceSolidProven": False, "sourceVolume": None, "beforeFaces": len(before), "afterFaces": len(after), "closedResults": 1, "resultWorldVolume": volume(world_after), "noSelfIntersections": True, "intersectionPairsChecked": pair_count, "originalBoreAxisClear": probes[0]["originalClear"], "newBoreAxisClear": probes[0]["newClear"], "boreProbes": probes, "sampledComparisonMaximum": max(original_to_new, new_to_original), "originalToNewSampleMaximum": original_to_new, "newToOriginalSampleMaximum": new_to_original, "surfaceSamples": len(original_samples)+len(new_samples), "surfaceDistanceMethod": "Independent BVH nearest-triangle distances at vertices, edge midpoints and centroids in both directions; sampled, not a global bound", "exactStlObjWorldGeometry": True, "exportedFaces": len(indices)//3}

