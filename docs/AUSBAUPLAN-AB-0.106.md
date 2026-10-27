# Formnaro-Ausbau ab 0.106 – verbindliche Paketfolge

Stand: 27.10.2026. Auftrag: „Neuer Formnaro-Ausbauplan: bessere Fotomodelle,
gezielte KI-Änderungen und erweiterte Modellierung“, vom Nutzer als
„Eingefügter Text(2).txt“ übergeben und zur Umsetzung freigegeben.
Die Paketnummern dieses Plans sind unabhängig von historischen Paketnummern.

Fotos und technische KI-Modellierung zuerst. Bestehende Quellen, Sperren,
Projektparameter, Bedingungen, Gelenke, Zeichnungen und .fnpack weiterverwenden.
Keine kostenpflichtigen Fremddienste voraussetzen. Stützstrukturen, Druckprofile
und die früher gestrichene Druckbarkeits-/Überhang-/Orientierungsprüfung bleiben
außerhalb dieses Plans. Keine persönliche Modell-/Profil-/Zugangsdaten übernehmen.

## Reihenfolge, Abhängigkeiten und Status

**Aktueller Gesamtstand (27.10.2026): Pakete 0–6 und Paket 7 sind abgeschlossen.**
Mit dem anschließenden Auftrag „bei 7 bitte weiter“ hat der Nutzer **Paket 7
vorgezogen**. Paket **6a: integrierte FreeCAD-Laufzeit ohne separate Installation**
bleibt als eigener offener Auslieferungsschritt erhalten. Paket 7 wurde mit der vorhandenen lokalen FreeCAD-Anbindung abgenommen.
Als nächster Auslieferungsschritt bleibt Paket 6a vorgesehen. Pakete
8–10 sind offen; 11–13 bleiben später optional. Die Paketnummern bleiben erhalten.

