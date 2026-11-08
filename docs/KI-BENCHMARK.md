# KI-Benchmark

## Zwei getrennte 16er-Suiten ab 0.138.0

Im Reiter **Benchmark → Aufgabenserie** ist der neue **Aufbaubenchmark 2.0.0** vorausgewählt. **Grundlagen 1.0.4** mit den bisherigen Aufgaben bleiben jederzeit wählbar. Öffnen, Umschalten und Vorschau führen keine KI-Anfrage aus; der Startknopf startet ausschließlich die gewählte Suite. Die bestehende lokale API verwendet ohne `suiteId` weiterhin den Grundbenchmark; den Aufbau-Benchmark ausdrücklich mit `suiteId: "formnaro-practice-advanced"` starten.

| Neue Aufgabe | Zusätzliche Anforderungen |
| --- | --- |
| A01 Asymmetrisches Bohrbild | Drei Durchgangsbohrungen mit verschiedenen Durchmessern und Weltpositionen |
| A02 Zwei versetzte Durchbrüche | Zwei unterschiedlich große Öffnungen mit erhaltenem Materialsteg |
| A03 Acht gebohrte Hülsen | Erst bohren, dann Muster um eine versetzte Achse; jede Kopie korrekt |
| A04 Stufenkörper | Aufbau, Vereinigung und Bohrung durch die volle Stufenhöhe |
| A05 Gehäuse | Oben aushöhlen, seitlich öffnen, Rückwand und Boden erhalten |
| A06 Blindtasche und Blindbohrung | Zwei unterschiedliche Tiefen mit tatsächlich erhaltenen Böden |
| A07 L-Skizze mit zwei Löchern | Mehrteilige Kontur, genaue Weltlage, bearbeitbare Skizzenquelle |
| A08 Zeichnung mit Schnitt | A3 quer, 1:2, vier berechnete Ansichten, Schnitt Y−5 und echte Bemaßung |

Auch der Aufbau-Benchmark umfasst **acht Aufgaben je zweimal = 16 frische Versuche**: A01–A08, dann A01–A08. Grenzen je Versuch: 600 Sekunden, 16.384 Ausgabetokens pro Antwort, 30 Runden, höchstens zwei Formatkorrekturen. Die 360 Sekunden und 20 Runden des Grundbenchmarks bleiben unverändert. Alle unbeteiligten Teile sind geschützt.

Die neue Suite hat eigene Aufgaben-/Prüferhashes in `ai/benchmark-advanced-v2.json`. Acht richtige native Referenzmodelle wurden akzeptiert; je Aufgabe wurden zusätzlich Untätigkeit, ein nah am Soll liegender Fehler und fehlende sichtbare Ausführung abgewiesen. Die lokale Kalibrierung steht in `ai/benchmark-advanced-calibration-v2.json` und ist **kein KI-Ergebnis**. Ein neuer KI-Vollbenchmark auf der Aufbau-Suite wurde bei ihrer Vorbereitung nicht gestartet.

Alte Serien, Originalfehler und erfolgreiche Nachtests bleiben vollständig erhalten. Die beiden neuen 16/16-Grundläufe auf 0.137.4-r2 sind weiterhin **Grundlagen 1.0.4**, keine Aufbau-Erfolge. Ergebnisberichte und Aufgabensäulen verwenden die im jeweiligen Lauf gespeicherten Fälle. Grund- und Aufbau-Suite werden im Modellvergleich anhand ihrer Suitehashes getrennt.

## Bisheriger Grundbenchmark und gemeinsame Auswertung

Ab Formnaro0.137.0: ein eigenständiger Benchmark-Lauf mit16festenVersuchen und eigenem Säulendiagramm. Im KI-Testlabor den Reiter **Benchmark** öffnen. Profil und Modell kommen aus der Rollenwahl im Versuchsplan. Der Benchmark verwendet genau eine unterstützte Denkstufe und zeigt vor dem Start seine Bedingungen. Öffnen oder Einstellen startet keinen Versuch.

Die eingefrorene Suite `formnaro-practice-core` Version 1.0.4 enthält acht bekannte Entwicklungsaufgaben: Maße/Mittelpunkt, ein Baugruppenteil, Durchgangsbohrung, Kreismuster, bestimmte Kante fasen, Aushöhlen, echte Messung und Zeichnung. Zwei frische isolierte Versuche je Aufgabe ergeben genau16. Reihenfolge: B01–B08, dann B01–B08. Sichtbare Übung, Kontext C, Auswahl, kein Startbild. Ohne Schrittüberwacher als Grundbenchmark; Shadow ausdrücklich als separate Diagnose auswählbar. Höchstens360s je Versuch,16384Outputtokens je Antwort,20Runden und zweiFormatkorrekturen. Der Überwacher erhält bei Shadow einen reservierten Anteil desselben Zeitbudgets; bei ausgeschaltetem Überwacher steht das ganze Budget dem Modellierer zur Verfügung.

