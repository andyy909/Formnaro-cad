# Messgrundlage für die private Stabilisierung

Der Vergleich beginnt bei der lokal geprüften r36 mit Begrüßungsbildern, Quellcommit `2d5c8fbee37d801ba1900b7de5ef54ee511c0347`. Die Tests verwenden Electron 44.10.0 (Windows x64). Die lokale Quellprüfung verwendet Node 22.16.0 und Python 3.13.3.

| Ausgangspaket | SHA-256 |
| --- | --- |
| Formnaro.exe | `3c42a493b9b0faef3c176fb631945c7506d1c03fb51c4f2fc8bd39010e8a27cb` |
| resources/app.asar | `b07186394ade385e6cbd90c1ea71d00ec76a281b68dedb8adce3b3557261a8ea` |

Der Paketstart wurde in einer neuen Instanz mit isolierten Datenpfaden geprüft. Die drei Begrüßungskacheln und das Öffnen des eingebetteten Schraubstocks funktionierten. Das Fenster schloss regulär mit Prozesscode 0. Dieser Starttest enthält einen Debugger-Anschluss für die Umleitung der Datenpfade und dient als Funktionsnachweis. Die Laufzeitmessung erhält eine eigene Prüfreihe.

Für einen reproduzierbaren Startzustand lädt der Prüfstand über den normalen Desktop-Projektleser die privaten Kopien `standard-box.ocad`, `atlas-5.ocad`, `cnc.ocad`, `step-spheres.ocad` und `colored-bored-group.ocad`. Er verwendet die gespeicherte Anzeigequalität, entfernt die Auswahl und setzt die Kamera auf eine perspektivische isometrische Ausgangsrichtung mit anschließendem Einpassen. Das Fenster hat als Sollgröße 1440 × 1000. Der Bericht erfasst die tatsächliche Größe, die Renderergröße und die Pixeldichte.

Vom Quellverzeichnis aus mit einem frischen Ergebnisordner starten:

```powershell
$env:FORMNARO_PERFORMANCE_FIXTURES = (Resolve-Path ../fixtures).Path
& node_modules/.bin/electron.cmd . --verify-cad-mini-performance=../evidence/fixture-reopen/result.json
Remove-Item Env:FORMNARO_PERFORMANCE_FIXTURES
```

Der Prüflauf öffnet jede Kopie zweimal und vergleicht Modellhash, Kamera, Auswahl, Anzeigequalität und Fensterdaten. Die Eingabedateien werden anhand ihres SHA-256-Werts vor und nach dem Versuch geprüft.

## Instrumentierter Desktop-Prüflauf

Mit `FORMNARO_PERFORMANCE_TIMING=1` und ohne `FORMNARO_PERFORMANCE_FIXTURES` erfasst der gleiche Prüfstand zusätzlich Browser-Frameabstände, den ersten Draw des erwarteten Modellstands, sichtbaren Statustext, die native Worker-Zeit und die Übernahme der Anzeigedaten. Die gemeldete erste Rückmeldung ist ein Browser-Messwert. Display-Hardware und GPU-Präsentation liegen außerhalb der Messung. Die Worker-Zeitmessung läuft ohne JSON-Nutzlastzählung.

Die isolierte Quellprüfung bestand neun Prüfungen. Die folgenden Zahlen sind warme Skalierungswiederholungen 2–5 in Millisekunden. Die Modelle wurden zuvor geöffnet und mit dem bestehenden Bewegungs- und Rotationsprüfstand bearbeitet.

| Modell | Erste Rückmeldung | Fertige Ansicht | Nativer Display-Auftrag | Übernahme der Anzeigedaten |
| --- | ---: | ---: | ---: | ---: |
| Native Standardserie | 11,8–21,9 | 67,7–89,0 | 7,9–9,1 | 1,0–1,7 |
| 12 STEP-Kugeln | 4,9–8,3 | 1752–1830 | 1633–1715 | 0,8 |
| Farbige Bohrgruppe | 4,3–9,3 | 2589–2815 | 2528–2755 | 0,8–0,9 |

