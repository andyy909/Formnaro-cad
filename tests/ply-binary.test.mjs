import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePlyHeader } from '../src/ply-header.js';
import { readPlyBinaryPayload, PLY_BINARY_LIMITS } from '../src/ply-binary.js';

const encode = (text) => new TextEncoder().encode(text);

function join(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function makeFile(lines, payload = new Uint8Array()) {
  const text = encode(lines.join('\n') + '\n');
  const bytes = join([text, payload]);
  return { bytes, header: parsePlyHeader(bytes) };
}

function payloadWriter(format) {
  const little = format === 'binary_little_endian';
  const parts = [];

  function push(size, write) {
    const bytes = new Uint8Array(size);
    write(new DataView(bytes.buffer));
    parts.push(bytes);
  }

  return {
    char: (value) => push(1, (view) => view.setInt8(0, value)),
    uchar: (value) => push(1, (view) => view.setUint8(0, value)),
    short: (value) => push(2, (view) => view.setInt16(0, value, little)),
    ushort: (value) => push(2, (view) => view.setUint16(0, value, little)),
    int: (value) => push(4, (view) => view.setInt32(0, value, little)),
    uint: (value) => push(4, (view) => view.setUint32(0, value, little)),
    float: (value) => push(4, (view) => view.setFloat32(0, value, little)),
    double: (value) => push(8, (view) => view.setFloat64(0, value, little)),
    bytes: () => join(parts),
  };
}

function handmadeHeader(elements, overrides = {}) {
  return {
    format: 'binary_little_endian',
    version: '1.0',
    dataOffset: 0,
    elements,
    comments: [],
    objInfo: [],
    ...overrides,
  };
}

test('collects only named little-endian properties and skips the rest', () => {
  const writer = payloadWriter('binary_little_endian');
  for (const [x, y, z, red, green, blue, alpha] of [
    [1.5, 2.5, 3.5, 10, 20, 30, 255],
    [-4.5, -5.5, -6.5, 40, 50, 60, 128],
  ]) {
    writer.float(x);
    writer.float(y);
    writer.float(z);
    writer.uchar(red);
    writer.uchar(green);
    writer.uchar(blue);
    writer.uchar(alpha);
  }

  const { bytes, header } = makeFile(
    [
      'ply',
      'format binary_little_endian 1.0',
      'element vertex 2',
      'property float x',
      'property float y',
      'property float z',
      'property uchar red',
      'property uchar green',
      'property uchar blue',
      'property uchar alpha',
      'end_header',
    ],
    writer.bytes(),
  );

  const points = [];
  const summary = readPlyBinaryPayload(bytes, header, {
    onRow(row) {
      assert.equal(row.element.name, 'vertex');
      assert.equal(row.elementIndex, 0);
      assert.equal(row.has('red'), true);
      assert.equal(row.has('missing'), false);
      points.push([row.rowIndex, row.scalar('x'), row.scalar('y'), row.scalar('z')]);
    },
  });

  assert.deepEqual(points, [
    [0, 1.5, 2.5, 3.5],
    [1, -4.5, -5.5, -6.5],
  ]);
  assert.equal(summary.format, 'binary_little_endian');
  assert.equal(summary.elementCount, 1);
  assert.equal(summary.rowsRead, 2);
  assert.equal(summary.valuesRead, 14);
  assert.equal(summary.listItemsRead, 0);
});

test('reads big-endian doubles and integer face lists', () => {
  const writer = payloadWriter('binary_big_endian');
  for (const point of [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
  ]) {
    writer.double(point[0]);
    writer.double(point[1]);
    writer.double(point[2]);
  }
  writer.uchar(3);
  writer.int(0);
  writer.int(1);
  writer.int(2);

  const { bytes, header } = makeFile(
    [
      'ply',
      'format binary_big_endian 1.0',
      'element vertex 3',
      'property double x',
      'property double y',
      'property double z',
      'element face 1',
      'property list uchar int vertex_indices',
      'end_header',
    ],
    writer.bytes(),
  );

  const vertices = [];
  const faces = [];
  const summary = readPlyBinaryPayload(bytes, header, {
    onRow(row) {
      if (row.element.name === 'vertex') {
        vertices.push([row.scalar('x'), row.scalar('y'), row.scalar('z')]);
      } else {
        faces.push(row.list('vertex_indices'));
      }
    },
  });

  assert.deepEqual(vertices, [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
  ]);
  assert.deepEqual(faces, [[0, 1, 2]]);
  assert.equal(summary.rowsRead, 4);
  assert.equal(summary.listItemsRead, 3);
});

test('reads every numeric scalar type in both byte orders', () => {
  const values = {
    char: -128,
    uchar: 255,
    short: -32768,
    ushort: 65535,
    int: -2147483648,
    uint: 4294967295,
    float: -2.25,
    double: 1.5,
  };
  const types = Object.keys(values);

  for (const format of ['binary_little_endian', 'binary_big_endian']) {
    const writer = payloadWriter(format);
    for (const type of types) writer[type](values[type]);

    const { bytes, header } = makeFile(
      [
        'ply',
        `format ${format} 1.0`,
        'element sample 1',
        ...types.map((type) => `property ${type} ${type}`),
        'end_header',
      ],
      writer.bytes(),
    );

    const collected = {};
    readPlyBinaryPayload(bytes, header, {
      onRow(row) {
        for (const type of types) collected[type] = row.scalar(type);
      },
    });
    assert.deepEqual(collected, values, format);
  }
});

test('skips unknown lists and scalars before and after a known property', () => {
  const writer = payloadWriter('binary_little_endian');
  writer.uchar(2);
  writer.int(-7);
  writer.int(9);
  writer.double(1234.5);
  writer.float(0.5);
  writer.uchar(1);
  writer.ushort(60000);

  const { bytes, header } = makeFile(
    [
      'ply',
      'format binary_little_endian 1.0',
      'element sample 1',
      'property list uchar int unknown_list',
      'property double unknown_scalar',
      'property float known',
      'property list uchar ushort unknown_tail',
      'end_header',
    ],
    writer.bytes(),
  );

  let known;
  const summary = readPlyBinaryPayload(bytes, header, {
    onRow(row) {
      assert.equal(row.has('unknown_list'), true);
      known = row.scalar('known');
    },
  });

  assert.equal(known, 0.5);
  assert.equal(summary.rowsRead, 1);
  assert.equal(summary.valuesRead, 7);
  assert.equal(summary.listItemsRead, 3);
});

test('allows forward access, explicit skips and rejects backward reads', () => {
  const writer = payloadWriter('binary_little_endian');
  writer.float(1);
  writer.float(2);
  writer.float(3);

  const { bytes, header } = makeFile(
    [
      'ply',
      'format binary_little_endian 1.0',
      'element vertex 1',
      'property float x',
      'property float y',
      'property float z',
      'end_header',
    ],
    writer.bytes(),
  );

  let z;
  readPlyBinaryPayload(bytes, header, {
    onRow(row) {
      z = row.scalar('z');
    },
  });
  assert.equal(z, 3);

  assert.throws(
    () =>
      readPlyBinaryPayload(bytes, header, {
        onRow(row) {
          row.skip('x');
          assert.equal(row.scalar('y'), 2);
          row.scalar('x');
        },
      }),
    /bereits gelesen/,
  );

  assert.throws(
    () =>
      readPlyBinaryPayload(bytes, header, {
        onRow(row) {
          row.scalar('missing');
        },
      }),
    /unbekannte Eigenschaft/,
  );

  assert.throws(
    () =>
      readPlyBinaryPayload(bytes, header, {
        onRow(row) {
          row.list('x');
        },
      }),
    /kein Listenfeld/,
  );
});

test('rejects using a list as scalar and a scalar as list', () => {
  const writer = payloadWriter('binary_little_endian');
  writer.uchar(1);
  writer.int(5);
  writer.float(1);

  const { bytes, header } = makeFile(
    [
      'ply',
      'format binary_little_endian 1.0',
      'element sample 1',
      'property list uchar int indices',
      'property float x',
      'end_header',
    ],
    writer.bytes(),
  );

  assert.throws(
    () =>
      readPlyBinaryPayload(bytes, header, {
        onRow(row) {
          row.scalar('indices');
        },
      }),
    /ist eine Liste/,
  );

  assert.throws(
    () =>
      readPlyBinaryPayload(bytes, header, {
        onRow(row) {
          row.list('x');
        },
      }),
    /kein Listenfeld/,
  );
});

test('reuses one row object and reports element order including empty elements', () => {
  const writer = payloadWriter('binary_little_endian');
  writer.float(1);
  writer.float(2);
  writer.float(3);
  writer.float(4);

  const { bytes, header } = makeFile(
    [
      'ply',
      'format binary_little_endian 1.0',
      'element vertex 2',
      'property float x',
      'property float y',
      'element edge 0',
      'property int a',
      'property int b',
      'end_header',
    ],
    writer.bytes(),
  );

  const order = [];
  const rows = [];
  let firstRow;
  const summary = readPlyBinaryPayload(bytes, header, {
    onElement(element, index) {
      order.push([element.name, index]);
    },
    onRow(row) {
      firstRow ??= row;
      assert.equal(row, firstRow);
      rows.push([row.element.name, row.elementIndex, row.rowIndex]);
    },
  });

  assert.deepEqual(order, [
    ['vertex', 0],
    ['edge', 1],
  ]);
  assert.deepEqual(rows, [
    ['vertex', 0, 0],
    ['vertex', 0, 1],
  ]);
  assert.equal(summary.rowsRead, 2);
});

test('skips elements when onElement returns false', () => {
  const writer = payloadWriter('binary_little_endian');
  writer.float(1);
  writer.float(2);
  writer.float(3);
  writer.uchar(3);
  writer.int(0);
  writer.int(1);
  writer.int(2);

  const { bytes, header } = makeFile(
    [
      'ply',
      'format binary_little_endian 1.0',
      'element vertex 1',
      'property float x',
      'property float y',
      'property float z',
      'element face 1',
      'property list uchar int vertex_indices',
      'end_header',
    ],
    writer.bytes(),
  );

  const faces = [];
  const summary = readPlyBinaryPayload(bytes, header, {
    onElement(element) {
      return element.name !== 'vertex';
    },
    onRow(row) {
      faces.push(row.list('vertex_indices'));
    },
  });

  assert.deepEqual(faces, [[0, 1, 2]]);
  assert.equal(summary.rowsRead, 2);
  assert.equal(summary.listItemsRead, 3);
});

test('bulk-skips integer rows without callbacks and still checks limits', () => {
  const writer = payloadWriter('binary_little_endian');
  for (let row = 0; row < 2; row += 1) {
    writer.int(row);
    writer.uchar(7);
  }

  const { bytes, header } = makeFile(
    [
      'ply',
      'format binary_little_endian 1.0',
      'element sample 2',
      'property int id',
      'property uchar flag',
      'end_header',
    ],
    writer.bytes(),
  );

  const summary = readPlyBinaryPayload(bytes, header);
  assert.equal(summary.rowsRead, 2);
  assert.equal(summary.valuesRead, 4);

  assert.throws(() => readPlyBinaryPayload(bytes, header, { limits: { values: 3 } }), /Wertebudget/);
});

test('rejects ASCII and unknown formats', () => {
  const ascii = makeFile(['ply', 'format ascii 1.0', 'element vertex 1', 'property float x', 'end_header']);
  assert.throws(() => readPlyBinaryPayload(ascii.bytes, ascii.header), /ASCII/);

  const unknown = handmadeHeader(
    [{ name: 'vertex', count: 0, properties: [{ name: 'x', kind: 'scalar', type: 'float' }] }],
    {
      format: 'binary_middle_endian',
    },
  );
  assert.throws(() => readPlyBinaryPayload(new Uint8Array(), unknown), /unbekanntes Format/);
});

test('rejects truncated payloads, short elements and trailing bytes', () => {
  const vertex = makeFile(
    [
      'ply',
      'format binary_little_endian 1.0',
      'element vertex 2',
      'property float x',
      'property float y',
      'property float z',
      'end_header',
    ],
    new Uint8Array(20),
  );
  assert.throws(() => readPlyBinaryPayload(vertex.bytes, vertex.header), /zu kurz/);

  const faceWriter = payloadWriter('binary_little_endian');
  faceWriter.uchar(3);
  faceWriter.int(0);
  faceWriter.int(1);
  const face = makeFile(
    [
      'ply',
      'format binary_little_endian 1.0',
      'element face 1',
      'property list uchar int vertex_indices',
      'end_header',
    ],
    faceWriter.bytes(),
  );
  assert.throws(
    () =>
      readPlyBinaryPayload(face.bytes, face.header, {
        onRow(row) {
          row.list('vertex_indices');
        },
      }),
    /enden vorzeitig/,
  );

  const trailing = makeFile(
    ['ply', 'format binary_little_endian 1.0', 'element vertex 1', 'property float x', 'end_header'],
    Uint8Array.of(0, 0, 0, 0, 0x7f),
  );
  assert.throws(() => readPlyBinaryPayload(trailing.bytes, trailing.header), /unerwartete Byte/);
});

test('rejects non-finite float and double values, including skipped ones', () => {
  const scalarWriter = payloadWriter('binary_little_endian');
  scalarWriter.float(Number.NaN);
  const nanScalar = makeFile(
    ['ply', 'format binary_little_endian 1.0', 'element sample 1', 'property float x', 'end_header'],
    scalarWriter.bytes(),
  );
  assert.throws(
    () =>
      readPlyBinaryPayload(nanScalar.bytes, nanScalar.header, {
        onRow(row) {
          row.scalar('x');
        },
      }),
    /nicht endlicher Wert/,
  );

  const skippedWriter = payloadWriter('binary_little_endian');
  skippedWriter.double(Number.POSITIVE_INFINITY);
  skippedWriter.float(1);
  const skipped = makeFile(
    [
      'ply',
      'format binary_little_endian 1.0',
      'element sample 1',
      'property double unknown',
      'property float known',
      'end_header',
    ],
    skippedWriter.bytes(),
  );
  assert.throws(
    () =>
      readPlyBinaryPayload(skipped.bytes, skipped.header, {
        onRow(row) {
          row.scalar('known');
        },
      }),
    /nicht endlicher Wert/,
  );

  const listWriter = payloadWriter('binary_little_endian');
  listWriter.uchar(2);
  listWriter.float(1);
  listWriter.float(Number.NEGATIVE_INFINITY);
  const list = makeFile(
    ['ply', 'format binary_little_endian 1.0', 'element sample 1', 'property list uchar float values', 'end_header'],
    listWriter.bytes(),
  );
  assert.throws(
    () =>
      readPlyBinaryPayload(list.bytes, list.header, {
        onRow(row) {
          row.list('values');
        },
      }),
    /nicht endlicher Wert an Listenposition 1/,
  );
});

test('rejects negative and oversized list counts before allocating', () => {
  const negativeWriter = payloadWriter('binary_little_endian');
  negativeWriter.char(-1);
  const negative = makeFile(
    ['ply', 'format binary_little_endian 1.0', 'element face 1', 'property list char int vertex_indices', 'end_header'],
    negativeWriter.bytes(),
  );
  assert.throws(
    () =>
      readPlyBinaryPayload(negative.bytes, negative.header, {
        onRow(row) {
          row.list('vertex_indices');
        },
      }),
    /ungültige Listenlänge/,
  );

  const writer = payloadWriter('binary_little_endian');
  writer.uchar(3);
  writer.int(0);
  writer.int(1);
  writer.int(2);
  const { bytes, header } = makeFile(
    [
      'ply',
      'format binary_little_endian 1.0',
      'element face 1',
      'property list uchar int vertex_indices',
      'end_header',
    ],
    writer.bytes(),
  );

  assert.throws(
    () =>
      readPlyBinaryPayload(bytes, header, {
        limits: { listLength: 2 },
        onRow(row) {
          row.list('vertex_indices');
        },
      }),
    /erlaubt sind höchstens 2/,
  );

  assert.throws(
    () =>
      readPlyBinaryPayload(bytes, header, {
        limits: { listItems: 2 },
        onRow(row) {
          row.list('vertex_indices');
        },
      }),
    /Listenbudget/,
  );
});

test('enforces payload, row and value budgets before reading', () => {
  const writer = payloadWriter('binary_little_endian');
  writer.float(1);
  writer.float(2);
  writer.float(3);
  const { bytes, header } = makeFile(
    [
      'ply',
      'format binary_little_endian 1.0',
      'element sample 1',
      'property float x',
      'property float y',
      'property float z',
      'end_header',
    ],
    writer.bytes(),
  );

  assert.throws(() => readPlyBinaryPayload(bytes, header, { limits: { payloadBytes: 4 } }), /erlaubt sind höchstens 4/);

  const rows = makeFile(
    ['ply', 'format binary_little_endian 1.0', 'element vertex 2', 'property float x', 'end_header'],
    new Uint8Array(8),
  );
  assert.throws(() => readPlyBinaryPayload(rows.bytes, rows.header, { limits: { rows: 1 } }), /Zeilen/);

  assert.throws(
    () =>
      readPlyBinaryPayload(bytes, header, {
        limits: { values: 2 },
        onRow(row) {
          row.scalar('x');
          row.scalar('y');
          row.scalar('z');
        },
      }),
    /Wertebudget/,
  );
});

test('validates inputs, headers, limits and element declarations', () => {
  assert.ok(Object.isFrozen(PLY_BINARY_LIMITS));

  const empty = new Uint8Array();
  const header = handmadeHeader([]);

  for (const value of [undefined, null, 'ply', new ArrayBuffer(1), [1, 2]])
    assert.throws(() => readPlyBinaryPayload(value, header), TypeError);

  for (const value of [undefined, null, 'header', []])
    assert.throws(() => readPlyBinaryPayload(empty, value), TypeError);

  assert.throws(() => readPlyBinaryPayload(empty, handmadeHeader([], { dataOffset: 1 })), /außerhalb der Datei/);
  assert.throws(() => readPlyBinaryPayload(empty, handmadeHeader([], { dataOffset: -1 })), /außerhalb der Datei/);
  assert.throws(() => readPlyBinaryPayload(empty, handmadeHeader([], { dataOffset: 0.5 })), /außerhalb der Datei/);
  assert.throws(() => readPlyBinaryPayload(empty, handmadeHeader([], { elements: null })), TypeError);

  assert.throws(() => readPlyBinaryPayload(empty, header, null), TypeError);
  assert.throws(() => readPlyBinaryPayload(empty, header, () => {}), TypeError);
  assert.throws(() => readPlyBinaryPayload(empty, header, { onRow: 1 }), TypeError);
  assert.throws(() => readPlyBinaryPayload(empty, header, { onElement: 'x' }), TypeError);

  for (const limits of [{ rows: -1 }, { rows: 1.5 }, { rows: '2' }, { bogus: 1 }, []])
    assert.throws(() => readPlyBinaryPayload(empty, header, { limits }), /Limit|limits/);

  const validProperty = { name: 'x', kind: 'scalar', type: 'float' };
  assert.throws(
    () => readPlyBinaryPayload(empty, handmadeHeader([{ name: 'vertex', count: 0, properties: [] }])),
    /keine Eigenschaften/,
  );
  assert.throws(
    () => readPlyBinaryPayload(empty, handmadeHeader([{ name: 'vertex', count: -1, properties: [validProperty] }])),
    /gültige Anzahl/,
  );
  assert.throws(
    () =>
      readPlyBinaryPayload(
        empty,
        handmadeHeader([{ name: 'vertex', count: 0, properties: [{ name: 'x', kind: 'scalar', type: 'half' }] }]),
      ),
    /unbekannten Typ/,
  );
  assert.throws(
    () =>
      readPlyBinaryPayload(
        empty,
        handmadeHeader([{ name: 'vertex', count: 0, properties: [{ name: 'x', kind: 'mystery' }] }]),
      ),
    /gültige Art/,
  );
  assert.throws(
    () =>
      readPlyBinaryPayload(
        empty,
        handmadeHeader([
          {
            name: 'face',
            count: 0,
            properties: [{ name: 'indices', kind: 'list', countType: 'float', itemType: 'int' }],
          },
        ]),
      ),
    /ganzzahligen Listenzähler/,
  );
  assert.throws(
    () =>
      readPlyBinaryPayload(
        empty,
        handmadeHeader([
          {
            name: 'vertex',
            count: 0,
            properties: [
              { name: 'x', kind: 'scalar', type: 'float' },
              { name: 'x', kind: 'scalar', type: 'float' },
            ],
          },
        ]),
      ),
    /doppelt/,
  );
  assert.throws(
    () =>
      readPlyBinaryPayload(
        empty,
        handmadeHeader([
          { name: 'vertex', count: 0, properties: [validProperty] },
          { name: 'vertex', count: 0, properties: [validProperty] },
        ]),
      ),
    /doppelt/,
  );
  assert.throws(() => readPlyBinaryPayload(empty, handmadeHeader([null])), TypeError);
});

test('rejects declaration counts above the row cap without touching data', () => {
  const properties = [{ name: 'x', kind: 'scalar', type: 'float' }];
  assert.throws(
    () =>
      readPlyBinaryPayload(
        new Uint8Array(),
        handmadeHeader([{ name: 'vertex', count: PLY_BINARY_LIMITS.rows + 1, properties }]),
      ),
    /Zeilen/,
  );
});
