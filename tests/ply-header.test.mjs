import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePlyHeader, PLY_FORMATS, PLY_HEADER_LIMITS, PLY_SCALAR_TYPES } from '../src/ply-header.js';

const LF = '\n';
const CRLF = '\r\n';
const encode = (text) => new TextEncoder().encode(text);

function bytesOf(...parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function headerText(lines, ending = LF) {
  return lines.join(ending) + ending;
}

function parseLines(lines, ending = LF) {
  return parsePlyHeader(encode(headerText(lines, ending)));
}

function rejects(lines, pattern, ending = LF) {
  assert.throws(() => parseLines(lines, ending), pattern);
}

test('reads an LF point-cloud header in declaration order and ignores the payload', () => {
  const lines = [
    'ply',
    'format ascii 1.0',
    'comment CloudCompare export',
    'obj_info scanned with 12 points',
    'element vertex 3',
    'property float32 x',
    'property float y',
    'property float64 z',
    'property uint8 intensity',
    'end_header',
  ];
  const text = headerText(lines);
  const payload = Uint8Array.of(0x31, 0x20, 0x32, 0x20, 0x33, 0x0a, 0x00, 0x80, 0xff);
  const bytes = bytesOf(encode(text), payload);
  const result = parsePlyHeader(bytes);

  assert.equal(result.format, 'ascii');
  assert.equal(result.version, '1.0');
  assert.equal(result.dataOffset, text.length);
  assert.deepEqual(result.elements, [
    {
      name: 'vertex',
      count: 3,
      properties: [
        { name: 'x', kind: 'scalar', type: 'float' },
        { name: 'y', kind: 'scalar', type: 'float' },
        { name: 'z', kind: 'scalar', type: 'double' },
        { name: 'intensity', kind: 'scalar', type: 'uchar' },
      ],
    },
  ]);
  assert.deepEqual(result.comments, ['CloudCompare export']);
  assert.deepEqual(result.objInfo, ['scanned with 12 points']);
  assert.deepEqual(Array.from(bytes.subarray(result.dataOffset, result.dataOffset + 3)), [0x31, 0x20, 0x32]);
});

test('counts CRLF and mixed line endings into the data offset', () => {
  const lines = [
    'ply',
    'format ascii 1.0',
    'element vertex 1',
    'property float x',
    'property float y',
    'property float z',
    'end_header',
  ];
  const crlfText = headerText(lines, CRLF);
  const crlf = parsePlyHeader(bytesOf(encode(crlfText), Uint8Array.of(1, 2, 3)));
  assert.equal(crlf.dataOffset, crlfText.length);
  assert.equal(crlf.dataOffset, encode(crlfText).length);

  const mixedText = 'ply\nformat ascii 1.0\r\nelement vertex 1\nproperty float x\r\nproperty float y\nend_header\r\n';
  const mixed = parsePlyHeader(bytesOf(encode(mixedText), encode('1 2\n')));
  assert.equal(mixed.dataOffset, mixedText.length);
  assert.equal(mixed.elements[0].properties.length, 2);

  const unterminated = encode('ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nend_header');
  const atEnd = parsePlyHeader(unterminated);
  assert.equal(atEnd.dataOffset, unterminated.length);
});

test('accepts foreign headers with comments, obj_info, tabs and all three formats', () => {
  for (const format of PLY_FORMATS) {
    const result = parseLines(['ply', `format ${format} 1.0`, 'element vertex 0', 'property float x', 'end_header']);
    assert.equal(result.format, format);
  }

  const lines = [
    'ply',
    'format binary_little_endian 1.0',
    'comment Created by MeshLab',
    'comment project file: sample.ply',
    'obj_info num_cols 640',
    '\telement\tvertex\t8',
    'property\tdouble\tx',
    'property\tdouble\ty  ',
    '\tproperty\tdouble\tz',
    'element face 12',
    'property list uchar int vertex_indices',
    'property list uint8 float32 quality',
    'end_header',
  ];
  const result = parseLines(lines, CRLF);
  assert.equal(result.format, 'binary_little_endian');
  assert.deepEqual(
    result.elements.map((element) => element.name),
    ['vertex', 'face'],
  );
  assert.deepEqual(
    result.elements.map((element) => element.count),
    [8, 12],
  );
  assert.deepEqual(
    result.elements[0].properties.map((property) => property.name),
    ['x', 'y', 'z'],
  );
  assert.deepEqual(result.elements[1].properties, [
    { name: 'vertex_indices', kind: 'list', countType: 'uchar', itemType: 'int' },
    { name: 'quality', kind: 'list', countType: 'uchar', itemType: 'float' },
  ]);
  assert.deepEqual(result.comments, ['Created by MeshLab', 'project file: sample.ply']);
  assert.deepEqual(result.objInfo, ['num_cols 640']);
});

test('normalises every standard scalar alias and list type', () => {
  for (const [alias, canonical] of Object.entries(PLY_SCALAR_TYPES)) {
    const result = parseLines(['ply', 'format ascii 1.0', 'element sample 1', `property ${alias} value`, 'end_header']);
    assert.deepEqual(result.elements[0].properties, [{ name: 'value', kind: 'scalar', type: canonical }]);
  }

  const integerAliases = Object.entries(PLY_SCALAR_TYPES).filter(([, type]) =>
    ['char', 'uchar', 'short', 'ushort', 'int', 'uint'].includes(type),
  );
  for (const [alias, canonical] of integerAliases) {
    const result = parseLines([
      'ply',
      'format ascii 1.0',
      'element sample 1',
      `property list ${alias} ${alias} values`,
      'end_header',
    ]);
    assert.deepEqual(result.elements[0].properties, [
      { name: 'values', kind: 'list', countType: canonical, itemType: canonical },
    ]);
  }
});

test('rejects non-bytes, empty input and non-ASCII or control bytes', () => {
  for (const value of [undefined, null, 'ply', new ArrayBuffer(4), [1, 2, 3]])
    assert.throws(() => parsePlyHeader(value), TypeError);

  assert.throws(() => parsePlyHeader(new Uint8Array()), /leer/);
  assert.throws(
    () => parsePlyHeader(encode('\uFEFFply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nend_header\n')),
    /ASCII/,
  );
  assert.throws(
    () =>
      parsePlyHeader(encode('ply\nformat ascii 1.0\ncomment Größe\nelement vertex 1\nproperty float x\nend_header\n')),
    /ASCII/,
  );
  const nul = bytesOf(
    encode('ply\nformat ascii 1.0\ncomment '),
    Uint8Array.of(0x00),
    encode('\nelement vertex 1\nproperty float x\nend_header\n'),
  );
  assert.throws(() => parsePlyHeader(nul), /Steuerzeichen/);
  assert.throws(
    () => parsePlyHeader(encode('ply\rformat ascii 1.0\nelement vertex 1\nproperty float x\nend_header\n')),
    /Steuerzeichen|Zeilenende/,
  );
});

test('rejects missing or misplaced directives and broken line structure', () => {
  assert.throws(() => parseLines(['PLY', 'format ascii 1.0', 'end_header']), /beginnt nicht mit "ply"/);
  assert.throws(() => parseLines(['ply 1.0', 'format ascii 1.0', 'end_header']), /zusätzliche Angaben/);
  rejects(
    ['ply', 'comment early', 'format ascii 1.0', 'element vertex 1', 'property float x', 'end_header'],
    /format-Zeile muss direkt/,
  );
  rejects(['ply', 'format ascii 1.1', 'element vertex 1', 'property float x', 'end_header'], /Version/);
  rejects(['ply', 'format text 1.0', 'element vertex 1', 'property float x', 'end_header'], /Format/);
  rejects(
    ['ply', 'format ascii 1.0', 'format ascii 1.0', 'element vertex 1', 'property float x', 'end_header'],
    /mehrere format/,
  );
  rejects(['ply', 'format ascii 1.0', '', 'element vertex 1', 'property float x', 'end_header'], /leer/);
  rejects(['ply', 'format ascii 1.0', 'element vertex 1', 'property float x'], /end_header/);
  rejects(
    ['ply', 'format ascii 1.0', 'element vertex 1', 'property float x', 'end_header extra'],
    /zusätzliche Angaben/,
  );
  rejects(
    ['ply', 'format ascii 1.0', 'element vertex 1', 'property float x', 'mystery 1', 'end_header'],
    /unbekannte Anweisung/,
  );
  assert.throws(
    () => parsePlyHeader(encode('ply\nformat ascii 1.0\nelement vertex 1\nproperty float x')),
    /unvollständig/,
  );
});

test('rejects contradictory element and property declarations', () => {
  rejects(
    [
      'ply',
      'format ascii 1.0',
      'element vertex 1',
      'property float x',
      'element vertex 1',
      'property float y',
      'end_header',
    ],
    /doppelt/,
  );
  rejects(
    ['ply', 'format ascii 1.0', 'element vertex 1', 'property float x', 'property double x', 'end_header'],
    /doppelt/,
  );
  rejects(
    ['ply', 'format ascii 1.0', 'property float x', 'element vertex 1', 'property float x', 'end_header'],
    /außerhalb eines Elements/,
  );
  rejects(['ply', 'format ascii 1.0', 'element vertex 1', 'end_header'], /keine Eigenschaften/);
  rejects(
    [
      'ply',
      'format ascii 1.0',
      'element vertex 1',
      'element face 0',
      'property list uchar int vertex_indices',
      'end_header',
    ],
    /keine Eigenschaften/,
  );
});

test('rejects invalid counts, types and list declarations', () => {
  for (const count of ['-1', '1.5', 'many', '2147483648', '', '1 2'])
    rejects(
      ['ply', 'format ascii 1.0', `element vertex ${count}`, 'property float x', 'end_header'],
      /Elementanzahl|Anzahl/,
    );

  rejects(['ply', 'format ascii 1.0', 'element vertex 1 extra', 'property float x', 'end_header'], /Name und Anzahl/);
  rejects(['ply', 'format ascii 1.0', 'element vertex 1', 'property float x extra', 'end_header'], /Typ und Namen/);
  rejects(['ply', 'format ascii 1.0', 'element vertex 1', 'property list uchar int', 'end_header'], /Zählertyp/);
  rejects(
    ['ply', 'format ascii 1.0', 'element vertex 1', 'property list uchar int index extra', 'end_header'],
    /Zählertyp/,
  );
  rejects(['ply', 'format ascii 1.0', 'element vertex 1', 'property half x', 'end_header'], /Eigenschaftstyp/);
  rejects(['ply', 'format ascii 1.0', 'element vertex 1', 'property int64 x', 'end_header'], /Eigenschaftstyp/);
  rejects(
    ['ply', 'format ascii 1.0', 'element vertex 1', 'property list float int index', 'end_header'],
    /Ganzzahltyp/,
  );
  rejects(
    ['ply', 'format ascii 1.0', 'element vertex 1', 'property list uchar int64 index', 'end_header'],
    /Listenelementtyp/,
  );
  rejects(
    [
      'ply',
      'format ascii 1.0',
      'element vertex 1',
      `property float ${'x'.repeat(PLY_HEADER_LIMITS.nameLength + 1)}`,
      'end_header',
    ],
    /länger/,
  );
});

test('enforces byte, line, element and property limits', () => {
  assert.ok(Object.isFrozen(PLY_HEADER_LIMITS));
  assert.ok(Object.isFrozen(PLY_FORMATS));
  assert.ok(Object.isFrozen(PLY_SCALAR_TYPES));

  const tooManyLines = ['ply', 'format ascii 1.0', 'element vertex 1', 'property float x'];
  for (let index = 0; index <= PLY_HEADER_LIMITS.lines; index += 1) tooManyLines.push('comment x');
  tooManyLines.push('end_header');
  rejects(tooManyLines, /Zeilen/);

  rejects(
    [
      'ply',
      'format ascii 1.0',
      `comment ${'x'.repeat(PLY_HEADER_LIMITS.lineBytes)}`,
      'element vertex 1',
      'property float x',
      'end_header',
    ],
    /zu lang/,
  );

  const tooManyElements = ['ply', 'format ascii 1.0'];
  for (let index = 0; index <= PLY_HEADER_LIMITS.elements; index += 1) {
    tooManyElements.push(`element e${index} 1`);
    tooManyElements.push('property float x');
  }
  tooManyElements.push('end_header');
  rejects(tooManyElements, /mehr als 256 Elemente/);

  const tooManyProperties = ['ply', 'format ascii 1.0'];
  for (let element = 0; element < 9; element += 1) {
    tooManyProperties.push(`element e${element} 1`);
    for (let property = 0; property < PLY_HEADER_LIMITS.propertiesPerElement; property += 1)
      tooManyProperties.push(`property float p${element}_${property}`);
  }
  tooManyProperties.push('end_header');
  rejects(tooManyProperties, /mehr als 2048 Eigenschaften/);

  const oversized = ['ply', 'format ascii 1.0', 'element vertex 1', 'property float x'];
  for (let index = 0; index < 1100; index += 1) oversized.push(`comment ${'x'.repeat(1000)}`);
  oversized.push('end_header');
  rejects(oversized, /überschreitet/);
});

test('keeps point clouds valid and preserves element order, including zero counts', () => {
  const pointCloud = parseLines([
    'ply',
    'format ascii 1.0',
    'element vertex 0',
    'property float x',
    'property float y',
    'property float z',
    'end_header',
  ]);
  assert.equal(pointCloud.elements.length, 1);
  assert.equal(pointCloud.elements[0].count, 0);
  assert.deepEqual(
    pointCloud.elements[0].properties.map((property) => property.name),
    ['x', 'y', 'z'],
  );

  const ordered = parseLines([
    'ply',
    'format ascii 1.0',
    'element vertex 1',
    'property float x',
    'element face 0',
    'property list uchar int vertex_indices',
    'element edge 0',
    'property int vertex1',
    'property int vertex2',
    'end_header',
  ]);
  assert.deepEqual(
    ordered.elements.map((element) => element.name),
    ['vertex', 'face', 'edge'],
  );
  assert.deepEqual(ordered.elements[1].properties[0], {
    name: 'vertex_indices',
    kind: 'list',
    countType: 'uchar',
    itemType: 'int',
  });
});
