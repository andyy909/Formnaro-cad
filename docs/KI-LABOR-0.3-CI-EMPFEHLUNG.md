# Empfehlung 0.3: Aufnahme der beiden Replay-Testdateien in Windows- und Linux-CI

Stand: 2026-11-16 (überarbeitet nach Rückmeldung aus der Zweit-PC-Prüfung). Grundlage: Testinfrastruktur auf Phase-2-Abschluss **`2c255541`** (`origin/plan/P2-3b`), read-only geprüft. Branch dieser Arbeit: `ki-labor-replay` (Basis `17a4353`); 0.3 selbst wird auf dem Phase-2-/Wartbarkeitsstand ausgeführt, nicht auf diesem Branch.

## Befund: Wie CI heute Testdateien auswählt

| Baustein | Verhalten auf `2c255541` |
|---|---|
| `npm run test:inventory` → `scripts/test-inventory.mjs` | Scannt `tests/` nach `*.test.*`. **Ohne** Argumente: baut/aktualisiert `tests/manifest.json` (`file`, `referencedBy`, `kind`) und **erhält vorhandene `status`/`seconds`** bereits dokumentierter Dateien. Nur mit `--run`: führt alle Node-Tests neu aus und überschreibt die Messwerte. |
| `npm run test:all` → `scripts/run-tests.mjs` | Wählt aus `tests/manifest.json` Einträge mit `kind === "node"`, `status === "pass"` (mit `--include-failing` zusätzlich `fail`/`timeout`) und `os !== "windows" || win32`. `--shard=i/n` verteilt die Auswahl reihum. Exit 1 bei `fail`/`timeout`. |
| Windows-Job `windows-source` | `npm ci` → `verify-runtime` → `build` → `npm test` (feste Altliste) → **`npm run test:all`** (ungeshardet) → fester `node --test`-Block → benannter Laborblock → Toolchain-Test → `git diff --exit-code`. |
| Linux-Job `linux-node-tests` | `npm ci` → **`npm run test:all -- --shard=i/2`** (Shards 1 und 2). |

`referencedBy` dokumentiert nur wörtliche Vorkommen in `package.json`, `.github/workflows/build.yml` und `scripts/`; die Auswahl steuern ausschließlich `kind`/`status`/`os` im Manifest.

## Empfehlung für `tests/ai-lab-replay.test.cjs` und `tests/repin-benchmark-suites.test.mjs`

Beide Dateien sind plattformneutral (`node:test`, `node:os`-Tempdirs, Kindprozess-Attrappen; kein Electron, keine Windows-APIs) → `kind: "node"`, ohne `os`-Einschränkung, für Windows und Linux.

1. **Dateien ins Repo** (Replay-Patch anwenden); finaler Integrationsstand mit Node 22.23.4 auf Windows.
2. **Inventar ergänzen, ohne neu zu messen:** `npm run test:inventory` **ohne** `--run`. Das legt die beiden neuen Einträge an (kind/`referencedBy`) und lässt alle bereits gemessenen Einträge unverändert. **Kein** `--run` verwenden: Das würde die dokumentierten ~30 Fehlschläge und den einen Timeout erneut messen und die festgehaltenen Statuswerte/Notizen verwässern.
3. **Nur die beiden neuen Dateien messen und ihre Werte eintragen:**
   ```powershell
   Measure-Command { node --test --test-concurrency=1 tests/ai-lab-replay.test.cjs }
   Measure-Command { node --test --test-concurrency=1 tests/repin-benchmark-suites.test.mjs }
   ```
   Ergebnisse als `"status": "pass"` und `"seconds": <gemessen>` in genau diese zwei Manifest-Einträge schreiben; alle anderen Einträge (insbesondere `fail`/`timeout`/`note`) unverändert lassen. Sortierung nach `file` beibehalten, JSON valide halten.
4. **Kontrolle:** Ein kleines Prüfskript bildet die Auswahl aus `run-tests.mjs` nach und zeigt, dass beide Dateien enthalten sind (bzw. `npm run test:all` läuft). Danach `tests/manifest.json` zusammen mit den Testdateien committen.
5. **Damit automatisch in der CI:** Windows über `npm run test:all` (ungeshardet), Linux über `npm run test:all -- --shard=i/2`. Keine Änderung an `build.yml`/`package.json` nötig.
6. **Optional, empfohlen:** benannter Windows-Schritt `node --test --test-concurrency=1 tests/ai-lab-replay.test.cjs tests/repin-benchmark-suites.test.mjs` für schnelles, namentliches Signal und `referencedBy: ["ci"]`. Kein Ersatz für Schritt 2–4.
7. **Nicht** in die feste `npm test`-Liste aufnehmen; `test:all` ist der gemessene Auswahlweg.
8. **Projektkontext bei der Integration zusammenführen:** Der mitgelieferte Nachtrag in `docs/PROJEKTKONTEXT.md` (Abschnitt „2026-11-16 KI-Labor: Wiedergabe-Vertrag") muss mit dem **neueren** Dokument des jeweiligen Integrations-/Wartbarkeitsstands zusammengeführt werden — nicht das neuere Dokument überschreiben. Regeln: neueren Stand als Basis nehmen, unseren Vertragsabschnitt als eigenständigen datierten Eintrag einfügen oder inhaltlich deduplizieren, Widersprüche zugunsten des neueren Stands auflösen und den Vertrag dort nur ergänzen, wo er fehlt.
9. **Pins bleiben unabhängig:** Das Inventar misst Testdateien, keine gepinnten Quellen. `node scripts/repin-benchmark-suites.mjs --check` muss nach Änderungen an gepinnten Dateien (u. a. `backend/ai-diagnostics.cjs`) grün sein; Änderungen an `backend/ai-lab-replay.cjs` benötigen kein Repin.
10. **Abnahme der CI-Aufnahme:** beide Manifest-Einträge `status:"pass"`, `git status` nach dem Commit sauber, `npm run test:all` auf Windows und Linux exit 0. Nicht gemessene Dateien erscheinen in `test:all` nicht — ein nicht eingetragenes Testfile ist faktisch unsichtbar.

## Kurzfassung

> Replay-Patch anwenden; `npm run test:inventory` **ohne** `--run` ausführen; nur die zwei neuen Dateien gezielt messen und ihre `status`/`seconds`-Werte in `tests/manifest.json` ergänzen; Manifest mitcommitten. Danach laufen beide automatisch in `windows-source` (`test:all`) und `linux-node-tests` (`test:all --shard=1/2|2/2`). Bei der Integration den Projektkontext-Nachtrag mit dem neueren Dokument zusammenführen.
