# Auswahlpinsel, Lasso und Schutzbereiche – Paket 15

Formnaro 0.34.0 erweitert **Netzflächen auswählen …**. Ein sichtbares,
entsperrtes vollständiges Netzteil auswählen und das Werkzeug öffnen.
Die bisherigen Modi Dreieck, Oberfläche, Bestandteil und Öffnungsrand bleiben
vorhanden. CAD-Körper zuerst ausdrücklich als Netzkopie erzeugen.

## Pinsel und Lasso

- **Auswahlpinsel:** Linke Maustaste gedrückt halten und malen. Der Radius ist
  zwischen 2 und 150 Bildpunkten einstellbar, unabhängig von der Modellgröße.
  Sichtbare Dreiecksmittelpunkte innerhalb der Pinselspur und die direkt an den
  Pfadpunkten getroffenen Flächen werden ausgewählt. Große Dreiecke können daher
  auch getroffen werden, wenn ihr Mittelpunkt außerhalb des Pinsels liegt.
- **Lasso:** Mit gedrückter linker Maustaste eine geschlossene Kontur umfahren.
  Die Verbindung vom letzten zum ersten Punkt wird beim Loslassen ergänzt.
  Ausgewählt werden sichtbare Dreiecke, deren **Mittelpunkt** in der Kontur liegt.
  Bei sich überschneidenden Konturen gilt die Gerade/Ungerade-Regel. Eine Linie
  ohne eingeschlossene Fläche ist keine gültige Lassoauswahl.
- Ein normaler Strich ersetzt die Auswahl. **Umschalt** fügt hinzu,
  **Strg** (Mac: ⌘) entfernt. Modifikatoren gelten vom Beginn des Strichs an.
- Während des Ziehens erscheint die Kontur beziehungsweise der Pinselkreis.
  Beim Loslassen wird die gelbe Flächenauswahl berechnet. Verdeckte Rückseiten
  und Flächen hinter anderen sichtbaren Modellteilen werden nicht mitgewählt;
  teilweise sichtbare Dreiecke mit verdecktem Mittelpunkt können beim Lasso
  ungewählt bleiben. Zum Rundumauswählen mehrere Ansichten mit Umschalt verwenden.
- Ein ganzer Strich ist **ein** lokaler Rückgängig-Schritt. Vorschau abbrechen
  oder Escape stellt den vorher bestätigten Auswahlstand wieder her.

Die Berechnung läuft in einem eigenen abbrechbaren Hintergrundprozess im
Browser. Grenzen: 500.000 Dreiecke im ausgewählten Netz, insgesamt 1.500.000
sichtbare Modell-Dreiecke für die Verdeckungsprüfung, 2.048 Punkte pro Strich.
Bei zu großer Szene andere Teile ausblenden oder isolieren. Eine aktive
Schnittansicht oder Quellenvorschau des Zielnetzes zuerst beenden. Es werden keine
Punkte verschmolzen, Flächen umnummeriert oder Geometriedaten verändert.

## Bohrungen und Anlageflächen schützen

1. Gewünschte Dreiecke markieren. Für eine Bohrungswand eignet sich oft der
   Oberflächenmodus mit einem zur Segmentierung passenden Nachbarwinkel; für
   eine ebene Anlagefläche ein kleiner Winkel. Auswahl visuell von mehreren
   Seiten kontrollieren. Bohrungen werden nicht automatisch erkannt.
2. Unter **Schutzbereiche** die Art **Bohrung**, **Anlagefläche** oder
   **Eigener Bereich** und einen eindeutigen Namen angeben.
3. **Ausgewählte Flächen schützen** erzeugt eine türkise Vorschau. Ein reiner
   Öffnungsrand schützt noch keine Fläche. Je Netz sind bis zu 32 Bereiche
   möglich, zusammen höchstens 1.000.000 gespeicherte Dreieckszuordnungen.
4. **Übernehmen** speichert Schutzbereiche im Modell und erzeugt einen gemeinsamen
   Modell-Rückgängig-Schritt. Auswahländerungen allein bleiben Arbeitsplatzdaten
   ohne Modellschritt. Abbrechen verwirft alle noch nicht übernommenen Bereiche.
5. Einen benannten Bereich in der Liste wählen und mit **Bereich auswählen**
   wieder markieren. **Schutz entfernen** beziehungsweise **Alle Schutzbereiche
   entfernen** ist ebenfalls eine Vorschau und wird erst mit Übernehmen wirksam.

Die bisherigen Werkzeuge verändern ganze Netze und können lokale Schutzmasken
noch nicht erhalten. Deshalb verweigert die gemeinsame Änderungshistorie ihre
Geometrieänderung und das Löschen geschützter Teile mit einem Hinweis. Das gilt
auch für gemeinsame KI-/API-Vorschläge. Zuerst den Schutz ausdrücklich in einem
separaten Schritt entfernen. **Lage, affine Größe, Farbe und Deckkraft** bleiben
änderbar; Schutz ist keine Maßsperre gegen ausdrücklich ausgeführte Skalierung.
Neue lokale Verfahren aus späteren Paketen müssen die Masken gezielt beachten.

## Dateien, ungültige Markierungen und Export

Schutzbereiche liegen als `metadata.meshProtection` im gemischten Projektformat
8. Namen, Art, originale Dreiecksnummern und SHA-256 der Rohgeometrie werden
mitgespeichert; die Auswahl bleibt im Arbeitsplatzformat 4. Alte Projektdateien
bleiben lesbar. Ältere Programmausgaben kennen die neuen Metadaten nicht; neue
Schutzprojekte mit der neuen Ausgabe öffnen und separat speichern.

Bei geänderter Rohgeometrie oder Dreiecksreihenfolge wird eine alte Auswahl
verworfen. Geladene alte Schutzbereiche bleiben zur Nachvollziehbarkeit in der
Liste, werden **UNGÜLTIG – neu auswählen** gekennzeichnet und nicht auf andere
Dreiecke übertragen oder türkis angezeigt. Entfernen und neu markieren.
Verschiebung, Drehung und Darstellungsfarbe ändern die Rohgeometrie nicht.

STL, STEP und andere Geometrieexporte enthalten weiterhin die vollständigen
gewählten Objekte. Auswahl und Schutzmasken beschränken den Export nicht.
Schutzmetadaten bleiben in der Formnaro-Projektdatei; neutrale Geometriedateien
transportieren sie nicht.

## Prüfung und Auslieferung

Maßgeblich sind die erfolgreichen aktuellen Rohberichte, Prozess-Exitnachweise,
`work/mesh-selection-advanced/checks/final-audit.json` und `delivery.json`.
Die Oberfläche wird mit echten Zeigerstrichen, einer offenen Rasterfläche und
einer technischen Ringplatte mit Durchgangsbohrung geprüft: sichtbare Auswahl,
Bohrungswand/Anlagefläche, Vorschau/Abbruch/Undo, Schutzdurchsetzung, normales
physisches Speichern/Öffnen und vollständiger STL-Export. Zusätzlich laufen die
betroffenen bisherigen Netz-, Arbeitsplatz-, CAD- und gemeinsamen Abläufe in
Quelle und eigener gepackter EXE. Vorhandene Ausgaben bleiben erhalten.
Paket 16 und spätere Netzverfahren sind eigene nächste Arbeitspakete.
