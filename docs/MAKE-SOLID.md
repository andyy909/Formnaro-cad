# Make Solid mit Originalvergleich – Paket 25

Formnaro 0.48.0 erstellt aus einem Netzteil eine neue geschlossene Annäherung.
Das vollständige Original bleibt als eigenes Objekt erhalten. Kleine Öffnungen,
Bohrungen, schmale Spalten und feine Details können dabei verschwinden; Maße und
Volumen können sich ändern. Die Vorschau dient dazu, diese Folgen zu vergleichen.

## Bedienung

1. Im Modus **Normal** ein sichtbares, entsperrtes Netzteil auswählen.
2. **Netz-Werkzeuge → Make Solid …** öffnen.
3. **Auflösung**, **Schließradius** und **Versatz** in Millimetern einstellen.
   Eine kleinere Auflösung erfasst mehr Details, benötigt aber mehr Rechenarbeit.
   Der Schließradius schließt zusätzliche kleine Zwischenräume. Positiver Versatz
   vergrößert die Annäherung, negativer Versatz verkleinert sie.
4. **Vorschau** berechnen. **Original**, **Ergebnis** und **Überlagerung** aus
   derselben Kameralage vergleichen. Blau zeigt das Original, Orange die neue
   Oberfläche; violette Linien markieren vorhandene offene Originalkanten.
5. Dreiecke, Außenmaße, nachgewiesenes Ergebnisvolumen und beidseitige
   Abweichungsstichproben prüfen. Feinere und gröbere Einstellungen vergleichen.
6. **Übernehmen** fügt genau ein neues Objekt und einen Rückgängig-Schritt hinzu.
   Original und Annäherung sind danach beide sichtbar. Für die getrennte Ansicht
   eines Objekts die Sichtbarkeit im Objektbaum verwenden. **Abbrechen** oder
   Escape verwirft die Vorschau ohne Modelländerung.

Zum Export der Annäherung nur das neue Objekt auswählen und **Auswahl** als
Exportumfang wählen. Ein Export aller Teile enthält auch das erhaltene Original.

## Schutz und Annäherung

Teile mit Schutzbereichen werden ausdrücklich abgewiesen. Make Solid kann
Schutzflächen nicht exakt in eine neue Rasteroberfläche übernehmen. Es entfernt
keinen Schutz stillschweigend und ändert keine geschützte Quelle. Das Werkzeug
verarbeitet ein ganzes Teil; eine Flächenauswahl begrenzt seinen Umfang nicht.
Gesperrte, ausgeblendete, native CAD- oder als Loch markierte Teile sind ungeeignet.

Die Oberfläche wird in einem Raster in Weltmaßen erfasst. Dreiecke sperren die
geschnittenen Rasterzellen; ein begrenzter Schließschritt und eine Außenfüllung
bestimmen anschließend Material. Daraus entsteht eine geschlossene Oberfläche.
Bereits die Rasterauflösung kann kleine Öffnungen schließen, auch bei
Schließradius null. Große Lücken oder offene Blätter können eine dünne geschlossene
Hülle ergeben. Das Verfahren rekonstruiert keine unbekannte ursprüngliche Form.
Es ist kein Aushöhlen und garantiert keine Wandstärken oder Detailerhaltung.

Einzelne Öffnungsprüfpunkte zeigen Material, Luft oder einen unklaren Befund an
geeigneten ebenen offenen Randringen. Ein solcher Punkt beweist niemals, dass
die gesamte Öffnung geschlossen oder erhalten ist. Geschlossene Netze mit echten
Durchgangsbohrungen besitzen dort oft keinen offenen Netzrand. Auch diese
Bohrungen müssen deshalb im Formvergleich geprüft werden.

Die angezeigte Oberflächenabweichung ist eine begrenzte beidseitige Stichprobe,
kein garantierter globaler Maximalfehler. Ein beschädigtes Original hat häufig
kein zuverlässig nachweisbares Volumen; dann bleibt dessen Volumenänderung
ausdrücklich unbekannt. Die neue Annäherung muss die geschlossene positive
Körperprüfung unabhängig bestehen. Dies ist kein allgemeiner Druckbarkeits-,
Kollisions- oder Festigkeitsnachweis.

## Grenzen, Speicherung und Ausgabe

Bis 30.000 Eingangsdreiecke, 120.000 Punkte und 500.000 Rasterpunkte, höchstens
160 Punkte pro Rasterachse. Schließradius und Betrag des Versatzes dürfen jeweils
höchstens drei Rasterweiten betragen. Weitere feste Arbeitsbudgets begrenzen
Erfassung, Füllung und Oberflächenerzeugung; das Ergebnis darf höchstens 150.000
Dreiecke enthalten. Zu feine, numerisch unklare oder nicht sicher prüfbare Fälle
brechen ab und erhalten das Projekt unverändert.

Die neue Kopie übernimmt Lage, Darstellung und Organisation. Ihre Herkunft
verweist auf das unveränderte Original, das zusätzlich vollständig im Rezept
gespeichert wird. Netzquellformat 3 mit `make-solid` benötigt mindestens 0.48.0;
Projektformat 8 und Arbeitsplatzformat 4 bleiben bestehen. Historische
Geometrieänderungen am archivierten Original sind gesperrt. Für andere Parameter
Rückgängig verwenden und neu berechnen.

Easy Tinker verwendet weiter dasselbe Projekt und dieselbe Historie. Make Solid
befindet sich im Modus Normal. Die getrennte Ausgabe liegt unter
`F:/Formnaro-Ausgaben/Make-Solid-v0.48.0/Formnaro-win32-x64/Formnaro.exe`.
Die ZIP vollständig separat entpacken und `App/Formnaro.exe` starten. Quellen,
Lizenzen, Anleitungen und synthetische Prüfteile liegen bei. Vorige Ausgaben
bleiben erhalten. Die verbindlichen Abschlussnachweise sind
`work/mesh-make-solid/checks/final-audit.json` und `delivery.json`.
