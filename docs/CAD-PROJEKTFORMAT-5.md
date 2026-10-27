# Vertrag für CAD-Projektformat 5

Stand: 11.10.2026. `src/cad-project.js` beschreibt die strikte Datengrenze
des produktiven nativen CAD-Editors in Formnaro 0.11.0. Die ältere Ausgabe
0.10 verwendet Format 4 und bleibt separat erhalten. Native Nachweise und
die tatsächliche Paketabnahme stehen in `CAD-ABNAHME-v0.11.md` und den
beiliegenden konkreten Portable-/Integritätsberichten.

## Öffentliche Funktionen

| Export | Bedeutung |
| --- | --- |
| `createCadProject(options={})` | Neues v5-Projekt mit unabhängigen Standardwerten; optionale Projektfelder überschreiben die Defaults und werden danach strikt geprüft. |
| `validateCadProject(value)` | Externe Grenze: verlangt `.format === 'OfflineCAD'` und `.version === 5`, wirft bei unbekannten/ungültigen Daten und liefert eine sortierte unabhängige Kopie. Keine Legacy-Migration. |
| `validateAffineMatrix(array, path?)` | 16 endliche Werte, column-major, letzte Zeile exakt `[0,0,0,1]`; invertierbar mit endlicher numerischer Inverse. Spiegelung/Scherung/Skalierung bleiben unverändert. |
| `cadProjectSnapshot(value)` | Entfernt ausschließlich benannte Laufzeitfelder auf Projekt-/Knotenebene, prüft danach strikt und kopiert. Gemeinsame Grenze für bestätigten Zustand und Undo. |
| `serializeCadProject(value)` | Deterministisches JSON des Snapshots; sortierte Objektschlüssel, semantische Arrayreihenfolge, maximal 50 MiB UTF-8. |
| `parseCadProject(textOrObject)` | Maximal 50 MiB Text, JSON-Parsing und strikte Validierung; Laufzeitfelder in importiertem Inhalt werden abgelehnt. |
| `cadProjectRevision(value)` | Deterministischer 16-stelliger Modellhash aus demselben Snapshot. Kein Sicherheits-/Signaturhash. |

Weitere Exporte: `CAD_PROJECT_VERSION`, `CAD_PROJECT_FORMAT`,
`CAD_PROJECT_LIMITS`, `CAD_SHAPE_TYPES`, `CAD_IDENTITY_MATRIX`.

## Modell und Matrizen

Root-Felder: `format`, `version`, `name`, `nodes`, `bed`, `workplane`,
`coordinateMode`, `layers`, `folders`, `activeLayerId`, `activeFolderId`, `ruler`.
Seit der Ausgabe „Arbeitsfläche und Projekte“ ist `workspace` optional. Version 1
enthält `view` (Projektion, Position, Ziel, Up-Vektor und Zoom), `selection`
(Root-/Quellenpfade), `mode`, `snap`, `quality` und `layout`. Endliche Werte,
Größenlimits und bekannte Felder werden strikt geprüft. Quellenpfade, die beim
späteren Modellieren entfallen sind, werden beim Wiederherstellen der Auswahl
übersprungen. Ohne `workspace` gilt das bisherige Verhalten mit Modell-Einpassen.
Bestehende Format-5-Dateien bleiben lesbar. Ältere Formnaro-Ausgaben ohne diesen
optionalen Feldvertrag können neue Dateien mit `workspace` ablehnen; dieselbe
aktuelle Ausgabe zum Öffnen verwenden. Render-/Worker-Puffer und Undo-Stapel
werden weiterhin nicht gespeichert. API und CAD-Projektversion bleiben 1 bzw. 5.
Alle Maße sind Millimeter. IDs sind projektweit über sämtliche Quellen eindeutig.
Layer-/Ordnerverträge bleiben einschließlich Zyklenprüfung erhalten.

Ein CAD-Knoten benötigt:

```js
{
  id: 'body-id', kind: 'cad', name: 'Zylinder', solid: true,
  transform: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1],
  source: 'native',
  recipe: {type: 'cylinder', size: [20,20,10], params: {}},
  brep: {format: 'OpenCascade-BRep', data: '…', triangulation: false},
  stats: {bounds: {min: [-10,-10,0], max: [10,10,10]}, volume: 3141.59, solids: 1}
}
```