| Paket | Ergebnis und verbindliche Abnahme | Voraussetzungen | Status |
| --- | --- | --- | --- |
| 0 | Historische Pläne zuordnen; synthetische Foto-/CAD-/Netz-/Baugruppen-Prüfteile mit Ausgangsqualität, Laufzeit und Speicherbericht bereitstellen | 0.106 | Abgenommen: reproduzierbare native Prüfbasis |
| 1 | Originalbilder, Maße, Herkunft und Markierungen im Projekt wiederöffnen; ebene Rechteck-Homographie aus vier Ecken und zwei bekannten Maßen; Rückbezug auf Original; bestätigungspflichtige korrigierbare Kantenvorschläge; ungeeignete Referenzen/Unsicherheit sichtbar | 0 | Abgenommen in 0.107.0 |
| 2 | Geführte Vorder-/Seiten-/Draufsicht, gemeinsame Achsen/Maße, Widerspruchsdiagnose; CAD aus bestätigten Konturen/Querschnitten; jede Ansicht und native Funktionsmaße prüfen; verdeckte Geometrie offen/angenommen kennzeichnen | 1 | Abgenommen in 0.108.0 |
| 3 | Anklickbare Flächen/Kanten/Bohrungen/Skizzen/Merkmale im Chat mit gegenseitiger Hervorhebung; gezielte Änderung samt notwendiger Abhängigkeiten; mehrdeutige/verlorene Bezüge neu zuordnen | 2 | Abgenommen; in der veröffentlichten Ausgabe 0.110.0-r1 enthalten |
| 4 | FCStd-Merkmalsbaum mit Eigenschaften/Abhängigkeiten; Projektparameter-/Variantenbindung; getrennte Wege Skript-Neulauf und native Merkmaländerung/Neuberechnung; statische Shapes ausdrücklich ohne erfundene Historie | 3 | Abgenommen und als 0.110.0-r1 veröffentlicht: native Bearbeitung, getrennter Skript-Neulauf, globale Programmparameter/Varianten, Import und physische Exporte |
| 5 | Persistente Ziele, Annahmen, Schutz und Prüfungen; bester geprüfter Kandidat/Neustart; Fortsetzung revisions-/prüfsummengebunden; doppelte Fortsetzung und identische Fehler ohne Fortschritt stoppen; technische und generative Qualitätskriterien unterscheiden | 4 | Abgenommen und veröffentlicht als 0.111.0-r2: 524 Tests und 929 Prüfgruppen in 21 Läufen der gepackten Windows-EXE; zwei echte Prozessstarts, selbstständige Paketbasis, Fotos/Referenzen und physische Exporte geprüft |
| 6 | Editierbare B-Splines/Bézier; Mehrprofil-Loftoberfläche/zusammengesetzter Sweep; Orientierung/Verdrehung/Selbstschnitt prüfen; Schräge/Merkmalentfernung/Rotation/Helix über verfügbare FreeCAD-Version | 5 | Abgeschlossen: 0.112.0-r2, 627 Tests am eingefrorenen Quellstand und 962 Prüfgruppen in 22 Läufen der gepackten Windows-Anwendung bestanden; neue Kurven, Loft/Sweep und FreeCAD-Werkzeuge einschließlich Vorschau/Undo, FNPACK24/STEP und vier Bedienmodi abgenommen. Zunächst private Bereitstellung |
| 6a | Benötigte FreeCAD-Komponenten als festen Bestandteil von Formnaro ausliefern: ein Download, ein Programmstart, keine separate FreeCAD-Installation; vorhandene Python-, FCStd- und Modellierfunktionen mit der integrierten Laufzeit prüfen | 6 | Offen; auf Nutzerwunsch Paket 7 vorgezogen |
| 7 | Randkurvenflächen, Übergänge und Vernähen; Prägung/Vertiefung auf Ebenen/Zylindern; Anschlussqualität getrennt von Körpergültigkeit; andere gekrümmte Flächen erst nach Abnahme | 6; integrierte Auslieferung folgt mit 6a | Abgeschlossen: 0.113.0-r3, 640 Tests und 979 Prüfgruppen in 23 Windows-Läufen; G0-Anschlussdiagnose, geschlossenes Vernähen und begrenzte Ebenen-/Zylinderprägung abgenommen. Private Bereitstellung |
| 8 | Lokales Split/Collapse/Flip/Glätten gekrümmter Netze; Formkanten/Schutz/Öffnungsränder erhalten; Pinsel mit lokaler Verfeinerung; Formabweichung, Dreiecksqualität und Körperprüfung vergleichen | 7 | Offen |
| 9 | Gekrümmte Lochfüllung, zwei explizite Randringe verbinden; Selbstschnitte lokalisieren/gezielt ersetzen; Flächenextrusion/-versatz/Schrift/Relief; automatische Reparatur nur für belegte Fallgruppen | 8 | Offen |
| 10 | Flächenfarben/Materialgruppen und unterstützte Exporte; explizite Dichte für Masse/Schwerpunkt; Stückliste; gespeicherte Explosion mit Abstandsregler ohne Montageänderung; Cache an Geometrie/Einstellungen/Engine binden | 9 | Offen |
| 11 | FreeCAD SheetMetal, zunächst konstante Dicke: Grundblech/Biegung/Abwicklung, Radius/K-Faktor, DXF mit Biegelinien und erhaltenes Ausgangsmodell | 10 + separat verfügbares Modul | Später optional |
| 12 | Lokale FEM/CalculiX samt Vernetzung: linear-elastische Statik, explizites Material/Lager/Last; Verformung/Spannung/Randbedingungen und Netzvergleich; keine geratenen Druckwerkstoffe | 10 + separat verfügbare Solver | Später optional |
| 13 | Separater Hi3D-Versuch auf eingerichteter Linux-GPU: grobes Netz + Foto, protokollierte Normalisierung/Rücktransformation, getrennte Vergleichsvariante, kleinste Stufe messen; Lizenzen vor Auslieferung prüfen | 10 + GPU/Modelle/Lizenzen | Später optional |

Ein Paket wird erst nach eigener gezielter Abnahme als fertig markiert. Danach beginnt das
nächste. Das verlangt keine erneute vollständige Gesamtprüfung nach jedem Punkt
oder jeder Versionsnummer. Geprüfter Quellstand und passende Windows-Ausgabe werden dokumentiert und
anschließend zuerst im privaten Repository bereitgestellt. Die öffentliche Kopie
wird nur auf gesonderten ausdrücklichen Nutzerauftrag aktualisiert. Kein Status darf aus einer
bloßen Implementierung, einem erfolgreichen Build oder einer fremden Demo abgeleitet
werden. Optional bedeutet keine stillschweigende GPU-/Modell-/Cloudinstallation.

