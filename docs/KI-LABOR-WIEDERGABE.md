# KI-Labor: Wiedergabe ohne KI

Gespeicherte Laborläufe lassen sich gegen einen neuen Programmstand erneut ausführen, ohne eine Anbieteranfrage zu stellen. Die Anwendung rechnet, bedient, prüft und bewertet dabei vollständig neu. Nur das Modell wird durch seine wörtlich aufgezeichneten Antworten ersetzt.

Damit trennt das Labor zwei Fragen, die bisher in jedem Live-Lauf vermischt sind:

| Frage | Werkzeug |
| --- | --- |
| Hat eine Programmänderung bestehende, früher erfolgreiche Abläufe beschädigt? | **Wiedergabe:** 0 Tokens, reproduzierbar, in Minuten |
| Wie gut versteht ein Modell den Auftrag? | **Live-Lauf** wie bisher |

## Funktionsweise

`createDiagnostics()` erhält den Anbieter bereits als Parameter (`provider`). Die Wiedergabe setzt dort `createReplayProvider(transcript)` ein. Er liefert je Runde die gespeicherte `response` des Originallaufs zurück. Der übrige Laborablauf bleibt unverändert: Formatkorrekturen, Werkzeugauskünfte, Übungsfenster und native Prüfung laufen wie bei einem echten Versuch.

1. `extractTranscript(record)` entnimmt die Modellantworten des Originallaufs in Rundenfolge und das **Original-Ausgangsmodell** (`fixture`) samt SHA-256-Hash, Ausgangsrevision, Objektbezügen und Herkunft (Quelllauf, Quellhash, Modell, Aufgabe, Serie).
2. Eine **getrennte Laborinstanz** führt dieselbe Bedingung mit `replayPlan(spec)` aus: eigenes Verzeichnis, Abschlussauswerter aus, Überwacher aus, `credentials: replayCredentials(transcript)` und **kein** `connections`. Damit berührt sie weder den Modellkatalog noch die Anmeldung des echten Anbieters. Die Denkstufe ist `auto`, weil sie nur an den Anbieter ginge.
3. `replayRecords()` übergibt der Wiedergabe-Instanz über `start({fixture, replay})` das Original-Ausgangsmodell und die Herkunftskennung. Die Instanz öffnet exakt dieses Modell und prüft Hash, Ausgangsrevision und Objektbezüge **vor der ersten Modellanfrage**. Jede Speicherung des Laufs enthält den Replay-Marker; er bleibt also auch nach Neustart und Neulesen von Platte erhalten.
4. `compareReplay()` vergleicht alle entscheidungsrelevanten Rückmeldungen der Anwendung je Runde: `tool-result`, `format-feedback` und `practice-ui-feedback` (Felder `phase`, `reason`, `verification` **und die tatsächlich übermittelten nativen Messwerte `measurements`** mit id/name/worldBounds/volume). Zeiten, Dateipfade, Bilder und die Kennung des frischen Übungsfensters (`freshRevision`) werden dabei ausgeblendet; fachliche Felder wie `params`, `format`, `verification`, Messwerte und CAD-Quellpfade in `target.path` bleiben erhalten. Ändert sich z. B. das Volumen eines gemessenen Teils von 100 auf 200, ergibt die Wiedergabe `diverged` in dieser Runde – also vor der nächsten Modellantwort.
5. **Früh-Stopp:** Reicht die Wiedergabe-Instanz ihre Ereignisse live weiter (`createRunner(provider, transcript, {onEvent})` → `createDiagnostics({onEvent})`), prüft die Wiedergabe vor jeder gespeicherten Antwort die bereits erfassten Rückmeldungen. Entscheidend ist, ob überhaupt ein Ereignis den Kanal erreicht hat (`channelConnected`), nicht ob Rückmeldungen dabei waren: **Fehlt eine erwartete Rückmeldung bei angeschlossenem Kanal, gilt das als Abweichung**; ebenso bei inhaltlich abweichender Rückmeldung. Dann wird die **nächste gespeicherte Antwort nicht mehr ausgegeben**: Fehler `REPLAY_EARLY_DIVERGENCE`, im Ergebnis `earlyStop: {answerIndex, round}` und `unusedResponses > 0`. Identische Rückmeldungen ergeben keinen Früh-Stopp (alle Antworten werden gespielt). Ohne angeschlossenen Kanal bleibt es beim Nachher-Vergleich (kein Früh-Stopp).

