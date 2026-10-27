"""Independently verify the real project-parameter STEP/STL/project fixtures."""
import argparse
import hashlib
import importlib.util
import json
import math
import os
import pathlib
import re
import subprocess
import tempfile
import traceback
import uuid

PROOF_ENV = 'FORMNARO_PROJECT_PARAMETERS_PROOF'
RUN_ENV = 'FORMNARO_PROJECT_PARAMETERS_PROOF_RUN'


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def close(actual, expected, tolerance, label):
    require(isinstance(actual, (int, float)) and math.isfinite(actual)
            and abs(actual - expected) <= tolerance,
            '%s: actual=%r expected=%r tolerance=%r' % (label, actual, expected, tolerance))


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def record(path):
    raw = path.read_bytes()
    return {'name': path.name, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}


def helpers():
    location = pathlib.Path(__file__).with_name('verify-modeling-exports.py')
    spec = importlib.util.spec_from_file_location('formnaro_independent_modeling_reader', location)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_project(path):
    value = json.loads(path.read_text(encoding='utf-8-sig'))
    require(isinstance(value, dict) and isinstance(value.get('nodes'), list),
            path.name + ': project nodes missing')
    return value


def check_workspace(workspace, parts):
    require(isinstance(workspace, dict) and workspace.get('version') == 2,
            'The pure CAD fixture must retain its established workspace version2')
    require(set(workspace) == {'version', 'view', 'selection', 'mode', 'snap', 'quality', 'layout', 'tree'},
            'Saved workspace fields changed or were omitted')
    view = workspace['view']
    require(set(view) == {'projection', 'position', 'target', 'up', 'zoom'}
            and view['projection'] in ('perspective', 'orthographic'), 'Saved camera schema changed')
    for key in ('position', 'target', 'up'):
        require(isinstance(view[key], list) and len(view[key]) == 3
                and all(isinstance(n, (int, float)) and math.isfinite(n) and abs(n) <= 1e7
                        for n in view[key]), 'Saved camera vector invalid: ' + key)
    require(math.dist(view['position'], view['target']) > 1e-7
            and math.hypot(*view['up']) > 1e-7
            and isinstance(view['zoom'], (int, float)) and 1e-5 <= view['zoom'] <= 1e5,
            'Saved camera orientation or zoom invalid')
    require(workspace['mode'] == 'translate' and workspace['snap'] == 1,
            'Unedited mode/grid snap changed')
    selection = workspace['selection']
    require(len(selection) == 10 and all(set(item) == {'rootId', 'path'} and item['path'] == []
                                        for item in selection)
            and {item['rootId'] for item in selection} == {node['id'] for node in parts.values()},
            'Saved selected native roots changed')
    require(workspace['tree'] == {'expanded': []}, 'Saved collapsed source tree changed')
    require(workspace['quality'] == {'format': 'FormnaroCADQuality', 'version': 1,
                                    'display': {'deflection': .02, 'angleDegrees': 8},
                                    'export': {'deflection': .01, 'angleDegrees': 5}},
            'Saved native display/export quality changed')
    layout = workspace['layout']
    flags = ('inspectorCollapsed', 'libraryCollapsed', 'objectsFirst', 'workspaceFirst')
    sizes = ('chatHeight', 'inspectorWidth', 'libraryWidth', 'shapeLibraryHeight')
    require(set(layout) == {'version', 'zones', 'hiddenTools', 'librarySide', 'viewSide', 'modePosition',
                           *flags, *sizes} and layout['version'] == 1,
            'Saved layout schema changed')
    require(all(isinstance(layout[key], bool) for key in flags)
            and all(layout[key] is None or isinstance(layout[key], (int, float))
                    and math.isfinite(layout[key]) and 0 < layout[key] <= 4000 for key in sizes),
            'Saved layout visibility/sizes invalid')
    require(layout['librarySide'] in ('left', 'right') and layout['viewSide'] in ('left', 'right')
            and layout['modePosition'] in ('top', 'bottom'), 'Saved sidebar positions invalid')
    zones = layout['zones']
    require(set(zones) == {'header', 'mode', 'toolbar', 'view'}
            and all(isinstance(values, list) and all(isinstance(v, str) and 0 < len(v) <= 200
                                                   for v in values) for values in zones.values()),
            'Saved command layout invalid')
    commands = [command for values in zones.values() for command in values]
    require(len(commands) == len(set(commands)) and isinstance(layout['hiddenTools'], list)
            and set(layout['hiddenTools']).issubset(set(commands)),
            'Saved command layout duplicated/lost tool references')
    return hashlib.sha256(canonical(workspace).encode('utf-8')).hexdigest()


