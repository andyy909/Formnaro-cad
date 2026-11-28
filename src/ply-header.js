// PLY 1.0 header reader (J1).
//
// This module intentionally reads declarations only. It never touches vertices,
// faces, colours or payload data, and it has no dependencies. The caller passes
// the beginning of a .ply file as a Uint8Array; parsing stops at the exact
// "end_header" line and dataOffset points at the first byte after that line.
//
// Supported header grammar (ASCII only, LF or CRLF line endings):
//
//   ply
//   format <ascii|binary_little_endian|binary_big_endian> 1.0
//   comment <text>
//   obj_info <text>
//   element <name> <count>
//   property <scalar-type> <name>
//   property list <integer-scalar-type> <scalar-type> <name>
//   ...
//   end_header
//
// Element and property declarations keep their original order. Scalar aliases
// are normalised to the canonical PLY spellings (char, uchar, short, ushort,
// int, uint, float, double). Declarations with contradictory or ambiguous
// content are rejected instead of being repaired.

export const PLY_FORMATS = Object.freeze(['ascii', 'binary_little_endian', 'binary_big_endian']);

// Canonical PLY 1.0 scalar types and their usual aliases.
export const PLY_SCALAR_TYPES = Object.freeze({
  char: 'char',
  int8: 'char',
  uchar: 'uchar',
  uint8: 'uchar',
  short: 'short',
  int16: 'short',
  ushort: 'ushort',
  uint16: 'ushort',
  int: 'int',
  int32: 'int',
  uint: 'uint',
  uint32: 'uint',
  float: 'float',
  float32: 'float',
  double: 'double',
  float64: 'double',
});

export const PLY_HEADER_LIMITS = Object.freeze({
  headerBytes: 1024 * 1024,
  lines: 4096,
  lineBytes: 1024,
  elements: 256,
  propertiesPerElement: 256,
  properties: 2048,
  nameLength: 128,
  elementCount: 0x7fffffff,
});

const INTEGER_TYPES = new Set(['char', 'uchar', 'short', 'ushort', 'int', 'uint']);
const FORMATS = new Set(PLY_FORMATS);
const SPACE = /[ \t]+/;

function fail(message) {
  throw Error('PLY-Header: ' + message);
}

function isIntegerType(type) {
  return INTEGER_TYPES.has(type);
}

function scalarType(token, label) {
  if (!Object.hasOwn(PLY_SCALAR_TYPES, token)) fail(`unbekannter ${label} "${token}".`);
  return PLY_SCALAR_TYPES[token];
}

function checkName(name, label) {
  if (name.length > PLY_HEADER_LIMITS.nameLength)
    fail(`${label} ist länger als ${PLY_HEADER_LIMITS.nameLength} Zeichen.`);
}

function parseElementCount(token) {
  if (!/^\d+$/.test(token)) fail(`ungültige Elementanzahl "${token}".`);
  const count = Number(token);
  if (!Number.isSafeInteger(count) || count > PLY_HEADER_LIMITS.elementCount)
    fail(`Elementanzahl außerhalb des Bereichs: "${token}".`);
  return count;
}

function tokensOf(text) {
  return text.split(SPACE).filter(Boolean);
}

function textOf(bytes, start, end) {
  let text = '';
  for (let index = start; index < end; index += 1) text += String.fromCharCode(bytes[index]);
  return text;
}

// Returns one header line and the byte offset directly after its terminator.
// The search window is bounded so a missing newline cannot scan arbitrary data.
function takeLine(bytes, start, lineNumber) {
  const limit = PLY_HEADER_LIMITS.lineBytes;
  const searchEnd = Math.min(bytes.length, start + limit + 2);
  const relative = bytes.subarray(start, searchEnd).indexOf(0x0a);
  const newline = relative < 0 ? -1 : start + relative;

  if (newline < 0 && searchEnd < bytes.length) fail(`Zeile ${lineNumber} ist zu lang.`);

  const terminated = newline >= 0;
  const end = terminated ? newline : bytes.length;
  const crlf = terminated && end > start && bytes[end - 1] === 0x0d;
  const contentEnd = crlf ? end - 1 : end;

  if (contentEnd - start > limit) fail(`Zeile ${lineNumber} ist zu lang.`);

  for (let index = start; index < contentEnd; index += 1) {
    const byte = bytes[index];
    if (byte === 0x09 || (byte >= 0x20 && byte <= 0x7e)) continue;
    if (byte >= 0x80) fail(`Nicht-ASCII-Zeichen in Zeile ${lineNumber}.`);
    fail(`Steuerzeichen oder ungültiges Zeilenende in Zeile ${lineNumber}.`);
  }

  return {
    text: textOf(bytes, start, contentEnd),
    next: terminated ? end + 1 : end,
    terminated,
  };
}

function closeElement(element) {
  if (!element.properties.length) fail(`Element "${element.name}" hat keine Eigenschaften.`);
}

/**
 * Reads a PLY 1.0 header from the beginning of `input`.
 *
 * @param {Uint8Array} input Bytes of a PLY file; payload after end_header is ignored.
 * @returns {{
 *   format: 'ascii'|'binary_little_endian'|'binary_big_endian',
 *   version: '1.0',
 *   dataOffset: number,
 *   elements: Array<{name: string, count: number, properties: Array<object>}>,
 *   comments: string[],
 *   objInfo: string[],
 * }}
 * @throws {TypeError} when `input` is not a Uint8Array.
 * @throws {Error} when the header is truncated, oversized or contains an invalid declaration.
 */
