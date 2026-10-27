# Formnaro auf durchgängige CAD-Geometrie umstellen

## 1. Ziel und feste Entscheidungen

Neue Teile werden vollständig als **CAD-Körper mit mathematisch beschriebenen Flächen und Kanten** aufgebaut und bearbeitet. Ein Mesh entsteht daraus für die Bildschirmansicht und beim Export für den 3D-Druck. Das Anzeigemesh beeinflusst weder Konstruktion noch Maße oder Berechnungen.

Die bisherige Bedienung bleibt erhalten: Formen herausziehen, Eckmaße ändern, verschieben, drehen, skalieren, spiegeln, Löcher setzen, gruppieren und Gruppenquellen nachträglich bearbeiten. **Keine verpflichtenden Skizzen.**

Festgelegt ist außerdem:

- Alle 23 Formen und alle heutigen Werkzeuge gehören zur ersten vollständigen CAD-Ausgabe.
- Alte Projekte werden nicht konvertiert; bestehende Dateien bleiben unangetastet.
- STL/OBJ können als sichtbare Referenz importiert werden. Sie werden nicht mit CAD-Körpern verrechnet und nicht in Produktionsdateien exportiert.
- Einstellungen, Layouts, Favoriten und Formenpakete bleiben erhalten.
- Die Anwendung funktioniert weiterhin lokal und offline.

## 2. CAD-Kern und Formenerzeugung

**OpenCascade wird der gemeinsame Geometriekern.** Der bisherige Umweg von Mesh zu CAD entfällt vollständig für neue Teile. Es gibt keinen automatischen Rückfall auf Mesh-Berechnungen.

Zuerst wird der vorhandene WASM-Kern um die fehlenden Schnittstellen für allgemeine affine Transformationen und CAD-Strahlschnittpunkte erweitert. Damit müssen auch ungleichmäßige Skalierung, Spiegelung und Scherung aus verschachtelten Gruppen funktionieren. Buildkonfiguration, Quellenstände und Lizenzunterlagen werden reproduzierbar mitgeliefert.

Die Formen werden folgendermaßen erzeugt:

| Formen | Neue Geometrie |
|---|---|
| Quader, Zylinder, Kugel, Kegel, Ring, Halbkugel | Native CAD-Grundkörper beziehungsweise Rotationskörper |
| Dreieck, Sechseck, Polygon, Stern, Dach, Keil, Pyramide | Geschlossene Konturen, Extrusionen und planare Flächen |
| Rundquader, Kapsel, Gehäuse | Konturen aus Geraden und Kreisbögen, Extrusionen und CAD-Ausschnitte |
| Rohr und Senkbohrung | CAD-Rotationskörper und Differenzen |
| Herz | Glatte CAD-Splinekontur aus der vorhandenen Herzfunktion |
| Text und SVG | Originale Linien, Bézierkurven und Ellipsen direkt zu CAD-Konturen und Extrusionen |
| Zahnrad | Vorhandene Zahnradformeln; CAD-Evolventenkontur, gerade Extrusion oder Schraubbewegung |
| Gewinde und Mutter | CAD-Schraubflächen mit den vorhandenen Profil-, Steigungs- und Passungsparametern |

Außenkonturen und Innenlöcher werden direkt verarbeitet. Die bisherige Triangulierung von Text und SVG wird nicht mehr als Konstruktionsgrundlage verwendet. Formenpakete erzeugen ihre bestehenden Formrezepte über denselben CAD-Pfad.

Mathematisch einfache Flächen bleiben analytisch. Herzkurven, Evolventen und Schraubflächen dürfen als kontrolliert angenäherte CAD-Splines vorliegen. Ihre maximale geometrische Abweichung beträgt **0,0001 mm**, bei kleinen Merkmalen höchstens ein Hundertstel der Merkmalsgröße. Diese Genauigkeit ist unabhängig von Anzeige und Druckexport.

Gewinde und Schrägzahnräder erhalten eigene Machbarkeitsprüfungen: Steigung, Flankenwinkel, Drehrichtung und Querschnitte müssen den Parametern entsprechen. Ein gewöhnlicher Sweep darf das Profil nicht unbemerkt verdrehen.

## 3. Modellzustand, Bearbeitung und Werkzeuge

