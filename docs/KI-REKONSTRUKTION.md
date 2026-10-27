# Messwerkzeuge für den nativen Nachbau

Seit Formnaro 0.92 kann die Modellier-KI vollständige STL-Schnittkonturen lokal
verwenden und ihren noch nicht übernommenen Entwurf mit der Vorlage vergleichen.
Der bisherige Werkzeugkatalog, persönliche Hinweistext und Erfahrungsinput
werden hierfür nicht gekürzt. Die Funktionen stehen auch externen Clients über
den bestehenden lokalen Modelliervertrag zur Verfügung.

## Vollständige Schnittkonturen

`mesh/sectionContours` liest ein Materialnetz mit bis zu 100.000 Dreiecken.
`normal` und `planePoint` beschreiben eine Ebene in Weltkoordinaten. Die Abfrage
schneidet genau dort, mit einer kleinen ausdrücklich ausgewiesenen numerischen
Verschiebung. Sie sucht nicht wie der Öffnungskatalog nach einem breiteren Rand
in einer Tiefenzone. Offene oder verzweigte Schnittlinien werden abgelehnt.
Vorlage und Sperren werden durch die reine Abfrage nicht verändert.

Die Antwort enthält den Quelldigest, die nominelle und gemessene Ebene, eine
rechtshändige Weltmatrix `frame` sowie vollständige geordnete Konturen mit
Elternindex, Verschachtelungstiefe, Rolle `outer`/`hole`, Fläche und Grenzen.
`includePoints:true` ergänzt die geordneten 2D-Punkte im angegebenen Frame.
`loopIndices` wählt ausdrücklich ganze Konturen aus; `complete` und Zähler
zeigen eine solche Teilmenge an. Eine einzelne Kontur bleibt immer vollständig.
Berichte werden nicht mitten in Punkt- oder Elementlisten abgeschnitten.
Zu große Messberichte lehnen ab und nennen die lokale Python-Abfrage als Weg.

Linien, Kreise und Kreisbögen ersetzen geeignete Polygonabschnitte mit einem
offengelegten zweiseitigen Fehlerbound `fitErrorBound`. Bei runden Konturen
berücksichtigt er auch den Abstand zwischen Dreieckssehnen und Kreis, nicht nur
die Radien der Eckpunkte. `fitTolerance` liegt zwischen 0 und 0,1 mm, Vorgabe
0,02 mm. Der Bound gilt nur für die gemessene 2D-Polygonlinie. Er sagt nichts
über Zwischenhöhen oder die vollständige Körperform aus.

`sketch` enthält eine gewöhnliche bearbeitbare native Skizze Version 2, sofern
höchstens 128 Elemente nötig sind und ausgewählte Löcher ihre Elternkontur
enthalten. Andernfalls lautet der Wert `null`, mit einem Grund. Es werden keine
Löcher stillschweigend weggelassen. Die Elementdaten bleiben verfügbar, um mehrere
Skizzen und ausdrückliche boolesche Ausschnitte zu bauen. Die standardmäßige
Extrusionshöhe von 1 mm ist ein Platzhalter. Die KI muss Höhe und Startlage aus
den tatsächlichen Anforderungen und weiteren Messungen bestimmen.

```python
from formnaro import model

s = await model.query("mesh", "sectionContours", id="BEOBACHTETE_QUELL_ID",
    options={"normal": [0, 1, 0], "planePoint": [0, -42, 0],
             "fitTolerance": 0.02})
if s["sketch"] is None:
    raise ValueError(s["sketchUnavailable"])
s["sketch"]["dimensions"]["height"] = 6
# Die gemessene Ebene und +Normalenrichtung ausdrücklich als Baulage gewählt.
p = model.sketch(s["sketch"], plane=s["frame"], name="Gemessene Kontur")
```

Die Koordinaten bleiben dabei lokal: Die KI kann kurze Programme liefern,
statt lange Konturlisten aus einer Antwort in die nächste zu kopieren.

Die Python-Bibliothek 1.2 bietet außerdem einen gesammelten Aufbau mit allen
Konturen und Löchern:

```python
p = await model.section("BEOBACHTETE_QUELL_ID", 6,
    normal=[0, 1, 0], point=[0, -42, 0], start=-45.6,
    fit_tolerance=0.02, alias="result", name="Gemessene Wand")
```

`start` beschreibt die Welt-Ebene über das Skalarprodukt der normierten
Normalen mit einem Punkt; bei normalen X-/Y-/Z-Schnitten ist das der jeweilige
Koordinatenwert. Ohne `start` beginnt die Extrusion an der tatsächlichen
Messebene. Der Helfer verwendet eine gemeinsame Skizze, wenn sie ins Limit
passt. Sonst entstehen native Außenskizzen mit separaten, erhaltenen
Lochskizzen und booleschen Ausschnitten. Kein Loch wird nach Größe aussortiert.
Eine einzelne Kontur über 128 Elementen führt weiterhin zum Abbruch.
Mehrere Materialinseln können mehrere Körper ergeben; die geforderte Körperzahl
ist zusätzlich zu prüfen. Der Helfer baut einen prismatischen Schnittabschnitt,
keine automatische vollständige Rekonstruktion beliebiger STL-Oberflächen.

