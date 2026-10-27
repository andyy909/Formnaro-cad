# Kurven und erweiterte CAD-Merkmale

## Bézier und B-Spline

Im Skizzendialog unter „Konturen mit Öffnungen“ die Zeichenform auswählen.
Bézierkurven entstehen mit vier Klicks: Start, zwei Kontrollpunkte und Ende.
B-Splines benötigen vier bis sechzehn Kontrollpunkte und den Knopf
„B-Spline fertigstellen“. „Linienzug schließen“ ergänzt die Abschlusskante.
Offene Entwürfe müssen vor der Körpervorschau geschlossen sein.

Koordinaten und Formeln bleiben im Elementeditor bearbeitbar. Bei B-Splines
lassen sich zusätzliche Kontrollpunkte ergänzen und wieder entfernen.
Ein durch eine Bedingung verwendeter Kontrollpunkt kann erst nach dem Lösen
dieser Bedingung entfernt werden. Vorhandene Skizzenbedingungen bleiben erhalten.
Die B-Splines sind geklemmte, gleichmäßig geknotete kubische Kurven ohne Gewichte.
Native CAD-Kanten bleiben analytische Kurven; die Anzeige ist eine Annäherung.

## Loft und Sweep

Für einen Loft zwei bis acht native Skizzen auswählen. Im Werkzeugdialog die
Reihenfolge ausdrücklich festlegen. Die Profile müssen entlang der Verbindung
fortschreiten. Automatische Zuordnung und erhaltene Profilanfänge stehen als
Orientierungswahl zur Verfügung. Innenöffnungen werden hier nicht unterstützt.

Für einen Sweep eine native Querschnittsskizze auswählen. Zusammengesetzte Pfade
bestehen aus bis zu 32 Linien, Dreipunktbögen, Bézier- oder B-Spline-Segmenten.
Die Koordinaten gelten relativ zum Profilrahmen: Start im Ursprung, anfängliche
Tangente +Z. Übergänge müssen tangential zusammenpassen. Krümmungs- und
Abstandsprüfungen weisen zu enge oder zurücklaufende Pfade zurück; unklare
Fälle werden nicht übernommen. Die Prüfung gibt keine allgemeine Garantie für
beliebige Kurven. Abschließend wird der native Körper geprüft.

„CAD-Bearbeitung ändern“ öffnet gespeicherte Lofts und Sweeps erneut. Quellprofile
bleiben erhalten. „Modell ansehen“ verkleinert den Dialog für die Vorschau.

## FreeCAD-Werkzeuge

Die Desktop-Ausgabe benötigt eine lokale FreeCAD-Installation. Formnaro prüft
die tatsächlichen Objekttypen beziehungsweise die native Defeaturing-Funktion.
Eine fehlende Funktion wird im Dialog gemeldet.

- **Entformungsschräge:** Ein CAD-Teil auswählen, Zielflächen und eine andere
  ebene Neutralfläche anklicken, Winkel und Richtung einstellen. Das Ergebnis
  enthält einen echten PartDesign-Draft mit statisch übernommener Basis.
- **Merkmale entfernen:** Geeignete Flächen eines CAD-Teils auswählen. FreeCAD
  versucht, Nachbarflächen zu verlängern. Das Ergebnis ist ausdrücklich statisch;
  das archivierte Programm kann erneut ausgeführt werden. Nicht jede Fläche
  lässt sich auf diese Weise entfernen.
- **Rotation:** Eine ebene Profilfläche eines CAD-Teils auswählen. Achsenpunkt,
  Achsenrichtung und Winkel ausdrücklich einstellen. Die übernommene Profilfläche
  ist statisch; der daraus erzeugte Rotationswinkel ist ein natives Merkmal.
- **Helix:** Radius, Steigung, Höhe, Drahtquerschnitt, Achse und Drehsinn
  einstellen. Eine native Helix treibt ein verknüpftes Kreisprofil und einen
  nativen Sweep. Radius muss größer als Drahtradius, Steigung größer als
  Drahtdurchmesser sein. Höchstens 200 Windungen, ohne konischen Winkel.

Die neuen Konstruktionen werden als eigene Teile angelegt. Das Original kann
bei Übernahme ausdrücklich ausgeblendet werden. Seine Geometrie und Quelle
bleiben erhalten. Alte FreeCAD-Konstruktionshistorie wird durch eine STEP-Basis
nicht auf die neue Konstruktion übertragen. Neue native Parameter lassen sich
anschließend über „FreeCAD-Merkmale“ bearbeiten. Helfermodule werden mit dem
FCStd archiviert, sodass das Helixprofil beim erneuten Öffnen wieder berechenbar ist.

Vorschau, Übernahme und Abbruch sind getrennt. Eine Übernahme einschließlich
gewählter Sichtbarkeit besitzt einen Undo-Schritt. Neue Kurvenskizzen und
erweiterte Loft-/Sweep-Rezepte benötigen Projektformat 24; ältere Projekte
behalten ihr bisher erforderliches Format.