Die erste Skalierung benötigte bei den STEP-Kugeln 1922 ms und bei der Farbgruppe 5990 ms bis zur fertigen Ansicht. In diesen Skalierungsproben trat keine automatische Workererneuerung auf. Die Summen der Prozess-Arbeitssätze an den Messpunkten betrugen rund 793 MB vor und 1295 MB nach den Szenarien. Die separate kleine Autosave-Probe benötigte 0,5 ms für die Workspace-Serialisierung und 19,2 ms für die bestätigte Speicherung von 13.616 Zeichen. Diese Zahlen beschreiben den instrumentierten Quelllauf. Die Referenzmessung auf der unveränderten EXE hat eigene Rohdaten.

## Vergleichsreihe auf unveränderter r36

Die oben gehashte EXE lief fünfmal nacheinander mit jeweils frischen Daten- und Browserprofilen unter Windows 11 Build 26200 auf einem Intel Core i5-12450H. Alle Prozesse schlossen regulär mit Exitcode 0. Gemessen ab Freigabe des Hauptprogramms im Debugger betrugen die Medianzeiten 86 ms bis zur Fenstererzeugung, 851 ms bis zum geladenen Dokument und 1385 ms bis zur CAD-Bereitschaft. Das Maximum für CAD-Bereitschaft betrug 2803 ms. Der Debugger isoliert die Profile und aktiviert die vorhandenen Prüfzugriffe. EXE und ASAR blieben bytegleich.

| Fall | Aktionen | Erste fertige Ansicht | Warme p95-Rückmeldung | Warme p95-Endansicht |
| --- | ---: | ---: | ---: | ---: |
| T/R-Tastaturereignisse am Quader | 100 | 42 ms | 14 ms | 14 ms |
| Skalierung der STEP-Kugeln | 20 | 2125 ms | 14 ms | 2427 ms |
| Skalierung der farbigen Bohrgruppe | 20 | 6471 ms | 11 ms | 8799 ms |

Die Skalierungsreihe ändert pro Versuch die X-Skalierung über dieselbe Controller-Mutation wie der bisherige Prüfstand. Undo stellt zwischen den Versuchen die ursprüngliche Revision wieder her. Der erste Versuch jedes Falls ist separat ausgewiesen und folgt auf das Laden und Anzeigen des Modells. Bei der Farbgruppe wurde eine Workererneuerung beobachtet. Die Rückmeldung kann aus Statustext bestehen, lange bevor sich die Geometrie sichtbar ändert. Die r36 liefert interne Worker-Phasen noch nicht, daher enthält ihr gemessener Display-Aufruf Worker und Übertragung gemeinsam. Die früheren 1,7–2,5 Sekunden bleiben historische Einzelmessungen aus einer kürzeren Reihe.

## Autosave mit großer CNC-Kopie

Der Quell-Desktopprüflauf hat die bestätigte CNC-Kopie zuerst als .ocad und anschließend als .fnpack gesichert. In beiden Fällen wurden drei weitere Arbeitsbereiche mit jeweils anderer Kamera gesichert. Die Zähler für Modellübertragung und vollständige Modellkodierung blieben dabei unverändert. Der Prüfstand las die gespeicherte Ansicht aus der echten Sicherungsdatei zurück. Während jeder laufenden Sicherung nahm das Fenster ein Tastaturereignis und eine Kameraänderung an.

| Format | Dateigröße | Dauer der drei Kamerasicherungen | Längste gemessene Bildpause |
| --- | ---: | ---: | ---: |
| .ocad | 47.910.563 Byte | 391–411 ms | 86 ms |
| .fnpack | 4.424.487 Byte | 110–125 ms | 21 ms |

Die Erfassung nutzt Animation-Frame-Zeitstempel und synthetische Ereignisse über den regulären Renderer-Handler. Sie misst auch Kopierarbeit und Anzeige am Testfenster. Paketdaten werden beim Schreiben weiterhin auf Integrität geprüft. Die Dateigrößen und Laufzeiten stammen aus dem Quelllauf vor der zusätzlichen FNPACK-Vorgängerkopie und Revisionsprüfung unmittelbar vor dem Austausch.

