# Aktuelle Windows-Ausgabe bauen

Die Standardbefehle verwenden die Version aus package.json:

Die folgenden Befehle dienen der großen Release-/Abschlussabnahme. Sie werden
gemäß [Prüfstrategie im Ausbauplan](AUSBAUPLAN-AB-0.106.md) nicht automatisch
nach jedem Einzelpunkt ausgeführt. Während der Umsetzung stattdessen die
zum jeweiligen Punkt passenden Tests und Bedienprüfungen auswählen.

```
npm ci
npm run package -- r1
```

Soll zunächst nur die große Quell-/Startabnahme erfolgen, ist
`npm run test:cad-release` die Alternative. Sie muss nicht routinemäßig direkt
vor einem Paketlauf wiederholt werden, der seine erforderlichen Prüfungen
bereits selbst ausführt. Für einzelne Arbeitspunkte die betroffenen Testdateien
und passenden Verifikationsflags aus scripts/all-functions-catalog.mjs auswählen.

Jeder Lauf friert eigene Quellen ein und erzeugt eigene Prüfprotokolle unter
work/current-release. Ein vorhandener Ausgabeordner wird nicht überschrieben;
für einen weiteren Paketlauf r2, r3 usw. angeben. Die Ausgabe liegt unter
output/Formnaro-v<VERSION>-r<N>. Frühere Releases sind keine
Buildvoraussetzung. Wenn die letzte lokale Freigabe vorhanden ist, werden deren
geschützte Programmdateien zusätzlich vor und nach dem Bau auf Änderungen geprüft.

Der Quelltest führt die aktuelle explizite Release-Testauswahl einschließlich
der Speicher-, Layout-, Katalog-, Schrift- und Startregressionen aus und baut
die Oberfläche. Anschließend wird der Startfehler samt System-Theme im echten
Electron-Fenster mit isolierten Daten geprüft. Der Paketbefehl führt diese
Prüfungen erneut gegen eingefrorene Quellen und die vorhandenen 23 fachlichen
EXE-Suiten sowie die neue Startprüfung gegen die tatsächliche neue EXE aus.
Ein Paketlauf ist erst bei erfolgreicher Abnahme abgeschlossen.

Für den begrenzten letzten Nachlauf der Wartung 0.113.1 wurde eine geprüfte
Basis wiederverwendet: scripts/release-test-scope.mjs vergleicht die eingefrorenen
Dateien, akzeptiert ausschließlich die ausdrücklich geprüfte Änderungsliste und
protokolliert 687 Basistests sowie 82 neue gezielte Tests getrennt. Unbekannte
Abweichungen blockieren diese Wiederverwendung. Alle 24 EXE-Läufe wurden am
endgültigen Paket neu ausgeführt. Das ist keine allgemeine Skip-Option.

Die umfassendere, dynamisch ermittelte Auswahl aller Node-Testdateien ist separat:

```
node scripts/test-all-functions.mjs --mode source --suite unit --output work/all-tests
```

## Laufzeiten und Werkzeuge

Benötigt werden Windows x64, Node entsprechend package.json, der versionierte
WASM-Kern unter cad-kernel-build/runtime und die folgenden lokalen Laufzeiten:

- converter/runtime-v010-security: nativer STL-Konverter einschließlich Lizenzen.
  Der Build ist in converter/README.md beschrieben; Abhängigkeiten sind in
  converter/uv.lock festgeschrieben. Dieser Ordner ist ein Buildartefakt und wird
  bewusst nicht durch Git bereitgestellt.
- speech-runtime: Die gepinnten Dateien werden mit
  node scripts/setup-speech-runtime.mjs vorbereitet und per SHA256 geprüft.
- Die integrierte CAD-Laufzeit mit `npm run setup:cad-runtime` vorbereiten.
  Dies lädt beim Bau das fest gepinnte offizielle FreeCAD-1.1.4-Paket und
  dessen Quellarchiv. Native Tests verwenden diese Laufzeit. Allgemeine
  Paketläufe liefern sie ebenfalls mit; keine externe Installation als
  unbemerkter Ersatz. Die saubere Windows-Abnahme von Paket 6a bleibt bis
  zum protokollierten Abschluss offen. Details: INTEGRIERTE-CAD-LAUFZEIT.md.