def native_shape(node, Part, expected_width, index, label):
    recipe = node.get('recipe', {})
    sketch = recipe.get('sketch', {})
    require(node.get('kind') == 'cad' and node.get('solid') is True
            and node.get('source') == 'native' and recipe.get('type') == 'sketch',
            label + ': original native sketch recipe missing')
    require(sketch.get('version') == 1 and sketch.get('kind') == 'rectangle',
            label + ': sketch type/version changed')
    require(sketch.get('dimensions') == {'width': 'breite', 'depth': 'tiefe',
                                       'diameter': 'tiefe', 'height': 'hoehe'},
            label + ': derived dimensions were overwritten')
    variables = sketch.get('variables', [])
    require(len(variables) == 5 and len({v['name'] for v in variables}) == 5,
            label + ': source variables changed')
    names = {v['name']: v['value'] for v in variables}
    require(names.get('innen') == 'breite - 2 * wand', label + ': derived formula changed')
    for name, expected in [('breite', expected_width), ('tiefe', 10 + index),
                           ('hoehe', 5), ('wand', 2)]:
        close(float(names.get(name, 'nan')), expected, 1e-12, label + ' variable ' + name)
    expected_matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, index * 35, 0, 0, 1]
    require(node.get('transform') == expected_matrix, label + ': full source matrix changed')
    require(recipe.get('size') == [expected_width, 10 + index, 5],
            label + ': recipe dimensions inconsistent')
    brep = node.get('brep', {})
    require(brep.get('format') == 'OpenCascade-BRep' and brep.get('triangulation') is False
            and isinstance(brep.get('data'), str) and brep['data'], label + ': source BRep missing')
    shape = Part.Shape()
    shape.importBrepFromString(brep['data'])
    require(not shape.isNull() and shape.isValid() and shape.isClosed()
            and len(shape.Solids) == 1, label + ': independently read BRep is not one valid closed solid')
    expected_volume = expected_width * (10 + index) * 5
    close(float(shape.Volume), expected_volume, 1e-5, label + ' independent BRep volume')
    close(node.get('stats', {}).get('volume', float('nan')), expected_volume, 1e-5,
          label + ' saved volume')
    bbox = shape.BoundBox
    bounds = [[bbox.XMin, bbox.YMin, bbox.ZMin], [bbox.XMax, bbox.YMax, bbox.ZMax]]
    expected_bounds = [[-expected_width / 2, -(10 + index) / 2, 0],
                       [expected_width / 2, (10 + index) / 2, 5]]
    for side in range(2):
        for axis in range(3):
            close(bounds[side][axis], expected_bounds[side][axis], 2e-6,
                  '%s BRep bounds[%d][%d]' % (label, side, axis))
    return {'id': node['id'], 'name': node['name'], 'volume': float(shape.Volume),
            'localBounds': bounds, 'transform': node['transform'],
            'sourceFormulasPreserved': True, 'independentBrepValid': True}


def sketches(project):
    result = {}
    for node in project['nodes']:
        match = re.fullmatch(r'Parameterteil (\d+)', node.get('name', ''))
        if match:
            index = int(match[1]) - 1
            require(index not in result and 0 <= index < 10, 'Duplicate/unknown fixture part')
            result[index] = node
    require(set(result) == set(range(10)), 'Expected all ten retained native sketch parts')
    return result


