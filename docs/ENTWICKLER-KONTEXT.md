# Formnaro · Entwicklerkontext

Dieser Überblick beschreibt den technischen Aufbau des Hauptprogramms.
[PROJEKTKONTEXT.md](PROJEKTKONTEXT.md) enthält die Entwicklungshistorie
und die Abnahmen einzelner Stände. [AGENTS.md](../AGENTS.md) beschreibt
die Projektregeln und den direkten Modellierauftrag.

## Architektur

- `index.html` lädt `src/cad-main.js` als Renderer-Einstieg. Er verbindet
  Oberfläche, Controller, Arbeitsbereich und CAD-Worker. `src/app/` enthält
  Einstieg, UI-Helfer, Ausrichten, Zwischenablage, Isolation, Arbeitsbereich,
  Import, Export und Wiederherstellung.
- `src/cad-controller.js` koordiniert Store, Modelltransaktionen und Worker.
  `src/cad-transactions.js` verwaltet Modellzustand, Revision, Historie und
  Vorschauen. Die Vorschau-Registry hält die an Vorschau-IDs gebundenen Belege.
  KI-Task-Helfer kapseln Analyse, Bewegung und gespeicherte Entwürfe.
- `electron.cjs` startet Fenster und verbindet Backend-Dienste, Prüfungen und
  Prozesse. `preload.cjs` stellt die begrenzte IPC-Brücke bereit. Die Fenster
  verwenden Context Isolation und Sandbox. Navigation und neue Fenster
  unterliegen den bestehenden Schutzregeln.
- `backend/practice-verification.cjs` wählt die Prüfvariante, bereitet das
  Elternmodell vor und delegiert an die passenden Module. Die Datei-, Zeichen-
  und Skizzenprüfer liegen in `backend/practice-files-verification.cjs`,
  `backend/practice-drawing-verification.cjs` und
  `backend/practice-sketch-verification.cjs`. Der gemeinsame native
  Öffnungsprüfer liegt in `backend/practice-native-verification-checks.cjs`.
- `cad-kernel-build/runtime/` enthält den versionierten CAD-WASM-Kern.
  `python-runtime/` enthält die Web-Python-Laufzeit und Pakete. Die integrierte
  FreeCAD-Laufzeit und der native STL-Konverter werden separat vorbereitet.
  `mini/` und `mini-cad/` sind eigenständige Teilprojekte.

Der Tablet-Transfer liefert PC-Flächenskizzen über die gekoppelte
Live-Verbindung. Der Schalter im 3D-Feld erzeugt direkt einen QR-Code
mit Live-Freigabe und startet bei einem empfangsbereiten Tablet die
Flächenauswahl. Windows verwendet den nativen CAD-Flächentreffer und die
exakte planare Konturübernahme, ausgerichtet an der Ansicht beim Klick.
Android bestätigt den Empfang nach lokalem Speichern und öffnet den
bearbeitbaren Entwurf. Der Rückweg bindet den Schnitt an den ursprünglichen
Körper und seine CAD-Fläche. Neue geschlossene Innenkonturen werden in
einem Rückgängig-Schritt durchschnitten oder bis zur angegebenen Tiefe
ausgeschnitten. Die Vorschau und Prüfung laufen intern vor der Übernahme.
Vorhandene Außenränder und Öffnungen begrenzen den Schnittbereich.

## Kompatibilität und lokale Daten

Der Produktname ist Formnaro. Bestehende Kennungen wie OfflineCAD und
`offlinecad_*`, Dateiformate und Profilpfade bleiben aus Kompatibilitätsgründen
erhalten. Das reguläre Windows-Profil liegt in `%APPDATA%/offlinecad`.
Prüf- und Übungsläufe verwenden eigene Profile.

Portable Daten liegen unter `Daten/`, Projekte unter `Projekte/` und
Layouts unter `Layouts/`. Bei der gepackten Anwendung liegen sie neben der
EXE und im Quellbetrieb am Repository-Stamm. `work/` enthält lokale Historie
und Belege außerhalb von Git. Bestehende Nutzerdateien und Arbeitsdaten
bei Prüfungen schützen.

Die lokale KI-Schnittstelle verwendet die in Formnaro angezeigte
`ai-bridge.json`. Die Verbindung und der Python-Fallback stehen in
[AGENTS.md](../AGENTS.md). Verbindungsdatei und Token bleiben vertraulich.

Beim ersten Start des portablen Windows-Pakets speichert Formnaro die Entscheidung
zur KI-Einrichtung im lokalen PC-Profil. Das vorhandene Einstellungsfenster
„KI / API“ kann die Einrichtung erneut öffnen. Die ChatGPT-Auswahl nutzt die
bestehende Browseranmeldung.

