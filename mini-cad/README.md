# Formnaro Mini CAD 0.4.0

Eigenständige portable Windows-Anwendung auf Basis der Bedienung von Formnaro
Mini 0.6.1. Die Formen, Rundungen und booleschen Operationen arbeiten mit
nativen OCCT-8.0.1-CAD-Körpern. Die Netz-Mini und die große Formnaro-Anwendung
werden weder benötigt noch verändert.

## Benutzung

`Formnaro Mini CAD.exe` starten. Formen auf die Arbeitsfläche oder ein anderes
Teil ziehen. Shift-Klick und Auswahlrahmen markieren mehrere Teile. Kleine
Drehpfeile, 15°-Raster im Drehkreis, Eckgriffe, Höhengriff, gedrücktes Mausrad
zum Verschieben der Ansicht und Rechtsziehen zum Drehen entsprechen der Mini.

Körper und Lochformen markieren und gruppieren, um Material auszuschneiden.
Quellen bleiben in der Gruppe gespeichert. Beim Auflösen einer gescherten
Quelle wird ihre vollständige affine Geometrie als nativer CAD-Körper erhalten;
das ursprüngliche Rezept wird zusätzlich aufbewahrt. Dieser besondere Körper
hat anschließend keine direkten Grundformparameter. Rückgängig stellt die
vorherige editierbare Gruppe wieder her.

**Importieren:** STEP/STP als native CAD-Körper, maximal 30 MB. Position und
Millimetermaße bleiben erhalten. Geschlossene, orientierte STL bis 10.000
Dreiecke können ausdrücklich als facettierte CAD-Körper eingelesen werden.
STL enthält keine ursprünglichen Radien oder Konstruktionshistorie; diese
werden daraus nicht rekonstruiert. Umfangreiche STL in der Netz-Mini bearbeiten.

**Exportieren:** Teile markieren und STEP (CAD) oder STL (3D-Druck) wählen.
Nur sichtbare markierte Teile werden exportiert. Markierte Lochformen schneiden
Material aus. Ohne Lochformen hält STEP die ausgewählten Teile mit Namen und
Farben getrennt; beim gemeinsamen Lochabzug wird das resultierende CAD-Modell
als ein Exportteil geschrieben. Exportierte STEP-Dateien enthalten Körper,
keine Mini-Bedienhistorie.

**Speichern/Öffnen:** `.fmcad` enthält Grundformrezepte, CAD-BRep-Daten und
Gruppenquellen. Die Bildbibliothek speichert dieses vollständige Format mit
einem einmal erzeugten Vorschaubild. Sie unterstützt Öffnen, Einfügen,
Favoriten, Suche, Ordner und das Ziehen eigener Formen in die Szene.
Eine `.fmini`-Netzdatei oder ein großes `.ocad`-Projekt ist kein Mini-CAD-Projekt.
Für den Austausch zwischen CAD-Anwendungen STEP verwenden.

Eigene portable Daten: `Daten-Mini-CAD` und `Bibliothek-CAD` direkt neben der
EXE. Der Bibliotheksordner kann in der Bibliotheksansicht geändert werden;
Originale bleiben bei der Übernahme erhalten. Bei Updates beide Ordner
mitnehmen und eine gegebenenfalls selbst gewählte Bibliothek separat sichern.
Die Anwendung liest keine vorhandenen Formnaro- oder Netz-Mini-Profile ein.

## Genauigkeit und Grenzen

Die CAD-Anzeigequalität verändert nur abgeleitete Dreiecke: schnell
0,08 mm/16°, Standard 0,02 mm/8°, fein 0,008 mm/5°. STEP bleibt native
CAD-Geometrie. Herzkurven sind begrenzt approximierte CAD-Bézierkurven mit
dem übernommenen Konstruktionsbudget von höchstens 0,0001 mm; es handelt
sich nicht bei jeder Form um eine analytische Fläche.
STL wird separat mit 0,01 mm/5° tesselliert und als binäres STL mit
Float32-Koordinaten geschrieben. Große Weltkoordinaten können zusätzliche
STL-Rundung verursachen; STEP ist der präzisere CAD-Austauschweg.

