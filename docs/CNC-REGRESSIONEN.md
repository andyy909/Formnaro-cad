# CNC-Regressionen aus dem Gesamtplan

Schritt 2: `node scripts/cnc-regressions.mjs` führt voneinander getrennte,
auf jeweils 240 Sekunden begrenzte Prozesse aus. Jeder Fall liefert Phase,
Dauer, Ergebnis und verfügbare native Speichermessungen als JSON. Ein Zeit-
oder Speicherlimit ist kein bestandener Funktionsnachweis. Native Prozessfehler
bleiben vom Fehler einer Modellübernahme getrennt.

Unter Windows setzt ein Jobobjekt vor dem ersten nativen Kernstart ein
Prozess-Commitlimit von 3 GiB durch; das betrifft V8 und native/WASM-Allokationen
im selben Prozess. RSS und private Bytes werden alle 500 ms erfasst. Bei
fehlgeschlagener Einrichtung startet der native Fall nicht. Die zusätzliche
2-GiB-WASM-Prüfgrenze beendet weitere Schleifendurchläufe. Die Schleife bewegt
die X-Achse der privaten Baugruppe abwechselnd und fragt anschließend native
Szenenmaße und Darstellung ab. Es gibt keine dauerhafte Übernahme oder
Speicherung dieser Teststellungen.

Mit `--project <private Testkopie>` werden zusätzlich Projektlesung,
Acht-Befehle-Korrektur und Szenen-/Darstellungsschleife ausgeführt. Die Datei
wird ausschließlich gelesen; keine Vorschau wird auf die Datei gespeichert.
Persönliche Dateien gehören nicht in Git. `--output <Ordner>` und
`--case rotation,post-commit-refresh` erlauben gezielte Nachprüfungen.

Die acht Korrekturen entsprechen dem damaligen Befehlssinn, richten sich aber
nach erhaltenen Quellnamen im final gespeicherten Projekt. Der ursprüngliche
Zwischenstand vor dem Speicherfehler liegt nicht vor. Ein erfolgreicher Lauf
dieses Falls widerlegt deshalb den damaligen Speicherfehler nicht.

Der lange Tr12×4-Fall verwendet 248 mm Länge und 0,5 mm Einführfase.
Die Muttern prüfen separat Tr12×4/24 mm und Tr10×2/12 mm mit 0,18 mm Spiel.
Der Tr16×4/20-mm-Fall prüft 0°, 3,004649258303339°, 12°, 45° und 90°.
Nach jedem Lagewechsel wird dieselbe lokale BRep erwartet.

Der Übernahmetest injiziert ausschließlich den nachgelagerten Ansichtsfehler
nach einer echten Controllerübernahme. Er ist kein Beleg für einen nativen
Speicherfehler. Die verlorene Antwort, Wiederholung und Undo werden in den
Übernahmeregressionen von Schritt 4 geprüft.

## Ausgangsmessung am 02.11.2026

Rotation: bei 3,004649° Toleranzfehler, bei 12° und 45° veränderte lokale
BRep; 0° und 90° bleiben unverändert. Der injizierte Ansichtsfehler folgt
nach tatsächlicher Übernahme und einer zusätzlichen Undo-Stufe.

Im jeweils frischen Prozess gelingen das 248-mm-Tr12×4-Gewinde mit Einführfase
(70 s), beide Muttern (5–7 s), die acht Korrekturen auf der finalen privaten
Testkopie (99 s) und vier Szenen-/Darstellungsdurchläufe (72 s). Die damaligen
nativen Speicherfehler sind unter diesen begrenzten Bedingungen nicht erneut
ausgelöst. Das ist keine Behebung oder Widerlegung der historischen Fehler.
Die große Projektkopie liegt weiterhin über der 32-MiB-Clientgrenze.

## Fehlerhandlungen ab Schritt 3

