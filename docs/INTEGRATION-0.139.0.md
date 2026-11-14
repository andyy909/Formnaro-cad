# Formnaro 0.139.0-r1

Private Integrationsversion aus dem veröffentlichten Stand 0.138.2-r4, den beiden anschließenden Laborreparaturen und der Gesamtauswertung vom 14. November 2026. Eine Veröffentlichung oder der Austausch einer bestehenden Installation ist damit nicht verbunden.

## Integrierte Verbesserungen

| Änderung | Verhalten | Prüfung |
|---|---|---|
| Neustart im Übungsmodus | Ausführungsbeobachter bleiben auch nach dem Wechsel auf eine frische Testkopie erreichbar. | Bestehende Rückfalltests beider Neustartwege. |
| Zugangserneuerung | Der Desktop-Adapter reicht den Credential-Resolver bis zur tatsächlichen Anbieteranfrage durch. | Reale verpackte IPC-Strecke mit lokal simuliertem Tokenwechsel; getrennte echte Sol-Einzelprüfung. |
| Sichere Laborprotokolle | Eindeutige temporäre Datei, fsync und begrenzte Wiederholung bei Windows-Dateisperren. Ein bleibender Speicherfehler stoppt die Serie und wird als Infrastrukturfehler geführt. | EPERM, ENOSPC, EIO, Unterbrechung vor dem Ersetzen und Abbruch einer Warteschlange; letzter gültiger Datensatz bleibt erhalten. |
| Eindeutiger Agentenabschluss | Werkzeugaufruf, notwendige Rückfrage und Abschluss haben unterschiedliche Antwortformen. Text über einen nächsten Schritt beendet den Versuch nicht stillschweigend. | Drei unveränderte historische Fehlantworten, Formatkorrekturbudget und Gegenproben gegen verschachtelte Befehle. |
| Konkrete Rückmeldungen | Ungültige Felder und Werkzeugnamen, zulässige Messabfragen, verfügbare Ergebnisaliase und die richtige Vorschau-Ausgangsrevision werden genannt. | Validierungs- und Integrationstests; fremde Vorschauen bleiben gesperrt. |
| Vollständigere Auswerterdaten | Überwachungsmodus, technische Fehler, Werkzeugfehler, Blockerdiagnosen und Folgeaufrufe bleiben sichtbar. Ausgangszustand und erste Ausführungsbeobachtung sind getrennt; gekürzte Objektlisten sind gekennzeichnet. | Exportvergleich aller 256 bisherigen Originalprotokolle ohne deren Veränderung. |
| Kürzere Auswerteraufträge | Der Auswerter priorisiert höchstens sechs konkrete Befunde und sechs Folgeprüfungen. | Bestehende Schema-/Budgettests und begrenzte neue Abschlussauswertung. |
| Regulärer Testfensterschluss | Bis zu 30 Sekunden für den tatsächlichen Prozessabbau; erzwungener oder unbestätigter Schluss bleibt ein Fehler. | Regulärer, erzwungener und unbestätigter Abschluss; echte EXE-Kalibrierung. |
| Alte Kantenbezüge | Ältere exakte Kantendomänen einer affinen Skizze können zusätzlich gegen die erhaltene BRep geprüft werden. Aktuelle Domänen bleiben unverändert gültig. | Native Tests für beide Darstellungen, manipulierte Anker und veraltete Platzierung. Kein nächstgelegener Ersatzbezug. |

Die Suiten 1.0.11 und 2.0.7 kennzeichnen den neuen Ablauf. Aufgaben, Ausgangsgeometrien, numerische Prüfschwellen und Modellbudgets wurden nicht erleichtert. Holdout-Prüfnamen zeigen die tatsächlich verwendeten Maße.

## Testpflege

Bedienungstests verwenden einen neutralen isolierten Prüfstart anstelle des Wartungstests mit seiner absichtlich eingebauten Autospeicher-Störung. Der separate Wartungsfehler bleibt weiterhin testbar. Unvollständige Desktop-/Szenenattrappen wurden ergänzt. Die Zeichnungsprüfung erwartet die inzwischen exakte analytische Ellipse; der separate NURBS-Test erzeugt weiterhin ausdrücklich eine echte NURBS-STEP-Datei und prüft deren native Bearbeitung.

Die breite Sammlung, lokale Paketprüfungen und gezielte KI-Läufe werden getrennt ausgewiesen. Ein lokaler Transporttest ist kein KI-Leistungsnachweis; nachgebesserte Einzelbedingungen sind kein neuer vollständiger Benchmark. Historische Ergebnisse bleiben unverändert. Den abschließenden Prüfstand dokumentiert der mitgelieferte Abnahmebericht.

## Abschließender Prüfstand

Die breite Sammlung umfasst 558 Node-Testdateien und meldete 3.211 Prüffälle: 3.181 bestanden, 28 fehlgeschlagen, zwei abgebrochen. Entwicklungszeitliche Fehler und gezielte abschließende Nachprüfungen werden im Abnahmebericht einzeln zugeordnet; dies ist kein unveränderter grüner Gesamtlauf. Zusätzlich bestanden 84 gezielte Labor-/Desktop-Prüfungen, 28 Python-Prüfungen, 19 UI-Prüfungen, alle 64 Schriften sowie acht positive und 24 negative native Paketprüfungen.

Die aktuelle Szenenprüfung verwendet native Desktopabläufe. Wiederherstellung erfolgt über die heutige Startseitenaktion „Letzte Autosicherung“. Reale Mausprüfungen warten auf Undo-/Renderabschluss und scrollen Steuerelemente ins sichtbare Zentrum. Der obsolete lokale Sprachlaufzeittest wurde durch Prüfungen der heutigen Onlinefunktion und Datenbereinigung ersetzt.

Fünf KI-Bedingungen ergeben sechs unveränderte Rohversuche (Vorab- und Endpaket getrennt): vier vollständig akzeptiert, sechs native Geometrieprüfungen bestanden. Zwei sporadische unbestätigte Prozessabschlüsse und eine ungültige KI-Abschlussantwort bleiben offene Befunde. Drei lokale Wiederholungen mit gespeicherten Modellen und die beiden letzten Liveversuche schlossen regulär; damit ist die sporadische Ursache nicht als behoben nachgewiesen. 42 Modellierer-Anfragen und eine Auswerter-Anfrage. Keine neue vollständige Benchmarkquote.

Das ZIP wurde vollständig entpackt und alle 15.809 Dateien geprüft; 1.046 ausführbare Quellinputs stimmen mit dem Endpaket überein. Test-/Dokumentationspflege nach dem Einfrieren verändert die geprüfte Anwendung nicht. Paket, Excel und Bericht liegen separat als private Übergabe vor.
