# Formnaro: fehlende Funktionstests ergänzen

Der Nutzer hat am 07.11.2026 klargestellt, dass erfolgreiche Prüfungen nicht unnötig wiederholt werden sollen. Deshalb wurde eine Ergänzungsserie gestartet: 66 bisher nicht erfolgreich nachgeprüfte Funktions-/Denkstufenkombinationen und die drei Fehlerfälle aus den alten Nachtests, insgesamt 69 neue KI-Versuche. Die 24 erfolgreichen Funktionskombinationen aus früheren Korrekturständen behalten ihre ursprünglichen Paket- und Laufkennungen. Das ergibt keine neue vollständige 90er-Kohorte auf einem einzigen Build.

## Verbesserungen vor dem Start

- Die sichtbare Übungswiedergabe kann eine eindeutige native Außenkante zwischen zwei benachbarten Weltseiten anklicken. Der normale Kanteneditor und die Übung verwenden denselben Bildschirmtreffer. Die Übung erhält keine vorgegebenen Pixel oder Topologiekennungen. Ausgewählte Kante und Revision werden nach dem tatsächlichen Klick geprüft.
- Die Klickmessung kann über zwei native ebene Außenflächen die geforderte Breite bestimmen. Ein sichtbarer Ansichtswechsel im Messbereich erhält die erste Messfläche. Verdeckte Flächen werden weiterhin abgewiesen; vorübergehende Isolation mit anschließender Gesamtansicht löst die Verdeckung im Testmodell.
- Der Kantenbereich und die Klickmessung liefern ihre tatsächlichen sichtbaren Bedienelemente an die begrenzte Übungsrückmeldung. Kantenfelder haben feste Kennungen. Runden und Fasen verweisen im Standardmodus auf das vorhandene gemeinsame Kantenwerkzeug und dessen Operationsauswahl.
- Der alte Wellenfall nennt ausdrücklich das Größenwerkzeug als Einstieg. Die vorherige freie Suche konnte stattdessen eine nicht passende Bearbeitung gespeicherter Modellieroperationen anbieten.
- Der gespeicherte UI-Vertrag entspricht dem aktuellen Renderer-Schema einschließlich der Kantenauswahl. Grenzen des Eingabekanals, Revisionsprüfung, native Endprüfungen und Überwacherbudgets bleiben bestehen.

## Lokale Prüfung und private Ausgabe

Die Funktionsausgabe heißt **0.133.0 r3** und liegt unter `F:/Formnaro/Programm-v0.133.0-r3/Formnaro-win32-x64/Formnaro.exe`. Sie ersetzt keine Installation und wird nicht veröffentlicht.

128 Standardtests und 64 gezielte Prüfungen bestehen. Mit dieser gepackten EXE bestehen die tatsächlichen sichtbaren Abläufe für Runden (15), Fasen (16), Aushöhlen als Flächenauswahl-Regression (17) und Breitenmessung (22), jeweils mit unabhängiger nativer Endprüfung und regulärem Exit0. Vorproben auf r1 und die dabei gefundenen Bedienfehler bleiben getrennt erhalten.

Vor Cloudstart bestanden zusätzlich eine absichtlich falsche Kante als native Gegenprobe, das normale Paketfenster und der Zugang unter Einstellungen. Die falsche Kante hat dasselbe Volumen und dieselben Außenmaße wie die richtige; nur die unabhängige geometrische Probe an der geforderten Kante schlägt korrekt fehl. Die lokalen Abnahmen und Quell-/Paket-Hashes stehen in `Pruefbelege/Lokale-Abnahme.json`: 273 Backend-/KI-Dateien und 750 Renderer-Eingangsdateien stimmen mit dem eingefrorenen Paket überein. Der Starter verweigert ohne diesen Nachweis den Start.

## Ergänzungsplan und Beobachtung

Laufordner: `F:/Formnaro-Testausgaben/KI-Ergaenzung-0.133.0-r3-2026-11-07`.

1. Runden, Fasen und Breitenmessung auf low/high/max: neun Versuche.
2. Übrige fehlende Funktionskombinationen: 57 Versuche.
3. Alter Wellenfall auf high/max sowie die alte Skizze auf max mit ursprünglichem Datensatz/Kontext: drei Versuche.

`Ergaenzungsplan.json` bindet die übernommenen 24 Erfolge an ihre ursprünglichen Rohberichte und enthält die 69 neuen Bedingungen. Die Sets sind disjunkt; mit den 66 neuen Funktionsbedingungen werden alle 90 Kombinationen zumindest abgedeckt. Erfolg wird erst nach nativer Prüfung, gültigem Überwacher-Endurteil und bestätigtem regulärem Prozessabschluss angenommen.

Der Starter verwendet eingefrorene ASAR-Ressourcen und die gelieferte EXE für native Kindprozesse. Hostprofil und Daten sind isoliert; bestehende verschlüsselte Anbietereinstellungen werden intern übernommen. Das Laborfenster wird sichtbar geöffnet. Vor dem ersten Modellieraufruf läuft die lokale Laborvorprüfung. Tatsächliche Schritte, Werkzeugfehler und Endbefunde gehen an den Überwacher. Nach jeder Phase werden Rohberichte gesichert. Unterbrechung, Kontingentfehler, unerwartete Vorbereitungsfehler oder ein unvollständiger Überwachungsweg halten weitere Phasen an. Ein falsch modellierter Körper bleibt ein Testergebnis und wird nicht als technische Vorbereitungslücke umgewertet.

Der Ergänzungslauf ist gestartet (Host PID26920, sichtbares Laborfenster12323068). Die lokale Laborvorprüfung bestand40/40. Beide KI-Rollen haben echte Anbieteranfragen begonnen; sichtbare native Übungsschritte werden ausgeführt und überwacht. Der laufende Stand wird ausschließlich aus `Fortschritt.json` und den Rohberichten unter `data/KI-Diagnose` abgelesen. `work/status-completion-01330.cjs` liefert eine kurze lokale Statusauswertung. Ein gestarteter Versuch ist noch kein bestandenes Ergebnis.
