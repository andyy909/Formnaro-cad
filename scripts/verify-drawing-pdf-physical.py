"""Read actual four-paper Electron PDFs without importing application code.

Fixture: a 100 mm square at (20,20) mm from the top left and a 50 mm square
at (140,20) mm, plus text/fonts. Expectations are fixed here independently
of the renderer's result flags. No PDF is authored or modified.
"""
import argparse
import hashlib
import importlib.metadata
import io
import json
import logging
import math
import pathlib
import sys
import traceback
import warnings

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEPENDENCIES = ROOT / 'work' / 'cad-drawings' / 'python'
if DEPENDENCIES.is_dir():
    sys.path.insert(0, str(DEPENDENCIES))
import fitz
from pypdf import PdfReader
from pypdf.generic import IndirectObject, StreamObject, DictionaryObject, ArrayObject

MM = 25.4 / 72
PAPERS = {'A4-portrait': [210, 297], 'A4-landscape': [297, 210],
          'A3-portrait': [297, 420], 'A3-landscape': [420, 297]}
RECTANGLES = [{'xMm': 20, 'topMm': 20, 'widthMm': 100, 'heightMm': 100},
              {'xMm': 140, 'topMm': 20, 'widthMm': 50, 'heightMm': 50}]


def require(value, message):
    if not value:
        raise AssertionError(message)


def close(actual, expected, tolerance, label):
    require(math.isfinite(actual) and abs(actual - expected) <= tolerance,
            '%s actual=%r expected=%r tolerance=%r' % (label, actual, expected, tolerance))


def record(path):
    raw = path.read_bytes()
    return {'name': path.name, 'path': str(path.resolve()), 'bytes': len(raw),
            'sha256': hashlib.sha256(raw).hexdigest()}


def resources_fingerprint(value, seen=None, depth=0):
    """Include dereferenced original font/resource dictionaries and stream bytes."""
    require(depth <= 32, 'PDF resource graph exceeds verification depth')
    seen = set() if seen is None else seen
    if isinstance(value, IndirectObject):
        key = (value.idnum, value.generation)
        if key in seen:
            return {'ref': list(key)}
        seen.add(key)
        return {'ref': list(key), 'value': resources_fingerprint(value.get_object(), seen, depth + 1)}
    if isinstance(value, (DictionaryObject, StreamObject)):
        out = {str(k): resources_fingerprint(value.raw_get(k), seen, depth + 1)
               for k in sorted(value.keys())}
        if isinstance(value, StreamObject):
            out['decodedStreamSha256'] = hashlib.sha256(value.get_data()).hexdigest()
        return out
    if isinstance(value, (ArrayObject, list, tuple)):
        return [resources_fingerprint(v, seen, depth + 1) for v in value]
    return str(value)


def content_references(page):
    value = page.raw_get('/Contents')
    refs = list(value) if isinstance(value, ArrayObject) else [value]
    require(all(isinstance(v, IndirectObject) for v in refs), 'Expected indirect PDF content streams')
    return refs


class ParserLogs(logging.Handler):
    def __init__(self):
        super().__init__(logging.WARNING)
        self.messages = []

    def emit(self, item):
        self.messages.append(item.getMessage())


