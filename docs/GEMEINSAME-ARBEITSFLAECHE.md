# Formnaro 0.26.0: gemeinsame Arbeitsfläche

Paket 7 verbindet die vorhandenen CAD- und Netzverfahren mit gemeinsamer
Auswahl, Kamera, Objektbaum, Organisation und Arbeitsebene. Alle Änderungen
verwenden dieselbe Vorschau und dieselbe Rückgängig-Historie.

## Auf einer Fläche arbeiten

1. **Arbeitsebene wählen** aufrufen und eine sichtbare Fläche anklicken.
2. Eine CAD-Fläche setzt wie bisher die native Arbeitsebene direkt. Bei einer
   Netz- oder Vorlagenfläche erscheint eine farbige Ebenenvorschau.
3. Bei Netzflächen **Übernehmen** oder **Abbrechen** wählen. Ein weiterer Klick
   wählt eine andere Fläche; Escape beendet die Auswahl.

Auch offene Netze und Ansichtsvorlagen eignen sich als Flächenbezug, wenn das
getroffene Dreieck eine eindeutige Fläche hat. Dafür ist keine Körperreparatur
erforderlich. Ausgeblendete und durch die Isolation ausgeschlossene Teile werden
nicht getroffen. Die Auswahl berücksichtigt die vorderste sichtbare CAD- oder
Netzfläche. Eine Sperre verhindert die Bearbeitung des Teils; sie verhindert
nicht, seine Fläche als Bezug zu verwenden.

Die Ebene folgt Verschieben, Drehen und Skalieren des Bezugsteils, auch bei
gespiegelten oder gescherten importierten Netzen. Ändert eine Bearbeitung dessen
Dreiecksgeometrie oder entfernt das Teil, bleibt die Ebene an ihrer letzten
gültigen Lage. Formnaro löst den alten Flächenbezug und zeigt einen Hinweis.
Die gewünschte Fläche anschließend erneut wählen. Rückgängig stellt auch den
vorherigen Bezug wieder her.

Neue CAD-Formen verwenden die gemeinsame Arbeitsebene. Bei **Netz-Werkzeuge →
Erzeugen** lässt sich **Arbeitsebene** oder **Weltachsen** wählen. Die Position
heißt entsprechend U/V/N oder X/Y/Z; Maße und eingegebene Positionswerte bleiben
beim Wechsel erhalten. Die Vorgabe folgt dem aktuellen Koordinatenmodus.

## Objektbaum und Quellen

CAD-Körper, bearbeitbare Netze und Ansichtsvorlagen stehen im selben Baum.
Auswahl, Sichtbarkeit, Ordner und Layer gehören zum gemeinsamen Projekt.
Ein Netzteil mit erhaltenen Quellen lässt sich aufklappen. Die Quellenzeilen
zeigen die Herkunft und führen zum passenden Eintrag in **Quellen bearbeiten**.
Sie sind keine zusätzlichen Teile in der Szene. Gesperrte Quellen bleiben
geschützt; eine reine Auswahl verändert keine Geometrie.

Aufgeklappte Zeilen, Kamera und physische Auswahl werden beim Speichern und
Wiederöffnen wiederhergestellt. Der Baum lässt sich auch mit Pfeiltasten,
Pos1/Ende und Enter/Leertaste bedienen. Dichte Netzgeometrie wird zum bloßen
Aufklappen nicht erneut berechnet.

## Bestehende Dateien

Gemischte Projekte bleiben im gemeinsamen Dateiformat 8. Ihr Ansichtsabschnitt
Version 2 speichert zusätzlich den Baumzustand. Reine ältere CAD-Projekte in
Format 5 oder 7 behalten ihren bisherigen Ansichtsabschnitt, solange keine neuen
gemeinsamen Inhalte hinzukommen. Dateien mit neuen Netzflächenbezügen bitte mit
dieser oder einer neueren Formnaro-Ausgabe öffnen.

Beim Übernehmen alter Netzprojekte werden gültige Kameraeinstellungen und
eindeutig passende Netzflächenbezüge aktiviert. Nicht mehr passende Bezüge
bleiben als freie Ebene an ihrer gespeicherten Lage erhalten, mit Hinweis.
Alte Schnittansichten bleiben im archivierten Original erhalten; sie werden
noch nicht als aktive gemeinsame Schnittansicht übernommen. Die ursprüngliche
Datei bleibt erhalten und die Übernahme wird als neue Datei gespeichert.

## Umfang und Prüfung

Diese Ausgabe ergänzt Paket 7. Die vollständige Werkzeugübernahme aus Paket 8,
direkte CAD-Netzkopien, Netz-zu-CAD-Umwandlung sowie neue Reparatur-, Auswahl-
und Vereinfachungswerkzeuge folgen in eigenen Paketen. Netzflächenbezüge sind
keine neue Dreiecksbereichsauswahl oder automatische Flächenrekonstruktion.

Die Prüfungen umfassen echte Flächenauswahl, Vorschau/Abbruch/Übernehmen,
Rückgängig, affine Lagen, gelöste und veraltete Bezüge, Quellenbaum,
Dateirundlauf, alte Netzprojekte und gemeinsame Exportwege. Die separate EXE
wird zusätzlich mit CAD-, Netz- und gemischten Abläufen geprüft. Technische
Nachweise liegen lokal unter `work/shared-workspace/checks`; die geprüfte
portable Ausgabe enthält ihre Prüfberichte, Quellen und Lizenzen.
