# Flächen und Prägungen

Paket 7 ergänzt vier Werkzeuge unter **CAD-Werkzeuge**. Sie stehen in Normal,
Easy Tinker, Solid und Fusion zur Verfügung. Ab 0.114.0 enthält die Desktop-
Ausgabe die passende FreeCAD-/Python-Laufzeit; Paket 6a ist abgenommen.
Eine separate Installation ist nicht nötig. Andere gekrümmte Trägerflächen als die unten
genannten sind noch nicht freigegeben.

## Randkurvenfläche

Vier kubische Bézierkurven in geschlossener Reihenfolge eingeben. Jedes Feld
enthält drei Weltkoordinaten X Y Z in Millimetern. Eine Kurve besteht aus Start,
zwei Kontrollpunkten und Ende. Das Ende muss dem nächsten Start entsprechen.
Die Vorgabe bildet ein Quadrat von 20 × 20 mm. Mit den Kontrollpunkten lassen
sich auch räumlich gekrümmte Ränder bilden.

Formnaro berechnet eine exakte bikubische Coons-Fläche aus den vier Rändern.
**Materialhöhe** und **Materialrichtung** erzeugen daraus einen geschlossenen
Körper mit verschobener Deckfläche und seitlichen Regelflächen. Die Höhe gilt
entlang der angegebenen Richtung; sie ist keine Zusage einer konstanten normalen
Wandstärke. Für eine ungeeignete Richtung, Selbstschnitte oder ungültige Körper
wird keine Übernahme angeboten. Eine offene Fläche wird nicht als Körper ausgegeben.

## Flächenübergang

Ein oder zwei sichtbare, entsperrte CAD-Teile auswählen und das Werkzeug öffnen.
Mit **Fläche wählen** nacheinander zwei räumlich getrennte Profilflächen wählen.
Beide benötigen einen einzigen geschlossenen Außenrand ohne Öffnungen. Ihre
Auswahlreihenfolge bestimmt den Übergang. Optional einen geradlinigen Übergang
wählen; andernfalls wird ein Loft berechnet. Das Ergebnis ist ein eigenes Teil.

Die Anschlussdiagnose gibt **G0** an, prüft Randabstände an Stichproben und misst
Normalenwinkel zwischen der Trägerfläche und den anschließenden Seitenflächen.
Ein Winkel von 90° ist beispielsweise ein deutlicher Knick. Weder ein gültiger
Körper noch eine glatte Darstellung garantiert Tangentenstetigkeit G1 oder
Krümmungsstetigkeit G2. Diese werden nicht zugesichert. Unklare Anschlüsse werden
abgewiesen. Die Stichproben sind kein vollständiger Genauigkeitsbeweis.

## Flächen vernähen

Ein bis acht CAD-Teile auswählen, dann alle benötigten Flächen einer Hülle
anklicken. Formnaro vernäht sie und prüft, ob eine einzige geschlossene Hülle
ohne freie Randkanten entsteht. Erst dann wird ein Körper erzeugt. Eine
unvollständige oder getrennte Hülle wird mit Randkantendiagnose abgewiesen.
Das Werkzeug ist keine allgemeine automatische Reparatur beliebiger Lücken.

## Prägung und Vertiefung

Ein CAD-Teil auswählen und die Trägerfläche im Inneren anklicken. In
**Profilpunkte** je Zeile X Y in Millimetern eingeben, ohne den Startpunkt am
Ende zu wiederholen. Die erste Kontur ist der Außenrand. Für jede Öffnung einen
neuen Absatz mit deren Kontur verwenden. Höchstens 16 Konturen und insgesamt
128 Punkte. Selbstschnitte, überlappende oder außenliegende Öffnungen werden
abgewiesen. Das Standardprofil ist ein Rechteck von 6 × 4 mm.

Der Ursprung liegt am angeklickten Flächenpunkt. Auf einer Ebene folgt X dem
auf die Fläche projizierten Welt-X; bei dazu senkrechter Fläche wird Welt-Y
verwendet. Y vervollständigt das rechtshändige lokale System. **Profildrehung**
dreht die Konturen in dieser Ebene.

Auf einer äußeren kreisförmigen Zylinderfläche folgt X der Bogenlänge am
ursprünglichen Radius, Y der Zylinderachse. Die Konturen werden mit exakten
UV-Linien auf den Zylinder gelegt, auch über dessen Parameternaht hinweg.
Zunächst sind hier orthogonale Konturen mit Kanten entlang Bogenrichtung oder
Achse freigegeben, einschließlich entsprechender Öffnungen. Profildrehungen
sind deshalb nur in 90°-Schritten möglich. Schräge UV-Kanten werden ausdrücklich
abgewiesen, weil deren STEP-Rückleseprüfung noch nicht zuverlässig besteht.
Höhe und Tiefe gelten radial. Die Tiefe muss kleiner als der halbe Radius
sein, die Profilbreite kleiner als der halbe Umfang. Zylinderbohrungen,
Kugeln, Kegel und sonstige gekrümmte Flächen sind zunächst ausgeschlossen.
Nicht kreisförmig verzerrte Zylinder gelten nicht als unterstützte Zylinder.

Das gesamte Profil muss innerhalb der gewählten beschnittenen Fläche liegen.
**Prägung** fügt Material hinzu, **Vertiefung** entfernt es. Volumenänderung,
Körpergültigkeit und STEP-Rückleseprüfung werden geprüft. Die Ausgabe muss ein
einzelner geschlossener Körper bleiben.

## Vorschau, Quellen und erneute Bearbeitung

**Vorschau berechnen** verändert das bestätigte Modell nicht. Der Bericht trennt
Körpergültigkeit und Anschlussqualität. **Modell ansehen** verkleinert den
Dialog und passt die Vorschau ein. Bei Prägung und Vernähen ersetzt die Vorschau
die verwendeten Ausgangsteile nur vorübergehend in der Anzeige, damit identische
Flächen nicht flimmern. Abbrechen stellt die normale Anzeige wieder her.

Bei der Übernahme entsteht ein eigenes Teil. **Verwendete Originale bei Übernahme
ausblenden** ist eine ausdrückliche Sichtbarkeitsoption; Originalgeometrie und
Quellen bleiben erhalten. Übernahme und gewählte Sichtbarkeit besitzen einen
gemeinsamen Undo-Schritt. Ohne Ausblenden können Original und Ergebnis dieselben
Flächen belegen. Unbeteiligte Teile werden nicht geändert.

Die neue Konstruktion enthält statische Kopien ihrer Eingabekörper und einen
archivierten, versionierten Python-Helfer. Frühere Konstruktionshistorie wird
dabei nicht erfunden. Über **FreeCAD-Merkmale** lassen sich native `Depth`
(Prägung/Vertiefung) und `Thickness` (gerichtete Materialhöhe) ändern. Andere
gespeicherte Konstruktionsparameter lassen sich über den getrennten Programm-
Neulauf bearbeiten. Nach einer ungültigen Neuberechnung wird kein alter Körper
als neues Ergebnis übernommen.

Projekt, Bibliothek und .fnpack erhalten die vollständige Konstruktion mit FCStd,
Helfer und Parametern. Für diese Werkzeuge ist kein zusätzliches Speicherformat
erforderlich; vorhandene Projektformate und ältere Ausgaben bleiben erhalten.
