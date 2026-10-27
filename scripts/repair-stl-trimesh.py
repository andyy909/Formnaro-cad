"""Optional offline STL repair. Originals remain untouched; no CAD guarantee."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import trimesh


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def describe(mesh):
    edges = mesh.edges_sorted
    counts = np.unique(edges, axis=0, return_counts=True)[1] if len(edges) else np.array([])
    return dict(vertices=len(mesh.vertices), faces=len(mesh.faces),
                watertight=bool(mesh.is_watertight), windingConsistent=bool(mesh.is_winding_consistent),
                boundaryEdges=int(np.sum(counts == 1)), nonManifoldEdges=int(np.sum(counts > 2)),
                components=int(mesh.body_count) if len(mesh.faces) else 0,
                bounds=mesh.bounds.tolist() if len(mesh.faces) else None,
                signedVolume=float(mesh.volume) if len(mesh.faces) else 0.,
                euler=int(mesh.euler_number))


def resolve_collinear_edges(mesh, degenerate_faces):
    """Formnaro-specific repair: split a long neighboring edge at its existing point.

    Trimesh's generic cleanup does not resolve this zero-area T-junction.
    Only exact collinearity and three singly incident boundary edges are accepted.
    """
    faces = mesh.faces.tolist()
    repaired = 0
    for indices in degenerate_faces:
        if len(set(indices)) != 3:
            continue
        points = mesh.vertices[indices]
        lengths = [np.linalg.norm(points[(i + 1) % 3] - points[i]) for i in range(3)]
        start = int(np.argmax(lengths))
        a, c, b = indices[start], indices[(start + 1) % 3], indices[(start + 2) % 3]
        p, q, middle = mesh.vertices[[a, c, b]]
        if not np.all(np.cross(q - p, middle - p) == 0):
            continue
        if not 0 < np.dot(middle - p, q - p) < np.dot(q - p, q - p):
            continue
        def attached(x, y):
            return [i for i, face in enumerate(faces) if x in face and y in face]
        long_faces = attached(a, c)
        if len(long_faces) != 1 or len(attached(a, b)) != 1 or len(attached(b, c)) != 1:
            continue
        index = long_faces[0]
        face = faces[index]
        if b in face:
            continue
        for j in range(3):
            x, y, opposite = face[j], face[(j + 1) % 3], face[(j + 2) % 3]
            if {x, y} == {a, c}:
                faces[index] = [x, b, opposite]
                faces.append([b, y, opposite])
                repaired += 1
                break
    return trimesh.Trimesh(vertices=mesh.vertices, faces=faces, process=False), repaired


def repair(mesh, fill_small_holes=False, resolve_collinear=False):
    if not len(mesh.faces) or not np.isfinite(mesh.vertices).all():
        raise ValueError('Empty mesh or non-finite coordinates cannot be repaired.')
    result = mesh.copy()
    # Exact welding: do not round coordinates or merge nearby walls.
    vertices, inverse = np.unique(result.vertices, axis=0, return_inverse=True)
    result = trimesh.Trimesh(vertices=vertices, faces=inverse[result.faces], process=False)
    before = describe(result)
    cross = np.cross(result.triangles[:, 1] - result.triangles[:, 0],
                     result.triangles[:, 2] - result.triangles[:, 0])
    keep = np.linalg.norm(cross, axis=1) >= 1e-12
    removed_degenerate = int(np.sum(~keep))
    degenerate_faces = result.faces[~keep].copy()
    result.update_faces(keep)
    # Duplicate triangles are removed irrespective of winding, without moving vertices.
    _, indices = np.unique(np.sort(result.faces, axis=1), axis=0, return_index=True)
    removed_duplicates = len(result.faces) - len(indices)
    result.update_faces(np.sort(indices))
    resolved = 0
    if resolve_collinear:
        result, resolved = resolve_collinear_edges(result, degenerate_faces)
    result.remove_unreferenced_vertices()
    if not len(result.faces):
        raise ValueError('No usable triangles remain after cleanup.')
    old_faces = result.faces.copy()
    trimesh.repair.fix_normals(result, multibody=True)
    flipped = int(np.sum(np.any(old_faces != result.faces, axis=1)))
    count = len(result.faces)
    if fill_small_holes:
        # Default Trimesh fills triangular/quadrilateral loops; no arbitrary fans.
        trimesh.repair.fill_holes(result, use_fan=False)
        trimesh.repair.fix_normals(result, multibody=True)
    added = len(result.faces) - count
    after = describe(result)
    report = dict(before=before, after=after, removedDegenerateFaces=removed_degenerate,
                  removedDuplicateFaces=int(removed_duplicates), flippedFaces=flipped,
                  addedFaces=added, splitNeighborFaces=resolved,
                  collinearResolutionRequested=resolve_collinear,
                  holeFillingRequested=fill_small_holes,
                  coordinatesMoved=False, surfaceAdded=added > 0,
                  boundsMaxChange=float(np.max(np.abs(np.array(before['bounds']) - result.bounds))),
                  candidateClosedSingleBody=bool(after['watertight'] and after['windingConsistent']
                                                 and after['components'] == 1
                                                 and after['nonManifoldEdges'] == 0),
                  nativeCadValidated=False, selfIntersectionsValidated=False)
    # A signed volume is not a reliable material-volume measurement on an open mesh.
    report['relativeVolumeChange'] = (abs(abs(after['signedVolume']) / abs(before['signedVolume']) - 1)
                                     if before['watertight'] and before['windingConsistent']
                                     and after['watertight'] and abs(before['signedVolume']) > 1e-9
                                     else None)
    return result, report


def write_ascii_stl(mesh, target):
    # Binary STL would quantize to float32; retain input coordinates as doubles.
    with target.open('x', encoding='ascii', newline='\n') as stream:
        stream.write('solid repaired\n')
        for normal, triangle in zip(mesh.face_normals, mesh.triangles):
            stream.write('facet normal ' + ' '.join(format(float(x), '.17g') for x in normal) + '\nouter loop\n')
            for point in triangle:
                stream.write('vertex ' + ' '.join(format(float(x), '.17g') for x in point) + '\n')
            stream.write('endloop\nendfacet\n')
        stream.write('endsolid repaired\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--report', required=True)
    parser.add_argument('--fill-small-holes', action='store_true',
                        help='Explicitly allow adding faces across triangular/quadrilateral gaps.')
    parser.add_argument('--resolve-collinear', action='store_true',
                        help='Formnaro-specific exact edge split for isolated collinear zero-area faces.')
    args = parser.parse_args()
    source, output, report_file = (Path(x).resolve() for x in [args.source, args.output, args.report])
    if len({source, output, report_file}) != 3 or output.exists() or report_file.exists():
        parser.error('Source, new output and new report must be distinct; output files must not exist.')
    source_hash = digest(source)
    mesh = trimesh.load_mesh(source, process=False)
    repaired, report = repair(mesh, args.fill_small_holes, args.resolve_collinear)
    output.parent.mkdir(parents=True, exist_ok=True)
    report_file.parent.mkdir(parents=True, exist_ok=True)
    write_ascii_stl(repaired, output)
    if digest(source) != source_hash:
        raise RuntimeError('Source changed while running repair.')
    report.update(trimeshVersion=trimesh.__version__, sourceSha256=source_hash,
                  outputSha256=digest(output), sourceUnchanged=True)
    report_file.write_text(json.dumps(report, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    print(json.dumps({key: report[key] for key in ['candidateClosedSingleBody',
                     'removedDegenerateFaces', 'removedDuplicateFaces', 'flippedFaces',
                     'addedFaces', 'boundsMaxChange', 'sourceUnchanged']}))


if __name__ == '__main__':
    main()
