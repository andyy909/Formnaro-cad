# Vorbereitete Funktionstests für den Übungsmodus

Stand 06.11.2026. Die 30 Aufgaben sind ab Formnaro 0.131.0 in der Laborvorlage „30 Übungsfunktionen“ registriert. Ausführungs- und Kalibrierbelege stehen in KI-LABOR-AUSWERTUNG-2026-11-06.md. Die untenstehenden Anforderungen bleiben die Spezifikation; die ursprüngliche Vorbereitung ist nachfolgend dokumentiert.

Ursprünglicher Stand 05.11.2026. Ergänzung zu den sieben vorhandenen Aufgabenfamilien. Diese Fälle sind **vorbereitete Testspezifikationen**: Sie sind noch nicht in der laufenden EXE als ausführbare Aufgaben registriert und ihre sichtbaren Bedienwege wurden noch nicht sämtlich erprobt. Eine geometrische Referenz, das isolierte Ausgangsmodell und ein unabhängiger Prüfer müssen für jeden Fall vor dem Start eingerichtet und mit richtigen sowie absichtlich falschen Ergebnissen getestet werden.

Für jeden Versuch: frisches isoliertes Übungsprojekt, aktuelle Revision und dokumentierte Startauswahl. Das nicht betroffene Schutzteil bleibt erhalten. Die Aufgabe darf nicht die fertige Befehlsfolge oder den Prüfer enthalten. Aufzeichnen: tatsächliche UI-Aktionen, Modell-/Überwacherverlauf, Fehler, Zeiten, Verbrauch beider Agenten und Endzustand. Eine abgeschlossene Vorführung genügt nicht; die nachfolgenden Pflichtbedingungen müssen unabhängig geprüft werden. Nicht unterstützte oder nicht erreichbare UI-Wege als solche erfassen, nicht durch direkte Modellieraufrufe ersetzen.

