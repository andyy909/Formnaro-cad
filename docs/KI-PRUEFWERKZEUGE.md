# KI-Prüfwerkzeuge ab 0.96.0

Der interne KI-Chat prüft berechnete Entwürfe vor der Übernahme. Numerische
Ergebnisprüfungen bleiben verbindlich. Nach einer erfolgreichen Berechnung
erhält ein bildfähiges Modell automatisch vier feste Ansichten und die
Messbefunde. Es kann den Entwurf beurteilen oder vollständige korrigierte
Befehle liefern. Höchstens zwei Bildprüfungen und zwei Korrekturen pro Auftrag;
es wird nie automatisch übernommen. Nach dem letzten erfolglosen Versuch bleibt ein berechenbarer Entwurf sichtbar. Gemessene Fehler erscheinen mit roten Markierungen und „Mit Fehlern übernehmen“, eine nicht abgeschlossene Korrektur oder Bildprüfung mit „Mit Warnung übernehmen“. Nicht lokalisierte Probleme erhalten einen Texthinweis; es werden keine Fehlerstellen erfunden. Wenn keine Geometrie berechnet werden konnte, bleibt das Original statt eines erfundenen Ersatzmodells erhalten. Modell, Auswahl und ursprüngliche
Sollprüfungen bleiben während des Ablaufs gebunden.

Die Ansichten entstehen in einer separaten Grafikszene. Live-Kamera, Auswahl,
Modell und Rückgängig-Verlauf bleiben unverändert. Verdeckte Körper und
Negativquellen sind nicht in den Bildern. Bilder und Messberichte gehen an
den bereits gewählten Anbieter. Bei einem Textmodell, fehlendem Grafikbudget,
vollem Bildbudget oder fehlgeschlagener Abfrage wird eine nicht abgeschlossene
Bildprüfung angezeigt; sie wird nicht als erfolgreich ausgegeben. Bestehende
Benutzerbilder und Modelliernotizen werden dafür nicht gekürzt.

## Bohrung messen

`checks` unterstützt `bore`:

```json
{"kind":"bore","target":"$plate","from":[10,10,0],"to":[10,10,6],"diameter":5,"minWall":1,"tolerance":0.01}
```

`from` und `to` sind die beiden Endpunkte der zylindrischen Innenwand in
Weltkoordinaten. Gemessen werden tatsächlicher Durchmesser, Achse und
zylindrische Tiefe. Native boolesche Prüfungen bestätigen den freien Innenraum
und einen durchgehenden umgebenden Materialring. `minWall` ist standardmäßig
0,1 mm und muss größer als die doppelte Toleranz sein. Der Bericht nennt den
radialen und axialen Toleranzbereich. Die Tiefe umfasst keine Senkung und
keinen Bohrkegel. Für zwei getrennte Wangen zwei Prüfungen verwenden.

Unterstützt werden vollständige analytische Zylinderflächen nativer fertiger
Materialkörper, auch mit starrer Drehung, Spiegelung und gleichförmiger
Skalierung. Unterbrochene/aufgeteilte Wände, Freiformflächen, Netzfacetten,
Scherungen und nicht gleichförmige Welt-Skalierungen liefern ausdrücklich
„nicht messbar“. Es findet keine heimliche Dreiecks- oder Kreisapproximation
statt. Die bisherige `clearance`-Prüfung beweist weiterhin nur einen freien
Mindestdurchgang, keinen exakten Bohrungsdurchmesser.

Die reine Messabfrage `cad/bore` nimmt dieselben Felder ohne `kind` entgegen
und liefert Istwerte, ohne eine Sollfreigabe auszusprechen. Sie ist im
KI-Messdialog und in lokalen Skripten verfügbar.

## Verbesserte Rückmeldung

- Ein vollständiges Befehlsschema pro Anbieteranfrage; das alte öffentliche
  API-Feld bleibt kompatibel, im Anbietertext verweist es auf `commandSchema`.
- Einheitliche Anleitung für permanente V3-Skizzenbedingungen.
- Weitergabe des verfügbaren Messberichtbudgets durch die Oberfläche.
- Alle fehlgeschlagenen Prüfungen mit ihren Istwerten im Korrekturfeedback;
  unveränderte ursprüngliche Sollprüfungen bleiben verbindlich.

## Beschädigte STL-Dateien

Der lokale STL-CAD-Konverter benötigt ein geschlossenes, mannigfaltiges Netz.
Das gilt auch für Originalfacetten und regionenbasierte Rekonstruktion.
Die Desktop-Voreinstellung ist `repair: true`. Mit `repair: false` entfällt
der Reparaturversuch, aber nicht die Anforderung an die Netzgeometrie.

Wird eine Reparatur wegen zu großer Formabweichung abgelehnt, erklärt die
KI-Rückmeldung diese Grenze und sperrt Wiederholungen desselben Konverterwegs.
Ein bereits beauftragter CAD-Nachbau kann mit lokalen Python-/JavaScript-Messungen
und einer neuen nativen oder FreeCAD-Konstruktion weitergehen. Ein Konverterfehler
belegt keine allgemeine Unmöglichkeit des Nachbaus. Siehe
[Lokale KI-Arbeitsumgebung](KI-ARBEITSUMGEBUNG.md).
Das Budget wird nicht eigenmächtig erhöht. Das optionale PyMeshFix ist kein
Nachweis dafür, dass das Netz mit diesem Modul innerhalb des Budgets repariert
werden könnte. Das Original bleibt erhalten.
