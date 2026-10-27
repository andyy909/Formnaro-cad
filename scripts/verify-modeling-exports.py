"""Independently read modeling STEP/STL/project exports with an isolated FreeCAD."""
import argparse
import collections
import hashlib
import json
import math
import os
import pathlib
import re
import struct
import subprocess
import tempfile
import traceback
import uuid

PROOF_ENV = 'FORMNARO_MODELING_PROOF'
RUN_ENV = 'FORMNARO_MODELING_PROOF_RUN'
NAMES = ('offset', 'shell', 'loft', 'sweep')
KINDS = {'offset': 'face-offset', 'shell': 'shell', 'loft': 'loft', 'sweep': 'sweep'}


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def positive(value, name):
    require(isinstance(value, (int, float)) and not isinstance(value, bool)
            and math.isfinite(value) and value > 0, 'Invalid ' + name)
    return float(value)


def close(actual, expected, tolerance, label):
    require(math.isfinite(actual) and abs(actual - expected) <= tolerance,
            '%s: actual=%r expected=%r tolerance=%r' % (label, actual, expected, tolerance))


def bounds_close(actual, expected, tolerance, label):
    for side in range(2):
        for axis in range(3):
            close(actual[side][axis], expected[side][axis], tolerance,
                  '%s[%d][%d]' % (label, side, axis))


def file_record(path):
    raw = path.read_bytes()
    return {'name': path.name, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}


