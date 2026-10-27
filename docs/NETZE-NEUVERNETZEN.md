# Netze neu vernetzen – Paket 22

Formnaro 0.45.0 verbessert Dreiecke in ebenen Netzbereichen. Das Werkzeug
unterscheidet **Neuvernetzen** und **Unterteilen**. Es bietet vor der Übernahme
einen Formvergleich aus derselben Kameraansicht und erhält die Originalquelle.

## Bedienung

1. Im Modus **Normal** ein sichtbares, entsperrtes vollständiges Netzteil wählen.
   CAD-Körper bei Bedarf zuvor als unabhängige Netzkopie erstellen.
2. Wichtige Flächen über **Netzflächen auswählen …** als Schutzbereich übernehmen.
   Eine übernommene Flächenauswahl kann den bearbeiteten Bereich begrenzen.
3. **Netz-Werkzeuge → Netz neu vernetzen …** öffnen.
4. Verfahren, ganzes Teil oder Flächenauswahl, Zielkantenlänge im Weltmaß,
   1–8 Durchgänge und die höchste erlaubte Formabweichung in mm einstellen.
5. **Vorschau** berechnet das Ergebnis und dessen Prüfbericht. **Ergebnis**,
   **Original** und **Original und Ergebnis überlagert** verwenden dieselbe Ansicht.
   Die Dreieckskanten lassen sich ein- und ausschalten: Original blau,
   Ergebnis braun, Vorschaufläche orange. Der Vergleich verändert keine Modelldaten.
6. Dreieckszahl, mittlere und kleinste Qualität, Streuung der Kantenlängen,
   Formabweichung, Außenmaßunterschied und Körperprüfung vergleichen.
7. **Übernehmen** erzeugt genau einen Rückgängig-Schritt. **Abbrechen** oder Escape
   verwirft den Entwurf. Eine geänderte Einstellung erfordert eine neue Vorschau.

## Zwei Verfahren

**Neuvernetzen** teilt zu lange geeignete Kanten, tauscht Diagonalen und verbessert
innere Punktlagen in festen ebenen Ausgangsbereichen. Ein Tausch oder Verschieben
muss die lokale Dreiecksqualität verbessern. Bohrungskonturen, Formkanten,
Öffnungsränder und Facetten gekrümmter Flächen bleiben dabei fest. Die Methode
glättet keine Rundungen und vergröbert keine gekrümmte Oberfläche.

**Unterteilen** fügt Punkte auf vorhandenen Kanten hinzu. Auch gekrümmte,
bereits facettierte Flächen lassen sich feiner unterteilen; ihre vorhandene
facettierte Form bleibt erhalten. Eine Kugel wird dadurch nicht automatisch
runder. Die Unterteilung kann die Segmentierung eines Öffnungsrands verfeinern,
ohne seine geometrische Linie zu ändern.

Beide Verfahren erhalten geschützte und nicht gewählte Dreiecke mit exakt
denselben geordneten Koordinaten. Die Schutzkennungen werden auf das neue Netz
gebunden. Das kann die gewünschte Kantenlänge begrenzen. Es gibt keine erzwungene
Zielerreichung, automatische Reparatur, Verringerung kurzer Kanten oder
allgemeine Neuvernetzung beliebiger gekrümmter Flächen.

## Form und Qualität richtig vergleichen

Die Dreiecksqualität liegt zwischen 0 und 1; gleichseitige Dreiecke erreichen 1.
Der Bericht zeigt Mittelwert und Minimum vor und nach der Bearbeitung. Eine
bessere mittlere Qualität bedeutet nicht, dass jede Kennzahl besser wird.
Feste kleine Bohrungssegmente können die Streuung der Kantenlängen erhöhen.

Die obere Formabweichungsgrenze folgt aus den festen Ausgangsebenen und der
erhaltenen Flächendomäne. Eine numerische Rechentoleranz wird gesondert angezeigt.
Zusätzlich werden Abstände von Oberflächenpunkten in beide Richtungen geprüft;
diese **Stichproben sind kein globaler Abstandsnachweis**. Außenmaße werden
gesondert verglichen. Geschlossene Eingaben müssen auch die unabhängige
Körper- und Volumenprüfung bestehen. Offene Flächen werden ausdrücklich als
offen gemeldet. Bei exakt ebenen Bereichen kann die Formänderung null sein,
obwohl sich die Dreiecksverteilung deutlich ändert.

## Daten und Grenzen

Bis 150.000 Ausgangsdreiecke und 250.000 Ergebnisdreiecke je Teil; ein begrenztes
Rechenbudget verhindert unbegrenzte Verfeinerung. Bei Schutz- oder Budgetgrenzen
meldet die Vorschau verbleibende lange Kanten. Ungültige, doppelte, entartete oder
mehrdeutig verbundene Netze müssen zuerst gezielt repariert werden.

Originalquelle, Herkunft, Farbe, Deckkraft, Organisation und Objektlage bleiben
erhalten. Das strikte Neuvernetzungsrezept verwendet Netzquellformat 3 und
benötigt mindestens Formnaro 0.45.0. Projektformat 8 und Arbeitsplatzformat bis 4
bleiben bestehen. Historische Geometrieänderungen am archivierten Original sind
gesperrt; Rückgängig erlaubt einen neuen Ansatz vom Original aus.

Easy Tinker nutzt weiterhin dasselbe Projekt und dieselbe Historie. Das neue
Werkzeug befindet sich im Modus Normal. Die separate Ausgabe liegt unter
`release-formnaro-neuvernetzen-v0.45.0`; frühere Ausgaben werden nicht überschrieben.
Maßgebliche Abnahmen: `work/mesh-remesh/checks/final-audit.json` und `delivery.json`.
