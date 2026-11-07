# Formnaro 0.136.0-r3 – lokale Abnahme

Stand: 7. November 2026. Die neue Windows-x64-Ausgabe wurde vor der Veröffentlichung lokal abgenommen. Echte KI-Versuche und der neue 16er-Grundbenchmark bleiben auf ausdrücklichen Nutzerwunsch pausiert.

## Neue Funktionen

Die KI-Modellauswahl zeigt die vorhandenen Ergebnisse samt Säulendiagramm für alle bereits getesteten Modelle, auch ohne eingerichteten Zugang. Vorhandene Belege betreffen Mistral Large 4 und DeepSeek V4.1 Flash. Testreihen und Denkstufen stehen getrennt an jeder Säule; Umfang, Teilstand und ungeprüfte Ergebnisse bleiben sichtbar. Modellkarten öffnen die passenden Details. Die Zuordnung verwendet exakt Anbieter und Modellkennung.

Mitgelieferte Übungsreihen: Mistral 57/72 im Prüfprofilvergleich sowie 13/19 im Katalog; DeepSeek 11/24 in der ersten Gegenserie. Der pausierte DeepSeek-Laborstand enthält 72 Rohversuche, davon 59 vollständig abgenommen. Wiederholungen, eine neutrale Nutzerunterbrechung und fehlende Endabnahmen werden nicht versteckt. Unterschiedliche Aufgaben und Entwicklungsstände erlauben keine gemeinsame Modellrangliste.

Gespeicherte neue Grundbenchmarks des aktiven Profils werden schreibgeschützt beim Öffnen/Aktualisieren ergänzt. Alle 16 geplanten Bedingungen bleiben im Nenner; Suite-Version/-Hash und Programmprovenienz bleiben erhalten. Die Anzeige startet keine Versuche oder Abschlussanalysen. In den mitgelieferten Daten gibt es keinen ausgeführten echten 16er-Grundbenchmark.

## Prüfung

| Umfang | Ergebnis |
|---|---|
| Gesamte lokale Node-Sammlung, 536 Dateien | 3.135 Testfälle ausgeführt, keine übersprungen |
| Rohbefund dieses Gesamtlaufs | 3.123 bestanden, zwölf Befunde in veralteten/unvollständigen Testaufbauten |
| Gemeinsame gezielte Nachprüfung aller zwölf Befunde | 12/12 bestanden, keine offenen Befunde |
| Python, sieben Testdateien | 28/28 bestanden, keine übersprungen |
| Historischer Mesh-Szenentest mit eigener korrekter Mesh-Testseite | Maße, Dezimalkomma, feste Gegenkante, Undo/Redo, Referenzwahl und Ausrichten bestanden |
| Gepackter Renderer, Preload und echte IPC | Diagramm, sieben einschließlich synthetischem lokalem Lauf dargestellte Reihen, nicht eingerichteter Mistral-Zugang, Details, Filter, Modellwahl, Aktualisieren, Wiederöffnen sowie schmale/dunkle Ansicht bestanden |
| Isolierte UI-Paketprüfung | Keine Fokusereignisse, keine echten KI-Anfragen, bestehende Testprotokolle unverändert, reguläres Fensterende und Host-Exit 0 |
| Tatsächliche EXE, native WASM-Bohrung | Vorschau, Schutz, Übernahme, unabhängige native Geometrie und regulärer Prozessabschluss bestanden |
| Tatsächliche EXE, integriertes FreeCAD | 2 × 3 × 4 mm, ausdrücklich unabhängig geprüftes Volumen 24 mm³, Schutz, Übernahme und regulärer Prozessabschluss bestanden |
| Tatsächliche EXE, Normal/Easy/Solid/Fusion | Integrierte native/GUI-Module, Vorschau, Übernahme und jeweils ein Undo bestanden; keine protokollierten Fehler oder externen Rendereranfragen |
| Kopierte FreeCAD-Laufzeit | Alle 14.603 Manifestdateien, 732.313.967 Bytes, vollständig per SHA geprüft |
| Konverter | Alle 1.129 Dateien, 511.425.018 Bytes, bytegleich zur bisherigen Ausgabe |
| Quelle und Paket | 285 Produktquellen und 787 Renderer-/AI-/Asset-Eingaben abgeglichen; zusätzlich erzeugter FreeCAD-Manifest-Pin geprüft |
| Ursprüngliche Ergebnisdaten | 75 Belegdateien einschließlich aller 72 Rohprotokolle unverändert |

