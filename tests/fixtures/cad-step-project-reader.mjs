// Reader example for the STEP project integration (C1-C5).
//
// The real runtime that produces this shape is delivered separately. It mirrors
// the agreed reader contract so the project mapping can be tested today:
// - every leaf carries the local `brep`/`stats` of its shared definition,
// - the file-local `definitionId` groups repeated occurrences,
// - `occurrencePath` names the instance path,
// - `worldTransform` is the composed placement as a Formnaro column-major 4x4,
// - `definitionName` is optional.
//
// The values mirror the independent reference assembly: one 100x60x5 plate at
// the origin, one "Antrieb" subassembly rotated 90 degrees about Z at x=40 and
// two occurrences of one 10x6x4 bearing definition at local x=0 and x=12.

export function rotationZ(angle, translation = [0, 0, 0]) {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, ...translation, 1];
}

export const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export const readerBrep = (name) => ({ format: 'OpenCascade-BRep', data: `reader example ${name}`, triangulation: false });

export function centeredStats([x, y, z]) {
  return {
    bounds: { min: [-x / 2, -y / 2, -z / 2], max: [x / 2, y / 2, z / 2] },
    volume: x * y * z,
    solids: 1,
  };
}

export const plateStats = () => centeredStats([100, 60, 5]),
  bearingStats = () => centeredStats([10, 6, 4]);

// New reader contract, one shared "Lager" definition used by two occurrences.
export function stepProjectReaderTree() {
  const plate = {
      name: 'Grundplatte',
      appearance: { color: '#cc3322', opacity: 1 },
      faceColors: [{ faceIndex: 3, appearance: { color: '#2277cc', opacity: 1 } }],
      brep: readerBrep('Grundplatte'),
      stats: plateStats(),
      definitionId: null,
      occurrencePath: '0:1/0:1:1',
      worldTransform: identity(),
    },
    first = {
      name: 'Lager',
      appearance: { color: '#2277cc', opacity: 1 },
      brep: readerBrep('Lager'),
      stats: bearingStats(),
      definitionId: 'native-lager-10x6x4',
      definitionName: 'Lager',
      occurrencePath: '0:1/0:1:2/0:1:2:1',
      worldTransform: rotationZ(Math.PI / 2, [40, 0, 0]),
    },
    second = {
      name: 'Lager rechts',
      appearance: { color: '#2277cc', opacity: 0.8 },
      brep: readerBrep('Lager'),
      stats: bearingStats(),
      definitionId: 'native-lager-10x6x4',
      definitionName: 'Lager',
      occurrencePath: '0:1/0:1:2/0:1:2:2',
      worldTransform: rotationZ(Math.PI / 2, [40, 12, 0]),
    };
  return [{ name: 'Prüfbaugruppe', appearance: {}, children: [plate, { name: 'Antrieb', appearance: {}, children: [first, second] }] }];
}

export function stepProjectReaderWorlds() {
  return [identity(), rotationZ(Math.PI / 2, [40, 0, 0]), rotationZ(Math.PI / 2, [40, 12, 0])];
}

// Same names and equal geometry, but only the explicit definition ids group.
export function stepProjectReaderAmbiguousTree() {
  const leaf = (name, definitionId, x) => ({
    name,
    appearance: { color: '#2277cc', opacity: 1 },
    brep: readerBrep('Lager'),
    stats: bearingStats(),
    definitionId,
    occurrencePath: '0:1/0:1:' + x,
    worldTransform: rotationZ(0, [x, 0, 0]),
  });
  return [
    {
      name: 'Gleiche Namen',
      appearance: {},
      children: [leaf('Lager', null, 0), leaf('Lager', 'native-a', 20), leaf('Lager', 'native-b', 40)],
    },
  ];
}

// Old reader contract: the body is already baked into world coordinates.
export function stepProjectReaderOldTree() {
  return [
    {
      name: 'Prüfbaugruppe',
      appearance: {},
      children: [
        {
          name: 'Grundplatte',
          appearance: { color: '#cc3322', opacity: 1 },
          brep: readerBrep('Grundplatte'),
          stats: plateStats(),
        },
        {
          name: 'Baugruppe',
          appearance: {},
          children: [
            {
              name: 'Lager',
              appearance: { color: '#2277cc', opacity: 1 },
              brep: readerBrep('Lager'),
              stats: bearingStats(),
            },
            {
              name: 'Lager',
              appearance: { color: '#2277cc', opacity: 1 },
              brep: readerBrep('Lager'),
              stats: bearingStats(),
            },
          ],
        },
      ],
    },
  ];
}
