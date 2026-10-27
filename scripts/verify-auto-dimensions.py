"""Independent readers for the actual native 60/40/6 four-bore UI fixture.
No application or exporter modules are imported. Verify geometric witnesses,
physical paper, DXF geometry and all displayed measurement texts together.
"""
import collections
import hashlib
import json
import math
import pathlib
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'work/cad-drawings/python'))
import ezdxf
from pypdf import PdfReader


def record(file):
    return dict(file=str(file.resolve()), bytes=file.stat().st_size,
                sha256=hashlib.sha256(file.read_bytes()).hexdigest())


def point(curve, role):
    if role in ('a', 'b'):
        assert curve['kind'] == 'line'
        return curve[role]
    if role == 'center':
        assert curve['kind'] == 'circle'
        return curve['center']
    axis, sign = (0 if role.endswith('X') else 1), (-1 if role.startswith('min') else 1)
    if curve['kind'] == 'line':
        return sorted([curve['a'], curve['b']], key=lambda p: p[axis])[0 if sign < 0 else 1]
    assert curve['kind'] == 'circle'
    return [v + (curve['radius'] * sign if k == axis else 0)
            for k, v in enumerate(curve['center'])]


def decode_package(file):
    data = file.read_bytes()
    assert data[:8] == b'FNPACK\r\n' and int.from_bytes(data[8:12], 'little') == 1
    count = int.from_bytes(data[12:16], 'little')
    raw = data[64:64+count]
    assert hashlib.sha256(raw).digest() == data[16:48]
    index, offset, blocks = json.loads(raw), 0, {}
    for block in index['blocks']:
        assert block['offset'] == offset
        content = data[64+count+offset:64+count+offset+block['bytes']]
        assert len(content) == block['bytes'] and hashlib.sha256(content).hexdigest() == block['sha256']
        blocks[block['sha256']] = content
        offset += block['bytes']
    assert len(data) == 64+count+offset
    def hydrate(value):
        if isinstance(value, list):
            return [hydrate(v) for v in value]
        if not isinstance(value, dict):
            return value
        if value.get('format') == 'Formnaro-GeometryRef':
            data = blocks[value['sha256']]
            assert len(data) == value['bytes']
            return dict(format='OpenCascade-BRep', triangulation=False, data=data.decode('utf-8')) if value['kind'] == 'brep' else json.loads(data)
        return {k: hydrate(v) for k, v in value.items() if k != 'geometryIdentity'}
    index['resolvedNodes'] = hydrate(index['project']['nodes'])
    return index


