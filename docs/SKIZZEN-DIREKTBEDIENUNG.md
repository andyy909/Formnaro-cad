# Direkte Bedienung von Skizzenbedingungen

Neue Skizzen öffnen in **Einfach** mit den bisherigen Kontur- und Maßfeldern.
**Erweitert** bietet eine größere Zeichenfläche, direkte Linienwerkzeuge und
**Abhängigkeiten**. Vorhandene Profilskizzen öffnen in **Erweitert**.
Beim Wechsel bleibt der Entwurf mit seinen Maßen und Bedingungen erhalten.
Rasteranzeige, Rasterfang und der Fang an vorhandenen Punkten sind getrennt schaltbar.

Beim Aufziehen stehen Breite und Höhe, Radius oder Länge direkt an der Form.
Nach dem Loslassen öffnet ein Klick auf das Maß die Eingabe in Millimetern.
**Kontur verschieben** zeigt ΔX und ΔY mit Vorzeichen direkt an der
Zeichenebene. Nach dem Ziehen die Maßschilder anklicken, um den gesamten
Versatz ab Zugbeginn zu korrigieren. Die Korrekturen gehören zum selben
Entwurfs-Undo wie der Zug.
**Größe ändern** zeigt den Durchmesser eines Kreises oder Breite und Höhe
eines achsenparallelen Rechtecks. Den Kreisrand oder einen Rechteck-Eckgriff
ziehen und anschließend am Maßschild den Zielwert setzen. Kreismitte
beziehungsweise gegenüberliegende Ecke bilden den Bezug.
Direkte Maßfelder akzeptieren auch kurze Rechnungen wie `/2` oder `*1,5`.
**Kreis durch 3 Punkte** erzeugt aus drei Punkten auf dem Rand einen
gewöhnlichen editierbaren Kreis.
Bei **Ausrichten** erst einen Punkt der Kontur wählen, dann einen Bezugspunkt
oder den Ursprung. Die Achsenwahl legt fest, welche Koordinaten sich ändern.

**Linie** zeigt den nächsten Abschnitt am Mauszeiger. Enter beendet den Linienzug
offen. Ein Klick auf den Startpunkt schließt ihn. Bei **Linie trimmen** und
**Linie verlängern** zuerst am gewünschten Linienende klicken, danach an der
Schnittgrenze. Aktive Maßbindungen können vor dem Bearbeiten gelöst werden.

**Abhängigkeiten** öffnet die direkten Werkzeuge für ausgewählte Elemente.
Maße für Länge, Abstand, Winkel und Radius erscheinen auf der Zeichenfläche.
Ein Doppelklick öffnet das Feld für den Wert oder die Formel. Enter übernimmt
und löst die betroffene Gruppe. Escape verwirft den Eingabeentwurf.
Ein nicht lösbares Maß setzt den letzten gültigen Skizzenentwurf wieder ein.

Mit „Punkte wählen / ziehen“ Elemente oder Punkte anklicken; Umschalt oder Strg
fügt Elemente beziehungsweise Punkte zur Auswahl hinzu. Passende Auswahlbezüge
werden in den vorhandenen Bedingungsfeldern vorbelegt. Die Auswahl ersetzt nicht
die ausdrückliche Wahl und Bestätigung der Beziehung. Ein Klick auf einen Eintrag
in der Bedingungsliste hebt dessen Elemente hervor; gewählte Elemente heben ihre
zugehörigen Listeneinträge hervor. Widersprüche markieren betroffene Elemente rot.

Die Anzeige freier Koordinaten betrifft die gerade gelöste Gruppe; sie ist kein
Nachweis für die vollständige Bestimmtheit aller Gruppen einer Skizze. Der
vorhandene Solver mit seinen Budgets, das Lösen beim Loslassen und die getrennte
3D-Vorschau bleiben unverändert. Maßbeschriftungen können bei eng benachbarter
Geometrie überlappen; für solche Fälle stehen die bisherigen Listen zur Verfügung.
