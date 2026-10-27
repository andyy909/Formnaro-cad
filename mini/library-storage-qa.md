# Mini 0.6.1 – Portable Bibliotheksablage

Standard: Bibliothek direkt neben der Windows-EXE. Projekt-/Ansichtssicherung
bleibt in Daten-Mini. Speicherort und bewusste Ordnerwahl in der Bibliothek,
mit Rückkehr zur Standardablage. Ordnerwechsel kopiert gültige Modelldateien,
Bilder und Metadaten, lässt die bisherigen Dateien bestehen und veröffentlicht
die Einstellung erst nach erfolgreicher Übernahme. UUID-Konflikte erhalten beide
Varianten; idempotente Kopien erzeugen keine weiteren Einträge.

Legacy aus Daten-Mini/Bibliothek wird einmalig übernommen. Übernahmebeleg im
Bibliotheksordner verhindert erneutes Einlesen/Validieren der Sicherung bei jedem
Start und unerwünschtes Wiederherstellen alter Namen/Favoriten. Bewusst gewählte
andere Ablage wird absolut, Standardablage als null in bibliothek-ort.json gespeichert.
Keine feste Referenz auf den bisherigen Programmordner beim portablen Standard.

Fehlerhafte oder nicht lesbare Einträge bleiben in der Quelle, Warnung statt
Datenlöschung. Ungültige Einstellungen können über Standard/Ordnerwahl korrigiert
werden. Schreibfehler lassen aktuelle Einstellung und Quellen erhalten. Pfade und
Eintragsdateien werden geprüft; keine rekursiven Verschiebungen oder Löschungen.
Kein Einlesen der großen Formnaro-Bibliothek. Keine Änderung der bestehenden APK;
Speicherort-Schaltflächen werden nur bei vorhandener Desktop-Brücke angezeigt.

Vier neue Unitgruppen: bytegleiche Legacyübernahme, bearbeitete Metadaten nach
Neustart, Sicherung wird nicht erneut gelesen, explizite Ordnerwahl/Persistenz/
Standardreset, UUID-Konflikt und kaputte Quelle, fehlgeschlagene Zielwahl und
ungültige Einstellungen. Fünf neue Desktopgruppen: physische Dateien neben EXE,
nativer Ordnerdialog/Abbruch, bytegleiche Kopie und Quellen erhalten, Renderer-
Neustart und ungültiges Ziel, Rückkehr zum Standard und gemeinsame Formenpalette.
Alle bisherigen Modellier-/Ablageprüfungen bleiben in der vollständigen Abnahme.
Bibliothek und Daten-Mini werden aus Programm-/Quell-Weitergabearchiv ausgeschlossen.