- Eine lokale deutsche Windows-Systemstimme für die synthetische Sprachprüfung.
  Die Testaufnahme wird pro Lauf erzeugt; keine Datei aus einem alten work-Ordner
  und keine Mikrofonaufnahme des Nutzers sind erforderlich.

Ein frischer Klon benötigt damit explizite Laufzeitvorbereitung, aber keine
historischen Prüfberichte oder Ausgaben von einem anderen Rechner.

Ältere versionsgebundene Paketskripte bleiben für die Nachvollziehbarkeit
historischer Ausgaben erhalten. Sie sind keine aktuellen Standard-Einstiege.
Die früheren allgemeinen Einstiege `scripts/run-cad-release-gates.mjs` und
`scripts/package-cad-release.mjs` leiten dagegen auf `current-release.mjs`
weiter, auch bei direktem Aufruf. Sie verwenden damit die Version aus
`package.json` und erzeugen aktuelle Prüfbelege selbst; historische
`work/cad-v011`-Berichte, Quellarchive oder generierte Bindings sind keine
Eingaben mehr. `work/` bleibt lediglich ein lokal erzeugter Arbeits-/Belegordner.
Die oben beschriebene Laufzeitvorbereitung bleibt erforderlich; ein bytegleiches
Nachbauen des veröffentlichten ZIPs wird dadurch nicht zugesichert.


## Gezielte Paket-8-Ausgabe 0.115.0

`npm run test:curved-remesh` prüft die neuen Netzwerkzeuge und ihre direkten
Controller-/Quellen-/Schutzgrenzen. `npm run package:curved-remesh -- r1` friert
eigene Quellen ein, prüft zusätzlich die betroffenen Speicher-/Katalogwege,
baut eine separate Windows-Ausgabe und führt die drei gezielten Netz-/Pinsel-
Desktopläufe aus. Die CAD-/Sprach-/Konverterlaufzeiten stammen aus der lokal
vorhandenen abgenommenen 0.114.0-r7-Ausgabe; die CAD-Kopie wird vollständig
SHA-geprüft. Die erste Paketierung erfordert genau diese Basisausgabe.
Danach müssen Paketbilder und physische Exporte unabhängig geprüft und die
Freigabe dokumentiert werden. Dies ersetzt nicht die allgemeine Abschlussabnahme.


## Gezielte Paket-9-Ausgabe 0.116.0

`npm run package:mesh-surgery -- r2` friert Quellen ein, führt die 112 gezielten
Tests und vier echten Windows-Läufe aus. Vorausgesetzt ist die unveränderte
abgenommene 0.115.0-r1-Ausgabe unter output/Gekruemmte-Netze-v0.115.0-r1;
deren integrierte CAD-/Sprach-/Konverterlaufzeiten werden weiterverwendet.
CAD-Laufzeit wird vollständig SHA-geprüft. Sichtprüfung, unabhängige
Exportprüfung und dokumentierte Freigabe schließen die Abnahme ab.
Die allgemeine gemeinsame Prüfung erfolgt nach Paket 10.


## Gemeinsame Ausbauprüfung 0.117.0

`node scripts/package-final-expansion.mjs rN` friert alle verfolgten Quellen und vorbereiteten lokalen Laufzeiteingaben ein, prüft sämtliche aktuellen Node-Testdateien frisch und baut eine Windows-EXE. Danach folgen der allgemeine Windows-Katalog und gezielte Erweiterungspfade. Grundlage ist die unveränderte akzeptierte 0.116.0-r2-Laufzeit. Visuelle Prüfung, unabhängige physische Exportleser, Archiv-Rücklesung und dokumentierte Freigabe ergänzen den automatischen Lauf. Persönliche Profile und Modelle gehören nicht zur Paketbasis.