## Paket 6a: FreeCAD-Funktionen fest in Formnaro integrieren

Nutzerentscheidung vom 27.10.2026: Die benötigten FreeCAD-Bestandteile werden
zusammen mit Formnaro ausgeliefert. Nutzer laden nur Formnaro herunter, starten
`Formnaro.exe` und bedienen alle Funktionen in dessen Oberfläche. Eine separate
FreeCAD-Installation, ein zweiter Download oder eine manuelle Pfadeinrichtung
sind für die bisherigen FreeCAD-Funktionen nicht mehr erforderlich. Paket 6
bleibt abgeschlossen; die Integration ist ein eigenes, noch offenes Paket.

### Umsetzung

- Eine fest versionierte lokale CAD-Laufzeit samt benötigten FreeCAD-Modulen,
  passender Python-Laufzeit und Bibliotheken in den Formnaro-Programmordner
  aufnehmen. Den notwendigen Umfang anhand der bisherigen Python-, Dokument-
  und Modellierfunktionen bestimmen; Komponenten erst nach belegter Prüfung
  weglassen. GUI-abhängige Berechnungen müssen weiterhin unsichtbar funktionieren.
- Die interne Laufzeit automatisch und bevorzugt verwenden. Die bisherigen
  Funktionen müssen auch ohne installierte FreeCAD-Ausgabe funktionieren;
  eine eventuell vorhandene Installation darf die integrierte Version nicht
  unbemerkt ersetzen. Kein Nachladen beim Programmstart voraussetzen.
- Bestehende KI-Werkzeuge, gespeicherte Python-Programme und Helfermodule,
  FCStd-Import/-Export, native Merkmalsbearbeitung, Parameter/Varianten sowie
  Schräge, Merkmalentfernung, Rotation und Helix erhalten. Die vorhandene
  Prozessisolierung, Vorschau, Revisionsprüfung und Undo/Redo weiterverwenden.
- Herkunft, Versionen, Prüfsummen sowie Lizenz- und erforderliche Quellhinweise
  der mitgelieferten Komponenten in die Paketierung aufnehmen. Tatsächliche
  Download-/Ordnergröße, Startzeit und Berechnungszeiten messen.
- Nach erfolgreicher Integration Einstellungen, Hilfetexte, Anleitungen und
  Auslieferungshinweise auf die integrierte Laufzeit umstellen. Den bisherigen
  Installationshinweis nicht vor der Abnahme aus den Voraussetzungen entfernen.

Interne Rechenprozesse dürfen Bestandteil von Formnaro bleiben. Dieses Paket
verlangt weder eine einzige ausführbare Datei noch das Nachprogrammieren der
gesamten FreeCAD-API. Ziel ist eine vollständige Formnaro-Auslieferung ohne
zusätzlich vom Nutzer zu beschaffendes oder zu bedienendes FreeCAD-Programm.
Die optionalen Zusatzmodule und Solver aus Paket 11/12 werden dadurch nicht
automatisch Bestandteil des Grundpakets.

### Verbindliche Abnahme

- Die tatsächlich gepackte Windows-Ausgabe auf einem sauberen Windows-System
  ohne separate FreeCAD- oder Python-Installation und ohne Laufzeitnachladen
  prüfen; Entpacken und Start über `Formnaro.exe` genügen. Auch ein verschobener
  Programmordner und ein Pfad mit Leerzeichen/Umlauten müssen funktionieren.
- Vorhandene FreeCAD-/Python-/Dokumentprüfungen einschließlich unsichtbarer
  GUI-Berechnungen mit der mitgelieferten Laufzeit ausführen. Alte FCStd-Quellen
  und archivierte Helfer wiederöffnen, Parameter und native Merkmale ändern,
  Vorschau/Übernahme/Undo prüfen sowie STEP/STL/FCStd und .fnpack unabhängig
  zurücklesen. Die gemeinsame Abnahme in allen vier Bedienmodi bleibt verbindlich.