Die private Block-1-EXE auf Quellstand `31cfe44` bestand denselben CNC-Lauf mit regulärem Exitcode 0. In dieser Ausgabe erledigt ein Electron-Hilfsprozess die Dateiarbeit. Bei je drei Kamerasicherungen blieben die Modellzähler unverändert. .ocad benötigte 483–512 ms pro Sicherung bei maximal 106 ms Bildabstand. .fnpack benötigte 172–201 ms bei maximal 13 ms Bildabstand. Normale Neustarts lasen die bestätigten Revisionen beider Formate aus den isolierten Sicherungen zurück. Die .ocad-Rückmeldung erreichte in einer der drei Proben 122 ms. Die Stichprobe belegt die fortgesetzte Bedienbarkeit während des Schreibens. Die Leistungsziele des abschließenden Vergleichslaufs bleiben gesondert zu prüfen.

## Aufteilung der nativen Skalierungsanzeige

Neun instrumentierte Desktop-Prüfungen bestanden. Die Tabelle zeigt vier warme Skalierungen je Lastfall in Millisekunden. Der Prüfstand verwendet die genaue, unveränderte Anzeige mit Undo/Redo zwischen den Versuchen.

| Abschnitt | 12 importierte STEP-Kugeln | Mehrfarbige Bohrgruppe |
| --- | ---: | ---: |
| Cache-Schlüssel und Suche | 0–0,2 | 0,2–0,3 |
| Native Farbaufteilung | 0 | 2460–2747 |
| Native Dreiecksberechnung | 1649–2860 | 83–97 |
| Transport und Einreihung zusammen | 60–71 | 1,7–2,1 |
| Dekodierung im Renderer | 3,7–4,6 | 0,1–0,5 |
| Übernahme in die Ansicht | 0,8–1,4 | 0,9–1,0 |

Die erste Dreiecksberechnung der STEP-Kugeln dauerte 2682 ms. Die erste native Farbaufteilung der Bohrgruppe dauerte 5886 ms. Die Transportspalte enthält den verbleibenden Zeitanteil aus Nachrichtenübertragung, Einreihung und Rückgabe rund um den Worker-Auftrag. Sie ist kein reiner Kopierbenchmark. Die Zwischenanzeige kann die früh sichtbare Geometrie von diesen nativen Schritten entkoppeln. Die genaue Endansicht benötigt bei einer echten Streckung weiterhin die gemessene native Arbeit.

## Abnahme der sofortigen Skalierung

Im Desktop-Quelllauf öffnete der Prüfstand den echten Eckmaßdialog, änderte X und erfasste die erste gezeichnete Vorschau und die genaue native Vorschau getrennt. Die Endansicht, der bestätigte CAD-Körper und der wieder eingelesene STEP-Export wurden separat vermessen.

| Lastfall | Erste gezeichnete Vorschau | Genaue Vorschau inklusive 150 ms Eingaberuhe | Sollbreite | Native Breite und STEP-Rückmessung |
| --- | ---: | ---: | ---: | ---: |
| 12 importierte STEP-Kugeln | 2,7 ms | 2966 ms | 85 mm | 85,0000002 mm |
| Mehrfarbige Bohrgruppe | 2,0 ms | 2976 ms | 65 mm | 65,0000002 mm |

Abbruch ließ die Ausgangsdateien unverändert. Die Übernahme erzeugte einen Undo-Schritt, Undo und Redo stellten die exakten Modellserialisierungen her. Die physisch gespeicherten Projekte wurden erneut geöffnet. Die gemessenen Breiten der Vorschau- und Endmeshes lagen höchstens 0,005 mm von der nativen Breite entfernt. Die Reaktionszeiten sind Einzelproben ab Eingabeereignis bis zum Zeichnen des Renderers. Der abschließende Vergleichslauf prüft die Reaktionszeitziele statistisch.