def parameter_data(project, width, variant_active, label):
    require(project.get('version') == 13, label + ': expected format13')
    data = project.get('projectParameters', {})
    require(data.get('version') == 1, label + ': parameter schema missing')
    parameters, bindings, variants = data.get('parameters', []), data.get('bindings', []), data.get('variants', [])
    require(len(parameters) == 3 and len(bindings) == 10 and len(variants) == 1,
            label + ': parameter/binding/variant counts changed')
    names = {p['name']: p for p in parameters}
    require(set(names) == {'grund', 'breite', 'ungebunden'}, label + ': named scalar graph changed')
    close(names['grund']['value'], 24, 1e-12, label + ' base scalar')
    require(names['breite']['value'] == 'grund + 2', label + ': dependent scalar formula changed')
    close(names['ungebunden']['value'], 44, 1e-12, label + ' unused scalar')
    variant = variants[0]
    require(variant.get('name') == 'Breit' and variant.get('values') == [
        {'parameterId': names['grund']['id'], 'value': 40}], label + ': scalar variant definition changed')
    require(data.get('activeVariantId') == (variant['id'] if variant_active else None),
            label + ': active variant mismatch')
    close((40 if variant_active else names['grund']['value']) + 2, width, 1e-12,
          label + ' independently evaluated one-edge scalar dependency')
    parts = sketches(project)
    expected_ids = {node['id'] for node in parts.values()}
    require(len({binding['id'] for binding in bindings}) == 10
            and {b.get('target', {}).get('rootId') for b in bindings} == expected_ids,
            label + ': target identities changed or duplicated')
    require(all(b.get('parameterId') == names['breite']['id']
                and b.get('field') == 'sketch.variables.breite'
                and b.get('target', {}).get('path') == [] for b in bindings),
            label + ': explicit source binding changed')
    applied = data.get('applied', {})
    require(applied.get('version') == 1
            and re.fullmatch(r'[a-f0-9]{64}', applied.get('effectSignature', '')) is not None,
            label + ': checked correspondence stamp missing')
    inputs = applied.get('inputs', [])
    require(len(inputs) == 10 and {v.get('bindingId') for v in inputs} == {b['id'] for b in bindings}
            and all(re.fullmatch(r'[a-f0-9]{64}', v.get('signature', '')) for v in inputs),
            label + ': checked binding inputs incomplete')
    require(not re.search(r'brep|triangulation', json.dumps(variants), re.I),
            label + ': inactive geometry leaked into scalar variants')
    return {'parameterIds': {name: value['id'] for name, value in names.items()},
            'bindingIds': [b['id'] for b in bindings], 'variantId': variant['id'],
            'activeVariantId': data.get('activeVariantId'), 'checkedInputs': len(inputs),
            'derivedFormulaPreserved': True}


