> Historische Referenz. Aktueller Folgeauftrag ab 26.10.2026: [Ausbauplan ab 0.106](AUSBAUPLAN-AB-0.106.md). Die damaligen Pakete sind abgeschlossen; die zusätzliche Druckprüfung bleibt gestrichen.

# Skizzen und Mesh: beauftragter Ausbau

Aktueller Stand ab 0.79.0: Die folgenden Werkzeuge stehen direkt in Formnaro
zur Verfügung. Der zusätzliche SolidCraft-Gesamteditor wird nicht mehr
mitgeliefert oder gestartet. [Kurzeinstieg](FORMNARO-KERNWERKZEUGE.md).

Ausgangsstand: Formnaro 0.66.0. Der Auftrag umfasst acht nacheinander
abzunehmende Pakete. Jede Ausgabe erhält eine getrennte portable EXE mit
Prüfbericht. Die Mini-Ausgaben bleiben eigenständig.

1. Skizzenkomfort: zoombare Zeichenfläche, Punktfang, Auswahl, Ziehen und Entwurfs-Undo.
2. Skizzenversion 2: echte Bögen, freie Kreise, Langlöcher, Rundrechtecke und Innenöffnungen; gemeinsames Projekt-/Bibliotheksformat 10.
3. Direkte Maße und Konturwerkzeuge: Trimmen, Verlängern, Spiegelkopie, Versatz.
4. Gemessene technische Netzbereiche mit Ebenen und Zylinderachsen.
5. Skizzen als Anbau oder Ausschnitt an CAD und geschlossenen Netzen.
6. Schreibgeschützter Original-/Ergebnisvergleich mit Stichproben und Farbkarte.
7. Optionale gekrümmte Netzvereinfachung mit Schutzbereichen und Quellen.
8. Bearbeitbare Beispiele und Anleitung über die vorhandene Bibliothek.

Geometrieänderungen bleiben Vorschau, ausdrückliche Übernahme und ein gemeinsamer
Undo-Schritt. Analysen laufen nur auf Anforderung; Originalquellen, Sperren und
unbeteiligte Teile bleiben geschützt. Ein vollständiger geometrischer Skizzenlöser,
3D-Skizzen, Splines, allgemeiner STL-Wandversatz und Druckprüfung gehören nicht
zum Auftrag. Lokale Skizzenmaße und Formeln bilden keinen allgemeinen
Abhängigkeitsbaum zwischen Teilen.

## Paket 1: Skizzenkomfort ab 0.67.0

Im Skizzenfenster oben zwischen **Zeichnen**, **Punkte wählen / ziehen** und
**Ansicht verschieben** wählen. Das Mausrad zoomt um den Zeiger; **Einpassen**
stellt die Gesamtansicht wieder her. Die mittlere Maustaste verschiebt ebenfalls
die Ansicht. **Vergrößern** erweitert den Dialog innerhalb des Hauptfensters.

Ein Fangraster von 1 mm ist voreingestellt, 0 schaltet das Raster aus.
Nahe Endpunkte und Mittelpunkte haben beim Zeichnen Vorrang. Bei Polygonkonturen
lassen sich Punkte auswählen und ziehen. Umschalt- oder Strg-Klick fügt Punkte
zur Auswahl hinzu oder entfernt sie. Formelgesteuerte Koordinaten werden gegen
versehentliches Überschreiben geschützt; ihre Formeln in den Eingabefeldern ändern.

**Zurück / Vor** und Strg+Z / Strg+Y auf der Zeichenfläche betreffen nur den
Skizzenentwurf. Erst **Vorschau berechnen** und **Übernehmen** erzeugen den einen
Modellschritt. Rechteck, Kreis, Polygon, Maßformeln und Skizzenformat 1 bleiben
erhalten. Die 3D-Vorschau zeichnet nur bei Änderungen und läuft nicht im Leerlauf.

