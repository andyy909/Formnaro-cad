// PLY 1.0 binary payload reader (J2).
//
// parsePlyHeader() reads only the declarations of a PLY 1.0 file. This module
// consumes the binary payload that follows end_header exactly once, in the
// declared element and property order. Rows are reported through callbacks so
// callers can collect only the properties they understand; unknown properties
// are skipped without building a universal per-row object array.
//
// Public API:
//
//   readPlyBinaryPayload(bytes, header, {
//     onElement(element, elementIndex) { ... }, // optional; return false to skip rows
//     onRow(row) { ... },                       // optional; called once per row
//     limits: { rows: 1000 },                   // optional; can only lower caps
//   });
//
// The row object is reused for the next row and is only valid inside onRow:
//
//   row.element / row.elementIndex / row.rowIndex
//   row.has(name)
//   row.scalar(name)  -> number
//   row.list(name)    -> number[]
//   row.skip(name)
//   row.finish()      // skip remaining properties; called automatically
//
// Safety rules:
// - binary_little_endian and binary_big_endian only; ASCII payloads are rejected.
// - every byte access is bounds-checked; truncated payloads and trailing bytes fail.
// - byte, row, value, list-length and list-item caps are checked before decoding
//   or allocating; callers may lower but never raise the built-in caps.
// - list counts must be non-negative and float/double values must be finite,
//   including values of properties the caller skips.

const SCALAR_LAYOUT = Object.freeze({
  char: Object.freeze({ bytes: 1, integer: true, read: (view, offset) => view.getInt8(offset) }),
  uchar: Object.freeze({ bytes: 1, integer: true, read: (view, offset) => view.getUint8(offset) }),
  short: Object.freeze({ bytes: 2, integer: true, read: (view, offset, little) => view.getInt16(offset, little) }),
  ushort: Object.freeze({ bytes: 2, integer: true, read: (view, offset, little) => view.getUint16(offset, little) }),
  int: Object.freeze({ bytes: 4, integer: true, read: (view, offset, little) => view.getInt32(offset, little) }),
  uint: Object.freeze({ bytes: 4, integer: true, read: (view, offset, little) => view.getUint32(offset, little) }),
  float: Object.freeze({ bytes: 4, integer: false, read: (view, offset, little) => view.getFloat32(offset, little) }),
  double: Object.freeze({ bytes: 8, integer: false, read: (view, offset, little) => view.getFloat64(offset, little) }),
});

// Hard caps for one payload. Callers may pass smaller values in `limits`, but
// values above these caps are clamped down so the built-in maxima always hold.
export const PLY_BINARY_LIMITS = Object.freeze({
  payloadBytes: 512 * 1024 * 1024,
  rows: 20_000_000,
  values: 100_000_000,
  listLength: 1_000_000,
  listItems: 20_000_000,
});

const BINARY_FORMATS = new Set(['binary_little_endian', 'binary_big_endian']);

function fail(message) {
  throw Error('PLY-Nutzdaten: ' + message);
}

function failAt(context, message) {
  const where = [];
  if (context.element !== undefined) where.push(`Element "${context.element}"`);
  if (context.row !== undefined) where.push(`Zeile ${context.row}`);
  if (context.property !== undefined) where.push(`Eigenschaft "${context.property}"`);
  throw Error('PLY-Nutzdaten: ' + (where.length ? where.join(', ') + ': ' : '') + message);
}

function resolveLimits(overrides) {
  if (overrides === undefined) return PLY_BINARY_LIMITS;
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides))
    throw TypeError('PLY-Nutzdaten: limits muss ein Objekt sein.');

  for (const name of Object.keys(overrides)) {
    if (!Object.hasOwn(PLY_BINARY_LIMITS, name)) fail(`unbekanntes Limit "${name}".`);
  }

  const limits = {};
  for (const [name, cap] of Object.entries(PLY_BINARY_LIMITS)) {
    const value = overrides[name];
    if (value === undefined) {
      limits[name] = cap;
      continue;
    }
    if (!Number.isSafeInteger(value) || value < 0) fail(`Limit "${name}" muss eine nicht negative ganze Zahl sein.`);
    limits[name] = Math.min(value, cap);
  }
  return Object.freeze(limits);
}

function requireBytes(state, size, what) {
  if (state.cursor + size <= state.input.length) return;
  const missing = state.cursor + size - state.input.length;
  failAt(state.context, `Nutzdaten enden vorzeitig (${what} braucht ${size} Byte, es fehlen ${missing} Byte).`);
}

