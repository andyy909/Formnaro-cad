# KI-Benchmark

## Automatischer Grenztest für Plattenänderungen

Im Reiter **Benchmark** stehen vier getrennte Leistungsreihen. Jede Live-Reihe benutzt die einstellbaren Denkstufen aus dem Modellkatalog. Bei Modellen mit abschaltbarer Denkphase enthält die Reihe auch Off. Mit **Nur Off** lässt sich diese Bedingung einzeln ausführen. DeepSeek Flash startet im Chat als DeepSeek-Vorauswahl. Standardmäßig startet jede Stufe drei frische Versuche mit derselben Aufgabe. Im Labor lassen sich ein bis acht einstellen. Eine gelöste Variante genügt für den Aufstieg, ausschließlich fachlich gescheiterte Versuche einer vollständig durchlaufenen Stufe markieren die erste ungelöste Stufe. Technische Ausfälle, Zeitbudget und ein vollständig bestandener endlicher Aufgabenkatalog lassen die Grenze offen. Das Standard-Zeitbudget beträgt vier Minuten je Denkstufe, sechs bei High und acht bei XHigh und Max. Für Vergleichsmessungen lässt sich ein einheitliches Zeitbudget setzen. Die Option **Ohne Zeitlimit** lässt jede Denkstufe ohne Zeitbudget laufen. Der Bericht enthält Einzelzeiten, Trefferzahl und Median der fachlich ausgewerteten Versuche. Ein Durchlauf mit 1/3 und einer mit 3/3 bleiben unterscheidbar. Für die Vorführung verweist der Bericht auf das eigene Protokoll des sichtbaren Übungsfensters.

| Bereich | Anforderung und Prüfer |
| --- | --- |
| Direkter Modellbau | Platte erzeugen, mit festen Randabständen verlängern, ausgewählte Durchmesser ändern. Die Reihe erhöht die Bohrungszahl. Geprüft werden Außenmaße, Volumen, Durchgänge, gespeicherte Geometrie und Undo. |
| Vorführen | Acht Übungsaufgaben vom Verschieben bis zur technischen Zeichnung, jeweils im eigenen Übungsfenster mit bestehendem nativem Prüfer, Modellkennung und regulärem Abschluss. |
| Foto | Kalibrierte Frontalaufnahme, perspektivisch verzerrte Aufnahme und unterbestimmtes Einzelbild. Danach wachsen versetzte Öffnungsreihen von zwei auf bis zu 16 Fenster. Maßhaltigkeit, Öffnung und berechtigtes Nachfragen haben unterschiedliche Sollbefunde. Die Bilder sind synthetisch. Der bisherige rein technische Mehransichten-Check läuft weiterhin separat. |
| STL zu CAD | Netz einer Bohrplatte, Senkungen, Gehäuse, Profilbohrung und Freiform. Danach entstehen neue STL-Vorlagen mit immer mehr versetzten Stufenbohrungen. Erst einen nativen Nachbau mit mindestens zwei einzeln adressierbaren nativen Quellmerkmalen, gemessener Volumenänderung bei einer Maßprobe, Undo und beidseitiger Stichprobe gegen die Vorlage prüfen. Andernfalls normale lokale Konvertierung mit STEP-Rücklesen. Erst wenn die Konvertierung scheitert, darf die KI konservative Netzbereinigung vorschlagen. Die ausgeführte Route und ihre Messwerte stehen im Bericht. Für den Aufstieg zählt der bearbeitbare Nachbau. |

Der bestehende Grund- und Aufbaubenchmark bleiben Vergleichsreihen. Im Platten-Referenzmodus laufen zwei deterministische Stufen ohne Anbieter. **Aufgaben und Kontext patchen**: Die Plattentexte, ihr zusätzlicher Kontext, Version und Wiederholungszahl stehen in `ai/lab-plate-frontier.json`. Weitere Bereichsaufgaben und ihre Prüfer werden gemeinsam über den Laborpatch verteilt.

