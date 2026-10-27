# Python-Modellierung in Formnaro

Ab Version 0.90 kann Python direkt eine lokale Modellvorschau berechnen.
Die mitgelieferte Laufzeit wird erst bei einer Python-Berechnung geladen.
In der Anwendung ist keine zusätzliche Python-Installation erforderlich.

Die KI erhält bei ihren normalen Modellieraufträgen die Python-Befehlsbeschreibung
zusammen mit dem bestehenden Werkzeugkontext. Externe KI-Werkzeuge können die
gleiche Vorschau über `offlinecad_python` oder die lokale API aufrufen.
Der CAD-Kern, seine Genauigkeit und die vorhandenen Bearbeitungsgrenzen bleiben
dieselben wie bei den jeweiligen interaktiven Werkzeugen.

## In der Anwendung

1. Die große **KI-Werkstatt** öffnen.
2. **Python-Modellierung** aufklappen und **Beispiel einsetzen** wählen.
3. **Python-Vorschau berechnen** anklicken.
4. Maße und Ergebnis prüfen, bei Bedarf **Auf Fläche ansehen** wählen.
5. **Änderungen übernehmen** erzeugt genau einen Rückgängig-Schritt.

```python
from formnaro import model

platte = model.box(60, 40, 6, origin=(-30, -20, 0), name="Platte")
bohrungen = [model.cylinder(2.5, 8, origin=(x, 0, -1), hole=True)
             for x in (-20, 20)]
teil = model.cut(platte, *bohrungen, name="Platte mit Bohrungen")
result = {"bohrungen": len(bohrungen)}
```

Alle Maße sind Millimeter. Bei einem Quader ist `origin` die untere lokale
Ecke, bei einem Zylinder oder Kegel der Mittelpunkt seiner Grundfläche.
`normal` gibt die Extrusionsrichtung runder Grundformen an.
`frame(origin, normal, x_axis)` liefert eine rechtshändige Skizzenebene;
Skizzen extrudieren entlang ihrer lokalen positiven Z-Achse.

`model` ist ein vorbereiteter Befehlsentwurf. Er wird am erfolgreichen Skriptende
automatisch ausgeführt. Weitere mit `Model()` angelegte Entwürfe werden ebenfalls
automatisch abgeschlossen. Für eine Zwischenmessung zuerst `await model.flush()`
aufrufen; `await model.snapshot()` und `await model.query(...)` erledigen dies
automatisch. Python unterstützt hier auch `await` auf oberster Ebene.

## Werkzeuge

| Aufgabe | Python-Aufruf |
|---|---|
| Quader | `model.box(breite, tiefe, hoehe, origin=(x,y,z))` |
| Zylinder | `model.cylinder(radius, hoehe, origin=(x,y,z), normal=(0,0,1))` |
| Zylinder zwischen Weltpunkten | `model.cylinder_between(diameter=8, start=(30,-1,18), end=(30,41,18), overrun=0.5, hole=True)` |
| Kegelstumpf | `model.cone(radius, oberer_radius, hoehe, ...)` |
| Polygonkontur extrudieren | `model.polygon(punkte, hoehe, plane=frame(...))` |
| Linien, Kreise, Bögen, Innenkonturen | `model.profile(elemente, hoehe, loops=..., variables=...)` |
| Vorbereitete native Skizze | `model.sketch(skizzendaten, plane=...)` |
| Vereinigen, ausschneiden, schneiden | `model.union(...)`, `model.cut(koerper, *werkzeuge)`, `model.intersect(...)` |
| Profilübergang | `model.loft(*profile)` |
| Profil entlang Pfad | `model.sweep(profil, {"kind":"line", "length":30})` |
| Kopieren | `model.duplicate(teil, offset=(x,y,z))` |
| Vorhandene Quelle | `model.get(beobachtete_id, path=[quellen_ids])` |
| Ändern | `teil.move(...)`, `teil.rotate(...)`, `teil.edit(size=[...], ...)` |
| Größe bei festem Mittelpunkt | `await teil.resize([10,10,44], anchor="center")` |
| Gemessene Fläche versetzen | `model.offset_face(teil, gemessene_flaeche, abstand)` |
| Innen aushöhlen | `model.shell(teil, gemessene_oeffnungsflaechen, wandstaerke)` |
| Native Bohrung | `model.drill(teil, gemessener_bezug, diameter=..., ...)` |
| Geprüfte Kantenoperation | `model.finish(teil, gemessener_bearbeitungsschritt)` |

