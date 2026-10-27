# Formnaro 0.106.0

Diese Ausgabe enthält den Foto-Assistenten sowie die seit dem GitHub-Stand
0.103.1 fertiggestellten KI-, FreeCAD- und Programm-Assistentenfunktionen.

- **Foto-Assistent:** Im KI-Chat ein Bild anhängen und **Foto vermessen** wählen.
  Referenzmaß, Bildpunkte, Maße mit Herkunft und geschätzter Unsicherheit sowie
  Außenkontur und sichtbare Öffnungen erfassen. Lokale Messungen und beschriftete
  Ausschnitte helfen der KI bei der Konstruktion. Ein kalibrierter Vergleich der
  Vorschau berichtet Form-, Maß- und Öffnungsabweichungen und zeigt sie farbig.
  Die Referenz und native Sollprüfungen bleiben bei Korrekturen fest. Messberichte
  lassen sich ohne Bilddaten als JSON speichern. [Anleitung](FOTO-ASSISTENT.md).
- **Programm-Assistent:** Programmauskunft, sichtbare Menüführung mit Zeiger,
  Pause/Tempo/Stop und schrittweise CAD-Vorführungen als normale Vorschau.
  Eigene begrenzte Anbieter-Kontextnotizen verwenden einen festen lokalen Pfad.
  [Anleitung](PROGRAMM-ASSISTENT.md).
- **Lokale FreeCAD-Python-Werkzeuge:** Die zusätzlich installierte FreeCAD-API
  ist in einer getrennten lokalen Ausführungsumgebung für Konstruktion,
  API-Erkundung, Messungen und parametrische Dokumente nutzbar. Ergebnisse
  durchlaufen Prüfung, STEP-Readback und Vorschau/Übernahme/Undo. FreeCAD selbst
  wird nicht mitgeliefert. [Technik und Grenzen](FREECAD-KI.md).
- **KI-Verbrauch und Kontextgrößen:** Anbieterbezogene Statistiken und lokale
  Größenanzeige; Abo-API-Gegenwert und API-Kosten bleiben getrennt. Fehlende
  Angaben werden als unbekannt dargestellt. Auftragsbezogene Fehlerbelege
  erhalten gescheiterte Wege auch über spätere Mess- und Formatfehler hinweg.
  [Arbeitsumgebung](KI-ARBEITSUMGEBUNG.md).

## Download und Prüfung

`Formnaro-v0.106.0-Windows.zip` vollständig in einen eigenen Ordner entpacken und
`App/Formnaro.exe` starten. Vorhandene eigene Einstellungen und Werkzeuge beim
Wechsel über den bisherigen Datenordner mitnehmen. Persönliche Fotos, Modelle,
Profile und Zugangsdaten sind nicht enthalten. Die Mini-Ausgaben bleiben
eigenständig; ihre Downloads stehen weiterhin im Release 0.103.1.

232 Kernprüfungen am eingefrorenen Quellstand und 567 Prüfgruppen an der
tatsächlichen Windows-EXE bestanden, darunter 54 Foto-Prüfgruppen. Messrunde,
absichtlicher Fehlentwurf, Korrektur bei unveränderten Referenzen/Sollprüfungen,
native Geometrie, Vorschau, Apply und ein Undo wurden mit beiden Anbieterprotokollen
und simulierten Antworten geprüft. Keine Rendererfehler oder externen Testanfragen.
Alle 134 geschützten früheren EXE-/ASAR-Dateien unverändert. Helle/dunkle und kleine
Ansichten einschließlich sichtbarer Fotopixel nach Fenstergrößenwechsel geprüft.

Der Foto-Assistent ist für frontale Fotos flacher Teile ausgelegt. Perspektivische
Entzerrung und allgemeine Mehrbildrekonstruktion sind nicht enthalten. Eine ähnliche
Silhouette beweist weder Tiefe und Innengeometrie noch Bohrungsmaße, Belastbarkeit
oder Fertigungspassung. Die Tests sind kein allgemeiner Qualitätsnachweis für
unbeaufsichtigte reale KI-Rekonstruktionen.