Strukturierte Rückmeldungen ergänzen `nextAction`: `change_input`,
`fix_prerequisite`, `stop`; Transportfehler bei Apply können `repeat`
verlangen. `retryable` bleibt für bestehende Clients erhalten. Ein fataler
Kernfehler verlangt Abbruch statt unveränderter Wiederholung. Werkzeugpfad-
und Laufzeitprobleme verlangen zuerst die Behebung der Voraussetzung.
Bekannte Befehlsnummer, Ziel und Phase bleiben erhalten.

Python und beide MCP-Wege behandeln ungültige Transportantworten als
Transportfehler. Bei einer verlorenen Apply-Antwort ist `applied:null` und
`commitStatus:"unknown"` maßgeblich: ausschließlich denselben Übernahmeauftrag
mit ursprünglicher Vorschaukennung und Revision wiederholen. Eine neue
Vorschau könnte bereits übernommene Änderungen doppelt ausführen.

## Übernahmebeleg ab Schritt 4

Erfolgreiches Apply liefert die tatsächlich übernommene `revision` direkt,
unabhängig vom Ergebnis der nachfolgenden Darstellung. `refresh.status` ist
`completed` oder `failed`. Bei einem Ansichtsfehler bleiben `applied:true`,
Übernahmebeleg und Undo gültig; eine aktuelle Szene wird nur mitgeliefert,
wenn sie tatsächlich zu dieser Revision gehört. Dieselbe Vorschaukennung mit
ursprünglicher Revision kann idempotent zur erneuten Aktualisierung aufgerufen
werden. Eine inzwischen andere Modellrevision wird weiterhin abgewiesen.
Auch Fehler synchroner Ansichtsbenachrichtigungen nach dem Commit werden als
Aktualisierungswarnung behandelt. Fehler vor dem Commit ändern nichts.

Der Renderer meldet einen kleinen Übernahmebeleg vor der Ansichtsaktualisierung
an den Desktop. Der Desktop ordnet ihn ausschließlich der passenden aktiven
Apply-Anfrage aus dem Hauptframe zu. Bei Timeout bleibt eine bekannte
Übernahme mit Revision erfolgreich; ohne diesen Beleg wird das Ergebnis
ausdrücklich unbekannt gemeldet. Ältere Renderer ohne Meldung bleiben
kompatibel. Die sichere Wiederholung betrifft denselben Apply-Auftrag.

Die isolierte Desktopprüfung durchläuft echten Renderer, Preload, Desktop-RPC
und HTTP einschließlich des realen 45-Sekunden-Timeouts, einer gespeicherten
Gelenkstellung, Wiederholung und Undo. Sie schließt das Fenster normal und
prüft den regulären Exit. Sie ist keine neue Paket- oder Gesamtabnahme.

## Rotationsstabiles Budget ab Schritt 5

Die Verstärkungsgrenze verwendet die größte Singularzahl der vollständigen
affinen Abbildung und ihrer Inversen. Numerische Jacobi-Diagonalisierung,
Restgliedschranke und ein nach oben gerichteter Rundungsabstand erhalten die
Genauigkeitsgrenze auch bei Skalierung und Scherung. Nur Abweichungen im
Bereich von 32 Maschinen-Epsilon gelten als numerisch starre Lageänderung.
Die Halbierung des Kurvenbudgets für numerische Fehler bleibt bestehen.
Native Rezeptschlüssel sind unabhängig von der Reihenfolge ihrer JSON-Felder.

Der ursprüngliche Tr16×4/20-mm-Fall behält an allen fünf Winkeln dieselbe lokale
BRep, dasselbe Volumen und denselben Konstruktionszähler; eine zusätzliche
Bearbeitung, Speicherung und STEP-Ausgabe ändern diese Quellen nicht.
Vererbte Gruppendrehung, echte Skalierung und Scherung sind gesondert geprüft.
Dies ersetzt keine native Speicheranalyse der langen Arbeitsabläufe.
