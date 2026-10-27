# Formnaro – vollständige Funktions- und Stabilitätsprüfung

Die gemeinsame Prüfung ab Version 0.49.2 verbindet die vorhandenen Kern- und
Oberflächensuiten. Sie führt die normale Anwendung mit eigenen synthetischen
Profilen aus. Frühere Prüfberichte werden nicht überschrieben oder als neue
Abnahme gezählt. Die tatsächliche gepackte EXE wird gesondert geprüft.

## Wiederholen

`npm run test:all-functions -- --mode source --suite all`

Für eine gepackte Ausgabe zusätzlich `--mode packaged --exe <absoluter EXE-Pfad>`
angeben. `--suite unit`, `--suite surface` oder einzelne durch Komma getrennte
Suite-IDs begrenzen einen Lauf. `--list` zeigt den Katalog ohne Programmstart.
`--output <Ordner>` bestimmt den übergeordneten Nachweisordner. Jeder Aufruf
erzeugt einen neuen Unterordner. Ein explorativer Lauf wird mit `--exploratory`
markiert und zählt nicht als finale Abnahme.

## Funktionsmatrix

| Bereich | Maßgebliche Prüfgruppen und Ergebnis |
|---|---|
| Start, Projekte, Speichern, Neustart | mixed, workflow einschließlich zweitem Prozess; Projekte-, Speicher-, Recovery-Kernsuiten |
| Alle 23 Formen in CAD und Netz | easy-complete; native Rezept-/Form-/Gewinde-/Parameterprüfungen |
| Text, Originalschriften, SVG, Skizzen, Formpakete | native, tools; Schriftkorpus-, Kontur-, Plugin-, Skizzen- und Vorlagenprüfungen |
| Auswahl, Objektbaum, Layer, Ordner, Eigenschaften | native, workspace, tools, interactions; Auswahl-/Organisations-/Arbeitsplatzprüfungen |
| Verschieben, Drehen, Skalieren, Spiegeln, Ausrichten | native, easy-complete, interactions; affine, Maß-, Griff- und Ausrichtungssuiten |
| Arbeitsebene, Lineal, Magnet und Flächenbezüge | native, workspace, tools, easy-complete; native und Netz-Bezugsprüfungen |
| Boolesche Operationen, Gruppen und Quellen | native, mesh, tools; native und Netz-Controller-/Quellen-/Transaktionstests |
| Bohren, Gewinde, Kanten, Anordnen, Passung, Teilen | native, mesh, tools, partition; technische Kern- und Präzisionsprüfungen |
| Messen, Schnitt, Ansicht, Isolation, Farben | native, tools, workspace; Analyse-/Renderer-/Farbexportprüfungen |
| Dreiecke, Pinsel, Lasso und Schutzmasken | selection; sämtliche mesh-selection-Kernprüfungen |
| Netzdiagnose, Reparatur und planare Öffnungen | inspector, repair, hole; zugehörige Kern-/Controller-/UI-Prüfungen |
| Steckverbinder, Reduktion, Remesh, Unterteilen, Glätten, Ersetzen | connectors, reduce, remesh, smooth, erase-fill; zugehörige Kernprüfungen |
| Make Solid, Aushöhlen, Innenräume und Abläufe | make-solid, hollow; physische Projekt-/STL-/OBJ-Prüfungen und Geometriekernsuiten |
| CAD-/Netzkopien, Originalerhaltung | cad-copy, mesh-copy, workflow; Konvertierungs-/Quellen-/Persistenzprüfungen |
| Konverter, Bereiche, Toleranzen, Berichte | converter, mesh-copy; Konverterprotokoll und native STEP-Prüfungen |
| STEP, STL, OBJ/MTL, SVG, 3MF, GLB, glTF | native, mixed, workflow, tools; Austauschformat- und Exportprüfungen |
| Easy Tinker und automatische Reparatur | easy-complete, easy-domain, easy-auto, workbench; zusätzliche Easy-Kernsuiten |
| KI, lokale API, Python/MCP | native, shared-ai, ai-checks, unified; Anbieter-, Bridge-, Achsen- und Ergebnisprüfungen |
| Einstellungen, Layouts, Schriften, Bibliotheken, Hilfe | native, workbench, unified; Speicher-, Layout-, Plugin-, Schrift- und Fehlerlogprüfungen |
| Undo/Redo, Abbruch, veraltete Ergebnisse, Dateien | sämtliche Werkzeugsuiten, interactions, recovery, soak; gemeinsame Transaktions-/Dateikernsuiten |

