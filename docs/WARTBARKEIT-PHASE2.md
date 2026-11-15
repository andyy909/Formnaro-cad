# Phase 2 – Abhängigkeiten und entfernte Altlasten

Basis: `25a324aca3ec85316d4b7c3eb6eeb1966cb390f8` (Phase 1), nicht main. Keine Phase-3-Arbeiten.

## P2-1

`npm run module:graph` parst Imports, Re-Exports, dynamische Literal-Imports, require und URL-Konstruktoren. Relative Pfade werden vom jeweiligen Importeur aufgelöst, Query/Fragment entfernt. Der Graph durchläuft auch Zwischenmodule außerhalb src/. Namensnennungen (einschließlich Dokumentation) und sonstige Pfadliterale sind getrennte Reviewhinweise, keine Erreichbarkeitskanten. Berechnete Pfade und nicht im Git-Inventar vorhandene Ziele bleiben sichtbar; er behauptet keine vollständige Auflösung beliebiger Laufzeitberechnungen.

Vor Entfernung: 558 src-Module, 522 vom aktuellen Einstieg erreichbar, 34 ausschließlich vom alten main.js. Drei Regressionen prüfen Mini-Namensgleichheit, Worker/URL/Re-Exports, falsche Texttreffer und externe Zwischenmodule. Der historische Sollwert 34 stimmt, die frühere Teilzahl 15 ohne externe Erwähnungen nicht: heute elf. Die generierte JSON-Datei überschreitet als maschineller Nachweis die ungefähre 400-Zeilen-Grenze; handgeschriebener P2-1-Diff bleibt unter 200 Zeilen.

Manuell geprüfte berechnete Produktionspfade: cad-kernel-loader.js löst WASM/Laufzeitdateien auf; working-speed-verification.cjs lädt zwei benannte Backend-Prüfer; die Paket-Skriptaufrufe laden backend/freecad-runtime.cjs. Keiner adressiert ein entferntes Altmodul. Bei Mini und Mini-CAD zeigen gleichnamige Importe auf deren eigene Verzeichnisse. index.html lädt cad-main.js.

## P2-2

Alle 34 exklusiven Altmodule entfallen. Kein Modul dieser Liste wird vom aktuellen Einstieg, Backend, Electron, Preload, Mini oder Mini-CAD verwendet. Aktive src/mesh-engine-Module, Projektladewege und deren Migration bleiben unverändert. Der Begriff v0.9-Entfernung bezeichnet hier das alte Programm und seine exklusiven Implementierungen, nicht die weiterhin aktiv verwendeten Mesh-Importfunktionen.

| Schritt | Entfernte Module unter src/ |
| --- | --- |
| P2-2a | calculations.js, edge-tools.js, fit-presets.js, magnet-tools.js, measure-tools.js, organization-ui.js, pattern-dialog.js, precision-tools.js, render-data.js, shape-inspector.js, workplane-tools.js |
| P2-2b | ai-ui.js, analysis-worker.js, automation-access.js, automation.js, cad-kernel.js, coordinates.js, edit-transaction.js, exports.js, feature-transforms.js, file-data.js, fit-tools.js, geometry.js, history.js, library-ui.js, main.js, model-analysis.js, parametric-geometry.js, plugins.js, project-data.js, scene-tools.js, section-geometry.js, settings-ui.js, templates.js |

P2-2a löscht 321 Quellzeilen. P2-2b entfernt den zusammenhängenden restlichen Altprogrammbaum; allein main.js hat 606 Zeilen. Diese ausdrücklich verlangte mechanische Entfernung lässt sich nicht sinnvoll unter 400 Diffzeilen halten. Die funktionalen Testanpassungen sind separat nachvollziehbar. Der Zwischenstand P2-2a enthält absichtlich einen nicht mehr startbaren Alt-Einstieg; kein aktiver Einstieg verwendet ihn.

### Verbleibende Abdeckung

