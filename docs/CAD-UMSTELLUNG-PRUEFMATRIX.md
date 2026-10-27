# CAD-Umstellung: Integrationskarte und offene Abnahme

Stand: 11.10.2026. Aktueller Quellstand: Formnaro 0.11.0 mit produktivem
CAD-Einstieg `src/cad-main.js` und Projektformat 5.
Diese Datei dokumentiert Soll, untersuchten Iststand und noch erforderliche
Nachweise. Sie ist **kein Prüfbericht einer ausgelieferten CAD-Ausgabe**.

## Nachweisstand der neuen CAD-Module und Oberfläche

Der produktive `index.html` startet jetzt `cad-main.js`; `package.json`
enthält Version 0.11.0. Die Hauptoberfläche, ihr CAD-Worker und das WASM im
produktiven `dist` sind per SHA256 bytegleich mit dem final geprüften
Hauptoberflächensnapshot `index-Bu0z_mmS.js` / `cad-worker-DYIYHKvj.js`.
WASM-SHA256: `964835f6a345ab3a9ab07852fb8d047fb081d38c20849a65b1c037c1d3f2ad8c`.
Die vier Desktopprüfungen für Gesten, Werkzeuge, Platzierung und Bearbeitung
sind darin nacheinander erfolgreich ausgeführt worden. Belege einschließlich
Resultaten, Einzelprotokollen und Hashmanifest stehen in
`work/cad-v011/final-ui-gates`.

Damit ist der produktive CAD-Hauptbuild durch diese UI-Prüfungen abgenommen.
Die finale gepackte EXE mit tatsächlicher Produktversion, ASAR und Original-
Preload/IPC bleibt ausdrücklich ein separates offenes Gate. Diese Datei
bestätigt keine bereits ausgelieferte oder veröffentlichte portable Ausgabe.

