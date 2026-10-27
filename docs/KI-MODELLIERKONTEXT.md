# Das Modelliergedächtnis

Unter **Einstellungen → KI / API → Modelliergedächtnis** zeigt Formnaro die
Kontextdateien und öffnet deren Ordner. Sie liegen im persönlichen `Daten`-Ordner
neben dem Programm und bleiben beim Beenden erhalten.

Seit 0.98.2 hat jeder Anbieter einen eigenen Unterordner in `Daten/KI-Kontexte`:
`ChatGPT`, `OpenAI-API`, `DeepSeek` oder eine stabile Kennung für einen anderen
Anbieter. Modellwechsel beim selben Anbieter behalten dessen Gedächtnis.
ChatGPT-Abo und OpenAI-API sind getrennt. Jeder Ordner beginnt mit derselben
allgemeinen Werkzeughilfe, sammelt aber ausschließlich eigene Erfahrungen.

Die früher gemeinsam verwendeten Dateien direkt unter `Daten` bleiben als
Archiv unverändert. Die bisher für DeepSeek geführten persönlichen Hinweise
werden einmalig in dessen Ordner kopiert; aus dem alten Journal werden nur
Einträge mit eindeutigem DeepSeek-Modellnamen übernommen. Nicht eindeutig
zuordenbare Einträge bleiben im Archiv. ChatGPT übernimmt diese persönlichen
Hinweise und Alt-Erfahrungen nicht.

Auch Chatverlauf, angehängte Bilder, ungesendeter Entwurf und Verbrauchsanzeige
wechseln mit dem Anbieter. Beim Zurückwechseln erscheint dessen eigener Stand.
Diese Chat-Sitzungen gelten bis zum Schließen der Anwendung; „Neuer Chat“ leert
nur die aktive Sitzung. Die Kontextdateien bleiben dagegen dauerhaft erhalten.
Aktueller Modellzustand und Werkzeugvertrag stehen weiterhin allen Anbietern
für die Bearbeitung desselben Projekts zur Verfügung.

`KI-Modellierkontext.md` enthält lesbare, bearbeitbare Hinweise. Beim ersten
Start wird die mitgelieferte Vorlage `ai/MODELLIERKONTEXT.md` kopiert. Eine
vorhandene persönliche Datei wird nicht überschrieben. Änderungen werden bei
der nächsten KI-Anfrage gelesen; ein Neustart ist nicht erforderlich.

`KI-Modelliererfahrungen.json` ergänzt Formnaro automatisch. Die Datei erfasst
zusammengefasste Fehlertypen, bestandene Vorschauen und übernommene Änderungen
getrennt, einschließlich Werkzeug-/Prüfungstypen, verwendeter Modellkennung,
Programmversion, Anzahl und Zeitpunkt. Sie enthält keine vollständigen
Aufträge, Chatverläufe, Python-Programme, Bilder oder Geometriedaten. Die KI
kann keine freien Erfolgsmeldungen in dieses Journal schreiben.

Bei einer neuen CAD-KI-Anfrage werden die Hinweise und die letzten strukturierten
Erfahrungen an den gewählten Anbieter mitgegeben. Der lokale externe API-Kontext
enthält denselben Hinweistext unter `modelingExperience`. Darum keine Schlüssel,
Zugangsdaten oder vertraulichen Modellbeschreibungen in die Notizdatei eintragen.

Eine erfolgreiche Vorschau beweist die lokale geometrische Gültigkeit und die
ausdrücklich ausgeführten Ergebnisprüfungen. Sie beweist nicht automatisch, dass
alle gewünschten Funktionen oder Fertigungsanforderungen erfüllt sind. Auch
eine Übernahme ist keine zusätzliche Qualitätsprüfung. Aktueller Auftrag,
aktueller Modellzustand, Sperren und Werkzeugvertrag bleiben maßgeblich.

Hilfreiche eigene Einträge nennen die Situation, den beobachteten Fehler, die
bewährte Korrektur und ihren Prüfumfang. Zum Beispiel: „Bei einer offenen Box
den Innenausschnitt nach oben überstehen lassen; die Unterkante beginnt exakt
an der gewünschten Bodenoberseite. Boden und Wände anschließend messen.“
Ungeprüfte Vermutungen entsprechend kennzeichnen.

Die Hinweise sind auf 16 KB begrenzt. Das Journal hält höchstens 60 aggregierte
Einträge; höchstens die letzten 24 fließen in die Anfrage ein. Beschädigte oder
zu große Dateien werden erhalten und als nicht lesbar angezeigt. Die
Modellierung kann weiterhin mit dem aktuellen Werkzeugvertrag arbeiten.

Python-Endteile können einen eindeutigen Ergebnisalias erhalten:

```python
from formnaro import model
plate = model.box(60, 40, 6)
hole = model.cylinder(2.5, 8, origin=(30, 20, -1), hole=True)
part = model.cut(plate, hole, alias="result")
```

Im äußeren JSON-Auftrag können Ergebnisprüfungen anschließend `"$result"`
adressieren. Es wird keine zusätzliche Ergebniskopie angelegt.


Abgeschnittene Providerantworten werden als fehlgeschlagene Ausgaben behandelt.
Die interne Desktop-Verbindung überträgt Fehlercode, Nutzungsdaten und die
Information zur Wiederholbarkeit als strukturierte Daten. Dadurch kann die
vorhandene begrenzte Korrekturschleife den Fehler auch nach dem Übergang in die
Oberfläche erkennen. Es werden höchstens zwei automatische Korrekturen versucht;
Sperren, veraltete Szenen und Abbrüche werden dadurch nicht umgangen.


## Antwortbudget

Unter KI / API lässt sich das Antwortbudget ändern. Ältere DeepSeek-Profile
verwenden automatisch 131.072 Tokens statt bisher32.768. Maximal393.216 Tokens
sind einstellbar; Denkschritte und eigentliche Antwort teilen sich dieses Budget.
Andere Responses-Anbieter behalten zunächst ihren bisherigen Standard12.000.
Der Anbieter muss den eingestellten Wert für das gewählte Modell unterstützen.
Die lokale Antwortannahme erlaubt16MiB und die abbrechbare Provideranfrage bis
zu30Minuten, damit längere Ausgaben nicht an den bisherigen2MiB/10Minuten enden.

Anbietergrenzen geprüft am25.10.2026 anhand der offiziellen Dokumentation:
https://api-docs.deepseek.com/api/create-chat-completion/
