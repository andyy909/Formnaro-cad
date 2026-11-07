# Ergänzungsprüfung – Zwischenanalyse vom 07.11.2026

Der Lauf auf Formnaro0.133.0r3 hat nach43 von69 geplanten Versuchen angehalten. Es läuft derzeit kein weiterer Versuch.26 Versuche einschließlich der drei alten Fehlerfälle wurden noch nicht ausgeführt. Originale bleiben unverändert im Laufordner.

- 34 native CAD-Prüfungen bestanden.
- 32 Versuche zusätzlich mit bestätigtem regulärem Abschluss und zustimmendem Überwacher-Endurteil.
- 8 fehlgeschlagene Versuche und1 Versuch mit Gesamtzeitüberschreitung.
- 295 gültige Überwacherurteile,1 Überwachungsabbruch und2 fehlende Endurteile.

## Erkenntnisse

1. Runden besteht auf low/high/max, Fasen auf low/max. Fasen-high erreichte keinen bestätigten aktiven Kanteneditor. Der neue Bedienweg ist damit real von der KI nutzbar, aber nicht auf allen Denkstufen zuverlässig.
2. Breitenmessung scheitert auf allen drei Denkstufen an verdeckten Flächen. Der feste lokale native Bedienplan hatte bestanden. Die KI-Pläne führen die nötige Freistellung/Ansicht nicht zuverlässig aus. Beim low-Plan steht das Beenden der Isolation im Plan, ohne sie vorher zu beginnen; die gegenüberliegenden Flächen werden ohne passenden Ansichtswechsel angeklickt. Dies trennt vorhandene Werkzeugfähigkeit von erfolgreicher eigenständiger Bedienung.
3. Der Überwacher verwechselt im Isolationsfall25/max ein bereits vorhandenes Schutzteil mit einem zusätzlich erzeugten Körper. Das tatsächliche Ausgangsmodell enthält drei Aufgabenkörper plus das Schutzteil. Der native Prüfer bestätigt unveränderte Modellknoten. Ein klar übermittelter Ausgangszustand und tatsächliche vorübergehende Sichtbarkeit müssen dem Urteil zugrunde liegen; hidden=false alleine beschreibt Isolation nicht.
4. Im Messfall22/low urteilt der Überwacher am Ende continue, weil die Störung behebbar sei. Er behauptet in seiner Begründung keinen erfolgreichen Messwert. Das ist ein Konflikt zwischen der Bedeutung Weiterarbeiten möglich und der Abschlussabnahme. Der Host zählt das ungeprüfte Ergebnis weiterhin als Fehler. Abschlussbeurteilung und Fortsetzungsempfehlung sollten getrennt werden.
5. Im Sperrfall24/max ist die Geometrie korrekt, aber das360-s-Gesamtbudget endet während der abschließenden Überwachung. Zwischen zwei UI-Schritten liegt eine lange Wartephase; deren Ursache ist aus dem vorhandenen Ereignisprotokoll nicht sicher nachgewiesen. Die abschließende Anfrage beginnt erst nach etwa351s und hat damit nur noch rund9s. Dies ist keine belegte erneute45-s-Einzelanfrageüberschreitung. Für das Endurteil muss Zeit innerhalb des Gesamtbudgets eingeplant werden; bloßes Erhöhen des Anfrage-Timeouts löst das nicht.
6. 23 der43 Versuche benötigten zusammen24 Formatkorrekturen:21 Meldungen Ungültige Übungsauswahl und3 ungültige JSON-Antworten. Bei17 Auswahlkorrekturen genügt im lokalen Replay das Entfernen eines zusätzlichen text-Felds aus select-Aktionen, damit der übrige Plan bereits die strenge Validierung besteht. Vier weitere haben zusätzliche Formatprobleme. Hier besteht Potenzial für einheitliche unverbindliche Beschriftungsfelder oder präzisere Schema-Rückmeldung, ohne Modelliergrenzen zu lockern.
7. Zeichnung high/max scheitert am geschlossenen CAD-Menü, Aushöhlen-high an einem nicht verfügbaren Dickenfeld, Gelenk-high an ungültigem JSON trotz begrenzter Korrekturen. Das sind weitere Bedien-/Formatbefunde und keine pauschalen CAD-Kernelfehler.

## Sinnvolle nächste Schritte

