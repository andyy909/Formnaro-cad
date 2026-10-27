# FreeCAD und erweiterte KI-Arbeitsschritte

Die neue Ausgabe 0.114.0 enthält FreeCAD 1.1.4 und die passende Python-Laufzeit im eigenen Programmordner. Sie wählt diese Laufzeit automatisch; ein separater Download oder eine manuelle Pfadeinstellung ist nicht erforderlich. Paket 6a ist mit 0.114.0-r7 auch auf frischem Windows ohne externe Installation abgenommen. Ältere Ausgaben bis 0.113.1 benötigen weiterhin eine zusätzliche lokale FreeCAD-Installation. Die Engine wird ohne sichtbares FreeCAD-Fenster gestartet; ihre Arbeitsdateien liegen in einem eigenen temporären Ordner und werden anschließend entfernt.

In **Einstellungen → KI / API** zeigt Formnaro die verwendete CAD-Laufzeit und das Arbeitsbudget. Standard sind **24 KI-Anfragen pro Auftrag**, einstellbar von 7 bis 80. Messungen, Korrekturen und Bildprüfungen teilen sich dieses Budget. Weitere Schritte benötigen gegebenenfalls mehr Zeit und Tokens. Die bisherige Grenze von zwei Messrunden und zwei Korrekturen gilt für den kurzen Modus mit sieben Schritten; längere Aufträge können wiederholt messen und nachbessern. Modell, Denkaufwand und persönliche Anbieterkontexte werden weiter unabhängig gewählt.

## Werkzeuge

### Vollständige FreeCAD-Python-API

Zusätzlich zu den bisherigen Datenplänen kann die KI eigene Python-Programme in der mitgelieferten FreeCAD-Laufzeit ausführen. Es gibt dabei keine Liste zugelassener Modellierfunktionen. Funktionen, Klassen und Objekttypen lassen sich über `dir`, `help`, `doc.supportedTypes()` und den eingebauten API-Katalog erkunden. Das gilt für alle eingerichteten KI-Anbieter.

```json
{"op":"tool","engine":"freecad","as":"result","operation":{"kind":"build","script":{"version":1,"name":"Parametrischer Körper","code":"base=doc.addObject('Part::Cylinder','Base')\nbase.Radius=parameters['radius']\nbase.Height=12\ndoc.recompute()\nresult=base","parameters":{"radius":8}}}}
```

Das Skript erhält `doc`, `App`, `Part`, benannte `inputs`, `source_objects`, `source_files`, `parameters` und einen eigenen Arbeitsordner `workspace`. STEP-Eingänge sind native Shapes; STL-Eingänge bleiben unveränderte `Mesh.Mesh`-Kopien. Eigene Helfermodule können als `script.modules` mit einfachen `.py`-Dateinamen übergeben werden. Das Ergebnis steht in `result`; zusätzliche Messwerte stehen als JSON-Daten in `measurements`. Für reine Messungen dient `engine:freecad, kind:inspect` mit demselben `script`, ohne Modellübernahme.

`Part`, `Sketcher`, `PartDesign`, `Mesh`, `MeshPart`, `Draft`, `Surface`, `Import`, `TechDraw` und weitere installierte Module können direkt importiert werden. Für `FreeCADGui`, `ImportGui` und Funktionen, die eine GUI benötigen, setzt die KI `script.gui:true`: Eine eigene FreeCAD-Instanz arbeitet dann ohne sichtbares Fenster. Der Benutzerprozess wird dabei nicht bedient.

Der mitgelieferte Helfer `formnaro_freecad` bietet `sew_solid(faces)`, `inside(shape, points)`, `inspect_shape(shape)` und `api(module, search, limit)`. Die zugrunde liegenden FreeCAD-Methoden können ebenfalls direkt benutzt werden. Flächen vernähen, Schalen und Körper bilden, B-Splines und andere Flächen erzeugen sowie Punkte exakt im Körper klassifizieren benötigen keine neuen Einzelfreigaben.

Echte parametrische Objekte und Abhängigkeiten bleiben im FCStd-Dokument erhalten, wenn das Skript sie in `doc` anlegt und das finale Objekt als `result` setzt. Vollständiger Code, Helfermodule und Parameter werden am Ergebnis gespeichert. Die Werkzeugbibliothek archiviert native Skripte vor der Ausführung einschließlich fehlgeschlagener Versuche; die KI kann sie finden, lesen und mit neuen Messwerten wiederverwenden. Die Analyse-Python-Umgebung mit NumPy/SciPy bleibt zusätzlich verfügbar; sie ist ein anderer Interpreter als FreeCAD.

Neue Körper müssen die native Geometrieprüfung und das erneute Einlesen ihres STEP-Exports bestehen. Vorschau, Originalschutz, Ergebnisprüfungen und ein Rückgängig-Schritt bei Übernahme bleiben Bestandteil des Ablaufs.

