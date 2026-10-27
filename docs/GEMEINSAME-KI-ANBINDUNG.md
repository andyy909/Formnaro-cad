# Gemeinsame KI-Anbindung · Formnaro 0.28.1

CAD-Chat und eingebauter STL-STEP-Konverter verwenden dieselben Formnaro-
Einstellungen: Anbieter, Modell, Denkstufe und den vorhandenen Schlüsselspeicher.
Ein Schlüssel wird einmal unter **Einstellungen → KI / API** eingetragen.
Alternativ öffnet **Gemeinsame API-Einstellungen** im Konverter denselben Editor.
Eine dort gespeicherte Auswahl gilt auch für den CAD-Chat. Ein leeres
Schlüsselfeld behält den vorhandenen Schlüssel des ausgewählten Anbieters.

Ab Version 0.95.0 führt **Mit KI** den STL-als-CAD-Import automatisch bis zur fertigen Vorschau aus. Details: [KI-STL-AUTOMATIK.md](KI-STL-AUTOMATIK.md). Der folgende Ablauf beschreibt die weiterhin verfügbare Auswahl **KI-Flächenkorrektur manuell**.

Im Konverter nach der Flächenanalyse **Mit KI bearbeiten** öffnen, geeignete
Bereiche auswählen und die gewünschte Korrektur beschreiben. Unterstützt sind
Flächentypen, Schutz und Zusammenführen über die vorhandenen Regionswerkzeuge.
Bei mehr als 256 Bereichen zuerst die gewünschten Bereiche markieren.

Die KI liefert einen Vorschlag. Die lokale Engine berechnet daraus eine
Flächenvorschau; erst **Flächenkorrektur übernehmen** bestätigt sie.
**Vorschau verwerfen**, Abbrechen oder Schließen erhält den bisherigen Stand.
Rückgängig/Wiederholen im Flächeneditor umfasst den ganzen übernommenen Vorschlag.
Das CAD-Projekt wird erst über die bestehende geprüfte CAD-Übernahme geändert.
Ein Projektwechsel oder geänderter Konverterstand entwertet alte KI-Vorschläge.

Übertragen werden beim Senden der Auftrag und eine begrenzte Zusammenfassung
der betreffenden Bereiche: Nummer, Typ, Dreieckszahl, Schutz und erkannte Radien.
STL-Geometrie, Dateinamen und Pfade werden dafür nicht übertragen. Die gemeinsame
Anbindung bearbeitet jeweils eine Anfrage; Abbruch gehört zur jeweiligen Anfrage.
Es entstehen weiterhin die üblichen API-Kosten des gewählten Anbieters.

Die eigenständige Konverter-Anwendung behält ihre eigene KI-Einrichtung. Ihre
neueren Maßrezept-Werkzeuge sind noch nicht in Formnaro übernommen. Die hier
eingebundene lokale Engine 0.10.0 und deren CAD-/STEP-Prüfung bleiben unverändert.
Eine KI-Typvorgabe beweist weder eine Fläche noch Maßhaltigkeit.

Diese Ergänzung zieht auf Nutzerwunsch den KI-Anbindungsteil von Paket 12 vor.
Sie schließt weder das ganze Paket 12 noch die Objektumwandlungen 10/11 ab.
Separate Ausgabe: `release-formnaro-gemeinsame-ki-v0.28.1/Formnaro-win32-x64`.
Portable ZIP: `output/Formnaro-Gemeinsame-KI-v0.28.1.zip`.
