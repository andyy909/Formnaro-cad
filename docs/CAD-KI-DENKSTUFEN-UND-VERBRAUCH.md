# KI-Denkstufen und Verbrauch

Formnaro 0.21.0 ergänzt die vorhandene KI-Anbindung. Die native CAD-Berechnung,
die gespeicherten Modelle und die lokale API-Version bleiben erhalten.

Im KI-Chat erscheint bei DeepSeek die Auswahl **Denkstufe**:

- **low · Einfach:** kleine Änderungen.
- **high · Standard:** übliche Konstruktionen; bisheriger API-Standard.
- **max · Gründlich:** komplexe Konstruktionen oder schwierige Aufgaben.

Die Auswahl wird im jeweiligen Anbieterprofil gespeichert. Ein Wechsel erhält
den verschlüsselten Schlüssel. Während der Anfrage ist die Auswahl gesperrt.
Auch die API-Einstellungen enthalten die Denkstufe. Andere Anbieter erhalten
keine zusätzlichen DeepSeek-Parameter. Empfohlen: `deepseek-flash` und
`https://api.deepseek.com`, mit dem vorhandenen Responses- oder Chat-API-Format.

Wenn eine KI-Antwort nicht lesbar ist oder die native Vorschau fehlschlägt,
erhält die KI die Fehlermeldung und den verworfenen Vorschlag zur Korrektur.
Es gibt höchstens **zwei Korrekturversuche**, also drei API-Anfragen insgesamt.
Die ursprüngliche Aufgabe, Maße und Bildanhänge bleiben erhalten. Netzwerk- und
Zugangsfehler lösen keine automatischen Wiederholungen aus. Abbruch, geänderte
Auswahl oder Modellrevision stoppen die Schleife. Eine geänderte Anbieterwahl
verhindert die nächste Anfrage an einen anderen Anbieter.

Erfolgreiche Vorschläge bleiben Vorschauen. Erst **Übernehmen** verändert das
Modell; Rückgängig stellt die gesamte Änderung wieder her. Die Validierung
prüft die Geometrie, nicht automatisch jede fachliche Anforderung einer Aufgabe.

Unter dem Eingabefeld stehen die gemeldeten Eingabe-/Ausgabetokens, enthaltene
Denk-Tokens, API-Wartezeit und Anzahl der Anfragen. Korrekturversuche werden
mitgezählt, auch bei einem am Ende fehlgeschlagenen Vorschlag. Fehlende
Anbieterzahlen werden als unbekannt angezeigt. Verbrauch geht nicht als
Gesprächsinhalt an den Anbieter zurück.

Für bekannte DeepSeek-Modelle erscheint eine **Kostenschätzung in USD** als
Spanne zwischen Neben- und Hauptzeitpreisen. Die Schätzung berücksichtigt
gemeldete Cache-Tokens und zählt Denk-Tokens nicht doppelt. Die verwendete
Preistabelle hat den Stand 14.10.2026. Unbekannte Modelle erhalten keine
erfundene Kostenschätzung; fehlende Cachezahlen erlauben nur eine Schätzung
ohne Cache-Ersparnis. Maßgeblich ist die tatsächliche Anbieterabrechnung.

Die gemeinsame Prüfung mit realen DeepSeek-Anfragen ist in
[DEEPSEEK-CAD-VERGLEICH.md](DEEPSEEK-CAD-VERGLEICH.md) beschrieben.

Schlüssel werden in der vorhandenen Oberfläche eingetragen und verschlüsselt
gespeichert. Lokale KI-Steuerung benötigt weiterhin keinen Cloud-Schlüssel.
