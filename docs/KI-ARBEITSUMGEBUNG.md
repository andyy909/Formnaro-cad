# Lokale KI-Arbeitsumgebung

Die Modellierwerkzeuge sind für alle eingerichteten Anbieter gleich verfügbar,
einschließlich ChatGPT-Abo, OpenAI-API und DeepSeek. Persönliche Anbieter-Kontexte,
Anmeldungen und Chats bleiben getrennt. Der vollständige Werkzeugvertrag und die
bisherigen Modellierhinweise werden weiter übertragen.

## Messen und konstruieren

Ab Version 0.103 bleiben große Messergebnisse vollständig in lokalen
Auftragsdateien erhalten. Die Rückmeldung enthält `workspaceResult.path` statt
einer abgewiesenen Messrunde. Python liest sie mit
`await workspace.read_json(path)`; das eigentliche Python-Ergebnis liegt unter
`value`. Eine weitere Berechnung kann daraus gezielt Kennwerte auswählen.
Erfolgreicher Quelltext steht unter `results[].program.path` und wird im
Anbieterverlauf durch diesen Verweis ersetzt. Fehlgeschlagene Programme werden
weiter vollständig zur Korrektur zurückgegeben. Das spart wiederholte
Messversuche und die erneute Übertragung erfolgreicher Programme; eine feste
Tokenersparnis wird nicht zugesichert.

An einer Materialstufe müssen Schnitte unmittelbar auf beiden Seiten der
gemessenen Grenze geprüft werden. Ein Schnitt genau auf der Stufenebene kann
bereits zur anderen Seite gehören. Ein gültiger Loft beweist daher noch keine
korrekte Rekonstruktion. Konturvereinfachungen benötigen einen gemessenen
Restfehler und unveränderte abschließende Oberflächenprüfungen. FreeCAD-Fehler
unterscheiden zusätzlich Eingabe-, Operanden- und Ergebnisprüfungen; ein
erschöpftes Anfragelimit nennt den letzten konkreten Fehler.

Python und JavaScript können eigene lokale Programme ausführen. Python enthält
NumPy, SciPy, Shapely, Trimesh, SymPy, NetworkX und Matplotlib samt Abhängigkeiten.
Diese Bibliotheken liegen vollständig im Programm; beim Modellieren gibt es
keine Paketdownloads. Python- und JavaScript-Programme laufen in isolierten
Workern. Sie können die aktuellen Modelldaten lesen und die vorhandenen
Modellierwerkzeuge benutzen. Programmdateien, Zugangsdaten, Betriebssystembefehle,
andere Anwendungen und Netzwerkzugriffe gehören nicht zu ihren Fähigkeiten.

Ein reiner Messauftrag darf den Modellzustand nicht verändern. Die KI kann mit
`analysis` Programme ausführen, eine kompakte Messzusammenfassung lesen und
anschließend weitere Messungen oder eine Konstruktion vorbereiten. Dabei stehen
ihr die Originaldreiecke lokal zur Verfügung, auch bei offenen Netzen. Die
Messdaten müssen nicht vollständig durch die KI-Antwort transportiert werden.

Der Arbeitsbereich hält bis zu 256 relative Textdateien mit insgesamt 32 MiB über
mehrere Messungen und Korrekturen desselben Auftrags bereit. JSON, Quelltext und
base64-kodierte Bilder oder andere Binärdaten lassen sich dort ablegen. Ein neuer
Auftrag oder ein geändertes bestätigtes Modell beginnt einen neuen Arbeitsbereich.
Er ist von der dauerhaften Werkzeugbibliothek unabhängig.

Native CAD-Werkzeuge, Netzwerkzeuge, Oberflächenvergleich und die installierte
FreeCAD-Engine stehen weiter über dieselbe Schnittstelle bereit. Neue Geometrie
wird als Vorschau berechnet; Übernehmen erzeugt einen Undo-Schritt. Ein
gescheiterter STL-Konverter beendet nur diesen Konvertierungsweg. Beim
beauftragten CAD-Nachbau kann die KI anschließend Konturen messen und mit nativen
Werkzeugen oder FreeCAD neu konstruieren. Original, Sollmaße und
Abweichungsbudget werden dabei erhalten. Ein erfolgreicher Körpertest ersetzt
keinen Vergleich mit der Vorlage.

