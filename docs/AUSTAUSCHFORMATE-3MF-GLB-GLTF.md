# Baugruppen mit Farben importieren und weitergeben

Formnaro Netz 0.21 und Formnaro CAD 0.23 öffnen 3MF, GLB und glTF über **Importieren**.
Alle Teile werden einzeln auswählbar übernommen. Dateieinheiten werden automatisch
in Millimeter umgerechnet; die absolute Anordnung bleibt erhalten, auch bei einer
anderen Arbeitsebene. Namen und Objektfarben werden übernommen. Der gesamte
Import ist ein Undo-Schritt. Abbrechen oder ein ungültiges Teil verändern das
bestehende Projekt nicht.

## Formnaro Netz

Geschlossene Dreiecksnetze werden zu bearbeitbaren Körpern. Teile auswählen,
verschieben, skalieren, umfärben oder mit vorhandenen Werkzeugen bearbeiten.
Bei offenen oder beschädigten Netzen wird die gesamte Übernahme abgewiesen.
Es wird keine stillschweigende Reparatur durchgeführt. Zum Erhalt der Quellen
und Bearbeitungen das Projekt als `.ocad` speichern.

## Formnaro CAD

Die Teile werden als getrennte Netzreferenzen übernommen. Sie lassen sich
verschieben, skalieren, drehen und umfärben. Sie bleiben von nativen CAD-Körpern
getrennt und werden nicht automatisch zu analytischen Flächen oder STEP-Körpern.
3MF, GLB und glTF exportieren sowohl sichtbare CAD-Körper als auch Netzreferenzen,
wahlweise nur die ausgewählten Teile. STL, OBJ und STEP behalten den bestehenden
Exportumfang der nativen CAD-Körper. Projekte mit den neuen Importmetadaten
benötigen mindestens CAD 0.23.

## Formate und Grenzen

- **3MF:** Core-Netze, Baupläne, verschachtelte Komponenten, auch über zusätzliche
  Modelldateien im Paket (Production-Erweiterung). Millimeter, Zentimeter,
  Mikrometer, Meter, Zoll und Fuß. Objektfarben aus Basis-Materialien oder
  Farbgruppen einschließlich Deckkraft. Nicht druckbare Hilfsobjekte werden
  mit Hinweis ausgelassen. Ein 3MF-Slicerprojekt wird als Geometrie geöffnet;
  Druckprofile, Stützstrukturen aus Werkzeugpfaden und Druckereinstellungen
  werden nicht importiert. Mehrere Flächenfarben innerhalb eines Teils werden
  mit sichtbarem Hinweis auf die erste Objektfarbe reduziert. Texturen und
  Verbundmaterialien sowie unbekannte erforderliche Erweiterungen werden
  abgewiesen.
- **GLB:** glTF 2.0 in einer Binärdatei. Empfehlenswert zum einfachen Weitergeben
  von Geometrie, Teilenamen, Objektfarben und Deckkraft.
- **glTF:** eingebettete Puffer oder lokale `.bin`-Begleitdateien. Die Modelldatei
  und ihre Binärdateien gemeinsam im Importdialog auswählen. Eindeutige lokale
  Dateinamen werden auch für relative Unterordnerverweise zugeordnet. Es werden
  keine Dateien aus dem Internet geladen. Meter/Y-oben werden in Millimeter/Z-oben
  umgerechnet. Verschachtelte Transformationen und Spiegelungen bleiben erhalten.
  Unterstützt sind Dreiecksnetze, auch mit Interleaving, Sparse-Accessors und
  quantisierten Positionen. Draco/Meshopt-Netze und Skins müssen zuvor als
  unkomprimierte statische Netze gespeichert werden. Texturen und Vertexfarben
  werden mit sichtbarem Hinweis auf Materialfarben reduziert, Animationen auf
  ihre Ausgangsstellung. Unterschiedliche Materialien innerhalb eines glTF-Netzes
  werden als getrennte Teile übernommen; in Netz müssen diese geschlossen sein.

Die bestehenden Arbeitsbereichsgrenzen bleiben erhalten. Höchstens 500 Teile
pro Projekt, 1,5 Millionen importierte Punkte und 2 Millionen Dreiecke im
Dateileser; CAD-Referenzen und CAD-Export haben zusätzlich ihre bisherigen
Puffergrenzen. Dateien: Netz 30 MiB, CAD 50 MiB; entpackte 3MF-Pakete und
glTF-Puffer zusammen höchstens 128 MiB. Deckkraft unter 5 % liegt außerhalb
des bestehenden Objektmodells und verhindert die Übernahme.

3MF und die Textkoordinaten erhalten ihre Dezimalwerte. glTF/GLB verwenden
Float32-Netzpositionen; sehr kleine Rundungsabweichungen sind möglich. Der
CAD-Export prüft weiterhin sein eingestelltes Genauigkeitsbudget. Mechanische
Konstruktionshistorien und ursprüngliche CAD-Radien entstehen aus diesen
Netzformaten nicht automatisch.

## Geprüfter Ablauf

Synthetische zweifarbige Baugruppe importieren, beide Teile einzeln auswählen,
ein Teil verschieben, umfärben und im Maßfeld skalieren. Als `.ocad` speichern
und über den normalen Dateiöffner erneut laden. Danach in 3MF, GLB und glTF
exportieren und jede Ausgabe erneut importieren; Teilezahl, Farbe, Abmessungen
und Lage vergleichen. Zusätzlich Undo/Redo, Abbruch, offene Netze, Zoll-Einheiten,
verschachtelte Komponenten, Spiegelungen und lokale Binärbegleitdateien prüfen.
Die Abnahme läuft mit isolierten Profilen und synthetischen Daten, auch gegen
die separate gepackte Anwendung.

Technische Referenzen: [3MF-Core-Spezifikation](https://github.com/3MFConsortium/spec_core/blob/master/3MF%20Core%20Specification.md),
[glTF 2.0](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html).