- geometry, history, parameters, feature-transforms und workplane testen nun die **aktive** Mesh-Engine. 30 Prüfungen bestanden; die alte Ablehnung einer reinen Lochgruppe gilt im aktuellen Meshmodell nicht: der aktuelle Vertrag erhält eine gültige subtraktive Gruppe. Die disjunkte Schnittmenge bleibt abgewiesen. Keine Produktänderung dafür.
- organization und extensions behalten aktive Organisations-, Mesh-Migrations-, Export- und Formelprüfungen. Nur die entfernte klassische Vorlageninstanziierung entfällt; native Vorlagen haben weiterhin ihre eigene vollständige Suite.
- cad-form-controls, cad-plugin-manifest und cad-plugin-recipes verwenden historische Daten/Erwartungen statt Altprogramm-Imports. cad-template-recipes prüft explizite arithmetische Sollwerte. preferences-plugins prüft den aktuellen Parser und weiterhin gemeinsame Einstellungen/Übersetzungen.
- `tests/fixtures/legacy-compatibility.json` wurde vor der Löschung mit den unveränderten Modulen der Phase-1-Basis erzeugt: 23 Palettenformen, Original-Plugin und Parser-Sollwerte, gefaste CAD-Gruppe und STEP-Import. Die zwei BUG-50-Prüfungen laden diese festen historischen Projekte durch den **aktuellen** Mesh-Adapter und prüfen BRep-/Quellenerhalt. Keine Ersatzimplementierung des gelöschten Programms.
- audit-controller behält BUG-55, BUG-54 und BUG-39 (Controller, Worker, Zwischenablage). Nur zwei Prüfungen des entfernten klassischen Renderers entfallen. audit-legacy behält Mesh-3MF sowie beide echten atomaren Mini-Speicherprüfungen; zwei klassische Bibliotheksprüfungen entfallen. Die drei textCoupled-Dateien bleiben markiert; all-functions und review-v0114 unverändert.
- Vier ausschließlich alte Node-Dateien entfallen: anchored-size.test.mjs, automation.test.mjs, cad.test.mjs, v09.test.mjs. Alle vier bleiben mit `status: obsolete` im Manifest nachvollziehbar. Zugehörige reine v0.9-Helfer sowie die zwei direkt vom Alt-Geometriemodul abhängigen Library-/Magnet-Desktophelfer entfallen; ihre npm-Befehle ebenfalls.
- `test-inventory` erhält obsolete-Tombstones auch nach Regeneration und führt fehlende Dateien nicht aus. Der neue echte Unterprozess-Test prüft das einschließlich tatsächlicher Ausführung eines vorhandenen Tests und bytegleicher Regeneration. Er steht ausdrücklich als pass im Manifest.

Vorher: 515 grüne Node-Dateien, 30 begründete Laufzeitfehler und ein nativer Schrift-Timeout; außerdem 19 Electron- und sechs Python-Dateien. Nachher-Auswahl: **513 = 515 + Graph-Test + Inventar-Test − vier obsolete Dateien**. Die 30 Fehler/der Timeout werden weder gelöscht noch als grün umgedeutet. Das Manifest enthält 573 historische/aktuelle Einträge, davon vier Tombstones.

### Desktop-Abnahme

`npm run test:desktop` scheiterte schon auf der Phase-1-Basis: ungebundenes exportModel im aktuellen Testhook, danach veraltete API des v0.9-Smokes. Der Hook bindet nun den bereits vorhandenen Export der Workflowfabrik; normales Produktverhalten bleibt gleich. Der Smoke prüft den aktuellen Einstieg mit isoliertem Profil: Palettenklick, echte native Geometrie, unveränderliche Vorschau, genau ein Undo bei Übernahme, Undo/Redo, native Platte mit vier Bohrungen (Volumen 13928.761101961532), aktiven Projekt-Roundtrip und STL/3MF/OBJ-Downloads. Null Rendererfehler/Netzwerkzugriffe und regulärer Fenster-/Prozessabschluss. Die alten Drag/SVG-Checks dieses nicht mehr funktionsfähigen Smokes werden nicht als ausgeführt behauptet; aktuelle Gesten/Importe besitzen separate vorhandene Prüfungen.