Anzeige, Treffer für Flächenablage und Zweipunktmessung verwenden die
Anzeigeflächen. Die bestätigte Auflage des abgelegten Körpers auf der so
gewählten Tangentialebene wird nativ berechnet. Einpassen und Mausgriffe
orientieren sich an der Anzeige. Außenmaße, Boden und Kanten-/Mittenausrichtung
verwenden native CAD-Grenzen. Flächenablage ist kein Kollisionsnachweis.

Maximal 200 Root-Teile/1.000 Quellen, Projekt 32 MB, BRep 12 MB je Körper
und zusammen 24 MB. Anzeige maximal 250.000 Dreiecke je Teil. Geometriecache
16 MiB/64 Einträge, dazu begrenzte interne native Prüf-Caches.
Abbrechen beendet den Rechenworker; nur bestätigte Änderungen werden gesichert.
Rückgängig: höchstens 60 Stände/ungefähr 24 MiB, ein großer Einzelstand erlaubt.
CAD-Operationen können je nach Modell länger dauern als in der Netz-Mini.
Es gibt keine pauschale Zusage gleicher Geschwindigkeit.

## Entwicklung

Node 22.16 oder neuer, anschließend im Quellenordner:

```sh
npm ci
npm test
npm run build
npm run test:desktop
npm run package
```

Der Ordner ist selbstständig. Der CAD-Kern liegt austauschbar unter
`cad-kernel-build/runtime`; seine Originalquellen und Buildanleitung sind
im beigefügten unveränderten `Formnaro-CAD-Quellen-v0.11.zip` enthalten.
Die zusätzliche Mini-CAD-Schicht nutzt zehn lokale native Module, davon
neun unverändert kopiert. Der affine Datenvalidator wurde auf den benötigten
Umfang reduziert; Herkunft und Hashes stehen unter `src/native/origin.json`.
Die normale Modellierung benötigt keinen Cloudzugang und keinen API-Schlüssel.

Lizenz des eigenen Anwendungscodes: `LICENSE.txt`. Originale Fremdlizenzen
und CAD-Quellhinweise: `licenses/`, `cad-kernel-build/runtime/licenses/` und
`THIRD-PARTY-LICENSES.txt`. Das Quellenpaket enthält keine Nutzermodelle,
persönlichen Bibliotheken, Profile oder Zugangsdaten.


## Optionale KI wie in Formnaro

Oben **✦ KI** öffnet den Chat. Über das Zahnrad Anbieter, Modell und vorhandenen
API-Schlüssel einstellen. OpenAI Responses, kompatible Chat-Anbieter einschließlich
DeepSeek und lokale kompatible Anbieter verwenden dieselbe Anbieteranbindung wie
Formnaro. Schlüssel werden nur auf Wunsch mit der Windows-Verschlüsselung dieses
Computers gespeichert. Mini CAD hat eigene Einstellungen in `Daten-Mini-CAD`;
es übernimmt keine Schlüssel oder Profile aus anderen Ausgaben.

Nachricht, Chatverlauf, angehängte Bilder und aktueller Modellkontext werden erst
beim Senden an den gewählten Anbieter übertragen. Das Modellbild lässt sich als
Vorlage anhängen. Die Werkstatt bietet zusätzlich manuelle JSON-Befehle und einen
exportierbaren Kontext; diese Wege benötigen keinen Cloud-Schlüssel.

Die KI kann sämtliche nativen Formtypen der großen Version konstruieren,
einschließlich Text aus Originalkonturen, Gewinden, Muttern, Zahnrädern und Gehäusen.
Dazu kommen boolesche Gruppen, bearbeitbare Quellen, native Bohrungen/Senkungen,
Skizzen mit Maßformeln, Teilung, Körperauszug, Kantenrundung/Fase, Reihen/Raster/
Lochkreise, Ausrichten, Passungshelfer und Referenzplatzierung. Native Abfragen
liefern Grenzen, Abstände, Referenzpunkte, Kanten, Schnitte, SVG-Projektionen,
Kollisionen und örtliche Wandstärkenstichproben. Letztere sind keine allgemeine
Druckprüfung. Netzmodellierung und der große STL-Konverter gehören nicht zur
nativen Mini CAD.

Die KI darf zusätzliche lokale Messrunden anfordern. Angegebene Maß-, Volumen-,
Körperzahl-, Abstands- und Freiraumanforderungen werden am nativen Ergebnis
geprüft. Ein abweichendes Ergebnis wird verworfen und kann innerhalb begrenzter
Korrekturrunden erneut vorgeschlagen werden. Nur die konkret angegebenen
Anforderungen werden bewiesen; die KI interpretiert weiterhin deinen Auftrag.

