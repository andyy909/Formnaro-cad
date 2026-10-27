# Achsenmaße, Fehlerdetails und feste KI-Regeln

Stand: 15.10.2026. Formnaro CAD 0.22.0 und Formnaro Netz 0.20.0.

Die Anwendung sendet bei jeder DeepSeek-Modellanfrage die versionierten
Arbeitsregeln erneut mit. Dieselben fachlichen Regeln gelten auch für andere
Anbieter und DeepSeek über kompatible Vermittler; anbieterspezifische Denk-
parameter und Preisberechnung bleiben unverändert. Das gilt für beide Protokolle, den Chat, die
Modellwerkstatt und jeden automatischen Korrekturversuch. Die Regeln sind
Programmtext und setzen kein Gedächtnis des Anbieters voraus. Die Netz-Ausgabe
behält ihre freien Gesprächsantworten; Modelländerungen sind JSON-Vorschläge.

## Maße richtig verstehen

CAD-Szenen enthalten bei jedem nativen Körper und jeder CAD-Quelle
`measures.geometrySize`, `measures.editSize`, `measures.worldAxisSize`,
`editFrame`, `sizeToWorldAxisFactors` und `worldAxisDirections`.
Geometriemaße stammen aus den lokalen nativen Grenzen. Bearbeitungsmaße
enthalten die Längen der eigenen Transformationsspalten; Weltachsenmaße die
Längen der vollständigen Weltmatrixspalten. Gewünschtes Weltachsenmaß geteilt
durch den jeweiligen Umrechnungsfaktor ergibt den Wert für `update.set.size`.

Netz behält `worldAxisSize`, `sizeToWorldAxisFactors`, `worldAxisDirections`
und `sizeFrame`. Dort ist `size` bereits das Bearbeitungsmaß. Die CAD-Formel
für die lokale Geometrie darf nicht auf Netzobjekte übertragen werden.

Weltachsenmaße sind physische Längen entlang der Objektachsen, keine globalen
XYZ-Abmessungen einer gedrehten Begrenzungsbox. Alle Werte sind Millimeter.
Spiegelung, Scherung und verschachtelte Elternmatrizen bleiben erhalten.
Eine reine Höhenänderung erhält die anderen Bearbeitungsmaße und den lokalen
Boden. Beispiel: 6 mm lokale Höhe bei geerbter Skalierung 0,8 ergibt 4,8 mm;
für 10 mm physische Achsenhöhe wird 12,5 mm als Bearbeitungshöhe benötigt.

## Geprüfte Fehler und Korrekturen

Fehler tragen `feedback` mit vorhandenem Code, Meldung, `retryable` und
`applied:false`. Wenn bekannt, kommen der ab 1 gezählte `commandIndex`,
Operation, aufgelöstes Ziel, Feld, Wert und tatsächlicher Wertebereich hinzu.
Bei einer Gesamtberechnung ohne eindeutige Ursache fehlen Index und Ziel.
Die Informationen bleiben über Worker, lokale HTTP-Schnittstelle, Python-
Client und MCP erhalten; bestehende Fehlermeldungen werden weiter unterstützt.

Abgewiesene Vorschläge werden als begrenzte gültige JSON-Zusammenfassung
mit Kürzungshinweis zurückgegeben. BReps, Netzfelder, Bilder, Schlüssel und
interne Stapelprotokolle sind kein Bestandteil dieser Zusammenfassung.

Höchstens zwei Korrekturversuche bleiben möglich. Gesperrte oder geschützte
Geometrie, nötiges erneutes Herauslösen, veraltete Revision, Abbruch,
Konfigurations-/Auswahlwechsel und nicht wiederholbare Fehler beenden die
automatische Korrektur. Korrekturen übernehmen kein Modell automatisch und
ändern die Denkstufe nicht. Erst die bestätigte Übernahme erzeugt einen
Rückgängig-Schritt. Die Vorschau enthält bereits ihren berechneten Nachzustand.

## Kompatibilität und Datenschutz

Keine neuen Modellbefehle und kein neues Projektformat. Die Programme bleiben
getrennt; bisherige Ausgaben und Nutzerinstallationen werden nicht ersetzt.
Prüfungen verwenden synthetische Modelle, isolierte Profile und lokale
Anbieterersatzantworten. Die neuen Funktionen benötigen keine zusätzlichen
kostenpflichtigen Anbieteraufrufe zur Abnahme.
