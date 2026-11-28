import assert from 'node:assert/strict';
import test from 'node:test';
import { cadExchangeProfile } from '../src/cad-exchange-profile.js';
import { cadProfileDxf } from '../src/cad-profile-dxf.js';
import { cadDxfEntities, readCadProfileDxf } from '../src/cad-profile-dxf-import.js';
import { cadSketchFromExchange } from '../src/cad-profile-import.js';
import { resolveCadSketch } from '../src/cad-sketch.js';
import { referencePlateSketch } from './fixtures/cad-exchange-plate.mjs';

const dxf = (...entities) => [0, 'SECTION', 2, 'ENTITIES', ...entities, 0, 'ENDSEC', 0, 'EOF'].join('\n');
const line = (start, end) => [0, 'LINE', 10, start[0], 20, start[1], 11, end[0], 21, end[1]];

test('DXF exports mm and keeps the cut profile analytic in both entity modes', () => {
  const sketch = referencePlateSketch(),
    expected = resolveCadSketch(sketch);
  for (const polylines of [false, true]) {
    const file = readCadProfileDxf(cadProfileDxf(cadExchangeProfile(sketch), { polylines }));
    assert.equal(file.unit, 1);
    assert.equal(file.entities.filter((e) => e.type === 'LWPOLYLINE').length, polylines ? 2 : 0);
    assert.equal(file.entities.filter((e) => e.type === 'ARC').length, polylines ? 0 : 2);
    const { entities } = cadDxfEntities(file);
    assert.deepEqual(
      entities.filter((e) => e.type === 'circle').map((e) => e.diameter),
      [6, 6, 6, 6],
    );
    assert.equal(entities.filter((e) => e.type === 'arc').length, 2);
    const imported = resolveCadSketch(cadSketchFromExchange(entities));
    assert.equal(imported.loops.length, 6);
    assert.deepEqual(imported.size.slice(0, 2), [100, 60]);
    assert.ok(Math.abs(imported.area - expected.area) < 1e-8);
  }
});

test('DXF without units requires a choice and keeps a drawn line open and editable', () => {
  const file = readCadProfileDxf(dxf(...line([1, 1], [2, 1])));
  assert.throws(() => cadDxfEntities(file), /Längeneinheit/);
  const { entities } = cadDxfEntities(file, 25.4);
  const sketch = cadSketchFromExchange(entities);
  assert.deepEqual(sketch.elements[0].start, [50.8, 25.4]);
  assert.deepEqual(sketch.elements[0].end, [25.4, 25.4]);
  assert.throws(() => cadExchangeProfile(sketch), /Kontur ist offen/);
});

test('Malformed DXF does not invent geometry and double edges fail closed export', () => {
  assert.throws(() => readCadProfileDxf('0\nSECTION\n2\nENTITIES\n0\nEOF'), /Unvollständige|Offener/);
  const file = readCadProfileDxf(dxf(...line([0, 0], [1, 0]), ...line([0, 0], [1, 0])));
  const sketch = cadSketchFromExchange(cadDxfEntities(file, 1).entities);
  assert.throws(() => cadExchangeProfile(sketch), /keine Fläche|offen|überschneiden/);
});
