# Easy Tinker: erweiterte Funktionsprüfung

Geprüfter Stand: Formnaro 0.41.0, 16.10.2026. Eigene synthetische Testprojekte
und getrennte lokale Testprofile; vorhandene Nutzerprojekte wurden nicht bearbeitet.

## Gefundene und korrigierte Fehler

| Befund in 0.40 | Korrektur in 0.41 |
| --- | --- |
| Ausrichten im Netzbereich fordert CAD-Körper. | Gemeinsame Maßabfrage für CAD und Netz, einschließlich fester Referenz per Mausklick. |
| Netz-Gewindemutter lässt sich nicht hinzufügen. | Ausschließlich exakt zusammengefallene Dreiecke aus der erzeugten Netzausgabe entfernen; benutzte Koordinaten und Parameter erhalten. |
| Escape lässt das Spiegel-Menü offen. | Escape und Moduswechsel schließen das Menü wieder. |

Die Mutter besteht die Körperprüfung bei 32, 64 und 96 Segmenten und nach
Änderung der Steigung. Gesunde erzeugte Netze und unbeteiligte importierte
Originale bleiben unverändert. Es wird keine neue Näherungsgeometrie eingesetzt.

## Prüfumfang

Der zusätzliche Durchgang umfasst 98 Abläufe mit echten Bedienelementen:

- Alle 23 Grundformen jeweils als native CAD-Körper und als Netz.
- Suche, Favoriten, Maße und Proportionen, Farbe, Körper/Loch sowie Sperren.
- Kopieren, Einfügen, Duplizieren, Entfernen und exaktes Rückgängig.
- Gruppieren/Auflösen mit Netzvorschau und ursprünglichen Quellen.
- Ausrichten nach Maß und mit fester angeklickter Referenz, Spiegeln und Absetzen.
- Echte Mausbewegung, Skaliergriff, Tastenkürzel und aus der Formenleiste
  abgefangene originale Chromium-DragData für Ziehen auf die Arbeitsfläche.
- Text ändern, Linealursprung und Arbeitsebene auf einer Fläche; neue Form ruht
  auf der gesetzten Ebene. Abbruch einer langen CAD-Berechnung.
- Physischer Export: CAD als STEP/STL/OBJ-Bündel/3MF/glTF/GLB/SVG,
  Netz als STL/OBJ-Bündel/3MF/glTF/GLB/SVG.
- Fensterbreiten 800, 1000, 1280 und 1840 mit erreichbarem CAD-/Netz-Schalter.

Dazu kommen die bestehenden Layout-, Bereichs-, Reparatur- und Dateiprüfungen:
CAD-/Netztrennung, Import, Speichern/Öffnen/Neustart, automatische Reparatur,
Schutzbereiche, verspätete Ergebnisse, Undo/Redo und gemeinsame Konverterabläufe.
Die Abnahme prüft die tatsächliche neue EXE und ihre verpackten Ressourcen.

## Verbleibende Grenzen

Native CAD-Gewinde sind aufwendig. Gemessen wurden je nach Prüflauf rund
57–102 Sekunden für ein Standardgewinde und 25–43 Sekunden für die CAD-Mutter.
Das Abbrechen per Escape wurde geprüft. Es wird kein Geschwindigkeitsgewinn
behauptet. Die Netz-Gewindemutter wurde im Oberflächentest in etwa 3 Sekunden
angelegt. Die Zeiten sind Beobachtungen auf dem Prüfrechner und keine garantierten
Laufzeiten auf anderen PCs.

Automatische Netzreparatur kann komplexe Schäden nicht zuverlässig beheben und
bleibt auf die dokumentierten Verfahren begrenzt. Die DeepSeek-Internetverbindung
auf einem anderen Rechner war kein Bestandteil dieser lokalen Easy-Prüfung.

Die vollständigen Rohbelege und Identitätsprüfungen liegen lokal unter
`work/easy-mode-audit-20261016/checks`; die portable ZIP enthält die finalen
Prüfnachweise. Neue Ausgaben werden separat abgelegt.


Paket22 / Version0.45.0: Easy Tinker bleibt Bestandteil der gemeinsamen Anwendung.
Die neue Neuvernetzung ist ein Normalmodus-Werkzeug; bestehende CAD-/Netzbereiche,
Formen, Historie, Autoreparatur, Exporte und Fensterbreiten werden erneut in
isolierten Quell- und EXE-Laeufen abgenommen. Aktuelle Rohbelege und finale
Ergebnisse: work/mesh-remesh/checks/final-audit.json und delivery.json.

Paket23 / Version0.46.0: bestehende169Easy-Pruefpunkte werden erneut sowohl
aus Quellen als auch in der separatenEXE geprueft. Neues Glaetten ist im
Normalmodus; gemeinsame Historie/Schutz/Easy-Domains bleiben enthalten.
Aktuelle Rohbelege und Abschluss: work/mesh-smooth/checks.

Paket24 / Version0.47.0: Die bestehenden169Easy-Prüfpunkte werden erneut aus Quellen und in der separaten EXE geprüft. Bereichsersetzung ist ein Normalmodus-Werkzeug; gemeinsames Projekt, Historie, Schutz und CAD-/Netzbereiche bleiben Bestandteil der Abnahme. Aktuelle Rohbelege und Abschluss: work/mesh-erase-fill/checks.

Paket25 / Version0.48.0: Die bestehenden169Easy-Prüfpunkte werden erneut aus Quellen und in der separaten EXE geprüft. Make Solid ist ein Normalmodus-Werkzeug; Original und neue Annäherung bleiben im gemeinsamen Projekt erhalten. Die aktuelle Abnahme liegt unter work/mesh-make-solid/checks; erst final-audit.json und delivery.json belegen den erfolgreichen Abschluss.