Gezielte gemischte Suite 80/80, Standardtests 100/100, Build und neuer Desktop-Smoke bestanden. Vollständige Vorher-/Nachher-Quellprüfungen sind unten verlinkt. Lokale Paketprotokolle und deren genaue Zuordnung stehen in der Abschlussübergabe und PR #36. Keine Installation ersetzt, keine Cloud-KI-Versuche, kein Merge und keine Veröffentlichung.

## P2-3 – Historische Paketskripte

141 Kandidaten aus `scripts/package-*.mjs` und `scripts/archive-*` wurden einzeln inventarisiert. **135 Dateien** werden bytegleich nach `scripts/legacy/` verschoben, **48** zugehörige package:-Einträge entfernt. Alle nach P2-2 verbleibenden test:-Einträge sind unverändert. `docs/LEGACY-SKRIPTE.json` enthält Herkunft, Ziel und SHA256 jeder Datei sowie die entfernten Befehlsnamen. Alle SHA256 stimmen sowohl gegen die ursprünglichen Arbeitsdateien als auch gegen die Git-Blobs des Basiscommits.

Sechs Dateien bleiben bewusst am bisherigen Pfad:

- package-freecad-python.mjs ist der reale Packager hinter current-release.mjs.
- package-advanced-modeling.mjs, package-ai-tasks.mjs, package-freecad-document.mjs und package-surfaces.mjs gehören zu dessen bedingten Quellen-/Prüfketten. Ein bloßer direkter Importvergleich würde sie fälschlich als unbenutzt ausweisen.
- package-cad-release.mjs ist ein weiterhin geprüfter Kompatibilitätseinstieg zu current-release.mjs. Auch unveränderliche Lizenzhinweise verweisen darauf. Ihn zu verschieben würde aktive Verträge beschädigen; diese begründete Ausnahme zur wörtlichen Nur-Import-Regel bleibt erhalten.

Das historische Eingabemanifest security-release-inputs.json erhält den neuen Pfad zum archivierten security-Paketskript; kein verschobener Skriptinhalt wird geändert. Das Testmanifest wird auf die neuen referenzierenden Pfade regeneriert. `git grep` über alle 135 alten Pfade liefert außerhalb scripts/legacy/ und docs/ keinen Treffer. Der neue Archivre­gressionstest prüft SHA256, fehlende Altpfade, erhaltene Ausnahmen und existierende Einstiegdateien aller verbliebenen test:-Befehle; er ist ausdrücklich als pass im Manifest eingetragen. Zweifache Manifestregeneration ist bytegleich. Aktuelle Auswahl: **514 = 515 + drei neue Dateien − vier obsolete**.

Widerspruch zur wörtlichen Anforderung: Bytegleiches Verschieben erhält in historischen Dateien deren alte relative Imports und arbeitsverzeichnisabhängige Pfade. Daher werden diese Dateien als historisches Quellenarchiv behandelt, nicht als unmittelbar ausführbare Releasebefehle. Eine Wiederbelebung müsste ihre alten Umgebungen/Pfade gezielt rekonstruieren. Aktive Release-/Testbefehle bleiben außerhalb dieses Archivs; sie werden durch reale Windows-Paketläufe vor/nach der Änderung geprüft. Der vollständig neue Paketlauf wird nicht durch einen bloßen Build oder eine existierende ältere EXE ersetzt.

### Prüfumgebung

Die ersten lokalen Sammelläufe verwendeten versehentlich das systemweite Node 22.16.0 statt der in .node-version festgelegten 22.23.4. Drei unveränderte Diagnosetestdateien scheiterten an der alten Loader-Hook-Implementierung; alle zwölf betreffenden Fälle bestanden unter 22.23.4. Zusätzlich trat unter konkurrierender lokaler Last ein Fonttest-Timeout auf. Diese abgebrochenen Vorläufe gelten nicht als Abnahme. Weitere Vollprüfungen nutzen die gepinnte Laufzeit; die beiden vollständigen Paketprüfungen laufen nacheinander. Die vollständigen CI-Läufe verwenden ebenfalls .node-version. Der Paket-Vorhervergleich nutzt den unveränderten P2-2b-Commit in einem eigenen Arbeitsbaum, der Nachhervergleich den archivierten Endstand; beide auf Windows x64 mit 22.23.4 und eigenen Ausgabeordnern. Es wird keine Nutzerinstallation gestartet oder ersetzt.

