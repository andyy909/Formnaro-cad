# Formnaro 0.11.0: technische CAD-Abnahme

Stand: 11.10.2026. Der produktive Einstieg ist `src/cad-main.js`, das
bearbeitbare Projektformat ist `.ocad` Version 5. Neue Modellierung verwendet
einen gemeinsamen OCCT-8.0.1-WASM-Kern. Manifold und der unveränderte ältere
OCJS-Kern verbleiben ausschließlich als Entwicklungsabhängigkeiten für
historische Vergleichstests; sie gehören nicht in den Produktbuild.

## Ausgeführte Nachweise

| Bereich | Tatsächlich geprüft |
| --- | --- |
| CAD-Basis | 155/155 Tests, keine übersprungenen Fälle: alle 23 Formen, Quellen, Transaktionen, Undo/Redo, BRep ohne Triangulierung, native Werkzeuge, Farben, Speicherung, begrenzte Worker-Caches, Plugins, Vorlagen und lokale KI. |
| Erweiterter Kern | 45/45 zusammenhängende Tests plus zusätzliche native glTF-Regression: allgemeine affine Matrizen einschließlich Scherung/Spiegelung, native Rays/Normalen, Kantenherkunft, Mehrdeutigkeit, ganze Kurven, Finishentfernung, Gruppen-/Arbeitsebenenbezüge und getrennte frische BRep-/STEP-Leser. |
| Originale Schriftkonturen | Alle 627 nichtleeren vorhandenen Glyphen: 205 normal, 205 fett, 217 Serif. Native Solids und ursprüngliche analytische Konturfläche geprüft, einschließlich ®, ç und ÿ. Selbstschnitt und Füllregeln zusätzlich in sechs nativen Fällen einschließlich STEP. |
| Vorherige Funktionen | 97/97 historische Regressionen nach dem Versionswechsel weiter bestanden. |
| Hauptoberfläche | Sechs Electron-Harnesses: Kernabläufe; Import/Export/Referenzen; echte Eck-/Verschiebe-/Höhengesten; 26 Werkzeugphasen; 18 Platzierungsphasen; 25 Bearbeitungsphasen. Maus, Palettendrag, Tasten und Pointercancel werden auch als echte vertrauenswürdige Browserereignisse geprüft. |
| Anker und Quellen | Gescherte/gespiegelte Eckänderung: Gegenankerfehler 0 mm; Höhengriff 3 mm ohne Änderung der linearen Matrix/des nativen Volumens. Verschachtelte Quellen, Parameter mit Dezimalkomma/Enter, Kopieren, Spiegeln und Auflösen bleiben vollständig affin und erzeugen jeweils einen Undo-Schritt. |
| Mehrfachauswahl | Gruppe plus eigene Quelle wird auf unabhängige Ziele normalisiert; keine doppelte Bewegung. Geschwisterquellen haben getrennte native Vorschauen; gehaltene Geste ändert weder bestätigten Stand noch Undo, Freigabe übernimmt gemeinsam einmal. |
| Qualität | Anzeigeänderung erhält CAD-Maße, Volumen, BRep, Revision, Arbeitsebene, Passung und STEP-Datengraph. Exportmeshes werden separat aus nativen BRep-Kopien berechnet. |
| Daten und lokale KI | Echte Electron-/Preload-/IPC-/Loopback-HTTP-/Python-MCP-Abnahme mit 25 Prüfungen und tatsächlicher Appversion 0.11.0. Veraltetes Apply liefert HTTP 409 und STALE_REVISION; Wiederholung ist idempotent. Alte vergiftete Meshdateien bleiben bytegleich, Einstellungen/Favoriten erhalten. |
| Native Dateidialoge | Tatsächlich sieben eigene Testdateien über originalen Save-IPC geschrieben: .ocad, .step, .stl, OBJ/MTL-.zip, .3mf, .gltf und .svg. Keine Nutzerdateien oder Cloudaufrufe. |
| Abbruch | Echte Oberflächenmessungen im einstelligen Millisekundenbereich; weniger als die geforderte Sekunde. Worker wird beendet und aus dem bestätigten Stand neu gestartet. |
| Kern und Lizenzen | 24 materialisierte Runtimeartefakte SHA-geprüft, darunter 14 vollständige originale Lizenz-/Autorentexte. Produktiver und isolierter Build enthalten bytegleich genau einen WASM-Kern. |

Der genaue Nachweis der **tatsächlich gepackten** EXE folgt mit derselben
25-Punkte-Harness nach ASAR-Erstellung. Das konkrete, nach dem Paketstart
erzeugte Ergebnis wird neben der Auslieferung als
`Abnahme-portabel-v0.11.json` bereitgestellt. `Paketpruefung-v0.11.json` dokumentiert
die Dateiintegrität, Version, Lizenzinventar, Ausschluss persönlicher Daten und
den einzelnen gemeinsamen Modellierkern. Diese Ergebnisdateien gehören zur
Freigabe; ein alleiniger erfolgreicher Quellbuild ersetzt sie nicht.

## Geometrische Genauigkeit und praktische Grenzen