function chargeValues(state, count) {
  if (state.budget.values + count > state.limits.values)
    failAt(state.context, `Wertebudget von ${state.limits.values} Werten überschritten.`);
  state.budget.values += count;
}

function chargeListItems(state, count) {
  if (state.budget.listItems + count > state.limits.listItems)
    failAt(state.context, `Listenbudget von ${state.limits.listItems} Elementen überschritten.`);
  state.budget.listItems += count;
}

function layoutOf(state, type) {
  const layout = SCALAR_LAYOUT[type];
  if (!layout) failAt(state.context, `unbekannter Skalartyp "${type}".`);
  return layout;
}

function readRawScalar(state, type) {
  const layout = layoutOf(state, type);
  requireBytes(state, layout.bytes, `Wert vom Typ ${type}`);
  const value = layout.read(state.view, state.cursor, state.littleEndian);
  state.cursor += layout.bytes;
  return value;
}

function readScalarValue(state, type, what) {
  const layout = layoutOf(state, type);
  const value = readRawScalar(state, type);
  if (!layout.integer && !Number.isFinite(value)) failAt(state.context, `nicht endlicher Wert (${what}).`);
  return value;
}

// Reads and validates a list count. The count field costs one value; the items
// are charged separately before any array is allocated.
function readListCount(state, property) {
  chargeValues(state, 1);
  const count = readRawScalar(state, property.countType);
  if (!Number.isSafeInteger(count) || count < 0) failAt(state.context, `ungültige Listenlänge ${count}.`);
  if (count > state.limits.listLength)
    failAt(state.context, `Liste hat ${count} Elemente, erlaubt sind höchstens ${state.limits.listLength}.`);
  chargeListItems(state, count);
  return count;
}

function skipProperty(state, property) {
  if (property.kind === 'scalar') {
    chargeValues(state, 1);
    readScalarValue(state, property.type, `Wert vom Typ ${property.type}`);
    return;
  }

  const count = readListCount(state, property);
  chargeValues(state, count);

  const layout = layoutOf(state, property.itemType);
  const bytes = count * layout.bytes;
  requireBytes(state, bytes, `Liste mit ${count} Elementen`);

  if (layout.integer) {
    state.cursor += bytes;
    return;
  }

  for (let index = 0; index < count; index += 1) {
    const value = layout.read(state.view, state.cursor, state.littleEndian);
    state.cursor += layout.bytes;
    if (!Number.isFinite(value)) failAt(state.context, `nicht endlicher Wert an Listenposition ${index}.`);
  }
}

function validateElement(element, elementIndex) {
  if (!element || typeof element !== 'object' || Array.isArray(element))
    throw TypeError(`PLY-Nutzdaten: Element ${elementIndex} ist keine Deklaration.`);
  if (typeof element.name !== 'string' || !element.name)
    throw TypeError(`PLY-Nutzdaten: Element ${elementIndex} hat keinen Namen.`);
  if (!Number.isSafeInteger(element.count) || element.count < 0)
    fail(`Element "${element.name}" hat keine gültige Anzahl.`);
  if (!Array.isArray(element.properties) || !element.properties.length)
    fail(`Element "${element.name}" hat keine Eigenschaften.`);

  const names = new Set();
  for (const property of element.properties) {
    if (!property || typeof property !== 'object' || Array.isArray(property))
      fail(`Element "${element.name}" enthält eine ungültige Eigenschaft.`);
    if (typeof property.name !== 'string' || !property.name)
      fail(`Element "${element.name}" enthält eine Eigenschaft ohne Namen.`);
    if (names.has(property.name)) fail(`Element "${element.name}" deklariert "${property.name}" doppelt.`);
    names.add(property.name);

    if (property.kind === 'scalar') {
      if (!Object.hasOwn(SCALAR_LAYOUT, property.type))
        fail(`Element "${element.name}/${property.name}" hat den unbekannten Typ "${property.type}".`);
      continue;
    }

    if (property.kind !== 'list') fail(`Element "${element.name}/${property.name}" hat keine gültige Art.`);
    const countLayout = SCALAR_LAYOUT[property.countType];
    if (!countLayout || !countLayout.integer)
      fail(`Element "${element.name}/${property.name}" hat keinen ganzzahligen Listenzähler.`);
    if (!Object.hasOwn(SCALAR_LAYOUT, property.itemType))
      fail(`Element "${element.name}/${property.name}" hat den unbekannten Listentyp "${property.itemType}".`);
  }
}