Die Abnahme wird getrennt an Quelloberfläche und echter EXE ausgeführt. Maßgeblich
ist die jeweilige `Abnahme.json`; diese Anleitung ist allein kein Prüfbeleg.


## Paket 2: Erweiterte Konturen ab 0.68.0

**Konturen mit Öffnungen …** stellt den aktuellen Entwurf auf Skizzenversion 2
um. Erst Übernehmen speichert diese Umstellung im Modell. Alte Skizzen bleiben
weiter in Version 1 bearbeitbar. Neue Inhalte benötigen Projekt- und
Bibliotheksformat 10; andere Dateien behalten ihr bisheriges Format.

Für eine Innenöffnung die Zeichenform wählen und im Feld aufziehen: Kreis ab
Mittelpunkt, Rechteck, Langloch oder Rundrechteck über zwei Ecken. **Außenkontur
ersetzen** ersetzt nur den äußeren Rand.
Linienzüge durch aufeinanderfolgende Klicks zeichnen; ein Bogen benötigt Start,
Zwischenpunkt und Ende. Linien und Bögen können im selben Zug abwechseln.
**Linienzug schließen** ergänzt die letzte gerade Verbindung. Konstruktionslinien
bleiben Hilfsgeometrie und werden nicht extrudiert.

Im Bereich **Konturelement bearbeiten** ein Element wählen und Koordinaten oder
Durchmesser als Zahlen oder vorhandene Maßformeln eingeben. Gemeinsame Punkte
lassen sich zusammen ziehen; formelgesteuerte Punkte bleiben dabei geschützt.
Der Punktfang berücksichtigt tatsächliche Linien- und Bogenmittelpunkte.

Eine Skizze beschreibt eine Materialfläche mit mehreren Innenöffnungen. Offene,
sich kreuzende, sich berührende oder verschachtelte Konturen werden mit einer
Fehlermeldung von der Extrusion ausgeschlossen. CAD-Resultate enthalten echte
Kreisbögen; Netzresultate nähern die Rundungen entsprechend ihrer Qualität an.
Gespeicherte Skizzen über die vorhandene Quellenbearbeitung wieder öffnen;
Vorlagen über die bestehende Bibliothek speichern und erneut einsetzen.


## Paket 3: Maße und Konturwerkzeuge ab 0.69.0

Ein **Konturelement** auswählen. Unter den Punktkoordinaten stehen direkte Felder
für Länge und Winkel einer Linie beziehungsweise Radius und Durchmesser eines
Kreises; Bögen erhalten einen Radius. **Setzen** übernimmt das Maß in den Entwurf.
Linien behalten ihren Startpunkt, Kreise und Bögen ihren Mittelpunkt. Gemeinsame
Endpunkte folgen. Länge und Winkel werden als sichere Koordinatenformeln
abgelegt; benannte Maße bleiben verwendbar. Die Funktionen `sind(winkel)` und
`cosd(winkel)` rechnen in Grad. Andere Funktionen oder Programme sind unzulässig.
Formelgesteuerte Punkte über die Formeln ändern; beim Ziehen bleiben sie geschützt.

**Konturen bearbeiten** klappt weitere Werkzeuge auf:

- **Trimmen / Verlängern:** zuerst das zu bearbeitende Element, dann die
  Schnittgrenze und das Start- oder Endstück wählen. Linien und Bögen werden bis
  zur passenden wirklichen Schnittstelle geändert. Für Vollkreise wählt die
  Ende-Auswahl eine der beiden Hälften zwischen zwei Schnittpunkten. Ein offener
  Entwurf kann weiter bearbeitet werden und wird nicht extrudiert.
- **Spiegelkopie:** eine Innenöffnung kopieren oder die ganze Skizze spiegeln.
  X bezeichnet eine horizontale, Y eine vertikale Spiegelachse; deren Position
  ist frei wählbar. Bei einer gespeicherten ganzen Skizze wird **als neues Teil**
  aktiviert. Das ursprüngliche Modell bleibt dann erhalten.
