"""Independent readers for the actual Electron technical-drawing exports.

Run after --verify-drawings. Expectations describe the pre-existing native
demo (60 x 40 x 6 mm, four 5 mm through bores), not exporter-provided values.
No application module or exporter is imported by this verifier.
"""
import argparse
import collections
import hashlib
import importlib.metadata
import io
import json
import logging
import math
import pathlib
import re
import sys
import traceback
import warnings
import xml.etree.ElementTree as ET


ROOT = pathlib.Path(__file__).resolve().parent.parent
DEPENDENCIES = ROOT / 'work' / 'cad-drawings' / 'python'
if DEPENDENCIES.is_dir():
    sys.path.insert(0, str(DEPENDENCIES))

import ezdxf
import fitz
from pypdf import PdfReader
from ezdxf import bbox
from ezdxf.lldxf.encoding import decode_dxf_unicode

PAPER = {'drawing-a4': ([297, 210], 1.0),
         'drawing-a3-half': ([297, 420], 0.5)}
VIEW_SIZES = [[60, 6], [60, 40], [40, 6], [60, 40]]
REQUIRED_TEXT = ['FN-TEST-082', 'Formnaro Abnahme', '60 mm', '90°', 'R 2.5 mm', 'Ø 5 mm']
BORE_CENTERS = {(-22, -12), (22, -12), (-22, 12), (22, 12)}
NUMBER = r'[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?'
SVG_NS = '{http://www.w3.org/2000/svg}'


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def close(actual, expected, tolerance, label):
    require(math.isfinite(actual) and abs(actual - expected) <= tolerance,
            '%s: actual=%r expected=%r tolerance=%r' %
            (label, actual, expected, tolerance))


def file_record(path):
    raw = path.read_bytes()
    return {'name': path.name, 'bytes': len(raw),
            'sha256': hashlib.sha256(raw).hexdigest()}


def points_size(points):
    require(points, 'No vector geometry points')
    return [max(p[k] for p in points) - min(p[k] for p in points)
            for k in range(2)]


def read_svg(path, paper, scale):
    root = ET.parse(path).getroot()
    require(root.tag == SVG_NS + 'svg', 'SVG root missing')
    for key, value in zip(('width', 'height'), paper):
        require(root.get(key) == str(value) + 'mm', 'SVG physical paper ' + key)
    require([float(v) for v in root.get('viewBox', '').split()] == [0, 0, *paper],
            'SVG viewBox must use physical paper mm')
    require(not root.findall('.//' + SVG_NS + 'image'), 'SVG raster image found')
    require(not root.findall('.//' + SVG_NS + 'script'), 'SVG script found')
    text = ' '.join(root.itertext())
    for expected in REQUIRED_TEXT:
        require(expected in text, 'SVG missing measured/title text: ' + expected)
    view_groups = [e for e in root if e.tag == SVG_NS + 'g'
                   and e.get('transform', '').startswith('translate(')]
    require(len(view_groups) == 4, 'SVG must contain front/top/side/section')
    views = []
    for index, (group, expected) in enumerate(zip(view_groups, VIEW_SIZES)):
        values = [float(v) for v in re.findall(NUMBER, group.get('transform'))]
        require(len(values) == 4, 'Unexpected SVG view transform')
        close(values[2], scale, 1e-12, 'SVG X paper scale')
        close(values[3], -scale, 1e-12, 'SVG Y paper scale')
        points, lengths, radii, bore_centers = [], [], [], []
        for e in group.iter():
            if e.tag == SVG_NS + 'path':
                data = e.get('d', '')
                if re.fullmatch(r'\s*M\s*' + NUMBER + r'[ ,]+' + NUMBER +
                                r'\s*L\s*' + NUMBER + r'[ ,]+' + NUMBER + r'\s*', data):
                    p = [float(v) for v in re.findall(NUMBER, data)]
                    points.extend([p[:2], p[2:]])
                    lengths.append(math.hypot(p[2] - p[0], p[3] - p[1]))
            elif e.tag == SVG_NS + 'circle':
                x, y, radius = [float(e.get(k)) for k in ('cx', 'cy', 'r')]
                points.extend([[x - radius, y - radius], [x + radius, y + radius]])
                radii.append(radius)
                if abs(radius - 2.5) < 1e-7:
                    bore_centers.append((round(x, 5), round(y, 5)))
        actual = points_size(points)
        for k in range(2):
            close(actual[k], expected[k], 1e-5, 'SVG native view size %d/%d' % (index, k))
        require(any(abs(v - expected[0]) < 1e-5 for v in lengths),
                'SVG model-width segment missing')
        if index in (1, 3):
            require(sum(abs(r - 2.5) < 1e-7 for r in radii) >= 4,
                    'SVG top/section four exact bore circles missing')
            require(set(bore_centers) == BORE_CENTERS,
                    'SVG top/section bore positions differ from known native demo')
        views.append({'sizeMm': actual, 'physicalSizeMm': [v * scale for v in actual],
                      'lineCount': len(lengths), 'circleRadiiMm': radii,
                      'boreCentersMm': bore_centers})
    return {'file': file_record(path), 'paperMm': paper, 'paperScale': scale,
            'views': views, 'vectorOnly': True}


