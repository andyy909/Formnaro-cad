# Vereinfachte Baugruppenanzeige

Im Menü „Ansicht & Prüfen“ stehen in Normal und Easy Tinker drei Befehle bereit:

- **Nur Auswahl vollständig darstellen:** Nur die ausgewählten fertigen Teile erhalten eine vollständige Oberfläche. Alle übrigen sichtbaren Teile erscheinen als Begrenzungsrahmen.
- **Teil nachladen:** Die ausgewählten Teile werden zum bisherigen Ladeset hinzugefügt.
- **Alles darstellen:** Alle vorhandenen Teile gehören wieder zum vollständigen Ladeset. Dauerhaft ausgeblendete Teile bleiben ausgeblendet.

Die Auswahl darf auch mehrere Teile oder Quellen verschiedener fertiger Teile enthalten. Eine Quelle lädt dabei ihr fertiges Wurzelteil. Ein Klick in einen Begrenzungsrahmen wählt das entsprechende Teil aus, ohne es automatisch nachzuladen. Die Auswahl im Objektbaum funktioniert ebenfalls. Unvollständig dargestellte Teile erhalten keine direkten Ziehgriffe. Ihre gespeicherte Geometrie bleibt für ausdrücklich angeforderte Bearbeitungen und Prüfungen vorhanden.

## Ladeset und Sichtbarkeit

Das Ladeset ist eine Einstellung des Arbeitsplatzes. Die Befehle ändern keine Körper, Quellen, Parameter, Sperren, Sichtbarkeitsmerkmale oder Undo-Einträge. Die Anzeige nennt die Anzahl der im Ladeset enthaltenen Teile; ausgeblendete Teile können dazu gehören und werden erst nach dem Einblenden vernetzt.

„Ausblenden“, Ebenen und Ordner, Auswahlisolation und der CAD-/Netz-Bereich von Easy Tinker behalten ihre eigene Bedeutung. Ein ausgeblendetes Teil erhält auch keinen Begrenzungsrahmen. Der CAD-Bereich zeigt keine Netzrahmen und umgekehrt. Eine Sperre verhindert das Betrachten oder Nachladen nicht.

Die Begrenzungsrahmen stammen aus gespeicherten Körpergrenzen beziehungsweise den vorhandenen Netzkoordinaten. Die acht Ecken werden mit der vollständigen affinen Teilmatrix in Weltkoordinaten umgerechnet. Spiegelungen und Scherungen bleiben dadurch eingeschlossen. Ein Rahmen ist eine konservative Anzeigegrenze und kein Nachweis der tatsächlichen Oberfläche oder einer Kollision.

## Speichern und Wiederöffnen

Arbeitsplatzversion 5 speichert das Ladeset neben Kamera, Auswahl, Qualität und Oberflächenanordnung. Speichern und Autosicherung erhalten weiterhin **die gesamte Geometrie**, auch für nur als Rahmen dargestellte Teile. Wiederöffnen stellt das gespeicherte Ladeset vor der ersten Anzeigevernetzung her. Alte Dateien ohne Ladeset öffnen mit vollständiger Anzeige.

Das gemeinsame Projektformat bleibt 8 oder, abhängig von vorhandenen Funktionen, die bisher benötigte höhere Version. Ein reines CAD-Projekt in Format 5 oder 7 wird beim Speichern mit Arbeitsplatz 5 als gemeinsames Format 8 ausgegeben; seine Körper und Quellen ändern sich dabei nicht. Arbeitsplatzversionen 1–4 bleiben lesbar.

## Export und Rechenaufwand

Die Exportauswahl bleibt unabhängig vom Ladeset: Ein Gesamtexport enthält alle dafür angeforderten dauerhaft sichtbaren Teile. STEP enthält native CAD-Körper; STL und weitere Netzformate verwenden weiterhin ihre bisherigen Geometrieregeln und ihre eigene Exportqualität. Rahmen werden niemals als Ersatzgeometrie exportiert. Auswahlisolation und eine vereinfachte Anzeige kürzen den Gesamtexport nicht.

Der CAD-Dienst bekommt für die Anzeige eine ausdrückliche Liste der benötigten Teile. Die übrigen Körper werden nicht für ihre Oberfläche vernetzt. Rahmen verwenden kleine Anzeigepuffer; Netzgrenzen werden je unveränderter Netzquelle zwischengespeichert. Ein leeres Ladeset benötigt keinen Anzeigeauftrag an den Geometrie-Worker. Nachladen kann bei komplexen Körpern Zeit benötigen; vorhandene Anzeigenetze dürfen dabei aus dem begrenzten Cache wiederverwendet werden.

Diese Ausbaustufe hält weiterhin die gespeicherten BReps, Netzkoordinaten und Quellen des gesamten Projekts im Arbeitsspeicher. Native Szenenabfragen und Modellprüfungen können auf diese Geometrie zugreifen. Erst Paket 7 ergänzt das indexierte Dateiformat `.fnpack` und bedarfsgerechtes Einlesen der Geometrieblöcke. Planpunkt 9 ist daher nach diesem Paket erst teilweise erfüllt.

## Lokale KI-Schnittstelle

`offlinecad_scene` enthält den aktuellen Anzeigestand. Der separate Befehl `offlinecad_assembly` beziehungsweise `POST /v1/assembly` steuert ausschließlich den Arbeitsplatz:

```json
{"action":"state"}
{"action":"only","revision":"AKTUELLE_MODELLREVISION","ids":["WURZELTEIL-ID"]}
{"action":"load","revision":"AKTUELLE_MODELLREVISION","ids":["WEITERE-WURZELTEIL-ID"]}
{"action":"all","revision":"AKTUELLE_MODELLREVISION"}
```

Änderungen benötigen die aktuelle Modellrevision und erzeugen keinen Modell-Undo-Schritt. Für die Python-CLI kann `assembly` ohne Eingabedatei den Zustand lesen; eine JSON-Datei enthält einen der Änderungsaufträge. Bestehende lokale Verbindungsdatei und Zugriffsschutz bleiben erhalten. Der Adapter zeigt den zusätzlichen MCP-Befehl nur an, wenn die verbundene Anwendung ihn unterstützt.
