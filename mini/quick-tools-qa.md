# Mini 0.5 – Bibliothek und schnelle Werkzeuge

Nutzerauftrag: Bildbibliothek, präzises Ausrichten, Zweipunkt-Messen,
Reihen/Raster/Lochkreis, Favoriten, Ordner und Notizen in die eigenständige
Mini-Version übernehmen. Großprogramm und große Projektformate bleiben unverändert.

## Umsetzung

- Bibliothek speichert eigene Mini-Modelle getrennt von PNG-Vorschauen und
  Metadaten unter Daten-Mini/Bibliothek. Atomare Veröffentlichung neuer
  Einträge; geordnete Dateizugriffe. UUID-Dateipfade, Größen-/Formatprüfung,
  keine eingebetteten Skripte oder externen Bilder. Dateiverknüpfungen abgelehnt.
- Übersicht liest nur Metadaten, lädt höchstens zwölf gespeicherte Bilder pro
  Seite und berechnet keine Bibliotheksmodelle. Favoriten, Suche nach Name/Ordner,
  Name/Ordner/Favorit bearbeiten. Öffnen ersetzt das Projekt, Einfügen erneuert
  rekursiv alle IDs. Beide Änderungen können rückgängig gemacht werden.
- Vorschaubild einmal beim Speichern aus ausgewählten sichtbaren Netzen in
  einer separaten Szene erzeugt. Hauptkamera, Auswahl, Quellen und Undo bleiben
  unverändert. Farben im sRGB-Ausgaberaum, Bild 256 × 192.
- Ausrichtung anhand tatsächlicher transformierter Netzpunkte: Minimum/Mitte/
  Maximum entlang X/Y/Z, optional festes ausgewähltes Bezugsteil.
- Zweipunkt-Messen trifft Oberfläche/Grundebene und fängt nahe Ecken. Keine
  Kantenfang-Zusage. Abstand und XYZ-Differenz, nur zweites entsperrtes anderes
  Teil entlang der gemessenen Richtung verschieben. Gleiche/zusammenliegende
  Punkte werden nicht als gerichteter Verschiebeauftrag angenommen.
- Reihen, Raster und Kreise erzeugen getrennte Kopien einschließlich ihrer
  Parameter und Quellen. Original bleibt stehen. Kreismittelpunkt und Achse
  frei, Radius durch Originalposition bestimmt. Vollkreis ohne Doppelkopie am
  Ende, Teilkreis mit Endpunkt. Vorab begrenzt auf 200 Teile im ganzen Projekt.
- Teileordner sind einfache Zuordnungen ohne Vereinigung oder Verschachtelung.
  Suchfeld findet Name, Ordner und Notizen. Notizen bis 4.000 Zeichen.
- Keine neue Laufzeitabhängigkeit, Format bleibt Formnaro-Mini Version 1.
  Keine automatische Übernahme nativer CAD-Projekte der großen Anwendung.

## Abnahme

28 Unit-Gruppen; Desktopprüfungen mit nativen Mausereignissen und tatsächlichen
Dateizugriffen. Der abschließende Quell- und EXE-Nachweis enthält jeweils
67 Prüfpunkte, darunter gespeicherte Quellen, echte PNG-Pixel, unveränderte
Kamera/Undo beim Speichern, Wiederöffnen nach Neustart, Favoriten und Umbenennen,
14 Einträge über zwei Seiten, Einfügen mit rekursiv neuen IDs, ein Undo-Schritt
pro Modelländerung, fehlerhafte Einträge und Projektgrenzen.
Alle bestehenden Griff-, Export-, Navigation- und Oberflächenprüfungen bleiben
Teil derselben Abnahme. Belege außerhalb des Quellarchivs unter work.

Quellbilder der ersten Abnahme visuell geprüft: lesbare Bildkarte mit
Lochplatte und ihren vier Löchern, getrennte Öffnen-/Einfügen-Aktionen,
Messlinie zwischen tatsächlich angeklickten Oberflächenpunkten, Abstandsfeld
und eindeutige Aktion für das zweite Teil. Abschließende Bilder erneut prüfen.
