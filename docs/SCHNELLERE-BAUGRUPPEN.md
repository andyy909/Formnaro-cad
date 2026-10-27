# Schnellere Baugruppen – Formnaro 0.76.2

Reine Verschiebungen vollständiger CAD-Teile verwenden die bereits nativ
geprüfte Geometrie, ihre Weltgrenzen und die vorhandenen Anzeigepuffer weiter.
Das gilt auch für mehrere Teile und fertige CAD-Gruppen. Eine Translation
ändert weder Form noch Volumen; die Weltgrenzen werden um denselben Vektor
verschoben. Die Modellprüfung kontrolliert weiterhin die Arbeitsbereichsgrenzen.

Die Wiederverwendung ist an den bestätigten unveränderlichen Projektstand und
dieselbe Anzeigequalität gebunden. Alle anderen gespeicherten Eigenschaften
müssen exakt übereinstimmen. Änderungen an Gruppenquellen, Drehung, Skalierung,
Geometrie, Organisation, Bemaßungen, Teilungen oder gebundenen Arbeitsebenen
gehen weiter durch den nativen Berechnungspfad. Anzeigegeometrie dient nicht
als Geometrienachweis. Die internen Ansichtsbelege halten höchstens zwei Stände.
Nach Undo/Redo und Qualitätswechsel werden übereinstimmende native Szenen- und
Anzeigeabfragen wieder als privater Beleg erfasst; auch ältere wiederhergestellte
Stände benötigen danach keine zusätzliche Berechnung für den nächsten Zug.

Beim Loslassen bleibt die sichtbare Position bis zur Übernahme erhalten. Ein
weiterer Bearbeitungszug beginnt erst, wenn der vorige abgeschlossen und die
aktuelle Ansicht vorhanden ist. Kamerabewegungen bleiben möglich. Bei einem
Fehler werden alte Matrizen nur im noch passenden Modellstand zurückgesetzt.
Eine bereits übernommene neuere Ansicht wird dadurch nicht überschrieben.

Bereits vorhandene Quellansichten werden bei gleicher Auswahl, Modellrevision
und Anzeigequalität wiederverwendet. Eine verspätete Quellantwort ersetzt keine
laufende Mausgeste. Bestätigte interne Projektstände behalten ihre einmal
berechnete Revision; veränderliche Entwürfe werden weiterhin vollständig geprüft.
Dateiformate, Revisionsalgorithmus, Geometrieauflösung und Undo bleiben erhalten.

Die Autosicherung bündelt Modell- und Ansichtsänderungen nach etwa einer Sekunde
Bedienpause. Sie schreibt ausschließlich bestätigte Stände. Beim regulären
Schließen wird der bestätigte Stand weiterhin unmittelbar gesichert. Dadurch
liegt das Schreiben einer großen Projektdatei nicht mehr im Abschluss jedes Zugs.
Auch beim Schließen während einer Berechnung wird der bestätigte Modellstand
gesichert; dabei werden vorübergehende Ansichts-/Werkzeugdaten ausgelassen.

Das erste Öffnen komplexer konvertierter Modelle und echte Formänderungen
können weiterhin länger dauern. Die Verbesserung ersetzt keine Modellgeometrie
durch eine gröbere Darstellung und entfernt keine Baugruppenteile.