### Vollständige CI-Nachweise

Alle fünf Jobs jedes folgenden Laufs sind erfolgreich: Windows mit Build, Standardtests und vollständiger Manifestauswahl, beide Linux-Teilmengen sowie Mini und Mini-CAD mit ihren Tests und Builds. Die Windows-Zeiten beziehen sich nur auf test:all.

| Schritt | Geprüfter Commit | Windows-Dateien | Dauer | CI-Lauf |
| --- | --- | --- | --- | --- |
| P2-1a | dd12c071e6fd3346383df1a9b5740f41f5dff978 | 516/516 | 22 min 46 s | [43734735129](https://github.com/andyy909/Formnaro-cad/actions/runs/43734735129) |
| P2-2a | 29d783842888c9c5d6c9a90034495cce5c128480 | 516/516 | 23 min 57 s | [43734878001](https://github.com/andyy909/Formnaro-cad/actions/runs/43734878001) |
| P2-2b | 2bcb131b262ac438b3f387852a00015a395f4393 | 513/513 | 18 min 27 s | [43735841690](https://github.com/andyy909/Formnaro-cad/actions/runs/43735841690) |
| P2-3 | a72eb67f5831b02c07cfe947c0968c26dbb3279c | 514/514 | 17 min 15 s | [43736722215](https://github.com/andyy909/Formnaro-cad/actions/runs/43736722215) |

Beim integrierten P2-3-Lauf bestanden unter Linux jeweils 257/257 Dateien (10 min 58 s und 11 min 1 s). Keine neuen Fehler oder Timeouts in der ausgewählten Quellsuite. Die begründeten 30 Laufzeitfehler und der eine native Schrift-Timeout bleiben im Manifest ausdrücklich außerhalb dieser Auswahl; die 19 Electron- und sechs Python-Dateien sind ebenfalls kein Bestandteil ihrer Pass-Zahl.

Die Phase-2-Änderungen wurden auf zwei unabhängigen Reviewachsen geprüft. Der dabei gefundene externe Zwischenmodulfall im Graphen ist korrigiert und durch eine Regression geschützt. Nach dem Nachreview blieben keine offenen Codebefunde. Phase 3 beginnt erst nach einer neuen Entscheidung des Nutzers; die Entwürfe #33 bis #36 werden im Rahmen dieser Arbeit nicht zusammengeführt.

### Paketprüfung: vorhandene Workbench-Testannahme korrigiert

Der erste vollständige Paket-Vorherlauf auf unverändertem P2-2b bestand 756/756 native Einzeltests, Build, alle drei Abhängigkeitsprüfungen sowie die Prüfungen der gebauten EXE für Fusion, Solid und Kontextmenü. Er scheiterte anschließend in der Workbench-Prüfung. Der Prüfer erwartete nach Reload ein automatisch wiederhergestelltes Projekt. Die bereits auf der Phase-1-Basis vorhandene Startseite bietet die Autosicherung bewusst als auswählbaren Eintrag an; das zunächst leere Modell entspricht diesem aktuellen Vertrag.

Die ausschließlich externe Prüfdatei `backend/workbench-verification.cjs` verwendet jetzt diesen echten Bedienweg: leeren Start prüfen, den Recovery-Eintrag anklicken, auf den vollständig abgeschlossenen Öffnungshandler warten und danach Modus, Layout sowie das vollständige serialisierte Projekt erneut vergleichen. Kein Produktverhalten und kein Paketprogramm wurde dafür verändert. Die identische, zuvor betroffene EXE bestand mit dem endgültigen externen Prüfer alle 14 Workbench-Prüfungen und beendete sich regulär mit Exitcode 0. Das unabhängige Nachreview bestätigte die Korrektur einschließlich der asynchronen Abschlussbedingung.

Für einen fairen vollständigen Paketvergleich erhalten Vorher und Nachher denselben Testfix. Die Vergleichsbasis `335bccc62b570e43766178d8f4643a439ab76cda` besteht ausschließlich aus P2-2b plus diesem Prüferfix; die Skriptarchivierung ist dort noch nicht enthalten. Der ursprünglich fehlgeschlagene Lauf bleibt als solcher erhalten und gilt nicht als vollständige Paketabnahme. Endgültige Paketberichte, Exitcodes und Hashes stehen in PR #36 und der lokalen Abschlussübergabe.

### Offene Paketabnahme – zusätzlicher Auftrag erforderlich

Der vollständige Wiederholungslauf r205 auf dieser Vergleichsbasis bestand erneut 756/756 native Einzeltests, Build und alle Abhängigkeitsprüfungen. Die gebaute EXE bestand Fusion, Solid, Kontextmenü, Workbench und Sketch-Upgrade. Danach scheiterte der KI-Prüfer, weil sein direkter Klick auf `ai-chat-new` den aktuellen Optionsdialog nicht öffnet. Eine lokal vorbereitete, nicht eingecheckte Testanpassung bedient diesen Dialog mit echten Mausklicks und erreicht anschließend den folgenden Paketfehler.

Von 33 eindeutigen, in den eingefrorenen Benchmark-Suiten aufgeführten Abhängigkeiten fehlen acht im ASAR: `src/cad-service.js`, `src/cad-drill-stock-native.js`, `src/cad-bore-check-native.js`, `src/cad-practice-model-ui.js`, `src/cad-practice-controls.js`, `src/cad-agent-ui-policy.js`, `src/cad-ai-analysis.js`, `src/cad-ai-result-checks.js`. Die übrigen 25 sind vorhanden und ihre SHA256 stimmen. Die fehlenden Dateien sind weiterhin aktive, unveränderte Quelldateien; sie wurden in P2-2 nicht gelöscht. `verifySuite()` kann sie im Paket nicht lesen und bricht mit ENOENT ab. Die Paketkopierregel und diese Laufzeitprüfung waren schon vor der Archivierung unverändert vorhanden.

Konkreter Vorschlag: Die in den beiden vorhandenen Suite-Manifesten geforderten Quelldateien bei der Paketvorbereitung bytegleich übernehmen und ihre erwarteten SHA256 prüfen. Keine Benchmarkaufgabe, kein Sollwert und keine geschützte Eingabedatei müsste geändert werden. Diese zusätzliche Paketkorrektur ist noch nicht umgesetzt. Gemäß Arbeitsregel 3 wurde die Entscheidung zur Auftragserweiterung angefragt und in PR #36 festgehalten.

Separate Diagnoseaufrufe an derselben r205-EXE ergaben zusätzlich: Speech-Prüfung scheitert mit Renderer-Ausführungsfehler; Maintenance-Prüfung bestätigt die erwartete initiale Autosave-Fehlerinjektion nicht. Diese beiden Ursachen sind noch nicht abschließend untersucht. Es wurden keine Live-KI-Anfragen ausgeführt. Die fehlgeschlagenen Läufe bleiben erhalten; r203/r205 sind keine vollständigen Paketabnahmen. Der vollständige Nachherlauf ist noch offen, P2-3 daher **nicht vollständig abgenommen**. Kein Beginn von Phase 3.

Unabhängig davon ist der Quellstand `959cb3cbdaf346ed281f7fa3b0986d202c3ba36d` vollständig CI-geprüft: [43741082021](https://github.com/andyy909/Formnaro-cad/actions/runs/43741082021), Windows 514/514 in 22 min 59 s, Linux jeweils 257/257 in 10 min 45 s beziehungsweise 6 min 35 s und beide Minis erfolgreich. Die späteren Ergänzungen dieses Abschnitts sind ausschließlich Dokumentation.
