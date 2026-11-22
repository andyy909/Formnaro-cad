# Wartbarkeit Phase 3

Vorher-Referenz ist der Abschluss von Phase 2 auf Commit
`2c255541b783d16daaef495b1cc1cbd37f4e0f2b`. Der annotierte Referenztag
`wartbarkeit-phase2-baseline` bleibt lokal. Die private Ziel-Minor-Version ist
`0.143.0`.

Die Wartbarkeitsüberarbeitung für 0.143.0 verändert durch Umformatierung und Modulumbau den sourceHash. Frühere Benchmark-Ergebnisse bleiben ihrem ursprünglichen Quellstand zugeordnet und gelten nicht als Nachweis für den neuen Stand. Neue Vergleiche müssen Commit und sourceHash gesondert ausweisen.

## Quellprüfung unter Windows und Linux

Die Quell-CI läuft für Pull Requests zu allen Zielbranches und bei Pushes
auf `main` oder Tags. Je Plattform teilt sie die grünen Node-Dateien anhand
der Laufzeitdaten auf zwei Gruppen auf. Neue Einträge ohne Messwert
erhalten zunächst ein Gewicht von einer Sekunde.

`npm run test:all -- --verify-coverage` prüft die Erfassung und Auswahl
anhand des tatsächlichen Dateibestands und des Manifests. Der Befehl
meldet klassifizierte Ausnahmen und schreibt das Manifest nicht neu.
`npm run test:all -- --shard=1/2 --balance-by-duration=ci --list` zeigt
die Auswahl der ersten Gruppe auf der aktuellen Plattform. `npm run
test:all` führt die betreffende Node-Auswahl seriell aus.

Die CI vergleicht pro Gruppe die erwarteten, ausgewählten und erfolgreich
ausgeführten Dateien. Der PR-Check `windows-source` verlangt beide
Windows-Gruppen. Fehlschläge auf Linux lassen den Workflow fehlschlagen.
Die bestehenden CI-Jobs für Mini-CAD und Mini-Netz laufen in den
jeweiligen Teilprojekten.

## Ausnahmen von der Formatprüfung

Für Phase 3 muss der Syntaxbaum nach der Formatierung dieselbe Struktur
haben. Die gepinnte Prettier-Version verändert sie bei den folgenden
sechs Pfaden. Die Dateien stehen deshalb dauerhaft außerhalb der
Formatliste `.prettier-done.txt`.

| Datei | Abweichung des Formatters im Syntaxbaum |
| --- | --- |
| `src/cad-drive-ui.js` | Die Statusschlüssel `'interference'`, `'contact'` und `'separated'` werden von String-Literalen zu Bezeichnern. |
| `src/cad-freecad-document-ui.js` | Der Schlüssel `'expression'` für durch Formeln gesteuerte Eigenschaften wird vom String-Literal zum Bezeichner. |
| `src/cad-mesh-tools.js` | Die Klammergruppe um die Gültigkeitsprüfung von Zerlegung und Verbindern fällt weg. Dadurch wird die ODER-Kette für das Deaktivieren von „Übernehmen“ neu gruppiert. |
| `src/cad-practice-runner.js` | Die ODER-Kette in der Ereignisprüfung wird durch Entfernen der Klammern um den Treffer in Overlay oder Sitzungsleiste neu gruppiert. |
| `src/cad-solid-state.js` | Die Ansichts-Tastenkürzel `'1'` bis `'7'` werden im Objekt von String- zu Zahlenliteralen. |
| `src/mesh-curved-reduce.js` | Das Semikolon nach der Prüfung des Abweichungslimits entfällt. Damit verschwindet eine leere Anweisung aus dem Syntaxbaum. |

Die Ausnahme betrifft die automatische Formatierung. Fachliche Änderungen
an diesen Dateien folgen den zugehörigen Tests.