## Einordnung

| Ergebnis | Bedeutung | Nächster Schritt |
| --- | --- | --- |
| `reproduced` | Original und Wiedergabe nativ bestanden | – |
| `regression` | Original bestanden, Wiedergabe nicht, ohne vorherige Abweichung und ohne Infrastrukturfehler | **Programmfehler** – vor Veröffentlichung beheben |
| `fixed` | Original nicht bestanden, Wiedergabe bestanden | Behebung bestätigt; kein Modellerfolg |
| `still-failing` | beide nicht bestanden | unverändert |
| `diverged` | Die Anwendung meldete dem Modell **vor seiner letzten Antwort** etwas anderes zurück, die Aufzeichnung reicht nicht aus, bleibt unverbraucht **oder** Original/Wiedergabe scheiterte an Infrastruktur bzw. Abbruch | Live-Lauf nötig; keine Aussage über das Programm |
| `not-comparable` | Ausgangsmodell fehlt, weicht ab, die Replay-Herkunft wurde nicht gespeichert oder ein Infrastrukturfehler verhinderte den Start | Lauf ist nicht vergleichbar; Grund steht im Bericht |
| `not-replayable` | Lauf eignet sich nicht (siehe Grenzen) oder ist selbst eine Wiedergabe | Grund steht im Bericht |

Abweichungen nach der letzten Modellantwort gelten nicht als `diverged`, denn dort trifft das Modell keine Entscheidung mehr; sie bestimmen nur das Ergebnis.

Infrastruktur- und Abbruchfehler (`failureClass` `infrastructure` bzw. `interrupted`) erscheinen als `diverged` mit `infrastructure: true`; je Seite nennt `failureClass` den Grund. Sie werden nie als `regression` oder `fixed` ausgegeben. Der Bericht listet sie zusätzlich unter `summary.infrastructureFailures`.

## Schutz gegen Verwechslung mit Modellergebnissen

- Die Wiedergabe meldet die Modellkennung `replay:<modell>`. Die exakte Modellidentität, die `summarizeBenchmark` für einen bestätigten Erfolg verlangt, ist damit nie erfüllt.
- Gemeldeter Verbrauch: 0 Eingabe- und 0 Ausgabetokens.
- Der Wiedergabelauf trägt dauerhaft `replay: {sourceRunId, transcriptHash, fixtureHash}`. Eine Wiedergabe wird deshalb auch nach Neustart und Neulesen von Platte nicht erneut wiedergegeben (`replayBlocker()`).
- Der Wiedergabebericht nennt je Lauf `sourceRunId`, `replayRunId`, `transcriptHash`, `fixtureHash`, `fixtureFile` und `fixtureOrigin`; `transcriptHash` deckt Antworten und Ausgangsmodell gemeinsam.
- Die Wiedergabe-Zugangsdaten enthalten keinen echten Schlüssel.
- Wiedergaben laufen in einer eigenen Laborinstanz und landen nie in Benchmarkserien.

## Grenzen dieser Ausbaustufe

