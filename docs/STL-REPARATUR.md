# STL-Reparatur im Importdialog und optionales Trimesh-Werkzeug

Im STL-Importdialog nach Wahl der CAD-Rekonstruktion ist die Netzreparatur
standardmäßig aktiviert und abschaltbar. Sie entfernt Nullflächen/Duplikate,
richtet Flächen aus und teilt exakt kollineare Nachbarkanten. „Kleine Netzlücken
schließen“ ist zusätzlich wählbar und standardmäßig ausgeschaltet. Die nativen
Körper-, Genauigkeits- und Ressourcenprüfungen bleiben verbindlich. Fehler
erhalten Modell, Undo und den Importdialog. Reparaturschritte stehen anschließend
in den Objektnotizen; CAD-Fehlergrenzen beziehen sich auf das reparierte Netz.

`src/cad-stl-repair.js` setzt die erprobten Schritte unabhängig in JavaScript
im CAD-Worker um. Trimesh selbst wird nicht in die portable Anwendung eingebettet.
Der ergänzende `scripts/repair-stl-trimesh.py` bleibt ein separates Python-Werkzeug
für Vergleiche und Reparaturkopien. Die portable Anwendung benötigt kein Python.
Originale bleiben unverändert; Ausgabe und JSON-Bericht müssen neue,
unterschiedliche Dateien sein. Persönliche Modelle bleiben außerhalb von Git.

## Verwendung

Python 3.10 oder neuer; die optionalen Abhängigkeiten sind auf geprüfte Versionen
fixiert:

```powershell
python -m pip install -r scripts/requirements-stl-repair.txt
python scripts/repair-stl-trimesh.py --source original.stl --output repariert.stl --report reparatur.json
python tests/stl-trimesh-repair.test.py
```

Die Standardbereinigung verbindet exakt identische Punkte, entfernt Nullflächen
und doppelte Dreiecke und korrigiert mit Trimesh die Flächenorientierung.
Punkte werden nicht gerundet, verschoben oder geglättet. ASCII-Ausgabe erhält
Double-Koordinaten statt erneut auf binäre STL-Float32-Werte zu quantisieren.

Zusätzliche Eingriffe sind ausdrücklich wählbar:

- `--fill-small-holes`: Trimesh versucht dreieckige/viereckige Randlücken zu
  schließen. Größere Löcher werden nicht mit beliebigen Dreiecksfächern gefüllt.
  Dabei entstehen zusätzliche Flächen; eine solche Öffnung kann beabsichtigt sein.
- `--resolve-collinear`: eigene Formnaro-Ergänzung, keine eingebaute Trimesh-
  Funktion. Bei einer isolierten Nullfläche aus drei exakt kollinearen Punkten
  wird die angrenzende lange Kante am vorhandenen mittleren Punkt geteilt.
  Voraussetzung: Punkt innerhalb des Segments und drei einzeln belegte Randkanten.
  Die vorhandene Fläche wird unterteilt, keine neue Oberfläche eingefügt.
  Nahezu kollineare Punkte werden nicht verschoben.

`candidateClosedSingleBody` ist eine Netzprüfung, keine CAD-Zusage. Eine umfassende
Selbstüberschneidungsprüfung fehlt. `nativeCadValidated` bleibt im Reparaturbericht
deshalb `false`. Die Kopie muss anschließend die vorhandenen nativen Formnaro-
Genauigkeits-, Körper- und Ressourcenprüfungen bestehen. Volumenänderungen werden
nur bei vorher/nachher geschlossenen, konsistent orientierten Netzen verglichen.
Bei ungelösten Problemen entsteht dennoch eine diagnostische Kopie; der Bericht
benennt den Zustand.

## Versuch am 12.10.2026

Der bisherige lokale 25-Dateien-Bestand wurde untersucht. Rohbelege und persönliche
Modelle bleiben unter `work/trimesh-repair-check/`.

- Alle 17 bisher konvertierten Dateien benötigen keine Bereinigung: keine
  Dreiecke entfernt, ergänzt oder umgedreht.
- Von vier wegen ungültiger Netze abgewiesenen Dateien macht die reine Trimesh-
  Reparatur keine zusätzlich konvertierbar. Eine ist leer; zwei weitere behalten
  nichtmannigfaltige Kanten. Kleine Lochfüllung löst diese Probleme nicht.