- **Versatzkopie:** eine einzelne geschlossene Kontur und einen Abstand wählen.
  Positive Werte vergrößern den Rand, negative verkleinern ihn. Beispielsweise
  aus einer Rechteck-Außenkontur mit −2 mm eine Innenöffnung erzeugen: Es bleibt
  ein 2-mm-Rahmen. Bei Ersatzkonturen kann die Quelle als Konstruktionsgeometrie
  erhalten bleiben. Bögen bleiben echte Bögen. Zerfallende oder verschwindende
  Ergebnisse werden abgewiesen.

Kopien sind eigenständige Geometrie; die Werkzeuge erzeugen keine dauerhaften
Beziehungen. Alle Schritte gehören zur Entwurfs-Historie. Erst die Modellvorschau
und Übernehmen erzeugen einen gemeinsamen Modell-Undo-Schritt.


## Paket 4: Technische Netzbereiche ab 0.70.0

Ein Netzteil wählen und unter **Netz-Werkzeuge → Formerkennung und Gegenstück**
den Knopf **Technische Ebenen und Zylinder …** öffnen. Die Berechnung startet
erst mit **Ebenen und Zylinder erkennen**. Sie bleibt offline und kann geschlossen
beziehungsweise abgebrochen werden.

Pro Auftrag werden höchstens 20.000 Originaldreiecke analysiert. Bei größeren
Teilen vorher mit der bestehenden **Flächen auswählen**-Funktion einen kleineren
Bereich bestimmen und **Ausgewählte Originaldreiecke** wählen. Die Zuordnung bleibt
auf die originalen Dreieckskennungen gebunden; doppelte oder mehrdeutige Geometrie
wird abgewiesen. Vom Konverter ausgelassene degenerierte Flächen werden gezählt.
Es wird keine unsichtbare Vereinfachung vorgenommen.

Im Bereichsmenü eine zusammenhängende Ebene oder geeignete Zylinderfläche wählen.
Die Fläche wird farbig hervorgehoben. Ebenen zeigen Bezugspunkt und Normale,
Zylinder zeigen Achse, Achsenpunkt, gemessene Länge und Durchmesser. Größte
gemessene Abweichung, RMS und Zahl der Prüfpunkte beschreiben die Anpassung.
Bei Zylindern zählen auch Kantenmitten und Flächenschwerpunkte; die Facettenabweichung
bleibt damit sichtbar. Das ist kein garantierter globaler Maximalfehler.

**Als Arbeitsebene übernehmen** richtet eine unabhängige Momentaufnahme aus.
Die Richtung lässt sich umkehren; eine Ebene senkrecht zur Zylinderachse lässt
sich entlang dieser Achse versetzen. Ein Undo stellt die vorherige Arbeitsebene
wieder her. Das Quellteil wird nicht geändert und ist nicht dauerhaft verknüpft.

Erkannte Zylinder sind gemessene Flächenannäherungen. Auch offene Netze können
vermessen werden; daraus folgen weder eine vollständige Bohrung noch ein Gewinde
oder ein geschlossener Materialkörper. Ungeeignete verzerrte Formen werden nicht
als Zylinder übernommen. Eine neue Anpasstoleranz verlangt eine neue Analyse.
Für die lokale Automatisierung steht dieselbe schreibgeschützte Abfrage
`app/technicalMesh` über die bestehende API 1 bereit.


## Paket 5: Skizzen an vorhandenen Teilen ab 0.71.0

Ein fertiges Materialteil auswählen. Unter **CAD-Werkzeuge → Skizze auf Teilfläche …**
eine Fläche am ausgewählten Teil anklicken. Für CAD wird die native Fläche getroffen,
für Netze das ursprüngliche Dreieck. Ein Netz muss für diese Körperbearbeitung als
geschlossen geprüft sein. Das Zeichnen startet direkt in Formnaros Skizzenfenster.

