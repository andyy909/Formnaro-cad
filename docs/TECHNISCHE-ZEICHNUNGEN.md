# Technische Zeichnungen

Quellstand Formnaro 0.89.0 mit automatischer Bemaßung, aufbauend auf Paket 1 des [CAD-Ausbauplans](CAD-AUSBAUPLAN.md).
Eine portable Ausgabe gilt erst nach Source-, EXE-, Datei- und Leistungsabnahme als freigegeben.

Im Normalmodus oder in Easy Tinker mit CAD mehrere vollständige sichtbare
CAD-Materialteile auswählen und **Technische Zeichnung …** öffnen. Vorhandene
Blätter lassen sich auch ohne neue Auswahl öffnen. Netzteile sind in diesem
Paket keine Zeichnungsquellen.

Ein neues Blatt enthält Vorder-, Seiten- und Draufsicht. Papier A4/A3,
Hoch-/Querformat, Maßstab und Titelblock einstellen. Eine zusätzliche
Schnittansicht verwendet die angegebene Weltachse und Schnittlage in Millimetern.
**Blatt aktualisieren** berechnet native Projektionen und Schnitte. Der vorhandene
CAD-Dienst führt diese Arbeit aus; **Berechnung abbrechen** verwirft das noch
unvollständige Ergebnis. Das bestätigte Modell und vorherige Blatt bleiben erhalten.

Jede vollständige Ansicht wird beim ersten Aktualisieren um ihren Papierbezug zentriert, auch wenn die Teile weit vom Modellursprung liegen. Weitere Aktualisierungen und Maßstabswechsel erhalten die manuell gewählte Blattmitte der Ansicht. Danach lassen sich Ansichten auf dem Papier verschieben. Mit dem Blattwerkzeug
eine gerade Kante für ein Längenmaß, zwei Geraden derselben Ansicht für einen
Winkel oder einen Kreis/Kreisbogen für Radius beziehungsweise Durchmesser wählen.
Beschriftungen durch Eingabe und Klick auf das Papier ergänzen. Maßtexte und
Beschriftungen sind verschiebbar. Die Auswahlliste erlaubt auch das Löschen eines
Maßes, dessen geometrischer Bezug inzwischen verloren ist.

Nach **Blatt aktualisieren** unter **Automatische Bemaßung** einen Modus wählen
und **Automatisch bemaßen** anklicken. Die Vorschläge ergänzen das ganze aktuelle
Blatt, ohne vorhandene Maße oder deren manuelle Platzierung zu ersetzen:

- **Grundbemaßung**: Gesamtmaße in den verfügbaren Ansichten sowie Durchmesser
  sichtbarer Kreise. Dieselbe Gesamtachse wird für dieselbe Quellenauswahl über
  Vorder-, Seiten- und Draufsicht hinweg einmal bemaßt.
- **Detaillierte Bemaßung**: zusätzlich Kreis-/Bohrungsmittelpunkte von der
  kleinsten horizontalen und vertikalen Konturkoordinate aus, Bogenradien,
  weitere Kantenlängen und Winkel an schrägen geraden Ecken. Gemeinsam genutzte
  Positionsmaße werden nur einmal vorgeschlagen. Kreise werden als geometrische
  Kreise erkannt; daraus folgt keine automatische Unterscheidung zwischen
  Bohrung, Zapfen oder Senkung und keine Erkennung von Gewinden.

Maßtexte stehen außerhalb der Ansichten. Die Platzierung berücksichtigt
Papiergrenzen, Titelblock, andere Texte und deren Maßlinien. Kurze Maße können
eine Verlängerung zum seitlich versetzten Text erhalten. Fehlt Platz, erscheint
eine Meldung; Ansichten verschieben, Maßstab verkleinern oder größeres Papier
wählen und erneut bemaßen. Wiederholtes Bemaßen erzeugt keine doppelten
Vorschläge. Gespeichert wird erst mit **Blatt übernehmen**, gemeinsam in einem
Rückgängig-Schritt. **Abbrechen** verwirft den gesamten Blattentwurf.

Zum Ergänzen gibt es **Horizontaler Abstand** und **Vertikaler Abstand**.
Zwei Maßpunkte derselben Ansicht anklicken: bei einer Geraden den gewünschten
Endpunkt, bei Kreis oder Kreisbogen die Mitte. Diese Maße und die automatisch
erzeugten Maße speichern geometrische Bezüge, keine frei überschreibbaren
Zahlen. SVG/PDF und DXF verwenden dieselben geprüften Maßwerte.

