# KI-Labor: Abschluss und ungueltige Antworten (0.139.1-r1)

Die vorherige Abschlusslogik konnte einen regulär endenden Prozess unter Last nach 30 Sekunden als erzwungen oder unbestätigt werten. Die IPC-Verbindung war bereits getrennt, der native Prozessabbau aber noch nicht abgeschlossen. Im alten vollständigen Ablauf und einer nativen Paketprüfung wurde das vorzeitige Eingreifen bei etwa 31 Sekunden reproduziert.

Die Fensterfrist bleibt 30 Sekunden. Erst bei bereits getrennter IPC wartet das Labor bis insgesamt 120 Sekunden auf den OS-Exit. Nur Exitcode 0 ohne erzwungene Beendigung bestätigt Erfolg. Eine verlorene Verbindung allein bleibt unzureichend. Ein verbundenes hängendes Fenster wird weiterhin nach der ersten Frist abgebrochen. Die einzelne native Komponente hinter der Abbauverzögerung wurde nicht auf Thread-Ebene isoliert.

Abgewiesene Antworten wurden bisher erneut als Assistentennachrichten an das Modell geschickt, einschließlich erfundener Werkzeugresultate. Sie bleiben nun ausschließlich in den Rohprotokollen. Die Korrekturrückmeldung nennt den bestätigten Szenenstand und unterscheidet Leerantworten von zusätzlichen Inhalten nach einem abgeschlossenen JSON-Objekt. Es werden weder JSON-Präfixe stillschweigend ausgeführt noch Modellbefehle lokal repariert. Aufgaben, Prüfschwellen und Korrekturbudgets bleiben gleich.

128 Standardtests und 152 gezielte Regressionen bestehen. Ein echter Prozess mit kontrolliertem 35-Sekunden-Nachlauf wird vorher erzwungen beendet und nachher regulär bestätigt. Das Endpaket besteht acht native Referenzen und 24 negative Gegenproben. Alle 20 historischen Ablaufwiederholungen schließen regulär; zehn absichtlich wiedergegebene alte JSON-Fehler bleiben als Modellfehler erhalten.

Vier echte Nachtests (Zeichnung und Bohrung je zweimal, DeepSeek Flash/high) bestehen vollständig. Einer benötigt eine erfolgreiche Formatkorrektur. Ein tatsächlicher Zeichnungsprozess endet nach 93,995 Sekunden mit Exitcode 0, ohne Kill. 30 Modellanfragen; kein neuer Vollbenchmark. Eine separate Messprobe mit pauschal 120 Sekunden und noch verbundener IPC blieb als Fehler erhalten und wird nicht als Erfolg geführt.

Suiten 1.0.12 und 2.0.8 binden die neue Ausführungssteuerung. Die Auslieferung ist privat; das vorherige Paket und seine Fehlerprotokolle bleiben erhalten.
