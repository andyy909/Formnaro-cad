# DeepSeek-CAD-Vergleich für Formnaro

Stand: 14.10.2026. Modell `deepseek-flash` (V4.1 Flash), direkte Responses-API.

Drei synthetische Aufgaben wurden jeweils zweimal mit high und max ausgeführt. In der zweiten Runde war die Reihenfolge umgekehrt. Alle 12 Ergebnisse bestanden native Vorschau, unabhängige Maß-/Volumen- beziehungsweise Parameterprüfung und Apply/Undo in getrennten Prüfprojekten. Das persönliche Projekt und die gespeicherte Anbieterdatei wurden nicht verändert.

| Denkstufe | Bestanden | Median API-Zeit | Zeitspanne | Eingabe-Tokens | Ausgabe inkl. Denken | Davon Denken | Geschätzte Kosten, alle 6 Fälle |
|---|---:|---:|---:|---:|---:|---:|---:|
| high | 6/6 | 3.69 s | 3.21–25.76 s | 124894 | 7117 | 5866 | 0.005317–0.010635 USD |
| max | 6/6 | 5.46 s | 4.53–10.25 s | 124930 | 6276 | 5009 | 0.004818–0.009636 USD |

API-Zeit umfasst Anfrage bis vollständig empfangener Antwort, ohne anschließende native CAD-Berechnung. Kosten verwenden gemeldete Cache-Tokens sowie die veröffentlichten Neben-/Hauptzeitpreise; es ist keine Abrechnung des Kontos. Denk-Tokens sind bereits in den Ausgabetokens enthalten.

## Aufgaben und unabhängige Prüfkriterien

- Platte 60 × 40 × 6 mm mit vier durchgehenden Ø5-mm-Bohrungen bei X=±22, Y=±12: Volumen aus Quader minus vier Zylindern, Außenmaße, Bohrpositionen und fünf editierbare Quellen.
- Vorhandene Gruppenquelle von 6 auf 10 mm Höhe: physische Quellmaße unter vollständiger Transformationsmatrix, bisheriger Boden, Quellenkennungen/Farbe/Name, unveränderte Bohrquelle und unverändertes gesperrtes anderes Teil.
- Natives Zahnrad mit 20 Zähnen, Modul 2, Dicke 6, Bohrung 5: gespeicherte Generatorparameter, geschlossener positiver Körper und Dicke.
- Für jeden Fall: vor Apply identischer bestätigter Stand und unveränderte Undo-Tiefe; genau ein Apply/Undo stellt den ursprünglichen synthetischen Stand wieder her.

## Einordnung

Beide Stufen erfüllen in dieser kleinen Stichprobe dieselben Konstruktionsaufgaben. high bleibt Standard, max steht für schwierige Aufgaben zur Verfügung. Ein einzelner langsamer high-Lauf erhöht dessen Mittelwert und Verbrauch; daraus folgt keine allgemeine Geschwindigkeits- oder Kostengarantie. Zwei Durchläufe je Aufgabe ersetzen keinen breiten CAD-Benchmark.

In den angenommenen Live-Fällen war keine Fehlerkorrektur erforderlich. Die automatische Korrektur wurde zusätzlich an der tatsächlichen Desktopoberfläche mit einem simulierten Anbieter geprüft: ungültige native Maße, erfolgreicher zweiter Vorschlag, harter Stopp nach drei API-Anfragen, erhaltene Tokenzahlen und unverändertes Modell. Separate Vorläufe mit korrigierten Prüfskripten sind lokal aufbewahrt und wurden nicht als Modellfehler bewertet.

Die ausführlichen synthetischen Befehle und Messwerte liegen lokal unter work/deepseek-cad/comparison.json. Keine Denktexte, Schlüssel, privaten Modelle oder Browserprofile im Bericht.

Quellen: [Modelle und Preise](https://api-docs.deepseek.com/quick_start/pricing/), [Denkmodus](https://api-docs.deepseek.com/guides/thinking_mode/), [Responses](https://api-docs.deepseek.com/guides/responses_api/).
