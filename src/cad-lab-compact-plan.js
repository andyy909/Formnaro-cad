import cases from '../ai/lab-supplemental-cases.json' with { type: 'json' };

export const compactLimits = { minutes: 18, requests: 35, attempts: 1, version: 13, photos: false };

function task(id, seconds, requests, check) {
  const label = cases.find((entry) => entry.id === id)?.label;
  return { id, label, seconds, requests, check };
}

function spatial(id, label, seconds) {
  return { id, label, check: 'spatial-bores', seconds, requests: 2 };
}

function fixture(fixtureStage, label, seconds, requests = 2) {
  return { id: 'fixture-' + fixtureStage, fixtureStage, label, check: 'fixture', seconds, requests };
}

export const compactLadders = new Map([
  ['Plattengrenze', { label: 'CAD · Geometrie, Passung, Bewegung und Zeichnung', weight: 530, tasks: [
    fixture(3, 'Schlitten mit Schubgelenk und zwei sicheren Endlagen', 145),
    fixture(5, 'Zwei gekoppelte Bewegungen in Arbeitsstellung einstellen', 165),
    fixture(1, 'Führung mit Leisten und Befestigungsbohrungen', 100),
    fixture(6, 'Bewegliche Vorrichtung aus drei Ansichten dokumentieren', 165),
    spatial('bore-oblique', 'Schräge Durchgangsbohrung im fertigen Bohrbild', 145),
    task('plate-drawing', 135, 2, 'cad'),
    fixture(2, 'Passender Schlitten mit Spiel und Langloch', 125),
    fixture(7, 'Prüfstellung ableiten und zwei abhängige Zeichnungen erzeugen', 190, 3),
    fixture(4, 'Anschlagfahne mit zweitem Gelenk ergänzen', 160),
    spatial('bore-final-fit', 'Schräge Zweistufenbohrung und bestehendes Sackloch ändern', 155),
    fixture(8, 'Endanschlag nachrüsten und Verfahrweg begrenzen', 170),
    fixture(9, 'Langloch und Anschlag revidieren und zwei Zeichnungen aktualisieren', 205, 3),
  ] }],
  ['STL-Grenze', { label: 'STL · Bohrungsflächen schützen und nachbauen', weight: 230, tasks: [
    task('converter-selected', 100, 3, 'converter'),
    task('converter-find', 115, 2, 'converter'),
    task('converter-cone', 130, 3, 'converter'),
    task('stl-countersinks', 135, 3, 'stl-editable'),
    task('stl-rim', 150, 3, 'stl-editable'),
    { id: 'stl-cross-drilled', label: 'Stufenbohrung, Querbohrung und Sackloch von unten nachbauen', seconds: 185, requests: 3, check: 'stl-editable' },
  ] }],
  ['Zeichnungsgrenze', { label: 'Technisches Zeichnen · Ansichten, Maße, Schnitt und Baugruppe', weight: 235, tasks: [
    { id: 'drawing-views', label: 'Werkstück in drei verknüpften Ansichten darstellen', seconds: 95, requests: 2, check: 'drawing', drawingStage: 1 },
    { id: 'drawing-dimensions', label: 'Außenmaße und Durchmesser nativ bemaßen', seconds: 110, requests: 2, check: 'drawing', drawingStage: 2 },
    { id: 'drawing-section', label: 'Versetzten Schnitt durch Stufenbohrung einrichten', seconds: 125, requests: 2, check: 'drawing', drawingStage: 3 },
    { id: 'drawing-assembly', label: 'Einzelteil und Baugruppe getrennt dokumentieren', seconds: 150, requests: 2, check: 'drawing', drawingStage: 4 },
    { id: 'drawing-detail', label: 'Bohrungsdetail mit zwei Schnitten und Bezugsmaßen anlegen', seconds: 165, requests: 3, check: 'drawing', drawingStage: 5 },
    { id: 'drawing-revision', label: 'Geänderte Baugruppe revidieren und neues Fertigungsblatt ableiten', seconds: 180, requests: 3, check: 'drawing', drawingStage: 6 },
    { id: 'drawing-linked-revision', label: 'Versetzte Stufenbohrung in drei Zeichnungsblättern revidieren', seconds: 185, requests: 3, check: 'drawing', drawingStage: 7 },
  ] }],
]);

export const detailedLimits = { minutes: 62, requests: 60, maxModelRequests: 63, attempts: 1, version: 14, photos: false,
  budget: { mode: 'per-task', reserveForLaterStages: false, invalidOutputGetsCorrection: true },
};

export const detailedLadders = new Map([...compactLadders].map(([domain, { label, tasks }]) => [
  domain, { label, tasks: tasks.map((task) => task.check === 'stl-editable' ? { ...task, freeAnalysisRequests: 1 } : { ...task }) },
]));