def main(directory):
    checks, files = [], []
    project_file = directory / 'Automatische-Bemassung.ocad'
    project = json.loads(project_file.read_text('utf-8'))
    assert project['version'] == 18 and len(project['nodes']) == 1
    sheet = project['drawings']['sheets'][0]
    assert sheet['paper'] == 'A3' and sheet['orientation'] == 'landscape'
    assert len(sheet['views']) == 3 and len(sheet['annotations']) == 12
    assert len(project['nodes'][0]['children']) == 5
    assert project['nodes'][0]['children'][0]['recipe']['size'] == [60, 40, 6]
    checks.append('actual format18 source plate, four retained bores and twelve measurements')
    views, measured, expected_texts = {v['id']: v for v in sheet['views']}, [], []
    for annotation in sheet['annotations']:
        view = views[annotation['viewId']]
        curves = {c['id']: c for c in view['projection']['curves']}
        assert annotation['sourceSignatures'] == view['projection']['sourceSignatures']
        assert not annotation.get('unresolved')
        if annotation['kind'] == 'diameter':
            curve = curves[annotation['curveIds'][0]]
            assert curve['kind'] == 'circle' and curve['radius'] == 2.5
            value, text = curve['radius']*2, 'Ø 5 mm'
        else:
            assert annotation['kind'] == 'distance'
            witnesses = [point(curves[annotation['curveIds'][p['curveIndex']]], p['point'])
                         for p in annotation['anchors']]
            axis = 0 if annotation['axis'] == 'x' else 1
            value = abs(witnesses[0][axis]-witnesses[1][axis])
            text = f'{value:g} mm'
        measured.append(value)
        expected_texts.append(text)
    assert all(abs(a-b) < 1e-7 for a, b in zip(sorted(measured), [5, 5, 5, 5, 6, 8, 8, 32, 40, 44, 52, 60]))
    checks.append('independently recomputed overall dimensions, four diameters and datum/centre distances')
    svg_file = directory / 'auto-a3.svg'
    svg = ET.parse(svg_file).getroot()
    assert [float(svg.attrib[k].removesuffix('mm')) for k in ('width', 'height')] == [420, 297]
    svg_texts = collections.Counter(e.text for e in svg.iter('{http://www.w3.org/2000/svg}text'))
    for text, count in collections.Counter(expected_texts).items():
        assert svg_texts[text] == count, ('SVG', text, count, svg_texts[text])
    assert not list(svg.iter('{http://www.w3.org/2000/svg}image'))
    checks.append('actual SVG paper and every displayed value agree with independent geometry')
    dxf_file = directory / 'auto-a3.dxf'
    dxf = ezdxf.readfile(dxf_file)
    audit = dxf.audit()
    assert not audit.errors and not audit.fixes and dxf.header['$INSUNITS'] == 4
    space = dxf.modelspace()
    dxf_texts = collections.Counter(re.sub(r'\\U\+([0-9A-Fa-f]{4})', lambda m: chr(int(m[1], 16)), e.dxf.text) for e in space.query('TEXT'))
    for text, count in collections.Counter(expected_texts).items():
        assert dxf_texts[text] == count, ('DXF', text)
    for layer, size in [('VIEW_1', [60, 6]), ('VIEW_2', [60, 40]), ('VIEW_3', [40, 6])]:
        points = [p for line in space.query(f'LINE[layer=="{layer}"]')
                  for p in (line.dxf.start, line.dxf.end)]
        assert points
        for k in range(2):
            assert abs(max(p[k] for p in points)-min(p[k] for p in points)-size[k]) < 1e-6
    checks.append('actual DXF reparses without repairs and retains native 1:1 mm geometry and dimension texts')
    pdf_file = directory / 'auto-a3.pdf'
    pdf = PdfReader(pdf_file, strict=True)
    assert len(pdf.pages) == 1
    page = pdf.pages[0]
    assert abs(float(page.mediabox.width)*25.4/72-420) < .001
    assert abs(float(page.mediabox.height)*25.4/72-297) < .001
    text = page.extract_text()
    for value, count in collections.Counter(expected_texts).items():
        assert text.count(value) >= count, ('PDF', value, text)
    for obj in page['/Resources'].get('/XObject', {}).values():
        assert obj.get_object().get('/Subtype') != '/Image'
    checks.append('actual vector PDF has exact A3 paper and all physical dimension values')
    package_file = directory / 'Automatische-Bemassung.fnpack'
    package = decode_package(package_file)
    assert package['project']['version'] == 18
    assert package['project']['drawings'] == project['drawings']
    assert package['resolvedNodes'] == project['nodes']
    checks.append('independently decoded fnpack index and every geometry-block hash preserve the complete drawing')
    library_file = directory / 'Automatische-Bemassung.oclibrary'
    library = json.loads(library_file.read_text('utf-8'))
    assert library['version'] == 18 and len(library['items']) == 1
    assert library['items'][0]['project']['version'] == 18
    assert library['items'][0]['project']['nodes'] == project['nodes']
    assert library['items'][0]['project']['drawings'] == project['drawings']
    checks.append('actual library18 independently retains every original source byte and measurement witness')
    render = directory / 'auto-a3-poppler.png'
    subprocess.run(['pdftoppm', '-png', '-r', '120', '-singlefile', str(pdf_file),
                    str(render.with_suffix(''))], check=True, capture_output=True)
    assert render.stat().st_size > 10000
    for file in [project_file, svg_file, dxf_file, pdf_file, package_file, library_file, render]:
        files.append(record(file))
    report = dict(ok=True, checks=checks, measurements=measured, files=files,
                  projectVersion=18, paperMm=[420, 297], geometryScale=1,
                  independent=True, packageBlocks=len(package['blocks']))
    (directory / 'independent-auto-dimensions.json').write_text(json.dumps(report, indent=2), 'utf-8')
    print(json.dumps(dict(ok=True, checks=len(checks), files=len(files))))


if __name__ == '__main__':
    main(pathlib.Path(sys.argv[1]).resolve())