- Überwacher mit vollständigem Ausgangsbestand, geschützten Teilen und tatsächlichem sichtbarem Umfang abgleichen.
- Abschlussstatus Erfüllt/nicht erfüllt/nicht geprüft von Weiter-/Stopempfehlungen trennen.
- Endprüfungszeit im360-s-Versuch berücksichtigen und die lange UI-Wartephase untersuchen.
- Beschriftungsfelder im Übungsvertrag konsistent behandeln.
- Messansicht/Isolation und die betroffenen Menü-/Dialogwege gezielt nachprüfen.
- Nach Korrektur nur die betroffenen Fälle wiederholen und anschließend die26 noch fehlenden Versuche ergänzen.

Durch diese Analyse wurden keine Quellen des Prüfpakets verändert, keine Cloudanfragen nachgesendet und keine wartenden Tests gestartet. Eine neue Gesamterfolgsquote oder ein allgemeiner Modellvergleich ist daraus nicht ableitbar.

## Wie es anfing

Die Startdiagnose erfasste den tatsächlich gesendeten Kontext, ausgegebene Anbieter-Denktexte, Auskünfte, Werkzeugaufrufe und Rückmeldungen. Verglichen wurden ein kompakter Einstieg, Werkzeugwegweiser und passende Detailauskünfte. Daraus entstand die Zwei-Agenten-Beobachtung mit isolierten Modellen und unabhängigen nativen Prüfern.

Belegte frühere Änderungen:18 Vorbereitungsfehler bei leerer Skizzenauswahl und6 zu langen Gewindesuchtexten behoben; Vorschaufehler als begrenzte Rückmeldung zur KI zurückgegeben; Größenanker und Ausgangslage geklärt; tatsächliche Werkzeuge/Felder/Menüs dokumentiert; sechs falsch negative Sichtbarkeits-/Sperrprüfungen separat korrigiert; echte Schritte, Fehler und Endbefunde an den Überwacher übertragen; begrenzte Format-/Budget-/Timeoutwiederholung und frühe Prüfung strukturierter Ergebnischecks ergänzt. Das verbessert die Integration und Prüfung, nicht die Modellgewichte durch Training.

Quellen:docs/KI-STARTDIAGNOSE.md,docs/KI-LABOR-AUSWERTUNG-2026-11-06.md,docs/KI-90-TESTS-VERBESSERUNG-2026-11-06.md; aktuelle Rohberichte in F:/Formnaro-Testausgaben/KI-Ergaenzung-0.133.0-r3-2026-11-07/data/KI-Diagnose. Maschinenlesbare Auswertung und Annotation-Replay liegen neben diesem Bericht.

## Unabhängige Nachprüfung der Originalprotokolle

Auf den erneuten Untersuchungsauftrag wurden alle 43 run-JSONs unabhängig vom bisherigen JavaScript-Auswerter mit Python neu gezählt. IDs und Fall-/Denkstufenkombinationen sind jeweils eindeutig; jeder Datensatz enthält genau ein finished-Ereignis. Fortschrittsdatei und Phasensummen stimmen mit 34 nativen Erfolgen, 32 vollständigen Abnahmen und 26 noch wartenden Versuchen überein. Alle 43 Datensätze melden cleanExit=true; dies ist die dokumentierte Abschlussinformation, keine neue Beobachtung laufender Prozesse.

**Wichtige Präzisierung:** Die übrigen neun Versuche haben keine native Endprüfung erreicht (verification fehlt), nicht etwa neun negative geometrische Endprüfungen. Acht scheiterten bereits bei Format oder Bedienung, einer am Gesamtzeitlimit. Weiterhin gilt: 32 vollständig abgenommen + zwei nativ richtig mit problematischem Abschluss + acht Ausführungsfehler + ein Timeout + 26 wartend = 69 geplante Versuche. Der Lauf bleibt blocked. Dies ist keine neue vollständige 90er-Kohorte; historische Erfolge behalten ihre älteren Paketstände.

### Zwei bisher nur als Bedienfehler beschriebene Ursachen genauer belegt

