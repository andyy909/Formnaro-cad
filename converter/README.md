# Lokaler STL-Konverter in Formnaro

Der eigenständige, geprüfte Konverter 0.10.0 läuft in einem getrennten nativen
Prozess. Die unveränderten Enginequellen stammen aus dem abgenommenen
Quellcodearchiv; SHA256-Pins und Herkunft stehen in provenance.json.
Die Integration ergänzt das Dateiprotokoll, die Formnaro-Oberfläche und
Artefaktübertragung. Der bestehende WASM-CAD-Kern liest die geprüfte STEP für
die Übernahme ins Projekt. Kein Cloudkonto und keine Pythoninstallation sind
beim Anwender erforderlich.

Funktionen → STL → STEP bietet eine eigene 3D-Vorschau mit Flächenfarben,
gemeinsamen Bereichsrändern und einer auswählbaren Flächenliste. Bereiche
lassen sich teilen, verbunden zusammenführen, als Typ vorgeben und schützen.
Dreiecke werden per vorderem Klick oder über ein Rechteck ihrer Mittelpunkte
markiert. Strg/Shift erlaubt Mehrfachauswahl. Rückgängig/Wiederholen und
gespeicherte JSON-Korrekturen sind von der CAD-Projekthistorie getrennt.
Korrekturen sind an Originaldreiecke, Einheit und Abweichungsbudget gebunden.
Einheits-/Budgetwechsel verlangt eine neue Analyse; Abbruch erhält die bereits
bestätigte Korrektur. Typen bleiben Vorschläge bis zur CAD-/STEP-Prüfung.

Die Ansichten Original, Ergebnis und Überlagerung zeigen getrennte Netze.
Die Abweichungsansicht misst die dargestellten Ergebnis-Dreiecksmittelpunkte
gegen die Originaloberfläche in Millimetern. Diese begrenzte Anzeige ersetzt
weder den beidseitigen Enginecheck noch einen mathematischen Maximalfehlerbeweis.
STEP, Prüfbericht, reparierte STL/3MF und Ergebnisnetz sind getrennt speicherbar.
3MF erhält getrennte Knotenverbindungen besser als STL. Die Konvertierung und
das Speichern verändern das Projekt nicht; Als CAD übernehmen importiert
das Resultat mit einem Rückgängig-Schritt. Direkter STL-CAD-Import nutzt dieselbe
Engine und den vorhandenen nativen Importvertrag.

Das Dateiprotokoll 2 verwendet ausschließlich fest benannte Dateien in einem
eigenen temporären Verzeichnis. Aktionen sind analyse und convert. Vor Ausgabe
der STEP gelten native Gültigkeit, Topologie, Originalabweichung und tatsächlicher
STEP-Rückimport. Geschützte Originaldreiecke werden auch in der geschriebenen
STEP auf Ebene, Kanten, Eckpunkte und Orientierung geprüft. Ungeeignete unberührte
Freiformvorschläge dürfen gemessene Ebenen/Facetten behalten; ausdrücklich
bearbeitete oder vorgegebene Bereiche werden nicht übergangen.

Formnaro prüft Engineversion, STEP-Hash und sämtliche übertragenen Begleitdateien.
Die Daten werden vor dem Aufräumen des temporären Verzeichnisses übernommen.
Ein Auftrag je Fenster, Laufzeitlimit zehn Minuten; Abbruch beendet den eigenen
Konverterprozess. Fremde Renderer können die IPC-Anbindung nicht verwenden.
STL bis 50 MiB, STEP bis 30 MiB, Flächeneditor bis 20.000 Originaldreiecke und
zusätzliche unveränderte Engine-/CAD-Ressourcengrenzen gelten.

Entwicklung: PyInstaller converter/Formnaro-Konverter.spec erzeugt einen eigenen
Headless-Konverter. Neue Builds liegen getrennt in runtime-v010-build und
runtime-v010. Frühere Runtime-/App-Ausgaben werden nicht ersetzt. Die portable
Desktop-Ausgabe benutzt resources/converter/Formnaro-Konverter.exe mit _internal und vollständigen Drittanbieter-Lizenzen. Konverter-Prüfdateien bleiben im Quell-/Abnahmeordner und gehören nicht in die portable Laufzeit.
Abnahme und Build-/Runtime-SHAs stehen unter work/stl-v010-integration; sie müssen
nach jeder Produktänderung erneuert werden. Eine bloße Upstream-Abnahme ersetzt
keinen Test dieser konkreten Formnaro-Anbindung.

