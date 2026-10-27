# Maßlinien beim Verschieben

Formnaro 0.75.0 zeigt beim Ziehen eines ausgewählten Objekts die zurückgelegten
Abstände X und Y direkt auf der aktiven Arbeitsebene an. Hilfslinien verbinden
die Ausgangs- und Zielposition; Pfeile und Millimeterwerte mit zwei
Nachkommastellen zeigen die Verschiebung. Negative Richtungen tragen ein Minus.

Die Werte gelten relativ zum Beginn des aktuellen Ziehens und berücksichtigen
das eingestellte Raster. Sie sind keine absoluten Positions- oder Größenmaße.
Die Anzeige funktioniert in Normal und Easy Tinker, für CAD- und Netzobjekte,
mehrere ausgewählte Teile und bearbeitbare Gruppenquellen. Bei geneigten
Arbeitsebenen beziehen sich X und Y auf deren Achsen. Auch die vorhandenen
Verschiebepfeile zeigen die Abstände in der Arbeitsebene an.

Beim Loslassen verschwinden die Maßlinien. Die Bewegung bleibt wie bisher ein
Rückgängig-Schritt; Escape oder ein abgebrochener Zeigerkontakt verwerfen die
Vorschau. Ein Auswahlklick ohne Ziehen öffnet keine Verschiebemaße. Beim Ziehen
der Größengriffe erscheinen weiterhin Breite, Tiefe und Höhe.

Die Anzeige projiziert die ursprüngliche Auswahlbegrenzung und die tatsächlich
verwendete Transformationsmatrix. Sie fragt keinen Geometriekern ab und ändert
keine Projekt-, Quellen- oder Exportdaten. Beim Loslassen, Abbrechen und
Entfernen der Ansicht wird sie beendet. Kein neues Dateiformat und keine neuen
Einstellungen erforderlich.
