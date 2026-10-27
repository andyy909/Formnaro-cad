"""Whole-body quadric hypotheses; acceptance belongs to engine.check_candidate.

Fits are proposals only. A sphere through mesh vertices, for example, says
nothing about the distance of the intervening STL triangles to that sphere.
"""
import cadquery as cq
import numpy as np


def primitive_candidates(mesh, tolerance):
    """Yield (shape, label, details) for tightly fitting spheres/ellipsoids."""
    if mesh.metadata.get("preserve_vertex_identity") or mesh.euler_number != 2:
        return
    points = np.asarray(mesh.vertices)
    if len(points) < 20:
        return
    origin = np.asarray(mesh.bounds).mean(axis=0)
    scale = float(np.max(mesh.extents)) / 2
    if scale <= 1e-8:
        return
    p = (points - origin) / scale
    # Use every vertex for residuals; fit on a bounded deterministic subset.
    fit = p[np.linspace(0, len(p) - 1, min(len(p), 6000), dtype=int)]
    matrix = np.column_stack((2 * fit, np.ones(len(fit))))
    values, _, rank, _ = np.linalg.lstsq(matrix, np.sum(fit * fit, axis=1), rcond=None)
    if rank == 4:
        centre = values[:3]
        distances = np.linalg.norm(p - centre, axis=1)
        radius = float(distances.mean()) * scale
        residual = float(np.max(np.abs(distances * scale - radius)))
        if radius > 1e-8 and residual <= min(tolerance * .08, radius * .001):
            world = origin + centre * scale
            probe_error = float(np.max(np.abs(np.linalg.norm(mesh.triangles_center - world, axis=1) - radius)))
            if probe_error <= tolerance * .9:
                shape = cq.Solid.makeSphere(radius, tuple(world), angleDegrees1=-90, angleDegrees2=90)
                yield shape, "Erkannte Kugel", {"primitive": "sphere", "radius_mm": radius,
                                               "vertex_fit_max_mm": residual,
                                               "mesh_probe_lower_bound_mm": probe_error}

    x, y, z = fit.T
    design = np.column_stack((x*x, y*y, z*z, 2*x*y, 2*x*z, 2*y*z, x, y, z))
    coefficients, _, rank, singular = np.linalg.lstsq(design, np.ones(len(fit)), rcond=None)
    if rank != 9 or singular[-1] <= singular[0] * 1e-6:
        return
    a, b, c, d, e, f = coefficients[:6]
    q = np.array([[a, d, e], [d, b, f], [e, f, c]])
    if np.min(np.linalg.eigvalsh(q)) <= 1e-8:
        return
    centre = -.5 * np.linalg.solve(q, coefficients[6:])
    level = 1 + centre @ q @ centre
    if level <= 0:
        return
    eigenvalues, rotation = np.linalg.eigh(q / level)
    axes = scale / np.sqrt(eigenvalues)
    if axes.min() < 1e-6 or axes.max() / axes.min() > 20:
        return
    if axes.max() / axes.min() < 1.0001:
        return  # The exact spherical surface above is preferable.
    local = (p - centre) @ rotation
    normalized = local * scale / axes
    lengths = np.linalg.norm(normalized, axis=1)
    if np.any(lengths < 1e-12):
        return
    # Radial projection supplies a direct world-space fit residual.
    projected = local * scale / lengths[:, None]
    residual = float(np.linalg.norm(local * scale - projected, axis=1).max())
    if residual > min(tolerance * .08, float(axes.min()) * .001):
        return
    probe = ((np.asarray(mesh.triangles_center) - origin) / scale - centre) @ rotation
    # Lower bound from the scaled norm's Lipschitz constant; cheaply discard
    # impossible coarse-mesh fits before an excessively fine CAD tessellation.
    lower_bound = float(np.max(np.abs(np.linalg.norm(probe * scale / axes, axis=1) - 1)) * axes.min())
    if lower_bound > tolerance * .9:
        return
    if np.linalg.det(rotation) < 0:
        rotation[:, 0] *= -1
    matrix = np.eye(4)
    matrix[:3, :3] = rotation @ np.diag(axes)
    matrix[:3, 3] = origin + centre * scale
    sphere = cq.Solid.makeSphere(1, angleDegrees1=-90, angleDegrees2=90)
    ellipsoid = sphere.transformGeometry(cq.Matrix(matrix.tolist()))
    yield ellipsoid, "Erkanntes Ellipsoid", {"primitive": "ellipsoid", "semiaxes_mm": axes.tolist(),
                                           "vertex_fit_max_mm": residual,
                                           "mesh_probe_lower_bound_mm": lower_bound}
