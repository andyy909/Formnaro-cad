# Nachmessen und STL-Ergebnisse prüfen

Ab Formnaro 0.53.0 kann die eingestellte KI zunächst reine Messungen anfordern, die örtlich berechneten Ergebnisse lesen und anschließend konstruieren. Diese Messrunden verändern weder das Modell noch Rückgängig. Modell- oder Auswahlwechsel und Abbrechen stoppen den Auftrag. Die bestehende abgeschottete Skriptumgebung bleibt erhalten.

## Messrunden

Ab Formnaro 0.53.1 darf jeder einzelne KI-Anbieteraufruf bis zu zehn Minuten dauern. **Abbrechen** beendet die laufende Anfrage weiterhin sofort. Messrunden und Fehlerkorrekturen können mehrere Anbieteraufrufe benötigen.

Die KI kann statt eines Befehlsvorschlags beispielsweise antworten:

```json
{
  "revision": "AKTUELLE_REVISION",
  "analysis": [
    {"id":"opening","engine":"mesh","kind":"lidCatalog","options":{"id":"QUELLTEIL"}}
  ]
}
```

Das Programm prüft und berechnet diese Abfragen lokal und sendet den kompakten Bericht als `analysisResults` mit dem nächsten Aufruf an denselben ausgewählten KI-Anbieter. Dieser Zugriff ist auf Messwerkzeuge des aktuellen Modells und geladene Programmressourcen begrenzt. Skripte, fremde Dateien, Internetadressen, Zugangsdaten und Betriebssystembefehle sind keine Messaufträge.

Es gibt höchstens zwei Messrunden mit je acht Abfragen, höchstens zwei Fehlerkorrekturen und insgesamt höchstens fünf Modellaufrufe pro Auftrag. Zusätzliche Anbieteraufrufe erscheinen in der vorhandenen Verbrauchsanzeige. Der gesamte Messbericht ist auf 32.000 JSON-Zeichen begrenzt; große Listen werden ab 0.54.0 automatisch mit ausgewiesenen Seitenangaben zurückgegeben. Einzelne zu große Werte müssen weiterhin eingegrenzt werden. Es gibt keinen automatischen Ersatz durch geratene Maße.

Die normale lokale API bleibt kompatibel; `analysis` ist die vorbereitende Antwortform der eingebauten KI. Externe lokale Clients können weiterhin ihre bestehenden Messungen/Skripte und Befehlsvorschauen verwenden.

## Zusätzliche Sollprüfungen für Netze

Die vorhandenen top-level `checks` unterstützen jetzt auf sichtbaren, vom Netzkern geprüften geschlossenen Material-Netzteilen:

- `solids`: Anzahl räumlich getrennter Materialkörper.
- `volume`: Materialvolumen in Welt-mm³.
- `clearance`: freier endlicher Schrauben-/Bohrkorridor zwischen zwei Weltpunkten.

CAD-Prüfungen und Netzprüfungen können in demselben Vorschlag gemischt werden. Jeder Prüfbericht kennzeichnet seine Belege als native CAD-Geometrie, Quellbegrenzung oder `mesh-kernel`. Offene/beschädigte Quellen werden nicht durch erfundene Volumenwerte zu geprüften Körpern. Eine fehlgeschlagene Prüfung verwirft den gesamten Vorschlag; der bestätigte Stand bleibt erhalten.

Der Netz-Korridor prüft einen umschriebenen 256-seitigen Zylinder. Seine Geometrie umfasst den gewünschten Kreis abzüglich der ausdrücklich ausgewiesenen radialen Toleranz sowie konservative numerische Sicherheitszugaben. Zu kleine Toleranzen für die tatsächlichen Netzkoordinaten werden abgelehnt. Ein Korridor außerhalb des Zielteils gilt nicht als bestandener Lochtest.

Ein bestandener Korridor belegt einen freien Mindestdurchmesser innerhalb der angegebenen Strecke. Er beweist keinen exakten Lochdurchmesser, keine Mindestwandstärke, keine Lochanzahl, keine Gewinde und keine reale Druckpassung. Universeller Mindestabstand zwischen beliebigen Netzteilen ist noch keine dieser Prüfungen; native CAD-Abstände bleiben verfügbar.


## Messebenen und Berichtsseiten (0.54.0)

Kontur- und Deckelberichte behalten ihre bisherigen Konstruktionsanker und Kennungen. `planePoint` und `nominalPlanePoint` bezeichnen die angefragte Bezugsebene; `center` und `circle.center` bleiben zu dieser Ebene kompatibel. Gemessene Durchmesser und Konturen gehören zur tatsächlichen Ebene `measurementPlanePoint`. `measurementCenter` beziehungsweise `circle.measurementCenter` geben ihre tatsächlichen Mittelpunkte an. Es gilt:

`measurementPlanePoint = nominalPlanePoint - normal * (referenceInset - sectionShift)`.