Die KI erhält `programTools.freecad` mit dem vollständigen Datenvertrag für:

- Quader, Zylinder, Kegel, Kugel und Torus;
- Polygon-, Kreis-, Linien- und Bogenprofile, offene und geschlossene Pfade sowie echte Sketcher-Skizzen mit ausdrücklich angegebenen Bedingungen;
- Extrusion, Rotation, Loft und Sweep;
- Vereinigung, Differenz und Schnittmenge;
- Rundung, Fase, Wandstärke, Offset und Entfernen von Trennkanten;
- explizite Shape-Reparatur und Umwandlung geschlossener Schalen in Körper;
- Verschiebung und Drehung;
- Schnitte, Geometrieprüfung, Flächen-/Kantenmessungen und exakten BRep-Mindestabstand.

Die KI kann vorhandene CAD-Teile als STEP und Netze als STL übergeben. Diese Quellen bleiben erhalten; der Bauauftrag erzeugt eine neue CAD-Kopie in der normalen Vorschau. Ein STL-Eingang wird zunächst facettiert in eine Schale überführt. Eine saubere analytische Rekonstruktion erfordert weiterhin gemessene Profile und passende Konstruktionen. FreeCAD ergänzt die vorhandenen nativen und Python-Werkzeuge.

## Quellen und Prüfungen

Jeder neue FreeCAD-Körper speichert seinen vollständigen Plan, benannte Maßparameter und ein echtes FCStd-Dokument. Die KI kann den Plan mit geänderten Parametern erneut berechnen. In den KI-Einstellungen lässt sich das FreeCAD-Quelldokument eines ausgewählten Ergebnisses speichern. Die Part-Schritte im FCStd enthalten ihre Quellen und Konstruktionsdaten als Historie; sie sind gespeicherte Shapes und werden bei Änderungen durch erneutes Ausführen des Plans aufgebaut. Sketcher-Bedingungen bleiben im zugehörigen Skizzenobjekt erhalten. Eine beliebige STL wird dadurch nicht automatisch vollständig parametrisiert.

FreeCAD prüft neue Ergebnisse auf Gültigkeit, Geschlossenheit und vorhandene Volumenkörper. Zusätzlich liest der KI-Arbeitsablauf den STEP-Export geänderter CAD-Körper unabhängig mit FreeCAD. Diese Prüfung wird im Chat angezeigt. Maße, Bohrungen, Körperzahl und Abweichungen vom Original werden separat durch die vorhandenen Ergebnisprüfungen belegt. Oberflächenvergleiche bleiben Stichproben mit ausgewiesenen Grenzen.

Bei späteren Fehlern bleibt ein berechenbarer Entwurf mit Warnung verfügbar. Ein Folgeversuch mit mehr fehlgeschlagenen Prüfungen verdrängt den zuvor besseren Entwurf nicht. Abbruch oder eine Änderung der ursprünglichen Szene/Auswahl verwerfen die Anfrage. Eine Übernahme erzeugt einen Rückgängig-Schritt.

Native Python-Programme laufen unter Windows in einem eigenen AppContainer. Er erhält Zugriff auf die übergebenen Arbeitskopien und die installierte Laufzeit; fremde Nutzerdaten und Netzwerkzugriffe bleiben außerhalb dieses Rechenprozesses. Der Interpreter hat die vollständige verfügbare FreeCAD-API, keine Python-Funktionsfilter. Abbruch und Zeitlimit beenden seinen gesamten Prozessbaum. Ohne diese Windows-Isolation wird fremder Python-Code nicht im Benutzerprozess ausgeführt. Die bisherigen Datenpläne bleiben kompatibel und erlauben weiterhin bis zu 128 Schritte. Für Skripte gibt es keine solche Operationsanzahl; es gelten ein Rechenzeitlimit von fünf Minuten, acht Geometrieeingänge sowie ausgewiesene Datei- und Auftragsgrößen.

Den vollständigen Formnaro-Ordner einschließlich resources/freecad auf den anderen PC mitnehmen; eine separate FreeCAD-/Python-Installation ist ab 0.114.0 nicht nötig. Die Web-Ausgabe stellt diese Desktop-Engine nicht bereit. Ältere Formnaro-Ausgaben kennen die neue FreeCAD-Quellmetadaten nicht; solche Projekte mit der neuen Ausgabe öffnen.

Technische Referenzen: [FreeCAD Part API](https://github.com/FreeCAD/FreeCAD-documentation/blob/main/wiki/Part_API.md), [TopoShape API](https://github.com/FreeCAD/FreeCAD-documentation/blob/main/wiki/TopoShape_API.md).
