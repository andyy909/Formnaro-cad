# STEP-Baugruppen und Wanddickenkarte

Beide Funktionen laufen vollständig lokal. Es gibt keinen zusätzlichen Dienst,
keinen Upload und keine neue Laufzeitabhängigkeit.

## STEP-Baugruppen

STEP/STP wie gewohnt importieren. Der native XCAF-Leser erhält ursprüngliche
Baugruppen als verschachtelte Ordner und Komponenten als einzeln auswählbare
CAD-Teile. Mehrfach verwendete Komponenten erhalten einzelne Projektkennungen
und dieselbe Bauteildefinition, wenn die STEP-Referenzen diese gemeinsame
Definition belegen. Lage, Name und Farbe gehören zum jeweiligen Einbau.
Formnaro verwendet für jeden Dateiimport eine eigene Zuordnung der Definitionen
und platziert die gesamte Baugruppe gemeinsam auf der Arbeitsfläche.

Der Teilebaum bietet die vorhandenen Schalter für Ausblenden und Sperren.
Zum separaten Export ein Teil auswählen und unter **Export → Umfang →
Ausgewählte Teile** exportieren. STEP bleibt analytische CAD-Geometrie.
Unter **STEP · Baugruppenbaum** schreibt Formnaro die sichtbaren oder
ausgewählten Teile mit ihren Projektordnern aus. Importierte gemeinsame
Definitionen werden mit einzelnen starren Einbaulagen und Einbaufarben
geschrieben. Für Teile mit Skalierung, Scherung oder Spiegelung steht
**STEP · CAD-Körper** zur Ausgabe der platzierten Geometrie zur Verfügung.
OBJ/MTL, 3MF und GLB/glTF übernehmen auch importierte Flächenfarben. STL besitzt
keine Farbdaten. OCAD und FNPACK erhalten Ordner, Definitionen, Farben und
Platzierungen. Gemeinsame Bauteildefinitionen benötigen Projektformat 36.

Eine eigenständige Text-STEP-Datei darf bis zu 30 MB umfassen. Es gelten maximal 500 Teile,
500 Projektordner und 12 Ordnerebenen einschließlich vorhandener Ordner.
BRep maximal 12 MB je Teil, beim Import insgesamt 40 MB; Projektdatei maximal
50 MB. Originalnamen bis 200 Zeichen. Übergrenzen, offene CAD-Flächen und
fehlende externe STEP-Dateien führen zum Abbruch des gesamten Imports.
Externe Referenzen zuvor im erzeugenden CAD in eine STEP-Datei einbetten.
Fehlt in der Datei ein ursprünglicher Teilebaum, wird keiner erfunden.

Importierte Flächenfarben sind an die unveränderte BRep gebunden. Nach einer
Topologieänderung gilt die neue Körperfarbe; die ursprünglichen Flächenfarben
bleiben in der erhaltenen Quelle. Die Ansicht verwendet die Deckkraft des
ganzen Teils. Einzelne Flächendeckkräfte bleiben für den Export gespeichert;
Deckkräfte unter 5 % werden an die bestehende Projektgrenze angepasst.
Ältere Formnaro-Ausgaben kennen das neue Metadatenfeld `stepFaceColors` nicht.
Solche Projekte mit Version 0.61.0 oder neuer öffnen.

## Wanddickenkarte

Ein vollständiges sichtbares Materialteil auswählen, **Wanddickenkarte** öffnen
und **Karte berechnen** anklicken. Die Funktion ist in Normal und Easy Tinker
erreichbar. Kamera und Zoom bleiben bedienbar. **Abbrechen**, Schließen oder
Escape beenden den eigenen Analyse-Worker. Auswahl-, Modell- oder
Anzeigequalitätsänderungen verwerfen die vorübergehende Ansicht.

Rot zeigt kleinere, Blau größere lokale Messwerte. Die zwei Millimeterwerte
ändern nur die Farbskala; dafür wird die Geometrie nicht neu analysiert.
Grau bedeutet ungeprüft oder kein eindeutig bestimmter Materialdurchgang.
Die Anzeige nennt gemessene Dreiecke, Abdeckung und Stichprobenbereich.

Gemessen wird ab der Dreiecksmitte entlang der nach innen gerichteten
Flächennormalen bis zur ersten austretenden Oberfläche desselben Teils.
CAD verwendet die aktuelle Anzeigevernetzung und interpolierte native
Flächennormalen; Netze verwenden ihre unveränderten Originaldreiecke und
Dreiecksnormalen. Der CAD-Gesamtkörper wird vor einer etwaigen Farbzerlegung
abgefragt, damit interne Farbgrenzen keine Wände vortäuschen. Vollständige
affine Welttransformationen einschließlich Spiegelung und Scherung werden
berücksichtigt. Nachbarteile werden nicht als Gegenwand verwendet.

Dies ist eine Näherung mit höchstens einer Stichprobe je geprüftem Dreieck,
kein globaler Mindestwanddicken-, Festigkeits- oder Druckbarkeitsnachweis.
Die Anzeigeabweichung begrenzt die CAD-Tessellierung, nicht den Fehler eines
Wanddickenmesswerts. Dünne Details können bei grober Vernetzung fehlen.
CAD-Anzeigequalität bei Bedarf vor dem Öffnen erhöhen. Die vorhandene native
punktweise CAD-Wandstärkenabfrage bleibt unverändert verfügbar.

Offene, entartete, doppelte oder topologisch widersprüchliche Netze werden
vor der Karte abgewiesen; der Netzinspektor zeigt solche Fehler. Diese
Topologieprüfung beweist keine Selbstschnittfreiheit. Tangenten, widersprüchliche
Schnittfolgen, Falten und mehrdeutige Treffpunkte bleiben unbestimmt. Gemeinsame
ebene Dreiecksdiagonalen werden als ein Oberflächendurchtritt behandelt.

## Ressourcen und Prüfung

Der vorhandene gemeinsame OCCT-Kern wurde um den nativen STEPCAF/XCAF-Leser
erweitert. Es wird kein zweiter CAD-Kern geladen. Bestehende Konverter nutzen
weiter den bisherigen Import eines gesamten CAD-Körpers.

Die Karte startet erst auf Anforderung in einem kurzlebigen eigenen Worker.
BVH-Beschleunigung, maximal 200.000 Dreiecke/600.000 Punkte, wahlweise
2.000/6.000/12.000 Stichproben und eine Berechnungszeitgrenze von 20 Sekunden
begrenzen die Analyse. Der Worker wird nach dem Ergebnis beendet. Im Leerlauf
läuft keine Analyse oder dauernde Neuzeichnung. Das Umfärben verwendet die
bestehenden Positionspuffer. Modell, Undo, Originalfarben und Produktionsdateien
enthalten keine Analysefarben.

Gezielte Prüfungen: verschachtelte Baugruppe, wiederverwendete Instanzen,
Teil-/Flächenfarben, Unicode, Einheiten, Projekt-/STEP-Rundlauf, getrennte Exporte,
Hohlkörper, gekrümmtes CAD, affine Netze, offene/degenerierte Geometrie,
Stichprobenbudget und Farbskala. Die Desktop-Abnahme prüft echte Bedienung,
Undo/Redo, Abbruch, unveränderte Quellen, Leerlauf, kleine Fenster und Englisch.
Ein unabhängiger FreeCAD/OCCT-Leser prüft STEP-Geometrie; ein separater STL-Leser
prüft exportierte Maße, Volumen, geschlossene und orientierte Kanten.
Die Abnahme der konkreten Windows-Ausgabe steht in deren `Abnahme.json`.