| Bereich | Tatsächlicher Nachweis | Prüfgrenze / verbleibende Abnahme |
| --- | --- | --- |
| Format 5 / Matrix / Revision | `cad-project.test.mjs`: strikte v5-Grenze, unbekannte Modellfelder abgewiesen, vollständige finite invertierbare affine Matrix, kanonische Revision, getrennte Referenzmeshes, Originalkonturvertrag und persistente geometrische Anker. | Das Datenschema allein beweist weder native BRep-Gültigkeit noch Körper-/Profilgenauigkeit. Alte Daten und bestehende Nutzerprofile dürfen dadurch nicht migriert werden. |
| Transaktionen / Worker / Darstellung | Tatsächliche native Workerprüfungen und isolierte Electron-Browserprüfungen: feste Ausgangsrevision, unbestätigte Vorschau, Apply/Undo/Redo, Workerwechsel nach Abort, nativer Wiederaufbau, Anzeigequalität getrennt vom CAD-Modell. | Caches besitzen Grenzen; ihre kodierten Bytebudgets sind kein gemessener WASM-Heap. Vollständige portable Anwendung einschließlich ihrer IPC-/KI-Einstiege bleibt gesondert zu prüfen. |
| Native Körper / Formen / affine Werkzeuge | Die neue native Service-, Rezept- und Werkzeugausführung verwendet CAD-BRep, CAD-Booleans, exakte affine Körpertransformationen, CAD-Grenzen, Strahltreffer und Flächennormalen. Reine Mathematikprüfungen und tatsächliche OCCT-Tests sind getrennt. | Form-/Gewinde-/STEP-/Exportprüfungen stehen in ihren eigenen verpflichtenden Testdateien; diese Zeile ist kein pauschaler Freigabenachweis für jede denkbare Parameterkombination. |
| Originalkonturen mit Selbstschnitten | `cad-self-contours.test.mjs`: sechs erneut ausgeführte native Prüfungen für beide Füllregeln, vorzeichenrichtige Windingzahlen, wiederholte/gegengerichtete Pfade, originale Selbstschnitt-Bézieräste, gedrehte Ellipse mit vertauschten Radien und STEP-Erhalt zweier geschlossener Bézier-Loben. Fehlerhafte oder unvollständige native Ray-Schnitte werden abgewiesen. | Native Flächenaufteilung und originale Kurvenparameter, keine Polygonabtastung als Modellgrundlage. Die Innenpunktklassifikation besitzt begrenzte Kandidaten und weist eine nicht eindeutig klassifizierbare Region ab; dies ist kein allgemeiner Vollständigkeitsbeweis beliebiger Eingabepfade. |
| Kanten und Finish | `cad-finish-domains-extended.test.mjs`: sechs echte native Fälle für originale Font-/SVG-Bézier-/Teilkreiskurven, STEP-importierte NURBS, vollständige Kantenidentität, manipulierte Kanten-BRep-Abweisung. `cad-finish-remove-extended.test.mjs`: drei native Fälle für Wrapperentfernung, verschachtelte Herkunft, Quellenhöhe und gebundene Arbeitsebene mit Preview/Apply/Undo/Save/Reload. | Quellenverlust oder Mehrdeutigkeit wird abgewiesen. Fünf Kurvenpunkte und OCCT-Indizes werden nicht als belastbare Herkunft ausgegeben. Beliebige Formänderungen haben keinen garantierten automatisch stabilen Kantenbezug. |
| Flächenbindung / Automation / Quellen | `cad-group-plane-extended.test.mjs`: acht echte native Fälle für volle affine Ebenenumbasierung, verschachtelte Quellenpfade, Rezeptänderungen, unverwandte Quellen, Delete/Detach mit Lageerhalt, mehrere Zwischenrebuilds und erhaltene Aliasidentität. | Ein nicht mehr eindeutig zuordenbarer Flächenbezug wird gelöst; die letzte räumliche Ebenenlage bleibt. Ein solcher Bezug ist keine persistente numerische Face-ID. |
| Native Präzisionsabfragen | `cad-precision-native-extended.test.mjs`: acht echte native Fälle für Schnittkonturen, Lochkappen und geschlossene Clips, native SVG-Linien/Kurven mit Fehlergrenze, rationale Kurven, Wandproben, volle Kantenrahmen und affine Quellenkanten. | Wandstärke ist ausdrücklich eine Stichprobe: `complete:false`, separates `samplesComplete`, kein garantierter globaler Mindestwert. Schnitt-/Kantenanzeige ist abgeleitet und kein Modellrezept. |
| Tatsächliche Hauptoberflächengesten | `cad-app-gestures-desktop.cjs` im finalen Snapshot: native Maus-Eckgeste mit 0 mm Ankerfehler und einem Undo, direkte Bewegung, 3-mm-Lift mit gleichem CAD-Volumen, native Quellenanzeige mit Undo, orthografische Einpassung und Projektionswechsel ohne Modelländerung. Abort 4 ms, 123 Ticks während des Abbruchnachweises, bestätigter Stand und neuer Worker erhalten. | Sandboxprofil ohne Produkt-Preload. Keine Browserfehler oder externen HTTP-Anfragen. Gemessene Reaktionszeit dieser Fixture ist kein allgemeines Leistungsversprechen für beliebige Modelle. |
| Tatsächliche Hauptoberflächenwerkzeuge | `cad-app-tools-desktop.cjs`: 26 geprüfte Bedienphasen im finalen Snapshot; echte Canvas-Mausereignisse, native Rundung/Fase/Quellmaß/Entfernung, Rahmenwahl einschließlich Rückseite, Passung, drei Muster, CAD-Messung/Abstandskorrektur, Sperre/Revision/Undo, Lineal, Mehrkörper-Schnitt mit offenen Bohrungen, Kollision/Wandstichprobe und tatsächlich heruntergeladenes natives SVG. 1479 Renderer-Ticks, keine Browserfehler oder externen HTTP-Anfragen. | Getrenntes Profil, Sandbox ohne Produkt-Preload, mit produktivem Hauptbuild bytegleiche Assets. Diese 26 Bedienphasen sind keine Zusage einer bereits ausgelieferten portablen Anwendung. |
| Tatsächliche Platzierungsabläufe | `cad-app-placement-desktop.cjs`: 18 geprüfte Bedienphasen desselben finalen Snapshots. Palette auf Ebene und CAD-Fläche; gespeicherte v5-Bibliothek mit Undo; Vorlageneditor mit 24-mm-Höhenbindung und erhaltener Unterkante; Magnet bei Scherung/Mirror mit gehaltenem Preview, Release, einem Undo, Escape und zusätzlichem Click-Dialog-Cancel; seitliche Zylinderarbeitsebene mit echter Tangentialnormaler und Quellenherkunft. 1622 Renderer-Ticks, keine Browserfehler oder externen HTTP-Anfragen. | Palette stammt aus echtem trusted Mouse-Dragstart. Chromium `Input.dragIntercepted` liefert originale DragData; CDP `Input.dispatchDragEvent` erzeugt den trusted Drop, keine synthetische DOM-DataTransfer. Mausabläufe verwenden CDP `Input.dispatchMouseEvent`. Eigenes Profil, kein Zugriff auf Nutzerprojekte. |
| Tatsächliche Bearbeitungsabläufe | `cad-app-editing-desktop.cjs`: 25 benannte Bedienphasen desselben finalen Snapshots, 3101 Renderer-Ticks, keine Browserfehler oder externen HTTP-Anfragen. Echte Ctrl+A/T/S/R/Enter/Ctrl+C/V/Z-Tasten, Gesamtauswahl-Ausrichtung und CAD-Klick auf eine gesperrte feste Referenz, affine Spiegelung und Auflösen, verschachtelte Quellenparameter mit Dezimalkomma, Clipboard und Automation-Aliase. Root-/Child-Shiftwahl normalisiert auf den Vorfahren und bewegt die enthaltene Quelle genau einmal. Geschwisterquellen besitzen getrennte native orange Darstellungen; echter gehaltener Mausdrag verändert weder Serialisierung noch Undo oder die fertige Rootmatrix, Release verschiebt beide Quellen einmal mit einem Undo und lässt die unbeteiligte Quelle exakt. | Getrenntes Sandboxprofil ohne Produkt-Preload. Maus/CDP und Electron-Tastatur erzeugen trusted Browserereignisse. Echtes `touchCancel` erzeugt trusted `pointercancel` und stellt Quelle/Darstellung/Undo exakt wieder her. Die ursprüngliche doppelte Root-/Child-Translation wurde zuvor real mit 2 statt 1 mm reproduziert und danach real auf 1 mm geprüft. Die finale gepackte Portable-Ausgabe bleibt ein separates Gate. |
| Alte Daten / portable Speicherung | CAD-only-Policy verwendet eigene v5-Autosave-/Bibliothekskeys, ein versioniertes einseitiges IPC-Opt-in und ab 0.11 serverseitigen CAD-only-Modus. Die Speichertests prüfen verbotene Stat-/Read-/Write-/Remove-Zugriffe auf alte Meshdateien sowie Browserfallback. | Der reale portable EXE-Neustart und ihre tatsächliche Produktversion, Lizenz-/Quellpaket und Paketprüfung stehen im Releaseplan und bleiben separate Gates. |