export function parsePlyHeader(input) {
  if (!(input instanceof Uint8Array)) throw TypeError('PLY-Header: Uint8Array erwartet.');
  if (!input.length) fail('ist leer.');

  const elements = [];
  const comments = [];
  const objInfo = [];
  const elementNames = new Set();
  let format;
  let current = null;
  let propertyCount = 0;
  let cursor = 0;
  let lineNumber = 0;
  let sawMagic = false;

  for (;;) {
    if (cursor >= input.length) fail('"end_header" fehlt.');

    lineNumber += 1;
    if (lineNumber > PLY_HEADER_LIMITS.lines) fail(`mehr als ${PLY_HEADER_LIMITS.lines} Zeilen.`);

    const line = takeLine(input, cursor, lineNumber);
    cursor = line.next;
    if (cursor > PLY_HEADER_LIMITS.headerBytes) fail(`überschreitet ${PLY_HEADER_LIMITS.headerBytes} Byte.`);

    const tokens = tokensOf(line.text);
    if (!tokens.length) fail(`Zeile ${lineNumber} ist leer.`);
    if (!line.terminated && tokens[0] !== 'end_header') fail(`Zeile ${lineNumber} ist unvollständig.`);

    if (!sawMagic) {
      if (tokens[0] !== 'ply') fail(`beginnt nicht mit "ply", sondern mit "${tokens[0]}".`);
      if (tokens.length !== 1) fail('ply-Zeile enthält zusätzliche Angaben.');
      sawMagic = true;
      continue;
    }

    if (format === undefined) {
      if (lineNumber !== 2 || tokens[0] !== 'format') fail('format-Zeile muss direkt auf "ply" folgen.');
      if (tokens.length !== 3) fail('format-Zeile braucht Format und Version.');
      if (!FORMATS.has(tokens[1])) fail(`unbekanntes Format "${tokens[1]}".`);
      if (tokens[2] !== '1.0') fail(`nicht unterstützte Version "${tokens[2]}".`);
      format = tokens[1];
      continue;
    }

    const keyword = tokens[0];

    if (keyword === 'comment' || keyword === 'obj_info') {
      const text = line.text
        .replace(/^[ \t]+/, '')
        .slice(keyword.length)
        .replace(/^[ \t]+/, '');
      (keyword === 'comment' ? comments : objInfo).push(text);
      continue;
    }

    if (keyword === 'format') fail('enthält mehrere format-Zeilen.');

    if (keyword === 'element') {
      if (tokens.length !== 3) fail('element-Zeile braucht Name und Anzahl.');
      const name = tokens[1];
      checkName(name, `Elementname "${name}"`);
      if (elementNames.has(name)) fail(`Element "${name}" ist doppelt deklariert.`);
      if (elements.length >= PLY_HEADER_LIMITS.elements) fail(`mehr als ${PLY_HEADER_LIMITS.elements} Elemente.`);
      if (current) closeElement(current);

      current = { name, count: parseElementCount(tokens[2]), properties: [] };
      elementNames.add(name);
      elements.push(current);
      continue;
    }

    if (keyword === 'property') {
      if (!current) fail('property-Deklaration außerhalb eines Elements.');
      if (current.properties.length >= PLY_HEADER_LIMITS.propertiesPerElement)
        fail(`Element "${current.name}" hat mehr als ${PLY_HEADER_LIMITS.propertiesPerElement} Eigenschaften.`);
      if (propertyCount >= PLY_HEADER_LIMITS.properties)
        fail(`mehr als ${PLY_HEADER_LIMITS.properties} Eigenschaften.`);

      let property;
      let name;

      if (tokens[1] === 'list') {
        if (tokens.length !== 5) fail('property list braucht Zählertyp, Elementtyp und Namen.');
        const countType = scalarType(tokens[2], 'Listenzählertyp');
        if (!isIntegerType(countType)) fail('Listenzähler muss ein Ganzzahltyp sein.');
        const itemType = scalarType(tokens[3], 'Listenelementtyp');
        name = tokens[4];
        property = { name, kind: 'list', countType, itemType };
      } else {
        if (tokens.length !== 3) fail('property-Zeile braucht Typ und Namen.');
        const type = scalarType(tokens[1], 'Eigenschaftstyp');
        name = tokens[2];
        property = { name, kind: 'scalar', type };
      }

      checkName(name, `Eigenschaftsname "${name}"`);
      if (current.properties.some((existing) => existing.name === name))
        fail(`Eigenschaft "${current.name}/${name}" ist doppelt deklariert.`);

      current.properties.push(property);
      propertyCount += 1;
      continue;
    }

    if (keyword === 'end_header') {
      if (tokens.length !== 1) fail('end_header-Zeile enthält zusätzliche Angaben.');
      if (current) closeElement(current);
      if (!elements.length) fail('enthält keine Elemente.');
      return { format, version: '1.0', dataOffset: cursor, elements, comments, objInfo };
    }

    fail(`unbekannte Anweisung "${keyword}".`);
  }
}
