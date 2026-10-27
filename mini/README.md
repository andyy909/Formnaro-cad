# Formnaro Mini Mesh 0.9.0

Eigenständige Windows-Anwendung für einfache Netzmodelle und 3D-Druck.
Eine separate Android-Tablet-Testausgabe wird in [ANDROID.md](ANDROID.md) beschrieben.
Mini 0.9.0 ist eine separate Codebasis mit eigenem `.fmini`-Format und
eigenem `Daten-Mini`-Ordner. Die große Formnaro-Ausgabe wird nicht benötigt.

Werkzeugleiste in vertrauter Reihenfolge nach der Nutzerreferenz, lokale
Kopieren/Einfügen-Zwischenablage, Spiegeln und Maßanzeige der Auswahl.

Neu in 0.7.0: optionale KI und automatische Netzreparaturen, siehe
[KI-UND-NETZREPARATUR.md](KI-UND-NETZREPARATUR.md). Chat, Bilder, Anbieterprofile,
JSON-Werkstatt und lokale Schnittstelle verwenden die bewährte Formnaro-Anbindung.
Werkzeuge laden bei Bedarf und nutzen dieselbe Manifold-Instanz. STL-Import
versucht bei beschädigten Netzen automatisch die begrenzte Reparaturkette;
**Netz reparieren** prüft ausgewählte Teile ohne Einstelldialog.

Seit 0.6.1: Standardbibliothek unter `Bibliothek/` direkt neben der EXE.
Übernahme aus `Daten-Mini/Bibliothek` einmalig und ohne Löschen der Originale.
Explizite Ordnerwahl in der Bibliotheksübersicht, Übernahme bestehender Einträge,
Speicherort merken und auf portable Standardablage zurücksetzen. Beim Update
beide Ordner `Bibliothek` und `Daten-Mini` übernehmen. Neue Standardpfade werden
nicht absolut gespeichert; bestehende anders belegte Einträge nicht überschrieben.

Seit 0.6: Umschaltung „Grundformen“ / „Eigene Formen“ direkt in der Palette.
Gespeicherte Mini-Vorlagen mit Vorschaubildern auf Boden oder Körper ziehen,
auch auf schräge Flächen. Mehrteilige Vorlagen bleiben getrennte, gemeinsam
platzierte Teile; Farben, Löcher und Quellen bleiben erhalten. Vorschau rein
in der Ansicht, Esc verwirft, bestätigte Ablage ein Undo-Schritt. Ein Klick
bereitet die präzise Ablage per weiterem Klick (auf Android per Tippen) vor.
Raster und Oberflächenausrichtung werden gemeinsam mit Grundformen verwendet.

Seit 0.5: eigene Bildbibliothek mit zwölf gespeicherten Vorschauen je Seite,
Suchfunktion, Ordnern, Favoriten, separat Öffnen und Einfügen; präzise
Kanten-/Mittenausrichtung mit festem Bezugsteil, Zweipunktabstand und gezielter
Abstandsänderung, Reihen/Raster/Kreismuster, Teileordner und Notizen.
Bibliotheksmodelle werden erst bei Nutzung geladen; Vorschaubilder entstehen
einmal beim Speichern in einer getrennten Ansicht ohne Modell-/Kameraänderung.
Seit 0.6.1 liegt die Bibliothek standardmäßig neben der EXE, unabhängig von Großformaten.

Seit 0.4: Eck- und Höhengriffe zum Skalieren, kleine Drehpfeile mit
Winkelring sowie STL-Export ausschließlich der markierten sichtbaren Teile.
Ohne Auswahl gibt es einen Hinweis; unmarkierte Lochformen werden ignoriert.

12 Grundformen, parametrische Maße und Formeinstellungen, 3D-Mausgriffe,
Mehrfachauswahl, Körper/Lochformen, boolesches Verbinden und Schnittmengen,
Auflösen mit erhaltenen Quellen, Ausrichten, Bodenplatzierung, Duplizieren,
Sperren/Ausblenden, Auswahlrahmen und Shift-Klick, Drag-and-drop aus der Palette,
Vorschau auf Boden und Körperflächen, direkte gemeinsame Mausbewegung,
Oberflächenplatzierung bestehender Teile und einstellbares Raster,
begrenztes Undo/Redo, STL-Import/-Export, Projektdateien
und automatische Wiederherstellung. Gedrücktes Mausrad verschiebt die ganze
Ansicht ohne Drehung; Mausradrollen zoomt, Rechtsziehen dreht. Bedienung: [LIES-MICH.txt](LIES-MICH.txt).