def verify_paper(directory, item):
    paper = item['paper']
    width, height = PAPERS[paper]
    require([item['widthMm'], item['heightMm']] == [width, height], 'Wrong paper metadata')
    require(item['expectedRectangles'] == RECTANGLES, 'Fixture no longer matches independent square dimensions')
    file = directory / (paper + '.pdf')
    original_file = directory / (paper + '-raw.pdf')
    require(pathlib.Path(item['file']).resolve() == file.resolve()
            and pathlib.Path(item['rawFile']).resolve() == original_file.resolve(),
            'Physical proof files outside expected fixture directory')
    actual_record, raw_record = record(file), record(original_file)
    require(actual_record['sha256'] == item['sha256'] and raw_record['sha256'] == item['rawSha256'],
            'Actual PDF bytes differ from Electron file receipts')
    data, original_data = file.read_bytes(), original_file.read_bytes()
    require(data.startswith(original_data) and len(data) > len(original_data),
            'Incremental output did not preserve every original byte')
    logger = logging.getLogger('pypdf')
    handler = ParserLogs()
    logger.addHandler(handler)
    try:
        with warnings.catch_warnings(record=True) as warning_list:
            warnings.simplefilter('always')
            original = PdfReader(io.BytesIO(original_data), strict=True)
            pdf = PdfReader(io.BytesIO(data), strict=True)
            require(len(pdf.pages) == len(original.pages) == 1, 'One-page PDF expected')
            page, raw_page = pdf.pages[0], original.pages[0]
            boxes = {}
            for key in ('mediabox', 'cropbox'):
                box = getattr(page, key)
                actual = [float(v) * MM for v in box]
                for axis, expected in enumerate([0, 0, width, height]):
                    close(actual[axis], expected, 1e-6, paper + ' ' + key)
                boxes[key] = actual
            require(resources_fingerprint(page.raw_get('/Resources')) ==
                    resources_fingerprint(raw_page.raw_get('/Resources')),
                    'Original font/resource objects or bytes changed')
            old_contents, new_contents = content_references(raw_page), content_references(page)
            ids = lambda values: [(v.idnum, v.generation) for v in values]
            require(ids(new_contents[1:-1]) == ids(old_contents),
                    'Original vector/text content references changed')
            prefix = new_contents[0].get_object().get_data().decode('ascii')
            suffix = new_contents[-1].get_object().get_data().decode('ascii')
            require(prefix.startswith('q\n1 0 0 1 0 ') and prefix.endswith(' cm\n') and suffix == 'Q\n',
                    'Unexpected transform or geometry appended around original content')
            actual_translation = float(prefix.split()[6])
            close(actual_translation, height / MM - float(raw_page.mediabox.height), 1e-8,
                  'Top-left paper-origin translation')
            text = page.extract_text()
            for required in [paper, '100 mm', '50 mm', 'Maß', 'Ø 6']:
                require(required in text, 'Original physical fixture text/font missing: ' + required)
            original.close()
            pdf.close()
        require(not warning_list and not handler.messages,
                'Strict PDF parser warnings: ' + str([str(w.message) for w in warning_list] + handler.messages))
    finally:
        logger.removeHandler(handler)

    fitz.TOOLS.mupdf_warnings(reset=True)
    document = fitz.open(file)
    page = document[0]
    require(not page.get_images(full=True), 'Physical fixture was rasterized')
    require(page.get_fonts(full=True), 'Physical fixture font resources missing')
    paths = page.get_drawings()
    rectangles = []
    for drawing in paths:
        for geometry in drawing['items']:
            if geometry[0] == 're':
                r = geometry[1]
                rectangles.append({'xMm': r.x0 * MM, 'topMm': r.y0 * MM,
                                   'widthMm': r.width * MM, 'heightMm': r.height * MM})
    matched = []
    for expected in RECTANGLES:
        candidates = [r for r in rectangles if all(abs(r[k] - expected[k]) <= .01 for k in expected)]
        require(len(candidates) == 1, '100/50mm exact-scale square or20mm anchor missing/ambiguous')
        matched.append(candidates[0])
    render_dir = directory / 'independent-pdf-physical-renders'
    render_dir.mkdir(exist_ok=True)
    image = render_dir / (paper + '.png')
    pixmap = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
    pixmap.save(image)
    require(len(set(pixmap.samples[::97])) > 5, 'Physical PDF render appears blank')
    document.close()
    mupdf_warnings = fitz.TOOLS.mupdf_warnings(reset=True)
    require(not mupdf_warnings, 'Rendering/parser warnings: ' + mupdf_warnings)
    return {'paper': paper, 'expectedPaperMm': [width, height], 'file': actual_record,
            'rawFile': raw_record, 'boxesMm': boxes, 'strictParserWarnings': 0,
            'renderParserWarnings': 0, 'originalPrefixPreserved': True,
            'originalPrefixBytes': len(original_data), 'resourcesUnchanged': True,
            'originalContentStreamsRetained': len(old_contents),
            'rectanglesMm': matched, 'vectorPathCount': len(paths), 'rasterImages': 0,
            'render': record(image)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=pathlib.Path)
    args = parser.parse_args()
    directory = args.directory.resolve()
    result_file = directory / 'result.json'
    output = directory / 'independent-pdf-physical.json'
    result = {'ok': False, 'readers': {'python': sys.version.split()[0],
                                    'pypdf': importlib.metadata.version('pypdf'),
                                    'PyMuPDF': fitz.VersionBind},
              'bounds': {'paperMm': 1e-6, 'geometryAndAnchorMm': .01}, 'papers': []}
    try:
        fixture = json.loads(result_file.read_text(encoding='utf-8-sig'))
        require(fixture['ok'] is True and fixture['isolatedProfile'] is True,
                'Incomplete or nonisolated physical PDF Electron gate')
        require(len(fixture['papers']) == 4 and set(p['paper'] for p in fixture['papers']) == set(PAPERS),
                'All four A4/A3 orientations required')
        result['electronResult'] = record(result_file)
        for item in fixture['papers']:
            result['papers'].append(verify_paper(directory, item))
        result['ok'] = True
    except Exception as error:
        result['error'] = str(error)
        result['traceback'] = traceback.format_exc(limit=8)
        raise
    finally:
        output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'ok': result['ok'], 'report': str(output)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