**Material hinzufügen** erzeugt beispielsweise einen Dom, **Material ausschneiden**
einen Schlitz. Die Extrusionshöhe ist die gewünschte Tiefe ab der angeklickten Fläche.
Der kleine einstellbare Kontaktüberlappungswert hält den Ansatz im Material; die
bewahrte Skizzenquelle speichert dafür Höhe plus Kontaktüberlappung. Der Bezugspunkt
bleibt eine Momentaufnahme. Eine spätere Bewegung des ursprünglichen Teils erzeugt
keine versteckte Neuausrichtung der Skizze.

Auch einen bereits gezeichneten Entwurf kann man über **Diese Skizze auf Teilfläche
verwenden …** auf ein ausgewähltes Materialteil setzen. Der Entwurf wird dabei
übernommen. Die Oberfläche arbeitet weiterhin mit Vorschau und ausdrücklicher
Übernahme. Die gesamte Bearbeitung erzeugt einen Undo-Schritt.

Das CAD-Ziel bleibt CAD, das Netz-Ziel Netz. Beide entstehen als Gruppe mit dem
unveränderten ursprünglichen Teil und der Skizze als erhaltenen Quellen. CAD-Quellen
im Objektbaum und Netzquellen über **Quellen bearbeiten → Skizze und Maßformeln**
wieder öffnen. Ein Ansatz ohne Kontakt und ein Ausschnitt ohne Materialtreffer
werden abgewiesen. Ein Körper mit mehreren Ausgangsteilen darf beim Hinzufügen
keine zusätzlichen getrennten Materialkörper erhalten.

Neue Anbauquellen werden als Skizzenversion2 in Format10 gespeichert. Die bestehende
STEP-Ausgabe behält Farbregionen gegebenenfalls als einzelne berührende CAD-Körper;
die Abnahme prüft zusätzlich ihre Vereinigung als zusammenhängendes Material.
STL verwendet die fertige Geometrie. Die lokale API1 verwendet dieselben Werkzeuge
über `cad/sketchAttachment` beziehungsweise `mesh/mesh-sketch-attachment` im
bestehenden Programmbefehl. Die Fläche ist mit Punkt, Normale und aktuellem
Geometrie-Digest gebunden; native `rayPick`-Abfragen können diesen mit
`withGeometryDigest:true` liefern.

## Paket 6: Modellvergleich (0.72.0)

Unter **Ansicht & Prüfen → Modelle vergleichen** zwei vollständige CAD- oder Netzteile als A und B auswählen. In einer Bearbeitungsvorschau öffnet **Vorschau vergleichen** den Ausgangsstand und das vorgeschlagene Ergebnis. Erst **Vergleich berechnen** startet einen eigenen lokalen Worker. Abbrechen oder Schließen erhält die Modelle und eine vorhandene Bearbeitungsvorschau. Escape schließt zuerst den Vergleich; anschließend lässt sich die Bearbeitung fortsetzen.

Beide Richtungen messen die kürzesten ungerichteten Abstände zu den jeweiligen Dreiecksoberflächen. 1–12.000 gleichmäßig nach Dreiecksindex gewählte Dreiecke je Richtung werden an Ecken und Schwerpunkt geprüft; keine Flächengewichtung. Der Bericht nennt Messpunkte, geprüfte/ungeprüfte Dreiecke, Minimum, Stichprobenmaximum, Mittel und RMS. Nur geprüfte Dreiecke sind farbig, unbekannte bleiben grau. Blau entspricht 0 mm, Grün der halben Farbgrenze, Rot der Farbgrenze oder darüber. Die Farbgrenze ändert keine Messung.

Die Standardeinstellung erhält die tatsächliche Lage. Die ausdrücklich wählbare Überlagerung der Mittelpunkte verschiebt nur die Vergleichsansicht und nennt den Verschiebevektor. CAD wird mit der aktuellen Anzeigequalität angenähert; native Oberflächen werden ohne innere Farbregionsgrenzen verwendet. Höchstens 200.000 Dreiecke je Modell, 20 Sekunden Rechenkernbudget. Stichproben liefern **keinen garantierten globalen Maximalfehler**. Weder Vergleichsfarben noch Überlagerung gelangen in Projekt, Bibliothek, Modell-Undo oder Export.