## Vergleich vor dem Übernehmen

`app/modelComparison` mit `leftId`, `rightId`, `maxSamples` und optional
`alignCenters` arbeitet jetzt auch auf dem aktuellen Python-/JavaScript-Entwurf.
Es ist kein vorheriges Apply nötig. Für einen Nachbau ist die Ausrichtung
`world` maßgeblich; das Zentrieren ist nur eine ausdrücklich gewählte
Vergleichsansicht und darf eine falsche Platzierung nicht verdecken.

Beide Richtungen messen kürzeste Abstände zu den Dreiecksoberflächen. Eine
deterministische Auswahl nach Dreiecksindex untersucht Schwerpunkt und Ecken
von bis zu 12.000 Dreiecken je Richtung. Die Antwort nennt Stichprobenzähler,
unbekannte Dreiecke, Maximum, Mittelwert, RMS sowie die acht größten gemessenen
Abweichungen mit Quell- und nächstem Zielpunkt. Die Orte helfen bei der gezielten
Nachmessung. Die Werte sind ungerichtet: Sie unterscheiden kein zusätzliches
von fehlendem Material. Kleine ungemessene Merkmale können unentdeckt bleiben.

Ein zusätzlicher Ergebnischeck kann einen Entwurf bei zu großer gemessener
Abweichung ablehnen:

```json
{"kind":"surfaceDeviation","target":"$result",
 "other":"BEOBACHTETE_ORIGINAL_ID","expected":0.2,"maxSamples":12000}
```

`expected` ist der erlaubte maximale **Stichprobenabstand** in Millimetern.
Dieser Check unterstützt vollständige Materialwurzeln. Die andere Wurzel muss
aus dem bestätigten Projekt stammen und geometrisch unverändert bleiben.
Der Check arbeitet in Weltkoordinaten mit einem festen CAD-Vernetzungsziel von
0,01 mm und 5 Grad, unabhängig von der Anzeigeeinstellung. Die Vorlage kann
CAD oder Netz sein. Eine neue erfundene Vergleichsgeometrie ist unzulässig.
Wie andere Ergebnisprüfungen bleiben die ersten Anforderungen während der
automatischen Korrekturen fest. Fehlerberichte nennen gemessene Problemstellen.
Abbruch, geänderter Modellstand und fehlgeschlagene Prüfung verhindern die
Übernahme der betreffenden Vorschau. Apply erzeugt weiterhin einen Undo-Schritt.

Auch ein bestandener Check ist **kein garantierter globaler Maximalfehler**.
CAD-Tessellierung und Stichproben sind Näherungen. Maßprüfungen, Bohrkorridore,
Körperzahl und unabhängige Exportkontrolle bleiben für passende Aufgaben nötig.
Ein gültiger geschlossener Körper allein beweist keine originalgetreue Form.

## Gezielte automatische Korrekturen

Seit0.92.1 enthält die Fehlerrückmeldung zusätzlich den vollständigen zuletzt
fehlgeschlagenen Python-/JavaScript-Code samt zugehörigen Modulen und ursprünglichem
Befehlsindex. Die Anbieter-API ist zustandslos; eine bloße Befehlszusammenfassung
reichte bisher nicht aus, um genau dieses Programm zu reparieren. Die KI erhält
die Quellen als ausdrücklich untrusted Referenzdaten und soll funktionierende
Geometrie und Konturen bewahren. Zurück kommt weiterhin ein vollständiger neuer
Vorschlag, der dieselben Sperren und festgehaltenen Ergebnisprüfungen durchläuft.
Die Rückmeldung führt selbst keinen Code aus.

Vollständige Programmreferenzen sind zusammen auf180.000Zeichen begrenzt. Größere
oder ungültige Einzelprogramme werden ausdrücklich als ausgelassen markiert; es
werden keine abgeschnittenen Codehälften angeboten. Die interne Fehlerrückmeldung
darf bis256.000Zeichen enthalten; der bisherige Gesamtinput bleibt begrenzt.
Unbekannte Felder, Fehlerstacks und Zugangsdaten werden nicht als zusätzliche
Programmfelder übernommen. Der vorhandene Nutzer-/Modellierkontext wird hierfür
nicht gekürzt. Eine Verbesserung des tatsächlichen Modellierergebnisses und der
Tokenkosten ist mit realen Aufgaben getrennt von diesen Transportprüfungen zu messen.
