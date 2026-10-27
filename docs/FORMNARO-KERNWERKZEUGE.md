# Kernwerkzeuge direkt in Formnaro · 0.79.0

Formnaro bündelt die vorhandenen Zeichen- und Bearbeitungswerkzeuge in seiner
eigenen Oberfläche. Der zusätzliche SolidCraft-Gesamteditor entfällt.

In **Normal → CAD-Werkzeuge** beginnen; in **Easy Tinker → Zeichnen & Netz**
die erweiterten Werkzeuge gezielt öffnen. Der Easy-Arbeitsbereich **CAD** oder
**Netz** bestimmt den Ergebnistyp der Beispielskizzen.

| Aufgabe | Werkzeug in Formnaro |
|---|---|
| Platte, Ring oder Gehäuserand beginnen | **Beispielskizzen**: Halteplatte, Langlochplatte, Distanzring, Gehäuserand |
| Eigene Kontur zeichnen | Rechteck, Kreis, Linienzug, echte Dreipunktbögen, Langloch, Rundrechteck und mehrere Innenöffnungen |
| Maße anpassen | Lokale benannte Maße und sichere Formeln im Skizzenentwurf; direkte Länge, Winkel, Radius und Durchmesser |
| Kontur bearbeiten | Trimmen, Verlängern, Spiegelkopie und Versatzkopie |
| Ansatz oder Ausschnitt herstellen | **Skizze auf Teilfläche …**, dann Material hinzufügen oder ausschneiden; für CAD und geprüfte geschlossene Netze |
| Technische Netzflächen vermessen | **Netz-Werkzeuge → Formerkennung und Gegenstück → Technische Ebenen und Zylinder …** |
| Zwei Stände vergleichen | **Ansicht & Prüfen → Modelle vergleichen** oder **Vorschau vergleichen** in der Bearbeitung |
| Dreiecke reduzieren | Ebenenvereinfachung und **Gekrümmtes Netz vereinfachen**, mit Auswahl, Schutzflächen und erhaltener Originalquelle |

Eine Beispielskizze öffnet zuerst einen Entwurf. Maße ändern, **Vorschau
berechnen** und prüfen; erst **Extrudieren und hinzufügen** übernimmt das Teil.
Gespeicherte Skizzen über ihre Quellen erneut bearbeiten. Eigene Varianten lassen
sich in der vorhandenen persönlichen Bibliothek speichern und wieder einsetzen.
CAD bleibt CAD, Netz bleibt Netz; ein Anbau oder Ausschnitt erhält Originalteil
und Skizze als Quellen. Die bestätigte Änderung erzeugt einen Rückgängig-Schritt.

Maßformeln beziehen sich auf den jeweiligen Skizzenentwurf. Spiegel- und
Versatzkopien sowie Flächenbezüge sind unabhängige Momentaufnahmen. Es gibt
keinen vollständigen geometrischen Skizzenlöser oder allgemeinen
Abhängigkeitsbaum zwischen Teilen. Loft, Sweep und Shell des früheren
Zusatzeditors sind nicht integriert. Netzanalysen und Vergleichskarten verwenden
begrenzte Messungen; Stichproben belegen keinen globalen Maximalfehler.

Ausführliche Bedienung und Grenzen:
[Skizzen- und Mesh-Werkzeuge](SKIZZEN-UND-MESH-AUSBAU.md).
[Bestehende Projekte mit Zusatzentwürfen](OFFLINE-MODELLIEREN.md) bleiben mit
CAD-Geometrie und eingebetteter Quelle lesbar und speicherbar; die frühere
Editorhistorie ist in dieser Ausgabe nicht editierbar.