- **Aktiver Überwacher:** nicht wiedergabefähig, weil er den Ablauf abbrechen kann. Beobachtende Läufe werden ohne Überwacher wiedergegeben.
- **Abgeschnittene Antworten** (`incomplete-response`): wiedergabefähig, sobald ihr Text mitgespeichert wird. Ältere Läufe ohne gespeicherten Text bleiben `not-replayable`. Ein unvollständiger Wiedergabeabschluss (z. B. `truncated`) wird regulär gespeichert, trägt den Replay-Marker und ist danach gesperrt.
- **Startbilder:** in dieser Stufe ausgeschlossen.
- **Revisionen:** Das Original-Ausgangsmodell wird samt Hash mitgeführt und vor der Ausführung geprüft. Ältere Läufe ohne gespeichertes Ausgangsmodell oder abweichende Ausgangsdaten ergeben ausdrücklich `not-comparable` statt eines scheinbaren Ergebnisses. Eine Zuordnung alter auf neue Revisionen bei nachweislich gleicher Ausgangsgeometrie bleibt Ausbau 4. **Hinweis für die spätere native Abnahme:** Sechs historische Fälle ohne gespeicherte Ausgangsrevision sind damit `not-comparable`; für die native Abnahme ist ein frisch vollständig aufgezeichneter Fall zu verwenden.
- **Speicherbedarf:** `record.fixture` enthält das vollständige Ausgangsprojekt je Lauf. Für Serien mit großen Modellen wächst damit das Protokoll; der Zustand für die Oberfläche enthält nur die Zusammenfassung (Hash, Revision, Objektbezüge), der Einzel-Export den vollständigen Datensatz.

## Eingabe und Bericht

`replaySeries({diagnostics, seriesId, createRunner, directory})` gibt alle Läufe einer Serie wieder und schreibt genau **einen eigenen Bericht je Wiedergabe** nach `<directory>/<seriesId>/Wiedergabe-<replayId>.json`. `replayId` ist eine neue UUID je Aufruf; der Pfad steht im Ergebnis (`path`), die Kennung in `replayId`. Frühere Berichte – auch der alte feste Name `Wiedergabe-<seriesId>.json` – werden nie überschrieben (neue Datei mit `wx` geöffnet). Sie liest die Hauptinstanz nur.

Bricht ein Wiedergabelauf wegen eines **Infrastrukturfehlers beim Start** ab – auch wenn bereits das Anlegen der Wiedergabe-Instanz (`createRunner`) scheitert – beim eigentlichen Start (z. B. `EPERM`, `EACCES`, `ENOSPC`, `EBUSY`, `EMFILE`, `ENFILE`, `EIO`, `EROFS`, `LAB_STORAGE_FAILED` – der Code, den `save()` nach einem Schreibfehler nach außen gibt, `causeCode` trägt dann z. B. `EPERM` – sowie `LAB_INFRASTRUCTURE_FAILED`, mit dem die Diagnostik eine Serie nach einem infrastrukturfehlgeschlagenen Lauf abbricht), bleiben bereits abgeschlossene Läufe erhalten. Zusätzlich gilt ein Startfehler als Infrastruktur, wenn das bereits vorliegende Laufprotokoll die `failureClass` `infrastructure` hat. Der Bericht wird trotzdem geschrieben und trägt `incomplete: true`, `incompleteReason` und `infrastructureErrors: [{sourceRunId, code, causeCode?, failureClass?, message}]`; der betroffene Lauf steht als `not-comparable` mit `infrastructure: true` und `error` (inkl. `causeCode`/`failureClass`) in den Ergebnissen. Die Summary nennt ihn unter `infrastructureFailures` und setzt `incomplete: true`. Unbekannte/nicht-infrastrukturelle Startfehler (z. B. `REPLAY_BROKEN`) brechen die Serie weiterhin sichtbar ab; es entsteht dann kein als vollständig erscheinender Bericht.

`replayRecords(records, …)` braucht vollständige Protokolle mit `events`, also aus `diagnostics.read(id)`. `diagnostics.state().records` enthält keine Ereignisse. Für den Früh-Stopp liefert `createRunner` als dritten Parameter `{onEvent}`; die Wiedergabe-Instanz muss diesen an `createDiagnostics({onEvent})` weiterreichen (eigene `onEvent`-Verarbeitung ist erlaubt). Der Rückgabewert ist der Berichtsinhalt (`FormnaroReplayReport`, Version 3) mit `results`, `summary` und je Lauf Herkunft, Hashes und ggf. `earlyStop`.

## Weiterer Ausbau

Anbindung im Hauptprozess, Knopf im Benchmark-Reiter und Referenzaufzeichnungen für die Release-Abnahme sind für Etappe 1 vorgesehen.