def read_stl(path):
    """Standard-library reader: exact vertices, edge adjacency and signed volume."""
    raw = path.read_bytes()
    count = struct.unpack_from('<I', raw, 80)[0] if len(raw) >= 84 else -1
    if count >= 0 and len(raw) == 84 + 50 * count:
        require(0 < count <= 2_000_000, path.name + ': invalid binary triangle count')
        triangles = [[struct.unpack_from('<fff', raw, 84 + i * 50 + 12 + k * 12)
                      for k in range(3)] for i in range(count)]
        encoding = 'binary'
    else:
        text = raw.decode('ascii')
        require(text.lstrip().lower().startswith('solid'), path.name + ': invalid ASCII STL')
        points = [tuple(float(value) for value in match)
                  for match in re.findall(r'\bvertex\s+(\S+)\s+(\S+)\s+(\S+)', text)]
        require(len(points) > 0 and len(points) % 3 == 0,
                path.name + ': incomplete ASCII triangles')
        require(len(points) <= 6_000_000, path.name + ': ASCII triangle budget exceeded')
        triangles = [points[index:index + 3] for index in range(0, len(points), 3)]
        require(len(re.findall(r'\bendfacet\b', text, re.I)) == len(triangles),
                path.name + ': ASCII facet count mismatch')
        encoding = 'ascii'

    require(all(math.isfinite(value) for tri in triangles for point in tri for value in point),
            path.name + ': nonfinite vertices')
    bounds = [[min(point[k] for tri in triangles for point in tri) for k in range(3)],
              [max(point[k] for tri in triangles for point in tri) for k in range(3)]]
    origin = tuple((bounds[0][k] + bounds[1][k]) / 2 for k in range(3))
    ids, edges, signed, areas = {}, collections.defaultdict(list), [], []
    parents = list(range(len(triangles)))

    def find(index):
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    for index, tri in enumerate(triangles):
        vertices = [ids.setdefault(tuple(point), len(ids)) for point in tri]
        require(len(set(vertices)) == 3, path.name + ': repeated triangle vertex')
        a, b, c = [tuple(point[k] - origin[k] for k in range(3)) for point in tri]
        u, v = [tuple(point[k] - a[k] for k in range(3)) for point in (b, c)]
        normal = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2],
                  u[0] * v[1] - u[1] * v[0])
        area = math.hypot(*normal) / 2
        require(math.isfinite(area) and area > 0, path.name + ': degenerate triangle')
        areas.append(area)
        signed.append((a[0] * (b[1] * c[2] - b[2] * c[1])
                       + a[1] * (b[2] * c[0] - b[0] * c[2])
                       + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6)
        for k in range(3):
            start, end = vertices[k], vertices[(k + 1) % 3]
            edges[tuple(sorted((start, end)))].append((index, start, end))
    for records in edges.values():
        require(len(records) == 2 and records[0][1:] == records[1][1:][::-1],
                path.name + ': open, nonmanifold or inconsistently oriented edge')
        parents[find(records[0][0])] = find(records[1][0])
    components = len({find(index) for index in range(len(triangles))})
    require(components == 1, path.name + ': expected one edge-connected component')
    volume = math.fsum(signed)
    require(math.isfinite(volume) and volume > 0, path.name + ': nonpositive volume')
    return {'encoding': encoding, 'triangles': len(triangles), 'vertices': len(ids),
            'edges': len(edges), 'components': components, 'closed': True,
            'oriented': True, 'volume': volume, 'surfaceArea': math.fsum(areas),
            'bounds': bounds}


def read_project(path, name, expected):
    project = json.loads(path.read_text(encoding='utf-8-sig'))
    require(project.get('version') == 11, path.name + ': expected project format 11')
    models = [node for node in project.get('nodes', [])
              if node.get('kind') == 'cad' and node.get('source') == 'modeling'
              and node.get('modeling', {}).get('kind') == KINDS[name]]
    require(len(models) == 1, path.name + ': expected exactly one matching modeling root')
    model = models[0]
    operation, sources = model['modeling'], model.get('children', [])
    require(operation.get('version') == 1, path.name + ': unsupported recipe version')
    require(len(sources) == (2 if name == 'loft' else 1), path.name + ': source count')
    require(model.get('solid') is True and model.get('brep', {}).get('data'),
            path.name + ': saved native result missing')
    require(len({model['id'], *(source['id'] for source in sources)}) == len(sources) + 1,
            path.name + ': duplicate source identities')
    for source in sources:
        require(source.get('kind') == 'cad' and source.get('solid') is True
                and not source.get('suppressed') and source.get('brep', {}).get('data'),
                path.name + ': retained native source missing')
        require(len(source.get('transform', [])) == 16
                and all(math.isfinite(value) for value in source['transform']),
                path.name + ': invalid source placement')
    if name in ('offset', 'shell'):
        require(re.fullmatch(r'[0-9a-f]{64}', operation.get('sourceSignature', '')) is not None,
                path.name + ': original geometry signature missing')
        require(sources[0].get('source') == 'native'
                and sources[0].get('recipe', {}).get('type') == 'box'
                and sources[0]['recipe'].get('size') == [40, 30, 12],
                path.name + ': original fixture geometry changed')
        if name == 'offset':
            close(operation.get('offset', float('nan')), 2, 1e-12, 'saved offset')
            require(isinstance(operation.get('faceIndex'), int) and operation['faceIndex'] >= 1,
                    path.name + ': saved selected face missing')
        else:
            close(operation.get('thickness', float('nan')), 2, 1e-12, 'saved wall thickness')
            require(len(operation.get('faceIndices', [])) == 1, path.name + ': opening face missing')
    else:
        require(all(source.get('source') == 'native'
                    and source.get('recipe', {}).get('type') == 'sketch'
                    and source['recipe'].get('sketch') for source in sources),
                path.name + ': editable profile recipe missing')
        if name == 'sweep':
            sweep_path = operation.get('path', {})
            require(sweep_path.get('kind') == 'arc', path.name + ': expected saved arc path')
            close(sweep_path.get('radius', float('nan')), expected['sweepRadius'], 1e-12,
                  'saved sweep radius')
            close(sweep_path.get('angle', float('nan')), expected['sweepAngle'], 1e-12,
                  'saved sweep angle')
    return {'projectVersion': project['version'], 'modelId': model['id'],
            'operation': operation, 'sourceIds': [source['id'] for source in sources],
            'originalObjects': len(project['nodes']), 'sourceRecipesPresent': True}


def expectations(expected):
    for key in ('offsetVolume', 'shellVolume', 'loftVolume', 'sweepRadius', 'sweepAngle'):
        positive(expected.get(key), key)
    require(isinstance(expected.get('profile'), list) and len(expected['profile']) == 2,
            'Expected two profile dimensions')
    width, depth = [positive(value, 'profile dimension') for value in expected['profile']]
    radius, angle = expected['sweepRadius'], expected['sweepAngle'] * math.pi / 180
    require(0 < angle <= math.pi and radius > math.hypot(width, depth) / 2,
            'Invalid independent sweep geometry')
    offset_height = expected['offsetVolume'] / (40 * 30)
    loft_height = expected['loftVolume'] / (width * depth)
    # The harness profile is centred at its local origin. Its rectangular
    # cross-section follows a circular centreline towards local +X, tangent +Z.
    xmax = radius - (radius - width / 2 if math.cos(angle) >= 0 else radius + width / 2) * math.cos(angle)
    zmax = (radius + width / 2) * (math.sin(angle) if angle < math.pi / 2 else 1)
    return {
        'offset': {'volume': expected['offsetVolume'],
                   'bounds': [[-20, -15, -6], [20, 15, -6 + offset_height]]},
        'shell': {'volume': expected['shellVolume'],
                  'bounds': [[-20, -15, -6], [20, 15, 6]]},
        'loft': {'volume': expected['loftVolume'],
                 'bounds': [[-width / 2, -depth / 2, 0], [width / 2, depth / 2, loft_height]]},
        'sweep': {'volume': width * depth * radius * angle,
                  'bounds': [[-width / 2, -depth / 2, 0], [xmax, depth / 2, zmax]]},
    }


def prove(folder, run_id):
    import FreeCAD as App
    import Part
    expected = json.loads((folder / 'modeling-expected.json').read_text(encoding='utf-8-sig'))
    specs, outputs = expectations(expected), {}
    deflection = positive(expected.get('exportDeflection', .01), 'export deflection')
    require(deflection <= .05, 'Unexpected coarse export quality')
    for name in NAMES:
        spec = specs[name]
        shape = Part.read(str(folder / (name + '.step')))
        require(not shape.isNull() and shape.isValid() and shape.isClosed(), name + ': invalid/open STEP')
        require(len(shape.Solids) == 1 and shape.Solids[0].isValid()
                and shape.Solids[0].isClosed(), name + ': STEP must contain one closed valid solid')
        bbox = shape.BoundBox
        bounds = [[bbox.XMin, bbox.YMin, bbox.ZMin], [bbox.XMax, bbox.YMax, bbox.ZMax]]
        volume, area = float(shape.Volume), float(shape.Area)
        positive(volume, name + ' native volume')
        positive(area, name + ' native surface area')
        native_volume_tolerance = max(1e-5, spec['volume'] * 1e-8)
        close(volume, spec['volume'], native_volume_tolerance, name + ' STEP analytic volume')
        bounds_close(bounds, spec['bounds'], 2e-6, name + ' STEP analytic bounds')
        mesh = read_stl(folder / (name + '.stl'))
        max_coordinate = max(1., *(abs(value) for side in bounds for value in side))
        # Binary STL stores float32. Include an explicit coordinate rounding
        # reserve in addition to the requested CAD tessellation deflection.
        float_reserve = max_coordinate * 2 ** -22 + 1e-6
        bounds_budget = deflection + float_reserve
        volume_budget = max(1e-3, min(spec['volume'] * .005,
                                     area * bounds_budget + spec['volume'] * 1e-6))
        bounds_close(mesh['bounds'], bounds, bounds_budget, name + ' STL versus STEP bounds')
        close(mesh['volume'], spec['volume'], volume_budget, name + ' STL analytic volume')
        project = read_project(folder / (name + '.ocad'), name, expected)
        outputs[name] = {'expected': spec,
                         'step': {'valid': True, 'closed': True, 'solids': 1,
                                  'volume': volume, 'surfaceArea': area, 'bounds': bounds,
                                  'analyticVolumeTolerance': native_volume_tolerance},
                         'stl': mesh, 'project': project,
                         'stlBoundsBudget': bounds_budget,
                         'stlVolumeBudget': volume_budget,
                         'files': [file_record(folder / (name + '.' + extension))
                                   for extension in ('step', 'stl', 'ocad')]}
    result = {'ok': True, 'runId': run_id, 'engine': 'FreeCAD ' + '.'.join(App.Version()[:3]),
              'occt': Part.OCC_VERSION, 'exportDeflection': deflection, 'exports': outputs,
              'method': 'Independent native STEP reader plus standard-library STL edge/volume reader; '
                        'STL volume budget is a fixture acceptance limit, not a general surface-error proof.'}
    (folder / 'independent-modeling.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    return result


def main():
    if os.environ.get(PROOF_ENV):
        folder, run_id = pathlib.Path(os.environ[PROOF_ENV]), os.environ[RUN_ENV]
        try:
            prove(folder, run_id)
        except Exception:
            error = traceback.format_exc()
            (folder / 'independent-modeling-error.txt').write_text(run_id + '\n' + error, encoding='utf-8')
            (folder / 'independent-modeling.json').write_text(
                json.dumps({'ok': False, 'runId': run_id, 'error': error}, indent=2), encoding='utf-8')
            raise
        return
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory')
    parser.add_argument('--freecad', required=True)
    args = parser.parse_args()
    folder = pathlib.Path(args.directory).resolve()
    require(folder.is_dir(), 'Proof directory does not exist')
    freecad = pathlib.Path(args.freecad).resolve()
    require(freecad.is_file(), 'FreeCAD executable does not exist')
    run_id = str(uuid.uuid4())
    profile = pathlib.Path(tempfile.mkdtemp(prefix='independent-modeling-profile-', dir=str(folder)))
    for name in ('user', 'data', 'temp'):
        (profile / name).mkdir()
    env = dict(os.environ, FORMNARO_MODELING_PROOF=str(folder),
               FORMNARO_MODELING_PROOF_RUN=run_id, FREECAD_USER_HOME=str(profile / 'user'),
               FREECAD_USER_DATA=str(profile / 'data'), FREECAD_USER_TEMP=str(profile / 'temp'),
               PYTHONDONTWRITEBYTECODE='1')
    command = [str(freecad), '--user-cfg', str(profile / 'user.cfg'),
               '--system-cfg', str(profile / 'system.cfg'), str(pathlib.Path(__file__).resolve())]
    try:
        run = subprocess.run(command, env=env, cwd=profile, capture_output=True, timeout=240,
                             creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    except subprocess.TimeoutExpired as error:
        (folder / 'independent-modeling.log').write_bytes((error.stdout or b'') + (error.stderr or b''))
        raise AssertionError('Independent FreeCAD modeling proof timed out') from error
    (folder / 'independent-modeling.log').write_bytes(run.stdout + run.stderr)
    require(run.returncode == 0, 'FreeCAD failed: ' + run.stderr.decode(errors='replace'))
    result = json.loads((folder / 'independent-modeling.json').read_text(encoding='utf-8'))
    require(result.get('runId') == run_id and result.get('ok') is True,
            'Independent modeling proof failed or did not produce a fresh result: ' + json.dumps(result))
    print(json.dumps(result))


if __name__ == '__main__' or os.environ.get(PROOF_ENV):
    main()
