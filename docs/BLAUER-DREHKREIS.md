# Blauer Drehkreis

Formnaro 0.77.0 übernimmt die Drehbedienung der Mini-Version. Ein ausgewähltes
Teil erhält drei Drehgriffe mit den Buchstaben X, Y und Z. Einen Griff gedrückt
halten und ziehen: Ein blauer Kreis mit Teilstrichen und der aktuelle Winkel
erscheinen am Teil.

- Innerhalb des Kreises: 15°-Schritte.
- Außerhalb des Kreises: 1°-Schritte für feines Drehen.
- Mit gedrückter Umschalttaste: immer 15°-Schritte.

Loslassen übernimmt die Drehung mit einem Rückgängig-Schritt. Escape bricht ab.
Ein Klick ohne Ziehen ändert nichts. Auch mehrere volle Umdrehungen und negative
Winkel werden angezeigt. Von der Kante betrachtete Drehkreise verwenden wie in
der Mini-Version die Ziehrichtung auf dem Bildschirm.

Die Achsen folgen dem gewählten Koordinatensystem: Welt oder aktive
Arbeitsebene. Gedreht wird um die Mitte der Auswahl. Die Griffe sind auch beim
Verschieben und Ändern der Größe erreichbar und funktionieren in Normal sowie
Easy Tinker mit CAD-Teilen, Netzteilen, Gruppen, Mehrfachauswahl und
bearbeitbaren CAD-Gruppenquellen. Gesperrte und verborgene Teile lassen sich
damit nicht drehen.

Während der Übernahme wird der letzte Vorschauzustand gehalten. Die nächste
Bearbeitung beginnt nach deren Abschluss. Quellgeometrie, Parameter, Spiegelung
und Scherung bleiben erhalten; beim Drehen einer Gruppenquelle wird das
Gruppenergebnis wie bisher nativ neu berechnet. Der Kreis selbst löst keine
zusätzlichen Geometrieabfragen aus und läuft nur während des Ziehens.
