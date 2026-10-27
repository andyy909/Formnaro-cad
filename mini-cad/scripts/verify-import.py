"""Independent STL reader: no Formnaro/meshoptimizer implementation is imported."""
import json
import sys
from pathlib import Path
import numpy as np

directory = Path(sys.argv[1])
report = json.loads((directory / 'import-report.json').read_text(encoding='utf-8'))
data=(directory / 'Arbeitskopie.stl').read_bytes()
import struct
count=struct.unpack_from('<I',data,80)[0]
assert len(data)==84+count*50
record=np.dtype({'names':['vertices'],'formats':[('<f4',(3,3))],'offsets':[12],'itemsize':50})
coordinates=np.frombuffer(data,dtype=record,count=count,offset=84)['vertices'].reshape((-1,3)).astype(np.float64)
assert len(coordinates) and len(coordinates) % 3 == 0
points, indices = np.unique(np.asarray(coordinates, dtype=np.float64), axis=0, return_inverse=True)
faces = indices.reshape((-1, 3))
assert len(faces) == report['outputTriangles'] <= 500000
edges = np.concatenate((faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]))
_, owners, counts = np.unique(np.sort(edges, axis=1), axis=0, return_inverse=True, return_counts=True)
assert np.all(counts == 2), 'STL has open or nonmanifold edges'
orientation = np.bincount(owners, weights=np.where(edges[:, 0] < edges[:, 1], 1, -1))
assert np.all(orientation == 0), 'STL has conflicting winding'
triangles = points[faces]
cross = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
assert np.all(np.linalg.norm(cross, axis=1) > 0), 'STL has degenerate facets'
origin = points[0]
volume = np.einsum('ij,ij->i', triangles[:, 0] - origin, cross).sum() / 6
assert abs(volume - 8000) < .001, volume
extent = points.max(axis=0) - points.min(axis=0)
assert np.allclose(extent, [20, 20, 20], atol=1e-6, rtol=0), extent
euler = len(points) - len(counts) + len(faces)
assert euler == 2, euler
result = {'ok': True, 'reader': 'independent Python/numpy exact-coordinate STL reader',
          'triangles': len(faces), 'vertices': len(points), 'edges': len(counts),
          'volumeMm3': float(volume), 'extentMm': extent.tolist(), 'euler': euler,
          'closedOrientedEdges': True, 'selfIntersections': 'not-checked'}
(directory / 'independent.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result))
