# Mini 0.6 – Eigene Formen in der Palette

Auftrag: zwischen normalen und eigenen Formen umschalten und gespeicherte
Bibliotheksteile mit der Maus auf Grundebene und Körperoberflächen ziehen.

## Verhalten

Zwei zugängliche Tabs in derselben Seitenleiste, mit Pfeiltasten/Home/End
bedienbar. Eigene Formen zeigen bis zu zwölf gespeicherte Bilder pro Seite,
Suche und Favoritenfilter. Keine Modellberechnung beim Umschalten. Bibliothek
verwalten bleibt über die Palette und den oberen Projektbereich erreichbar.
Nach Speichern/Bearbeiten aktualisiert sich eine aktive Palette automatisch.

Native Mausablage verwendet dieselbe Vorschau, Oberflächenwahl, Rasterung und
Ausrichtung wie Grundformen. Modell und Undo bleiben bis zum gültigen Drop
unverändert; Esc und Abbruch verwerfen. Klick bereitet eine Ablage per Zielklick
vor, auch als gemeinsame Unterstützung für den vorhandenen Android-Adapter.
Später abgeschlossene Ladevorgänge dürfen abgebrochene Vorschauen nicht öffnen.

Einzelteile behalten ihre lokalen Achsen. Mehrteilige Vorlagen werden über einen
virtuellen gemeinsamen Rahmen starr positioniert. Die farbige Vorschau verwendet
die vorhandenen Netze. Kein boolesches Vereinigen zur Ablage. Kontaktpunkte kommen
von sichtbaren Körpern; Lochformen/ausgeblendete Teile erzeugen keinen falschen
Abstand. Nur wenn keine sichtbaren Körper existieren, zählen sichtbare Lochformen.
Nach Bestätigung werden alle Originalteile mit rekursiv neuen IDs übernommen;
Farben, Größen, Spiegelung, Parameter und Gruppenquellen bleiben erhalten. Ein Undo
für die gesamte Ablage. Grenzen des Mini-Projekts werden vor dem Laden geprüft.

## Prüfungen

Unitprüfung: exakte starre Matrizen auf schrägen Flächen, Auflage ohne künstliches
Anheben durch lange Lochformen oder verborgene Teile, unveränderte Originale,
Einzelteil mit deaktivierter Flächenausrichtung und Größenlimit.

Desktopprüfung: native echte Drag-/Drop-Ereignisse aus eigener Palette, Vorschau,
Boden, Körper und schräge Fläche, Gruppendaten und IDs, Abstand mehrerer Teile,
Undo, Esc, Klickvorbereitung, schneller Abbruch während Laden, Tabwechsel,
kaputte Bibliotheksdatei, Filter/Blättern und Sidebar bei minimaler Fensterbreite.
Bisherige Bedienprüfungen weiterhin Teil der vollständigen Abnahme.

Erste eigene Bilder zeigten zu breite Bildkacheln; minmax(0,1fr) und min-width:0
begrenzen die Kacheln jetzt auf die Seitenleiste. Erster Tastaturtest benutzte
ArrowLeft als Electron-keyCode; native Electron-Eingabe heißt Left (DOM-Key ist
ArrowLeft). Fehlerbeleg bleibt lokal erhalten. Gezielte Folgeprüfung mit 22 Punkten grün;
Bilder bei 1000px und auf schräger Fläche visuell geprüft. Ein weiterer
Gesamtlauf lieferte nach letzter Sidebar-Aufnahme keinen Abschluss und wurde
als unvollständig beendet. Prüfung nach Fenstervergrößerung wartet nun auf
Layoutaktualisierung; Schlussaufnahme verwendet ein sichtbares Prüffenster.
Die Rohbelege bleiben erhalten; erfolgreiche Gesamtabnahme separat belegen.

Windows-Ausgabe erhält eine neue Versionsnummer. Vorhandene Android-Test-APK
und die große Formnaro-Ausgabe bleiben unverändert; dieser Auftrag liefert keine
neue Tablet-APK. Gemeinsamer Quellcode behält die vorhandene Android-Anbindung.