- Der vierte Fall enthält ein kollineares Nullflächendreieck. Die eigene
  Kantenunterteilung mit Trimesh ermöglicht eine native Konvertierung: gültiger
  Solid, Projekt-/STEP-Rundlauf bestanden. Reparierte STL-Punkte, Außenmaße und
  berechnetes Volumen bleiben erhalten. CAD-Volumenabweichung etwa 0,3052 %.
- Unabhängige Oberflächenproben gegen die ursprüngliche STL ergeben maximal
  0,015795 mm Abstand. Separater Bernstein-Korrespondenzbound: 0,02001 mm.
  Stichproben sind kein globaler Beweis.
- Vier weitere Dateien scheitern an Datei-/Dreiecks-/BRep-Limits; Reparatur hebt
  diese nicht auf. Keine Netzvereinfachung vorgenommen.

Ein zusätzlicher realer Fall ist damit belegt (18 statt 17 von 25). Die bisherigen
17 CAD-Erfolge stammen aus der bestehenden Abnahme; keine vollständige neue
CAD-Abnahme aller 25 Dateien behauptet. Acht Python-Prüfungen decken Bereinigung,
Orientierung, Lochfüllung, ungelöste große Öffnungen, mehrere Körper, ASCII-
Präzision und kollineare Kantenunterteilung ab.

Eine wesentliche Speicherersparnis ergibt sich nicht: beim geretteten Modell
bleibt die Dreieckszahl 1926. Der hohe CAD-Arbeitsspeicherbedarf bleibt ein
separater Optimierungspunkt.

## Speicherverhalten der integrierten Ausgabe

STL-Dateien werden für die CAD-Rekonstruktion erst im Worker in Double-Koordinaten
zerlegt; der Renderer hält keine zusätzliche vollständige Koordinatenkopie.
Native Sewing-/Unify-Zwischenspeicher werden freigegeben, sobald der Folgekörper
ihre Topologie übernommen hat. Geometrie, Präzisionsbudget und CAD-Kern bleiben
unverändert.

Ein auf mindestens 512 MiB angewachsener WASM-Worker wird nach der bestätigten
Übernahme eines leeren Projekts oder nach einem fehlgeschlagenen großen STL-Import
ausgetauscht. Ein leerer Entwurf allein löst keinen Neustart aus; Undo/Redo
behalten ihre warmen Caches. Wartende Aufgaben erhalten zuerst ihre Antworten. Der
nächste Auftrag startet mit dem bestätigten Projekt; Undo/Redo und Entwürfe
bleiben im Controller erhalten. Erfolgreiche Importe behalten ihren Worker
während der Bearbeitung, damit native Zwischenspeicher weiterhin nutzbar sind.
Die Grenze betrifft die WASM-Kapazität, nicht das gesamte Prozess-RAM.

Gemessener Vergleich mit derselben großen STL, STEP-Export, Undo/Redo und fünf
anschließenden kleinen Importen, jeweils in einem isolierten Electron-Profil:

| Gesamt-Arbeitssatz | Bisherige Ausgabe | Optimierte Ausgabe |
| --- | ---: | ---: |
| Größte beobachtete Spitze, 100-ms-Proben | 4559,35 MiB | 3772,93 MiB |
| Nach dem Wechsel zu kleinen Modellen | 2325,09 MiB | 925,77 MiB |

Das entspricht rund 17,25 % weniger Spitze und 60,18 % weniger gehaltenem RAM.
Volumen und BRep-Größen sind in beiden Läufen gleich. Der große Import dauerte
98,88 bzw. 115,24 Sekunden, STEP 15,84 bzw. 18,26 Sekunden; eine Beschleunigung
ist nicht belegt. Es sind Einzelmessungen dieses Ablaufs, keine allgemeinen
Speicher- oder Laufzeitgarantien. Die unveränderte große CAD-Konstruktion benötigt
weiterhin mehrere GiB. Rohbelege bleiben lokal unter `work/stl-memory/`.

Quellen: [Trimesh](https://github.com/mikedh/trimesh),
[Reparaturfunktionen](https://trimesh.org/trimesh.repair.html).