Eigene lokale JavaScript-Berechnungen und mitgelieferte Werkzeugmodule können
über `api.model()`, `api.query()`, `api.run()` und `api.importTool()` dieselben
nativen Werkzeuge kombinieren. Sie laufen in einem eigenen Worker innerhalb
eines origin-isolierten Frames mit gesperrtem Netzwerk. Dateizugriff, Systembefehle,
Schlüssel und allgemeine Desktopzugriffe sind nicht freigegeben.

**Vorschau → prüfen → Übernehmen:** Vor der Übernahme bleibt das Original exakt.
Die gesamte Übernahme ist ein Rückgängig-Schritt. Abbruch, ungültige Messungen und
veraltete Modellstände ändern das Projekt nicht. Eine sichtbare Vorschau ist
gekennzeichnet. Normal weiterarbeiten verwirft ihre Anzeige; nach einer Änderung
muss der Vorschlag erneut berechnet werden.

Erweiterte KI-Konstruktionen speichern native BRep-Geometrie und ihren vollständigen
nativen Quellenbaum (`cadSource`) im Mini-Projekt. Einfache, bereits von Mini
unterstützte Grundformen behalten bei starrer Platzierung die kompakte Mini-Darstellung
mit ihren gewohnten Parametereingaben. Reine Namens-/Farb-/Notizänderungen erhalten
Geometrie und angezeigte Lage-/Dreh-/Größenwerte exakt. Quellen und Skizzen bleiben über die
KI/JSON-Werkzeuge editierbar. Die gewohnte Mini-Seitenleiste bearbeitet das fertige
Teil in Größe, Lage, Farbe usw. CAD-Arbeitsebene, Layer und Ordner der KI werden
im zusätzlichen `cadWorkspace` erhalten. Für die weitere Bearbeitung dieser
Projekte mindestens Version 0.2.0 verwenden (aktueller Quellstand: 0.4.0); ältere Mini-Ausgaben kennen den Zusatzkontext
nicht vollständig. Das Projektformat bleibt Formnaro-Mini-CAD Version 1.

Die zusätzliche CAD-Werkzeugebene lädt erst beim Öffnen der KI oder bei einer
aktivierten lokalen Anfrage. Sie verwendet denselben bestehenden OCCT-Worker und
dieselbe WASM-Instanz; normale Mini-Befehle behalten ihren bisherigen Rechenweg.
Die Anwendung lädt kein Sprachmodell und fragt im normalen Leerlauf keinen
Anbieter ab. Aktive Konstruktion, Messungen und große Modelle benötigen weiterhin
Rechenzeit. Der Leistungsvergleich und seine Grenzen liegen neben der Ausgabe.

**Lokale Steuerung:** In den KI-Einstellungen die lokale Schnittstelle aktivieren.
Der dort angezeigte Verbindungsdateipfad gehört zu dieser Mini CAD. Mitgelieferter
Client: `python scripts/offlinecad_ai.py --connection "<angezeigter Pfad>" context`.
Token und Verbindungsdatei privat halten. Die Loopback-API verwendet denselben
Kontext-/Szene-/Vorschau-/Übernahmevertrag wie Formnaro; Exportformate STEP/STL.


Robuster STL-Import: auch offene/beschaedigte Netze laden, sichere automatische Bereinigung ohne Kappen. Bis 256 MiB binaer/5 Millionen Dreiecke; ueber 500.000 optionale Arbeitskopie Ziel 250.000 mit Fehlerwert und Bestaetigung. Originaldatei behalten. Keine universelle Selbstschnitt-/Mass-/Druckpruefung. Details in NETZIMPORT.md.

## Lochgruppen und Maße beim Ziehen

Mehrere Lochformen lassen sich mit Gruppieren zu einer Lochgruppe verbinden.
Die Gruppe bleibt eine Lochform und kann später gemeinsam von einem Körper
abgezogen werden. Auflösen stellt die ursprünglichen Quellen wieder her.
Beim Ziehen an Ecken oder Höhengriff erscheinen Breite, Tiefe und Höhe in mm
mit Maßlinien direkt am Teil, wie in der großen Formnaro-Ausgabe.
Die Anzeige folgt der Vorschau und verschwindet bei Abschluss oder Abbruch.