def prove(folder, run_id):
    import FreeCAD as App
    import Part
    reader = helpers()
    before = read_project(folder / 'parameters-before.ocad')
    baseline = sketches(before)
    require(len(before['nodes']) == 11 and 'projectParameters' not in before,
            'Initial fixture must contain eleven original parts and no shared parameters')
    before_measurements = [native_shape(baseline[index], Part, 20, index,
                                        'initial part %d' % (index + 1)) for index in range(10)]
    outputs, models = {}, {}
    for name, width, active in [('base', 26, False), ('variant', 42, True)]:
        prefix = 'parameters-' + name
        project = read_project(folder / (prefix + '.ocad'))
        require(len(project['nodes']) == 11, prefix + ': unrelated root or selected source lost')
        parts = sketches(project)
        graph = parameter_data(project, width, active, prefix)
        measurements = []
        for index in range(10):
            source, current = baseline[index], parts[index]
            require(source['id'] == current['id'], prefix + ': original source identity changed')
            # Recipe changes are confined to the explicitly bound free variable
            # and its corresponding intrinsic size; all other source data stays.
            expected_recipe = json.loads(json.dumps(source['recipe']))
            expected_recipe['size'][0] = width
            next(v for v in expected_recipe['sketch']['variables'] if v['name'] == 'breite')['value'] = str(width)
            require(canonical(current['recipe']) == canonical(expected_recipe),
                    prefix + ': an unbound recipe field changed')
            for key in set(source) | set(current):
                if key not in ('recipe', 'stats', 'brep'):
                    require(canonical(source.get(key)) == canonical(current.get(key)),
                            prefix + ': unbound source field changed: ' + key)
            measurements.append(native_shape(current, Part, width, index,
                                              '%s part %d' % (prefix, index + 1)))
        unrelated = next(n for n in project['nodes'] if n.get('name') == 'Unbeteiligtes Teil')
        original_other = next(n for n in before['nodes'] if n.get('name') == 'Unbeteiligtes Teil')
        require({k: v for k, v in unrelated.items() if k not in ('hidden', 'suppressed')}
                == {k: v for k, v in original_other.items() if k not in ('hidden', 'suppressed')},
                prefix + ': unrelated original geometry/source changed')
        require(bool(unrelated.get('hidden')) == active and bool(unrelated.get('suppressed')) == active,
                prefix + ': explicit variant flags mismatch')
        step = Part.read(str(folder / (prefix + '.step')))
        require(not step.isNull() and step.isValid() and step.isClosed() and len(step.Solids) == 1,
                prefix + ': STEP must contain one valid closed solid')
        bbox = step.BoundBox
        native_bounds = [[bbox.XMin, bbox.YMin, bbox.ZMin], [bbox.XMax, bbox.YMax, bbox.ZMax]]
        expected_bounds = [[-width / 2, -5, 0], [width / 2, 5, 5]]
        reader.bounds_close(native_bounds, expected_bounds, 2e-6, prefix + ' STEP bounds')
        close(float(step.Volume), width * 10 * 5, 1e-5, prefix + ' analytic STEP volume')
        stl = reader.read_stl(folder / (prefix + '.stl'))
        reader.bounds_close(stl['bounds'], expected_bounds, 1e-5, prefix + ' analytic STL bounds')
        close(stl['volume'], width * 10 * 5, 1e-4, prefix + ' analytic STL volume')
        require(stl['closed'] and stl['oriented'] and stl['components'] == 1,
                prefix + ': STL is not one closed oriented component')
        outputs[name] = {'expectedSize': [width, 10, 5], 'expectedVolume': width * 10 * 5,
                         'step': {'valid': True, 'closed': True, 'solids': 1,
                                  'volume': float(step.Volume), 'bounds': native_bounds},
                         'stl': stl, 'project': graph, 'allTenNativeBodies': measurements,
                         'unrelatedSourcePreserved': True,
                         'files': [record(folder / (prefix + '.' + extension))
                                   for extension in ('ocad', 'step', 'stl')]}
        models[name] = project
    final = read_project(folder / 'parameters-final.ocad')
    require(canonical(final) == canonical(models['base']),
            'Final cache/Undo/readback workflow did not restore the exact base project')
    saved = read_project(folder / 'Projektparameter-und-Varianten.ocad')
    workspace = saved.pop('workspace', None)
    workspace_hash = check_workspace(workspace, sketches(models['base']))
    workspace_snapshot = folder / 'parameters-workspace.json'
    workspace_matches_snapshot = None
    if workspace_snapshot.is_file():
        expected_workspace = json.loads(workspace_snapshot.read_text(encoding='utf-8-sig'))
        require(canonical(workspace) == canonical(expected_workspace),
                'Actual file changed the complete UI workspace captured before Save As')
        workspace_matches_snapshot = True
    require(canonical(saved) == canonical(models['base']),
            'Actual saved file changed data or geometry')
    require(outputs['base']['project']['parameterIds'] == outputs['variant']['project']['parameterIds']
            and outputs['base']['project']['bindingIds'] == outputs['variant']['project']['bindingIds'],
            'Variant switching replaced stable parameter/binding identities')
    result = {'ok': True, 'runId': run_id, 'engine': 'FreeCAD ' + '.'.join(App.Version()[:3]),
              'occt': Part.OCC_VERSION, 'exports': outputs,
              'initialNativeBodies': before_measurements, 'format13': True,
              'dependencyFormula': 'grund + 2', 'checkedNativeBodies': 30,
              'finalExactBaseRestoration': True, 'actualFileWorkspaceVersion': workspace['version'],
              'actualWorkspace': workspace, 'actualWorkspaceSha256': workspace_hash,
              'workspaceMatchesUISnapshot': workspace_matches_snapshot,
              'finalFiles': [record(folder / name) for name in (
                  'parameters-before.ocad', 'parameters-final.ocad',
                  'Projektparameter-und-Varianten.ocad', 'parameters-expected.json')]
                            + ([record(workspace_snapshot)] if workspace_snapshot.is_file() else []),
              'method': 'Independent FreeCAD STEP and original BRep reads plus standard-library '
                        'closed/oriented STL adjacency and volume checks; fixture formulas and '
                        'all unbound source fields checked independently of application code.'}
    (folder / 'independent-project-parameters.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    return result


def main():
    if os.environ.get(PROOF_ENV):
        folder, run_id = pathlib.Path(os.environ[PROOF_ENV]), os.environ[RUN_ENV]
        try:
            prove(folder, run_id)
        except Exception:
            error = traceback.format_exc()
            (folder / 'independent-project-parameters-error.txt').write_text(run_id + '\n' + error, encoding='utf-8')
            (folder / 'independent-project-parameters.json').write_text(
                json.dumps({'ok': False, 'runId': run_id, 'error': error}, indent=2), encoding='utf-8')
            raise
        return
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory')
    parser.add_argument('--freecad', required=True)
    args = parser.parse_args()
    folder, freecad = pathlib.Path(args.directory).resolve(), pathlib.Path(args.freecad).resolve()
    require(folder.is_dir() and freecad.is_file(), 'Proof directory/FreeCAD executable is missing')
    run_id = str(uuid.uuid4())
    profile = pathlib.Path(tempfile.mkdtemp(prefix='independent-project-parameters-profile-', dir=str(folder)))
    for name in ('user', 'data', 'temp'):
        (profile / name).mkdir()
    env = dict(os.environ, FORMNARO_PROJECT_PARAMETERS_PROOF=str(folder),
               FORMNARO_PROJECT_PARAMETERS_PROOF_RUN=run_id, FREECAD_USER_HOME=str(profile / 'user'),
               FREECAD_USER_DATA=str(profile / 'data'), FREECAD_USER_TEMP=str(profile / 'temp'),
               PYTHONDONTWRITEBYTECODE='1')
    command = [str(freecad), '--user-cfg', str(profile / 'user.cfg'),
               '--system-cfg', str(profile / 'system.cfg'), str(pathlib.Path(__file__).resolve())]
    try:
        execution = subprocess.run(command, env=env, cwd=profile, capture_output=True, timeout=240,
                                   creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    except subprocess.TimeoutExpired as error:
        (folder / 'independent-project-parameters.log').write_bytes((error.stdout or b'') + (error.stderr or b''))
        raise AssertionError('Independent FreeCAD project parameter proof timed out') from error
    (folder / 'independent-project-parameters.log').write_bytes(execution.stdout + execution.stderr)
    require(execution.returncode == 0, 'FreeCAD failed: ' + execution.stderr.decode(errors='replace'))
    result = json.loads((folder / 'independent-project-parameters.json').read_text(encoding='utf-8'))
    require(result.get('runId') == run_id and result.get('ok') is True,
            'Independent project parameter proof failed or is not fresh: ' + json.dumps(result))
    print(json.dumps(result))


if __name__ == '__main__' or os.environ.get(PROOF_ENV):
    main()
