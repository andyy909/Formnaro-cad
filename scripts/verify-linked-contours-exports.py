"""Independent FreeCAD/BRep/STEP/STL readback of the actual P3 GUI fixtures.

No application module or geometry exporter is imported. The stated rectangle
dimensions, placements and volumes are independent acceptance expectations.
"""
import argparse
import ast
import copy
import hashlib
import importlib.util
import itertools
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
from decimal import Decimal

ENV = 'FORMNARO_LINKED_CONTOURS_PROOF'
RUN_ENV = ENV + '_RUN'
AFFINE = [-1.2, 0, 0, 0, .35, 1.1, 0, 0, .2, .1, 1.4, 0, 40, -10, 5, 1]
IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def close(actual, expected, tolerance, label):
    require(isinstance(actual, (int, float)) and not isinstance(actual, bool)
            and math.isfinite(actual) and abs(actual - expected) <= tolerance,
            '%s: %r != %r within %r' % (label, actual, expected, tolerance))


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def js_json(value):
    """Canonical JSON number spelling for the bounded saved fixture values."""
    if isinstance(value, dict):
        return '{' + ','.join(json.dumps(key, ensure_ascii=False) + ':' + js_json(value[key])
                              for key in sorted(value)) + '}'
    if isinstance(value, list):
        return '[' + ','.join(js_json(item) for item in value) + ']'
    if isinstance(value, float):
        require(math.isfinite(value), 'Nonfinite signed input')
        if value == 0:
            return '0'
        raw = repr(value)
        if 1e-6 <= abs(value) < 1e21:
            fixed = format(Decimal(raw), 'f')
            return fixed.rstrip('0').rstrip('.') if '.' in fixed else fixed
        mantissa, exponent = raw.lower().split('e') if 'e' in raw.lower() else (raw, '0')
        exponent = int(exponent)
        return mantissa.rstrip('0').rstrip('.') + 'e' + ('+' if exponent >= 0 else '') + str(exponent)
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def signed(value):
    return hashlib.sha256(js_json(value).encode('utf-8')).hexdigest()


def record(file):
    raw = file.read_bytes()
    return {'name': file.name, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}


def read(file):
    return json.loads(file.read_text(encoding='utf-8-sig'))