| Nr. | Funktion und Ausgangszustand | Auftrag | Unabhängige Pflichtprüfung |
|---:|---|---|---|
| 1 | `tool:mode-translate`: einzelner Quader 20×10×8, Mitte (0,0,4) | Um 15 mm in Welt-X verschieben. | Mitte (15,0,4), Größe unverändert; Schutzteil unverändert. |
| 2 | `tool:mode-rotate`: Quader 30×10×8, Mittelpunkt (0,0,4) | Um die eigene Z-Achse 90° drehen, Mittelpunkt erhalten. | Transformation und Orientierung prüfen; Welt-XY-Ausdehnung 10×30; Mitte und Volumen erhalten. |
| 3 | `tool:mode-scale`: Zylinder Ø16×80, Mittelpunkt (0,0,40) | Durchmesser auf Ø14 ändern, Länge und Mittelpunkt erhalten. | Größe 14×14×80; Mittelpunkt (0,0,40); natives Volumen π·7²·80. |
| 4 | `tool:duplicate`: einzelner Quader 10×8×6 | Duplizieren und Kopie 25 mm in X versetzen. | Zwei getrennte Körper gleicher Form; Original bytegleich; Mittelpunkte 25 mm auseinander. |
| 5 | `tool:copy`, `tool:paste`: ausgewählter Zylinder | Kopieren und einfügen; Kopie an X30 setzen. | Zwei getrennte Körper mit gleichen Maßen; ursprüngliche Quelle erhalten; Position Kopie prüfen. |
| 6 | `tool:mirror`: asymmetrischer L-förmiger Körper | Duplizieren, Kopie an Welt-YZ-Ebene spiegeln. | Original erhalten; spiegelbildliche Punkt-/Volumenproben, korrekte Lage und Stückzahl. |
| 7 | `tool:align`: zwei unterschiedlich große Quader | Den beweglichen Quader an der Y-Mitte des Referenzkörpers ausrichten. | Gemeinsame Y-Mitte innerhalb Toleranz; Referenz und andere Koordinaten unverändert. |
| 8 | `tool:center`: zwei gemeinsam ausgewählte Körper | Die gemeinsame Gruppe mittig zur Welt-XY-Mitte setzen, Unterkante auf Z0. | Gemeinsame Bounds-Mitte XY=(0,0), min Z=0; relativer Abstand und beide Formen erhalten. |
| 9 | `tool:drop`: Quader oberhalb der Grundebene | Auf die Grundebene absetzen. | Unterkante Z0, XY-Lage und Maße erhalten. |
| 10 | `tool:array`: einzelner Quader | Fünf Körper einschließlich Original in X-Richtung mit je 12 mm Abstand erzeugen. | Anzahl fünf, Abstände, Orientierung und unverändertes Original prüfen. |
| 11 | `tool:array`: einzelner Zylinder | Sechs Körper einschließlich Original gleichmäßig auf Kreisradius 20 mm um Weltmittelpunkt (0,0,5) anordnen; Original bei (20,0,5) als Startposition erhalten. | Sechs Mittelpunkte, Radius und 60°-Abstände; ursprünglicher Körper erhalten. |
| 12 | `tool:group`: zwei überlappende Quader | Beide geometrisch vereinigen. | Ein gültiger nativer Körper; Volumen = Summe abzüglich Überlappung; Quellen soweit unterstützt erhalten. |
| 13 | `tool:cut`: Platte und geschlossener rechteckiger Ausschnitt | Einen 10×8-mm-Durchbruch vollständig durch eine 40×30×8-Platte schneiden. | Außenmaße, Durchgang und Position unabhängig messen; Volumen 9600−640 mm³. |
| 14 | `tool:drill`: Platte 40×30×8 | Mittige Durchgangsbohrung Ø6 setzen. | Achse, Durchmesser und Tiefe nativ prüfen; Außenmaße und Lage erhalten. |
| 15 | `tool:round`: geeigneter Quader | Eine ausdrücklich markierte Außenkante mit Radius 2 mm verrunden. | Ausgewählte Kante und Rundungsradius nativ prüfen; Körper gültig, unbeteiligte Quelle erhalten. |
| 16 | `tool:chamfer`: geeigneter Quader | Eine ausdrücklich markierte Außenkante um 1 mm fasen. | Fasenfläche und Abstand nativ messen; richtige Kante und gültiger Körper. |
| 17 | `tool:cad-shell`: Quader 40×30×20 | Oben öffnen; Wand und Boden je 2 mm. | Öffnung oben, vier Wände und Boden per nativen Messungen; Außenmaße erhalten. |
| 18 | `tool:cad-face-offset`: Quader mit identifizierter ebener Seitenfläche | Nur diese Fläche um 2 mm nach außen versetzen. | Gewünschte Wandlage um 2 mm geändert, gegenüberliegende Fläche und unbeteiligte Körper erhalten. |
| 19 | `tool:sketch`, `tool:extrude`: leeres Übungsprojekt | Rechteck 40×30 mit mittigem Kreisloch Ø10 skizzieren und 5 mm extrudieren. | Editierbare Skizze mit Außen- und Innenkontur; Durchgang, Außenmaße und Volumen prüfen. |
| 20 | `tool:edit-sketch`: vorhandene editierbare rechteckige Skizze | Breite von 40 auf 50 mm ändern, Tiefe, Extrusionshöhe und Mittelpunkt erhalten. | Skizzenquelle bleibt editierbar; neue Breite 50, übrige Maße und Lage wie vorgegeben. |
| 21 | `tool:drawing`: ausgewählter Körper | A4-Blatt mit Vorder-, Drauf- und Seitenansicht und Titel „Übungsteil“ erstellen. | A4, Titel, drei tatsächlich aktualisierte Projektionen auf den richtigen Körper; Ausgangskörper unverändert. |
| 22 | `tool:measure`: Platte mit bekannter Breite 40 mm | Die Breite anzeigen und nennen, ohne die Geometrie zu ändern. | Gemessener Wert 40 mm; unveränderter Projektzustand und keine ungeprüfte Behauptung. |
| 23 | `tool:hide`, `tool:show-all`: zwei Körper | Einen Körper ausblenden und wieder einblenden. | Sichtbarkeitsstatus wechselt korrekt; keine Geometrie oder Quelle gelöscht. |
| 24 | `tool:lock`: zwei Körper | Einen Körper sperren und anschließend entsperren. | Sperrstatus wechselt; keine unautorisierte Geometrieänderung. |
| 25 | `tool:isolate`, `tool:end-isolation`: drei Körper | Einen Körper isoliert anzeigen und danach Gesamtansicht wiederherstellen. | Sichtbarer Umfang während/nach Isolation; alle Modellknoten und Geometrie erhalten. |
| 26 | `tool:undo`, `tool:redo`: Quader und eine durchgeführte Verschiebung | Änderung rückgängig machen und wiederholen. | Vorher-, Undo- und Redo-Zustände sowie Undo-Tiefe entsprechen den tatsächlich ausgeführten Aktionen. |
| 27 | `tool:view-front`, `tool:view-top`, `tool:fit`: bestehendes Modell | Vorderansicht, Draufsicht und Einpassen zeigen. | Kamerazustände und sichtbares Ziel prüfen; Projektgeometrie unverändert. |
| 28 | `tool:workplane-top`, `tool:reset-plane`: geeigneter ausgewählter Quader | Arbeitsebene auf Oberseite setzen und anschließend Grundebene wiederherstellen. | Ebenenmatrix und Höhenlage vor/nach jeder Aktion; keine Modelländerung. |
| 29 | `tool:split`: geeigneter geschlossener Quader | An der mittigen Ebene in zwei Körper teilen. | Zwei gültige Körper, jeweils halbes Volumen, gemeinsame Schnittebene und Erhalt der Gesamtform. |
| 30 | `tool:joints`: zwei getrennte geeignete Körper | Ein Drehgelenk um die vorgegebene Z-Achse anlegen und um 30° bewegen. | Echtes Gelenk, richtiger Eltern-/Kindbezug, Achse und gemessene Bewegung; keine Kollisionsfreiheit behaupten. |

## Priorisierung und Ausführung

Zuerst Fälle 1–4, 7, 9–11, 14, 17 und 19 als überschaubare Referenzgruppe mit möglichst klaren nativen Prüfungen. Danach Schnitt, Kanten, Skizzenänderung, Zeichnung, Mechanik und UI-Zustände. Exporte, beliebige Dateidialoge und Betriebssystemaktionen werden nicht als im Übungsfenster automatisch verfügbar angenommen. Für Kanten, Flächen und Gelenke vorab echte geometrische Zielbezüge erstellen; wenn der Übungsmodus sie nicht sichtbar ansteuern kann, ist das ein Funktionsbefund und kein Grund für einen versteckten API-Ersatz.

Für einen vollständigen Vergleich zunächst jede Aufgabe mindestens auf `low`, `high`, `max` mit einer konstanten Startvariante ausführen (90 Versuche bei 30 Fällen). Erst danach gezielte Kontext-/Bildvarianten ergänzen. Ein anderes Maß oder eine andere Position wird für eine spätere Bestätigungsgruppe vorab festgelegt. Die aktuell laufende Kampagne bleibt eine eigene, unveränderte Vergleichskohorte.