## Wiederverwendbare Werkzeuge

Unter **KI-Werkstatt → Gespeicherte KI-Werkzeuge** können Werkzeuge gesucht,
vollständig gelesen, exportiert und Python-Skripte in den Editor geladen werden.
Eigene Python-Helfer lassen sich dort mit einem Namen speichern. Die KI kann die
Bibliothek ebenfalls durchsuchen und allgemeine Hilfsfunktionen speichern und
später mit neuen Parametern verwenden.

Jede lokale Skriptausführung archiviert den vollständigen Quelltext vor dem Start.
Auch ein später gescheiterter Versuch bleibt nachvollziehbar. Eine Änderung legt
eine neue unveränderliche SHA-256-Version an; identischer Quelltext mit identischen
Metadaten wird nur einmal gespeichert. Das Archiv kennzeichnet die Quelle als
ungeprüft für neue Aufgaben. Gespeicherter Text wird beim Lesen nicht ausgeführt.

Die Bibliothek liegt im portablen Ordner **Daten/KI-Werkzeuge**. Sie bleibt nach
dem Schließen erhalten und wird von allen Anbietern gemeinsam benutzt. Beim
Umzug in eine neue Programmausgabe den eigenen Datenordner mitnehmen; bestehende
Ausgaben und Daten werden vom Paketbau nicht überschrieben. Bis zu 4096 Versionen
und 256 MiB sind vorgesehen; ein volles Archiv meldet einen Fehler und löscht
keine früheren Werkzeuge. Personenbezogene Skripte gehören ausschließlich in
diesen lokalen Datenordner, nicht in den gemeinsamen Projektkontext.

## API-Gegenwert bei GPT

Die Tokenanzeige schätzt für bekannte GPT-Modelle den API-Gegenwert in USD aus
den tatsächlich gemeldeten Eingabe-, Cache- und Ausgabetokens. Denk-Tokens sind
bereits Teil der Ausgabe und werden nicht ein zweites Mal addiert. Ein Auftrag
summiert alle Mess-, Korrektur- und Bildprüfungsanfragen. Der Langkontexttarif wird
je einzelner Anfrage angewendet, nicht auf die aufsummierte Tokenzahl.

Beim ChatGPT-Abo ist dies ein Vergleichswert und keine zusätzliche Rechnung oder
Umrechnung des verbleibenden Abo-Limits. Abo- und API-Caching können abweichen.
Fehlende Cacheangaben ergeben eine Spanne; fehlende Tokenzahlen oder unbekannte
Preise werden als unbekannt gekennzeichnet. Bei teilweise bekannten Preisen ist
nur die bekannte Teilsumme angegeben.