Für die finale Generation wurde der vollständige R5-Unit-Lauf bei SHA-belegter Gleichheit aller Funktionsdateien, Testdateien, Build-Ausgaben und Laufzeiteingaben referenziert. Die einzigen Änderungen sind drei ausdrücklich eingebettete Windows-Verifier-Korrekturen: Vorschau-Bereitschaft, aktuelle Netz-Importoption und nummerierte STL-Datei einschließlich bytegenauer Belegkopie. Alle Original-Receipts, TAP-Zahlen und Log-Prüfsummen wurden kontrolliert; keine fehlgeschlagenen oder fremden Unit-Ergebnisse übernommen. Alle Windows-Suiten laufen an der neuen finalen Paketidentität frisch. Ihre gewöhnliche lokale CAD-Laufzeitkopie wird vollständig geprüft; der Regressionstest kopiert daraus erneut in einen frischen physischen Ordner und verlinkt diesen für einen echten AppContainer-Auftrag. Beide Konverteraliase verwenden dieselbe akzeptierte Laufzeit. Das Python-SDK und der Verbindungsadapter liegen zusätzlich physisch neben der EXE, weil externes CPython nicht aus Electron-ASAR importieren kann.


Die gemeinsame R7-Abnahme enthält zusätzlich fünf Spezialläufe mit vier extern korrigierten Prüfmodulen. Veraltete Zugriffe auf verborgene Headerknöpfe werden durch echte Mausklicks auf Solid-/Fusion-Extras-Menüeinträge ersetzt; die Laufzeitprüfung vergleicht kanonische physische Pfade über Windows-Verzeichnislinks hinweg. Die Prüfer werden vor dem isolierten Teststart einzeln und SHA-gebunden geladen; alle fachlichen Assertions und die Programmdateien bleiben unverändert. Exakte reversible Patches, Originalfehler und erfolgreiche neue Berichte sind lokal in externalsuiteprovenance-v2.json gebunden.

Die vier exakten Prüferkorrekturen sind ohne persönliche Pfade in `ABNAHME-PRUEFER-0.117.json` versioniert. Für neue Paketbauten diese reinen Prüferkorrekturen vor dem nächsten Einfrieren in die Prüfquellen übernehmen. Die geprüfte R7-Anwendung bleibt unverändert.


## MIT-Nachtrag 0.117.0-r8

R8 ist ein belegter Lizenz-/Metadaten-Nachtrag zur vollständig geprüften R7-Modellbasis. Der eigene Code trägt SPDX MIT; originale Fremdtexte und native Laufzeitbytes bleiben erhalten. Ausschließlich die eigene FreeCAD-Quellnotiz und ihre Manifestzeile wurden neutralisiert und neu gepinnt. Die vier dokumentierten Verifierkorrekturen sind in den Prüfquellen enthalten. Neubuild, sieben echte DE/EN-Lizenz-UI-Prüfungen an der R8-ASAR sowie 95 gepackte EXE-Gruppen sichern den Nachtrag. Referenzumfang und Nachweisgrenzen: MIT-FREIGABE-0.117.md.


## Gezielte Ausgabe 0.118.0

Die getrennte lokale Ausgabe für große Netze, Zahnradkopplungen und
KI-Modellstrenge wird mit folgendem gezielten Paketlauf gebaut:

```
node scripts/package-mechanism-tools.mjs r1 "<Ordner einer abgenommenen vollständigen Formnaro-Ausgabe>"
```

Der Lauf baut frisch, prüft 23 betroffene Testdateien, friert die Quellen ein,
bündelt eine eigene Windows-EXE und übernimmt die vollständig geprüften
CAD-/Konverter-/Sprachlaufzeiten aus der angegebenen Ausgabe. Drei isolierte
EXE-Läufe prüfen die neuen Werkzeuge und die bisherigen Gelenk-/
Vereinfachungsfunktionen. Neue Ausgabeverzeichnisse werden nicht überschrieben.
Nach erfolgreichem Lauf sind die Paketbilder tatsächlich anzusehen; erst dann
wird die lokale Freigabe bestätigt. Das ist keine vollständige allgemeine
Gesamtabnahme und veröffentlicht nichts online.