Der ursprüngliche Gesamtlauf und seine roten Befunde bleiben erhalten. Er wird nicht nachträglich als unmittelbar vollständig grüner Lauf ausgegeben. Die zwölf betroffenen Bedingungen wurden nach Korrektur der Testaufbauten gemeinsam erneut ausgeführt und bestanden. Die effektive Abnahme deckt damit alle 3.135 Fälle ab. Die 28 Python-Prüfungen und Paketprüfungen sind zusätzlich ausgewiesen; vorherige Teilprüfungen werden nicht nochmals zur Fallzahl addiert.

Die korrigierten Testaufbauten betrafen fehlende Hilfsdateien/Attrappen, die kanonischen bereits gepinnten OFL-Lizenzbytes, ausdrücklich angeforderte Vollauskünfte statt kompakter Szenenstandards und drei UI-Prüfungen, deren bisheriger Einstieg absichtlich einen fremden Autosave-Fehler injizierte. Produktanforderungen und native Benchmark-Prüfer wurden dafür nicht abgeschwächt. Nach dem Gesamtlauf änderte sich im Renderer nur das Ausgabelabel auf r3; der Workspace wurde danach erneut gebaut und Vertrag/Benchmark-Anzeige gezielt geprüft.

## Zusätzlich behobene Produkt- und Paketfehler

Der bereits vorhandene Endpunkt `POST /v1/screenshot` fehlte im gemeinsamen KI-Kontext. Kontext und generierte OpenAPI verwenden nun konsistent sein eigenes Screenshot-Schema.

Der privaten bisherigen Paketbasis fehlte die für gepacktes FreeCAD erforderliche Manifest-Prüfsummendatei. Eine tatsächliche FreeCAD-Vorschau in der alten Kandidatenausgabe reproduzierte die Nichtverfügbarkeit. Der Paketbau erzeugt den Pin nach vollständiger Prüfung der Laufzeit und prüft künftig auch die kopierte Laufzeit erneut. Drei zusätzlich fehlende QtQuick/Layouts-Dateien wurden im neuen Kandidaten aus der vollständigen lokalen Laufzeit hergestellt: jede Datei stimmt exakt mit dem unveränderten portablen Manifest überein. Die vorherige Ausgabe wurde nicht verändert. Im endgültigen Paket bestehen sowohl der konkrete FreeCAD-Regressionsfall als auch die Prüfung aller vier Arbeitsmodi.

## Ausgabe und Grenzen

Programm: `Formnaro.exe` in der vollständig entpackten Windows-ZIP.

EXE SHA-256: `602a005e561adac7e77b7afc9d10db5988271ee6f0d2720666a205000930560d`.

ASAR SHA-256: `cac134b4043df746523e6b37f5885f7c5663c61acfbcb0dfe26d3e780f095d07`.

Die Nachweise liegen daneben unter `Pruefnachweise`; maschinenlesbare Zusammenfassungen stehen in `Abnahme.json`, `Quellabgleich.json` und `Laufzeitpruefung.json`. Die vollständigen lokalen Entwicklungsbelege bleiben in `work/ki-modell-benchmarks/work` erhalten. Zwischenkandidaten r1/r2 sind ausdrücklich nicht freigegeben.

Es gab keine neuen echten KI-Leistungsmessungen, keine Wiederaufnahme der pausierten Kampagne, keine Veröffentlichung und keinen Ersatz einer bestehenden Installation. Die lokale Abnahme ist keine allgemeine Zuverlässigkeitsquote für beliebige KI- oder CAD-Aufgaben.
