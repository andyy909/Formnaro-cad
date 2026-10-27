# KI-Modellierhilfen 0.93.0

Das Python-SDK1.3 ergänzt zwei Hilfen, die dieselben nativen CAD-Werkzeuge,
Quellensperren und Vorschau-/Übernahme-/Undo-Regeln benutzen.

```python
from formnaro import model
bore = model.cylinder_between(
    diameter=8, start=(30,-1,18), end=(30,41,18), overrun=0.5, hole=True)
await bore.resize([10,10,43], anchor="center")
```

`cylinder_between` erzeugt einen neuen Zylinder entlang der Weltstrecke
start→end. Der ausdrücklich angegebene Überstand gilt an beiden Enden,
standardmäßig0. Die Punkte müssen mindestens0,01mm auseinanderliegen.
Quellenpunkte vorher mit der gemessenen Weltmatrix in Weltpunkte umrechnen;
die Methode nimmt keinen Elternrahmen an. Das Ergebnis bleibt ein gewöhnlicher
nativer Zylinder. Negative und schräge Richtungen sind möglich.

`await teil.resize(size, anchor="center")` liest die aktuelle native Quelle
lokal aus und erhält die Mitte ihrer lokalen Materialgrenzen, in den Elternrahmen
transformiert. Das funktioniert auch unter verschachtelten, gedrehten,
gespiegelten und gescherten Eltern. `size` verwendet die bestehenden Editierachsen
und deren Einheiten ohne geerbte Skalierung, keine Welt-AABB-Maße. Eine beliebige
Bohrungsachse wird daraus nicht automatisch erkannt. Diese asynchrone Methode
benötigt den lokalen Python-Worker oder `Client.preview_python`.

Das bisherige `teil.edit(size=...)` und `resize(...,anchor="min")` behalten die
Verankerung an der unteren lokalen Ecke. Bei einer Durchmesseränderung kann
dies die Achse verschieben. Nach einer Änderung Durchmesser, Achslage und
vollständigen freien Durchgang prüfen.

Native Euler-Drehungen verwenden jetzt das passende Three-Eulerobjekt. Damit
werden beispielsweise korrekt angegebene Querbohrungen tatsächlich gedreht.
Python- und JavaScript-Verweise auf Quellen folgen jetzt auch über mehrere
einzelne Gruppierungsaufrufe den erhaltenen Quellenpfaden.

Der bisherige vollständige Werkzeug-, Eingabe- und persönliche Erfahrungskontext
wird nicht gekürzt. Die Erweiterung benötigt keinen neuen CAD-Kern und kein
neues Projektformat. Modellvergleiche und persönliche Protokolle liegen getrennt
vom gemeinsamen Programmkontext. Zusätzlicher Denkaufwand allein beweist keine
höhere Modellqualität; der fertige Körper muss geometrisch geprüft werden.

0.93.1 ergänzt den vollständigen bisherigen Standard-Modellierkontext um geprüfte Regeln für Ankerwahl, Frame-Vorzeichen, wechselnde Querschnitte und belegte statt vermutete Aussagen. Bereits vorhandene persönliche Dateien bleiben erhalten.