Automatische Gesamt- und Positionsmaße setzen vollständig analytische sichtbare
Konturen aus Geraden, Kreisen, Bögen oder Ellipsen voraus. Ansichten mit Splines
werden dafür ausdrücklich ausgelassen; erkannte einzelne Linien und Kreise
bleiben bemaßbar. Verdeckte Kanten werden nicht automatisch bemaßt. Sehr große
Blätter sind pro Vorgang auf 200 neue Vorschläge und insgesamt 1000
Beschriftungen begrenzt; ausgeschöpfte Prüf-/Maßgrenzen werden angezeigt.

Zoom, Papiermaßstab, Layout und Maßtextbewegung verwenden gespeicherte Kurven
weiter. Sie konstruieren weder das Teil noch seine Projektion erneut.
**Blatt übernehmen** speichert die Blattänderungen gemeinsam mit einem
Rückgängig-Schritt. **Abbrechen** verwirft den lokalen Blattentwurf.

Geänderte Ausgangsteile kennzeichnen die Ansicht als aktualisierungsbedürftig.
Ein fehlender oder veränderter Maßbezug wird ausdrücklich angezeigt. Es gibt
keine Zuordnung zur vermeintlich ähnlichsten Kante. Vor dem Export müssen
Ansichten aktuell und Maßbezüge gültig sein. Neue Geometrie erst über
**Blatt aktualisieren** übernehmen; verlorene Maße anschließend neu auswählen
oder löschen. Ein solcher unfertiger Blattzustand ist speicherbar. Während eines laufenden Exports kann kein neuer Modellstand übernommen werden; ein Abbruch vor der Dateifreigabe erhält vorhandene Ausgabedateien.

- **PDF**: lokale Vektorausgabe über Electron mit tatsächlichem Papierformat.
- **SVG**: Vektorausgabe in Papiermillimetern einschließlich Maßstab und Titelblock.
- **DXF 1:1**: ASCII-DXF für AutoCAD 2000 (`AC1015`, Millimeter).
  Modellkurven bleiben unabhängig vom Papiermaßstab 1:1. Ansichten liegen
  getrennt nebeneinander in eigenen Ebenen. Maße und Texte werden als einzelne
  Zeichnungselemente ausgegeben; es werden keine assoziativen AutoCAD-Maßobjekte behauptet.

Linien, Kreise, Kreisbögen, Ellipsen und rationale Bézierkurven stammen aus der
nativen Projektion. DXF erhält diese Kurven als entsprechende Vektorelemente
beziehungsweise rationale Splines. Für SVG/PDF werden rationale Bézierkurven
gegebenenfalls mit einer ausdrücklich begrenzten Abweichung unterteilt; die
gespeicherte native Kurve bleibt erhalten. Papiermaßstab verändert keine
angezeigten Modellmaße. Fertigungsbezüge, Passungen und Form-/Lagetoleranzen
bleiben bewusste Vorgaben des Anwenders. Die Vorschläge garantieren keine
vollständige Fertigungsbemaßung.

Zeichnungen benötigen Projekt- und gegebenenfalls Bibliotheksformat 12.
Neue horizontale/vertikale Abstandsmaße benötigen Format 18; auch `.fnpack`
erhält sie vollständig. Ältere Blätter behalten ihre bisherigen Formate, solange
keine neuen Abstandsmaße hinzukommen. Frühere Programmversionen können neue
Format-18-Dateien nicht öffnen; bestehende Ausgaben bleiben erhalten.
Alte Formate 5–11 bleiben lesbar; Projekte ohne neue Inhalte werden nicht
pauschal angehoben. Bibliotheken übernehmen nur vollständige Blätter, deren
Quellen in der gespeicherten Auswahl enthalten sind. Beim Einsetzen werden
Objekt-, Blatt-, Ansichts- und Beschriftungskennungen neu zugeordnet.

Die lokale KI-Schnittstelle bietet `drawing`-Befehle mit `put`, `update` und
`remove` in einer eigenen Vorschau sowie
`{op:"drawing", action:"dimension", sheetId, mode:"basic"|"detailed"}`.
`dimension` benötigt aktuelle Projektionen und berechnet keine neue Geometrie;
die Vorschau bleibt bis zur Übernahme unverbindlich. Bei verknüpften Quellen
das Blatt zunächst aktualisieren und übernehmen, danach bemaßen.
`put` speichert Layout und Maßbezüge;
`update` fordert die native Berechnung ausdrücklich an. Übernahme, Revision,
Abbruch und Rückgängig entsprechen der Oberfläche. Zeichnungsexporte verwenden
`drawing-svg`, `drawing-dxf` beziehungsweise `drawing-pdf` mit `sheetId`.

Die DXF-Kennung und Millimetereinheit folgen der
[offiziellen DXF-Referenz](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DXF/files/GUID-A85E8E67-27CD-4C59-BE61-4DC9FADBE74A.htm).

Die Pakete 1–7 des CAD-Ausbaus sind seit 0.88 abgeschlossen. Die bisherigen
Grenzen von Flächenversatz, Schale, Loft und Sweep bleiben bestehen.