function fixedRowBytes(element) {
  let bytes = 0;
  for (const property of element.properties)
    bytes += property.kind === 'scalar' ? SCALAR_LAYOUT[property.type].bytes : SCALAR_LAYOUT[property.countType].bytes;
  return bytes;
}

// Only elements made of integer scalars have a fixed row size and need no
// per-value finite check, so their rows can be skipped in one step.
function hasFixedIntegerRows(element) {
  return element.properties.every((property) => property.kind === 'scalar' && SCALAR_LAYOUT[property.type].integer);
}

function createRowReader(state, element, elementIndex) {
  const properties = element.properties;
  const indexByName = new Map(properties.map((property, index) => [property.name, index]));
  const rowState = { next: 0 };

  function propertyIndex(name) {
    const index = indexByName.get(name);
    if (index === undefined) failAt(state.context, `unbekannte Eigenschaft "${name}".`);
    return index;
  }

  function requireUnread(index, name) {
    if (index < rowState.next) failAt(state.context, `Eigenschaft "${name}" wurde in dieser Zeile bereits gelesen.`);
  }

  function advanceTo(target) {
    while (rowState.next < target) {
      const property = properties[rowState.next];
      state.context.property = property.name;
      skipProperty(state, property);
      rowState.next += 1;
    }
    state.context.property = undefined;
  }

  function readScalar(name) {
    const index = propertyIndex(name);
    requireUnread(index, name);
    advanceTo(index);

    state.context.property = name;
    const property = properties[index];
    if (property.kind !== 'scalar') failAt(state.context, `Eigenschaft "${name}" ist eine Liste.`);

    chargeValues(state, 1);
    const value = readScalarValue(state, property.type, `Wert vom Typ ${property.type}`);
    rowState.next = index + 1;
    state.context.property = undefined;
    return value;
  }

  function readList(name) {
    const index = propertyIndex(name);
    requireUnread(index, name);
    advanceTo(index);

    state.context.property = name;
    const property = properties[index];
    if (property.kind !== 'list') failAt(state.context, `Eigenschaft "${name}" ist kein Listenfeld.`);

    const count = readListCount(state, property);
    chargeValues(state, count);

    const layout = layoutOf(state, property.itemType);
    const bytes = count * layout.bytes;
    requireBytes(state, bytes, `Liste "${name}" mit ${count} Elementen`);

    const values = new Array(count);
    for (let item = 0; item < count; item += 1) {
      const value = layout.read(state.view, state.cursor, state.littleEndian);
      state.cursor += layout.bytes;
      if (!layout.integer && !Number.isFinite(value))
        failAt(state.context, `nicht endlicher Wert an Listenposition ${item}.`);
      values[item] = value;
    }

    rowState.next = index + 1;
    state.context.property = undefined;
    return values;
  }

  const row = {
    element,
    elementIndex,
    rowIndex: -1,
    has(name) {
      return indexByName.has(name);
    },
    scalar: readScalar,
    list: readList,
    skip(name) {
      const index = propertyIndex(name);
      requireUnread(index, name);
      advanceTo(index + 1);
    },
    finish() {
      advanceTo(properties.length);
    },
  };

  return {
    row,
    beginRow(rowIndex) {
      row.rowIndex = rowIndex;
      rowState.next = 0;
    },
  };
}

/**
 * Reads the binary payload of a PLY 1.0 file once, in declaration order.
 *
 * @param {Uint8Array} input Complete file bytes.
 * @param {{format: string, dataOffset: number, elements: Array<object>}} header Result of parsePlyHeader().
 * @param {{
 *   onElement?: (element: object, elementIndex: number) => boolean|void,
 *   onRow?: (row: object) => void,
 *   limits?: Partial<typeof PLY_BINARY_LIMITS>,
 * }} [handlers]
 * @returns {{format: string, dataOffset: number, payloadBytes: number, elementCount: number,
 *   rowsRead: number, valuesRead: number, listItemsRead: number}}
 * @throws {TypeError} when input or header has the wrong shape.
 * @throws {Error} when the payload is truncated, oversized, non-finite, inconsistent or trailing.
 */