def entity_geometry(entity):
    kind = entity.dxftype()
    if kind == 'LINE':
        return [kind, list(entity.dxf.start), list(entity.dxf.end), entity.dxf.linetype]
    if kind == 'CIRCLE':
        return [kind, list(entity.dxf.center), entity.dxf.radius, entity.dxf.linetype]
    if kind == 'ARC':
        return [kind, list(entity.dxf.center), entity.dxf.radius,
                entity.dxf.start_angle, entity.dxf.end_angle, entity.dxf.linetype]
    if kind == 'ELLIPSE':
        return [kind, list(entity.dxf.center), list(entity.dxf.major_axis),
                entity.dxf.ratio, entity.dxf.start_param, entity.dxf.end_param,
                list(entity.dxf.extrusion), entity.dxf.linetype]
    if kind == 'SPLINE':
        return [kind, entity.dxf.degree, [[float(v) for v in p] for p in entity.control_points],
                [float(v) for v in entity.weights], [float(v) for v in entity.knots], entity.dxf.linetype]
    if kind == 'LWPOLYLINE':
        return [kind, [list(p) for p in entity.get_points()], entity.dxf.linetype]
    raise AssertionError('Unexpected native drawing entity: ' + kind)


def read_dxf(path):
    raw = path.read_bytes()
    require(all(value < 128 for value in raw), 'DXF must be ASCII')
    doc = ezdxf.readfile(path)
    require(doc.dxfversion == 'AC1015', 'DXF is not AutoCAD2000')
    require(doc.units == 4, 'DXF insertion unit must be mm')
    audit = doc.audit()
    require(not audit.errors, 'Independent DXF audit errors: ' + str([e.message for e in audit.errors]))
    require(not audit.fixes, 'Independent DXF reader repaired file: ' + str([e.message for e in audit.fixes]))
    model = doc.modelspace()
    text = ' '.join(decode_dxf_unicode(e.dxf.text) for e in model.query('TEXT'))
    for expected in REQUIRED_TEXT:
        require(expected in text, 'DXF missing measured/title text: ' + expected)
    views, canonical = [], []
    for index, expected in enumerate(VIEW_SIZES):
        layer = 'VIEW_' + str(index + 1)
        entities = [e for e in model if e.dxf.layer == layer and e.dxftype() != 'TEXT']
        require(entities, 'DXF native view layer missing: ' + layer)
        box = bbox.extents(entities, fast=False)
        actual = [box.size.x, box.size.y]
        for k in range(2):
            close(actual[k], expected[k], 1e-5, 'DXF native view size %d/%d' % (index, k))
        lengths = [(e.dxf.end - e.dxf.start).magnitude for e in entities if e.dxftype() == 'LINE']
        require(any(abs(v - expected[0]) < 1e-5 for v in lengths),
                'DXF model-width segment missing')
        radii = [e.dxf.radius for e in entities if e.dxftype() == 'CIRCLE']
        if index in (1, 3):
            require(sum(abs(r - 2.5) < 1e-7 for r in radii) >= 4,
                    'DXF top/section exact bore circles missing')
            center = (box.extmin + box.extmax) * .5
            bore_centers = {(round(e.dxf.center.x - center.x, 5),
                             round(e.dxf.center.y - center.y, 5))
                            for e in entities if e.dxftype() == 'CIRCLE'
                            and abs(e.dxf.radius - 2.5) < 1e-7}
            require(bore_centers == BORE_CENTERS,
                    'DXF top/section bore positions differ from known native demo')
        canonical.extend([[layer, entity_geometry(e)] for e in entities])
        views.append({'layer': layer, 'sizeMm': actual, 'lineCount': len(lengths),
                      'circleRadiiMm': radii,
                      'types': dict(collections.Counter(e.dxftype() for e in entities))})
    encoded = json.dumps(canonical, sort_keys=True, separators=(',', ':')).encode()
    return {'file': file_record(path), 'reader': 'ezdxf', 'units': 'mm',
            'version': doc.dxfversion, 'nativeGeometryScale': 1,
            'auditErrors': 0, 'auditFixes': 0, 'views': views,
            'geometrySha256': hashlib.sha256(encoded).hexdigest()}