Die Browserartefakte liegen unter `work/cad-v011/tools-browser`,
`work/cad-v011/app-placement` und `work/cad-v011/app-editing`;
persönliche Daten sind dort nicht enthalten.
Der reine Formatvertrag steht in `CAD-PROJEKTFORMAT-5.md`, die endgültige
Portable-Vorbereitung in `CAD-PORTABLE-RELEASE-PLAN.md`.

## Ursprüngliche Integrationskarte des untersuchten 0.10-Meshpfads

Diese Karte hält den Ausgangsstand fest. Die Spalten „Iststand“ und
„offener Nachweis“ wurden vor dem neuen CAD-Editor untersucht; sie sind
keine aktuelle Mängelliste der oben bereits nativ geprüften Module.

| Bereich | Untersuchter Iststand | Erforderliche Änderung | Offener Nachweis |
| --- | --- | --- | --- |
| Modellknoten | `geometry.js` speichert `size/pos/rot/mirror`; Gruppen, Text und Importe enthalten `mesh`. `validNode` verlangt für `cad` und Gruppen zusätzlich ein Mesh. | Eigene v5-Knoten mit CAD-Rezept, BRep, vollständiger affiner Matrix und CAD-Statistik. Referenzmesh als eigener Knotentyp. | Kein normales CAD-Objekt benötigt gespeicherte Dreiecke. Alle 23 Formrezepte erzeugen gültige, geschlossene CAD-Körper. |
| Formenerzeugung | `localManifold`, `fitParameters`, `parametric-geometry.js` erzeugen Netze. Text benutzt `TextGeometry`; SVG `ExtrudeGeometry` und Manifold-Vereinigung. | Native OCCT-Körper/Konturen und CAD-Extrusionen. Originale Font-/SVG-Kurven erhalten. Plugins verwenden dieselbe Rezeptausführung. | Konstruktionstoleranz einschließlich kleiner Merkmale; Zahnrad-/Gewindeprofile und Schraubbewegung separat nachgewiesen. |
| Gruppen und Quellen | `history.js:rebuildGroup` verrechnet Manifold-Körper, normalisiert das Ergebnis und speichert `node.mesh`. Nachträgliches Finish benutzt ein synchrones Callback. | CAD-Quellenbaum und CAD-Boolean; anschließende CAD-Kantenrezepte; Rezentrierung erhält volle Matrix und Quellenpositionen. | Quelle ändern, Loch unterdrücken/reaktivieren und verschachtelte Gruppen einschließlich Spiegelung/nichtproportionaler Skalierung. |
| Matrixerhalt | `matrixArray` erzeugt eine TRS-Matrix; `featureMatrix` multipliziert Elternmatrizen vollständig. `main.js:nodeFromMatrix` zerlegt die Resultate wieder in TRS und kann Scherung verlieren. | Volle 4×4-Matrix wird alleinige geometrische Transformationsautorität. UI-Felder/Griffe ändern definierte lokale Achsen oder Welttransformationsinkremente. | Scherung bleibt durch Spiegeln, Muster, Duplikation, Quellenänderung, Speichern und Undo exakt erhalten. |
| Auflösen | `main.js:ungroup` backt Scherung bzw. inkompatibel skalierte Parameterquellen zu Importnetzen und entfernt `children/params/operation`. | Kindmatrix wird mit Elternmatrix multipliziert; CAD-Rezept/Quellenbaum/BRep bleiben erhalten. Keine Mesh-Konvertierung. | Geometrie vor/nach Auflösen, Volumen und alle Parameter/Quellen gleich; mehrfach verschachtelte Rotation plus nichtproportionale Skalierung. |
| Eckmaße | `resizeAnchored` nutzt normalisierte Matrixspalten und `size`; Dragpfade verwenden lokale bzw. Elternachsen. | Maßänderung anhand CAD-Lokalgrenzen und Basistransformation; gegenüberliegende Ecke/Unterseite algebraisch festhalten. | Alle vier Ecken, Höhe, gedrehte/gespiegelte/gescherte Quelle und Gruppe; Enter/Blur ohne Doppel-Undo, Escape ohne Änderung. |
| Transaktionen | `edit-transaction.js` hat feste Baseline, neueste wartende Vorschau und einen Commit. `main.js` hat daneben `mutate`, Gruppierung, Kantencommit und KI-Commit. | Ein CAD-Transaktionsdienst für alle schreibenden Wege; Ergebnisprüfung und Revisionskontrolle vor Commit; bestätigten Stand von Vorschau trennen. | Fehler bei Geometry/Rendering/Commit, Abort, Pointercancel, verlorene Capture, veraltete Antwort: bestätigtes Projekt sowie Undo/Redo unverändert. |
| Worker | `calculations.js` erstellt/terminiert pro Berechnung einen Worker; `analysis-worker.js` lädt zuerst Manifold und bei CAD-Aufträgen zusätzlich OCCT. Teile des Render-/KI-Pfads rechnen im Renderer. | Dauerhafter OCCT-Worker mit beschränkten Caches; CAD-Picking/Statistik/Edit/Export über denselben Dienst. Bei Abort Worker terminieren und aus bestätigtem Projekt starten. | Bedienbarkeit innerhalb 1 s nach Abort; Generation/Revision schützt vor Antworten alter Worker; wiederholte Edits begrenzen JS/WASM/GPU-Speicher. |
| Darstellung | `render-data.js` und `geomFor` erzeugen Netze aus Manifold; `geometrySignature` enthält Segmente/Mesh/Parameter. Normalen werden aus Dreiecken berechnet. | Anzeige-Tessellierung getrennt cachen, OCCT-Normalen und Zuordnung jedes Dreiecks zur CAD-Fläche übernehmen. Kein Renderfallback über Manifold. | Anzeigequalität ändert nur Puffer, keine Modellrevision, Undo, BRep, Grenzen, Messung oder Volumen. |
| Grenzen/Absetzen | `coordinates.js:projectedBounds` läuft über Anzeigemesh-Vertices; `dropToPlane`, `bounds` und `toolBounds` hängen daran. | CAD-Extrema im angefragten Welt-/Ebenen-/Elternsystem; richtige Berührhöhe aus CAD. | Gedrehter Zylinder, Kugel, Bohrung, affine Gruppe: Extrema bleiben bei wechselnder Anzeigequalität identisch. |
| Ausrichten/Lineal/Passung | Ausrichten/Lineal verwenden bereitgestellte Meshgrenzen. Passung verändert `size`, Elternskalierung aus Spaltenlängen. | CAD-Grenzen und volle Matrix für definierte Maßrichtung; Passung bleibt lokales Maßwerkzeug mit bestehender Bedeutung. | U/V/N und XYZ, feste gesperrte Referenz, Ursprungwechsel; reale Spielmaße unter Scherung und Gruppenskalierung. |
| Messen | `measure-tools.js:pick` fängt an den drei Meshvertices/-kanten des getroffenen Dreiecks; Punkte referenzieren Objekt plus lokale Koordinate. | CAD-Vertex/Edge/Face-Abstände und geometrische Anker; Referenzmesh nicht als Messziel. | Echte Kreis-/Splinekante, Zylinderfläche und Punktabstand; keine Dreiecksdiagonale als CAD-Kante. |
| Arbeitsebene | Three-Raycaster bestimmt Meshfläche; `planeFromHit` benutzt Dreiecksnormalen. `referenceOnSurface` sucht passende Facetten. | CAD-Strahlschnitt und tangentiale Flächennormale; Herkunft plus Anker; letzte räumliche Lage bei verlorener Zuordnung erhalten. | Tangente auf runder Fläche unabhängig von Anzeigequalität; gültiges Follow unter affine Transformation; Verlust/Multi-Match nachvollziehbar. |
| Bibliotheksplatzierung/Magnet | `surfacePlacement` raycastet Mesh-/Schnittflächen; Magnet setzt Position/Rotation und verwendet `dropToPlane`. Importe sind derzeit gültige Unterlagen. | Ausschließlich CAD-Ziele, CAD-Treffpunkt/-Normalen und CAD-Absetzen; volle Quellmatrix erhalten. | CAD-Zylinder als Ziel, gesperrte Unterlage, Scherung/Mirror; Referenzmesh wird ignoriert; Vorschau/Abort/Revision wie bisher. |
| Kanten | OCCT-Kanten aus Mesh zu BRep oder gespeichertem STEP-BRep; Kantenanker aus Typ/Anzahl/fünf normalisierten Punkten. Rahmenauswahl vorhanden. | Direkte CAD-Kanten, OCCT-Herkunftsabbildung plus geometrische Anker; bei Mehrdeutigkeit kein automatisches Match. | Quellenänderung mit eindeutiger Zuordnung; Mehrdeutigkeit scheitert atomar und erhält letzten Körper; Rahmengesten bleiben. |
| Prüfung/Schnitt/Farbe | `model-analysis.js` nutzt Meshschnittvolumen und Facetten-Rays; `section-geometry.js` trimmt Manifold; `coloredParts` intersect/subtract. | CAD-Kollisionen/Volumen/Schnitt/Farbaufteilung. Wandstärke bleibt bezeichnete Stichprobe, Startpunkt/Normale/Treffer stammen aus CAD. | Hohlräume, getrennte Solids, Farbanteile, Schnittkappen und Wandproben; keinerlei Referenzmesh-Beteiligung. |
| Projekt/Undo/Revision | `snapshot` kopiert vollständige Meshknoten als v4; Undo hält diese Snapshots. `revisionOf` hasht JSON des gesamten Projekts. | v5-Snapshot-Serializer erlaubt Rezepte, BRep ohne Triangulierung, Matrix, Quellen und Projektmetadaten; temporäre Puffer außerhalb. | `.ocad`, Undo und Revisionsinput enthalten keine Anzeigedaten/Workerhandles; erlaubte Referenzmesh-Geometrie bleibt. |
| Export | STEP kann Mesh zu facettiertem BRep umwandeln; STL/OBJ/3MF/GLTF/SVG aus Manifold. Exportfilter prüft nur solid/hidden. | Ausschließlich bestätigte CAD-Körper; STEP direkt, eigenes Exportmesh aus CAD mit toleranzgesteuerter Tessellierung; SVG aus CAD-Konturen. | Unabhängiger STEP-Leser; Exportmesh gegen Körper und Toleranz; Farbe, getrennte Teile/Hohlräume, Referenzmesh ausgeschlossen. |
| KI | `automation.js`/`automation-access.js` rechnen synchron mit Manifold für Befehle, Bounds und Volumen; Kontext beschreibt v0.10/v4/Segmente. | Gleiche Werkzeugnamen/API-Abläufe mit CAD-Dienst; Preview/Apply async bis Ergebnisprüfung/Commit; CAD-Revisionsinput, v5-Kontext/Beispiele/Schemas. | IDs/Sperren/Quellen/Matrizen erhalten; stale Preview abgelehnt; ein Undo, kein UI-Blockieren, keine Referenzmesh-Booleans/Exporte. |