## Gepinnte Dateien neu binden

Beide Benchmark-Suiten halten den SHA-256 von rund 30 Dateien fest, darunter `backend/ai-diagnostics.cjs` und `backend/desktop-ai.cjs`. Nach jeder Änderung an einer dieser Dateien verweigert `verifySuite()` den Benchmark, bis die Suite neu gebunden ist:

```sh
node scripts/repin-benchmark-suites.mjs --check
node scripts/repin-benchmark-suites.mjs --reason "Short reason. Tasks and native predicates unchanged."
```

Das Skript übernimmt die neuen Hashes, erhöht die Patch-Version der betroffenen Suite, setzt `revisionReason` und gleicht `tests/ai-advanced-benchmark.test.cjs` an. Aufgaben, Grenzen und Kalibrierbeleg bleiben unverändert. Ändert sich ein Prüfer fachlich, ist stattdessen eine neue native Kalibrierung nötig. Die Reparaturen R1 und R3 haben `backend/ai-diagnostics.cjs` geändert und die Suiten entsprechend kontrolliert neu gebunden; jede weitere Änderung verlangt erneut `--check` und ein begründetes Neubinden.

## Tests

`tests/ai-lab-replay.test.cjs` zeichnet echte Laborläufe mit einer Kindprozess-Attrappe auf und gibt sie über `createDiagnostics()` wieder. Geprüft werden:

- gleiche Antworten ohne Unterschied und ohne Tokens, auch wenn der Originallauf eine andere Denkstufe und einen anderen Anbieter hatte;
- keine Zählung als Modellerfolg;
- Original-Ausgangsmodell trotz wechselnder IDs, fehlende/abweichende Ausgangsdaten als `not-comparable`;
- geänderte Rückmeldung in Runde 0 wird als Abweichung erkannt;
- `practice-ui-feedback` (reason/phase/verification) vor der nächsten Antwort ergibt `diverged`, `freshRevision` bleibt neutral;
- die tatsächlich übermittelten nativen Messwerte (Volumen/Geometrie) stehen im Ereignis und ergeben bei Änderung `diverged`;
- Normalisierung entfernt nur flüchtige Felder; `params.diameter` bleibt sichtbar;
- Infrastruktur-/Abbruchfehler ergeben kein `regression`/`fixed`;
- ein Fehler beim Anlegen der Wiedergabe-Instanz (`createRunner`, z. B. EPERM) sichert den unvollständigen Serienbericht ebenso wie ein Startfehler, solange er als Infrastruktur klassifiziert ist; unbekannte Anlegefehler bleiben sichtbar;
- erschöpfte Aufzeichnung wird als Abweichung erkannt;
- nicht wiedergabefähige Läufe werden benannt;
- die Einordnung reproduziert, Regression, behoben;
- abgeschnittene Antworten mit gespeichertem Text;
- Replay-Marker übersteht Speichern und Neulesen von Platte;
- jede Wiedergabe schreibt einen eigenen Bericht, frühere Berichte und Altberichte bleiben bytegleich;
- Infrastruktur-Startfehler sichern den Serienbericht als unvollständig (`incomplete`, `incompleteReason`, `infrastructureErrors`), einschließlich `LAB_STORAGE_FAILED` (Schreibfehler) und `LAB_INFRASTRUCTURE_FAILED` sowie über die `failureClass` des Laufprotokolls; unbekannte Startfehler brechen weiterhin ab;
- eine ganze Serie mit Bericht auf der Platte;
- frühe Abweichung stoppt die Wiedergabe vor der nächsten gespeicherten Antwort (`earlyStop`, `REPLAY_EARLY_DIVERGENCE`, `unusedResponses`); fehlende erwartete Rückmeldungen bei angeschlossenem Kanal zählen als Abweichung, ohne Kanal bleibt es beim Nachher-Vergleich.

```sh
node --test tests/ai-lab-replay.test.cjs tests/repin-benchmark-suites.test.mjs
```
