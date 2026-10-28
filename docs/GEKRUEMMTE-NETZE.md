# Gekrümmte Netze – Paket 8

Formnaro 0.115.0 ergänzt die vorhandene Neuvernetzung und die Modellierpinsel.

## Neuvernetzen

Ein vollständiges, sichtbares und entsperrtes Netzteil auswählen. Unter
**Netz-Werkzeuge → Netz neu vernetzen** das Verfahren **Gekrümmte Bereiche**
wählen. Zielkantenlänge, Formgrenze, Durchgänge und Formkantenwinkel einstellen.
Die Werte beziehen sich auf das Weltmaß, auch bei gedrehten, gespiegelten oder
gescherten Teilen. Eine übernommene Flächenauswahl begrenzt die Bearbeitung.

Das Werkzeug teilt lange Kanten, legt geeignete kurze Kanten zusammen, tauscht
Diagonalen und verteilt Punkte auf der ursprünglichen facettierten Oberfläche.
Es rekonstruiert keine analytische CAD-Fläche aus dem Netz. Öffnungsränder und
Formkanten ab dem gewählten Winkel bleiben als ursprüngliche Kanten erhalten.
Geschützte und nicht ausgewählte Dreiecke bleiben mit ihrer geordneten lokalen
Geometrie exakt erhalten. Schutzbereiche erhalten gültige neue Flächenbezüge.

Die Vorschau zeigt Dreieckszahl und -qualität, Kantenlängenstreuung,
Formabweichung, Außenmaßunterschied und Körperprüfung. Original und Ergebnis
lassen sich aus derselben Kamera vergleichen und mit verschiedenfarbigen
Dreieckskanten überlagern. Erst **Übernehmen** ändert das Projekt: ein
rückgängig machbarer Schritt mit erhaltener Originalquelle und gespeichertem
Rezept. Änderungen an Einstellungen verwerfen die alte Vorschau.

## Form- und Körperprüfung

Die Formgrenze wird in beiden Richtungen über die gesamte Dreiecksoberfläche
geprüft. Für jedes Prüfdreieck begrenzt die größte seiner drei Eckpunktdistanzen
zu einem festen Zieldreieck die Distanz aller Punkte des Prüfdreiecks. Falls
nötig wird das Prüfdreieck entlang seiner längsten Kante weiter unterteilt.
Diese vollständige Überdeckung ist unabhängig von den zusätzlich angezeigten
Stichproben. Der numerische Spielraum wird getrennt ausgewiesen. Nicht innerhalb
von Tiefe und Arbeitsbudget nachweisbare Grenzen führen zu einer Ablehnung.

Topologie, Zusammenhang, Eulerzahl, ursprüngliche Öffnungsränder, geschützte
Geometrie, Orientierung und Dreiecksschnitte werden kontrolliert. Für geschlossene
Materialnetze prüft der unabhängige Manifold-Kern außerdem Körpergültigkeit und
Volumen; höchstens ein Prozent Volumenabweichung ist zulässig. Eine offene Fläche
wird ausdrücklich nicht als geschlossener Körper bezeichnet. Beschädigte oder
sich überschneidende Eingaben werden abgewiesen; automatische Reparatur ist
kein Bestandteil dieses Werkzeugs.

## Pinsel mit lokaler Verfeinerung

Unter **Modellierpinsel und Symmetrie** kann **Unter dem Pinsel lokal verfeinern**
zugeschaltet werden. Die Zielkantenlänge steuert eine konforme Unterteilung der
zusammenhängenden, zum Ansatz gerichteten Oberfläche im Pinselradius. Nahe,
getrennte Rückseiten werden nicht allein wegen ihrer räumlichen Nähe verfeinert.
Gespiegelte Striche berücksichtigen auch die gespiegelte Normale.

Die Unterteilung erhält zunächst die ursprüngliche facettierte Form. Danach
wirken die bestehenden fünf Pinsel und ihre Kollisions- und Verschiebungsgrenzen.
Schutzflächen, Auswahlgrenzen, offene Ränder und Formkanten ab 45 Grad bleiben
bei dieser adaptiven Bearbeitung fest. Verfeinerung und alle gesammelten Striche
bilden dieselbe Vorschau und denselben Undo-Schritt. Ohne zugeschaltete
Verfeinerung gilt weiterhin die bisherige feste Dreiecksstruktur.

## Grenzen und lokale Schnittstelle

- Gekrümmte Neuvernetzung: höchstens 30.000 Eingabe- und Ergebnisdreiecke,
  1–8 Durchgänge, Formgrenze 0–1 mm, Formkantenwinkel 1–90 Grad.
- Adaptive Pinsel: höchstens 30.000 Ergebnisdreiecke, 1–3
  Verfeinerungsdurchgänge über die Schnittstelle, zwei in der Oberfläche.
- Schutz, numerische Prüfbarkeit und begrenzte Rechenbudgets können die
  Zielkantenlänge verhindern. Es gibt keine Zusage einer bestimmten Reduktion.
- Die bisherigen Verfahren für ebene Bereiche und reine Unterteilung bleiben
  separat verfügbar. Größere reine Unterteilungen behalten ihre bisherige Grenze.
- Bestehende Projektformate werden nicht umetikettiert. Das neue Rezept benötigt
  einen Leser, der die neuen Methoden und Optionen kennt; alte Programme können
  es ablehnen. Originalquellen und Parameter bleiben erhalten.

Die lokale Schnittstelle verwendet weiterhin `mesh-remesh` mit
`options.method: "curved-isotropic-v1"`, `mode: "remesh"` und `featureAngle: 45`.
Die übrigen Felder entsprechen dem vorhandenen Neuvernetzungswerkzeug.
`mesh-sculpt` akzeptiert zusätzlich `refinement: null` oder beispielsweise
`refinement: {targetEdgeLength: 1, iterations: 2}`. Geometrieprüfsumme und
Flächenauswahl müssen zum Original vor der Verfeinerung gehören.

Die Abnahme erfolgt gezielt für Paket 8 einschließlich der tatsächlichen
Windows-Ausgabe. Die große gemeinsame Gesamtprüfung bleibt für den Abschluss
nach Paket 10 vorgesehen.