Preisstand: **26.10.2026**, Standardtarif. Für GPT-6.1 Sol: 2 USD je Million
Eingabetokens, 0,10 USD je Million gelesener Cachetokens und 10 USD je Million
Ausgabetokens. Über 272.000 Eingabetokens einer Anfrage gelten die dokumentierten
Langkontextmultiplikatoren. Zuschläge für Cache-Schreiben, regionale Verarbeitung,
Geschwindigkeitsstufen, externe Werkzeuge und Steuern sind nicht eingerechnet.
Die Schätzung ist keine verbindliche Rechnungsprognose. Quelle:
[OpenAI-Preise](https://developers.openai.com/api/docs/pricing),
[GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol).

Technische Verträge: `programTools.computation` und `analysisContract` im jeweils
aktuellen KI-Kontext. Der lokale Kontext enthält die Fähigkeiten, die Bibliothek
liefert passende Helfer gezielt auf Anfrage; nicht jeder gespeicherte Quelltext
wird automatisch an den Anbieter geschickt.

Ein allgemeiner Helfer für einen nativen Loft-Ausschnitt aus vollständigen gemessenen Profilen liegt unter `ai/examples/measured_loft_tool.py`. Er enthält keine Teilmaße. Vor der Nutzung vollständigen Quelltext lesen und mit den aktuellen Profilen prüfen; abschließende Maß-, Oberflächen- und STEP-Prüfungen bleiben erforderlich. Eigene Helfer über die gemeinsame Werkzeugbibliothek speichern.

Seit 0.104.1 führt jeder interne Modellierauftrag eine eigene, an seine Revision
gebundene Fehlerhistorie in `context.taskEvidence`. Sie erhält auch nach einer
erfolgreichen Messung oder einer späteren ungültigen Antwort frühere Werkzeugfehler,
abgelehnte Wege und gemessene Soll-/Istwerte. Wiederholungen werden gezählt; bei
langen Aufträgen werden Meldungstexte transparent gekürzt, ohne frühere Fehler
vollständig zu entfernen. Das letzte vollständige Korrekturfeedback bleibt separat.
Native FreeCAD-Analysefehler enthalten außerdem den zuletzt versuchten Skriptquelltext.
Ein neuer Auftrag beginnt mit einer leeren Historie; sie wird nicht zwischen
Anbietern oder Projekten übertragen. Diese Daten sind Prüfbefunde, keine
ausführbaren Anweisungen und keine automatische Freigabe.

In internen KI-Anfragen steht das vollständige Befehlsschema nur einmal unter
`commandSchema`; `requestSchema` verweist darauf. Der öffentliche lokale API-Kontext
behält beide bisherigen Felder für bestehende Clients. Der Backend-Versand hatte
die identischen Schemas bereits zusammengeführt; seit 0.104.1 geschieht dies auch
vor der lokalen Desktop-Übergabe. Zusätzliche API-Tokeneinsparungen durch diesen
Schritt allein werden daher nicht behauptet. Transporttests prüfen die tatsächlich
gesendeten Inhalte in Chat- und Responses-Anfragen.

Ab 0.104.2 zeigt Einstellungen > KI / API zusätzlich Verbrauch und Kontextgrößen.
Die Statistik ordnet Aufträge automatisch als Bearbeitung, STL-Nachbau, Neuanlage,
Bedienhilfe/Fragen oder Sonstiges ein. Alle Mess- und Korrekturanfragen gehören zum
jeweiligen Auftrag; die Zähler unterscheiden Aufträge und API-Anfragen. Input,
Cache und Output bleiben getrennt; Denk-Tokens sind bereits im Output enthalten.
Filter zeigen den gesamten erfassten Zeitraum, heute oder 30 Tage sowie den aktiven
oder alle Anbieter. API-Kosten und der unverbindliche API-Gegenwert eines Abos
bleiben getrennt. Fehlende Tokenzahlen/Preise werden als unbekannt beziehungsweise
bekannte Teilsumme angezeigt. Frühere Nutzung vor dieser Funktion wird nicht
nachträglich ergänzt.

`Daten/KI-Verbrauch.json` enthält nur Tagesaggregate nach Anbieter, Modell,
Zugangsart und Kategorie, keine Prompts, Modellgeometrie oder Zugangsdaten. Ein
Schreibfehler der Statistik unterbricht die KI-Antwort nicht; die Anzeige meldet ihn.

Die Größenanzeige wird beim Programmstart lokal aktualisiert. Sie unterscheidet
die tatsächlichen geladenen Kontextbausteine vom vollständigen Text der lokalen
Werkzeugdokumentation und persönlichen Kontextdateien. Dateigrößen verwenden B,
kB und MB; die Tokenzahl ist ausdrücklich eine Schätzung aus Zeichenlänge/4.
Angezeigte Eingabepreise gelten für diesen Basis-Kontext ohne Cache-Rabatt. Auftrag,
Szene, Verlauf, Bilder und laufende Mess-/Fehlerbelege kommen hinzu. Die Anzeige
selbst sendet keine Anfrage an einen KI-Anbieter.