def helpers():
    path = pathlib.Path(__file__).with_name('verify-modeling-exports.py')
    spec = importlib.util.spec_from_file_location('independent_modeling_readers', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def expressions(sketch):
    definitions = {item['name']: item['value'] for item in sketch['variables']}
    values, visiting = {}, set()

    def evaluate(value):
        tree = ast.parse(str(value).replace('−', '-'), mode='eval').body

        def walk(node):
            if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
                return float(node.value)
            if isinstance(node, ast.Name):
                return variable(node.id)
            if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
                return (-1 if isinstance(node.op, ast.USub) else 1) * walk(node.operand)
            if isinstance(node, ast.BinOp):
                left, right = walk(node.left), walk(node.right)
                if isinstance(node.op, ast.Add):
                    return left + right
                if isinstance(node.op, ast.Sub):
                    return left - right
                if isinstance(node.op, ast.Mult):
                    return left * right
                if isinstance(node.op, ast.Div):
                    return left / right
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and len(node.args) == 1 and not node.keywords:
                if node.func.id in ('sind', 'cosd'):
                    return (math.sin if node.func.id == 'sind' else math.cos)(walk(node.args[0]) * math.pi / 180)
            raise AssertionError('Unsafe or unsupported scalar fixture expression')

        result = walk(tree)
        require(math.isfinite(result) and abs(result) <= 100000, 'Unbounded fixture scalar')
        return result

    def variable(name):
        if name in values:
            return values[name]
        require(name in definitions and name not in visiting, 'Unknown/cyclic fixture variable')
        visiting.add(name)
        values[name] = evaluate(definitions[name])
        visiting.remove(name)
        return values[name]

    for name in definitions:
        variable(name)
    return evaluate


def numeric_profile(sketch):
    evaluate = expressions(sketch)
    elements = []
    for item in sketch['elements']:
        require(item.get('construction') in (None, False), 'Linked contour became a construction line')
        result = {'id': item['id'], 'type': item['type']}
        for key in ('start', 'through', 'end', 'center'):
            if key in item:
                result[key] = [evaluate(value) for value in item[key]]
        if 'diameter' in item:
            result['diameter'] = evaluate(item['diameter'])
        elements.append(result)
    return {'elements': elements, 'loops': sketch['loops']}


def geometry_signature(node):
    identifiers = {}

    def index(item, path):
        identifiers[item['id']] = path
        for n, child in enumerate(item.get('children', [])):
            index(child, path + '/' + str(n))

    def model(item, root=False):
        output = {key: item[key] for key in ('kind', 'source', 'recipe', 'transform', 'solid', 'suppressed',
                  'operation', 'partition', 'extraction', 'modeling', 'constructionBudget') if key in item}
        if root:
            output['transform'] = IDENTITY
            output.pop('suppressed', None)
        if item.get('source') == 'step':
            output['brep'] = item['brep']
        if 'finish' in item:
            output['finish'] = copy.deepcopy(item['finish'])
            for step in output['finish']['steps']:
                for edge in step['edges']:
                    edge['origin']['rootId'] = identifiers.get(edge['origin']['rootId'], edge['origin']['rootId'])
                    edge['origin']['path'] = [identifiers.get(v, v) for v in edge['origin']['path']]
        if 'children' in item:
            output['children'] = [model(child) for child in item['children']]
        return output

    index(node, 'source')
    return signed(model(node, True))


def multiply(a, b):
    return [sum(a[n * 4 + row] * b[column * 4 + n] for n in range(4))
            for column in range(4) for row in range(4)]


def matrix_close(actual, expected, label):
    require(len(actual) == len(expected) == 16, label + ': matrix missing')
    for index in range(16):
        close(actual[index], expected[index], 2e-11, label + '[%d]' % index)


def point(matrix, value):
    return [matrix[12 + row] + sum(matrix[column * 4 + row] * value[column] for column in range(3))
            for row in range(3)]


def bounds_from_points(points):
    return [[min(p[k] for p in points) for k in range(3)],
            [max(p[k] for p in points) for k in range(3)]]


def affine_bounds():
    # Native boxes are centered at local Z0; the original 6mm box cap is Z3.
    # A positive 3mm contour extrusion therefore spans local Z3..6.
    return bounds_from_points([point(AFFINE, p) for p in itertools.product((-10, 10), (-6, 6), (3, 6))])


def body(node, expected_volume, App, Part):
    require(node.get('kind') == 'cad' and node.get('solid') is True
            and node.get('brep', {}).get('format') == 'OpenCascade-BRep'
            and node['brep'].get('triangulation') is False, 'Original native source missing')
    shape = Part.Shape()
    shape.importBrepFromString(node['brep']['data'])
    require(not shape.isNull() and shape.isValid() and shape.isClosed() and len(shape.Solids) == 1,
            'Independently read native BRep is not one valid closed solid: ' + node['id'])
    close(float(shape.Volume), expected_volume, 2e-5, 'native local volume ' + node['id'])
    close(node['stats']['volume'], expected_volume, 2e-5, 'saved local volume ' + node['id'])
    matrix = App.Matrix()
    for row in range(4):
        for column in range(4):
            setattr(matrix, 'A%d%d' % (row + 1, column + 1), node['transform'][column * 4 + row])
    placed = shape.transformGeometry(matrix)
    require(placed.isValid() and placed.isClosed() and len(placed.Solids) == 1,
            'Original full affine placement did not preserve native material')
    bbox = placed.BoundBox
    return {'id': node['id'], 'localVolume': float(shape.Volume), 'worldVolume': abs(float(placed.Volume)),
            'worldBounds': [[bbox.XMin, bbox.YMin, bbox.ZMin], [bbox.XMax, bbox.YMax, bbox.ZMax]],
            'transform': node['transform'], 'valid': True, 'closed': True, 'solids': 1,
            'brepSha256': hashlib.sha256(node['brep']['data'].encode('utf-8')).hexdigest()}


def check_link(project, link):
    require(set(link) == {'id', 'source', 'target', 'selector', 'snapshot'}, 'Unknown link fields or face index')
    require(link['source']['path'] == link['target']['path'] == [], 'Fixture unexpectedly lost root sources')
    nodes = {node['id']: node for node in project['nodes']}
    source, target = nodes[link['source']['rootId']], nodes[link['target']['rootId']]
    saved = link['snapshot']
    require(set(saved) == {'geometrySignature', 'sourceBrepSignature', 'relativePlacementSignature',
            'referenceSignature', 'sourceFrame', 'targetFrame', 'faceFrame', 'profile',
            'targetProfileSignature', 'elementMap'}, 'Incomplete native input geometry/frame snapshot')
    for key in ('geometrySignature', 'sourceBrepSignature', 'relativePlacementSignature',
                'referenceSignature', 'targetProfileSignature'):
        require(re.fullmatch('[a-f0-9]{64}', saved[key]) is not None, 'Invalid input signature: ' + key)
    require(saved['sourceBrepSignature'] == hashlib.sha256(source['brep']['data'].encode('utf-8')).hexdigest(),
            'Native input body signature does not identify the actual retained source')
    require(saved['geometrySignature'] == geometry_signature(source), 'Actual source geometry/recipe signature differs')
    require(saved['referenceSignature'] == signed({key: link[key] for key in ('source', 'target', 'selector')}),
            'Actual stable source/target/selector identity differs')
    matrix_close(saved['sourceFrame'], source['transform'], 'relative source frame')
    rounded = [float(format(value, '.14g')) for value in saved['sourceFrame']]
    rounded = [int(value) if value.is_integer() else value for value in rounded]
    require(saved['relativePlacementSignature'] == signed(rounded), 'Relative placement signature differs')
    matrix_close(saved['targetFrame'], target['transform'], 'last applied target frame')
    matrix_close(multiply(saved['sourceFrame'], saved['faceFrame']), target['transform'], 'initial identity target offset')
    profile = numeric_profile(target['recipe']['sketch'])
    require(signed(profile) == saved['targetProfileSignature'], 'Actual target profile signature differs')
    require(profile == saved['profile'], 'Last numerical source contour differs from actual target')
    element_ids = {element['id'] for element in profile['elements']}
    mapping = saved['elementMap']
    require(len(mapping) == len(element_ids) and {item['id'] for item in mapping} == element_ids
            and len({item['sourceKey'] for item in mapping}) == len(mapping),
            'Stable contour element identities are incomplete or ambiguous')
    require(all(re.fullmatch(r'(?:box\.edge\.[xyz]\.[xyz]\.(?:min|max)\.[xyz]\.(?:min|max)|'
                            r'sketch\.edge\..+|cylinder\.edge\.cap\.(?:min|max)|'
                            r'step\.edge\.exact\.[a-f0-9]{64})', item['sourceKey']) for item in mapping),
            'A contour edge uses an unsupported enumerated/nearest correspondence')
    return {'id': link['id'], 'source': link['source'], 'target': link['target'],
            'selector': link['selector'], 'sourceBrepSha256': saved['sourceBrepSignature'],
            'elementMap': mapping, 'inputSignaturesVerified': True, 'fullFramesVerified': True,
            'sourceProfileSnapshotVerified': True}


def check_stl(path, reader):
    raw = path.read_bytes()
    count = struct.unpack_from('<I', raw, 80)[0] if len(raw) >= 84 else -1
    if count > 0 and len(raw) == 84 + count * 50:
        require(all(math.isfinite(v) for index in range(count)
                    for v in struct.unpack_from('<fff', raw, 84 + index * 50)), 'Nonfinite STL facet normal')
    else:
        lines = [line.strip() for line in raw.decode('ascii').splitlines() if line.strip()]
        first, last = lines[0], lines[-1]
        require(first.startswith('solid') and last == 'endsolid' + first[5:], 'Incomplete ASCII STL envelope')
        records = lines[1:-1]
        require(records and len(records) % 7 == 0, 'Incomplete ASCII STL facets')
        number = r'[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?'
        for index in range(0, len(records), 7):
            require(re.fullmatch(r'facet\s+normal\s+' + number + r'\s+' + number + r'\s+' + number,
                                 records[index]) is not None and records[index + 1] == 'outer loop'
                    and records[index + 5:index + 7] == ['endloop', 'endfacet'], 'Malformed ASCII STL facet')
            for line in records[index + 2:index + 5]:
                require(re.fullmatch(r'vertex\s+' + number + r'\s+' + number + r'\s+' + number, line)
                        is not None, 'Malformed ASCII STL vertex')
    return reader.read_stl(path)


def check_exports(folder, name, expected_volume, expected_bounds, Part, reader):
    shape = Part.read(str(folder / (name + '.step')))
    require(not shape.isNull() and shape.isValid() and shape.isClosed() and len(shape.Solids) == 1,
            name + ': STEP must be one valid closed solid')
    bbox = shape.BoundBox
    bounds = [[bbox.XMin, bbox.YMin, bbox.ZMin], [bbox.XMax, bbox.YMax, bbox.ZMax]]
    reader.bounds_close(bounds, expected_bounds, 3e-6, name + ' analytic STEP bounds')
    close(float(shape.Volume), expected_volume, 2e-5, name + ' analytic STEP volume')
    stl = check_stl(folder / (name + '.stl'), reader)
    reader.bounds_close(stl['bounds'], expected_bounds, 2e-5, name + ' analytic STL bounds')
    close(stl['volume'], expected_volume, 2e-4, name + ' analytic STL volume')
    return {'expectedWorldVolume': expected_volume, 'expectedWorldBounds': expected_bounds,
            'step': {'valid': True, 'closed': True, 'solids': 1, 'volume': float(shape.Volume), 'bounds': bounds},
            'stl': stl, 'files': [record(folder / (name + '.' + extension)) for extension in ('ocad', 'step', 'stl')]}


def prove(folder, run_id):
    import FreeCAD as App
    import Part
    reader, expected = helpers(), read(folder / 'linked-expected.json')
    ids = {key: expected[key] for key in ('source', 'first', 'second', 'other')}
    outputs, models, checked = {}, {}, 0
    for name, width in [('base', 20), ('updated', 30), ('parameters', 40)]:
        model = read(folder / ('linked-' + name + '.ocad'))
        require(model['version'] == 14 and model['contourLinks']['version'] == 1
                and len(model['contourLinks']['links']) == 2 and len(model['nodes']) == 4,
                name + ': native source/link graph incomplete')
        nodes = {node['id']: node for node in model['nodes']}
        require(set(nodes) == set(ids.values()), name + ': original source identities changed')
        source = nodes[ids['source']]
        sketch = source['recipe']['sketch']
        require(source['source'] == 'native' and source['recipe']['type'] == 'sketch'
                and sketch['version'] == 1 and sketch['kind'] == 'rectangle', 'Original native sketch missing')
        require(sketch['dimensions'] == {'width': 'breite', 'depth': 'tiefe', 'diameter': 'tiefe', 'height': 'hoehe'},
                'Original source formulas were overwritten')
        values = {item['name']: item['value'] for item in sketch['variables']}
        require(values == {'breite': str(width), 'tiefe': '12', 'hoehe': '6'}, 'Unbound source scalar changed')
        bodies = []
        for key, volume, z in [('source', width * 12 * 6, (-3, 3)), ('first', width * 12 * 5, (3, 8)),
                               ('second', width * 12 * 2, (8, 10)), ('other', 9 * 7 * 3, None)]:
            node = nodes[ids[key]]
            measurement = body(node, volume, App, Part)
            checked += 1
            if z:
                reader.bounds_close(measurement['worldBounds'], [[-width/2, -6, z[0]], [width/2, 6, z[1]]],
                                    3e-6, name + ' native ' + key)
            if key in ('first', 'second'):
                require(node['recipe']['sketch']['version'] == 2, 'Derived original profile sketch missing')
                close(expressions(node['recipe']['sketch'])(node['recipe']['sketch']['dimensions']['height']),
                      5 if key == 'first' else 2, 1e-12, 'independently resolved linked height')
                if key == 'first':
                    require(node['recipe']['sketch']['dimensions']['height'] == expected['targetHeight']
                            and node['recipe']['sketch']['variables'] == expected['targetVariables'],
                            'Target height/free-variable expressions were overwritten')
            bodies.append(measurement)
        links = [check_link(model, link) for link in model['contourLinks']['links']]
        require({item['id'] for item in links} == {expected['firstLink'], expected['secondLink']}, 'Stable link IDs changed')
        phase = {'widthMm': width, 'nativeBodies': bodies, 'links': links, 'file': record(folder / ('linked-' + name + '.ocad'))}
        if name != 'parameters':
            phase['export'] = check_exports(folder, 'linked-' + name, width * 12 * 5,
                                           [[-width/2, -6, 3], [width/2, 6, 8]], Part, reader)
        else:
            data = model['projectParameters']
            require(data['version'] == 1 and len(data['parameters']) == len(data['bindings']) == 1
                    and data['parameters'][0]['name'] == 'quellbreite' and data['parameters'][0]['value'] == 40
                    and data['bindings'][0]['target'] == {'rootId': ids['source'], 'path': []}
                    and data['bindings'][0]['field'] == 'sketch.variables.breite', 'Shared scalar DAG fixture differs')
        outputs[name], models[name] = phase, model
    require(canonical(next(node for node in models['base']['nodes'] if node['id'] == ids['other'])) ==
            canonical(next(node for node in models['updated']['nodes'] if node['id'] == ids['other'])) ==
            canonical(next(node for node in models['parameters']['nodes'] if node['id'] == ids['other'])),
            'Unrelated original native body changed')
    for before, after in zip(outputs['base']['links'], outputs['updated']['links']):
        require(before['elementMap'] == after['elementMap'], 'Changed width remapped stable edge identities')
    affine = read(folder / 'linked-affine.ocad')
    require(affine['version'] == 14 and len(affine['nodes']) == 2 and len(affine['contourLinks']['links']) == 1,
            'Affine native source/link fixture missing')
    link = affine['contourLinks']['links'][0]
    nodes = {node['id']: node for node in affine['nodes']}
    require(nodes[link['source']['rootId']]['transform'] == AFFINE, 'Original mirror/shear/scale matrix changed')
    affine_bodies = [body(nodes[link['source']['rootId']], 1440, App, Part),
                     body(nodes[link['target']['rootId']], 720, App, Part)]
    checked += 2
    close(affine_bodies[1]['worldVolume'], 1330.56, 2e-5, 'affine target exact determinant volume')
    reader.bounds_close(affine_bodies[1]['worldBounds'], affine_bounds(), 3e-6, 'affine target exact world corners')
    outputs['affine'] = {'sourceMatrix': AFFINE, 'determinant': -1.848, 'nativeBodies': affine_bodies,
                         'links': [check_link(affine, link)],
                         'export': check_exports(folder, 'linked-affine', 1330.56, affine_bounds(), Part, reader)}
    step, replaced = read(folder / 'linked-step.ocad'), read(folder / 'linked-step-replaced.ocad')
    require(step['version'] == replaced['version'] == 14 and len(step['nodes']) == len(replaced['nodes']) == 2,
            'Actual original/replaced STEP fixture missing')
    link = step['contourLinks']['links'][0]
    require(link['selector']['kind'] == 'step-exact' and re.fullmatch('[a-f0-9]{64}', link['selector']['faceKey']),
            'STEP face is identified by an index/nearest selection')
    by_id = {node['id']: node for node in step['nodes']}
    replacement_by_id = {node['id']: node for node in replaced['nodes']}
    step_bodies = [body(by_id[link['source']['rootId']], 189, App, Part), body(by_id[link['target']['rootId']], 126, App, Part),
                   body(replacement_by_id[link['source']['rootId']], 2160, App, Part), body(replacement_by_id[link['target']['rootId']], 126, App, Part)]
    checked += 4
    check_link(step, link)
    require(replaced['contourLinks']['links'][0] == link, 'STEP replacement silently rewrote its old reference')
    require(link['snapshot']['sourceBrepSignature'] != step_bodies[2]['brepSha256']
            and by_id[link['target']['rootId']] == replacement_by_id[link['target']['rootId']],
            'STEP replacement did not retain an explicit lost reference and exact unchanged target')
    final = read(folder / 'linked-final.ocad')
    require(canonical(final) == canonical(models['updated']), 'Final project did not restore exact updated graph')
    saved, workspace = read(folder / 'Verknuepfte-Konturen.ocad'), read(folder / 'linked-workspace.json')
    require(saved.pop('workspace', None) == workspace and workspace.get('version') == 2,
            'Actual SaveAs changed the complete UI workspace snapshot')
    require(canonical(saved) == canonical(models['updated']), 'Actual SaveAs/reopen changed native links or geometry')
    require(workspace['selection'] == [{'rootId': ids['first'], 'path': []}], 'Actual selected linked result changed')
    require(workspace['quality'] == {'format': 'FormnaroCADQuality', 'version': 1,
            'display': {'deflection': .02, 'angleDegrees': 8}, 'export': {'deflection': .01, 'angleDegrees': 5}},
            'Actual saved native accuracy reduced')
    result = {'ok': True, 'runId': run_id, 'engine': 'FreeCAD ' + '.'.join(App.Version()[:3]),
              'occt': Part.OCC_VERSION, 'checkedNativeBodies': checked, 'outputs': outputs,
              'stepReplacement': {'oldFaceKey': link['selector']['faceKey'], 'nativeBodies': step_bodies,
                                  'exactOriginalBodyRetained': True, 'replacedBodyDetected': True,
                                  'cachedTargetUnchanged': True, 'noFaceIndexOrNearest': True},
              'finalExactUpdatedRestoration': True, 'workspaceMatchesUISnapshot': True,
              'actualWorkspace': workspace, 'actualWorkspaceSha256': hashlib.sha256(canonical(workspace).encode('utf-8')).hexdigest(),
              'finalFiles': [record(folder / name) for name in ('linked-final.ocad', 'Verknuepfte-Konturen.ocad',
                             'linked-workspace.json', 'linked-expected.json', 'linked-parameters.ocad',
                             'linked-step.ocad', 'linked-step-replaced.ocad')],
              'method': 'Independent FreeCAD original BRep/STEP, analytic affine corners/determinant, strict STL syntax '
                        'and standard-library closed/oriented adjacency/volume; independent scalar formulas, input hashes '
                        'and complete frame/profile snapshots; no application module imported.'}
    (folder / 'independent-linked-contours.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    return result


def main():
    if os.environ.get(ENV):
        folder, run_id = pathlib.Path(os.environ[ENV]), os.environ[RUN_ENV]
        try:
            prove(folder, run_id)
        except Exception:
            error = traceback.format_exc()
            (folder / 'independent-linked-contours-error.txt').write_text(error, encoding='utf-8')
            (folder / 'independent-linked-contours.json').write_text(json.dumps({'ok': False, 'runId': run_id, 'error': error}), encoding='utf-8')
            raise
        return
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory')
    parser.add_argument('--freecad', required=True)
    args = parser.parse_args()
    folder, freecad = pathlib.Path(args.directory).resolve(), pathlib.Path(args.freecad).resolve()
    require(folder.is_dir() and freecad.is_file(), 'Actual artifact directory or independent FreeCAD missing')
    run_id = str(uuid.uuid4())
    profile = pathlib.Path(tempfile.mkdtemp(prefix='independent-linked-profile-', dir=folder))
    for name in ('user', 'data', 'temp'):
        (profile / name).mkdir()
    env = dict(os.environ, **{ENV: str(folder), RUN_ENV: run_id}, FREECAD_USER_HOME=str(profile / 'user'),
               FREECAD_USER_DATA=str(profile / 'data'), FREECAD_USER_TEMP=str(profile / 'temp'), PYTHONDONTWRITEBYTECODE='1')
    command = [str(freecad), '--user-cfg', str(profile / 'user.cfg'), '--system-cfg', str(profile / 'system.cfg'), str(pathlib.Path(__file__).resolve())]
    execution = subprocess.run(command, env=env, cwd=profile, capture_output=True, timeout=240,
                               creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    (folder / 'independent-linked-contours.log').write_bytes(execution.stdout + execution.stderr)
    require(execution.returncode == 0, 'Independent FreeCAD failed: ' + execution.stderr.decode(errors='replace'))
    result = read(folder / 'independent-linked-contours.json')
    require(result.get('runId') == run_id and result.get('ok') is True, 'Independent readback failed/not fresh: ' + json.dumps(result))
    print(json.dumps({'ok': True, 'report': str(folder / 'independent-linked-contours.json'),
                      'checkedNativeBodies': result['checkedNativeBodies'], 'workspaceMatchesUISnapshot': True}))


if __name__ == '__main__' or os.environ.get(ENV):
    main()
