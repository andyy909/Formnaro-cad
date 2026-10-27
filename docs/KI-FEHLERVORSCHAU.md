# KI-Vorschau mit Prüffehlern

Ab Formnaro 0.94 bleibt ein technisch berechneter KI-Entwurf sichtbar, auch wenn zusätzliche Ergebnisprüfungen fehlschlagen oder nicht messbar sind. Nach den bestehenden automatischen Korrekturen werden alle angeforderten Prüfungen mit ihrem Ergebnis angezeigt. Scheitert eine spätere Korrektur, bleibt der letzte darstellbare Entwurf mit seinem eigenen vollständigen Befehlsstand verfügbar. Es wird nichts automatisch übernommen.

- **Übernehmen** lädt einen Entwurf ohne fehlgeschlagene Prüfungen.
- **Mit Fehlern übernehmen** lädt ausdrücklich den angezeigten Entwurf trotz der aufgeführten Prüffehler. Die gesamte Übernahme lässt sich rückgängig machen.
- **Verwerfen** entfernt die Vorschau und ihre Markierungen.

Rot markiert bei einem Oberflächenvergleich die gemessenen abweichenden Stichprobenpunkte und deren Verbindungsstrecken. Das ist keine vollständige Fehlerkarte oder globale Genauigkeitsgarantie. Bei Maß-, Körper- oder anderen Prüfungen ohne genaue Ortsangabe wird das betroffene Teil rot dargestellt. Fehlt auch ein gültiges Prüfziel, steht der Fehler ausschließlich in der Prüfliste. Originalfarben und Geometrie werden durch diese Vorschau nicht verändert.

Eine bestandene Prüfung bestätigt nur die ausdrücklich gemessene Anforderung. Ohne zusätzliche Sollprüfungen wird keine vollständige Richtigkeit behauptet. Nicht berechenbare Befehle erzeugen keine künstliche Modellvorschau; gegebenenfalls bleibt ein zuvor berechneter Entwurf verfügbar. Abbruch, veraltete Revisionen, Auswahländerungen, Sperren und native Geometrievalidierung bleiben wirksam.

Das Modelliergedächtnis protokolliert einen KI-Entwurf mit Prüffehlern weiterhin als fehlgeschlagen, zusammen mit dem Fehlertyp. Eine anschließende bewusste Übernahme gilt als Nutzerentscheidung und nicht als bestandene Qualitätsprüfung.

Technik: Der interne UI-Aufruf `access.preview(request, {retainFailedChecks:true})` erhält den vollständigen Prüfreport. Normale externe Vorschauen bleiben bei fehlgeschlagenen Prüfungen streng. `access.apply` verlangt für einen erhaltenen fehlerhaften Entwurf ausdrücklich `acceptFailedChecks:true`; die UI setzt dies ausschließlich durch die entsprechend beschriftete Übernahmeaktion. Zurückgegebene Reports sind Kopien und können die intern gespeicherte Übernahmesperre nicht verändern. Die bestehenden vollständigen Werkzeug-, Eingabe- und Modellierkontexte bleiben erhalten.