`referenceInset` ist die gewählte Messtiefe, `sectionShift` die kleine numerische Verschiebung des Schnitts von gemeinsamen Dreiecksebenen weg. Diese Verschiebung wird ebenfalls ausgewiesen. Die Formerkennung zeigt beide Ebenen. Aus einem Durchmesser bei z=19 darf kein Durchmesser bei z=20 abgeleitet werden.

Jede Analyseabfrage darf ein zusätzliches Feld `report` tragen:

```json
{"id":"section20","engine":"mesh","kind":"featureCatalog","options":{"id":"QUELLTEIL","options":{"normal":[0,0,1],"planePoint":[0,0,20]}},"report":{"collection":"profiles","offset":0,"limit":1,"detail":"compact"}}
```

`reportPage.pages` nennt zu jeder gekürzten Liste `collection`, `total`, `offset`, `returned` und `nextOffset`. Für die Fortsetzung dieselbe Geometrieabfrage mit dem nächsten Offset wiederholen; `null` bedeutet Listenende. `omittedCollections` benennt andere ausgeblendete Listen. Die Anzahl der zurückgegebenen Zeilen ist kein Gesamtergebnis. Numerische Kurzvektoren bleiben vollständig. Ohne Auswahl passen kleine Berichte vollständig durch; große Berichte erhalten automatisch Seiten. `limit` erlaubt 1–32 Zeilen, der tatsächlich gelieferte Umfang kann zum Einhalten des Budgets kleiner sein. `detail: full` liefert vollständige Daten nur innerhalb des Budgets, sonst eine ausdrücklich gekennzeichnete Seite. Es gibt keinen dauerhaften Cursor und keine alten Geometriedaten: jeder Abruf prüft den aktuellen Modellstand. Zwei Messrunden mit je acht Abfragen und die 32.000-Zeichen-Gesamtgrenze bleiben bestehen.

## Radialspiel über die Einsteckhöhe (0.54.0)

```json
{"kind":"radialClearance","target":"$einsatz","other":"QUELLTEIL","from":[0,0,16.5],"to":[0,0,23.5],"expected":0.3,"samples":9,"tolerance":0.01}
```

`target` ist der fertige Einsatz, `other` die Aufnahme; beide müssen verschiedene sichtbare, geschlossene, vom Netzkern geprüfte Material-Netzteile sein. Weltpunkte `from` und `to` definieren Achse und Prüfintervall. Sie müssen innerhalb des Einsatzmaterials und einer umschlossenen leeren Quellöffnung liegen. Die Prüfung deckt exakt dieses Intervall ab; Endflächen oder überstehende Teile außerhalb gehören nicht dazu. Native CAD-Teile und offene Quellnetze unterstützt diese Prüfung nicht.

An 3–33 gleichmäßig verteilten Ebenen wird die konservative Untergrenze aus dem um die Achse eingeschriebenen freien Quellradius minus dem umschriebenen Einsatzradius berechnet. Zwischen diesen Ebenen prüft das Programm zusätzlich alle Quell- und Einsatzdreiecke in adaptiv verfeinerten Höhenabschnitten. Schmale Schultern zwischen den Messhöhen können dadurch nicht allein wegen des Messrasters passieren. Es wird kein linearer Konusverlauf angenommen. Numerische Sicherheitszugaben werden abgezogen. Höchstens 100.000 Dreiecke je Teil und 12 Millionen Dreieckbesuche begrenzen die Rechnung; nicht eindeutig prüfbare oder zu aufwendige Fälle werden abgewiesen.

`actual.minimumGapLowerBound` ist die konservative Untergrenze für alle Winkel und Höhen des vollständigen angegebenen Intervalls. `sampledMinimumGapLowerBound` und `sections` dokumentieren die zusätzlichen Einzelschnitte, `slabsChecked` die Höhenabschnitte. Bestanden bedeutet Untergrenze mindestens `expected - tolerance`. Es ist keine exakte Spaltmessung; exzentrische oder unrunde Formen können konservativ abgewiesen werden. Ein Kreisfit und fehlende Materialüberlappung allein ersetzen diese Prüfung nicht. Eine reale Druckprobe bleibt erforderlich, um die physische Passung zu bestätigen.

Rein lesend ist dieselbe Prüfung als `mesh/radialClearance` verfügbar:

```json
{"id":"spiel","engine":"mesh","kind":"radialClearance","options":{"id":"EINSATZ","options":{"other":"QUELLTEIL","from":[0,0,16.5],"to":[0,0,23.5],"expected":0.3,"samples":9}}}
```

Auch lokale Modellskripte können `api.query` mit diesem engine/kind/options-Aufbau verwenden. Top-level Sollprüfungen laufen auf der fertig berechneten Vorschau, bevor Übernehmen angeboten wird. Fehlgeschlagene Prüfungen verwerfen die Vorschau; eine automatische Korrektur behält die ursprüngliche Anforderung.