## Alte Daten und Referenzmesh: verbindliche Trennung

| Einstieg | Ist | Soll für 0.11 | Offene Prüfung |
| --- | --- | --- | --- |
| Projekt öffnen | `main.js:validateProject` erlaubt 1–4, `migrateProject` schreibt v4, `synchronizeHistory(upgrade:true)` rekonstruiert alte Operationen. | Nur v5 annehmen; vor Kernel-/Modellarbeit verständlich ablehnen. Keine automatische Konvertierung. | v1/v2/v3/v4 und unbekannte Version unverändert ablehnen; laufendes Projekt/Undo/Daten stabil; Prüfsummen der Altdateien gleich. |
| Start/Autosicherung | Startup lädt v4 oder v3/v2/v1; `changed`/beforeunload schreiben v4. | Eigener v5-Key und eigener Dateiname; ausschließlich v5 lesen/schreiben; Altdateien erhalten. | Mit nur altem Autosave leeres neues Projekt; mit altem plus v5 ausschließlich v5; während Vorschau und Abort nur bestätigten Stand sichern. |
| Persönliche Teile | `templates.loadTemplates` liest Bibliothek-v1 ohne Projektversion. Bibliotheksimport/-export verwendet Version 1. | Getrenntes CAD-Bibliotheksformat/Key/Dateiname; alte gespeicherte Teile weder laden noch migrieren. Favoriten/Formenpakete weiterhin erhalten. | Alter Bibliotheksinhalt bleibt bytegleich, keine automatische Importaktion; CAD-Template einschließlich Matrix/Finish/Quellen erneut erzeugbar. |
| Portable Daten | `backend/program-data.json` registriert Autosaves v1–v4 und eine v1-Bibliothek; einmalige Portablemigration kopiert alle bekannten alten Keys. | Neue v5/CAD-Bibliotheksdateien registrieren, bisherigen Preferences/Layout/Favoriten/Pluginvertrag erhalten. Alte Modelldaten nicht als neue CAD-Daten behandeln. | Kopie/Restart in isolierten Profilen; keine Altüberschreibung durch Startup, Autosave oder persönliche Vorlagenspeicherung. |
| STL/OBJ | Import erzeugt `type:'import'` und `mesh`; derselbe Typ kann STEP enthalten. Grundsätzlich solid und für Booleans/Ziele/Export zugelassen. | Eigener `referenceMesh`-Knoten; wählen/bewegen/drehen/skalieren/verbergen/sperren erlaubt. Kein CAD-Körper, keine Quelle/Lochform. | Offenes sowie geschlossenes Referenzmesh sichtbar/speicherbar; jeder CAD-Einstieg (Gruppe, Passung, Messen, Arbeitsebene, Magnet, Kanten, Prüfung, Export, KI) weist Referenzen ab/ignoriert sie gemäß Werkzeug. |
| STEP/SVG | STEP und SVG landen ebenfalls als Importmesh. | STEP als CAD-Import; SVG als CAD-Kontur-Extrusion. Typgrenze unabhängig von Dateiendung nach Import. | Mehrkörper-STEP/Hohlräume; SVG-Außenkonturen/Innenlöcher/Bézier/Ellipsen; keine Tessellierung als Rezeptbasis. |