- Zusätzlich bei vorhandener externer FreeCAD-Installation die eindeutige Wahl
  der integrierten Version nachweisen. Fehlende/beschädigte Laufzeitbestandteile,
  Abbruch und Neustart müssen verständlich und ohne Modellverlust behandelt werden.
- Laufzeitmanifest und gepackte Dateien auf Integrität prüfen; bestehende
  Nutzerprofile, Modelle und frühere Programmausgaben unverändert erhalten.
  Erst nach vollständiger Abnahme Paket 6a abschließen und die separate
  Installationsvoraussetzung entfernen. Paket 7 wurde durch den Folgeauftrag
  des Nutzers vorgezogen; dessen Funktionsabnahme ersetzt die Laufzeitabnahme nicht.

## Vorhandene Abnahmebelege

Paket 3 hat eine lokale technische Testabnahme mit 321 Tests und 785 Prüfungen an
der gepackten Windows-EXE, darunter 46 Merkmalsprüfungen. Zehn Merkmalsaufnahmen
wurden visuell geprüft; 140 eindeutig zugeordnete Dateien älterer Ausgaben sind
unverändert. Der historische Ordner
`output/KI-Merkmale-Testkandidat-v0.109.0-r3` bleibt mit seinen ursprünglichen
Testabnahmebelegen erhalten. Seine Funktionen sind in 0.110.0-r1 enthalten.

Paket 4 hat die lokale technische Abnahme als 0.110.0-r1-Testkandidat bestanden:
467 Tests und 856 Prüfgruppen in 17 Läufen der gepackten Windows-EXE, darunter
71 FreeCAD-Dokumentprüfungen und 11 physische Speicher-/Exportprüfungen.
20 Aufnahmen wurden visuell geprüft. 142 geschützte Dateien älterer Ausgaben
sind unverändert. Der getrennte lokale Ordner
`output/FreeCAD-Parameter-Testkandidat-v0.110.0-r1` enthält `Testabnahme.json`
und die ursprüngliche Kandidatenkennzeichnung. Am 27.10.2026 hat der Nutzer
ausdrücklich entschieden, keine Codesignatur einzurichten und die technisch
geprüfte Ausgabe ohne Signatur zu veröffentlichen. Die Signieridentität ist keine
Freigabevoraussetzung mehr; Downloadseite und Versionshinweise erhalten keinen
Signaturhinweis. Die ursprünglichen technischen Prüfbelege bleiben unverändert.
Die lokale Entwicklung von Paket 5 kann auf diesem technisch geprüften Stand
fortgesetzt werden.

## Verbindliche Prüfstrategie: gezielt je Punkt, große Gesamtprüfung am Ende

Nutzerentscheidung vom 27.10.2026: **Während der Umsetzung erhält jeder Punkt
gezielte Tests und Prüfungen. Am Ende der beauftragten Punkte folgt eine große
allgemeine Gesamtprüfung.** Diese Regel ersetzt für die weitere Arbeit die
bisherige routinemäßige Wiederholung aller Suiten nach jedem Einzelpunkt.
Historische Abnahmen und ihre tatsächlichen Prüfumfänge bleiben unverändert.

### Während der Umsetzung je Punkt

- Vorab festlegen, welches Verhalten geändert wird und welche direkten
  Abhängigkeiten betroffen sind. Genau diese Funktionen, Schnittstellen,
  Fehlerfälle und gegebenenfalls betroffenen Exporte prüfen.
- Den Umfang nach dem Risiko wählen: Text-/Darstellungsänderungen benötigen
  passende Sicht- und Bedienkontrollen; Speichern, Autosicherung, Start,
  Dateiformate und CAD-Kern benötigen die einschlägigen Integritäts- und
  Regressionstests. Diese kritischen Bereiche rechtfertigen eine breitere
  gezielte Auswahl, aber nicht automatisch sämtliche fachfremden Suiten.
