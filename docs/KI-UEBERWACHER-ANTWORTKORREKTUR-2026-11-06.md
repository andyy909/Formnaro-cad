# Überwacher-Antwortkorrektur 0.132.1

Die große Testwarteschlange bleibt auf Nutzerwunsch angehalten. Diese Ausgabe enthält ausschließlich die begrenzte Korrektur der drei belegten Antwortprobleme.

- Nur die exakt aufgezeichnete DSML-Schlusstagfolge nach einem Urteil wird entfernt. Andere Hüllen, zusätzlicher Text und mehrere JSON-Objekte bleiben ungültig.
- Nur das zusätzliche Metadatenfeld `type` mit exakt dem Wert `json_object` darf entfernt werden. Unbekannte Felder, ungültige Typen, Konfidenzen und Stopbegründungen werden weiterhin abgewiesen.
- Bei ungültigem Format gibt es genau einen kurzen Korrekturversuch mit demselben Beobachtungsstand und 4096 Tokens.
- Bei abgeschnittener Antwort gibt es höchstens einen Nachversuch mit8192 statt4096 Tokens. Beide Versuche teilen weiterhin das bestehende30-Sekunden-Zeitlimit des Überwachers. Host-, Abbruch- und Anfragebudget bleiben aktiv; die Planabschätzung berücksichtigt maximal zwei Anfragen je Prüfung.
- Normalisierungen und Nachversuche werden gesondert protokolliert. Jede Antwort hat eine eigene Usage-Aufzeichnung. Ein nach dem zweiten Versuch weiterhin ungültiges/fehlendes Urteil bleibt nicht beurteilbar und erzeugt keine Freigabe. Native Endprüfungen bleiben unabhängig.

## Prüfung

36 gezielte Tests und128 Standardtests bestanden. Regression mit der tatsächlichen aufgezeichneten DSML-Antwort, bekanntem Metadatenfeld, unbekannten Feldern und Zusatztext; Budgetfolge4096/8192, Formatfolge4096/4096, beide Verbrauchsereignisse und striktes Ende nach zwei ungültigen Antworten geprüft.

Sechs echte DeepSeek-Flash-Prüfanfragen auf aufgezeichnete native Zustände: korrektes Modell Weiter/Weiter, Lageabweichung Weiter/Stop, Bedienfehler Weiter/Stop. Keine Überwacherfehler in dieser kleinen Gegenprobe. Die Budgeterschöpfung selbst wurde lokal reproduziert; die realen Gegenantworten mussten nicht künstlich bis zum Limit verlängert werden. Daraus folgt keine allgemeine Erkennungsrate.

Gepackte Oberfläche: regulärer Start, Einstellungszugang, Öffnen/Schließen, 30/90-Vorlage und getrennte Schritt-/Endanzeige bestanden; Fenster regulär geschlossen. Beide geänderten Backend-Dateien im Paket sind bytegleich mit den geprüften Quellen.

Belege: tests/ai-monitor-format-recovery.test.cjs, tests/fixtures/monitor-dsml-answer.txt, work/monitor-live-1793987784561, work/release-01321-ui. Lokale Ausgabe F:/Formnaro/Programm-v0.132.1/Formnaro-win32-x64/Formnaro.exe. Nicht veröffentlicht, keine Bestandsinstallation ersetzt, keine breite Testserie neu gestartet.
