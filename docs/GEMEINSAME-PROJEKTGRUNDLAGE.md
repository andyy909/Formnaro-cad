# Formnaro: gemeinsame Projektgrundlage ab 0.24.0

Diese separate Entwicklungsausgabe erreicht das erste Zwischenziel des
Gesamtplans: **ein gespeichertes Projekt mit nativem CAD-Körper, geschlossenem
Netz und offenem Netz in derselben Arbeitsfläche**. Die vollständige Übernahme
aller Netzwerkzeuge und die neuen Reparatur-/Vereinfachungswerkzeuge folgen in
den weiteren Arbeitspaketen. Paket 13 und der gesamte 27-Pakete-Plan sind damit
noch nicht abgenommen.

## Ausprobieren

1. Eine CAD-Grundform einsetzen oder eine STEP-Datei importieren.
2. Über **Import** eine STL-/OBJ-Datei auswählen. Unter **Verwendung**
   **Bearbeitbares Netzteil** einstellen. Bei 3MF/GLB/glTF gibt es dieselbe Wahl
   im Teile-Import. Ansichtsvorlagen bleiben eine getrennte Möglichkeit.
3. Netzteile im gemeinsamen Objektbaum auswählen. Name, Farbe, Deckkraft,
   Position, Drehung und Maßfelder verwenden. Ein offenes Netz darf in einer
   Richtung die Ausdehnung null haben; dieses Maß bleibt gesperrt.
4. Das Projekt als `.ocad` speichern und wieder öffnen. Neue gemischte Inhalte
   verwenden Projektformat 8. Frühere Formnaro-Ausgaben können Format 8 nicht
   öffnen. CAD-Projekte ohne neue Inhalte behalten ihre Formate 5/7.
5. Über **Export** die sichtbaren oder ausgewählten Teile ausgeben. STL/OBJ
   enthalten CAD-Körper und bearbeitbare Netzteile. 3MF/GLB/glTF enthalten
   zusätzlich Ansichtsvorlagen. STEP und SVG verwenden native CAD-Geometrie.
   Lose Lochteile werden beim Export ausgelassen.

Offene oder fehlerhafte Netze werden beim Anzeigen, Speichern und Importieren
nicht automatisch repariert oder in CAD umgewandelt. Eine exportierte offene
Oberfläche ist weiterhin offen. Die Anzeige „Geschlossenes Netz“ beschreibt
eine Prüfung der Kantenverbindungen; sie ist keine allgemeine Körperprüfung
auf Selbstüberschneidungen, Materialräume oder Druckbarkeit.

## Alte Projekte und Sicherungen

- CAD-Projekte 5/7 werden weiter gelesen. Sobald bearbeitbare Netzteile oder
  neue Quellenverweise hinzukommen, öffnet der erste Speichervorgang einen neuen
  Speicherdialog. Die Originaldatei wird nicht still auf Format 8 umgestellt.
- Netzprojekte 1–4/6 werden im getrennten Netz-Worker mit dem übernommenen Leser
  geprüft. Die normale Dateiauswahl unterstützt auch die bisherige begrenzte
  gzip-Komprimierung. Danach wird eine neue gemeinsame Datei gespeichert.
- Die ursprünglichen Netz-Projektdaten bleiben unter `migrationSource` erhalten;
  jedes übernommene Teil bewahrt seine Netzquelle mit Parametern und Quellenbaum.
  Namen, Farben, Körper-/Lochrolle, Sperren, Organisation und Lage werden
  übernommen. Die Dreiecke ersetzen keine native CAD-Geometrie.
- Die alte Netz-Ansicht und alte Netzflächenbezüge sind in der Originalsicherung
  erhalten. Ihre aktive Anbindung an die gemeinsame Oberfläche folgt beim
  weiteren Ausbau. Der Import zeigt dazu einen Hinweis; die räumliche Lage der
  Arbeitsebene wird bereits übernommen.
- Gemischte Autosicherungen verwenden einen eigenen Eintrag. Vorherige
  CAD5-/CAD7-Autosicherungen bleiben erhalten. Eine beschädigte neue Sicherung
  verhindert automatisches Überschreiben und einen stillen Rückfall auf ältere
  Daten.

Die gemeinsame Datei bleibt auf 50 MB begrenzt. Die enthaltene Originalsicherung
zählt mit. Ein zu großes Altprojekt wird verständlich abgewiesen; es wird nicht
gekürzt. Diese Ausgabe übernimmt keine privaten Profile oder Zugangsdaten in
das Projekt oder in die Auslieferung.

## Architektur und weiterer Ausbau

`cad-project.js` und `project-objects.js` bilden die gemeinsame Datenprüfung;
`cad-transactions.js` bleibt die einzige bestätigte Historie. CAD-Aufträge
verwenden den bisherigen nativen CAD-Worker. Der zusätzliche Netz-Worker lädt
Manifold erst bei Bedarf. Ein Rechenkern ersetzt den anderen nicht.

Die übernommenen Netzmodule stammen bytegleich aus Netz 0.21.0;
`src/mesh-engine/origin.json` dokumentiert die Prüfsummen. Der Nachbarzweig und
seine Ausgaben werden dadurch nicht verändert. Ab 0.25.0 verbindet der Adapter auch die vorhandenen konstruktiven
Netzverfahren mit dem gemeinsamen Projekt. Bedienung und Grenzen stehen in
[Netz-Werkzeuge](NETZ-WERKZEUGE.md). Der vollständige Oberflächenabgleich bleibt
Arbeitspaket 7/8.

Der vorhandene STL→STEP-Konverter und seine Flächenwerkstatt bleiben erreichbar.
Das direkte Umwandeln eines ausgewählten Netzteils und CAD→Netzkopien sind die
noch ausstehenden Pakete 10/11. Es gibt keine automatische Geometrieumwandlung.

Revisionsprüfungen verhindern die Übernahme verspäteter Importe/Vorschauen.
Ein geschlossener Importdialog beendet nur seinen eigenen Auftrag. Abbruch,
Undo/Redo und die gemeinsame Arbeitsfläche ändern keine unbeteiligten Quellen.

Verbindliche Übernahmeliste: [Funktionsbestand](FORMNARO-FUNKTIONSBESTAND.md).
Fortschritt aller 27 Pakete: [Umsetzungsstand](FORMNARO-UMSETZUNGSSTAND.md).