Ein gemeinsamer CAD-Dienst verarbeitet Formrezepte, Transformationen, Gruppen, Ausschnitte und Kantenoperationen. Er liefert gültige CAD-Körper, Maße, Volumen und Flächeninformationen; die Darstellung wird davon getrennt erzeugt.

**Bearbeitbare Quellen bleiben erhalten.** Eine Gruppe speichert weiterhin ihre ursprünglichen Körper und Lochformen. Änderungen an einer Quelle bauen die betroffenen CAD-Ergebnisse neu auf. Rundungen und Fasen bleiben nachgelagerte, editierbare Operationen.

Alle Bearbeitungswege verwenden dieselben Transaktionen:

- Vorschau gegen einen festen bestätigten Modellstand berechnen.
- Ergebnis auf gültige, geschlossene Körper prüfen.
- Erfolgreiche Übernahme als einen Undo-Schritt speichern.
- Bei Fehler oder Abbruch den letzten bestätigten Zustand erhalten.
- Veraltete Workerantworten verwerfen; Autosicherung ausschließlich aus bestätigten Zuständen schreiben.

Intern werden vollständige Transformationsmatrizen erhalten. Beim Auflösen einer ungleichmäßig skalierten Gruppe darf weder die Geometrie verändert noch eine Quelle in ein Mesh gebacken werden. Die bisherigen Maßfelder und Griffe werden auf diese Transformationen abgebildet; gegenüberliegende Ecke und Unterseite bleiben wie bisher fest.

**Alle Präzisionswerkzeuge wechseln ebenfalls auf CAD-Geometrie:**

- Maße, Ausrichten, Absetzen und Passungen verwenden CAD-Grenzen im gewählten Koordinatensystem.
- Messen greift auf echte CAD-Punkte, Kanten und Flächen zu.
- Arbeitsebene, Bibliotheksplatzierung und Magnet verwenden den CAD-Treffpunkt und dessen Flächennormale. Auf Rundflächen entsteht die Tangentialebene am Treffpunkt.
- Kantenauswahl zeigt CAD-Kanten, einschließlich der bestehenden Rahmenauswahl.
- Kollisionen, Volumen, Schnittansicht und Farbaufteilung werden mit CAD-Operationen berechnet.
- Wandstärken bleiben eine ausdrücklich gekennzeichnete Stichprobenprüfung, deren Messungen direkt auf CAD-Flächen erfolgen.
- SVG-Projektionen entstehen aus CAD-Konturen.

Flächen- und Kantenbezüge erhalten Herkunftsinformationen und geometrische Anker. OpenCascade-Zuordnungen werden beim Neuaufbau verfolgt. Mehrdeutige Zuordnungen werden nicht automatisch übernommen: Eine betroffene Kantenoperation scheitert nachvollziehbar; eine verlorene Arbeitsebenenreferenz löst sich unter Erhalt ihrer letzten räumlichen Lage.

STL/OBJ-Referenzen lassen sich auswählen, verschieben, drehen, skalieren, ausblenden und sperren. Sie dienen nicht als Ziel für CAD-Präzisionswerkzeuge, Gruppen oder Kantenoperationen.

## 4. Speicherung, Darstellung, Export und KI-Anbindung

**Neues Projektformat `.ocad`, Version 5:** Es enthält CAD-Formrezepte, Quellenbaum, Transformationen, BRep-Körper und die bisherigen Projektinformationen. STEP bleibt das Austauschformat; `.ocad` erhält zusätzlich unsere Bearbeitbarkeit.

BRep-Körper werden ausdrücklich **ohne eingebettete Triangulierung** geschrieben. Anzeigepuffer und temporäre Berechnungscaches gehören nicht in Projektdatei, Undo oder Modellrevision. Eingebettete STL/OBJ-Referenzen sind die klar getrennte Ausnahme.

Neue Autosicherungen und persönliche Teilevorlagen verwenden das CAD-Format. Alte Projekte, Autosicherungen und gespeicherte Teile werden nicht automatisch geladen oder migriert; ihre Dateien werden nicht gelöscht.

Die Darstellung bleibt bei Three.js. Sie bekommt CAD-abgeleitete Dreiecke, Oberflächennormalen und eine Zuordnung jedes Dreiecks zur CAD-Fläche. Ein dauerhafter CAD-Worker mit begrenzten Caches verhindert das wiederholte Laden des Kerns. Während Ziehgesten wird die bestehende Ansicht sofort bewegt; die verbindliche Geometrie wird vor Übernahme geprüft. Abbrechen kann den Worker beenden und aus dem bestätigten Zustand neu starten.