Paket 9 (Formnaro 0.28.0) ergänzt den direkten Dateieinstieg bei Import/Export
und die gemeinsame native CAD-Übernahmevorschau mit Verwerfen, Escape,
Revisionsschutz und ausdrücklicher Übernahme. Der kleine Bestätigungsdialog
lässt die gemeinsame Arbeitsfläche bedienbar. Analyse/Korrekturen/Dateiausgabe
bleiben unabhängig vom gemischten Projekt. Die Konverter-Engine und ihre
Runtime-Dateien bleiben unverändert. Anleitung: docs/GEMEINSAMER-KONVERTER.md;
aktuelle, getrennte Abnahme: work/converter-workspace/checks. Direkte Übergabe
eines ausgewählten Netzobjekts ist weiterhin Paket 11.


Sicherheitsbuild 0.103.1: unveränderte Engine-Pythonmodule und Bridge, neu gefrorene Abhängigkeiten Pillow 13.0.0 und setuptools 84.2.1. pyproject/uv.lock und die dadurch veränderten Build-Pins sind in provenance.json getrennt vom bisherigen Build dokumentiert. Neue Laufzeit: runtime-v010-security. scripts/prepare-security-converter.py prüft Engine-Quellen, tatsächliches PIL._version im gefrorenen Archiv sowie die Imaging-Binärdatei und ergänzt aktuelle Paketmetadaten/Lizenzen. Vorbereitender PyInstaller-Aufruf: converter/.venv/Scripts/python.exe -m PyInstaller --noconfirm --distpath converter/runtime-v010-security-build --workpath work/security-0104/pyinstaller converter/Formnaro-Konverter.spec. Alte Laufzeiten und freigegebene Programme werden nicht überschrieben.


## Minimaler Headless-Build ab 0.122.0

`Formnaro-Konverter.spec` friert die unveränderten Enginealgorithmen für das
feste Dateiprotokoll ein. Die private `headless-vtk/vtk.py` stellt echte
VTK-Kerntypen bereit, die OCP beim Initialisieren importiert. Der allgemeine
VTK-Umbrella würde zusätzlich VR, Filmcodecs und viele Dateileser laden.
Direkte VTK-Importe von CadQuery bleiben mit ihren Standardhooks enthalten.
Die Bridge ist keine allgemeine VTK-Python-Umgebung. Viewer-/Notebook-/Trame-
und unbenutzte NumPy-JIT-Pakete (Numba/LLVM) werden nicht eingefroren.
SciPy, CasADi und die tatsächlich importierten VTK-/OCCT-Bibliotheken bleiben.

Der vorbereitete Laufzeitordner wird über `provenance.json` ausgewählt;
Entwicklungsstart und Packaging nutzen dieselbe Auswahl. Ein separater Build
kann mit dem vorbereiteten Converter-venv so erfolgen:

```
converter/.venv/Scripts/python.exe -B -m PyInstaller --noconfirm --distpath <neuer-dist-ordner> --workpath <neuer-build-ordner> converter/Formnaro-Konverter.spec
converter/.venv/Scripts/python.exe -B scripts/prepare-minimal-converter.py --built <dist>/Formnaro-Konverter --baseline <vorbereitete-lizenzierte-security-runtime> --output converter/runtime-v010-minimal --report work/converter-minimal.json
```

Die Vorbereitung prüft die unveränderten Engine-Quellpins, Pillow 13.0.0,
Setuptools 84.2.1 und identische verbleibende native Abhängigkeitsdateien gegen
die lizenzierte Basis. Sie übernimmt die vollständigen Lizenzhinweise und
protokolliert Spec, private Typebridge, Abhängigkeitsversionen und EXE-Hash.
Frühere Programm- und Runtime-Ausgaben werden nicht überschrieben.
