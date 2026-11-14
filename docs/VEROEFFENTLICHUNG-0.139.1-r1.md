# Formnaro 0.139.1-r1

Diese Ausgabe enthält alle Verbesserungen der Integration 0.139.0 und die anschließenden Prozess-/KI-Antwortkorrekturen. EXE, app.asar und Windows-ZIP werden unverändert aus dem geprüften Paket übernommen. Quellcode, native Quellen und Prüfnachweise stehen als separate Downloads bereit.

## Verbesserungen seit 0.138.2-r4

- Übungsbeobachter bleiben nach einem Neustart erreichbar; erneuerte Zugangsdaten erreichen die Desktop-Anbieteranfrage.
- Laborprotokolle werden atomar gespeichert. Dauerhafte Speicherfehler stoppen die Serie und zählen als technische Fehler.
- Werkzeugaufrufe, Rückfragen und Abschlüsse sind eindeutig getrennt. Rückmeldungen nennen ungültige Felder, Werkzeugnamen, Ergebnisaliase und die bestätigte Vorschau-Revision.
- Der Abschlussauswerter erhält Werkzeugfehler, Überwachungsmodus und gekennzeichnete Kürzungen; seine Vorschläge werden auf sechs priorisierte Punkte begrenzt.
- Alte exakte Kantenbezüge affiner Skizzen bleiben über die erhaltene native Geometrie auflösbar; kein Ersatz durch den nächstgelegenen Bezug.
- Nach getrenntem IPC wartet das Labor bis insgesamt 120 Sekunden auf den tatsächlichen Prozessabschluss. Nur Exitcode 0 ohne Zwangsbeendigung zählt als Erfolg. Verbundene hängende Prozesse behalten die 30-Sekunden-Frist.
- Ungültige KI-Antworten mit erfundenen Werkzeugresultaten gelangen nicht erneut als gültiger Assistentendialog ins Modell. Die Korrektur nennt den bestätigten Szenenstand; ungültige JSON-Präfixe werden nicht ausgeführt.

## Belegte Prüfungen und Grenzen

128 Standardtests und 152 gezielte Regressionen bestanden. Das Endpaket bestand acht native Positivreferenzen und 24 Negativgegenproben. Vier neue DeepSeek-Flash/high-Liveversuche (Zeichnung und Bohrung je zweimal) bestanden vollständig; 30 Modellanfragen, eine erfolgreiche Formatkorrektur. Ein echter Prozess brauchte 93,995 Sekunden zum regulären Ende. 20 lokale Wiederholungen alter Antworten endeten regulär; zehn absichtlich enthaltene alte JSON-Fehler blieben abgewiesen. Diese Wiederholungen sind keine neuen KI-Erfolge.

Der vorausgehende breite Entwicklungslauf meldete 3.211 Fälle: 3.181 bestanden, 28 fehlgeschlagen, zwei abgebrochen. Die 30 Fehler-/Abbrucheinträge wurden durch gezielte erfolgreiche Nachprüfungen abgedeckt. Ein neuer unveränderter grüner Gesamtlauf liegt nicht vor. Die historischen 256 Laborversuche umfassen 227 bestätigte Ergebnisse, neun Modellfehler und 20 technische/abgebrochene Versuche über mehrere Builds; dies ist keine gemeinsame Modellrangliste.

Offen bleiben weitere Bild-, Überwacher- und Sol-Vergleiche, die genaue native Ursache langsamen Prozessabbaus und weitere ältere Modellierfälle. KI-Formatfehler bleiben möglich. Die vier neuen Nachtests sind kein vollständiger Benchmark und kein Nachweis allgemeiner Fehlerfreiheit. Historische Ergebnisse und Prüfsummen bleiben unverändert.

## Download und Start

Das Windows-x64-ZIP vollständig entpacken und Formnaro/Formnaro.exe starten; alle benachbarten Ressourcen zusammenlassen. Das KI-Testlabor liegt unter Einstellungen > KI / API > KI-Testlabor. Programmquellen sowie CAD-/FreeCAD-Quellen sind separat verfügbar. SHA256SUMS.txt bindet die Downloads.

EXE SHA-256: `32068dcc5353edaa75254aea4fc945e4bc6992f21a903af2833f4867fb2ce3e9`

app.asar SHA-256: `9eb785082900cc8005835b12e7fdd88861b0f67fa3fff4bd98ca7139506494a2`
