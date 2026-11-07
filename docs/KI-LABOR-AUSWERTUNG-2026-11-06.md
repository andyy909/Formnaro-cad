# Auswertung der gesicherten KI-Testlabor-Ergebnisse

Archiv SHA-256: `2b4e35c12dc08507c8844c261fbd32609636cd07697f5198fdc0fb7afe83b9e4`. 150 Versuche der unveränderten 0.129.0-r1-Kohorte; frühere Startdiagnose im ZIP bleibt eine eigene Kohorte.

| Serie | Läufe | nativ bestanden | geprüft | Vorbereitungsfehler |
|---|---:|---:|---:|---:|
| Bestätigung · neue Aufgaben · low | 24 | 17 | 18 | 6 |
| Bestätigung · neue Aufgaben · max | 24 | 14 | 16 | 6 |
| Pilot · A/C/D auf allen Denkstufen | 9 | 0 | 0 | 0 |
| Bildvergleich · vollständige Modelle | 18 | 17 | 17 | 0 |
| Bestätigung · neue Aufgaben · high | 24 | 16 | 16 | 6 |
| Entwicklung · vollständige Modelle C/D | 36 | 27 | 28 | 6 |
| Sichtbare Übung · Bilder und alle Denkstufen | 9 | 1 | 7 | 0 |
| Auswahl gegen volle Szene | 6 | 5 | 5 | 0 |

## Belegte Erkenntnisse und Änderungen

- 18 Skizzenläufe scheiterten vor der ersten Modellanfrage an einer leeren Auswahl für den Auswahl-Szenenabruf. Bei leerer Auswahl wird jetzt die reguläre Szene verwendet und die Gesamtansicht eingerahmt.
- Sechs Gewindeläufe der neuen Aufgaben scheiterten ebenfalls vor der Modellanfrage: Der vollständige Auftrag überschritt das Suchtextlimit von 300 Zeichen. Nur der lokale Suchtext wird jetzt begrenzt; der Modellauftrag bleibt vollständig.
- Drei fremde/falsche Vorschaukennungen beendeten den Versuch sofort. Die bestehende Besitzprüfung bleibt erhalten, meldet den Fehler jetzt aber innerhalb der normalen Werkzeugrückmeldung an die KI zurück. Ein neuer Vorschauaufruf bleibt möglich; identische erfolglose Wiederholungen bleiben begrenzt.
- Bei den sichtbaren Übungen änderten sechs von sieben abgeschlossenen Ergebnissen die Größe, verfehlten aber die erhaltene Lage. Der Größenanker stand auf bisheriger Ecke. Der kurze gemeinsame Übungsauftrag nennt jetzt den realen Auswahlweg zum Mittelpunktanker. Der echte sichtbare lokale Zylindertest bestätigt Ø14 ×80 und Mittelpunkt (0,0,40). Die zwei anderen Übungsabbrüche betrafen einen fehlenden/deaktivierten Modellierdialog; daraus folgt keine Freigabe dieses Dialogwegs.
- Vorbereitungsfehler werden im JSON/CSV/Markdown-Bericht zusätzlich ausgewiesen; sie bleiben als fehlgeschlagene Versuche sichtbar. Alte Ergebnisse werden nicht nachträglich in Erfolge umgewertet.
- 17/18 im Bildvergleich und 5/6 bei Auswahl/ganzer Szene sind kleine, getrennte Kohorten. Daraus folgen weder ein allgemeiner Bildvorteil noch eine gesicherte Denkstufen-/Kontextrangfolge. Keine normalen KI-Defaults aufgrund dieser Daten geändert.

## Neue Funktionstests und Grenzen

Alle 30 Spezifikationen aus UEBUNGSMODUS-FUNKTIONSTESTS.md sind als isolierte Aufgaben mit Ausgangsmodellen und aufgabenspezifischen Pflichtprüfungen registriert. Vorlage „30 Übungsfunktionen“: Kontext C, low/high/max, vollständiger sichtbarer Übungsablauf, beobachtender Überwacher, 90 Versuche. Auswahl einzelner Fälle und anderer Varianten bleibt möglich. Agenten-Fallback und erfundener Holdout sind für diese neuen Fälle abgewiesen.

Neu aufgezeichnete Zwischenzustände enthalten native Bounds/Volumen, Modellknoten, Kamera, Sichtbarkeit, Arbeitsebene und Undo-Tiefe. Fehlende Zwischenbelege ergeben keinen Erfolg. Die Prüfer für Verrundung/Fase verwenden Volumen plus eine Probe an der vorgegebenen Kante; dies ist keine umfassende topologische Gleichheitsprüfung. Mechanik und UI-Fälle bleiben experimentell, bis ihre vollständigen sichtbaren Positiv- und Gegenkontrollen durchgeführt sind.

Lokal geprüft: alle 30 Ausgangsmodelle nativ aufgebaut, unveränderte Ausgangsergebnisse mit einem realen Basis-Zwischenbeleg in allen 30 Fällen abgewiesen; zehn richtige native Referenzen für Fälle 1,3,4,5,9,10,12,13,18,29 akzeptiert; Größenanker im echten sichtbaren Übungsfenster erfolgreich. Weitere sieben ursprüngliche Aufgabenfamilien besitzen die vorhandene separate Vorprüfung. Kein Beleg für eine abgeschlossene 90er-KI-Serie.

128 Standardtests, 30 gezielte Labor-/Regressionstests und vier neue Katalog-/Plan-/Berichtstests bestanden. Gepacktes 0.131.0: Bohrung/Schema/Preview/Materialprüfung/Screenshot/regulärer Kindprozess-Exit geprüft; Labor aus Einstellungen geöffnet/geschlossen/erneut geöffnet, Vorlage mit 30 Fällen und 90 Versuchen geprüft, Fenster regulär geschlossen.

Neue Ausgabe lokal unter F:/Formnaro/Programm-v0.131.0/Formnaro-win32-x64/Formnaro.exe. Keine Veröffentlichung und keine neuen Cloudanfragen für diese technischen Prüfungen.

Bei der ersten gepackten nativen Probe waren Geometrie und Screenshot erfolgreich, der Abschluss hatte jedoch keinen bestätigten Exitcode 0 (Assertion null != 0). Dieser Versuch gilt nicht als vollständig bestanden. Der neue isolierte Nachlauf unter work/release-0131-native-retry bestand inklusive regulärem Exitcode 0. Die UI-Probe gegen gepackte Ressourcen schloss ebenfalls regulär.