**Einordnung der Methode.** CADTests verwendet ausführbare geometrische und topologische Kriterien. Parametric CAD Bench v3 trennt Erstellen, Folgeänderungen und Zeichnungen und prüft auch Modellierungshistorie. Autodesk nutzt bei neuralCAD-Edit fachlich erhobene Bearbeitungsaufträge. Für Formnaro ergänzen sich ein gleichbleibender Wiederholungsfall pro Stufe und zusätzliche zurückgehaltene Aufgaben für spätere Vergleiche. Fünf Wiederholungen eines einzigen Beispiels erlauben keine Aussage über alle Bauteile. [CADTests](https://arxiv.org/abs/2605.07807) · [Parametric CAD Bench v3](https://arxiv.org/abs/2611.02659) · [neuralCAD-Edit](https://autodeskailab.github.io/neuralCAD-Edit/) · [Erfolgs- und Zuverlässigkeitsmetriken](https://www.anthropic.com/research/demystifying-evals-for-ai-agents)

## Aufgabenreihen mit steigenden Anforderungen

Im Reiter **Benchmark** ist **Vormachen** eine eigene Serie. Acht Aufgaben reichen vom Verschieben eines Quaders über Bohrungen und Muster bis zur bearbeitbaren Skizze und technischen Zeichnung mit Schnitt und Bezugsmaßen. Jede Stufe läuft mit zwei frischen Projekten auf derselben Denkstufe. Die erste bestätigte Abweichung bleibt pro Aufgabe sichtbar.

**Modellbau · Teilezahl steigern** öffnet die Reihe mit 2, 4, 8, 16, 32 und 64 vorgebohrten Segmenten. Ab acht Teilen muss der Verbund die angegebenen Untergruppen bewahren. Formnaro misst jede Bohrung am nativen Ergebnis und ändert anschließend eine erhaltene Bohrungsquelle. Das Schutzteil, die übrigen Bohrungen und die Wiederherstellung per Undo sind Pflichtprüfungen. Weitere Stufen verteilen 96, 160 und 240 Segmente auf sechs, zehn und fünfzehn getrennte Leisten. Bei 160 und 240 Segmenten muss die KI die zusammengehörigen Teile anhand ihrer Weltkoordinaten zuordnen. Die Hierarchie und die Bohrungen werden in jeder Leiste geprüft. Im Folgeauftrag muss das Modell 18 Bohrungen in einem bestehenden Verbund selbst gezielt ändern. Alle 96 Bohrungen werden erneut vermessen.

**STL-Konverter · Flächenkorrektur** beginnt bei markierten Zylindern, nimmt dann die Vorauswahl weg und endet bei einer konischen Profilbohrung aus vier Flächenbereichen. Die Prüfer kontrollieren den Dreiecksschutz, lesen den erzeugten STEP-Körper wieder ein und messen die Öffnungen.

Fest vorgegebene Antworten prüfen die Ausführung und die Messlogik. Ergebnisse mit dem aktuellen KI-Zugang gehören zum gewählten Modell und dessen Denkstufe. Ein vollständiger Durchlauf zeigt die Leistung bis zur höchsten geprüften Stufe. Wenn alle Stufen gelingen, liegt die Leistungsgrenze oberhalb dieser Reihe. Ausführungsfehler und offene Fälle werden gesondert ausgewiesen.

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

## Benchmark im Einfach-Modus

Im Reiter **Benchmark** das Modell aus den eingerichteten KI-Zugängen wählen und **Benchmark starten** drücken. Die Wahl wird auch im KI-Chat verwendet. Die Checkliste zeigt die vom Modell unterstützten Denkstufen. Alle sind zunächst ausgewählt. Der Benchmark startet mit mindestens einer gewählten Denkstufe und wechselt automatisch zwischen der Auswahl. Die vier Leistungsreihen laufen mit bis zu drei frischen Versuchen pro Stufe. Der erste Erfolg führt sofort zur nächsten Aufgabe derselben Denkstufe. Drei fachliche Fehlschläge beenden diese Stufenfolge. Das Budget beginnt im Einfach-Modus für jede Aufgabe neu. Es beträgt vier Minuten, bei High sechs und bei XHigh oder Max acht Minuten. Zeitablauf und technische Fehler bleiben als offene Grenze erkennbar.

Modellbau und STL steigern die Zahl der Merkmale. Die Fotoreihe steigert zuerst die Zahl der Öffnungen, anschließend die Zahl unterschiedlicher Fotomotive. Die Vorführreihe ergänzt nach den Einzelübungen Folgen anspruchsvoller Übungen. Ergebnisse der vier Bereiche und Denkstufen stehen gemeinsam im Laufbericht. Bei einem Modell ohne Bildeingabe führt das Labor die übrigen Reihen aus und vermerkt den übersprungenen Fototest. Die bisherigen Einzelreihen und festen Vergleichstests lassen sich im selben Reiter aufklappen.

### Schnellere Steigerung ab Leistungsreihen-Version 4

Bei der Platte wächst die Zahl der Durchgangsbohrungen mit 2, 4, 8, 16, 32, 64 und 128. Beim STL-Nachbau folgen auf die fünf unterschiedlichen Grundformen Aufgaben mit 4, 8, 16, 32 und 64 Stufenbohrungen. Foto behält die einzelnen Einstiegsaufgaben und erhöht dann die Anzahl der Öffnungen je Platte von 2 bis 16 und anschließend die Zahl der Motive pro Aufgabe. Vorführen prüft drei Grundlagen und steigert danach den Umfang anspruchsvoller Folgen mit 2, 4, 8 und weiteren Übungen. Der Faktor ist in der lokalen Testkonfiguration abgelegt. Der Prüfbericht nennt den zuletzt gelösten und den ersten erfolglos geprüften Umfang. Dazwischen übersprungene Größen bleiben ungemessen. Am oberen Ende einer vollständig gelösten Reihe bleibt die Grenze offen. Gespeicherte ältere Aufgabenberichte werden weiter mit ihrem ursprünglichen Aufgabenumfang angezeigt.

### Tokenverbrauch

Die Benchmarkberichte zeigen gemeldete Eingabetokens, Ausgabetokens und den bereits in der Eingabe enthaltenen Anteil aus dem Cache. Die Werte stehen für Einzelversuche und im Einfach-Modus zusammengefasst je Bereich, Denkstufe und Gesamtlauf. Anbieterangaben zu fehlgeschlagenen Antworten werden mitgezählt. Fehlende Felder sind als unbekannt oder als Teilmenge gekennzeichnet. Die festen Vergleichstests zeigen den Verbrauch getrennt nach Modellieragent und Versuchsleiter, wenn letzterer mitläuft.

### Säulendiagramme

Unter **Benchmark → Säulendiagramme** zeigt **Einzelner Testlauf** die Trefferquote je Aufgabe und Denkstufe. **Modellvergleich · Durchschnitt** fasst mehrere vollständige Läufe je Modell für exakt dieselbe Aufgabenfassung, Denkstufe, Versuchsanzahl und Zeitvorgabe zusammen. Die Säule zeigt den Durchschnitt und die Zahl der Läufe. Technisch unvollständige Läufe bleiben in ihrer Einzelansicht sichtbar.

Beim Vergleich bleibt die Erfolgsquote je Aufgabe des Einfach-Modus getrennt von Quoten je Versuch aus Reihen mit fester Versuchsanzahl.
