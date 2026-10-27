# STL-CAD und vollständige Funktionsabnahme

Für STL-CAD-Prüfung 2 werden ein synthetischer, reproduzierbarer Testbestand
und ein ausdrücklich lokal bleibender Bestand realer Nutzer-STLs getrennt.
Die Auswahl enthält Gehäusehälften, dünne Deckel, Fächer, Öffnungen, beschädigte
Netze und Fälle oberhalb der Import-/Konstruktionslimits. Downloads sind read-only.

## Reproduzierbare Prüfungen

- `npm run test:cad-stl`: echte native Ebenen-/Kurvenkonstruktion, unabhängige
  Polynomparameter, Transformationen, BRep-/STEP-Roundtrip und Ablehnung.
- `npm run test:cad-release`: vollständige historische und native Grundtests,
  erweiterte CAD-Prüfungen, Schriften, KI-Mocks, Auswahl/Bewegung und 16 native
  Desktopabläufe einschließlich Platzierung, Parameter, Werkzeuge und Layout.
- Wenn die lokale Inventur vorhanden ist, ergänzt die Freigabe den echten
  STL-Importdialog mit sechs Referenzgehäusen, Speicherung, STEP, Undo/Redo,
  Fehlerrollback, Abbruch/Worker-Neustart und 30 Importwiederholungen.
- Unabhängiger STEP-Leser, Runtimeintegrität sowie tatsächlich gepackte EXE
  werden zusätzlich geprüft. Die Freigabe ist an Quell-/Produktions-SHAs gebunden.

## Lokaler Nutzerbestand

`scripts/inventory-stl-housings.py --root <Downloads> --selection <lokale-JSON>
--output <lokale-Inventur>` erfasst Formate, Größen, Dreieckszahlen, Hashes und
Duplikate. Die Auswahl-JSON enthält `names` und `mandatory`; die kleinste und
größte weitere eindeutige Datei werden zusätzlich aufgenommen.

`scripts/test-stl-corpus.mjs --inventory <lokale-Inventur> --output <Testordner>
--reference <zusätzliche-STL>` isoliert jede native Rekonstruktion im eigenen
Prozess und speichert Projekt, STEP, Double-Exportmesh, Fehler und Laufzeit.
Ein erneuter nativer STEP-/Projektleser bestätigt Speicherung. Der unabhängige
Python-/Trimesh-/Rtree-Vergleich kontrolliert Vertices, Schwerpunktproben und
reproduzierbare Oberflächenproben in beiden Richtungen, außerdem geschlossene
Topologie, Eulerzahl und Volumen. Er behauptet keinen globalen Stichprobenbeweis.
Die globale Fehlergrenze folgt separat aus dem begrenzten Polynommodell.

Pfadlisten, Modelle, Screenshots und Testprofile gehören nach `work/` und nicht
in Quellenarchive. Für unabhängige lokale Meshprüfungen werden NumPy, Trimesh
und Rtree benötigt; sie sind keine Laufzeitabhängigkeiten von Formnaro.

## Grenzen und Freigabe

Ein Test wird als erfolgreiche Konvertierung, begründete Ablehnung oder echter
Fehler geführt. Eine geplante Ablehnung ist kein erfolgreicher CAD-Import.
Die sechs verbindlichen Gehäuse und das zusätzliche Referenzmodell müssen
konvertieren und sämtliche geometrischen Gates bestehen. Offene Hüllen werden
nicht automatisch geschlossen. Grenzen und temporäre native Fehler bleiben im
Bericht sichtbar; geänderte Quellen entwerten einen alten grünen Bericht.

Neue Ausgabe ausschließlich unter einem separaten Vorschauordner. Vorhandene
Nutzerdaten, Zugangsdaten und Installationen werden nicht als Testbestand benutzt.

## Technische Nachträge zur Prüfung 2

ASCII-Koordinaten werden als Double gelesen. Das STL-Volumen wird um einen
nahen Vertex integriert. Importierte BRep-Quellen bleiben nach unabhängiger
nativer Prüfung bytegleich; gespeicherte Statistiken werden nicht vertraut.
STEP-Roundtrips prüfen Außenmaße und Volumen getrennt: 0,00001 mm bzw. 0,001 %.

`--retry-failed` wiederholt beim lokalen Korpus ausschließlich fehlgeschlagene
Prüfungen. Es verlangt einen vollständigen Bericht und unveränderte
Geometriequellen; der vorherige Bericht sowie die alten Fallordner bleiben
als Beleg erhalten. Lange native Prüfungen werden für die Endabnahme seriell
betrieben, damit parallele Testprozesse nicht das Arbeitsspeicherbudget teilen.