Die bestehende lokale Messschnittstelle unterstützt `engine: app`, `kind: modelComparison`, `options: {leftId, rightId, maxSamples?, alignCenters?}`. Sie verwendet denselben begrenzten Worker und gibt kompakte Statistiken ohne Anzeigepuffer zurück. API 1 und Werkzeugnamen bleiben erhalten.

## Paket 7: Gekrümmte Netze vereinfachen (0.73.0)

**Netz-Werkzeuge → Gekrümmtes Netz vereinfachen** startet eine eigene toleranzgesteuerte Methode. Die bisherige Ebenenvereinfachung bleibt unter **Netz vereinfachen** mit ihrem unveränderten Standard verfügbar. Im Werkzeug lässt sich ausdrücklich zwischen beiden Methoden wechseln. Standard für Kurven: 0,02 mm Abweichungsbudget; höchstens 150.000 Ausgangsdreiecke. Erst Vorschau startet den Optimierer.

Ganzer Körper oder übernommene Original-Flächenauswahl sind möglich. Alle nicht ausgewählten und geschützten Dreiecke werden mit ihren exakten Originalkoordinaten erhalten; Schutzkennungen werden an die überprüfte neue Geometrie gebunden. Kanten ab 35° und Öffnungsränder werden fixiert. Es werden nur Indizes reduziert, keine Punkte verschoben. Der vorhandene Meshoptimizer und seine Topologieprüfungen werden wiederverwendet; Optimierer und schwere Zusatzmessungen werden erst im Werkzeugaufruf geladen.

Die Optimiererschätzung ist kein globaler Oberflächenabstand. Zusätzlich prüft der Modellvergleich beide Richtungen mit bis zu 6.000 Dreiecken und je vier Messpunkten. Bei Überschreitung wird bis zu viermal mit engerem Optimiererbudget gerechnet; sonst wird das Ergebnis abgewiesen. Ungeprüfte Dreiecke und die Begrenzung der Stichproben bleiben im Bericht erkennbar. Bei geschlossenen Körpern sind unveränderte Komponenten/Topologie und eine unabhängige Körperprüfung erforderlich; mehr als 1 % Volumenänderung wird abgewiesen. Zielzahlen werden nie erzwungen.

**Vorschau vergleichen** öffnet die Farbkarte gegen das Original, ohne die Bearbeitung zu verwerfen. Übernehmen ist ein gemeinsamer Undo-Schritt. Original, Rezept und Schutzflächen bleiben für Speichern, Wiederherstellung, Bibliothek und Quellenbearbeitung erhalten; neue Kurvenrezepte benötigen Format 10. Geänderte Quellgeometrie kann das gespeicherte Original-Digest nicht stillschweigend ersetzen: Werkzeug und Auswahl dann erneut aufrufen.

Die bestehende allgemeine Automatisierung unterstützt `{op:"tool", engine:"mesh", operation:{type:"mesh-reduce", id, options:{method:"curved-v1",geometryDigest,scope:"all"|"selection",triangleIds:[],targetMode:"percent"|"count",target,maxDeviation:0.02}}}`. UI, Skripte und API verwenden dieselben Optionen und Vorschauen. Die bisherige Methode heißt weiterhin `planar-v1`.

## Paket 8: Vorlagen und Einstieg (0.74.0)

**Normal → CAD-Werkzeuge → Beispielskizzen** oder **Easy Tinker → Zeichnen & Netz → Beispielskizzen** öffnet die vorhandene persönliche Bibliothek mit vier zusätzlichen Beispielkarten. Eine Karte öffnet zunächst einen bearbeitbaren Entwurf; sie fügt weder ein Modell noch einen Bibliothekseintrag automatisch hinzu. Der Easy-Arbeitsbereich **CAD** oder **Netz** bestimmt den Ergebnistyp. Die ausführliche Zeichenoberfläche öffnet sich gezielt.