- **Fasen/high (practice-16, run-6cc48b73-deaf-4368-82fd-b084514ee94e.json):** Der Plan öffnet den Kanteneditor und wählt chamfer, setzt anschließend jedoch das allgemeine Größenfeld size-0 auf 1. Der echte Zwischenzustand bestätigt Breite 40 → 1 mm, Mittelpunkt X 0 → −19,5 mm und Volumen 24.000 → 600 mm³. Es wurde also das Bauteil geschrumpft, bevor der Kantenklick scheiterte. Das spätere Feld cad-edge-amount wäre das vorgesehene Fasenmaß gewesen. Der Abschlussbericht enthält dialog=null.
- **Aushöhlen/high (practice-17, run-8c955013-3b95-4369-a7ad-86677100de14.json):** Nach Öffnen der Schale und erfolgreichem Klick auf die obere Fläche setzt der Plan pos-2 auf 0. Der echte Zwischenzustand bestätigt Mittelpunkt Z 10 → 0 mm und Ausdehnung Z −10…10 statt 0…20 mm. Danach fehlt das Dickenfeld; auch hier ist dialog=null. Der Quellpfad cad-modeling-ui.js schließt die aktive Bearbeitung bei einer extern ungültig gewordenen Revision. Ein lediglich fehlender Dickenregler beschreibt den Fehler daher unzureichend.

Dies sind nachweisbare falsche Modelländerungen im isolierten Testprojekt. Ein pauschaler Fehler des CAD-Kerns ist daraus nicht belegt. Die nächstliegende Verbesserung betrifft die Unterscheidung von Bauteileigenschaften und Parametern des geöffneten Werkzeugs sowie die Rückmeldung nach einem dadurch ungültig gewordenen Dialog.

### Der Überwacher erkennt diese beiden Änderungen rechtzeitig

Beim Fasen folgt auf die Größenänderung in supervisor-5 ein stop/explicit_constraint mit der tatsächlichen falschen Größe und Lage. Beim Aushöhlen folgt auf die Verschiebung in supervisor-4 ebenfalls stop/explicit_constraint mit dem falschen Z-Mittelpunkt. Beide Ereignisse melden acted=false: Der Lauf verwendet Shadow-Beobachtung. Der Überwacher durfte die Ausführung nicht anhalten. Dass sie trotzdem bis zum Bedienfehler weiterlief, ist deshalb kein Beleg einer übersehenen Abweichung. Die erste Planbeurteilung hatte in beiden Fällen noch continue ergeben; die tatsächlichen Zwischenwerte waren hier entscheidend. Aus diesen Beispielen folgt keine allgemeine Erkennungsrate.

### Die langen Wartephasen liegen nach bereits abgeschlossenen Urteilen

- **Sperren/max:** supervisor-1 ist bei 22,613 s fertig. Der nächste bestätigte UI-Schritt erscheint erst bei 318,395 s: Ereignislücke 295,782 s. Die abschließende Überwachung startet bei 351,375 s und wird am 360-s-Gesamtlimit abgebrochen.
- **Isolation/high:** supervisor-1 ist bei 23,489 s fertig. Danach folgt bis zum Gesamtzeitfehler bei 360,005 s kein weiterer bestätigter Schritt: Ereignislücke 336,516 s.

Die Verzögerung kann damit nicht durch eine während dieser gesamten Lücke noch laufende Überwacheranfrage erklärt werden. Der genaue Wartezustand ist nicht aufgezeichnet. Fokus-/Pausensteuerung, UI-Eingabe und Rückbestätigung sind gezielt zu instrumentieren; keine dieser Einzelursachen ist hiermit bewiesen. Eine längere Cloud-Anfragefrist wäre keine aus diesen Daten begründete Hauptkorrektur.

### Konsequenz für die Fortsetzung

Zuerst Ausgangsbestand/Sichtbarkeit und Abschlusssemantik des Überwachers, die genannten falschen Eigenschaftenänderungen, Messansicht und Wartephasen verbessern. Anschließend nur betroffene Kombinationen erneut prüfen und die 26 noch nicht gestarteten Versuche ergänzen. Die bereits bestandenen Kombinationen behalten ihre Herkunft und ihren Paketstand. Die Untersuchung hat keine neue KI-Anfrage, keinen neuen Testlauf und keine Produktänderung ausgelöst.

Reproduzierbare Neuauszählung: work/review-lab-2026-11-07.py; Ergebnis mit Einzelzeilen und SHA256 der 43 Eingangsprotokolle: work/review-lab-2026-11-07.json.