`recipe.size` bezeichnet physische Originalmaße des Formrezepts. `transform`
wendet danach die komplette affine Transformation an. `stats.bounds` und
`stats.volume` sind Ergebnisse im lokalen Körperrahmen. Gespeicherte Statistik
rekonstruiert weder Rezeptmaße noch Transformationen. Ein Eckmaßwerkzeug darf
aktuelle Abstände aus frisch geprüften CAD-Grenzen messen und darauf seine
explizite affine Maßänderung berechnen. Kindmatrizen beziehen sich auf den
Elternrahmen. Es gibt keine gespeicherten parallelen `pos/rot/mirror/size`
Transformationsfelder und keine TRS-Zerlegung.

`source` hat vier Varianten:

- `native`: CAD-Formrezept, keine Kinder. Rezepttypen sind die 23 bisherigen
  Formen sowie `svg`. `params` erlaubt ausschließlich die vorhandenen
  konstruktiven Parameter, ohne Segment-/Rundungsschrittauflösung. Text und
  SVG benötigen `contours` und `topologyCertified:true`; `sourceTopology`
  darf die passende originale CAD-Klassifikation benennen.
- `step`: eigenständiger importierter CAD-Körper, ohne native Rezepte/Kinder.
- `group`: erhaltene CAD-`children` plus `operation: 'union'|'intersection'`.
- `finish`: genau eine erhaltene CAD-Quelle in `children` plus nachgelagerte
  editierbare `finish`-Operationen; keine eigene boolesche Operation. Gruppen
  dürfen zusätzlich `finish` besitzen. Native/STEP-Quellen benötigen für
  nachgelagerte Kantenoperationen einen solchen Wrapper.

Originalkonturen folgen dem tatsächlichen Buildervertrag
`[{outer:[segments],holes:[[segments]]}]`. Segmente sind `line` mit
zweidimensionalen Start-/Endpunkten, `bezier` mit drei/vier originalen
Kontrollpunkten, `arc` mit Start-/Zwischen-/Endpunkt oder `ellipse` mit
Mittelpunkt, Radien und optionaler Drehung/Winkelgrenze. Geometrischer
Konturschluss und die CAD-Klassifikation von Außenkonturen und Löchern werden
weiterhin vom CAD-Dienst geprüft. Das gespeicherte Zertifizierungsflag ist
kein unabhängiger geometrischer Nachweis.

Lochquellen besitzen `solid:false`, aber einen positiven geschlossenen
Quellkörper und positive Quellstatistik. Unterdrückte Quellen bleiben erhalten.
Optionale Knotenfelder: `color`, `opacity`, `multicolor`, `hidden`, `locked`,
`suppressed`, `layerId`, `folderId`, `metadata`. `metadata` erlaubt `notes`,
`tags`, `plugin:{id,shapeId}` und `importedFile:{name,type}`.

## Referenzmesh und topologische Anker

`kind:'referenceMesh'` benötigt ID, Name, affine `transform` und
`mesh:{verts,triangles}`. Ein offenes Netz ist zulässig. Referenzen dürfen
nicht als Kind einer CAD-Gruppe vorkommen und besitzen keine
`solid/recipe/brep/stats/source/operation/finish`-Felder. Sichtbarkeit,
Sperren, Farbe, Deckkraft und Organisation sind erlaubt. Diese klare
Datentrennung wird zusätzlich an der nativen Werkzeug-/Exportgrenze geprüft.
Der neue isolierte CAD-Hauptoberflächenbuild verwendet diesen Vertrag;
das ist noch keine Freigabe einer ausgelieferten portablen Anwendung.

Topologische Bezüge enthalten `kind:'vertex'|'edge'|'face'`,
`origin:{rootId,path,featureId?}`, `anchor:{point,normal?,tangent?,curveType?,samples?,edgeDomain?}`
und optional `topologyId`. Anker sind lokale geometrische Angaben, keine
automatisch stabilen OCCT-Indizes. Normalen/Tangenten müssen normiert und
gemeinsam orthogonal sein. Kantenoperationen speichern
`finish:{steps:[{id,kind:'round'|'chamfer',amount,edges:[…]}]}`.
Arbeitsebenen speichern `reference:null` oder
`reference:{objectId,topology:<face anchor>}`.

