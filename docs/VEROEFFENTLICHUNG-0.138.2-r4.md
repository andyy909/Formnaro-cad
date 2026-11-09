# Formnaro 0.138.2-r4

Die Veröffentlichung enthält die unveränderte, bereits geprüfte EXE und app.asar der Testrevision 0.138.2-r4. Geänderte Paketmitgliedschaft und Startanleitung werden separat geprüft; persönliche Daten, Projekte und rohe Laborprotokolle sind ausgeschlossen. Die in der Anwendung enthaltenen JS-Module zur nativen Übungsprüfung und der lokale API-Adapter gehören zur Laufzeit. Programmquellen, CAD-Kern- und FreeCAD-Quellen stehen als getrennte Archive bereit.

## Korrekturen

- Skalierte native Quader behalten ebene Bohrflächen.
- Eine Auswahlkennung folgt eindeutig dem resultierenden bearbeiteten Ausgangskörper.
- Checkbox-Zustände werden gezielt gesetzt; bereits aktiviertes Durchgehend bleibt aktiv.
- Native Prüfungen melden zusätzliche Körper und falsche Lage mit Ist-/Sollwerten zurück. Höchstens eine sichtbare Ausführungskorrektur teilt das bisherige Gesamtbudget.
- Die Werkzeugauskunft erklärt die vorhandene Löschroute beim ausdrücklich beauftragten Ersetzen. Positionsfelder bezeichnen die Mitte der Geometriegrenzen. Die bestehende A07-Zielhöhe wird eindeutig als Unterseite bei Welt-Z=+4mm formuliert.
- Ein eigener Aufbaubenchmark umfasst acht schwierigere Aufgaben mit je zwei frischen Versuchen. Grundbenchmark, ältere Läufe und Nachtests bleiben getrennt.

## Ergebnisse und Prüfgrenzen

Der ursprüngliche DeepSeek-Aufbaubenchmark bleibt 5/16 auf 0.138.0-r1. Getrennte Nachtests auf 0.138.1-r1 und0.138.2-r1/r2/r3 bestätigten anschließend alle 16 ursprünglichen Bedingungen über mehrere Programmstände. Dies ist kein neuer vollständiger 16/16-Lauf. Der zusätzliche A07-Bestätigungstest mit der neu gebauten 0.138.2-r4 bestand 8/8 native Kriterien in 144,199 Sekunden, ohne Format-/Bedien-/native Korrekturschleife, mit regulärem Kind- und Hostabschluss. Beide A07-Erfolge auf r3 und r4 sowie sämtliche Fehlversuche bleiben unverändert gespeichert.

DeepSeeks ursprüngliche 16/16, Sols 14/16 und 15/16, beide neueren Grundbenchmark-Läufe 16/16 auf 0.137.4-r2 und alle erfolgreichen Zeichnungs-/Bohrungsnachtests behalten ihre Originalversionen und Hashes. Die alten Vergleichsdiagramme bleiben erhalten. Neue öffentliche Belege enthalten nur begrenzte Zusammenfassungen synthetischer Aufgaben, keine Rohprompts, Pläne, Profile oder Zugangsdaten.

Quellabnahme des korrigierten Stands: 128 Standard- und 116 gezielte Tests; 8 native Positiv- und 24 Negativgegenproben. Der reine Neubau r4 übernimmt diese Nachweise unveränderter Funktionsquellen. Frische r4-Prüfungen: 1.047 Funktionseingaben gegenüber r3 verglichen, 1.170 Paketinputs und 14.603 CAD-Dateien vor/nach Kopie geprüft, echte A07-Paketbedienung, gespeicherte Ergebnisanzeige und erneuter DeepSeek-Einzelfall. Die lokale Anzeige umfasst 120 Rohversuche, 6 vollständige historische Benchmarks und 15 getrennte Serien. Für die Veröffentlichung werden keine weiteren Cloudversuche gestartet.

Das neue Downloadarchiv wird vollständig per CRC und SHA-256 geprüft, in einen neuen Unicodepfad entpackt und dort mit fremdem Arbeitsverzeichnis gestartet. Ein gezielter Nachweis ersetzt keine neue allgemeine Langzeit- oder Clean-Windows-VM-Abnahme.

EXE SHA-256: `95df1ef7a2a94330ba392ad69a5b1aab2930e9ae1109359d9d5ad787babdb0c6`

app.asar SHA-256: `77f7c3fa0d199f0cf2c3fc95390aaee16bec2c50dbb0a73273a195f918d26373`

Die Datei SHA256SUMS.txt bindet sämtliche neuen Release-Downloads. Frühere Releases und deren ursprüngliche Prüfsummen werden nicht ersetzt.
