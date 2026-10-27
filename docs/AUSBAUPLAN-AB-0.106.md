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

| Paket | Ergebnis und verbindliche Abnahme | Voraussetzungen | Status |
| --- | --- | --- | --- |
| 0 | Historische Pläne zuordnen; synthetische Foto-/CAD-/Netz-/Baugruppen-Prüfteile mit Ausgangsqualität, Laufzeit und Speicherbericht bereitstellen | 0.106 | Abgenommen: reproduzierbare native Prüfbasis |
| 1 | Originalbilder, Maße, Herkunft und Markierungen im Projekt wiederöffnen; ebene Rechteck-Homographie aus vier Ecken und zwei bekannten Maßen; Rückbezug auf Original; bestätigungspflichtige korrigierbare Kantenvorschläge; ungeeignete Referenzen/Unsicherheit sichtbar | 0 | Abgenommen in 0.107.0 |
| 2 | Geführte Vorder-/Seiten-/Draufsicht, gemeinsame Achsen/Maße, Widerspruchsdiagnose; CAD aus bestätigten Konturen/Querschnitten; jede Ansicht und native Funktionsmaße prüfen; verdeckte Geometrie offen/angenommen kennzeichnen | 1 | Abgenommen in 0.108.0 |
| 3 | Anklickbare Flächen/Kanten/Bohrungen/Skizzen/Merkmale im Chat mit gegenseitiger Hervorhebung; gezielte Änderung samt notwendiger Abhängigkeiten; mehrdeutige/verlorene Bezüge neu zuordnen | 2 | Abgenommen; in der veröffentlichten Ausgabe 0.110.0-r1 enthalten |
| 4 | FCStd-Merkmalsbaum mit Eigenschaften/Abhängigkeiten; Projektparameter-/Variantenbindung; getrennte Wege Skript-Neulauf und native Merkmaländerung/Neuberechnung; statische Shapes ausdrücklich ohne erfundene Historie | 3 | Abgenommen und als 0.110.0-r1 veröffentlicht: native Bearbeitung, getrennter Skript-Neulauf, globale Programmparameter/Varianten, Import und physische Exporte |
| 5 | Persistente Ziele, Annahmen, Schutz und Prüfungen; bester geprüfter Kandidat/Neustart; Fortsetzung revisions-/prüfsummengebunden; doppelte Fortsetzung und identische Fehler ohne Fortschritt stoppen; technische und generative Qualitätskriterien unterscheiden | 4 | Abgenommen und veröffentlicht als 0.111.0-r2: 524 Tests und 929 Prüfgruppen in 21 Läufen der gepackten Windows-EXE; zwei echte Prozessstarts, selbstständige Paketbasis, Fotos/Referenzen und physische Exporte geprüft |
| 6 | Editierbare B-Splines/Bézier; Mehrprofil-Loftoberfläche/zusammengesetzter Sweep; Orientierung/Verdrehung/Selbstschnitt prüfen; Schräge/Merkmalentfernung/Rotation/Helix über verfügbare FreeCAD-Version | 5 | Offen |
| 7 | Randkurvenflächen, Übergänge und Vernähen; Prägung/Vertiefung auf Ebenen/Zylindern; Anschlussqualität getrennt von Körpergültigkeit; andere gekrümmte Flächen erst nach Abnahme | 6 | Offen |
| 8 | Lokales Split/Collapse/Flip/Glätten gekrümmter Netze; Formkanten/Schutz/Öffnungsränder erhalten; Pinsel mit lokaler Verfeinerung; Formabweichung, Dreiecksqualität und Körperprüfung vergleichen | 7 | Offen |
| 9 | Gekrümmte Lochfüllung, zwei explizite Randringe verbinden; Selbstschnitte lokalisieren/gezielt ersetzen; Flächenextrusion/-versatz/Schrift/Relief; automatische Reparatur nur für belegte Fallgruppen | 8 | Offen |
| 10 | Flächenfarben/Materialgruppen und unterstützte Exporte; explizite Dichte für Masse/Schwerpunkt; Stückliste; gespeicherte Explosion mit Abstandsregler ohne Montageänderung; Cache an Geometrie/Einstellungen/Engine binden | 9 | Offen |
| 11 | FreeCAD SheetMetal, zunächst konstante Dicke: Grundblech/Biegung/Abwicklung, Radius/K-Faktor, DXF mit Biegelinien und erhaltenes Ausgangsmodell | 10 + separat verfügbares Modul | Später optional |
| 12 | Lokale FEM/CalculiX samt Vernetzung: linear-elastische Statik, explizites Material/Lager/Last; Verformung/Spannung/Randbedingungen und Netzvergleich; keine geratenen Druckwerkstoffe | 10 + separat verfügbare Solver | Später optional |
| 13 | Separater Hi3D-Versuch auf eingerichteter Linux-GPU: grobes Netz + Foto, protokollierte Normalisierung/Rücktransformation, getrennte Vergleichsvariante, kleinste Stufe messen; Lizenzen vor Auslieferung prüfen | 10 + GPU/Modelle/Lizenzen | Später optional |

Ein Paket wird erst nach eigener Abnahme als fertig markiert. Danach beginnt das
nächste. Geprüfter Quellstand und passende Windows-Ausgabe werden dokumentiert und
anschließend mit Änderungen auf GitHub veröffentlicht. Kein Status darf aus einer
bloßen Implementierung, einem erfolgreichen Build oder einer fremden Demo abgeleitet
werden. Optional bedeutet keine stillschweigende GPU-/Modell-/Cloudinstallation.

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

## Gemeinsame Abnahme

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

Paket 3 ist weiterhin in Arbeit. Native Merkmalsbezüge und Projektformat 21,
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
Paket 6–10 bleiben offen.

Die geprüfte Ausgabe ist als [Formnaro 0.111.0-r2](https://github.com/andyy909/Formnaro-cad/releases/tag/v0.111.0-r2) öffentlich verfügbar. Das Download-Repository enthält Beschreibung und Bilder; der Entwicklungsquellstand und seine Historie bleiben im privaten Repository.
