# Private KI-Startdiagnose

## Verbindlicher Umfang
- A: bisheriger kompakter Einstieg; B: passende Wegweiser; C: passende exakte Werkzeugauskünfte. Auftrag, Ausgangsmodell, Auswahl, Werkzeugmenge und Limits innerhalb eines Vergleichs gleich. Kein vorheriger Chatverlauf, keine fertigen Testlösungen im Einstieg. Auskünfte aus tatsächlichen Definitionen, vollständiger Katalog weiter lesbar. Vorbereitung zählt zur Zeit.
- Aufklappbare KI-Diagnose: Modell/Variante/Denkstufe/Status, tatsächlich gesendeter Kontext, nachgelieferte Auskünfte, Anbieter-Denktext (kein vollständiger interner Einblick), Werkzeuge/Ergebnisse/Modellbild, Zeiten/Token/Cache, Abbruch/Wiederholung/JSON/Markdown. Keine Geheimnisse, lokal löschbar.
- Sechs Aufgaben: Teilgewinde mit Gesamtlänge, Bohrung, Skizze mit Loch und Extrusion, Kreismuster, Aushöhlen, Zeichnung. Erste Runde 54 Startversuche (6×3×3), bis Modellvorschlag oder drei Auskünfte. Zweite Runde 72 vollständige Läufe (6×3×2 Varianten×2 Wiederholungen), beste neue Variante gegen A pro Denkstufe. Wechselnde Reihenfolge, gleiche Limits. Ergebnisse/Bestandserhalt vor Zeit/Verbrauch bewerten. Ungültiges JSON, Limits und Abbrüche getrennt. Bei Blockade frühe KI-Diagnose mit tatsächlichem Fehler vergleichen.
- Isolierte Testprojekte; Abbruchweitergabe; automatische Zeitlimits und Abbruch identischer Fehlversuche/unzulässiger Aktionen. Nicht anhand einzelner Denktextformulierungen abbrechen. Unabhängige native/geometrische bzw. strukturelle Prüfung.
- Private Windows-x64-EXE mit separatem Profil, vorbereiteten Aufgaben; kein Installationsersatz/keine Veröffentlichung. Quellen-/UI-/Paketprüfung einschließlich Start, Liveanzeige, Abbruch, Export und regulärem Ende.

## Zusätzliche Nutzeraufträge
- Start/Stopp durch Versuchsleitung; sichtbares Fenster zum Mitgucken.
- Laufende Input-/Output-/Cache- und EUR-Kosten; Gesamt aller Tests einschließlich Fehlversuche und Vorversuche dauerhaft addieren. Fehlende End-Usage kenntlich machen.
- Abgleich mit tatsächlicher DeepSeek-Usage-Seite (Schlüssel/Zeitraum, fünf Minuten Verzögerung beachten).
- Bild am Anfang zusätzlich vergleichen: 36 gepaarte kurze Läufe, sechs Aufgaben × drei Denkstufen × mit/ohne Bild, jeweilige neue Finalistenvariante, gleiche eingefrorene Szene. Basisserie bleibt gesondert.

## Umsetzung und Nachweise
Quellzweig codex/ki-startdiagnose, Basis 00016b8. backend/ai-diagnostics.cjs orchestriert den vorhandenen Responses-Transport und echte isolierte Electron-Modellierer. 120 Sekunden Startlimit, 360 Sekunden Modellierlimit; maximal 20 Agentenrunden. Eingefrorene Projekte, Startbilder und Quell-/Fixturehashes im lokalen Diagnoseverzeichnis. Variante A ist der kompakte JSON-Agenten-Testvertrag mit derselben begrenzten Werkzeugmenge wie B/C. Allgemeine Produkt-KI unverändert; nicht mit einem nativen Tool-Protokoll vermischen.

Startvalidierung prüft veröffentlichtes Schema/Parametergrenzen, nicht bereits geometrische Richtigkeit. Erst Vollausführung und unabhängige native Prüfungen belegen ein richtiges Modell. Anbieterfehler/JSON-Fragmente sind gesonderte Resultate. Mehrere strukturelle Verbesserungen am Prüftreiber während der ersten Runde: in Berichten offenlegen; keine beliebigen Vorversuche zu einer gepinnten Kohorte zusammenzählen.

Live-Verbrauch nutzt API-Usage, Cache ist im Input enthalten. UTC-Offpeak sicher außerhalb der Tarifgrenzen wird konkret berechnet; mögliche Peak-/Feiertags- oder unbekannte Cacheanteile als Spanne. Euro ist EZB-Umrechnung, keine Bank-/Steuerrechnung. Unterbrochene Antworten ohne Usage können zusätzliche Kosten verursachen.