- In der tatsächlichen Windows-Anwendung prüfen, soweit der Punkt deren
  Bedienung, Paketierung oder native Berechnung verändert. Nicht nach jeder
  kleinen Änderung alle Bedienmodi, Schriftfamilien, Exporte und früheren
  Funktionen erneut vollständig durchlaufen.
- Ergebnis, geprüften Quell-/Paketstand und verbleibende Grenzen je Punkt
  protokollieren. Bereits passende unveränderte Prüfbelege weiterverwenden;
  veränderte oder von einem Fehler entwertete Belege gezielt erneuern.
- Bei einem Fehler diesen beheben und den betroffenen Bereich erneut prüfen.
  Eine vollständige Wiederholung nur dann, wenn die Änderung oder der Befund
  tatsächlich die übrige Abnahme betrifft. Reine Versionsänderungen sind
  kein eigener Grund für eine Vollprüfung.

### Große allgemeine Prüfung am Ende

Nach Abschluss der verbindlich beauftragten Punkte einmal den gesamten
zusammengeführten Stand einschließlich der früheren Funktionen prüfen. Für
diesen Ausbau bedeutet das die verpflichtende Folge bis einschließlich
Paket 10; optionale Pakete 11–13 gehören nur bei gesonderter Beauftragung dazu.
Auch eine separat beauftragte größere Wartungsrunde kann mit einer solchen
gemeinsamen Abschlussprüfung enden, wie die Fehlerkorrekturen 0.113.1.

Die Abschlussprüfung umfasst die gemeinsamen Anforderungen unten, relevante
automatisierte Regressionen, native Geometrie und physische Dateiexporte,
Speichern/Wiederöffnen/Autosicherung, Bedienung und Sichtkontrolle sowie
Integrität und Start der tatsächlich gepackten Windows-Ausgabe. Dabei auch
das Zusammenspiel der umgesetzten Punkte prüfen. Erst nach erfolgreicher
Gesamtprüfung den gesamten beauftragten Ausbau als abschließend geprüft
kennzeichnen. Die Abschlussprüfung wird nicht nach jedem davorliegenden
Einzelpunkt vorgezogen.

## Gemeinsame Anforderungen an die Abschlussprüfung

Die Wartungsrunde 0.113.1-r2 ist am 27.10.2026 lokal abgeschlossen: 687
bestandene Basistests, 82 gezielte Nachprüfungen der letzten Änderungen und
987 Prüfgruppen in 24 Läufen der neuen Windows-EXE. Die Weiterverwendung der
unveränderten Basis ist per Dateihash dokumentiert; keine bloße Übernahme alter
EXE-Prüfungen. Diese Wartung ändert keine Paketnummer und erledigt weder Paket
6a noch Pakete 8–10. Die folgende Liste bleibt Maßstab für den späteren
gemeinsamen Abschluss der beauftragten Ausbaufolge.

- Oberfläche in allen vier Bedienmodi, kleine/große Fenster und Hell/Dunkel.
- Projekt speichern/wiederöffnen, Autosave, Undo/Redo und betroffene Exporte.
- Vorschau und Abbruch verändern keine bestätigte Geometrie. Übernahme ein Undo.
- Unbeteiligte Teile, Quellen und Sperren unverändert; Revision vor Apply prüfen.
- Fotos frontal/schräg, falsche Referenzen, widersprüchliche Ansichten und
  zu geringe Auflösung; Bildunsicherheit getrennt von nativer Toleranz.
- Bohrung/Gehäusewand/einzelnes Merkmal als gezielte Änderungsfälle.
- Gekrümmte Öffnungen, dünne Wände, Schutzbereiche, Selbstschnitte; Stichproben
  als solche kennzeichnen, nicht als vollständigen Genauigkeitsbeweis.
- Abbruch, Neustart, veraltete Revision, fehlende Engine, erschöpftes Budget,
  doppelte Fortsetzung. Alle eingerichteten KI-Anbieter nutzen gleiche Werkzeuge.
- Wirklich gepackte Windows-Anwendung, eingefrorener Quellstand, Datei-/ASAR-
  Integrität und unveränderte frühere Ausgaben. Sichtkontrolle vor Freigabe.
- Keine externen KI-Anfragen für synthetische Transporttests notwendig.

## Speicherung und Schnittstellen