Für den gezielten STL-Farbfix 0.118.1 unterstützt derselbe Paketbauer eine getrennte Ausgabe STL-Farben-v0.118.1-rN. Er prüft neun betroffene Testdateien, die echte Netz-Anzeige samt Inspektorfarbe und einen Smoke-Test der Zahnrad-/KI-Einstellungen. Quellen, Laufzeitintegrität und vorherige Ausgabe werden wie oben gebunden; die Paketbilder müssen vor der Freigabe angesehen werden.


Für 0.118.2 erzeugt derselbe Paketbauer Grosse-Projekte-v0.118.2-rN und prüft 20 betroffene Testdateien. Die isolierte Großprojektprüfung benötigt FORMNARO_VERIFY_LARGE_MESH_FILE als Pfad zur unveränderten lokalen GLB-Testdatei; sie wird weder in die Ausgabe noch in den gemeinsamen Projektkontext übernommen. Zwei große Netzinstanzen überschreiten absichtlich 50 MiB. Detailtreue 10/90, Vorschau, Übernehmen/Undo, physische FNPACK-Ausgabe/Wiederöffnen und Paket-Autosicherung werden tatsächlich geprüft. Netzfarben und Zahnrad-/KI-Regler erhalten gesonderte Prüfläufe.
# Wartung 0.118.3

Gezielter Paketbau mit `node scripts/package-mechanism-tools.mjs r1 <akzeptierter-Programmordner>`.
Der Builder erkennt Version 0.118.3, erstellt eine frische Stage und übernimmt nur
die geprüften Unterlaufzeiten, keine Daten-/Projektordner. Tests und isolierte
Windows-Läufe decken Auditkorrekturen, FNPACK, Sprache, Navigation, große Projekte
und bestehende Farben/Gelenkbedienung ab. Visuelle Freigabe folgt getrennt nach
Prüfung tatsächlicher Paketbilder; der Builder erklärt das Paket nicht automatisch
für freigegeben. Ausgabeberichte enthalten keine absoluten persönlichen Pfade.
Für den vorhandenen Großnetz-Regressionsfall wird `FORMNARO_VERIFY_LARGE_MESH_FILE`
nur lokal gesetzt; keine Fixture oder persönlichen Pfade in Auslieferungen kopieren.

# Gezielte Menü-Hilfe 0.119.1

Die Folgeausgabe baut die vorhandene 0.119.0-Basis mit engeren Kontext- und
Bedienhilfebudgets neu. Die Abnahme ist eine Delta-Prüfung der geänderten
KI-/Bedienhilfewege mit isolierten EXE-Läufen, eigenem Quellenmanifest und
Sichtprüfung tatsächlicher Paketbilder. Frühere Modell-, Sprach- und
Laufzeitnachweise bleiben als historische Basis erhalten. Live-DeepSeek-Tests
verwenden ausschließlich künstliche Projekte und getrennte Testprofile;
Zugangsdaten und Testprofile gehören nicht in Stage oder Auslieferung.

# Bedienziele und Vorschau 0.119.2

Die lokale Ausgabe prüft gezielt die Vorführungsänderung gegenüber 0.119.1.
Grundformziele sind nur Zeigeziele, anschließend wird eine geprüfte Vorschau
berechnet. Isolierte UI-Prüfungen erfassen Zielanzeige vor der Berechnung,
Modell-/Undo-Erhalt, Abbruch und Wiedergabe; die komplette frühere Abnahme wird
nicht als neuer vollständiger Regressionstest ausgegeben.


## Formnaro-Programmsymbol

Das blau-limettengrüne F liegt als transparente PNG-Datei in
`public/formnaro-icon.png` und als Windows-ICO mit 16/24/32/48/64/128/256 Pixeln
in `public/formnaro-icon.ico`. Vite übernimmt beide Dateien nach `dist`.
Kopfzeile, Favicon und Electron-Fenster verwenden dieselbe PNG-Datei.
Der aktuelle Windows-Paketweg friert `public` mit ein und übergibt die ICO-Datei
aus dem Stage-Verzeichnis an Electron Packager, damit neue EXE-Dateien das
Programmsymbol enthalten. Das Quellmanifest erfasst auch die Originalassets.