def read_pdf(path, paper, scale, render_dir):
    parser_messages = []
    handler = logging.StreamHandler(io.StringIO())
    handler.emit = lambda item: parser_messages.append(item.getMessage())
    handler.setLevel(logging.WARNING)
    logger = logging.getLogger('pypdf')
    logger.addHandler(handler)
    try:
        with warnings.catch_warnings(record=True) as parser_warnings:
            warnings.simplefilter('always')
            pdf = PdfReader(path, strict=True)
            require(len(pdf.pages) == 1, 'Technical sheet PDF must have one page')
            page = pdf.pages[0]
            physical = [float(page.mediabox.width) * 25.4 / 72,
                        float(page.mediabox.height) * 25.4 / 72]
            text = page.extract_text()
            pdf.close()
        require(not parser_messages and not parser_warnings, 'Strict PDF parser emitted warnings')
    finally:
        logger.removeHandler(handler)
    for k in range(2):
        close(physical[k], paper[k], .02, 'PDF physical page mm')
    for expected in REQUIRED_TEXT:
        require(expected in text, 'PDF missing measured/title text: ' + expected)
    document = fitz.open(path)
    require(document.page_count == 1, 'Second PDF reader page count mismatch')
    rendered_page = document[0]
    require(not rendered_page.get_images(full=True), 'PDF rasterized the sheet')
    paths = rendered_page.get_drawings()
    lengths = []
    for drawing in paths:
        for item in drawing['items']:
            if item[0] == 'l':
                lengths.append(abs(item[2] - item[1]) * 25.4 / 72)
    # The fixture's 60 mm plate is wider than each ordinary title-block cell.
    # Require multiple physical-width vectors, not just matching printed text.
    matching = [v for v in lengths if abs(v - 60 * scale) < .03]
    require(len(matching) >= 4, 'PDF physical model scale lacks repeated 60mm plate vectors')
    require(len(paths) > 20, 'PDF lacks vector drawing content')
    render_dir.mkdir(parents=True, exist_ok=True)
    png = render_dir / (path.stem + '.png')
    pixmap = rendered_page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
    pixmap.save(png)
    require(len(set(pixmap.samples[::97])) > 5, 'PDF render appears blank')
    document.close()
    return {'file': file_record(path), 'paperMm': physical, 'paperScale': scale,
            'reader': 'pypdf + PyMuPDF', 'vectorPathCount': len(paths),
            'strictParserWarnings': 0,
            'modelWidthPhysicalMm': 60 * scale,
            'matchingModelWidthSegments': len(matching), 'rasterImages': 0,
            'render': {**file_record(png), 'path': str(png.resolve()),
                       'widthPx': pixmap.width, 'heightPx': pixmap.height}}


