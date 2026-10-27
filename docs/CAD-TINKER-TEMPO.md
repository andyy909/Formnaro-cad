# CAD im Tinker-Modus – Formnaro 0.57.0

0.57.0 übernimmt die Wiederverwendung unveränderter Anzeigedaten aus dem
Arbeitsprinzip der CAD-Mini in die große Anwendung. Besonders Verschieben,
Drehen und das Abschließen einer Größenänderung profitieren davon. Die
Optimierung funktioniert ebenfalls im normalen Bedienmodus.

## Änderungen

- Der CAD-Worker sendet bekannte Anzeigenetze als kurzlebige Verweise.
  Nur neue Geometrie oder eine andere erforderliche Anzeigeauflösung liefert
  erneut vollständige Dreiecks-, Normalen- und Flächenpuffer.
- Die empfangenen Puffer werden einmal geprüft und unveränderlich gespeichert.
  Ansicht und Geometrievergleich können dieselben geprüften Daten wiederverwenden.
  Cache: höchstens 128 Einträge/64 MiB, getrennt von der CAD-Geometrie.
- Eine rotationsunabhängige obere Schranke der linearen Streckung bestimmt
  die lokale CAD-Anzeigetoleranz. Eine reine Drehung löst dadurch keine
  unnötige Neuvernetzung aus. Allgemeine Scherung und Skalierung erhalten
  weiterhin eine konservative Schranke für die gewählte Welttoleranz.
- Die Farbaufteilung einer Gruppe kann in einem bereits berechneten
  Koordinatenrahmen verbleiben, wenn ihre neue Lage durch eine starre
  Bewegung oder Spiegelung daraus hervorgeht. Das gilt auch nach einer
  früheren Skalierung. Bei echter Streckung/Scherung wird die native
  Farbaufteilung im Weltraum wie bisher berechnet und neu vernetzt.

Die zusätzliche Streckungsschranke betrifft ausschließlich die Darstellung.
CAD-Konstruktion, native Präzisionsabfragen, STEP-/STL-Export, Quellen,
Projektformate, Qualitätswerte und Undo/Redo behalten ihre Verträge.
Die gewählte Anzeigetoleranz wird nicht vergrößert. Große Größenänderungen
oder komplexe CAD-Operationen können weiterhin Zeit benötigen.

## Sicherheit der Wiederverwendung

Verweise gelten nur innerhalb einer Rechenworker-Generation. Neustart,
Abbruch oder Fehler verwerfen den zugehörigen Cache. Laufende Anfragen
behalten ihre benötigten Verweise auch bei zwischenzeitlicher Verdrängung.
Fehlende oder ungültige Puffer werden abgewiesen, bevor die Darstellung
eines neuen Modellstands bestätigt wird. Puffer sind ausschließlich
Anzeigeinformationen; sie werden nicht zu CAD-Körpern oder Exportquellen.

## Prüfung und Vergleich

`--verify-cad-mini-performance=<Nachweisdatei>` startet eine isolierte Prüfung
mit 36 nativen Grundformen, zwölf tatsächlich importierten STEP-Kugeln und
einer mehrfarbigen Gruppe mit Bohrung. Verschieben, verschiedene freie
Drehwinkel und Größenänderungen werden mit exakt geprüftem Undo/Redo
gemessen. Gleichbleibende lokale BRep-Daten, Quellen, Farben und Qualität
werden kontrolliert. Transportgrößen bezeichnen UTF-8-JSON-Messwerte,
nicht das interne Chromium-Übertragungsformat.

Die frühere 0.56.0 dient als unveränderte Vergleichsausgabe. Zeitangaben aus
diesem synthetischen Vergleich sind keine allgemeine Zusage für beliebige
CAD-Dateien. Zusätzlich laufen Kernprüfungen und die Bedienprüfungen für
Tinker, CAD-/Netz-Palette, normalen Arbeitsplatz und Netzansicht an Quelle
und tatsächlicher Windows-EXE.

Die neue portable Ausgabe liegt separat; bestehende Programme, Projekte,
Bibliotheken und Profile werden durch den Prüf-/Buildvorgang nicht verändert.