Die bisherigen Segment- und Rundungsschritt-Einstellungen werden durch **Anzeigequalität** ersetzt. Echte Formparameter wie Polygonseiten und Zahnzahl bleiben konstruktive Parameter.

Der Export verwendet ausschließlich den bestätigten CAD-Zustand:

- **STEP:** CAD-Flächen und Körper direkt exportieren.
- **STL, OBJ, 3MF und GLTF:** ein neues Exportmesh mit eigener Genauigkeit erzeugen; niemals das Anzeigemesh übernehmen.
- **Standardwerte:** Anzeige mit 0,02 mm Flächenabweichung und 8° Winkelabweichung; Druckexport mit 0,01 mm und 5°, zusätzlich frei einstellbar.
- Farben, getrennte Teile, Ausschnitte und Hohlräume bleiben entsprechend dem jeweiligen Format erhalten.

Die lokale KI-Schnittstelle behält Werkzeugnamen, Objektkennungen und Preview/Apply-Ablauf. Ihre Befehle werden durch denselben CAD-Dienst ausgeführt. Kontext, Schemas und Beispiele werden aktualisiert; Mesharrays werden für normale Modellbearbeitung weiterhin nicht benötigt.

## 5. Umsetzung und Abnahme

Der Umbau erfolgt intern in fünf Etappen. Ausgeliefert wird erst der vollständige Ersatz.

1. **Kern nachweisen:** analytische Körper, Boolesche Operationen, affine Transformationen, CAD-Treffpunkte, präzise Grenzen, Schraubflächen und triangulierungsfreie Speicherung in kleinen unabhängigen Prüfmodellen.
2. **Neue Modellbasis aufbauen:** CAD-Dienst, Quellenbaum, Transaktionen, Undo/Redo, Projektformat 5 und Autosicherung.
3. **Alle Formen umstellen:** einschließlich Text, SVG, Plugins, Vorlagen, Zahnrädern und Gewinden.
4. **Alle Werkzeuge anbinden:** direkte Bearbeitung, Gruppenquellen, Präzisionswerkzeuge, Magnet, Prüfungen, Farben, Import/Export und KI.
5. **Bereinigen und ausliefern:** Manifold und Mesh-Rückfälle aus dem produktiven Modellierpfad entfernen; Hilfen, Tests, Projektkontext und portable Ausgabe aktualisieren.

Die Abnahme muss insbesondere nachweisen:

- Zylinder mit Bohrung und Rundung bleibt nach Quellenänderung, Undo/Redo, Speichern und erneutem Öffnen gültige CAD-Geometrie.
- Eine Änderung der Anzeigequalität verändert weder Maße noch Volumen, Arbeitsebene, Passung oder STEP-Geometrie.
- Alle heutigen Bedienabläufe funktionieren weiterhin, einschließlich Eckankern, Spiegelung, verschachtelten Gruppen, Scherung und Auflösen.
- Gewinde, Muttern und Zahnräder erfüllen ihre Parameter auch nach Transformation und STEP-Export.
- Hohlräume, getrennte Körper und mehrfarbige Gruppen bleiben erhalten.
- Fehler, Abbruch und veraltete Vorschauen hinterlassen keine Teiländerungen.
- STEP wird zusätzlich mit einem unabhängigen Leser geprüft; Exportmeshes werden gegen den CAD-Körper und die gewählte Toleranz geprüft.
- STL/OBJ-Referenzen bleiben sichtbar und speicherbar, verändern aber keine CAD-Ergebnisse.
- Komplexe Berechnungen blockieren die Oberfläche nicht; Abbruch stellt binnen einer Sekunde eine bedienbare Oberfläche her. Wiederholte Bearbeitungen verursachen kein unbegrenztes Cachewachstum.
- Alle Prüfungen laufen in isolierten Testprofilen, abschließend auch gegen die tatsächlich gepackte portable Anwendung.

Die neue Ausgabe erscheint separat als **Formnaro 0.11.0**. Bestehende Ausgaben und Nutzerdaten bleiben erhalten. Veröffentlichung oder GitHub-Upload sind kein Bestandteil dieses Umbaus.