Bestehende Controller-Vorschauen und Übernahmen erweitern, keinen zweiten
Geometrie-/Undo-Stack einführen. Fotos versioniert mit Originalprüfsumme,
Ansichtszuordnung, Ebenentransformation und Messbezügen führen. FreeCAD-Quellen
um Katalog und Parameterbindungen ergänzen; Altquellen bleiben lesbar. Native
Dokumentänderung an Revision, Objekt und unterstützte Eigenschaft binden.
Auftragszwischenstände mit Zielprüfungen, Referenzprüfsummen und Status lokal
speichern. Neue Inhalte heben Projektformate nur bei tatsächlicher Verwendung an.
Rechnerkonfiguration, Schlüssel und persönliche Profile gehören nicht ins Projekt.

## Herkunft und historische Pläne

Die folgende Forschung aus dem übergebenen Auftrag ist Anregung für eigenständige
Funktionen; daraus folgt weder eine Abhängigkeit noch ein Qualitätsversprechen:

- [FreeCAD Sweep](https://github.com/FreeCAD/FreeCAD-documentation/blob/main/wiki/PartDesign_AdditivePipe.md)
  und [Surface](https://github.com/FreeCAD/FreeCAD-documentation/blob/main/wiki/Surface_Workbench.md).
- [Zoo-Fähigkeiten](https://zoo.dev/docs/faq): ausgewählter Geometriekontext und Messung.
- [CADAM-Parameter](https://github.com/Adam-CAD/CADAM/blob/master/shared/parseParameters.ts)
  und [Adam-Änderungen](https://adam.new/changelog): Parameter, Wiederaufnahme, Stillstandserkennung.
- [SheetMetal](https://github.com/shaise/FreeCAD_SheetMetal),
  [FreeCAD FEM](https://blog.freecad.org/2025/09/09/what-is-new-in-fem-for-freecad-1-1/).
- [Hi3D-Pipeline](https://github.com/hi3d-official/Hi3Dv1.0/blob/main/docs/pipeline.md),
  [Installation](https://github.com/hi3d-official/Hi3Dv1.0),
  [Lizenz](https://github.com/hi3d-official/Hi3Dv1.0/blob/main/LICENSE).
  Der dort genannte getestete H20-Aufbau mit 96 GB ist weder Mindestanforderung
  noch Zusage für eine vorhandene 6-GB-GPU. Separate Modelllizenzen prüfen.

Historisch abgeschlossen: [Netz/CAD-Gesamtplan](FORMNARO-GESAMTPLAN.md),
[Pakete 1–26](FORMNARO-UMSETZUNGSSTAND.md),
[CAD-Ausbau 1–7](CAD-AUSBAUPLAN.md) und
[Skizzen-/Mesh-Ausbau](SKIZZEN-UND-MESH-AUSBAU.md).
Diese Texte bleiben Entwicklungsgeschichte. Deren alte „offen“-Einträge sind
keine zusätzliche neue Beauftragung; Paket 27 bleibt gestrichen.

## Nachweisstand 26.10.2026

Die reproduzierbaren Prüfteile liegen in `tests/expansion-fixtures.mjs` (Foto und
offenes Netz) sowie `tests/expansion-native-fixtures.mjs` (echte OCCT-Bohrplatten).
`npm run test:expansion` erzeugt `.ocad`, STEP, PNG, Netz und Sollwerte mit
SHA-256-Manifest unter `work/expansion-fixtures` und den Bericht
`work/expansion-baseline.json`. Dieser lokale Ordner ist ignoriert.
Die Native-Abnahme prüft 40 × 20 × 4 mm, Ø6 mm und das analytische Volumen
3200 − 36π mm³ sowie zwei getrennte Körper und das doppelte Volumen nach
STEP-Wiederimport. Die Netzdiagnose bestätigt fünf offene Randkanten und einen
Zusammenhang, ohne Reparaturversprechen. Der Fotoablauf prüft die Ebenenrückabbildung,
Rastergröße und ausdrückliche Konturbestätigung. Laufzeitmediane, JS-Heap und
Prozess-RSS sind Messwerte dieser Maschine; Speicherstichproben sind keine Peaks.
Paket 0 ist damit als Prüfbasis abgenommen.

Paket 1 bietet vierpunktige Rechteckkalibrierung, rückführbare Originalpixel,
lokale unbestätigte Konturvorschläge und projektgebundene Fotoreferenzen (Format 19).
Die native Electron-Oberfläche läuft inzwischen. Der schräge Foto-KI-Ablauf
bestand 60 Prüfgruppen mit beiden simulierten Anbieterprotokollen: lokale
Messung, Fehlentwurf, Korrektur bei unveränderten Referenzen, Bildvergleich,
native CAD-Geometrie, Apply und exaktes Undo. 41 gezielte Daten-/Speicherprüfungen
bestanden. Die vollständige Portable-Abnahme von 0.107.0-r3 ist abgeschlossen: 276 Tests am
eingefrorenen Quellstand, 664 Prüfgruppen an der echten Windows-EXE (31 für
Projektfotos/Perspektivoberfläche, 56 frontal und 64 schräger Foto-KI-Ablauf),
16 simulierte Foto-Anbieteraufrufe mit vier tatsächlich erreichten Bildprüfrunden.
Kein Rendererfehler oder externer Testaufruf; 136 geschützte ältere EXE-/ASAR-Dateien
unverändert. Original/entzerrte Ebene, kleine/dunkle Fenster, Vorschau und Overlay
visuell geprüft. Der Rastervergleich nutzt ein begrenztes, von Pixel-/Millimeter-
einheiten unabhängiges Raster. Paket 1 ist abgenommen; als Nächstes Paket 2.

Historischer Zwischenstand von Paket 3 vor der oben dokumentierten Abnahme:
Native Merkmalsbezüge und Projektformat 21,
gezielte numerische Befehle, Zuordnungsdiagnose und Chat-/Modellhervorhebung
liegen als geprüfter Quellstand vor. 41 fokussierte Tests sowie 34 tatsächliche
Electron-Prüfgruppen mit simulierten Anbietern bestanden. Die Änderung nur einer
Bohrung von 4 auf 6 mm, der Erhalt der zweiten Bohrung und unabhängiger Quellen
sowie Undo wurden nativ geprüft. Der erweiterte skalare Folgepfad besteht jetzt
72 gezielte Tests und 39 tatsächliche Electron-Prüfgruppen: gemeinsame
Formelparameter, aktive Varianten, notwendige Konturketten, Zeichnungsbemaßung
und ausdrückliche Übernahme der Folgeänderungen bei exaktem Erhalt unabhängiger
Zweige. Der neue Strukturpfad erhält inzwischen auch Parameter-/Konturquellen,
Variantenstatus, Gelenkrahmen, Zeichnungen und Arbeitsebenen bei nativen Flächen-
und Kantenoperationen. Verlorene Oberflächenmarkierungen werden mit erhaltenen
Punkten und Notizen zur Neuzuordnung angezeigt. 120 gezielte Tests sowie
46 tatsächliche Electron-Prüfgruppen bestanden. Native CAD-Referenzen und
vermessene Netzprofile behalten ihre getrennten Geometriebeweise; die expliziten
Netzflächenarbeiten der Pakete 8/9 bleiben im Gesamtauftrag. Die vollständige
Portable-Abnahme steht aus; dieser Quellstand ist keine Paketfreigabe.


## Paket 5: Windows-Abnahme 0.111.0-r2

524 Tests am eingefrorenen Quellstand und 929 Prüfgruppen in 21 Läufen der
gepackten Windows-Anwendung bestanden. Darunter 13 Fortschritts-, 19 Auftrags-UI-
und 41 Neustartprüfungen über zwei echte Hauptprozesse. Die ursprüngliche
Paketdatei wird zwischen den Prozessstarts entfernt; die gesicherte Basis,
Fotokalibrierung, Analyseprogramme, Messbefunde und native Merkmalsbezüge bleiben
erhalten. STEP/STL werden unabhängig vermessen, FCStd bleibt bytegenau.
Sieben Auftragsaufnahmen und vier ergänzende Regressionsaufnahmen wurden
visuell geprüft. 144 geschützte Dateien älterer Ausgaben sind unverändert.
`Freigabe.json` bestätigt die vollständige technische Abnahme. Anbieterantworten
sind in diesen Prüfungen simuliert; keine neue Aussage zur Cloud-Modellqualität.
Zum damaligen Paket-5-Abschluss blieben Pakete 6–10 offen; der aktuelle
Gesamtstand und das neue Paket 6a stehen am Anfang dieses Plans.

Die geprüfte Ausgabe ist als [Formnaro 0.111.0-r2](https://github.com/andyy909/Formnaro-Downloads/releases/tag/v0.111.0-r2) öffentlich verfügbar. Das Download-Repository enthält Beschreibung und Bilder; der Entwicklungsquellstand und seine Historie bleiben im privaten Repository.

## Paket 6: Windows-Abnahme 0.112.0-r2

627 Tests am eingefrorenen Quellstand und 962 Prüfgruppen in 22 Läufen der gepackten Windows-Anwendung bestanden. Die 21 bisherigen Suiten bleiben enthalten; die neue CAD-Suite umfasst 33 tatsächliche Desktop-Prüfgruppen. Native Bézier-/B-Spline-Konstruktionen, Reihenfolge und Orientierung von Lofts, zusammengesetzte Sweeps, echte FreeCAD-Merkmale und archivierte Helfer sind geprüft. Quellen, Undo/Redo, Wiederöffnen, physisches FNPACK24 und native STEP-Ausgabe sind abgedeckt. Zehn neue Aufnahmen wurden am gepackten Programm visuell geprüft. Alle 146 geschützten Dateien älterer Ausgaben bleiben unverändert. Keine echte Cloud-Inferenz. Details: CAD-KURVEN.md und Freigabe.json der neuen Ausgabe. Neue Aktualisierungen werden zuerst privat bereitgestellt; Paket 7–10 bleiben offen.


## Paket 7: Windows-Abnahme 0.113.0-r3

640 Tests am eingefrorenen Quellstand und 979 Prüfgruppen in 23 Läufen der gepackten Windows-Anwendung bestanden, darunter 17 Flächenprüfgruppen. Die bisherigen 22 Suiten bleiben erhalten. Alle 148 geschützten Dateien älterer Ausgaben sind unverändert. Acht aktuelle Flächenaufnahmen wurden visuell geprüft. Keine echte Cloud-Inferenz.

Vier kubische Bézier-Ränder bilden eine exakte bikubische Coons-Fläche mit gerichteter Materialhöhe. G0-Übergänge melden Randabstände und Normalenwinkel getrennt von Körpergültigkeit. Vollständige Hüllen werden mit Freikantendiagnose vernäht. Prägung/Vertiefung unterstützt Polygonkonturen mit Öffnungen auf Ebenen und orthogonale UV-Konturen auf äußeren Kreiszylindern; schräge UV-Kanten, Bohrungsflächen und andere gekrümmte Flächen bleiben ausgeschlossen. STEP-Rücklesen, archivierte FeaturePython-Helfer, native Tiefen-/Höhenänderung, physisches FNPACK, Vorschau/Abbruch/Undo und unbeteiligte Quellen sind geprüft.

Die explizit vorgezogene Arbeit an Paket 7 ist abgeschlossen. Paket 6a bleibt als Auslieferungsintegration offen; bis zu dessen Abnahme ist eine zusätzliche lokale FreeCAD-Installation erforderlich. Pakete 8–10 bleiben offen. Bedienung und Grenzen: [CAD-FLAECHEN.md](CAD-FLAECHEN.md). Neue Quellen und Ausgaben werden zuerst privat bereitgestellt.

Private Bereitstellung abgeschlossen: [Formnaro 0.113.0-r3](https://github.com/andyy909/Formnaro/releases/tag/v0.113.0-r3), Quellstand `1e094a028ff9c2fd6251d02f59f649b14ca7db03`. Windows-ZIP, Prüfbericht und Prüfsummen sind hochgeladen; Größen und GitHub-SHA-256 stimmen mit den lokalen Dateien überein. Die öffentliche Kopie wurde nicht aktualisiert. Paket 6a bleibt offen.
