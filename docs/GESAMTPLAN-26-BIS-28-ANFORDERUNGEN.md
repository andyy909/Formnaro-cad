# Gesamtplan: Anforderungen Punkte 26 bis 28

**26. Mindestabstände und Fundstellen ergänzen.**

- Für gewählte Prüfpaare neben Schnittvolumen auch den gewünschten Mindestabstand prüfen.

- Vorhandene Abstandsmessungen auf die jeweils berechnete Stellung anwenden.

- Problematische Teile und verfügbare Messpunkte in der Ansicht hervorheben.

- Erlaubte Kontakte ausdrücklich je Prüfauftrag festlegen; Gelenkverbindungen werden nicht pauschal von der Prüfung ausgenommen.

**Fertig, wenn:** „Keine Durchdringung“, „Berührung“ und „geforderter Abstand eingehalten“ unterscheidbare Ergebnisse sind.

**27. Prüfstände und Vereinfachungen am Modell erhalten.**

- Vereinfachte Geometrie, fehlende Kopplungen und geprüfte Stellungen strukturiert speichern.

- Prüfergebnisse mit der geprüften Revision und ihrem Umfang verbinden.

- Nach Modelländerungen alte Ergebnisse als veraltet kennzeichnen.

- Oberfläche und KI erhalten denselben zusammengefassten Status.

**Fertig, wenn:** Nach Speichern und erneutem Öffnen eindeutig erkennbar ist, was geprüft wurde und welche Einschränkungen bestehen. „Keine Gelenkprobleme“ wird nicht als allgemeiner Funktionsnachweis dargestellt.

# Schnittstellen Kompatibilität und Gesamtabnahme

**28. Alle Zugangswege gemeinsam fertigstellen und prüfen.**

- Status, Auftragsabbruch und Speicherung erhalten kleine gemeinsame Schnittstellen für lokale API, MCP und Python.

- Neue optionale Angaben betreffen Zwischenanzeige, Antwortumfang und Größenanker. Alte Aufrufe behalten ihr bisheriges Verhalten.

- Schraubtrieb und Spindelantrieb erhalten gemeinsame gespeicherte Kopplungsdaten für Oberfläche und KI.

- Neue Projektmerkmale werden versioniert. Alte Projekte bleiben lesbar; neuere Kopplungen dürfen beim Speichern nicht still verloren gehen.

- Die Berechtigungsgrenzen des Übungsmodus bleiben bestehen.

Die Abnahme erfolgt nach jeder Etappe und abschließend über den gesamten Ablauf:

1. Bestehende passende Tests sowie die neuen CNC-Regressionen bestehen, einschließlich Drehwinkel-/Toleranzfall, Fehler nach erfolgter Übernahme und wiederholter Szenen-/Darstellungsabfragen.

2. Vorschau, Abbruch, Fehler vor und nach der Übernahme, verlorene Antworten, Wiederholung und Undo werden in einer echten isolierten Anwendung geprüft.

3. Große Projekte werden gespeichert, erneut geöffnet und auf Quellen, Geometrie und Gelenke geprüft.

4. Die CNC-Aufgabe wird auf einer Kopie mit funktionierenden Kopplungen und echten Gewinden wiederholt.

5. Mit vorhandenen DeepSeek- und Mistral-Profilen werden Werkzeugauskunft, Fehlerkorrektur und die neuen Bewegungsbefehle praktisch geprüft.

6. Laufzeit, Spitzenwerte des nativen Speichers, Anzahl nativer Berechnungs- und Abfrageaufrufe, übertragene Datenmenge, Tokenverbrauch und Korrekturrunden werden vergleichbar erfasst. Eine Bewegungs-/GIF-Aufnahme erhält Modellrevision und Undo. Verbesserungen werden nur anhand dieser Messungen behauptet.

7. Private Testausgaben werden normal geöffnet und geschlossen; sauberer Prozessabschluss gehört zur Abnahme.

Die Umsetzung bleibt zunächst privat. Veröffentlichung, ein Wechsel der CAD-Technologie oder ein universeller Mechaniksolver sind nicht Bestandteil dieses Plans.