`model.command(befehl)` stellt außerdem die dokumentierten gemeinsamen
CAD-/Netzbefehle bereit. Für Konturverknüpfungen, Projektparameter, Gelenke und
Zeichnungen gelten weiterhin deren eigene Vorschauabläufe; sie lassen sich
nicht durch ein Geometrieskript umgehen.

Native Gruppen erhalten ihre Körper- und Lochquellen. Loft und Sweep speichern
unabhängige bearbeitbare Profilkopien; standardmäßig werden ihre zusätzlichen
Hilfsprofile als eigenständige Teile entfernt. `keep_profiles=True` beziehungsweise
`keep_profile=True` erhält diese bei Bedarf zusätzlich.

IDs, Flächen- und Kantenbezüge aus der aktuellen Szene beziehungsweise einer
Messabfrage übernehmen. Flächennummern nach einer Geometrieänderung erneut
ermitteln. Beispiele und die vollständigen akzeptierten Felder stehen im
aktuellen KI-Kontext. Nicht jede importierte Fläche eignet sich für Versatz,
Schale oder Abrundung; der native Geometrieprüfer entscheidet darüber.

```python
szene = await model.query("cad", "scene")
result = {"teile": len(szene["objects"])}
```

`result` darf eine JSON-kompatible Zusammenfassung enthalten. `print()` wird
begrenzt in der Python-Ausgabe der Vorschau angezeigt. Fehler, Abbruch und
Zeitüberschreitung verwerfen sämtliche Zwischenänderungen. Eine veraltete
Vorschau ersetzt keinen neueren Modellstand.

## Externe Python-Skripte

Die Bibliothek liegt unter `ai/python/formnaro`. Sie benötigt Python ab 3.10
und keine zusätzlichen Laufzeitpakete. Den Ordner `ai/python` dem Python-Pfad
hinzufügen oder das lokale Paket mit `python -m pip install <Pfad>/ai/python`
installieren. Die vorhandene lokale KI-Schnittstelle in Formnaro muss laufen.

```python
from formnaro import Client, Model

client = Client()  # alternativ Client(verbindungsdateipfad)
kontext = client.context()
szene = client.scene()
modell = Model()
modell.box(30, 20, 5, name="Bauteil")
vorschlag = client.preview(modell, revision=szene["revision"])
# Erst nach Prüfung:
client.apply(vorschlag)
```

`Client.preview_python(code)` lässt Python in der mitgelieferten Anwendungs-
Laufzeit rechnen. `Client.export("step")` liefert Dateibytes. Der Client liest
den lokalen Zugriffstoken intern; Verbindungsdatei und Token nicht ausgeben,
in Modelle übernehmen oder weitergeben. Es wird kein Cloud-Schlüssel benötigt.

Der MCP-Adapter `scripts/offlinecad_ai.py` bietet bei einer entsprechend neuen
Anwendung zusätzlich `offlinecad_python({revision, code, label?})`. Dieses
Werkzeug berechnet ausschließlich eine Vorschau. Die Übernahme erfolgt
getrennt mit `offlinecad_apply`.

## Laufzeit und gespeicherte Modelle

Python läuft in einem getrennten Worker mit undurchsichtigem Ursprung. Seine
Dateien liegen ausschließlich in flüchtigem WebAssembly-Speicher. Es sind
keine Benutzerordner eingebunden; Netzwerk, Desktop-Bridge, Zugangsdaten und
Programmspeicher werden nicht bereitgestellt. Zusätzliche Python-Pakete werden
nicht heruntergeladen. Standardbibliothek und die Formnaro-Helfer werden lokal
mitgeliefert. Externe CPython-Skripte laufen dagegen in der vom Nutzer gestarteten
normalen Python-Umgebung und haben deren übliche Rechte.

Die neue Schnittstelle speichert gewöhnliche native Formnaro-Quellen. Beim
Wiederöffnen ist keine erneute Skriptausführung erforderlich. Das benötigte
Projektformat richtet sich nach den verwendeten Funktionen, etwa Format 11
bei Loft/Sweep; ein einfaches Python-Modell erzwingt kein neues Dateiformat.

Beispiele: `ai/python/examples`. Die Laufzeit basiert auf dem unveränderten,
fest eingebundenen Pyodide 314.0.7 mit Python 3.14.2. Quellen, Lizenztexte und
Prüfsummen sind unter `python-runtime/provenance.json` im Quellpaket sowie
unter `licenses/python` in der Auslieferung dokumentiert.

Die genaue Koordinaten- und Ankersemantik der neuen SDK1.3-Hilfen steht in
[KI-MODELLIERHILFEN.md](KI-MODELLIERHILFEN.md).