Herz und Evolventen verwenden komponentenweise analytische Schranken der
vierten Ableitung: kubisches Hermite hat Fehler höchstens M·h⁴/384. Die
Vektorschranke und die getrennten Profil-/Rotationsbudgets begrenzen die
Schraubflächen. Axialer Lead, Drehrichtung, Mehrgängigkeit und Phase stammen
weiterhin aus den Originalparametern. Der Dienst berücksichtigt den gesamten
Eltern-Kind-Matrixverbund, Skalierungsnorm und inverse Norm; sein lokales
Budget erfüllt 0,0001 mm und ein Hundertstel des Merkmals in Weltkoordinaten.
Unterschreitungen des unterstützten nativen Toleranzbereichs werden abgewiesen.

Unbekannte BRep-/STEP-Körper werden in frischen, getrennten WASM-Workern geprüft.
Die vier affinen Fälle umfassen Schrägzahnrad, gespiegeltes Zahnrad, linkes
Zweiganggewinde mit Kopf/Bohrung und ein tatsächlich gefastes Zahnrad. Native
Gauss-Kronrod-Integration und optimale CAD-Grenzen werden verwendet. Native
SameParameter-Reparatur des affinen Gewindes erhält Quell-BRep, 3D-Kurven und
Flächen bytegleich und erhöht die maximale ursprüngliche Toleranz nicht.

Für Exportmeshes fordert OCCT die eigene absolute Deflektion/Winkelabweichung
an. Zylinderprüfungen vergleichen echte Exportvertices und Dreiecksmitten mit
analytischem Radius beziehungsweise nativen CAD-Flächen, auch bei 10 Millionen
mm Weltkoordinaten. STL, OBJ und 3MF behalten Double-Koordinaten als Text.
glTF verwendet lokale Float32-Meterattribute plus Double-Weltversatz und teilt
das gewählte Budget zwischen Tessellierung und kontrollierter Rundung auf.
Ein unabhängiger glTFLoader dekodierte 352 Dreiecke bei großen Weltkoordinaten:
maximaler Koordinatenfehler 5,07·10⁻⁷ mm, maximaler CAD-Flächenabstand der
geprüften Dreiecksmitten 0,00553744 mm bei gewähltem Gesamtbudget 0,025 mm.

Diese geometrischen Konstruktionsschranken, native Gültigkeitsprüfungen und
konkreten Exportproben sind getrennte Nachweise. Volumenvergleich und
Zylinder-/Dreiecksproben behaupten keinen allgemeinen bidirektionalen
Hausdorffbeweis beliebiger Boolescher Körper oder aller Exportfacetten.
Wandstärken bleiben ausdrücklich Stichproben. Mehrdeutige Quellen-/Kantenbezüge
und nicht eindeutig klassifizierbare Konturregionen werden nachvollziehbar
abgewiesen, statt Ersatzgeometrie zu übernehmen.

## Unabhängiger STEP-Leser

Die unveränderten nativen AP214-Ausgaben wurden mit der offiziellen separaten
portablen FreeCAD 1.1.4 und deren OCCT 7.8.1 gelesen. Das ist eine unabhängige
Anwendung und Binärdatei, verwendet aber dieselbe OCCT-Algorithmenfamilie.
Geprüft werden geschlossene gültige Solids, Hohlräume, optimale Grenzen,
analytische Flächen, Originalnamen einschließlich Unicode, Farben und Millimeter.
Eine zusätzliche Part-21-Strukturprüfung mit steputils kontrolliert Referenzen
und nichttessellierte Geometrie. Native Schnittprüfungen des erneut eingelesenen
komplexen Gewinde-/Mutter-/Zahnradmodells ergänzen den Test.

BRL-CAD step-g wurde ebenfalls tatsächlich ausprobiert und scheiterte an
SurfaceCurve/SeamCurve. Dieser Versuch wird nicht als bestandener Leser gewertet.
Die Produktionsdateien behalten ihre ursprünglichen PCurves.

## Reproduktion und separate Auslieferung

```powershell
npm ci
node cad-kernel-build/verify-runtime.mjs
npm run test:cad-release
npm run package
node scripts/check-package.mjs
node tests/cad-portable-proof.cjs release-formnaro-v0.11/Formnaro-win32-x64/Formnaro.exe
```

Das Package-Skript verlangt einen erfolgreichen, an Quellen und dist-SHAs
gebundenen Gate-Report. Es prüft die fünf ursprünglichen Quellenarchive und
Bridge-/YAML-/Buildinput-Pins vor dem Paketieren. Es überschreibt keinen
bestehenden Ausgabeordner. Pythoncache, Testprofile, Nutzermodelle,
Verbindungsdateien und Zugangsdaten gehören nicht in die Laufzeit oder Quellenzip.
Der identische Python-MCP-Client liegt zusätzlich neben der EXE, weil Python
Dateien innerhalb von app.asar nicht direkt öffnen kann.

Die vollständigen entsprechenden Kernelquellen und Anwendungssourcen liegen
separat in `Formnaro-CAD-Quellen-v0.11.zip` und `Formnaro-Quellcode-v0.11.zip`;
Prüfsummen stehen daneben. Genaues Neubauen und Ersetzen des LGPL-Kerns beschreibt
`licenses/CAD-Quellen-und-Build.txt`. Native Vorbereitung und Linken verwenden
geprüfte Quellenstände sowie ein unveränderliches Original-OCI-Image; die
ursprüngliche SOURCE_DATE_EPOCH-Provenienz bleibt erhalten.

Alte Formnaro-Ausgaben, alte Projekte, Autosicherungen und Meshbibliotheken
werden weder aktualisiert, konvertiert noch gelöscht. Veröffentlichung,
GitHub-Upload, Commit oder Push sind kein Bestandteil dieser lokalen Ausgabe.