Die lokale Text-KI lädt Modell und CPU-Laufzeit erst auf Anforderung nach
`Daten/KI-Modelle`. Der Electron-Hauptprozess prüft beide Downloads und startet
`llama-server` mit einem Sitzungsschlüssel auf der Loopback-Adresse. Der
Dateidialog kann zusätzlich einzelne GGUF-Textmodelle importieren. Formnaro
kopiert sie unter `Daten/KI-Modelle/Eigene Modelle` und aktiviert sie nach einem
erfolgreichen Start. Die Modellliste des lokalen Anbieters zeigt die vorhandenen
Modelle. Die Kataloglinks öffnen Hugging Face und ModelScope im Standardbrowser.
Der vorhandene Chat-Anbieterpfad verwendet den Prozess bis zum Programmende.
Für das kleine Modell enthält die Anfrage einen kurzen Projektzustand mit
Auswahl und Grundkörperbefehlen. Änderungsvorschläge nutzen dieselbe native
Vorschau und Maßprüfung wie die anderen Chat-Zugänge.

## Private Laborupdates auf Windows

Aus dem sauberen Kandidatenstand: `node scripts/build-lab-test-patch.mjs <Programmordner> <Ausgabe.zip> <Basiscommit> [vorherige.zip.basis.json]`. Als letzte Angabe das eigene Buildprotokoll verwenden, wenn ein Laborpatch die installierte Basis bildet. Der Builder prüft EXE und Anwendungsarchiv, baut die Weboberfläche und verpackt neue Archivbereiche. Für den Tester die drei gleichnamigen Dateien ZIP, ZIP.ps1 und ZIP.cmd zusammen ablegen. Formnaro schließen, die CMD starten und den privaten Programmordner auswählen oder als Argument übergeben. Für den Rückweg unterstützt dieselbe PS1 `-Mode Rollback` mit Programmordner, ZIP und dem im Starter hinterlegten ZIP-Hash. Aufgaben und ihre Prüfer können damit gemeinsam versioniert werden. Geänderte native Komponenten oder Abhängigkeiten benötigen eine passende Programmbasis.

## Schutz und Laufzeiten

- Bei Modelländerungen bestehende Quellen, Parameter, Sperren und
  unbeteiligte Teile erhalten. Für Desktopprüfungen einen eigenen Arbeitsordner
  und ein isoliertes Profil verwenden.
- `ai/benchmark-core-v1.json` und `ai/benchmark-advanced-v2.json` binden ihre
  Abhängigkeiten per SHA-256. Änderungen an diesen Pfaden mit den betroffenen
  Benchmarks abgleichen. `scripts/portable-runtime-policy.mjs` überprüft die
  Bindungen beim Kopieren der Anwendung.
- Die Build- und Prüfpfade verwenden Herkunfts- und Integritätsdaten für
  Kernel, Python-Pakete, Konverter und Beispieldaten. Geänderte Laufzeiten
  zusammen mit ihren Nachweisen bewerten.
- Unter Windows verwendet der Quellstart den Konverter aus
  `converter/runtime-v010-security`. Die Paketvorbereitung liest
  `runtimeDirectory` aus `converter/provenance.json`. Vor einem Paketlauf
  die vorhandenen Laufzeiten anhand von [BUILD.md](BUILD.md) prüfen.

## Entwicklung und Prüfungen

Die Node-Version steht in `.node-version`. Nach `npm ci` baut
`npm run build` die Oberfläche. `npm test` führt die Standardauswahl aus
`package.json` aus. Für einzelne Änderungen die betroffenen Tests und
bei Bedarf die zugehörigen Desktopprüfungen wählen.

`npm run test:inventory` schreibt `tests/manifest.json`. Der lesende Befehl
`npm run test:all -- --verify-coverage` vergleicht den Dateibestand mit dem
Manifest und prüft die vollständige Gruppenzuordnung für Windows und Linux.
`npm run test:all` führt die passenden Node-Tests aus. Mit
`npm run test:all -- --include-failing` lassen sich dokumentierte
Fehler und Zeitüberschreitungen gezielt diagnostizieren.

Die [CI](../.github/workflows/build.yml) läuft bei Pull Requests zu allen
Zielbranches sowie bei Pushes auf `main` oder Tags. Windows und Linux
verwenden je zwei nach Laufzeiten verteilte Testgruppen. Jede Gruppe prüft
die tatsächlich erfolgreich ausgeführten Dateien. Der erste Windows-Job
prüft zusätzlich Links, Formatliste, Lint, Kernel-Runtime, Build und
Standardtests. Die Mini-Teilprojekte haben eigene bestehende Jobs.
[Wartbarkeit Phase 3](WARTBARKEIT-PHASE3.md) dokumentiert die CI-Befehle
und die sechs Formatausnahmen.

## Paket und Veröffentlichung

[BUILD.md](BUILD.md) ist der Einstieg für Laufzeitvorbereitung und
Paketabnahme. `npm run test:cad-release` prüft Quelle und Start im Umfang
des Release-Prüfprogramms. `npm run package -- r1` baut ein Paket und
führt die vorgesehenen Paketprüfungen aus. Die Skripte verwenden die
Versionsnummer aus `package.json` und schreiben Nachweise unter
`work/current-release/`.

Für eine weitere Testausgabe derselben Version die nächste freie
Paketrevision verwenden. Bei der EXE-Abnahme im isolierten Profil die
Paketidentität festhalten, das Fenster regulär schließen und das
Prozessende prüfen. Die Veröffentlichung ist ein eigener Auftrag.
