# Formnaro 0.137.3-r3

Die Zeichnungs-Werkzeugauskunft enthält wieder die vollständigen tatsächlichen Felder, Standardansichten und Schritte zum Aktualisieren und Übernehmen. Ein doppelter Eintrag hatte das Feldschema überschrieben. Sichtbare UI-Schritte liefern außerdem den begrenzten Dialogzustand zurück. Die Ausgabe enthält auch die JSON-Eingabekorrektur für ChatGPT und die ausdrücklich beschriftete Vergleichsansicht über verschiedene Programmstände.

Die 128 Standardtests und gezielten Werkzeug-/Benchmark-/UI-Regressionen bestehen. Zwei reproduzierende Zeichnungsregressionen waren vor der Reparatur rot. Die echte EXE bestätigt den vollständigen A4-/Titelblock-/Drei-Ansichten-Ablauf mit regulärem Abschluss; ein reiner Öffnungsplan bleibt nativ unvollständig. Produktquellen und gebündelte CAD-Laufzeit werden gegen das Paket geprüft. Die Veröffentlichung führt keine weiteren Modellversuche aus.

| Messung | Ergebnis | Tatsächlicher Messstand |
|---|---|---|
| DeepSeek V4.1 Flash/high, Grundbenchmark | 16/16 | 0.137.0-r1 |
| GPT-6.1 Sol/high, ursprünglicher Grundbenchmark | 14/16 | 0.137.2-r1 |
| Sol, nur beide Zeichnungsfehler erneut geprüft | 2/2 | 0.137.3-r2 |

Alle 98 Originaldateien der beiden vollständigen Benchmarks bleiben SHA256-identisch. Die 14 erfolgreichen Sol-Originale sowie beide historischen Fehlversuche bleiben erhalten; die zwei neuen Versuche sind separat gespeichert. Die native Endprüfung bestätigt bei beiden Nachtests jeweils alle sieben Kriterien. Zwei Modellieranfragen, keine Format- oder Ausführungskorrektur, Überwachung wie zuvor ausgeschaltet, Abschlussauswertung über beide neuen Versuche abgeschlossen und reguläre Prozessenden.

14 beibehaltene plus zwei reparierte Bedingungen ergeben gezielte Abdeckung über verschiedene Builds, keinen neuen vollständigen16erBenchmark. Die öffentliche Anwendung enthält begrenzte Referenzen; private Rohprotokolle, persönliche Daten und Zugangsdaten werden nicht mit dem Programmarchiv ausgeliefert. Die lokale Ergebnissammlung bleibt separat erhalten.

[DeepSeek-Originalbeleg](benchmarks/core-deepseek-2026-11-08.json) · [Sol-Originalbeleg](benchmarks/core-sol-2026-11-08.json) · [Getrennte Zeichnungsnachtests](benchmarks/sol-drawing-retests-2026-11-08.json)
