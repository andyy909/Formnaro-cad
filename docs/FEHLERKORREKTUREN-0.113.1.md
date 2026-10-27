# Fehlerkorrekturen 0.113.1

Diese Wartungsausgabe bearbeitet die beim Abgleich von 0.113.0-r3 bestätigten
Start-, Speicher-, Oberflächen- und Prüfprobleme. Vorherige Ausgaben bleiben
unverändert. Die native CAD-Geometrie und ihre Formate werden nicht geändert.

- Ein vom Logging oder von der KI-Einrichtung bereits angelegter Datenordner
  kann ohne profil.json initialisiert werden. Bereits vorhandene Dateien gewinnen;
  alte Einstellungen werden ausschließlich in noch freie Dateinamen übernommen.
  Ein vorhandener ungültiger Profilmarker wird weiterhin nicht überschrieben.
- Eine nicht lesbare oder zu große einzelne Datendatei bleibt unverändert und
  gegen Schreibzugriffe gesperrt. Der übrige Editor kann starten. Nicht lesbare
  Autosicherungen erlauben ausdrücklich weder einen stillen Fallback noch ein
  Überschreiben durch einen leeren Startzustand.
- Ein fehlgeschlagener initialer Autosave verhindert nicht mehr die Bereitschaft
  des geladenen Editors. Nur ein tatsächlich geschriebener Checkpoint wird als
  gesichert vermerkt. Start und System-Theme-Wechsel schreiben keine Einstellungen.
- Globale CSS-Variablen, Browserkontrollen und 3D-Ansicht verwenden dieselbe
  aufgelöste Theme-Einstellung. Systemänderungen werden direkt übernommen.
- .ocad-Speichern begrenzt die beim Konfliktvergleich gelesene Dateigröße und
  wiederholt den Vergleich direkt vor jedem atomaren Rename-Versuch. Eine während
  einer Windows-Dateisperre hinzugekommene externe Änderung wird nicht ersetzt.
- Einstellungen, normale Autosicherungen und Layouts erhalten vor dem Ersetzen
  eine bytegetreue Vorgängerdatei mit der Endung .vorher. Diese Sicherung ist eine
  Vorgängergeneration, kein vollständiges Archiv. KI-Einstellungen sichern die
  vorhandenen bereits verschlüsselten Daten; Zugangsdaten werden nicht entschlüsselt.
- Defekte Einträge in der Liste letzter Projekte werden nach Sicherung bereinigt;
  gültige Einträge bleiben erhalten. Unbekannte neuere Formate werden nicht
  automatisch umgeschrieben.
- Eine beschädigte oder neuere Layoutdatei bleibt zunächst unverändert. Die
  Oberfläche bietet eine ausdrücklich beschriftete Aktion zum Sichern und
  Zurücksetzen sowie erneutes Laden. Normales Zurücksetzen löscht weiterhin
  keine gespeicherten gültigen Layoutprofile.
- Nach Wiederherstellung wird die Arbeitsrevision korrekt erfasst. Da eine
  Autosicherung keine gespeicherte Projektdatei ersetzt, bleibt vor dem Verwerfen
  einer wiederhergestellten Sitzung eine verständlich beschriftete Speicherabfrage.
- Zeichenfehler in Programmeinstellungen, KI-Meldungen und alten Starttexten sind
  berichtigt. Doppelte Übersetzungsschlüssel sind bereinigt. Lizenz- und Fontbytes
  werden durch Git-Attribute vor Zeilenendungsänderungen geschützt.
- Die aktive Hauptseite besitzt eine CSP. Der Prüfkatalog kennt die aktuellen
  Verifikationseinstiege; zusätzliche Phasenargumente sind als Hilfsargumente
  behandelt. Der Netzanzeigetest prüft die tatsächlich gelieferte Geometrie.
- package und test:cad-release starten die aktuelle Pipeline. Die Vorbereitung
  eines frischen Klons ist in [BUILD.md](BUILD.md) beschrieben. Testaudio wird
  lokal erzeugt; historische Releaseartefakte sind keine Voraussetzung.

Die älteren Renderer und versionsgebundenen Paketskripte bleiben als historische
Quellen erhalten; sie werden nicht als aktive Anwendung oder heutiger
Standard-Paketbau ausgegeben. Die integrierte FreeCAD-Laufzeit bleibt das separate
Ausbaupaket 6a. Diese Wartung zieht diesen Ausbau nicht vor.

Der abschließende Paketprüfbericht und seine SHA256-Belege liegen neben der
neuen Ausgabe. Frühere Prüfergebnisse werden nicht auf die neue Version umetikettiert.

Abnahme 27.10.2026: lokale Ausgabe 0.113.1-r2. 687 Basistests und 82 gezielte
Nachprüfungen der letzten Sandbox-/Speicheranpassung bestanden; unveränderte
Quellen per SHA256 an die Basis gebunden. 987 Prüfgruppen in 24 tatsächlichen
Windows-EXE-Läufen, einschließlich aller 23 vorherigen Suiten und 8 neuer
Start-/Theme-/Sandbox-Prüfungen. 9 Paketaufnahmen visuell kontrolliert und
150 vorherige Programmdateien unverändert. Keine Cloud-Modellaufrufe.
Freigabe.json trennt die Basis- und Nachprüfungen ausdrücklich. Die große
Gesamtprüfung wird gemäß Ausbauplan am Ende einer beauftragten Folge ausgeführt,
nicht routinemäßig nach jedem Punkt. Kein GitHub-Upload in dieser Wartungsrunde.