export function readPlyBinaryPayload(input, header, handlers = {}) {
  if (!(input instanceof Uint8Array)) throw TypeError('PLY-Nutzdaten: Uint8Array erwartet.');
  if (!header || typeof header !== 'object' || Array.isArray(header))
    throw TypeError('PLY-Nutzdaten: Header-Deklaration erwartet.');
  if (!BINARY_FORMATS.has(header.format)) {
    if (header.format === 'ascii') fail('ASCII-Nutzdaten werden von diesem Leser nicht unterstützt.');
    fail(`unbekanntes Format "${header.format}".`);
  }
  if (!Number.isSafeInteger(header.dataOffset) || header.dataOffset < 0 || header.dataOffset > input.length)
    fail('Nutzdaten beginnen außerhalb der Datei.');
  if (!Array.isArray(header.elements)) throw TypeError('PLY-Nutzdaten: elements muss ein Array sein.');
  if (!handlers || typeof handlers !== 'object' || Array.isArray(handlers))
    throw TypeError('PLY-Nutzdaten: handlers muss ein Objekt sein.');
  if (handlers.onElement !== undefined && typeof handlers.onElement !== 'function')
    throw TypeError('PLY-Nutzdaten: onElement muss eine Funktion sein.');
  if (handlers.onRow !== undefined && typeof handlers.onRow !== 'function')
    throw TypeError('PLY-Nutzdaten: onRow muss eine Funktion sein.');

  const limits = resolveLimits(handlers.limits);
  const payloadBytes = input.length - header.dataOffset;
  if (payloadBytes > limits.payloadBytes)
    fail(`Nutzdaten sind ${payloadBytes} Byte groß, erlaubt sind höchstens ${limits.payloadBytes}.`);

  const state = {
    input,
    view: new DataView(input.buffer, input.byteOffset, input.byteLength),
    cursor: header.dataOffset,
    littleEndian: header.format === 'binary_little_endian',
    limits,
    budget: { rows: 0, values: 0, listItems: 0 },
    context: { element: undefined, row: undefined, property: undefined },
  };

  let declaredRows = 0;
  const elementNames = new Set();
  for (let elementIndex = 0; elementIndex < header.elements.length; elementIndex += 1) {
    const element = header.elements[elementIndex];
    validateElement(element, elementIndex);
    if (elementNames.has(element.name)) fail(`Element "${element.name}" ist doppelt deklariert.`);
    elementNames.add(element.name);
    declaredRows += element.count;
  }
  if (declaredRows > limits.rows)
    fail(`Header deklariert ${declaredRows} Zeilen, erlaubt sind höchstens ${limits.rows}.`);

  const { onElement, onRow } = handlers;

  for (let elementIndex = 0; elementIndex < header.elements.length; elementIndex += 1) {
    const element = header.elements[elementIndex];
    state.context.element = element.name;
    state.context.row = undefined;
    state.context.property = undefined;

    const fixedBytes = fixedRowBytes(element);
    const needed = fixedBytes * element.count;
    if (needed > input.length - state.cursor)
      failAt(
        state.context,
        `Nutzdaten zu kurz: ${element.count} Zeilen brauchen mindestens ${needed} Byte, ` +
          `vorhanden sind ${input.length - state.cursor}.`,
      );

    state.budget.rows += element.count;

    let keepRows = true;
    if (onElement) keepRows = onElement(element, elementIndex) !== false;

    if (keepRows && onRow) {
      const reader = createRowReader(state, element, elementIndex);
      for (let rowIndex = 0; rowIndex < element.count; rowIndex += 1) {
        state.context.row = rowIndex;
        state.context.property = undefined;
        reader.beginRow(rowIndex);
        onRow(reader.row);
        reader.row.finish();
      }
      continue;
    }

    if (hasFixedIntegerRows(element)) {
      chargeValues(state, element.count * element.properties.length);
      state.cursor += needed;
      continue;
    }

    const reader = createRowReader(state, element, elementIndex);
    for (let rowIndex = 0; rowIndex < element.count; rowIndex += 1) {
      state.context.row = rowIndex;
      state.context.property = undefined;
      reader.beginRow(rowIndex);
      reader.row.finish();
    }
  }

  state.context.element = undefined;
  state.context.row = undefined;
  state.context.property = undefined;
  if (state.cursor !== input.length)
    fail(`enthält ${input.length - state.cursor} unerwartete Byte nach den deklarierten Nutzdaten.`);

  return {
    format: header.format,
    dataOffset: header.dataOffset,
    payloadBytes,
    elementCount: header.elements.length,
    rowsRead: state.budget.rows,
    valuesRead: state.budget.values,
    listItemsRead: state.budget.listItems,
  };
}