Aktueller realer Abgleich: 57 Läufe/94 Antworten (54 Startversuche plus drei Piloten) stimmen mit DeepSeek-CSV 05.11.2026 20–21 Uhr GMT+1 überein: Input 3.094.412, davon Cache 1.953.920, Output 103.569; 0,23907696 USD. Berechnung und Anbieterbetrag identisch. Exportstand 20:31 vor weiteren Versuchen; kein allgemeiner Tagesgesamtbetrag. Personen-/Zugangsdaten nicht im gemeinsamen Dokument.

Testnachweise lokal unter work/diagnostic-native und work/provider-reconciliation.json. 54 Startversuche, 36 Bildstarts und 72 vollständige Modellierläufe abgeschlossen. Die Vollserie erreicht 23 native Erfolge: A 7/36, C 16/36. Viele Fehlläufe betreffen Antwortformat und Vorschau-Recovery; diese Untersuchung ersetzt keinen eingefrorenen Leistungsbenchmark. Die Bildstarts verwendeten die frühere Vorauswahl B/low und C/high/max und bleiben gesondert.

## Ergänzung: Auswahl innerhalb einer Baugruppe und Übungsmodus
Eine synthetische Fräsbaugruppe mit 23 nativen Teilen enthält genau eine ausgewählte Welle. Auftrag: Ø16 auf Ø14, Länge 80 und Lage erhalten, alle 22 übrigen Modellknoten bytegleich. 21 zusätzliche Startläufe vergleichen alle drei Denkstufen: API-Agent mit voller/ausgewählter Szene jeweils mit/ohne Bild; Übung mit ausgewählten Aliasen ohne Bild sowie Gesamt-/Auswahlbild. Sechs vollständige Anschlussläufe prüfen Agent und echte sichtbare Übung je Denkstufe. Diese Ergänzung gehört nicht zur ursprünglichen 54/72-Matrix.

Die Übung erhält ausschließlich den vorhandenen gesperrten Übungsvertrag und Werkzeugauskünfte mit practiceOnly. Die lokale Projektkopie bleibt im isolierten Kindprozess; ihr Modellbaum wird nicht in den generischen Providerkontext übernommen. Wiedergabe nutzt den vorhandenen practice-runner und reale UI-Aktionen, anschließend unabhängige native Geometrieprüfung. Kein direkter Geometrie-Fallback. Auswahlbild bedeutet auf das Teil eingezoomte Kamera; Nachbarteile bleiben sichtbar und im Projekt erhalten.

## Abschluss der privaten Untersuchung

Die 21 Auswahlstarts und sechs vollständigen Auswahltests sind abgeschlossen. Ein Agentenlauf bestand; zwei scheiterten am JSON-Format. Zwei Übungspläne wurden vor Ausführung am Schema abgelehnt. Der dritte wurde sichtbar ausgeführt, verschob aber die Welle durch den Größenanker um −1 mm in X/Y und bestand deshalb nicht. Alle unbeteiligten Teile blieben erhalten.

Danach erhielt der Diagnosepfad dieselbe Begrenzung auf zwei Formatkorrekturen wie der normale Übungsmodus. Drei getrennte Nachtests auf low/high/max: low änderte nur eine Querachse; high änderte beide Querachsen ohne Lagekorrektur; max setzte zusätzlich die Position und bestand. Die Nachtests benötigten keine Formatkorrektur und belegen deshalb keinen kausalen Vorteil dieser Korrekturrunde. Die ursprünglichen sechs Resultate wurden nicht ersetzt. Insgesamt 197 protokollierte Cloud-Versuche einschließlich drei Piloten und zwei Paketprüfungen; native Referenzprüfungen erzeugten keinen API-Verbrauch.

29 gezielte Tests und 128 Standardtests bestanden. Native Referenzmodelle, Gegenbeispiele, reale Übungswiedergabe und gepackte Windows-x64-Ausführung einschließlich Schema, Modellierung, Screenshot und regulärem Kindprozessende geprüft. Hauptfenster regulär per Alt+F4 geschlossen, Prozess-Exit0 protokolliert. Ein Kindprozess der 72er-Serie benötigte das Schließlimit; dessen Status bleibt gesondert sichtbar. Private Ausgabe 0.128.0-r1 mit separatem Profil; keine Veröffentlichung und kein Installationsersatz. Vergleich, Einzelprotokolle und datierter Anbieterabgleich liegen lokal im Diagnoseverzeichnis der Testausgabe.
