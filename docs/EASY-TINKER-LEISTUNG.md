# Flüssigeres Easy Tinker – Formnaro 0.55.0

Easy Tinker nutzt weiterhin den gemeinsamen CAD-/Netz-Arbeitsplatz. Die
Leistungsverbesserungen stehen daher auch im Normalmodus zur Verfügung.

- Unveränderliche Netzpunkte erhalten einmal berechnete lokale Grenzen für
  Maßfelder und Positionierung. Veränderliche Entwürfe werden weiterhin neu
  gemessen. Der Cache hält keine Modelle dauerhaft fest und gibt keine
  veränderlichen internen Grenzwerte heraus.
- Auswahl und Sichtbarkeit verwenden innerhalb einer Aktualisierung gemeinsame
  Nachschlagetabellen statt wiederholter Suchen durch die ganze Szene.
- Ohne angezeigte Quellen entfällt deren leere Sichtbarkeitsaktualisierung.
- Reine Anzeige-, Mess- und Exportabfragen ohne gesonderten Ausgangsstand
  validieren und identifizieren ihre Eingabe einmal statt zweimal. Getrennte
  Ausgangsstände und alle Bearbeitungsaufträge behalten getrennte Prüfungen.

Die Mausvorschau verändert weiterhin nur die Darstellung. Die bestätigte
Änderung durchläuft die bisherigen Geometrie-, Revisions- und Anzeigeprüfungen
und erzeugt einen Rückgängig-Schritt. Modellformate und Geometriequalität sind
unverändert. Mini ist eine getrennte Anwendung.

Der isolierte Prüfeinstieg `--verify-easy-performance=<Bericht.json>` vergleicht
Auswahl und unveränderte Aktualisierungen an einem synthetischen geschlossenen
Netz mit 49.152 Dreiecken sowie Mehrfachauswahl an 120 CAD-Körpern. Verschieben,
Drehen und Skalieren prüfen zusätzlich erhaltene Anzeigegeometrie und exaktes
Undo/Redo. Laufzeiten hängen von Hardware, Modell und Hintergrundlast ab; die
Messungen sind keine allgemeine Zusage gleicher Geschwindigkeit wie Mini.
