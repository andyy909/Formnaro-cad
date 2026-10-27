# Ausgewählte Netzbereiche glätten – Paket 23

Formnaro 0.46.0 glättet übernommene Netzflächen mit begrenzter Stärke und
Verschiebung. Markierte Schutzflächen und alle Dreiecke außerhalb der Auswahl
bleiben geometrisch exakt erhalten. Die Vorschau zeigt die tatsächliche
Formänderung vor der Übernahme.

## Bedienung

1. Im Modus **Normal** ein sichtbares, entsperrtes vollständiges Netzteil wählen.
2. Über **Netzflächen auswählen …** die unruhigen Flächen markieren. Technische
   Bohrungs- oder Anlageflächen bei Bedarf als Schutzbereich festhalten.
   Die Flächenauswahl und Schutzbereiche **übernehmen**.
3. **Netz-Werkzeuge → Netzbereiche glätten …** öffnen. Ohne passende übernommene
   Auswahl bleibt die Vorschau gesperrt; **Netzflächen auswählen …** führt zurück
   zur Auswahl. Es gibt keinen stillen Wechsel auf das ganze Teil.
4. Stärke von 0 bis 1, 1–30 Durchgänge und die höchste erlaubte Verschiebung
   in Millimetern einstellen. Die Grenze gilt gegenüber dem Original und über
   sämtliche Durchgänge zusammen. Stärke 0 erzeugt keine übernehmbare Änderung.
   Die Grenze wird im Weltmaß geprüft, auch bei
   skalierten, gescherten oder gedrehten Teilen.
5. Der Formkantenwinkel bestimmt, welche ursprünglichen Knicke festbleiben.
   Kleine Winkel halten mehr Kanten fest und können das Glätten begrenzen.
   Öffnungsränder, Auswahlränder und Schutzflächen bleiben unabhängig davon fest.
6. **Vorschau** berechnet und prüft das geglättete Netz. Original, Ergebnis und
   Überlagerung verwenden dieselbe Kamera. Dreieckskanten und violette Linien
   zwischen ursprünglichen und neuen Punktlagen lassen sich anzeigen. Diese
   Linien zeigen die wirkliche Verschiebung in Weltmillimetern ohne Vergrößerung;
   bei vielen Punkten wird die dargestellte Teilmenge ausdrücklich genannt.
7. Verschiebung, Unruhe der Oberfläche, Außenmaße und Volumenänderung vergleichen.
   **Übernehmen** erzeugt einen gemeinsamen Rückgängig-Schritt. **Abbrechen** oder
   Escape verwirft den Entwurf. Eine geänderte Eingabe erfordert eine neue Vorschau.

## Was festbleibt und was sich ändern darf

Das Werkzeug verschiebt innere Punkte der Auswahl in Richtung ihrer Nachbarn.
Die vorhandenen Dreieckszahlen, Indizes und die Vernetzung bleiben unverändert.
Alle Punkte eines geschützten oder nicht ausgewählten Dreiecks werden festgehalten,
einschließlich gemeinsam genutzter Punkte am Rand. Doppelte Punktkoordinaten werden
gemeinsam behandelt, damit keine Risse entstehen. Schutzkennungen und geordnete
Dreieckskoordinaten bleiben erhalten und werden an die neue Geometrie gebunden.

Glätten verändert die Form. Außenmaße und Volumen können sich ändern und werden
mit Vorzeichen beziehungsweise als Maßunterschied angezeigt. Es ist kein
maßhaltiger Reparatur- oder Festigkeitsnachweis. Das Original bleibt vollständig
im Verlauf gespeichert; Rückgängig stellt es wieder her.

## Formgrenze und Sicherheitsprüfung

Der Bericht misst die tatsächliche Verschiebung jedes gespeicherten Punkts.
Da jedes Ergebnisdreieck dieselben drei Punktindizes wie sein Original besitzt,
begrenzt die höchste Punktverschiebung auch den Abstand der gesamten Oberfläche
in beide Richtungen: korrespondierende baryzentrische Punkte liegen höchstens
so weit auseinander. Der zusätzliche numerische Rechenspielraum wird getrennt
angezeigt. Diese Grenze hängt nicht von einer bloßen Oberflächenstichprobe ab.

Die Unruhe wird als Abstand beweglicher Punkte zu ihren Nachbarmittelpunkten
vor und nach der Glättung gemessen. Sie ist ein Vergleichswert für diesen Bereich,
keine allgemeine Qualitäts- oder Druckbarkeitsgarantie.

Das Verfahren prüft Ausgangs- und Ergebnisflächen auf mehrdeutige Topologie,
entartete oder umgedrehte Dreiecke und geometrische Überschneidungen. Konservative
Abstands- und Orientierungsprüfungen begrenzen auch die Bewegung zwischen zwei
Schritten. Enge Stellen können die Verschiebung reduzieren. Wenn eine Prüfung
nicht sicher innerhalb des Rechenbudgets möglich ist, bleibt das Original erhalten.
Geschlossene Eingaben müssen zusätzlich die unabhängige Körperprüfung bestehen;
offene Flächen werden ausdrücklich als offen gemeldet. Beschädigte Netze müssen
zuerst gezielt repariert werden.

Bis 30.000 Dreiecke und 120.000 gespeicherte Punkte je Netz; maximal eine Million
geometrische Paarprüfungen. Es werden keine neuen Dreiecke erzeugt oder Teile
automatisch verbunden. Die Nachbarteile werden nicht umgebaut.

## Speicherung und separate Ausgabe

Originalquelle, Herkunft, Objektlage, Organisation, Farbe und Deckkraft bleiben
erhalten. Das Glättungsrezept verwendet Netzquellformat 3 und benötigt mindestens
Formnaro 0.46.0. Projektformat 8 und Arbeitsplatzformat bis 4 bleiben bestehen.
Historische Geometrieänderungen im erhaltenen Original werden gesperrt; für einen
neuen Ansatz Rückgängig verwenden. Allgemeine Eigenschaften des Ergebnisses bleiben
weiter bedienbar.

Easy Tinker nutzt weiterhin dasselbe Projekt und dieselbe Historie. Das neue
Werkzeug befindet sich im Modus Normal. Separate Ausgabe:
`release-formnaro-glaetten-v0.46.0`; frühere Ausgaben bleiben erhalten.
Maßgebliche Abnahmen: `work/mesh-smooth/checks/final-audit.json` und `delivery.json`.
