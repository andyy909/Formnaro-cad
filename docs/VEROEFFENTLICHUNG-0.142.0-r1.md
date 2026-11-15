# Formnaro 0.142.0-r1

## Deutsch

- Der Übungsmodus zeigt die Arbeitsschritte nach dem Start in Solid oder Fusion in der jeweiligen Oberfläche. Er arbeitet an einer Projektkopie. Änderungen lassen sich nach der Vorschau übernehmen.
- Die KI-Werkzeugauskunft liefert die Bedienpfade des gestarteten Modus bei Bedarf. Die Wiedergabe öffnet die benötigten Register, Gruppen und Eigenschaften sichtbar.
- Die native Grundform Trapezgewinde bietet Längeneingaben bis 3.000 mm. Die schnellere Berechnung langer eingängiger Trapez-Außengewinde verwendet kurze wiederholte Gewindeperioden. Beim Längenwechsel bleibt die Platzierung erhalten.
- Im KI-Chat lassen sich CAD-Merkmale über „Stelle anhängen“ auswählen. Bei Hintergrundversuchen werden Fensterschluss und Prozessende getrennt gemessen.

### Abnahme

128 Standardtests und 86 gezielte Tests bestanden. Die Release-EXE bestand 29 Solid- und 34 Fusion-Oberflächenprüfungen. Ein Trapezgewinde Tr 16×4 über 548 mm wurde direkt in Normal erstellt. In zwei weiteren Läufen ersetzte die KI die Welle in einer Testkopie, je einmal im sichtbaren Solid- und Fusion-Übungsfenster. Vorschau, Übernahme an der ursprünglichen Lage, ein Undo-Schritt und reguläre Prozessenden wurden geprüft. FreeCAD bestätigte je einen gültigen rechtsgängigen Körper mit 4 mm Steigung. 3.000 mm ist die geprüfte Eingabegrenze. Die vollständige Geometrie wurde bei 548 mm geprüft.

Alle 15,862 Dateien im Windows-ZIP wurden gegen den Laufzeitbestand per SHA-256 geprüft. Die Prüfungen gelten für die beschriebenen Fälle.

### Start

Windows-x64-ZIP vollständig entpacken und `Formnaro/Formnaro.exe` starten. Programm-, CAD-Kern- und FreeCAD-Quellen stehen separat bereit. `SHA256SUMS.txt` enthält die Prüfsummen der Dateien.

## English

Practice copies now demonstrate their actions in the Solid or Fusion workbench from which they were started. You can review and apply the resulting changes. Mode-specific tool paths are retrieved on demand. The release adds a native trapezoidal thread primitive, a 3,000 mm length input limit, faster calculation for long single-start trapezoidal external threads and placement-preserving length edits. It also includes CAD feature selection in AI chat, and separate window-close and process-exit timings for lab runs.

All 128 standard tests and 86 focused tests passed. The Windows x64 executable passed 29 Solid and 34 Fusion interface checks. A continuous 548 mm Tr 16×4 was created directly in Normal and applied after live AI practice in each of Solid and Fusion. FreeCAD independently confirmed the two practice results at 4 mm pitch. The 3,000 mm figure is the verified input limit. These are targeted checks.

Extract the entire Windows x64 ZIP and run `Formnaro/Formnaro.exe`. Keep the runtime files beside it. Application, CAD-kernel and FreeCAD sources are separate downloads.

EXE SHA-256: `bb022410c0ec447d55a22ead15f9408737315f3f96ab7751d347034e73eb2d39`

app.asar SHA-256: `5da3dee7ca749217e9e64a6e09e44eb1fca5665212a33f126cb98ae748309530`