Aufgaben, Fixtures und ausgewählte Prüf-/Werkzeugquellen besitzen festgehaltene SHA256-Werte in `ai/benchmark-core-v1.json`. Die gespeicherte Serie enthält zusätzlich vollständigen Quellmanifest, Programmversion, feste Reihenfolge, Rollen, Budgets und Planhash; Protokolle enthalten konkrete Prompts, tatsächliche Modellkennungen, native Befunde und regulären Abschluss. Eine geänderte Aufgabe oder ein geänderter Prüfer erfordert bewusst eine neue Kalibrierung/Suite. Native Laufzeitdateien sind nicht Bestandteil des Quellhashs; der ausgelieferte Paketnachweis hält den ASAR- und EXE-Hash zusätzlich fest.

Vollständig bestätigt verlangt richtige native Pflichtbefunde, regulären Abschluss, fehlerfreien abgeschlossenen Ablauf und passende Modellkennung in jeder Modellierantwort. Fehlende/abweichende Modellkennungen, ungeprüfte Geometrie und Infrastrukturprobleme werden getrennt gezeigt. Alle16geplanten Bedingungen bleiben im Nenner. Erfolg ohne/nach Korrektur, acht einzelne0/2–2/2Ergebnisse, Laufzeitmedian mit Fallzahl und sämtliche Versuche einschließlich Fehlern bleiben sichtbar. Die allgemeine Kostenanzeige und Berichte trennen Modellierer, Überwacher und Abschlussauswerter. Kosten beruhen auf gemeldetem Verbrauch; fehlende Usage bleibt unbekannt. Zwei Wiederholungen bekannter Aufgaben sind keine allgemeine Zuverlässigkeitsquote oder Modellrangliste.

Bei Abbruch bleiben Teilstände erhalten. **Nur ausstehende Versuche fortsetzen** verwendet denselben Programm-/Suite-Stand und die eingefrorene Rollenwahl. Fertig abgeschlossene Fehlerfälle zählen als Fehler und werden nicht still wiederholt. Unterbrochene Versuche bleiben als eigene Rohprotokolle erhalten. Fortsetzung erzeugt für deren Bedingung einen neuen Versuch. Ein vollständig beendeter Benchmark kann über diesen Knopf nicht noch einmal gestartet werden; ein neuer Start ist eine getrennte Serie.

Der dritte Agent wertet erst nach allen16Bedingungen aus, wenn seine Automatik aktiviert ist. Seine eigene Auswertung verändert keine nativen Ergebnisse. Scheitert die Auswertung, bleiben die Messdaten erhalten. JSON-/Markdown-Bericht und vollständiger externer Protokoll-/Bilder-/Modellexport sind direkt in der Benchmarkansicht erreichbar.

Der früher vorgemerkte Halter-Grenztest bleibt unkalibriert und ist kein Teil der neuen Aufbau-Suite. Er wird nicht als nutzbarer Benchmark angeboten.

Suite1.0.1 präzisiert die Zeichnungsbedienung; Fixtures und native Prüfer sind gegenüber1.0.0 unverändert. Ein fehlendes Übungsmodell nach JSON-/Bedienfehler oder Timeout ist ein Ausführungsfehler, keine automatisch behauptete Infrastrukturstörung. Native Prüferausfälle werden separat ausgewiesen. Richtige Geometrie bei späterem unbehandeltem Fehler genügt nicht für die vollständige Abnahme.

Die historische Suite1.0.1 bleibt separat gespeichert. Suite1.0.2 aktualisiert ausschließlich Werkzeugauskunft und Übungsanweisung nach der Bedienreparatur0.136.1; Aufgaben, Ausgangsmodelle und native Prüfer bleiben unverändert. Die gezielten sechs Benchmark-Nachtests der Reparatur sind kein neuer16erLauf und werden nicht in die alte Serie eingerechnet.

Im Benchmark-Reiter zeigt das Diagramm nur den ausgewählten einzelnen Lauf mit acht Säulen zu je zwei Versuchen. Die Modellauswahl vergleicht ausschließlich vollständige16erLäufe unter gleichen Suite-/Programmhashes, Denkstufen und Überwachungsbedingungen. Pro Modell gilt dessen neuester vollständiger Lauf innerhalb dieser Bedingungen; Übungs-/Reparatur-/Teilstände bleiben separat erhalten.
