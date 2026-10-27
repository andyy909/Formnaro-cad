# Formnaro CAD 0.16.0 – Paket 4

## Eine Skizze erstellen

„Skizze …“ in der Werkzeugleiste oder „Bearbeitbare Skizze“ unter Funktionen
öffnet das Zeichenfeld. Rechteck und Kreis lassen sich mit der Maus ziehen;
für eine geschlossene Kontur Punkte anklicken. Die Kontur wird automatisch
geschlossen. „Kontur leeren“ beginnt eine neue Polygonkontur.

Breite, Tiefe, Durchmesser und Extrusionshöhe können Zahlen oder Formeln sein.
Bis zu 40 benannte Maße und 128 Polygonpunkte sind möglich. Ein Beispiel:
`innen = breite − 2 * wand`. Erlaubt sind Zahlen, Maßnamen, `+`, `−`, `*`, `/`
und Klammern. Unbekannte Namen, zyklische Beziehungen, Division durch null,
Selbstüberschneidungen und zurücklaufende Kanten werden abgewiesen.

„Vorschau berechnen“ prüft die Kontur und den extrudierten Körper im nativen
CAD-Kern. Das Fenster zeigt die 3D-Vorschau, aufgelöste Konturmaße und native
Weltgrenzen. Kreise bleiben echte CAD-Kreise. „Extrudieren und hinzufügen“
fügt den Körper auf der aktuellen Arbeitsebene hinzu und erzeugt einen
Undo-Schritt. Abbrechen, Escape und Schließen erhalten den bestätigten Stand.

## Eine bestehende Skizze bearbeiten

Skizze auswählen und in den Eigenschaften „Skizze bearbeiten“ öffnen.
Gruppen im Quellenbaum aufklappen und die Skizzenquelle auswählen, um sie auch
innerhalb einer Gruppe zu bearbeiten. Formeln und Maßnamen bleiben gespeichert.
„Skizze ändern“ berechnet die Gruppe nativ neu.

Der lokale Skizzenursprung liegt auf ihrem bisherigen Boden. Die vollständige
Objekttransformation bleibt beim Bearbeiten bytegenau erhalten, einschließlich
Drehung, ungleichmäßiger Skalierung, Spiegelung und Scherung. Daher zeigt das
Fenster sowohl lokale Konturmaße als auch die resultierenden Weltgrenzen.
Quellenkennungen, Farbe und unbeteiligte Teile bleiben erhalten. Duplikate und
Bibliotheksvorlagen erhalten unabhängige Quellenkennungen und alle Formeln.
Sperren und veraltete Vorschauen verhindern die Übernahme. Eine laufende
Berechnung lässt sich mit Escape tatsächlich im CAD-Worker abbrechen.

## Dateiformat und Sicherungen

Projekte mit nativen Skizzen verwenden CAD-Dateiformat 7. Gewöhnliche Projekte
ohne neue Inhalte bleiben Format 5; vorhandene CAD-5-Dateien lassen sich öffnen.
Netzformat 6 bleibt getrennt. Diese erste Stufe unterstützt eine einfache
geschlossene Kontur und lokale Maßformeln, keinen allgemeinen Zwangslöser.

Autosicherung und Bibliothek verwenden ab dieser Ausgabe getrennte CAD-7-
Bestände. Nur wenn der neue Bestand fehlt, werden alte CAD-5-Daten gelesen und
geprüft. Alte Dateien bleiben erhalten. Fehlerhafte neue Daten führen niemals
zum Rückfall auf alte Daten. Beschädigte Sicherungen werden auch beim Beenden
und Neuladen erhalten; automatische Sicherung bleibt für die Sitzung gesperrt.
Der geprüfte neue Bibliotheksbestand wird erst nach nativer Prüfung aller alten
Vorlagen geschrieben. Die portable Ausgabe ersetzt keine Installation.

## Lokale KI-Schnittstelle

API 1 und die MCP-Werkzeugnamen bleiben erhalten. Der CAD-Befehl `sketch`
erstellt eine Skizze; mit `target` bearbeitet er eine vorhandene Skizzenquelle.
Kontur, Variablen, Formeln und Polygonpunkte erscheinen im nativen Szenenkontext.
Der Ablauf bleibt Vorschau gegen die aktuelle Revision, Prüfung, dann Übernahme.

## Abnahme

Die Etappe wird mit nativen Volumen- und STEP-Prüfungen, echten Mausaktionen,
affinen Gruppen, Duplizieren und Bibliotheksrundlauf geprüft. Hinzu kommen
Sperren, Escape, Auswahlwechsel, veraltete Vorschauen, Worker-Abbruch und echte
Neustarts mit gültigen alten beziehungsweise beschädigten neuen Sicherungen.
Die Prüfungen laufen zusätzlich gegen die tatsächlich gepackte EXE; passende
Anwendungs-, Konverter- und CAD-Kernquellen, Lizenzen und Belege sind beigelegt.