Bestehende freigegebene EXE-/ASAR-Dateien werden dafür nicht nachträglich
verändert. Lokale Windows-Verknüpfungen können separat eine dauerhafte
ICO-Datei verwenden; ihre Startziele und Argumente bleiben dabei erhalten.


## Portable-Ausgabe ab 0.121.0

Die Standardausgabe enthält die Whisper-Engine, aber kein Sprachmodell.
`node scripts/setup-speech-runtime.mjs` bereitet nur die Engine vor;
`--with-model` lädt zusätzlich das Modell für lokale Entwicklung herunter.
Im Programm ist der Download eine ausdrückliche Aktion in der Spracheingabe.
Die Datei wird gestreamt, auf feste Größe und SHA256 geprüft und erst danach
im portablen Datenordner `Sprachmodelle` aktiviert. Abbruch und Fehler entfernen
die partielle Datei. CAD, Python und Konverter benötigen diesen Download nicht.

`scripts/portable-runtime-policy.mjs` definiert die enge Streichliste für
Debugsymbole, Linker-/CMake-/Qt-Buildmetadaten und benannte Qt-Entwicklungsprogramme.
Die benannten optionalen BIM-/FEM-/CAM-/Idf-/OpenSCAD-/Robot-/ReverseEngineering-/Inspection-/AddonManager-/Test-/Tux-Workbenches sowie deren ausdrücklich gelistete native Module werden ausgelassen. Kern-DLLs, Python-Abhängigkeiten, Qt-Plugins und Lizenztexte bleiben erhalten. Upstream-Testverzeichnisse und FreeCAD-Beispieldaten werden nicht benötigt.
Die CAD-Dateiliste und ihr ASAR-Pin werden nach der Auswahl neu erstellt.
Das Quellenarchiv `Formnaro-FreeCAD-Quellen-1.1.4.zip` wird separat erzeugt und muss
bei einer Veröffentlichung neben dem Windows-Paket angeboten werden.
Die App erhält das Benutzerhandbuch; Bridgeclient, Build-, Release- und
Diagnoseskripte bleiben im Quellrepository. Auch Backend-Verifikationen und
Testfixtures gehören nicht in das ASAR. `scripts/verify-portable.mjs` lädt sie
nur während der expliziten Entwicklerabnahme über einen kurzlebigen lokalen
Inspector in die echte gepackte EXE. Produktionsmodule werden dabei immer aus
deren unverändertem ASAR aufgelöst. Dieses Prüfwerkzeug wird nicht ausgeliefert.

Vor der Laufzeitauswahl prüft `scripts/audit-freecad-imports.py` die tatsächlichen AST-Imports der Worker gegen die ausgelassenen Workbenches und protokolliert dynamische Importstellen. Die Prüfung verwendet den eingebetteten Python-Interpreter als Buildwerkzeug. Statische Imports allein beweisen keine vollständige Abhängigkeitshülle; native GUI-/Python-/Dokumenttests bleiben erforderlich.

Nach erfolgreicher Paketprüfung erzeugt `scripts/package-portable-zip.py` eine
neue Windows-ZIP mit drei relativen Start-/Ordnerlinks und leeren portablen
Daten-/Projektordnern. Das Skript blockiert Entwicklerordner, persönliche
Konfigurationsdateien und mitgelieferte Sprachmodelle und liest jeden ZIP-Eintrag
zur SHA256-Prüfung zurück. Lizenzverzeichnisse behalten ihre Upstream-Pfade.
Der Paketlauf verwendet dafür den eingebetteten Python-Interpreter; dieses
Buildskript und seine Linkvorlagen werden nicht in die Anwendung kopiert.

Die drei ausdrücklich gewählten Endnutzerbeispiele liegen versioniert unter `packaging/examples`: gekoppelte ATLAS-5-Fräse, großes 6:1-Schräggetriebe und Präzisionsschraubstock. Der ZIP-Schritt prüft ihre Manifest-SHAs und legt sie unter `Projekte/Beispiele` ab. Sie gehören nicht zu den entfernten Entwickler-Testdaten. Die Python-Buildwerkzeuge werden mit `-B`/`PYTHONDONTWRITEBYTECODE=1` gestartet, damit sie keine Bytecode-Caches in der fertig zusammengestellten Laufzeit erzeugen.


