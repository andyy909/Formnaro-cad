# Wartbarkeit Phase 3

Vorher-Referenz ist der Abschluss von Phase 2 auf Commit
`2c255541b783d16daaef495b1cc1cbd37f4e0f2b`. Der annotierte Referenztag
`wartbarkeit-phase2-baseline` bleibt lokal. Die private Ziel-Minor-Version ist
`0.143.0`.

Die Wartbarkeitsüberarbeitung für 0.143.0 verändert durch Umformatierung und Modulumbau den sourceHash. Frühere Benchmark-Ergebnisse bleiben ihrem ursprünglichen Quellstand zugeordnet und gelten nicht als Nachweis für den neuen Stand. Neue Vergleiche müssen Commit und sourceHash gesondert ausweisen.

## Windows-Quellprüfung

Die CI verteilt die grünen Node-Dateien aus `tests/manifest.json` anhand ihrer
gemessenen Laufzeiten auf zwei Windows-Runner. Neue grüne Einträge ohne
Messwert erhalten zunächst ein Gewicht von einer Sekunde. Mit
`npm run test:all -- --shard=1/2 --balance-by-duration --list` lässt sich die
Auswahl des ersten Teillaufs ausgeben. `npm run test:all` bleibt der serielle
Aufruf. Der PR-Check `windows-source` verlangt den Abschluss beider Teilläufe.

Ein Branch-Push kann auf die Quellprüfung verzichten, wenn für denselben
Commit bereits ein passender Lauf dieses Workflows zum offenen PR vorliegt.
Für den Hauptbranch, Tags und Pushes ohne bestätigten PR-Lauf bleibt die
Quellprüfung beim Push aktiv.
