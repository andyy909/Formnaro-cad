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
Ein Paketlauf ist erst bei erfolgreicher technischer Abnahme abgeschlossen.
Der anschließende Start des entpackten Pakets mit frischem Windows-Profil
und die Sichtprüfung werden separat belegt. Den veröffentlichten Prüfstand
verzeichnet [AKTUELLER-STAND.md](AKTUELLER-STAND.md).

Für den begrenzten letzten Nachlauf der Wartung 0.113.1 wurde eine geprüfte
Basis wiederverwendet: scripts/release-test-scope.mjs vergleicht die eingefrorenen
Dateien, akzeptiert ausschließlich die ausdrücklich geprüfte Änderungsliste und
protokolliert 687 Basistests sowie 82 neue gezielte Tests getrennt. Unbekannte
Abweichungen blockieren diese Wiederverwendung. Alle 24 EXE-Läufe wurden am
endgültigen Paket neu ausgeführt. Das ist keine allgemeine Skip-Option.

Die Quell-CI gleicht die Testdateien mit dem Manifest ab und führt die
zugeordneten Node-Tests aus:

```
npm run test:all -- --verify-coverage
npm run test:all
```

Der separate [Funktionskatalog](../scripts/test-all-functions.mjs) bietet
gezielte Läufe nach Funktion und für bereits gebaute Windows-Pakete.

## Laufzeiten und Werkzeuge

Benötigt werden Windows x64, die Node-Version aus [`.node-version`](../.node-version),
der versionierte WASM-Kern unter `cad-kernel-build/runtime` und die folgenden
lokalen Laufzeiten:

- Nativer STL-Konverter einschließlich Lizenzen. Der Paketbau verwendet den
  in [converter/provenance.json](../converter/provenance.json) angegebenen
  Laufzeitordner und prüft den Hash der Konverter-EXE. Der Build ist in
  [converter/README.md](../converter/README.md) beschrieben. Seine Abhängigkeiten
  sind in `converter/uv.lock` festgeschrieben. Der Laufzeitordner ist ein lokales
  Buildartefakt.
- Die integrierte CAD-Laufzeit mit `npm run setup:cad-runtime` vorbereiten.
  Dies lädt beim Bau das fest gepinnte offizielle FreeCAD-1.1.4-Paket und
  dessen Quellarchiv. Native Tests verwenden diese Laufzeit. Allgemeine
  Paketläufe liefern sie ebenfalls mit. Die gezielte Windows-Abnahme von
  Paket 6a ist in [INTEGRIERTE-CAD-LAUFZEIT.md](INTEGRIERTE-CAD-LAUFZEIT.md)
  dokumentiert.
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


## Frühere Paketstände

Die [Build-Historie](BUILD-HISTORY.de.md#gezielte-paket-8-ausgabe-01150) enthält die versionsgebundenen Paketbefehle und Abnahmen von 0.115 bis 0.119.

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

Die Standardausgabe enthält keine lokale Sprachlaufzeit und kein herunterladbares Sprachmodell.

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
Konfigurationsdateien und liest jeden ZIP-Eintrag
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
python -B scripts/audit-native-dependencies.py --kind electron --runtime <Electron-Laufzeit> --output work/electron-dependencies.json
```

Der Konverter nutzt seinen separat vorbereiteten minimalen Build und die
geprüfte Auswahl aus `converter/provenance.json`; Anleitung unter converter/README.md.
Konverter-Prüfdateien bleiben bei den externen Prüfhelfern. Electron enthält
nur `de`, `en-US`, `en-GB`; ein Start mit `--lang=fr-FR` prüft den Rückfall.
Die DLLs für Grafik-/Software-Rendering werden nicht als Compilerballast entfernt.
Java/JRE/JDK ist keine Formnaro-Laufzeitkomponente. `node_modules` bleibt komplett
außerhalb der portablen App; benötigter Frontendcode ist im Vite-Build gebündelt.

Für vollständige Neubauten ist
die vollständige, gepinnte FreeCAD-Eingabe einschließlich Quellen erforderlich;
eine bereits gekürzte Portable-Ausgabe ersetzt diese Build-Eingabe nicht.

### Windows-Diktat

`npm run setup:windows-dictation` kompiliert `backend/windows-dictation.cs` mit dem vorhandenen Windows-.NET-Framework-Compiler für x64 und erzeugt `backend/windows-dictation.exe` sowie den SHA-256-Pin. `npm run build` und der aktuelle Paketierungseinstieg bereiten den Helfer automatisch vor. Der normale Backend-Kopiervorgang nimmt die kleine EXE und den Pin in das ASAR auf; `child_process.execFile` nutzt Electrons temporäre Extraktion. Endnutzer benötigen keinen Compiler. Die C#-Quelle und Prüfhilfen gehören nicht ins portable Anwendungsarchiv.

Gezielt prüfen: `node --test tests/windows-dictation.test.cjs tests/speech.test.mjs`. Der native Prüffänger in `tests/fixtures/windows-dictation-capture.cs` kann Win+H abfangen, sodass für diesen Test keine Mikrofonaufnahme startet. Die Funktion verlangt eine aktivierte Windows-Spracheingabe, Mikrofon und Internet; Formnaro übernimmt deren Einrichtung und Spracherkennung nicht.

Quellen: [Windows-Spracheingabe](https://support.microsoft.com/en-us/accessibility/windows/use-voice-typing-to-talk-instead-of-type-on-your-pc), [SendInput](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput), [Electron-ASAR](https://www.electronjs.org/docs/latest/tutorial/asar-archives).
