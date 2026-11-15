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

Gezielte gemischte Suite 80/80, Standardtests 100/100, Build und neuer Desktop-Smoke bestanden. Vorher-/Nachher-Vollsuiten und endgültiger integrierter Nachweis werden in den PRs und der Abschlussübergabe ergänzt. Keine Installation ersetzt, keine Cloud-KI-Versuche, kein Merge und keine Veröffentlichung.

## P2-3 – Historische Paketskripte

141 Kandidaten aus `scripts/package-*.mjs` und `scripts/archive-*` wurden einzeln inventarisiert. **135 Dateien** werden bytegleich nach `scripts/legacy/` verschoben, **48** zugehörige package:-Einträge entfernt. Alle nach P2-2 verbleibenden test:-Einträge sind unverändert. `docs/LEGACY-SKRIPTE.json` enthält Herkunft, Ziel und SHA256 jeder Datei sowie die entfernten Befehlsnamen. Alle SHA256 stimmen sowohl gegen die ursprünglichen Arbeitsdateien als auch gegen die Git-Blobs des Basiscommits.

Sechs Dateien bleiben bewusst am bisherigen Pfad:

- package-freecad-python.mjs ist der reale Packager hinter current-release.mjs.
- package-advanced-modeling.mjs, package-ai-tasks.mjs, package-freecad-document.mjs und package-surfaces.mjs gehören zu dessen bedingten Quellen-/Prüfketten. Ein bloßer direkter Importvergleich würde sie fälschlich als unbenutzt ausweisen.
- package-cad-release.mjs ist ein weiterhin geprüfter Kompatibilitätseinstieg zu current-release.mjs. Auch unveränderliche Lizenzhinweise verweisen darauf. Ihn zu verschieben würde aktive Verträge beschädigen; diese begründete Ausnahme zur wörtlichen Nur-Import-Regel bleibt erhalten.

Das historische Eingabemanifest security-release-inputs.json erhält den neuen Pfad zum archivierten security-Paketskript; kein verschobener Skriptinhalt wird geändert. Das Testmanifest wird auf die neuen referenzierenden Pfade regeneriert. `git grep` über alle 135 alten Pfade liefert außerhalb scripts/legacy/ und docs/ keinen Treffer. Der neue Archivre­gressionstest prüft SHA256, fehlende Altpfade, erhaltene Ausnahmen und existierende Einstiegdateien aller verbliebenen test:-Befehle; er ist ausdrücklich als pass im Manifest eingetragen. Zweifache Manifestregeneration ist bytegleich. Aktuelle Auswahl: **514 = 515 + drei neue Dateien − vier obsolete**.

Widerspruch zur wörtlichen Anforderung: Bytegleiches Verschieben erhält in historischen Dateien deren alte relative Imports und arbeitsverzeichnisabhängige Pfade. Daher werden diese Dateien als historisches Quellenarchiv behandelt, nicht als unmittelbar ausführbare Releasebefehle. Eine Wiederbelebung müsste ihre alten Umgebungen/Pfade gezielt rekonstruieren. Aktive Release-/Testbefehle bleiben außerhalb dieses Archivs; sie werden durch reale Windows-Paketläufe vor/nach der Änderung geprüft. Der vollständig neue Paketlauf wird nicht durch einen bloßen Build oder eine existierende ältere EXE ersetzt.

### Prüfumgebung

Die ersten lokalen Sammelläufe verwendeten versehentlich das systemweite Node22.16.0 statt der in .node-version festgelegten22.23.4. Drei unveränderte Diagnosetestdateien scheiterten an der alten Loader-Hook-Implementierung; alle zwölf betreffenden Fälle bestanden unter22.23.4. Zusätzlich führte konkurrierende lokale Last zu einem Fonttest-Timeout. Diese abgebrochenen Vorläufe gelten nicht als Abnahme. Weitere Vollprüfungen nutzen die gepinnte Laufzeit; lokale Vollsuiten laufen nicht gleichzeitig. Die vollständigen CI-Läufe verwenden ebenfalls .node-version. Paket-Vorhervergleich nutzt den unveränderten P2-2b-Commit in einem eigenen Arbeitsbaum, Nachhervergleich den archivierten Endstand; beide auf Windows x64 mit22.23.4 und eigenen Ausgabeordnern. Es wird keine Nutzerinstallation gestartet oder ersetzt.
