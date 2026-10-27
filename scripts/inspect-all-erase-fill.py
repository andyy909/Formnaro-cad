# Independent synthetic physical geometry checker promoted from the accepted local erase-fill proof.
"""Independent P24 physical-file checks; stdlib only, no application geometry imports.

Use locally after source/EXE verification, or from Pruefnachweise in an extracted
delivery. Only explicit synthetic artifact paths are read; no user folders scanned.
"""
from collections import Counter, defaultdict, deque
from pathlib import Path
import hashlib
import json
import math
import sys
import zipfile

HERE = Path(__file__).resolve().parent
LOCAL = True
WORK = Path(__file__).resolve().parents[1] / "work/mesh-erase-fill/checks"
sha = lambda file: hashlib.sha256(Path(file).read_bytes()).hexdigest()
sub = lambda a, b: tuple(x-y for x, y in zip(a, b))
dot = lambda a, b: sum(x*y for x, y in zip(a, b))
cross = lambda a, b: (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
norm = lambda a: math.sqrt(dot(a, a))
mix = lambda a, b, t: tuple(x+(y-x)*t for x, y in zip(a, b))
canonical = lambda face: min(tuple(face[i:]+face[:i]) for i in range(3))

if not LOCAL:
    delivered = json.loads((WORK.parent / "Paket-Pruefung.json").read_text(encoding="utf-8"))
    assert delivered["package24"] and delivered["meshEraseFill"] and not delivered["includesUserData"]
    delivered_files = {entry["file"]: entry for entry in delivered["files"]}


def delivered_identity(file):
    if LOCAL:
        return
    entry = delivered_files[file.relative_to(WORK.parent).as_posix()]
    assert file.is_file() and not file.is_symlink()
    assert file.stat().st_size == entry["bytes"] and sha(file) == entry["sha256"]


def fixture_data():
    if LOCAL:
        return json.loads((WORK.parents[2] / "backend/mesh-erase-fill-fixture.json").read_text(encoding="utf-8"))
    sources = [name for name in delivered_files if name.startswith("Formnaro-Quellcode-v") and name.endswith(".zip")]
    assert len(sources) == 1
    file = WORK.parent / sources[0]
    delivered_identity(file)
    with zipfile.ZipFile(file) as archive:
        return json.loads(archive.read("backend/mesh-erase-fill-fixture.json"))


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


def no_intersections(faces):
    """Independent triangle/plane interval and coplanar polygon clipping.

    Shared original mesh edges/vertices may touch; any contact outside that
    shared simplex is rejected. AABBs only prune impossible pairs.
    """
    epsilon = 1e-8
    normals = [normal(face) for face in faces]
    bounds = [(tuple(min(p[k] for p in face) for k in range(3)), tuple(max(p[k] for p in face) for k in range(3))) for face in faces]
    tested = 0
    for i, first in enumerate(faces):
        for j in range(i):
            second = faces[j]
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
            if norm(direction) < 1e-10:
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


def inspect_artifacts(report, prefix="source"):
    artifact_file = lambda entry: Path(entry["file"]) if LOCAL else WORK / "BereicheErsetzen" / ("Quelle" if prefix == "source" else "EXE") / entry["name"]
    artifacts = {entry["name"]: artifact_file(entry) for entry in report["syntheticArtifacts"]}
    assert set(artifacts) == {"Ersetzte-Platte.ocad", "Bereiche-Ersetzen-Pruefprojekt.stl", "Bereiche-Ersetzen-Pruefprojekt.zip"}
    for entry in report["syntheticArtifacts"]:
        file = artifact_file(entry)
        assert file.is_absolute() and file.is_file() and not file.is_symlink()
        assert sha(file) == entry["sha256"] and file.stat().st_size == entry["bytes"]
        delivered_identity(file)
    project = json.loads(artifacts["Ersetzte-Platte.ocad"].read_text(encoding="utf-8"))
    assert project["version"] == 8
    nodes = [node for node in project["nodes"] if node.get("meshSource", {}).get("operation", {}).get("type") == "erase-fill"]
    assert len(nodes) == 1
    node = nodes[0]
    assert node["meshSource"]["version"] == 3 and len(node["meshSource"]["sources"]) == 1
    original = node["meshSource"]["sources"][0]
    options = node["meshSource"]["operation"]["options"]
    fixture = fixture_data()
    assert fixture["format"] == "FormnaroSyntheticEraseFillFixture" and fixture["version"] == 1 and fixture["synthetic"]
    assert options["method"] == "planar-replace-v1"
    before, after = triangles(original), triangles(node)
    fixture_faces = triangles({"mesh": fixture["mesh"]})
    assert Counter(map(canonical, before)) == Counter(map(canonical, fixture_faces)), "Damaged original differs from public synthetic fixture"
    assert node["mesh"]["verts"] == original["mesh"]["verts"], "Whole original vertex array changed"
    selected = set(options["triangleIds"])
    assert len(selected) == len(options["triangleIds"]) == 288
    assert Counter(canonical(before[i]) for i in selected) == Counter(canonical(fixture_faces[i]) for i in fixture["triangleIds"]), "Different selected patch"
    assert sum(normal(before[i])[2] < 0 for i in selected) == 2, "Original deliberate orientation damage was not retained"
    kept_ids = [i for i in range(len(before)) if i not in selected]
    outside = [before[i] for i in kept_ids]
    assert len(outside) == 384 and after[:len(outside)] == outside, "Outside ordered faces changed"
    caps = after[len(outside):]
    assert len(after) == 430 and len(caps) == 46
    assert all(p[2] == 4 for face in caps for p in face), "Replacement is not the fixed rim plane z4"
    assert all(normal(face)[2] > 1-1e-10 for face in caps), "Replacement face orientation incorrect"
    cap_area = sum(norm(cross(sub(b, a), sub(c, a)))/2 for a, b, c in caps)
    assert abs(cap_area-400) < 1e-8, "Replacement does not cover the full selected domain"
    def boundary(faces):
        edges = Counter(tuple(sorted((face[i], face[(i+1) % 3]))) for face in faces for i in range(3))
        assert all(count in (1, 2) for count in edges.values())
        return {edge for edge, count in edges.items() if count == 1}
    original_boundary, new_boundary = boundary([before[i] for i in selected]), boundary(caps)
    assert len(original_boundary) == 48 and original_boundary == new_boundary, "Exact segmented rim changed"
    old_regions, regions = original["metadata"]["meshProtection"]["regions"], node["metadata"]["meshProtection"]["regions"]
    assert len(old_regions) == len(regions) == 1
    protected = set()
    for old, new in zip(old_regions, regions):
        for key in ["id", "name", "purpose"]:
            assert old[key] == new[key], key
        assert new["triangleIds"] == [kept_ids.index(i) for i in old["triangleIds"]]
        protected.update(old["triangleIds"])
        assert [before[i] for i in old["triangleIds"]] == [after[i] for i in new["triangleIds"]], "Protected face coordinates changed"
    assert Counter(canonical(before[i]) for i in protected) == Counter(canonical(fixture_faces[i]) for i in fixture["protectedTriangleIds"])
    for key in ["id", "name", "transform", "color", "opacity", "layerId", "folderId"]:
        assert node.get(key) == original.get(key), key
    for key in ["sourceReference", "notes"]:
        assert node["metadata"][key] == original["metadata"][key], key
    world_before, world_after = triangles(original, True), triangles(node, True)
    closed_connected(world_after)
    pairs = no_intersections(world_after)
    assert abs(volume(after)-1600) < 1e-7
    old_patch = [world_before[i] for i in sorted(selected)]
    world_caps = world_after[len(outside):]
    def sampled_distance(source, target):
        sampled = samples(source)
        return max(min(point_triangle_distance(point, face) for face in target) for point in sampled), len(sampled)
    forward, forward_count = sampled_distance(old_patch, world_caps)
    reverse, reverse_count = sampled_distance(world_caps, old_patch)
    assert forward > .1 and all(math.isfinite(value) for value in [forward, reverse])
    result_points, indices = points(node, True), node["mesh"]["triangles"]
    with zipfile.ZipFile(artifacts["Bereiche-Ersetzen-Pruefprojekt.zip"]) as archive:
        assert archive.testzip() is None
        obj = archive.read("model.obj").decode("utf-8")
    obj_points = [tuple(map(float, line.split()[1:])) for line in obj.splitlines() if line.startswith("v ")]
    obj_indices = [int(value)-1 for line in obj.splitlines() if line.startswith("f ") for value in line.split()[1:]]
    assert obj_points == result_points and obj_indices == indices, "Physical OBJ differs from confirmed world geometry"
    stl = artifacts["Bereiche-Ersetzen-Pruefprojekt.stl"].read_text(encoding="utf-8")
    stl_points = [tuple(map(float, line.split()[1:])) for line in stl.splitlines() if line.strip().startswith("vertex ")]
    assert stl_points == [result_points[i] for i in indices] and stl.count("facet normal ") == len(indices)//3, "Physical STL differs from confirmed world geometry"
    assert sum(n["kind"] == "cad" for n in project["nodes"]) == 1
    return {"ok": True, "package24": True, "meshEraseFill": True, "syntheticOnly": True, "replacementVerified": True, "beforeFaces": len(before), "afterFaces": len(after), "removedFaces": len(selected), "replacementFaces": len(caps), "wholeVertexArrayExact": True, "outsideSelectionExact": True, "outsideOrderedFaces": len(outside), "rimEdgesExact": True, "rimEdges": len(new_boundary), "replacementPlaneZ": 4, "replacementArea": cap_area, "protectedFacesExact": True, "protectedTriangles": len(protected), "maskIdentityAndRemappingExact": True, "originalAndMetadataRetained": True, "sourceSolidProven": False, "sourceVolume": None, "sourceHasTwoReversedFacets": True, "closedResults": 1, "resultLocalVolume": volume(after), "resultWorldVolume": volume(world_after), "noSelfIntersections": True, "intersectionPairsChecked": pairs, "sampledSelectedDeviation": max(forward, reverse), "originalToReplacementSampleMaximum": forward, "replacementToOriginalSampleMaximum": reverse, "surfaceSamples": forward_count+reverse_count, "surfaceDistanceMethod": "Independent nearest-triangle distances at selected/replacement vertices, edge midpoints and centroids in both directions; sampled, not a global bound", "exactStlObjWorldGeometry": True, "exportedFaces": len(indices)//3}