## Wesentliche Risiken und Reihenfolge

1. **Kernvorbedingungen zuerst:** beliebige affine Transformationen,
   CAD-Rayintersections, präzise Grenzen und triangulierungsfreier BRep-Writer
   müssen im tatsächlichen WASM-Kern nachgewiesen werden. Vorhandene reine
   Datenschemas beweisen weder gültige BRep-Körper noch geometrische Genauigkeit.
2. **Eine Matrixautorität:** `size`, `rot` und `mirror` dürfen keine versteckte
   zweite Geometriequelle werden. Bestehende TRS-UI bleibt, die gespeicherte
   Matrix muss Scherung unverändert behalten. Maße, Rezeptdimensionen und
   Transformationsmaßstab sind ausdrücklich zu unterscheiden.
3. **Ein bestätigter Zustand:** alte Nebenwege für Gruppierung, `mutate`,
   Kanten, importierte Vorlagen und KI müssen am gleichen Transaktionsdienst
   enden. Renderer-/GPU-Fehler nach einer Kernelrechnung dürfen keinen halben
   Commit verursachen.
4. **Topologie verändert sich:** ein numerischer OCCT-Index allein ist kein
   stabiler Bezug. Herkunft, geometrischer Anker und eindeutige Wiederzuordnung
   benötigen eigene Tests; gespeicherte Bezugsdaten behaupten diese Eigenschaft
   noch nicht.