Die portable Vorschau heißt `release-formnaro-stl-cad-preview2` und zeigt
„STL-CAD-Prüfung 2“. Sie verwendet den unveränderten nativen CAD-Kern.
Der private Einzeldatei-/Funktionsbericht liegt unter
`work/stl-cad-v2/PRUEFBERICHT.md`; dort stehen Ergebnisse und tatsächliche
Speicher-/Paketbelege. Der installierte Programmstartort wird nicht ersetzt.

## Abschließende Ergebnisse vom 12.10.2026

Die lokale Auswahl enthält 24 Downloaddateien und ein zusätzliches
Referenzmodell. Persönliche Dateinamen, Pfade und Modelle werden nicht
veröffentlicht. 17 Dateien wurden erfolgreich als CAD konvertiert; vier
wurden wegen ungültiger Netze und vier wegen Datei-/Dreiecks-/BRep-Limits
abgewiesen. Alle sechs verbindlichen Gehäuse und das Referenzmodell bestanden.
Fünf gedrehte, gespiegelte, anisotrop skalierte bzw. verschobene ASCII-Varianten
bestanden ebenfalls.

| Kriterium | Vorgabe | Größter Wert im erfolgreichen lokalen Bestand |
| --- | ---: | ---: |
| Beidseitige Oberflächen-Korrespondenzgrenze | 0,25 mm | unter 0,0201 mm |
| Kritische geometrische Abstandsgrenze | 0,10 mm | unter 0,04003 mm |
| Native Volumenabweichung zur STL | 1 % | 0,63478 % |
| Unabhängige Oberflächen-Stichproben | 0,25 mm | 0,017764 mm |

Die Oberflächen-Korrespondenzgrenze folgt aus den Bernstein-Kontrollpunkten
einschließlich Welding-/Nativebudget. Die Stichproben ersetzen diesen Nachweis
nicht. Erfolgreiche Exportnetze waren geschlossen und besaßen die gleiche
Eulerzahl wie ihre Eingaben. STEP-/Projekt-Roundtrips bestanden; sieben
erforderliche STEP-Dateien lieferten auch im getrennten offiziellen nativen
FreeCAD-Reader gültige geschlossene Einzelkörper mit Außenmaßfehler unter
0,00001 mm. FreeCAD nutzt ebenfalls OCCT, jedoch keinen Formnaro-WASM-Prozess.

Die breite Freigabe besteht aus 34 Prüfgruppen: 100 historische Node-Tests,
177 native Grundtests, 46 erweiterte CAD-Tests, acht STL-Tests, fünf Schrifttests,
elf KI-Provider-/Modelltests, Bewegung/Auswahl und 17 Desktopabläufe sowie
Interface/Worker, STEP-Leser, Runtimeintegrität und Electron/HTTP/Python-MCP.
Die zusätzliche Schriftprüfung umfasst alle 61 neuen Originalfontdateien.
Nach dem BRep-Erhaltungsfix wurden alle 177 Grundtests erneut ausgeführt.
Fehlerhafte Testgerüst-/Zeitmessungsabläufe wurden behoben und wiederholt.

Die tatsächliche gepackte EXE besteht 25 weitere Prüfungen. Ihre gepackten
Frontend-/Preload-/Backenddateien bestehen sieben echte Datei-/Importdialoge,
CAD-Kennzeichnung, Größenänderung/Bohrung/Gruppe, Speicherung/STEP/Undo/Redo,
Fehlerrollback, Escape/Worker-Neustart und 30 wiederholte Importe.
170 Runtime-Dateien stimmen bytegenau mit dem akzeptierten Produktionsstand
überein; genau ein CAD-Kern, keine Benutzerprofile oder Zugangsdaten im Paket.
Anwendungs-/Kernelquellen und Lizenzen liegen dem CRC-geprüften portablen ZIP bei.

Ein früher paralleler Vorlauf verlor einen Renderframe; die Ursache wurde
nicht nachgewiesen. Ein verpflichtender Korpusfall überschritt sein Testlimit
und bestand die Wiederholung mit unveränderten Geometriequellen. Finale
Desktop-/Paketabläufe liefen erfolgreich seriell. Bei der größten Probe wurden
etwa 5 GiB Gesamt-Arbeitssatz gemessen; nach 30 kleinen Folgeimporten lag der
Arbeitssatz unter dem Ausgangswert dieser Wiederholungsserie. Das ist keine
allgemeine Aussage über beliebige Dauersitzungen.

Das Verfahren erzeugt glatte Einzelpatches und positionsstetige gemeinsame
Kanten (C0). Allgemeine G1-Tangentenstetigkeit, Originalradien, Skizzen und
Konstruktionshistorie werden nicht rekonstruiert. Maße und Einheiten beziehen
sich auf die vorhandene STL; die lokale Abnahme verwendet Millimeter.

GitHub-Vorabversion:
[v0.12.0-stl-cad-pruefung2](https://github.com/andyy909/Formnaro/releases/tag/v0.12.0-stl-cad-pruefung2).
Der private vollständige Prüfbericht und die Rohbelege bleiben lokal unter `work/`.