def read_project(path):
    project = json.loads(path.read_text(encoding='utf-8-sig'))
    require(project['drawings']['version'] == 1, 'Drawing document version1 missing')
    sheets = project['drawings']['sheets']
    stable_fields = any('sourceReferences' in curve
                        for sheet in sheets for view in sheet['views']
                        for curve in view.get('projection', {}).get('curves', [])) or any(
        'curveReferences' in annotation or 'unresolved' in annotation
        for sheet in sheets for annotation in sheet['annotations'])
    required_version = 14 if stable_fields else 12
    require(project['version'] == required_version,
            'Drawing-only fixture needs exact feature-aware project format%d' % required_version)
    require(len(sheets) == 1, 'Expected one saved fixture sheet')
    sheet = sheets[0]
    require(sheet['paper'] == 'A3' and sheet['orientation'] == 'portrait'
            and sheet['scale'] == .5, 'Saved final paper/scale mismatch')
    require([v['kind'] for v in sheet['views']] == ['front', 'top', 'side', 'section'],
            'Saved view order/kinds mismatch')
    require(sheet['views'][3]['section'] == {'axis': 2, 'offset': 3},
            'Saved exact middle section mismatch')
    kinds = collections.Counter(a['kind'] for a in sheet['annotations'])
    require(all(kinds[k] >= 1 for k in ('length', 'angle', 'radius', 'diameter', 'label')),
            'Saved measured references/labels incomplete')
    roots = {n['id']: n for n in project['nodes']}
    require(len(roots) == 1, 'Fixture source root lost or duplicated')
    stable_curve_count = stable_dimension_count = 0

    def references(values):
        require(isinstance(values, list) and 1 <= len(values) <= 8,
                'Stable native edge reference count outside 1..8')
        for value in values:
            require(isinstance(value, dict)
                    and set(value) <= {'source', 'role', 'elementId', 'geometrySignature'}
                    and {'source', 'role'} <= set(value), 'Unexpected provenance fields/face index')
            address, role = value['source'], value['role']
            require(isinstance(address, dict) and set(address) == {'rootId', 'path'}
                    and isinstance(address['path'], list) and len(address['path']) <= 12,
                    'Invalid stable source address')
            source = roots.get(address['rootId'])
            for identifier in address['path']:
                candidates = [child for child in (source or {}).get('children', [])
                              if child.get('id') == identifier]
                require(len(candidates) == 1, 'Lost/ambiguous retained native source path')
                source = candidates[0]
            require(source is not None and source.get('kind') == 'cad',
                    'Native edge source is missing')
            require(isinstance(role, str) and 0 < len(role) <= 300
                    and not re.search(r'[\x00-\x1f]', role), 'Invalid semantic edge role')
            if source.get('source') == 'step':
                require(re.fullmatch(r'step\.edge\.exact\.[a-f0-9]{64}', role) is not None,
                        'STEP edge uses an index or approximate correspondence')
                require(value.get('geometrySignature') == hashlib.sha256(
                    source['brep']['data'].encode('utf-8')).hexdigest(),
                    'STEP reference does not retain the exact original body')
            else:
                require(source.get('source') == 'native' and 'geometrySignature' not in value,
                        'Unexpected nonnative source or invented native body stamp')
                family = source.get('recipe', {}).get('type')
                if family == 'box':
                    match = re.fullmatch(r'box\.edge\.([xyz])\.([xyz])\.(min|max)\.([xyz])\.(min|max)', role)
                    require(match is not None and len({match[1], match[2], match[4]}) == 3,
                            'Box edge lacks an unambiguous named geometric role')
                elif family == 'cylinder':
                    require(role in ('cylinder.edge.cap.min', 'cylinder.edge.cap.max'),
                            'Cylinder edge lacks an exact cap role')
                else:
                    require(family == 'sketch' and re.fullmatch(
                        r'sketch\.cap\.(min|max):sketch\.edge\..+', role) is not None,
                        'Unsupported curve acquired semantic provenance')
                    if 'elementId' in value:
                        require(value['elementId'] in {element['id'] for element in
                                source['recipe']['sketch'].get('elements', [])},
                                'Sketch provenance lost its stable element ID')
        canonical = [json.dumps(value, sort_keys=True, separators=(',', ':')) for value in values]
        require(len(set(canonical)) == len(canonical), 'Duplicate semantic edge reference')
        return tuple(sorted(canonical))

    for view in sheet['views']:
        require(all(source in roots for source in view['sourceIds']), 'Saved source reference lost')
        require(len(view['projection']['sourceSignatures']) == len(view['sourceIds']),
                'Saved cached source signatures missing')
        curve_ids = {c['id'] for c in view['projection']['curves']}
        by_id = {curve['id']: curve for curve in view['projection']['curves']}
        role_sets = collections.Counter()
        for curve in by_id.values():
            if 'sourceReferences' in curve:
                role_sets[references(curve['sourceReferences'])] += 1
                stable_curve_count += 1
        for annotation in sheet['annotations']:
            if annotation.get('viewId') == view['id']:
                require(all(c in curve_ids for c in annotation['curveIds']),
                        'Saved measured element reference lost')
                require(annotation.get('unresolved') is not True,
                        'Unresolved semantic dimension was saved as export-ready')
                if 'curveReferences' in annotation:
                    require(len(annotation['curveReferences']) == len(annotation['curveIds']),
                            'Stable dimension reference count differs')
                    for identifier, ref in zip(annotation['curveIds'], annotation['curveReferences']):
                        require(set(ref) == {'sourceReferences'}, 'Unexpected dimension provenance fields')
                        ref_set = references(ref['sourceReferences'])
                        require(role_sets[ref_set] == 1 and ref_set == references(
                            by_id[identifier].get('sourceReferences')),
                            'Dimension followed an ambiguous or different semantic edge')
                    require(annotation.get('sourceSignatures') == view['projection']['sourceSignatures'],
                            'Semantic dimension retains stale native input signatures')
                    stable_dimension_count += 1
    recipes = []
    def visit(node):
        if 'recipe' in node:
            recipes.append(node['recipe'])
        for child in node.get('children', []):
            visit(child)
    for node in roots.values():
        visit(node)
    require(sum(r.get('type') == 'box' and r.get('size') == [60, 40, 6] for r in recipes) == 1,
            'Original 60x40x6 native plate recipe missing')
    require(sum(r.get('type') == 'cylinder' and r.get('size') == [5, 5, 10] for r in recipes) == 4,
            'Original four5mm native bores missing')
    return {'file': file_record(path), 'version': project['version'], 'sheetCount': len(sheets),
            'viewCount': len(sheet['views']), 'annotationKinds': dict(kinds),
            'originalRecipesRetained': True, 'stableSourceReferences': stable_curve_count,
            'stableDimensionReferences': stable_dimension_count,
            'sourceReferenceRolesVerified': True, 'dimensionReferencesUnique': True}