Der Teststarter erfasst alle eigenständigen Node-Tests dynamisch über ihren
echten `node:test`-Einstieg. Andere Dateien werden im Testinventar als Hilfsdatei
oder historischer/spezialisierter Starter mit Ersatzweg dokumentiert. Ein
registrierter Befehl allein gilt nicht als bestandener Bedienablauf.

## Zusätzliche Prüfungen

- Zehn feste Aktionsfolgen mit je 30 echten Auswahl-/Eingabe-/Undo-/Redo- und
  Vorschauabbruchschritten; CAD und Netz wechseln sich ab.
- Fensterbreiten 800, 1000, 1280 und 1840 Pixel mit Bildschirmbelegen.
- Mindestens 30 Minuten und 30 abgeschlossene Bearbeitungs-/Dateizyklen.
- Kontrollierter Prozessabbruch nach physisch bestätigter Autosicherung und
  Wiederherstellung in einem zweiten Prozess desselben isolierten Profils.
- Graduierte synthetische STL-Importe mit 972, 9408 und 30000 Dreiecken.
- Verkettete Reparatur mit Schutzmaske und Dateirundlauf, CAD→Netz→echte
  Netzteilung→CAD mit halbem Sollvolumen, geteilte Steckverbinder mit separatem
  Export sowie Make Solid→Aushöhlen mit erhaltenen Originalen.

Die neue verkettete Prüfung deckte einen Rundungsfehler beim Aushöhlen gültiger
Make-Solid-Flächen auf. Fast parallele Kanten mit identischem Endpunkt behalten
diesen jetzt exakt, statt ihn durch instabile Determinantendivision zu verschieben.
Kontakt- und Wandtoleranzen bleiben unverändert. Ein geometrischer Regressionstest
prüft den Erfolg und weiterhin die Abweisung einer tatsächlich beschädigten Quelle.

Große Belastungsprüfungen verlangen vor dem Start 6 GiB verfügbaren RAM und
enden bei weniger als 3 GiB Reserve oder über 4 GiB Speicher der eigenen
Testprozessgruppe. Ein solcher Lauf ist unvollständig, niemals bestanden.
Die normalen Suiten besitzen 10 Minuten Zeitbudget, Konverter-/native und
Neustartketten 20 Minuten; der Wiederholungslauf 35 Minuten.

## Nachweise und Freigabe

Jeder Lauf enthält eine Zusammenfassung, unveränderte Rohlogs, echte Exitcodes,
Prüfberichtshashes und die zugehörigen Quell-/EXE-/ASAR-Identitäten. Ein
absichtlicher Recovery-Absturz wird ausdrücklich gekennzeichnet und benötigt
eine erfolgreiche zweite Prozessphase. Fehlversuche bleiben bestehen.

Die aktuelle Ergebnismatrix und Fehlerliste stehen im lokalen Gesamtprüfbericht.
Die Freigabe verlangt erfolgreiche aktuelle Quell- und EXE-Nachweise, tatsächlich
gelese­ne Projekt-/Exportdateien sowie eine vollständige Archivprüfung. Fehlende
Prüfungen oder bekannte kritische Fehler verhindern die Freigabe.

Projektformat 8, Arbeitsplatzformat 4 und lokale API-Version 1 bleiben erhalten.
Keine persönlichen Modelle, Profile oder Schlüssel werden benutzt. KI-Antworten
stammen von lokalen synthetischen Anbietern. Paket 27 wird nicht vorweggenommen.
