# Formnaro KI-Testlabor

Aktuelle Erweiterung vom 07.11.2026: Eine dritte Rolle wertet abgeschlossene Ergebnisse aus; der ursprüngliche Entwurf und seine Auslieferungsstände darunter bleiben historisch nachvollziehbar. Technische Bedienung und Abnahme stehen in `KI-ABSCHLUSSAUSWERTER.md`.

Umsetzungsauftrag vom 05.11.2026. Dieses Dokument ist zunächst Spezifikation; Nachweise und tatsächlich erreichte Funktionen werden bei Abschluss ergänzt. Grundlage sind `KI-CAD-EVAL-QUELLEN-2026-11-05.md` und die abgeschlossene private Diagnose r1. Keine Veröffentlichung oder Änderung der bestehenden Installation.

## Zwei getrennte Agenten

- **Modellieragent:** liest den festgelegten Startkontext und arbeitet an genau einer isolierten CAD-Aufgabe. Er sieht keine versteckten Prüferlösungen oder späteren Urteile.
- **Versuchsleiter:** bekommt einen begrenzten damaligen Beobachtungsstand, bewertet Ziel-/Werkzeug-/Anforderungsabweichung und gibt strukturiert Weiter/Stop/Unklar mit Begründung aus. Er hat keinen direkten Modellierzugriff. Host kontrolliert die Ausführung, kann einen Lauf abbrechen und mit der nächsten eingefrorenen Variante fortfahren.
- Modi: aus, beobachtend (Kalibrierung), aktiver experimenteller Abbruch. Feste Zeit-/Ausgabe-/Schutz- und Wiederholungsgrenzen gelten unabhängig vom Urteil. Erfolgreiche Läufe trotz Stopempfehlung machen Fehlalarme sichtbar; unbekannte Endergebnisse nicht als bewiesene geometrische Fehler zählen. Abbruch ist kein automatischer Erfolg.
- Eigene Modell-/Denkstufeneinstellung, Liveanzeige und Verbrauchsrolle für beide. Alle Anfragen zählen zur Gesamtsumme. Unsicherheit und fehlende Usage bleiben sichtbar. Keine Weitergabe von Zugangsdaten zwischen Modellkontexten.

## Sinnvolle Kontextvarianten

1. A: kompakter bisheriger Einstieg.
2. B: auftragsbezogener Werkzeugwegweiser.
3. C: passende aktuelle Werkzeugdetails sofort.
4. D: passende Details plus gemessene Auswahlfakten/Bezug/Größenanker.
5. E: knapper Einstieg mit gezieltem Nachladen und eindeutiger Hinweisstruktur.
6. F: passende Details mit wenigen neutralen, aus der Registry abgeleiteten Schema-Beispielen; keine fertige Aufgabenlösung.

Die Varianten ändern Information, Reihenfolge und Darbietung. Verfügbare Werkzeuge, Ausführungsbudgets, Sollvorgaben und Schutz bleiben innerhalb eines Vergleichs gleich. Eigene Varianten müssen nachvollziehbar gespeichert und vor der Abnahmeserie eingefroren sein. Kontextgröße ist ein Aufwandssignal, kein Qualitätsnachweis.

## Arbeitsfläche

Eigenes großes Testlabor im vorhandenen KI-Bereich: Übersicht, Versuchsplan, Startkontexte, zwei Liveverläufe, Modellansicht, Ergebnisse/Fehler, Auswertung und Export. Verständliche Startvorlagen, konfigurierbare Fälle/Varianten/Denkstufen/Wiederholungen/Modus/Bilder/Szenenumfang. Geplanter Umfang und Kostenhinweise vor Start, Fortschritt mit Start/Stop/Überspringen, reproduzierbarer Neustart. Übersichtliche Darstellung ohne riesige ungefilterte Roh-JSON-Blöcke im Standardverlauf; rohe Kontexte/Ereignisse bleiben aufklappbar.

## Vergleichsmethodik

