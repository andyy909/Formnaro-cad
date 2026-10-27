# Aushöhlen mit Originalvergleich – Paket 26

Formnaro 0.49.0 höhlt einen geschlossenen Netzkörper innen aus. Die angegebene
Wandstärke und die Auflösung werden in Weltmillimetern ausgewertet. Bis zu acht
Ablauföffnungen können die neue innere Höhlung mit der Umgebung verbinden.
**Als neues Teil übernehmen** legt ein neues Objekt an; das vollständige Original bleibt erhalten.

## Bedienung

1. Im Modus **Normal** einen sichtbaren, entsperrten, geschlossenen Netzkörper
   auswählen und **Netz-Werkzeuge → Netzkörper aushöhlen …** öffnen.
2. **Wandstärke** und **Auflösung** einstellen. Eine kleinere Rasterweite erfasst
   die Innenform feiner, benötigt jedoch mehr Rechenarbeit. Dünne Bereiche werden
   erhalten, wenn sie keinen sicher nachweisbaren inneren Hohlraum erlauben.
3. Bei Bedarf **Ablauföffnung ergänzen** verwenden. Mittelpunkt und Richtung
   beziehen sich auf einen endlichen Zylinder in Weltkoordinaten: Der Mittelpunkt
   liegt in der Mitte seiner gesamten Länge. Durchmesser und Länge einstellen.
   Ein Zylinderende muss sicher außerhalb des Originals und das andere sicher in
   der neuen Höhlung liegen. Die gesamte geprüfte Endscheibenhülle muss passen;
   ein bloßer Kontakt an einem Punkt genügt nicht. Unpassende Öffnungen werden
   abgewiesen. Die Richtung lässt sich per Achse oder drei Komponenten festlegen.
4. **Vorschau** berechnen. Bericht zu Materialvolumen, Innenhöhlung, Wandstärke,
   Rastertoleranz und Öffnungen lesen. **Original**, **Ergebnis** und
   **Überlagerung** nutzen dieselbe Kamera. Die **Schnittansicht zum Innenraum** zeigt die tatsächlich
   erzeugten Innenflächen; ihre Achse und Weltposition beeinflussen nur die
   Darstellung. Die Zylinderanzeige hilft beim Ausrichten der Ablauföffnungen.
5. **Als neues Teil übernehmen** ergänzt genau eine neue Kopie und einen Rückgängig-Schritt.
   **Abbrechen** und Escape verwerfen den Entwurf ohne Projektänderung. Original
   und Ergebnis bleiben danach sichtbar; zum Einzelvergleich ihre Sichtbarkeit
   im Objektbaum einstellen.

Zum Export nur die neue Hülle auswählen und den Exportumfang **Auswahl** wählen.
Ein Export aller Teile enthält auch das erhaltene massive Original.

## Wandstärke, Auflösung und Grenzen

Das Verfahren berechnet einen konservativ zurückgesetzten inneren Hohlraum aus
Abständen zur Originaloberfläche. Der Bericht nennt den nachgewiesenen unteren
Wandstärkenwert und den zusätzlichen Näherungsspielraum. Das Raster kann die
Innenform gröber machen und dickere Wände erzeugen. Die Ablauföffnungen entfernen
absichtlich Wandmaterial; für ihre Flächen gilt keine durchgehende Wandstärke.
Dies ist keine Druckbarkeits- oder Festigkeitsprüfung.

Das Ausgangsnetz muss ein einzelner gesunder geschlossener positiver
Materialkörper sein. Offene, beschädigte, mehrdeutige oder ungeeignet verschachtelte
Eingaben, geschützte Teile, native CAD-Teile und Lochformen werden abgewiesen.
Eine Flächenauswahl begrenzt das Werkzeug nicht. Schutzbereiche werden niemals
stillschweigend entfernt. Das Programm repariert die Quelle bei diesem Auftrag
nicht automatisch.

Zu feine Raster, überschrittene Arbeitsbudgets, ein fehlender innerer Hohlraum,
nicht verbundene Öffnungen und numerisch unklare Ergebnisse brechen sicher ab.
Das Ergebnis muss die unabhängige geschlossene positive Körperprüfung bestehen.
Das Original und alle unbeteiligten Objekte bleiben unverändert.

Die Vorschau und ihre Schnittansicht sind flüchtig und gelangen nicht in Projekt oder
Export. Für neue Einstellungen einen neuen Entwurf berechnen; nach Übernehmen
bei Bedarf Rückgängig verwenden. Das Netzquellrezept Version 3 mit `hollow`
speichert die vollständige Originalquelle und die gebundenen Maße, Lage und
Ablauföffnungen. Historische Geometrieänderungen sind gesperrt. Projektformat 8
und Arbeitsplatzformat 4 bleiben bestehen.

## Separate Ausgabe und Nachweise

Easy Tinker verwendet dasselbe Projekt und dieselbe Änderungshistorie.
Aushöhlen befindet sich im Modus Normal. Die getrennte Ausgabe liegt unter
`F:/Formnaro-Ausgaben/Aushoehlen-v0.49.0/Formnaro-win32-x64/Formnaro.exe`.
Die ZIP vollständig separat entpacken und `App/Formnaro.exe` starten. Quellen,
passende Kernelquellen, Lizenzen, Anleitungen und synthetische Prüfteile liegen
bei. Vorige Ausgaben bleiben erhalten. Verbindliche Abschlussnachweise sind
`work/mesh-hollow/checks/final-audit.json` und `delivery.json`; erst beide
bestätigen die fertig geprüfte Ausgabe.
