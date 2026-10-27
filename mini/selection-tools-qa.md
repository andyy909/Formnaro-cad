# Auswahlwerkzeuge Mini 0.4.0

Umfang: kleine Drehpfeile und Skaliergriffe nach dem vom Nutzer gelieferten
Tinkercad-Ausschnitt; STL-Export ausschließlich der Auswahl.

Referenz und tatsächliche Darstellung während einer gehaltenen Drehung wurden
im gemeinsamen lokalen Vergleichsbild `work/formnaro-mini-v04/handles-comparison.png`
visuell geprüft. Zusätzlich vollständige Ansichten ohne aktive Bearbeitung und
mit gehaltener Skalierung betrachtet. Native Electron-Screenshots, keine Mockups.

- Vier weiße Eckgriffe an der Basis; eigener oberer Höhengriff. Gegenüberliegende
  Ecke beziehungsweise Unterseite bleibt fest. Shift skaliert proportional.
- Kleine lokale Tabler-Drehpfeile für X/Y/Z. Während des Ziehens erscheint ein
  blauer transparenter Winkelring mit Teilstrichen und live berechneter Gradzahl.
- Einzelteile verwenden eigene Achsen; Mehrfachauswahl gemeinsame Arbeitsachsen,
  Mittelpunkt und proportionale Skalierung. Gruppenquellen bleiben erhalten.
- Die normale Mini-Oberfläche, numerische Eigenschaften und vorhandenen Mausgriffe
  bleiben verfügbar. Neue Befehle sind an der Auswahl sichtbar und beschriftet.
- Mausradnavigation funktioniert auch direkt über den Griffflächen. Gesperrte,
  ausgeblendete und hinter der Kamera liegende Teile bieten keine neuen Griffe.
- Vorschau lebt nur in der Ansicht, ein bestätigter Zug ist ein Undo-Schritt.
  Esc, Pointer-Abbruch und tatsächlicher Fokusverlust verwerfen die Vorschau.
- Export benötigt sichtbare ausgewählte Körper. Nur ausdrücklich mitmarkierte
  Lochformen werden abgezogen. Keine Auswahl führt zu einer Erklärung.

23 Unit-Gruppen einschließlich verankerter Skalierung gedrehter/gespiegelter
Teile, proportionaler Mehrfachskalierung, Grenzen und räumlicher Rotation.
Acht zusätzliche gezielte Desktop-Prüfgruppen mit tatsächlichen Eingaben und
unabhängig ausgelesenen binären STL-Grenzen/Volumina. Gesamtprüfung und
EXE-Identität sind in den versionsbezogenen Abnahmebelegen dokumentiert.

Kein offener P0/P1/P2-Befund im geprüften Umfang. Bewusste Abweichungen von der
Vorlage: Minis Farben und vorhandene Bewegungsgriffe bleiben erhalten; Tabler-
Pfeilzeichnungen und Anordnung der Achsenknöpfe sind eigenständig. Kein Anspruch
auf identische Tinkercad-Darstellung oder dessen gesamten Funktionsumfang.

Ergänzung 0.4.1: Im blauen Kreis automatisch 15°-Raster mit 24 sichtbaren
Rastpunkten, außerhalb 1°-Feinsteuerung. Die Gradzahl nennt das aktive Raster.
Gezielte Mausprüfung für exakt 45°/90° sowie Wechsel über die Kreisgrenze.