`anchor.edgeDomain` ist ausschließlich für einen Kantenbezug zulässig und
enthält `{format:'OpenCascade-BRep',data,triangulation:false}`: die vollständige
originale native Kante einschließlich ihres beschnittenen Kurvenintervalls,
keine Anzeigelinie. Pro Domäne gelten höchstens 2 MiB; der Datenprüfer verlangt
eindeutige Null-Header für Triangulation und beide Polygonpuffer. Der native
Reader prüft zusätzlich einen tatsächlichen, gültigen, nicht degenerierten
OCCT-EDGE mit endlicher Kurvendomäne und positiver Länge. Körper- oder
Flächen-BReps als Kantenanker werden abgewiesen. Solche CAD-Anker bleiben in
Speichern, Undo und Revision enthalten; Anzeigepunkte, temporäre Edge-Tokens
und Worker-Handles bleiben ausgeschlossen.

Der Standard-Finisher vergleicht diese vollständigen nativen Kurvendomänen
über CAD-Common und beidseitig vollständige Kurvenlänge. Ein belegter
Quellenpfad muss die entsprechende vollständige aktuelle Quellenkurve
weiterhin enthalten. Bekannte Zylinderkanten werden aus der aktuellen Quelle
einschließlich ihrer vollständigen affinen Kindmatrix erzeugt. Verlorene
oder mehrdeutige Quellen werden abgewiesen. Fünf diagnostische Ankerpunkte
beweisen keine Identität für Bézier-, Teilkreis- oder NURBS-Kanten.

Die echten nativen Regressionen in `cad-finish-domains-extended.test.mjs`
prüfen klassifizierte SVG-Bézier- und Teilkreiskanten, originale gebündelte
Schriftkonturen und tatsächliche STEP-importierte NURBS ohne Spezialcallback.
`cad-finish-remove-extended.test.mjs` prüft lokale Ankerumbasierung, erhaltene
räumliche Arbeitsebene und verschachtelte Finish-Herkunft beim Entfernen des
letzten Wrapper-Finishs sowie anisotrope Größenänderungen einer Quelle.

## Laufzeitdaten, Prüfgrenze und offene Arbeit

Nur `cadProjectSnapshot` entfernt die expliziten Laufzeitfelder `view`,
`displayQuality`, `exportQuality`, `displayMesh`, `renderData`, `renderBuffers`,
`cache`, `caches`, `workerHandles`, `workerState` auf Root-/Knotenebene.
Unbekannte Modellfelder werden abgelehnt, statt still verloren zu gehen.
Anzeigequalität bleibt eine separate Programmeinstellung. CAD-Knoten dürfen
kein `mesh` speichern; eingebettete Referenzmeshes sind die Ausnahme.

Das Datenmodul prüft endliche Werte, Größen-/Anzahlgrenzen, Quellenstruktur,
Matrizen, Version, IDs und Metadaten. Es kann weder BRep-Gültigkeit noch
triangulierungsfreie BRep-Inhalte, Profilgenauigkeit, CAD-Statistik oder
topologische Wiederzuordnung beweisen. `triangulation:false` ist ein
Writervertrag. Die tatsächliche OCCT-Reader-/Writer-/Buildvalidierung muss
vor jeder bestätigten Übernahme diese Eigenschaften nachweisen. Die interne
Testfixture enthält deshalb ausdrücklich synthetische BRep-Texte.

Die native Service-/Worker-/Formen-/Werkzeugausführung und die getrennte
v5-Autosave-/CAD-Bibliothek sind implementiert und in eigenen tatsächlichen
OCCT-/Electron-Prüfungen untersucht. Das Datenschema bleibt davon getrennt:
ein synthetischer Schema-Roundtrip ersetzt keine geometrische Prüfung.
Die Abnahme des tatsächlich aktivierten Produkts, alle finalen Versions-,
Lizenz-/Quellpaket- und Portable-Gates bleiben gesondert erforderlich.
Aktuelle Nachweise und historische Integrationskarte stehen in
`CAD-UMSTELLUNG-PRUEFMATRIX.md`.
