# Formnaro 0.125.0-r36 – lokale Release-Abnahme

Die portable Ausgabe **0.125.0-r36** erweitert native Modellierung, Fehler- und Speicherbehandlung, revisionsgebundenes Speichern, gezielte Werkzeugauskunft, Schraub- und Kippkopplungen sowie gespeicherte Prüfstände. Bestehende Quellen und ein gemeinsamer Undo-Schritt bleiben erhalten.

Der vollständige lokale Funktionskatalog wurde abgearbeitet: **2906 Node-Tests und 71 Desktop-Prüfgruppen**, ergänzt durch **20 Python-Tests und acht native CNC-Regressionsfälle**. Befunde aus dem ersten Lauf und ihre Nachprüfungen sind im Prüfbericht ausgewiesen. Ein neuer DeepSeek-Harness-Durchlauf prüfte Fehlerkorrektur, explizites Apply und das Erkennen eines veralteten Prüfstands. Die gepackte EXE wurde mit isoliertem Profil, nativem FreeCAD, Speichern und regulärem Prozessende geprüft; das ZIP zusätzlich nach frischem Entpacken in einen Umlautordner aus einem fremden Arbeitsverzeichnis.

Bewegungs- und Abstandsprüfungen gelten für die tatsächlich berechneten Stellungen und Paare. Sie sind keine durchgehende Kontakt-, Last- oder Fertigungsfreigabe. Eine frische Windows-VM-Abnahme ist nicht enthalten. Neue Prüfstände verwenden Projektformat 32; ältere Projekte bleiben lesbar.

Passende Quellen: [Versions-Tag](https://github.com/andyy909/Formnaro-cad/tree/v0.125.0-r36) · [Quellcode-ZIP](https://github.com/andyy909/Formnaro-cad/releases/download/v0.125.0-r36/Formnaro-Quellcode-v0.125.0-r36.zip) · [Prüfbericht](https://github.com/andyy909/Formnaro-cad/releases/download/v0.125.0-r36/Paket-Pruefstand.json) · [Abnahmeumfang](GESAMTPLAN-RELEASE-ABNAHME.md)
[Aktueller veröffentlichter Stand](AKTUELLER-STAND.md)

Die veröffentlichte Paketprüfung bindet EXE und ASAR mit SHA-256. Native Quellen stehen in separaten Archiven. Private Modelle, Profile, Zugangsdaten und Provider-Gesprächsprotokolle sind nicht Bestandteil des Pakets oder der öffentlichen Quellen.
