# KI-Überwacher: Umsetzung und Abnahme 06.11.2026

Formnaro 0.132.0, lokales Paket r2. Die frühere 0.131.0-Testserie blieb eingefroren und ist inzwischen getrennt abgeschlossen. Ihre Ergebnisse sind keine Nachweise für den verbesserten Überwacher.

## Änderungen

- Ausnahmerückmeldungen, Schutzverletzungen, falsche Vorschaukennungen und Formatfehler werden an denselben Beobachtungskanal wie erfolgreiche Aufrufe gegeben. Tatsächliche Ausführungsrückmeldungen erhalten eine eigene Prüfung; die letzten Fehler bleiben zusätzlich zu den letzten Ergebnissen verfügbar.
- Das Übungsfenster meldet nach jedem ausgeführten Schritt tatsächliche native Bounds/Volumen, Auswahl, Sperre/Sichtbarkeit, Arbeitsebene, Kamera und Gelenkwerte sowie die aktuelle Revision. Der private, an Fenster und Session-Nonce gebundene Kanal wartet auf Bestätigung. Eine Stopentscheidung kann damit den nächsten Schritt verhindern. Der Beobachter erhält keine Modellierbefugnis.
- Eine eigene Endprüfung erhält den unabhängigen Geometriebefund, tatsächlichen Abschlussfehler, Übernahmestand und bestätigten Prozessabschluss. Auch ein Fehlerlauf wird abschließend beurteilt, soweit ein gültiger Endstand vorliegt. Fehlt ein abgeschlossenes Übungsmodell, wird nicht das Ausgangsmodell als Endergebnis bewertet.
- Native Abnahme und KI-Urteil werden getrennt gespeichert und angezeigt. Ein KI-Weiter kann fehlgeschlagene native Prüfungen nicht in Erfolg umwandeln; fehlendes Endurteil bleibt explizit sichtbar. Bei Abbruch wird kein Endurteil erfunden. Eine negative Endbewertung stoppt keinen bereits abgeschlossenen Vorgang nachträglich.
- Vorschauprüfungen bleiben begrenzt; zusätzlich maximal 51 Ausführungsbeobachtungen je Versuch (50 erlaubte Übungsschritte plus Fehlergrenze bzw. maximal40 Agentenrunden) und ein reservierter Endprüfungsaufruf. Das gemeinsame harte Anfrage- und Zeitbudget bleibt wirksam. Die Planabschätzung zählt diese zusätzlichen Anfragen mit. Die Überwachung verursacht zusätzliche Zeit und Anbietergebühren; daraus folgt keine Einsparbehauptung.
- Zwischenprotokolle kopieren keine vollständigen Modellquellen mehr je Schritt. Ihre notwendigen Zustände und Messdaten bleiben erhalten; Modellquellen verbleiben vollständig im separat übernommenen Ergebnisprojekt. Der unveränderte Grenzwert von 30.000 Zeichen für den Abschlussbericht wird bei der geprüften Fünfschrittfolge eingehalten (5.616 Zeichen). Dies behebt den beim ersten echten Zweiagentenlauf beobachteten Abschlussfehler.

## Nachweise

| Prüfung | Befund |
|---|---|
| Standardtests | 128/128 bestanden |
| Gezielte Labor-, Beobachter-, IPC- und Katalogtests | 60/60 bestanden |
| Vier Kontrollen durch die neue gepackte EXE | Korrekt: fünf echte UI-Schritte und native Abnahme; Lageabweichung: unabhängig negativ; fehlendes Bedienelement: tatsächliche Fehlerrückmeldung und unbewertetes Endmodell; aktiver Stopp: nach erstem fehlerhaften Schritt, vor dem nächsten Schritt. Alle vier Testprozesse regulär geschlossen. KI-Antworten hierbei deterministische Transportkontrollen. |
| Echte DeepSeek-Flash-Gegenprüfung | Sechs tatsächliche Supervisor-Anfragen/Verbrauchsereignisse: drei aufgezeichnete echte UI-Zustände plus ihre Endzustände. Korrekt: Weiter/Weiter; Lagefehler: Unklar/Stop; Bedienfehler: Weiter/Stop. Ein noch korrigierbarer Zwischenschritt muss nicht bereits zum Abbruch führen. Keine Monitorfehler. |
| Vollständiger echter Zweiagentenlauf | Beide Rollen tatsächlich deepseek-flash; Modellieragent lieferte einen Fünfschrittplan, fünf ausgeführte Schritte live beurteilt, natives Ergebnis richtig (Ø14×80, Mittelpunkt erhalten), separates KI-Endurteil Weiter, regulärer Exit0. Quelle: work/monitor-e2e-1793984419222. |
| Gepackte Oberfläche | Einstellungszugang, Öffnen/Schließen/erneutes Öffnen, 30 Aufgaben/90 Versuche, Beschriftung ausgeführter Schritte und getrennte native Endergebnisanzeige bestanden; regulär geschlossen. |
| Paketquellen | Sieben geänderte Backend-/Preload-Dateien stimmen bytegleich mit dem geprüften Quellstand überein. |

Belege: work/monitor-native-1793984340584, work/monitor-live-1793983611054, work/monitor-e2e-1793984419222, work/release-0132-r2-ui. Neue EXE und ausgewählte synthetische Nachweise liegen unter F:/Formnaro/Programm-v0.132.0-r2.

Frühere nicht bestandene Versuche bleiben lokal erhalten: einmal nicht bestätigter nativer Exit, ein fehlgeschlagener Testprojektstart und der erste echte Zweiagentenlauf mit zu großem Abschlussbericht. Diese Versuche werden nicht als vollständige Erfolge gezählt. Der abschließende Paketlauf bestand alle vier Kontrollen; der echte Zweiagentenlauf wurde nach der Berichtsverkleinerung vollständig erfolgreich wiederholt.

## Grenzen

Die kleinen Gegenkontrollen belegen die Rückmeldewege und die beobachteten Urteile. Sie sind keine allgemeine Erkennungsrate für alle 30 Funktionen und keine Freigabe automatischer aktiver Abbrüche im normalen Testplan. Beobachtender Modus bleibt Standard. Die vorigen 109 Versuche gehören weiterhin zur alten 0.131.0-Kohorte; kein stillschweigendes Vermischen.

Die Ausgabe wurde lokal erstellt und geprüft, nicht veröffentlicht oder über eine Bestandsinstallation kopiert. Zugangsdaten und private Profile gehören nicht zu den ausgelieferten Prüfbelegen.