## Entwicklung

Node 22.16 oder neuer, danach im Mini-Quellenordner:

```sh
npm ci
npm run build
npm start
npm test
npm run test:desktop
```

Im ursprünglichen Entwicklungscheckout können die bereits installierten
Abhängigkeiten aus dem Elternordner verwendet werden. Alle eigenen Builds,
Tests und Einstellungen liegen ausschließlich unter `mini/`.

`npm run package` erstellt eine separate Windows-Ausgabe auf Laufwerk F,
standardmäßig `F:/Formnaro-Ausgaben/Mini-v0.7.0`. Ein anderer neuer Pfad kann
über `FORMNARO_MINI_OUTPUT` gesetzt werden. Vorher müssen die Desktopprüfungen
bestanden sein; existierende Ausgabeordner werden nicht überschrieben.

## Architektur

- Three.js 0.186.1 für die bei Änderungen gerenderte Ansicht.
- Manifold 3.5.4 in einem abbrechbaren Worker, begrenzter 16-MiB-Geometriecache.
- Electron 44.7.0, Renderer ohne Node-Zugriff, isolierte IPC-Dateifunktionen,
  blockierte Webanfragen im Renderer. Optionale Anbieteranfragen laufen getrennt
  im Hauptprozess; die lokale authentifizierte Schnittstelle ist anfangs aus.
- 17 ausgewählte Tabler-Symbole als lokale SVG-Dateien, ohne Bibliothekslaufzeit.
- Kein OCCT/BRep, kein STEP-Konverter, keine großen Schriftpakete.
- Sechs unverändert kopierte Netzmodule aus Formnaro, Nachweis unter
  `src/engine/origin.json`. Weitere Mini-Entwicklung ist vom Original getrennt.
- Rückgängig umfasst maximal 60 Einträge / ungefähr 24 MiB Textspeicher;
  ein einzelner größerer Projektstand darf enthalten bleiben.
- Platzierung berechnet die Auflage aus den tatsächlichen Netzpunkten und
  transformierten Flächennormalen; das Raster liegt in der Zielebene.
  Die Vorschau lebt ausschließlich in der Ansicht. Ein Drop oder bestätigtes
  Absetzen erzeugt einen transaktionalen Projektstand und einen Undo-Schritt.
- Shift-Klick hat Vorrang vor Transformationsgriffen. Leerer Hintergrund
  beginnt einen Auswahlrahmen; Ziehen auf einem Teil verschiebt die Auswahl
  auf konstanter Höhe. Esc/Pointer-Abbruch verwirft die flüchtige Bewegung.

Mini verspricht keine pauschalen Geschwindigkeitsfaktoren gegenüber CAD.
Netzdichte und Modelloperation bestimmen den Aufwand. Die Desktoplaufzeit
bleibt ein erheblicher Anteil der Programmgröße.

Eigener Anwendungscode: [LICENSE.txt](LICENSE.txt), Fremdbestandteile unter
`licenses/` und in `THIRD-PARTY-LICENSES.txt`.

Seit 0.4.1 rastet die Drehung innerhalb des blauen Kreises automatisch in
15°-Schritten ein. Außerhalb bleibt 1°-Feinsteuerung, Shift erzwingt 15°.


Robuster STL-Import: auch offene/beschaedigte Netze laden, sichere automatische Bereinigung ohne Kappen. Bis 256 MiB binaer/5 Millionen Dreiecke; ueber 500.000 optionale Arbeitskopie Ziel 250.000 mit Fehlerwert und Bestaetigung. Originaldatei behalten. Keine universelle Selbstschnitt-/Mass-/Druckpruefung. Details in NETZIMPORT.md.

## Lochgruppen und Maße beim Ziehen

Mehrere Lochformen lassen sich mit Gruppieren zu einer Lochgruppe verbinden.
Die Gruppe bleibt eine Lochform und kann später gemeinsam von einem Körper
abgezogen werden. Auflösen stellt die ursprünglichen Quellen wieder her.
Beim Ziehen an Ecken oder Höhengriff erscheinen Breite, Tiefe und Höhe in mm
mit Maßlinien direkt am Teil, wie in der großen Formnaro-Ausgabe.
Die Anzeige folgt der Vorschau und verschwindet bei Abschluss oder Abbruch.

Die Netz-Ausgabe heißt Formnaro Mini Mesh. Bestehende .fmini-Projekte,
Daten-Mini und Bibliothek bleiben kompatibel.