- Kleine Piloten dienen Entwicklung und dürfen die abschließende Erfolgsaussage nicht ersetzen.
- Bekannte Fälle für Entwicklung, neue vorab definierte Aufgabeninstanzen für Bestätigung; IDs, Revisionen und Daten getrennt halten.
- Reihenfolge ausbalancieren, gleiche Aufgabeninstanz/Geometrie und Limits je Vergleich; Quelle, Fixture, Bild, Prompt und Plan mit Hash protokollieren. Keine Quelländerung im laufenden Vergleich.
- Bilder: kein Bild/Gesamtansicht/Auswahlansicht unabhängig vom textuellen Szenenumfang. Aufnahme und Kontextvorbereitung zählen zur Zeit.
- API-Agent und sichtbare Übung fachlich gleich prüfen, ihren tatsächlichen Ausführungspfad getrennt ausweisen.
- Native Korrektheit und Erhalt unbeteiligter Teile zuerst, danach Zeit und Kosten. Fehlversuche, Prüferverbrauch, Abbrüche, Limits und fehlende Daten gehören in die Gesamtbilanz.
- Toolwahl/Argumentschema und tatsächliches Endmodell getrennt bewerten. Gültige alternative Konstruktionen nicht wegen einer anderen Werkzeugreihenfolge verwerfen.
- Modell-/Menschenurteile ergänzen die geometrischen Pflichtprüfungen. Kleine Stichproben nicht als statistisch sichere Rangfolge darstellen; Wiederholungen sind keine unabhängigen neuen Aufgaben.

## Technische Vorprüfung

Vorschaupfad des Prüftreibers an normale Sitzung angleichen und durch Fehler→Verwerfen/Abbruch→neue erfolgreiche Vorschau prüfen. Strenge JSON-Verarbeitung mit begrenzter Formatkorrektur; kein Herausschneiden beliebiger ausführbarer Fragmente. Native Prüfer müssen richtige Referenzmodelle akzeptieren und gezielte Gegenmodelle ablehnen, insbesondere verschobenes Zentrum, falsche Bohrungsposition, verändertes unbeteiligtes Teil und verlorene editierbare Skizze. Positive und negative Tests bleiben getrennt von bezahlten KI-Läufen.

## Auslieferung und Abnahme

Gezielte Unit-/Integrationstests für Plan, Faktoren, Quelleinheit, Monitor, Kostenrollen, Abbruchweitergabe, Geheimnisbereinigung und Export. Unabhängige native Gegenfälle, normale Renderer-/UI-Prüfung und private Windows-x64-Paketprüfung einschließlich regulärem Schließen. Danach kleine echte Piloten auf allen drei DeepSeek-Denkstufen und nachvollziehbarer Bericht. Vorhandenes Kontext-ZIP bleibt als gelieferter Snapshot erhalten; neuer Toolstand wird gesondert beschrieben. Abschlussreview und Commit im privaten Zweig, keine Veröffentlichung.

## Privater Auslieferungsstand 05.11.2026

Quellstand193cd40 mit Testlabor-Oberfläche, sechs Kontextvarianten, speicherbaren/prüfbaren Plänen, getrennten DeepSeek-Flash-Sitzungen, beobachtender/aktiver Überwachung und Einzel-/Gesamtkosten. Der Überwacher kann jeden vorgeschlagenen Modellierschritt bis zum eingestellten Prüfbudget prüfen und erhält aktuelle Revision sowie tatsächlich vorhandene letzte Werkzeugrückmeldungen. Die Automatik kombiniert lokale Vorprüfung, A/C/D-Pilot auf allen drei Denkstufen, vollständige C/D-Entwicklung, neue A/Finalist-Bestätigungsfälle je Denkstufe, Bilder, Auswahl und sichtbare Übungen. B/E/F sind zusätzlich im freien Planvergleich wählbar; die Automatik ist keine vollständige faktorielle Prüfung jeder Kombination.

44 gezielte und128 Standardtests bestanden. Die gepackte Ausgabe hat native Bohrung/Szene/Bild und reguläres Kindprozessende bestanden. Die tatsächliche autonome Vorprüfung im privaten Paket bestand40/40 lokale Prüfungen einschließlich14 richtigen Referenzen, sechs falschen Gegenmodellen und Vorschau-/Revisions-/Verwerfen-/Undo-Ablauf. Zwei begrenzte unabhängige Quellreviews führten zu Korrekturen an aktuellen Revisionsbezügen, vollständiger begrenzter Artefaktbereinigung und strengeren Kontrollfällen für automatische aktive Überwachung.

Private Windows-x64-Ausgabe: KI-Testlabor-0.129.0-r1/Formnaro-win32-x64/Formnaro.exe mit eigenem Testprofil. ASAR-SHA256251b8b8f33c9be90ea456dbc4f07074dd70a8e6608db02de56f2374cc34e6732. Der automatische Kampagnenlauf wurde gestartet; erste echte Antworten und Usage beider Rollen meldeten deepseek-flash und die Automatik wechselte selbstständig zum nächsten Versuch. Vollständige Kampagnenergebnisse und Kalibrierung sind zum Übergabezeitpunkt noch offen. Kampagnenstand, Serienmanifeste, Rohereignisse und Berichte bleiben lokal im Diagnoseordner. Kein Installationsersatz und keine Veröffentlichung.