5. **BRepgröße und Speicher:** der bisherige 50-MB-Projekt-/4-MB-Bibliotheksrahmen
   und 60 Undo-Stände müssen für echte CAD-Quellen plus Ergebnisse überprüft
   werden. Persistierte BReps sind Teil des CAD-Modells, OCCT-Handles und
   Tessellierungen sind begrenzt zu haltende Laufzeitcaches.
6. **Auslieferung erst vollständig:** neue Foundations/Prüfmodelle bleiben
   intern, bis alle Formen/Werkzeuge, unabhängiges STEP-Lesen und native
   isolierte Abnahme gegen das tatsächliche Paket bestanden sind. Kein
   allgemeiner Versionswechsel auf 0.11.0 als Ersatz für fehlende Integration.

## Ursprünglicher End-to-End-Prüfkatalog

Historischer Planungsstand des 0.10-Meshpfads. Aktuelle Nachweise stehen oben;
die finale gepackte 0.11-EXE-Abnahme bleibt davon getrennt.

- Zylinder mit Bohrung und Rundung: Quelle ändern → Undo/Redo → v5 speichern →
  schließen/öffnen → unabhängig STEP lesen; analytische Flächen bleiben.
- Anzeigequalität mehrfach wechseln; CAD-Maße, Volumen, STEP, Arbeitsebene,
  Passung und Modellrevision identisch.
- Verschachtelte ungleichmäßige Skalierung plus Rotation/Spiegelung; erzeugte
  Scherung bleibt durch Ecke/Höhe, Quellenedit, Auflösen und Save/Load erhalten.
- Text/SVG/Gewinde/Mutter/Zahnrad und Pluginrezepte vollständig; Profilmaß,
  Steigung, Drehsinn, Querschnitte, Hohlräume und Farben erhalten.
- Fehler/Abort/stale Worker/Pointercancel während Edits, Gruppe, Finish, KI und
  Import: bestätigter Zustand/Undo/Autosave ohne Teiländerung.
- Referenzmesh sichtbar und v5-speicherbar, aber aus jedem CAD-Präzisions-/
  Booleschen-/Produktionsexportpfad ausgeschlossen.
- Dauerhaft begrenzte Caches, UI-Abbruch unter 1 s, neues Profil und tatsächliches
  portables ASAR getestet; alte Ausgabe und persönliche Daten unverändert.
