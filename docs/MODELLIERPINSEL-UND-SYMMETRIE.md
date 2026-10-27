# Modellierpinsel und Symmetrie

Formnaro 0.58.0 ergänzt im großen Programm unter **Netz-Werkzeuge →
Modellierpinsel und Symmetrie …** fünf Pinsel für bearbeitbare Netze.

1. Ein sichtbares, entsperrtes vollständiges Netzteil auswählen. Native CAD-Körper
   bei Bedarf zuvor ausdrücklich mit **CAD als Netzkopie** kopieren.
2. Pinsel, Radius in Weltmillimetern und Stärke einstellen. Auftragen/Abtragen
   verschiebt die Oberfläche entlang ihrer örtlichen Normalen. Verschieben zieht
   die Ansatzstelle in der Bildschirmfläche. Abflachen nähert die Oberfläche an
   die Tangentialebene am ersten Ansatzpunkt; Glätten mittelt lokale Nachbarn.
3. Mit gedrückter linker Maustaste auf dem Netz zeichnen. Rechts drehen und mit
   dem Mausrad zoomen bleibt möglich. Nach Loslassen wird die Vorschau geprüft.
4. Weitere Striche ergänzen, den letzten Strich entfernen oder neu beginnen.
   Original und Ergebnis lassen sich aus derselben Kamera vergleichen.
5. **Übernehmen** bestätigt alle Striche als einen Rückgängig-Schritt.
   **Abbrechen** oder Escape verwirft den Entwurf.

**Symmetrie** spiegelt die Pinselstriche an einer wählbaren Weltebene X, Y oder Z.
Die Ebenenposition wird numerisch angegeben; beim Aktivieren wird die Mitte des
Teils vorgeschlagen. Orange zeigt den direkten Pinsel, Blau seinen Spiegel und
die Ebene. Überlappende Pinsel verdoppeln die Stärke nicht. Ein asymmetrisches
Ausgangsmodell wird durch die Option nicht automatisch symmetrisch. Vorhandene
Schutzbereiche und eine optionale bestätigte Flächenauswahl gelten auf beiden
Seiten unabhängig und können deshalb eine Seite festhalten.

Schutzflächen, nicht ausgewählte Flächen und offene Ränder bleiben geometrisch
exakt erhalten. Nach einer Änderung erhalten Schutzbereiche einen passenden
Geometriebezug. Die höchste Verschiebung gilt gegenüber dem Original über die
ganze Sitzung, im Weltmaß und auch bei Skalierung, Spiegelung oder Scherung.
Die Originalquelle und das Pinselrezept bleiben im Projekt erhalten.

Die erste Ausbaustufe verformt die vorhandenen Dreiecke; sie fügt keine neue
Vernetzung und keine neuen Löcher hinzu. Grobe Netze vorher gezielt mit dem
vorhandenen Neuvernetzungswerkzeug unterteilen. Bis zu 30.000 Dreiecke,
120.000 gespeicherte Punkte, 16 Striche und insgesamt 128 Ansatzpunkte je
Vorschau. Ein größerer Radius hilft, wenn kein beweglicher Netzpunkt getroffen
wird. Der Pinsel wirkt auf zusammenhängende, passend orientierte Flächen in
seinem räumlichen Radius; bei eng gefalteten Flächen den Radius klein wählen.

Geometrische Prüfungen begrenzen Bewegungen vor Flächenüberschlägen und
Selbstüberschneidungen innerhalb des bearbeiteten Netzes. Zu schwierige,
mehrdeutige oder zu aufwendige Fälle werden abgewiesen. Kollisionen mit anderen
Projektteilen werden dabei nicht geprüft. Ein geschlossenes Ausgangsnetz muss
auch nach der Bearbeitung die Materialkörperprüfung bestehen. Offene Oberflächen
bleiben offene Oberflächen. Die Funktion verändert Form und gegebenenfalls
Volumen; sie ist keine Festigkeits-, Passungs- oder Druckprüfung.

Die vorhandenen Projekt-/Arbeitsplatzformate bleiben unverändert. Die neuen
Strichrezepte werden in Netzquellversion 3 gespeichert; ältere Programme ohne
dieses Verfahren können solche neuen Projekte nicht lesen. Bestehende Projekte
werden nicht automatisch umgeschrieben. Die Mini-Ausgaben bleiben unabhängig.
