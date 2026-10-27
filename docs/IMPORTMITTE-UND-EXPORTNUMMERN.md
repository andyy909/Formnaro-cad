# Importmitte und Exportnummern · Formnaro 0.60.0

Beim Import wird die Mitte der gesamten Datei auf die Mitte des Grundrasters
gesetzt. Die Unterkante liegt auf Z = 0. Weitere Importe folgen jeweils um
15 mm in X und Y versetzt. Löschen und Gruppieren setzen die laufende
Zählung nicht zurück. Vorhandene importierte Teile werden berücksichtigt;
mehrteilige Dateien zählen während der Sitzung als ein Import. Nach erneutem
Öffnen zählen die gespeicherten importierten Wurzelteile als vorhandene Importe.
Die Platzierung vermeidet sehr entfernte Quelldateikoordinaten; sie ist keine
automatische kollisionsfreie Anordnung. Große Modelle können sich überlappen.

STL, OBJ, STEP/STP, SVG und die Austauschformate 3MF, GLB und glTF verwenden
denselben Platzierungsschritt. Mehrere Teile einer Datei werden gemeinsam
verschoben; ihre Abstände und Höhenunterschiede bleiben erhalten. Netzpunkte,
native BRep-Körper, Rezepte und Quellen bleiben in ihren ursprünglichen
Koordinaten gespeichert. Nur die Lage wird verschoben. Import und Platzierung
erzeugen zusammen einen Rückgängig-Schritt. Projektdateien werden wie gespeichert
geöffnet, ohne ihre Modelle automatisch zu verschieben.

**Zur Mitte** steht in der festen Bearbeitungsleiste und in Easy Tinker.
Ein Teil auswählen und den Knopf drücken. Bei mehreren ausgewählten Teilen
wird die gemeinsame Mitte zentriert und die gemeinsame Unterkante auf Z = 0
gesetzt. Das gilt auch bei verschobener oder gedrehter Arbeitsebene. Die
Ansicht passt die Auswahl ein. Gesperrte Teile und Container bleiben gesperrt;
die Verschiebung lässt sich rückgängig machen.

Modell-Exporte schlagen zunächst den bisherigen Dateinamen vor, danach
beispielsweise `Gehäuse2.stl`, `Gehäuse3.stl`, `Gehäuse4.stl`.
Jeder Name mit Dateiendung hat eine eigene Serie. Der zuletzt gewählte Ordner,
eine manuell gewählte Namensbasis und die nächste Nummer werden in der
portablen Einstellung `export-series.json` gespeichert. Die Serien überstehen
einen Neustart. Bereits vorhandene Folgenamen im gemerkten Ordner werden
übersprungen. Abbruch und fehlgeschlagenes Speichern verbrauchen keine Nummer.
Der Dateidialog erlaubt weiterhin einen anderen Namen oder Ordner.

Die Nummerierung betrifft die Modell-Exporte einschließlich SVG und OBJ-Bündeln.
Projekt-, Einstellungs- und andere Hilfsdateien behalten ihre bisherigen
Speicherabläufe. Die Einstellung enthält lokale Dateipfade und gehört nicht in
ein Weitergabepaket. Browserdownloads zählen innerhalb der laufenden Sitzung;
sie können vorhandene Dateien im Downloadordner nicht prüfen.

Die Änderungen betreffen die große Formnaro-Ausgabe. Mini, Mini CAD und Android
bleiben eigenständige Ausgaben. Projektformat und lokale Modell-API bleiben
unverändert; direkte Automationsbefehle behalten ihre ausdrücklich angegebenen
Koordinaten.
