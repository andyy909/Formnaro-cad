# Echtes selektives Laden mit .fnpack

`.fnpack` ist ein eigenständiges Formnaro-Geometriepaket. Es enthält einen Index, alle benötigten Geometrieblöcke und die Instanzen mit ihren eigenen Kennungen und vollständigen Transformationen. Identische gespeicherte Geometrie belegt nur einen Block. Die ursprüngliche STEP-Datei wird zum Wiederöffnen, Nachladen, Speichern oder Exportieren nicht benötigt.

## Paket erstellen und öffnen

1. Das Modell wie bisher erzeugen oder importieren. Der erste STEP-Import verwendet weiterhin den vorhandenen vollständigen Parser.
2. Bei Bedarf unter **Ansicht & Prüfen** zunächst **Nur Auswahl vollständig darstellen** wählen. Dieses Ladeset wird mitgespeichert.
3. Unter **Projekte** auf **Als Geometriepaket (.fnpack) speichern …** klicken.
4. Die Paketdatei über **Öffnen** oder die Projektübersicht öffnen. Das normale Speichern bleibt anschließend beim Paketformat; **Speichern unter** erzeugt eine weitere eigenständige Datei.

Beim Öffnen liest Formnaro zunächst nur Paketkopf und Index. Anschließend liest und vernetzt es die Teile des gespeicherten Ladesets, soweit sie sichtbar sind. **Teil nachladen** liest die angeforderten Wurzelteile mit ihren erhaltenen Quellen. **Alles darstellen** fordert alle sichtbaren Teile an. Sichtbarkeit, Ladeset und bereits zwischengespeicherte Geometrie sind getrennt. Bereits gelesene identische Blöcke werden zwischen Instanzen geteilt.

Ausgelassene sichtbare Teile bleiben auswählbare Begrenzungsrahmen. Auswahl und Kamerabewegungen laden keine Geometrie. Die Rahmen verwenden die gespeicherten Kataloggrenzen; sie sind keine neue native Geometrieprüfung und liefern kein neu gemessenes Volumen. Geometrische Bearbeitungen und Messungen laden ihre erforderlichen Teile und Quellen vor der Berechnung. Einfache Darstellungsänderungen benötigen dafür keine fremden Teile.

## Quellen, Speichern und Export

Quellenbäume, Skizzenbedingungen und Maßformeln, Parameter, Verknüpfungen, Zeichnungen, Gelenke, Sperren sowie affine Platzierungen bleiben erhalten. Das Dateiformat ändert keine Geometriegenauigkeit und ersetzt keine BReps durch Anzeigedreiecke.

Speichern übernimmt auch nie geladene Blöcke. Diese werden gestreamt und anhand ihrer Prüfsummen geprüft, ohne sie als gesamte Modellgeometrie in den Renderer zu laden. Erst eine vollständig geschriebene und synchronisierte temporäre Datei ersetzt die Zieldatei atomisch. Fehlende oder beschädigte benötigte Blöcke brechen die Ausgabe ab; die bisherige Zieldatei und das bestätigte Modell bleiben erhalten.

Der Gesamtexport bleibt vom Ladeset unabhängig. Er lädt den vollständigen erforderlichen Materialumfang oder bricht ab. STEP verwendet wie bisher sichtbares natives CAD-Material; ein unbeteiligter ausgelassener Netzblock ist dafür nicht erforderlich. STL und die weiteren Netzformate berücksichtigen den jeweils unterstützten sichtbaren Materialumfang. Der Export ändert weder das Ladeset noch den Modell-Undo-Verlauf.

Eine ausdrücklich gewählte gewöhnliche `.ocad`-Ausgabe materialisiert die erforderlichen gespeicherten Modelldaten vollständig. Ein bloßer JSON-Katalog mit ungelösten Blockverweisen wird nicht als eigenständige `.ocad`-Datei geöffnet. Persönliche Vorlagen und kopierte Teile enthalten vollständige ausgewählte Quellen und hängen anschließend nicht von privaten Paketverbindungen ab.

## Wiederherstellung und Grenzen

Paket-Autosicherungen sind selbstständige Dateien unter `Daten/Paket-Autosicherung.fnpack`. Der portable Marker `autosicherung-auswahl.txt` wählt zwischen dieser Sicherung und der bisherigen gewöhnlichen Projektsicherung. Alte Autosicherungen werden dabei nicht überschrieben. Beim normalen Schließen wartet die Anwendung auf die atomische Paket-Autosicherung. Ein beschädigter vorhandener Sicherungsstand sperrt automatische Ersatzschreibvorgänge, damit seine ursprünglichen Daten erhalten bleiben.

Vor dem Überschreiben einer geöffneten Paketquelle können private Kopien unter `Daten/Paketquellen` die Blöcke älterer Undo-Zustände erhalten. Wiederverwendbare Quellen werden zusammengeführt; die privaten Kopien werden nach Abschluss ihrer Zugriffe beim Schließen aufgeräumt. Verbindungsdateien und Zugriffstoken gehören weder in den Paketindex noch in Geometrieblöcke.

Das Paketformat verwendet Version 1 und Modellkataloge der Projektversion 17. Die bisherigen Projektversionen 5 und 7–16 bleiben lesbar. Die vorhandenen Grenzen von 500 Wurzelteilen und 5.000 Quellenknoten gelten weiter. Ein Paket ist auf 2 GiB und sein Index auf 16 MiB begrenzt. Ein BRep-Block darf 12 MiB, ein Netzblock 128 MiB enthalten; die bestehenden Netzpunkt- und Dreiecksgrenzen bleiben erhalten. Der separate Cache für dekodierte Blöcke ist auf ungefähr 128 MiB und 256 Einträge begrenzt. Das ist keine Grenze für den gesamten Anwendungsspeicher. Bis zu 128 unterschiedliche Paketquellen werden pro Sitzung gehalten; unveränderte Geometriequellen werden wiederverwendet.

Diese Beschreibung gehört zu Paket 7. Die vollständige Freigabe wird durch die gesonderten Abnahme-, Abschluss-, Sicht- und Auslieferungsbelege der portablen Ausgabe dokumentiert.
