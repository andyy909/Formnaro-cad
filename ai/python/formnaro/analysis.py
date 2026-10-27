"""Local numerical analysis and persistent reusable tools. Host access is absent."""
import json
import types
import numpy as np
from scipy.spatial import cKDTree
from scipy.optimize import least_squares
import trimesh


class Workspace:
    async def _query(self, kind, **options):
        import formnaro
        return await formnaro._rpc('query', {'engine': 'workspace', 'kind': kind, 'options': options})

    async def list(self):
        return await self._query('files', action='list')

    async def read_text(self, path):
        return await self._query('files', action='read', path=path)

    async def write_text(self, path, text):
        return await self._query('files', action='write', path=path, text=text)

    async def read_json(self, path):
        return json.loads(await self.read_text(path))

    async def write_json(self, path, value):
        return await self.write_text(path, json.dumps(value, allow_nan=False))

    async def tools(self, search='', offset=0, limit=20):
        return await self._query('tools', action='search', search=search, offset=offset, limit=limit)

    async def read_tool(self, revision):
        return await self._query('tools', action='read', revision=revision)

    async def save_tool(self, name, code, description='', tags=None):
        return await self._query('tools', action='save', tool={'name': name, 'language': 'python', 'code': code, 'description': description, 'tags': tags or []})

    async def import_tool(self, revision):
        saved = await self.read_tool(revision)
        if saved['tool']['language'] != 'python':
            raise ValueError('Choose a Python tool')
        module = types.ModuleType('formnaro_saved_tool')
        exec(compile(saved['tool']['code'], '<Saved Formnaro tool>', 'exec'), module.__dict__)
        return module


workspace = Workspace()


def mesh(node, world=True):
    """Original vertices/faces from model.snapshot(); no silent topology repair."""
    data = node['mesh']
    vertices = np.asarray(data['verts'], dtype=float).reshape(-1, 3)
    if world:
        matrix = np.asarray(node['transform'], dtype=float).reshape(4, 4).T
        vertices = trimesh.transform_points(vertices, matrix)
    return trimesh.Trimesh(vertices=vertices, faces=np.asarray(data['triangles']).reshape(-1, 3), process=False)


def fit_circle(points):
    """2D least-squares fit, reporting measured residuals rather than a guarantee."""
    p = np.asarray(points, dtype=float)
    if p.ndim != 2 or p.shape[1] != 2 or len(p) < 3 or not np.isfinite(p).all():
        raise ValueError('At least three finite 2D points required')
    if np.linalg.matrix_rank(p - p.mean(axis=0)) < 2:
        raise ValueError('Collinear points do not define a circle')
    x = np.linalg.lstsq(np.c_[2*p, np.ones(len(p))], (p*p).sum(axis=1), rcond=None)[0]
    fit = least_squares(lambda c: np.linalg.norm(p-c[:2], axis=1)-c[2], [*x[:2], np.sqrt(max(0, x[2]+x[0]**2+x[1]**2))])
    residual = np.abs(fit.fun)
    return {'center': fit.x[:2].tolist(), 'radius': float(fit.x[2]), 'diameter': float(2*fit.x[2]), 'maximumResidual': float(residual.max()), 'rms': float(np.sqrt((residual**2).mean())), 'pointCount': len(p), 'globalGuarantee': False}


def closest_surface(surface, points):
    """Exact nearest triangle for each supplied point, without optional libspatialindex.

    A centroid KD-tree provides a conservative candidate set: a triangle closer
    than the incumbent must have its centroid within incumbent+maximum radius.
    This proves only distances for the supplied points, not a global Hausdorff bound.
    """
    triangles = surface.triangles
    if not len(triangles):
        raise ValueError('A nonempty triangle mesh is required')
    centers = triangles.mean(axis=1)
    radius = np.linalg.norm(triangles-centers[:, None, :], axis=2).max()
    tree = cKDTree(centers)
    points = np.asarray(points, dtype=float).reshape(-1, 3)
    nearest, distances, indices = [], [], []
    for p in points:
        _, index = tree.query(p)
        start = trimesh.triangles.closest_point(triangles[index:index+1], p[None, :])[0]
        bound = np.linalg.norm(start-p)
        candidates = np.asarray(tree.query_ball_point(p, bound+radius+1e-10), dtype=int)
        best, best_distance, best_index = start, bound, int(index)
        for offset in range(0, len(candidates), 4096):
            ids = candidates[offset:offset+4096]
            q = trimesh.triangles.closest_point(triangles[ids], np.broadcast_to(p, (len(ids), 3)))
            d = np.linalg.norm(q-p, axis=1)
            i = int(d.argmin())
            if d[i] < best_distance:
                best, best_distance, best_index = q[i], float(d[i]), int(ids[i])
        nearest.append(best); distances.append(best_distance); indices.append(best_index)
    return np.asarray(nearest), np.asarray(distances), np.asarray(indices)
