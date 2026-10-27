# Formnaro-Programm-Assistent

Im KI-Chat kannst du Fragen zu Formnaro stellen, Werkzeuge erklären lassen und
um eine sichtbare Vorführung bitten. Der eingerichtete KI-Anbieter wird auch
hierfür verwendet. Beispiele:

- „Wo finde ich die Wanddickenkarte? Zeig mir das Menü.“
- „Was ist der Unterschied zwischen Ausformung und Austragung?“
- „Öffne die KI-Einstellungen und zeig mir die Kontextgrößen.“
- „Zeig Schritt für Schritt, wie eine Platte mit einer Bohrung aufgebaut wird.“

Die KI erhält einen lokalen Werkzeugkatalog mit Voraussetzungen sowie den
aktuellen Bedienmodus und die Verfügbarkeit bekannter Bedienelemente. Sie kann
zusätzliche lokale Hilfe abfragen. Objektnamen und Dokumenttexte sind Daten;
sie erteilen der KI keine zusätzlichen Rechte.

Bei einer Bedienhilfe erscheinen ein blauer Fensterrand, ein großer Zeiger und
eine Erklärung zum aktuellen Schritt. Register und Menüs werden tatsächlich
geöffnet. Pause, Geschwindigkeit und Stop sind in der Vorführung erreichbar.
Esc, ein eigener Klick außerhalb der Vorführsteuerung oder ein Wechsel in ein
anderes Programm unterbrechen sie. Deaktivierte Werkzeuge bleiben deaktiviert;
die KI soll die benötigte Auswahl erklären.

Eine Modellvorführung zeigt nacheinander berechnete Konstruktionsstände. Diese
bleiben Vorschauen. Erst **Übernehmen** bestätigt das gesamte Ergebnis als
einen Rückgängig-Schritt. **Verwerfen** erhält das bisherige Modell. Auch nach
einer Vorführung sind nur die ausdrücklich aufgeführten Ergebnisprüfungen
nachgewiesen. Eine reine Programmfrage erhält eine schon vorhandene KI-Vorschau.

Die Steuerung verwendet benannte Formnaro-Ziele. Sie hat keine Betriebssystem-
Maus, freie Tastatureingabe, beliebige Selektoren, externen Programme oder freien
Dateipfade. Sie kann Dialoge zeigen; Dateiöffnen und Speichern in fremde Ziele
werden damit nicht automatisch bestätigt. Modellierbefehle verwenden weiter die
vorhandene geprüfte Vorschau und die isolierten Rechenumgebungen.

Auf Wunsch kann die KI eine kurze Notiz an ihre eigene Kontextdatei des aktiven
Anbieters anhängen. Vorhandener Text wird erhalten. Anbieterprüfung, Dateigröße,
Änderungskennung und Schutz bekannter Zugangsdaten begrenzen diese Schnittstelle;
ein beliebiger Schreibpfad ist nicht vorgesehen. Kontextnotizen ersetzen keine
Prüfung am aktuellen Modell.

Anbieteranfragen einschließlich Hilfesuche und Korrekturen werden im vorhandenen
Kostenrechner erfasst. Bedienhilfen zählen zu „Bedienhilfe / Fragen“; Konstruktion,
Bearbeitung und STL-Nachbau entsprechend ihrem Auftrag. Die Einteilung ist eine
automatische Zuordnung. Reine lokale Zeigerbewegungen kosten keine API-Tokens.

Technisch: `programAssistant` erweitert den gemeinsamen Kontext. Die internen
Chatantworten verwenden `assistant.kind` mit `help`, `guide`, `demonstrate` oder
`note`. Der Renderer prüft alle Ziele vor dem Start. Die externe Modell-API
`preview` behält ihr bestehendes CAD-Befehlsformat.