| Beispiel | Vorgaben | Wichtige benannte Maße |
|---|---|---|
| Halteplatte | 60 × 40 × 3 mm, vier Bohrungen Ø 4,2 und Langloch 20 × 6 | breite, tiefe, hoehe, bohrung, rand, laenge, schlitz |
| Langlochplatte | 60 × 30 × 3 mm, zwei Langlöcher 20 × 6, Mittenabstand 30 | breite, tiefe, hoehe, laenge, schlitz, abstand |
| Distanzring | Außen Ø 20, innen Ø 10, Höhe 5 mm | aussen, innen, hoehe |
| Gehäuserand | 60 × 40 × 10 mm, Wand 2, Eckradius 4 | breite, tiefe, hoehe, wand, radius |

Die benannten Maße erscheinen bei Vorlagen vor der Bearbeitung einzelner Konturelemente. Sie steuern Linien, Kreise und echte Kreisbögen über sichere Formeln; beim Gehäuserand ist der Innenradius `radius − wand`. Die Halteplatte enthält mehrere durchgehende Öffnungen, der Gehäuserand hat eine durchgehende Innenöffnung und keinen Boden. Ungültige, überkreuzte oder außen liegende Konturen werden vor der Extrusion abgewiesen.

1. Beispiel öffnen und benannte Maße ändern. **Einpassen** zeigt die Kontur. **Vergrößern** öffnet die große Zeichenfläche.
2. **Vorschau berechnen** prüft Kontur und Körper. **Extrudieren und hinzufügen** übernimmt genau einen Modell-Undo-Schritt.
3. Über die Quelle die gespeicherte Skizze erneut bearbeiten. In der persönlichen Bibliothek **Auswahl speichern** wählen, um eigene Varianten wiederzuverwenden. Vorhandene persönliche Vorlagen bleiben erhalten.

In jedem Skizzenwerkzeug erklärt die aufklappbare Kurzhilfe Fang, Zoom, Verschieben, Punktauswahl, Formelschutz und Konturwerkzeuge. In Easy Tinker bietet **Zeichnen & Netz** außerdem den Zugang zu Skizzen auf Teilflächen, Original-Flächenauswahl, technischen Netzbereichen, beiden Vereinfachungsmethoden und Reparatur. **Ansicht & Prüfen → Modelle vergleichen** bleibt ebenfalls erreichbar.

Auch die bestehende lokale Schnittstelle nutzt dieselben Beispiele: `app/resources` listet `sketchTemplates`; `app/sketchTemplate` mit `{id:"plate"|"slots"|"ring"|"rim"}` liefert eine neue bearbeitbare Version-2-Skizze samt Anleitung. Die Skizze wird mit dem vorhandenen Skizzenbefehl oder `mesh-create-source` wie jede andere Kontur geprüft. Die Abfrage selbst verändert weder Projekt noch Bibliothek; MCP-API 1 und Werkzeugnamen bleiben erhalten.

Die acht Ausbaupakete erweitern die große Ausgabe. Frühere portable Ausgaben, Mini-Ausgaben und persönliche Modelle bleiben erhalten. Der zusätzliche SolidCraft-Editor entfällt ab 0.79.0. Nicht enthalten sind ein vollständiger Bedingungslöser, globale Abhängigkeiten zwischen Teilen, 3D-Skizzen, Splines, Loft/Sweep/Shell aus dem früheren Zusatzeditor, ein allgemeiner räumlicher STL-Wandversatz oder eine vollständige Druckprüfung. Der vorhandene Netzbefehl Aushöhlen bleibt verfügbar. Zum Umgang mit älteren eingebetteten Entwürfen siehe [Offline-Modellieren](OFFLINE-MODELLIEREN.md).