## Vertieftes Laufzeitprofil ab 0.122.0

`scripts/portable-freecad-profile.json` enthält die geprüften Paketgrenzen und
SHA256-gepinnten zusätzlichen nativen Auslassungen für FreeCAD 1.1.4/Python 3.11.
Ein anderer Hash verlangt ein neues Audit. Kern-EXEs, Kern-Pythonmodule, der
Software-OpenGL-Rückfall und benötigte VC-/ICU-/OCCT-Bibliotheken sind geschützt.
Die Python-OCC-Wrapper sind zusätzliche Bindings, nicht FreeCADs nativer Part-
Kernel. Sie werden mit unbenutzten IFC-/VTK-/SciPy-/pandas-/SymPy-/Matplotlib-
Paketen im nativen CAD-Prozess entfernt. Die separate wissenschaftliche
Pyodide-Analyse bleibt unverändert verfügbar.

`scripts/audit-native-dependencies.py` untersucht PE-Imports, verzögerte Imports
und weitergeleitete Exporte. Die expliziten dynamischen Wurzeln umfassen Qt-
Plugins, native Pythonmodule, OCCT-TK-Bibliotheken, VC/ICU und Software-OpenGL.
OpenBLAS bleibt erhalten, weil libblas/libcblas ihre Exporte dorthin weiterleiten.
Zusätzlich werden geladene Bibliothekspfade und reale native Funktionen geprüft.
Das Audit benötigt das Entwicklungswerkzeug `pefile`; es gehört nicht ins Paket.
Statische PE-Tabellen beweisen nicht jeden dynamischen Bibliotheksaufruf.
Die aktuelle Release-Pipeline führt die vier nativen Prüfungen automatisch aus.
Build-Abhängigkeit: `python -m pip install -r scripts/requirements-packaging.txt`.
Ein anderer Entwicklungsinterpreter kann mit `FORMNARO_NATIVE_AUDIT_PYTHON`
ausgewählt werden; der Endnutzer benötigt weder pip noch diesen Interpreter.

```
python -B scripts/audit-native-dependencies.py --runtime <FreeCAD-Laufzeit> --output work/freecad-dependencies.json
python -B scripts/audit-native-dependencies.py --kind converter --runtime <Konverter-Laufzeit> --output work/converter-dependencies.json
python -B scripts/audit-native-dependencies.py --kind speech --runtime <Sprach-Laufzeit> --output work/speech-dependencies.json
python -B scripts/audit-native-dependencies.py --kind electron --runtime <Electron-Laufzeit> --output work/electron-dependencies.json
```

Der Konverter nutzt seinen separat vorbereiteten minimalen Build und die
geprüfte Auswahl aus `converter/provenance.json`; Anleitung unter converter/README.md.
Konverter-Prüfdateien bleiben bei den externen Prüfhelfern. Electron enthält
nur `de`, `en-US`, `en-GB`; ein Start mit `--lang=fr-FR` prüft den Rückfall.
Die DLLs für Grafik-/Software-Rendering werden nicht als Compilerballast entfernt.
Java/JRE/JDK ist keine Formnaro-Laufzeitkomponente. `node_modules` bleibt komplett
außerhalb der portablen App; benötigter Frontendcode ist im Vite-Build gebündelt.

Die Spracheingabe erhält vier app-lokale Microsoft-Laufzeit-DLLs aus der
hashgeprüften CAD-Laufzeit (`msvcp140`, `vcruntime140`, `vcruntime140_1`, `vcomp140`).
Sie werden im ausgelieferten Sprachmanifest ergänzt; das ursprüngliche
Downloadmanifest der Whisper-Engine bleibt unverändert. Dadurch benötigt der
Sprachprozess keine separat installierte Visual-C++-Runtime. Die vorhandenen
Upstream-Lizenzhinweise bleiben mitgeliefert. Für vollständige Neubauten ist
die vollständige, gepinnte FreeCAD-Eingabe einschließlich Quellen erforderlich;
eine bereits gekürzte Portable-Ausgabe ersetzt diese Build-Eingabe nicht.
