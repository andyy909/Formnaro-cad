"""Close exact collinear T seams by subdividing existing triangles.

Adapted from Formnaro's cad-stl-repair.js neighbor-splitting approach. Discover
zero-area boundary cycles after STL cleanup, without degenerate helper faces.
One or both sides may have several different subdivisions. Never move or add
a point, merge coordinate identities, or connect separate surface components.
"""
from collections import Counter, defaultdict

import numpy as np
import trimesh


def split_collinear_seams(mesh):
    """Return a copy and the number of additional triangles.

    Repair only exactly straight boundary cycles whose two sides advance
    monotonically between the same endpoints. Existing vertex IDs subdivide
    the opposite side; nearly collinear points and genuine holes are refused.
    Subsequent manifold, winding, volume and deviation checks remain required.
    """
    vertices = np.asarray(mesh.vertices)
    faces = [list(map(int, face)) for face in mesh.faces]
    owners = defaultdict(set)

    def edges(face):
        return [tuple(sorted((face[i], face[(i + 1) % 3]))) for i in range(3)]

    for index, face in enumerate(faces):
        for edge in edges(face):
            owners[edge].add(index)
    # Components use all edge owners, including nonmanifold edges. A zero-area
    # cycle between two separate surfaces is not permission to weld them.
    parent = list(range(len(faces)))

    def root(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    for adjacent in owners.values():
        if len(adjacent) > 1:
            adjacent = iter(adjacent)
            first = next(adjacent)
            for other in adjacent:
                parent[root(other)] = root(first)
    components = [root(index) for index in range(len(faces))]

    def boundary_graph():
        boundary = defaultdict(set)
        for (a, b), adjacent in owners.items():
            if len(adjacent) == 1:
                boundary[a].add(b)
                boundary[b].add(a)
        return boundary

    def commit(changes):
        """Preflight the whole cycle before changing any owner or triangle."""
        delta = Counter()
        for index, replacement in changes.items():
            delta.subtract(edges(faces[index]))
            for face in replacement:
                delta.update(edges(face))
        for edge, change in delta.items():
            old_count = len(owners.get(edge, ()))
            new_count = old_count + change
            if new_count > 2 or new_count < 0 or (change and new_count not in (0, 2)):
                return 0
        added = 0
        for index, replacement in changes.items():
            for edge in edges(faces[index]):
                owners[edge].remove(index)
            for offset, face in enumerate(replacement):
                face_index = index if offset == 0 else len(faces)
                if offset == 0:
                    faces[index] = face
                else:
                    faces.append(face)
                    components.append(components[index])
                    added += 1
                for edge in edges(face):
                    owners[edge].add(face_index)
        return added

    splits = 0
    # Preserve the original three-edge repair, including independent T seams
    # that meet at a boundary branch. Longer cycles below require degree two.
    boundary = boundary_graph()
    for b in sorted(boundary):
        if len(boundary[b]) != 2:
            continue
        a, c = sorted(boundary[b])
        keys = [tuple(sorted(pair)) for pair in ((a, b), (b, c), (a, c))]
        if any(len(owners.get(key, ())) != 1 for key in keys):
            continue
        adjacent = [next(iter(owners[key])) for key in keys]
        if len({components[index] for index in adjacent}) != 1:
            continue
        direction = vertices[c] - vertices[a]
        offset = vertices[b] - vertices[a]
        if np.any(np.cross(direction, offset) != 0):
            continue
        axis = int(np.argmax(np.abs(direction)))
        if not min(vertices[a, axis], vertices[c, axis]) < vertices[b, axis] < max(vertices[a, axis], vertices[c, axis]):
            continue
        index = adjacent[2]
        old = faces[index]
        if b in old:
            continue
        for corner in range(3):
            x, y, z = old[corner:] + old[:corner]
            if tuple(sorted((x, y))) == keys[2]:
                break
        splits += commit({index: [[x, b, z], [b, y, z]]})

    boundary = boundary_graph()
    visited = set()
    for start in sorted(boundary):
        if start in visited:
            continue
        connected, todo = [], [start]
        visited.add(start)
        while todo:
            current = todo.pop()
            connected.append(current)
            for other in boundary[current]:
                if other not in visited:
                    visited.add(other)
                    todo.append(other)
        if len(connected) < 4 or any(len(boundary[v]) != 2 for v in connected):
            continue

        # Order a simple cycle once. Branches and self-touching cycles are
        # deliberately skipped, avoiding path enumeration on damaged meshes.
        cycle = [start]
        previous, current = start, min(boundary[start])
        while current != start:
            cycle.append(current)
            following = next(v for v in boundary[current] if v != previous)
            previous, current = current, following
        points = vertices[cycle]
        axis = int(np.argmax(np.ptp(points, axis=0)))
        low, high = int(np.argmin(points[:, axis])), int(np.argmax(points[:, axis]))
        direction = points[high] - points[low]
        if not np.any(direction) or np.any(np.cross(direction, points - points[low]) != 0):
            continue
        ordered = sorted(cycle, key=lambda v: vertices[v, axis])
        # Coincident coordinates with distinct IDs can represent a legitimate
        # contact. This repair never chooses an ID to merge that contact into.
        if np.any(np.diff(vertices[ordered, axis]) <= 0):
            continue
        cycle = cycle[low:] + cycle[:low]
        high = cycle.index(ordered[-1])
        paths = (cycle[:high + 1], [cycle[0]] + list(reversed(cycle[high:])))
        if any(np.any(np.diff(vertices[path, axis]) <= 0) for path in paths):
            continue
        keys = [tuple(sorted((cycle[i], cycle[(i + 1) % len(cycle)])))
                for i in range(len(cycle))]
        adjacent = [next(iter(owners[key])) for key in keys]
        if (len(set(adjacent)) != len(adjacent)
                or len({components[index] for index in adjacent}) != 1):
            continue

        positions = {vertex: position for position, vertex in enumerate(ordered)}
        changes = {}
        for (a, b), index in zip(keys, adjacent):
            lo, hi = sorted((positions[a], positions[b]))
            if hi - lo < 2:
                continue
            old = faces[index]
            for corner in range(3):
                x, y, z = old[corner:] + old[:corner]
                if tuple(sorted((x, y))) == (a, b):
                    break
            sequence = ordered[lo:hi + 1]
            if sequence[0] != x:
                sequence = list(reversed(sequence))
            changes[index] = [[left, right, z] for left, right in zip(sequence, sequence[1:])]
        splits += commit(changes)
    if not splits:
        return mesh.copy(), 0
    result = trimesh.Trimesh(vertices.copy(), np.asarray(faces), process=False,
                             metadata=mesh.metadata.copy())
    return result, splits
