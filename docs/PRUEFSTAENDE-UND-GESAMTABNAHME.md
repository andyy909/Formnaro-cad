# Mindestabstände, gespeicherte Prüfstände und gemeinsame Zugänge

Privater Gesamtplan 26–28, Entwicklungsstand 02.11.2026. Anforderungen:
[26–28](GESAMTPLAN-26-BIS-28-ANFORDERUNGEN.md).

`app/jointCollision` und die Paare von `app/motionRange` ergänzen
`minimumDistance` (mm, Standard 0), `allowContact` (Standard false) und
`tolerance` (Standard 0,000001 mm, höchstens 0,01 mm). Native CAD-Paare
erhalten zusätzlich den vorhandenen nativen Mindestabstand und Messpunkte
an der tatsächlich berechneten Stellung. Durchdringung, Berührung,
Abstandsverletzung und erfüllter Abstand werden getrennt ausgewiesen.
Kontaktfreigabe erlaubt keinen positiven Volumenschnitt und ersetzt keinen
positiv geforderten Abstand. Gelenkverbindungen werden nicht ausgenommen.
Für CAD/Netz-Mischpaare ohne vorhandene Abstandsmessung bleibt diese Prüfung
ausdrücklich unbekannt; deren Volumenschnitt bleibt als Näherung erkennbar.

Bereiche behalten Messmethoden, Minima und Fundstellen samt Paar,
Antriebswert und verfügbaren Welt-Messpunkten. Die Oberfläche kann die
betroffene Stellung über Anzeigematrizen darstellen und Teile/Messpunkte
hervorheben. Die Grenze von 501 Stichproben sowie Deadline und Abbruch
bleiben bestehen; keine kontinuierliche Kontakt-/Bewegungsfreigabe.

Messungen bleiben lesend. Ihre lokale `reportId` kann über einen einzelnen
`op:inspection, action:record`-Vorschauauftrag ausdrücklich am Modell
gespeichert werden. `action:limitation` dokumentiert vereinfachte Geometrie,
fehlende Kopplungen oder weitere Einschränkungen mit Teilkennungen und Notiz;
`action:remove` entfernt einen gespeicherten Eintrag. Vorschau/Übernahme/Undo
verwenden die vorhandene gemeinsame Transaktion. Frei vom Client erfundene
Prüfberichte werden auf diesem Weg nicht als lokale Messergebnisse akzeptiert.

Projekt-/Bibliotheksformat 32 speichert diese Daten. Die geprüfte Revision
und eine normalisierte Modellbasis verbinden Prüfbericht und Umfang. Eigene
Prüfmetadaten und resident/deferiert gespeicherte Geometrie ändern die Basis
nicht. Modelländerungen markieren frühere Ergebnisse als veraltet; Undo kann
den geprüften Zustand wiederherstellen. `app/inspection`, Szenenbericht und
Oberfläche beziehen ihren Status aus derselben Funktion. Fehlende
Gelenkprobleme oder gespeicherte Teilprüfungen beweisen keine Gesamtfunktion.
Gespeicherte Dateien sind Projektinformationen und keine kryptographisch
signierten unabhängigen Zertifikate. Teilkopien benötigen neue Messungen.

Eine ebene Mechanik darf seitlich entlang der gemeinsamen Drehachse liegen.
Ein expliziter `planeOffset` erhält diese Lage; alte zentrierte Beziehungen
bleiben unverändert lesbar. Auch diese Erweiterung verlangt Format 32, damit
ältere Leser die zusätzlichen Daten nicht still verlieren.

Alte API-Aufrufe ohne Antwortumfang erhalten ihre ausführlichen Antworten.
Kompakte MCP-Adapter setzen ausdrücklich `responseDetail:summary`; die Wahl
`full` bleibt möglich. Node/Python-MCP, Python-SDK und CLI verwenden dieselben
Serverprüfungen. Status, gezielter Auftragsabbruch und direkte Speicherung
bleiben gemeinsame vorhandene Schnittstellen. Übungsmodusgrenzen bleiben bestehen.

Die Schlussabnahme wird mit ihren tatsächlichen Ergebnissen und offenen
externen Grenzen im privaten Nachweis geführt. Insbesondere ist die frühere
Defender-bedingte FreeCAD-Nachabnahme nicht durch eine Quellprüfung ersetzt.
Keine Schutzumgehung, Installation oder Veröffentlichung durch diesen Block.