def read_curve_fixture(path):
    """Optional separately generated exact-curve export with analytic inputs.

    Native/external curve fixture contract: ellipse center(0,5), radii(2,5),
    axes(1,0)/(0,-1), t=.2..2.4; rational quadratic poles(0,0),(1,1),(2,0),
    weights1,.7,1. DXF view offset is(5,0). This verifies orientation as well
    as parser acceptance; the expected values do not come from the exporter.
    """
    doc = ezdxf.readfile(path)
    audit = doc.audit()
    require(not audit.errors and not audit.fixes, 'Exact-curve DXF audit failed')
    ellipses = list(doc.modelspace().query('ELLIPSE'))
    splines = list(doc.modelspace().query('SPLINE'))
    require(len(ellipses) == 1 and len(splines) == 1, 'Exact curve fixture types missing')
    ellipse = ellipses[0].construction_tool()
    params = [t - math.pi / 2 for t in (.2, 1.0, 2.4)]
    actual = list(ellipse.vertices(params))
    for point, t in zip(actual, (.2, 1.0, 2.4)):
        close(point.x, 5 + 2 * math.cos(t), 1e-10, 'Independent mirrored ellipse X')
        close(point.y, 5 - 5 * math.sin(t), 1e-10, 'Independent mirrored ellipse Y')
    spline = splines[0].construction_tool()
    points = list(spline.points([0, .5, 1]))
    for p, expected in zip(points, [(5, 0), (6, .7 / 1.7), (7, 0)]):
        close(p.x, expected[0], 1e-10, 'Independent rational spline X')
        close(p.y, expected[1], 1e-10, 'Independent rational spline Y')
    return {'file': file_record(path), 'ellipseIndependentSamples': 3,
            'rationalSplineIndependentSamples': 3, 'auditErrors': 0, 'auditFixes': 0}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=pathlib.Path)
    parser.add_argument('--curves', type=pathlib.Path)
    args = parser.parse_args()
    directory = args.directory.resolve()
    report = {'ok': False, 'fixture': {'plateMm': [60, 40, 6], 'bores': 4,
                                     'boreDiameterMm': 5, 'sectionZMm': 3},
              'readers': {'python': sys.version.split()[0], 'ezdxf': ezdxf.__version__,
                          'pypdf': importlib.metadata.version('pypdf'),
                          'PyMuPDF': fitz.VersionBind}, 'outputs': []}
    output = directory / 'independent-drawing-exports.json'
    try:
        expected = json.loads((directory / 'drawing-expected.json').read_text(encoding='utf-8-sig'))
        require(expected['plate'] == [60, 40, 6] and expected['bores'] == 4
                and expected['boreRadius'] == 2.5, 'UI fixture no longer matches independent known geometry')
        for stem, (paper, scale) in PAPER.items():
            report['outputs'].append({'name': stem,
                                      'svg': read_svg(directory / (stem + '.svg'), paper, scale),
                                      'dxf': read_dxf(directory / (stem + '.dxf')),
                                      'pdf': read_pdf(directory / (stem + '.pdf'), paper, scale,
                                                      directory / 'independent-drawing-renders')})
        require(report['outputs'][0]['dxf']['geometrySha256'] ==
                report['outputs'][1]['dxf']['geometrySha256'],
                'Paper scale changed DXF native model geometry')
        report['dxfGeometryIdenticalAcrossPaperScales'] = True
        report['project'] = read_project(directory / 'Technische-Zeichnungen.ocad')
        report['finalProject'] = read_project(directory / 'drawing-final.ocad')
        if args.curves:
            report['exactCurveFixture'] = read_curve_fixture(args.curves.resolve())
        report['ok'] = True
    except Exception as error:
        report['error'] = str(error)
        report['traceback'] = traceback.format_exc(limit=8)
        raise
    finally:
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'ok': report['ok'], 'report': str(output)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
