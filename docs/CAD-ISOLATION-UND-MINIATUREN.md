# CAD 0.13.0: Übersicht

Paket 1 des CAD-Ausbaus auf Grundlage von 0.12.2. Der native CAD-Kern,
STL-Konverter 0.10, vorhandene Kantenwerkzeuge und Projektformat 5 bleiben erhalten.

## Auswahl isolieren

Im Eigenschaftenbereich neben **Ausblenden** auf **Auswahl isolieren** klicken.
Die ausgewählten fertigen Teile bleiben sichtbar. Eine gewählte Gruppenquelle
isoliert ihre fertige Gruppe; die Quellenbearbeitung bleibt verfügbar.
Der gelbe Hinweis über der Arbeitsfläche enthält **Isolation beenden**.

Isolation ist ein temporärer Ansichtsfilter. Sie verändert keine Ausblendungen,
Layer, Ordner, Sperren, Geometrie oder Undo-Historie. Einpassen, Auswahlrahmen,
Strg+A, native Flächenwahl und Schnittansicht berücksichtigen den Filter.
Ein im Objektbaum ausdrücklich zusätzlich ausgewähltes sichtbares Teil wird
aufgenommen; Gruppieren und Auflösen verfolgen die vorhandenen Quellen.
Wenn kein isoliertes Teil mehr vorhanden oder dauerhaft sichtbar ist, endet
die Isolation. Projektwechsel und Neuöffnen beenden sie ebenfalls.

Export aller sichtbaren Teile und die lokale KI-Projektbeschreibung verwenden
die dauerhaft sichtbaren Teile des Gesamtprojekts. Der Exportdialog erklärt
diesen Umfang. Für einen begrenzten Export **Ausgewählte CAD-Körper** wählen.
Isolation wird weder in Projektdateien noch Autosicherungen gespeichert.

## Projektminiaturen

**Projekte** zeigt für vorhandene Projektdateien eine kleine Modellvorschau.
Die Bilder werden erst geladen, wenn ihre Zeile im Dialog sichtbar wird.
Ein separater nativer Worker und ein eigener Bildrenderer lesen ausschließlich
die gespeicherte Datei. Kamera, Auswahl und Modell des offenen Projekts bleiben
erhalten. Die Vorschau zeigt dauerhaft sichtbare Teile in einer festen Ansicht.

Der lokale Cache liegt unter **Daten/Vorschaubilder** neben dem Programm.
Ein Hash des vollständigen Dateiinhalts bindet jedes Bild an seinen Stand;
Dateiänderungen führen zur Neuerstellung, auch bei geöffnetem Projektdialog. Bei fehlender oder beschädigter Datei,
nicht darstellbarem Inhalt oder mehr als 32 MiB Anzeigepuffern erscheint
**Kein Vorschaubild**. Öffnen und Speichern arbeiten weiterhin mit der originalen
Projektdatei. Beim Schließen oder Wechsel des Dialogs endet die Bildberechnung.
Es werden keine Bilder in Projektdateien geschrieben und keine Cloudanfragen
ausgeführt. Der Vorschaucache gehört zu lokalen Nutzerdaten, nicht ins Paket.

## Auslieferung

Diese Etappe wird separat portabel bereitgestellt und ersetzt keine vorhandene
Installation. Die übrigen sieben Pakete folgen in der beauftragten Reihenfolge.
Die CAD- und Netz-Ausgaben behalten ihre getrennten Geometriekerne und Formate.
