# Technischer Projektkontext

Verbindliche Nutzerentscheidung vom 27.10.2026 zur weiteren Prüfung:
Je Planpunkt gezielte Tests der Änderung und ihrer direkten Abhängigkeiten;
keine routinemäßige Vollprüfung nach jedem Punkt oder jeder Versionsnummer.
Am Ende der beauftragten Folge eine große allgemeine Prüfung des gesamten
zusammengeführten Stands. Fehlernachprüfungen nach tatsächlicher Betroffenheit
auswählen. Details im [aktuellen Ausbauplan](AUSBAUPLAN-AB-0.106.md).

Wartung 0.113.1-r2 vom 27.10.2026 lokal vollständig abgenommen: Die bestätigten
Fehlerpfade der Nachprüfung wurden korrigiert. Umfang und Schutzregeln stehen
in [FEHLERKORREKTUREN-0.113.1.md](FEHLERKORREKTUREN-0.113.1.md), aktuelle
Windows-Bauvorbereitung und Standardbefehle in [BUILD.md](BUILD.md).
687 Tests der eingefrorenen breiten Basis bestanden. Nach der letzten Sandbox-/
CSP-Integration wurden 82 gezielte Nachprüfungen am endgültigen Quellstand
ausgeführt; unveränderte Bereiche sind per Hash an die Basis gebunden. Zusätzlich
987 Prüfgruppen in 24 Läufen der tatsächlichen neuen Windows-EXE bestanden,
darunter 8 Start-/Theme-/Sandbox-Prüfgruppen. Alle 23 vorherigen EXE-Suiten
enthalten, 9 Paketbilder visuell geprüft, 150 alte Programmdateien unverändert.
Quellvergleich: 2135 Dateien, 2133 bytegleich, package/version nur formatiert;
spätere Plan-/Abnahmedokumentation separat erfasst. Keine Cloud-Modellaufrufe.
Ausgabe: output/Fehlerkorrekturen-v0.113.1-r2/Formnaro-win32-x64/Formnaro.exe.
Freigabe.json und Pruefbericht.txt liegen daneben. Nur lokale Bereitstellung;
kein neuer GitHub-Upload oder Push in dieser Wartungsrunde. 0.113.0-r3 bleibt
die letzte private Online-Veröffentlichung. Paket 6a und Pakete 8–10 bleiben offen.

## Historischer Stand vor der Wartung

Stand: Formnaro 0.113.0-r3 – Flächen und Prägungen am 27.10.2026 technisch abgenommen; Bereitstellung zunächst im privaten Projekt.
Nachprüfung vom 27.10.2026 anhand eines externen Quellcodeprüfberichts:
Auch im hashbestätigten 0.113.0-r3-Paket bestehen Fehlerpfade bei markerlosen
Datenordnern (z. B. durch vorzeitiges Fehlerlogging) und beim initialen
Autosave-Schreibfehler; außerdem unvollständige Theme-/Systemanbindung und ein
Konfliktfenster beim Speichern von .ocad-Dateien. Noch keine Reparatur vorgenommen.
Windows-Rename-Retry im allgemeinen Store ist dagegen bereits enthalten.
Vier zuvor veraltete Projektformat-Tests bestehen nun mit Format24; lokale
Font-/Lizenzpins stimmen. Katalogtest (speech) und Netz-Anzeigetest (index=null)
schlagen weiterhin fehl. Neuer gezielter Lauf: 39 Tests, 37 bestanden, 2 rot.
Die bisherigen 640 Release-Tests sind eine explizite Teilmenge und enthalten
diese beiden roten Testdateien nicht; die 23 vorhandenen EXE-Abnahmen wurden
bei dieser Nachprüfung nicht komplett erneut ausgeführt. Alte Standardbefehle
package/test:cad-release sind weiterhin auf 0.12.0 begrenzt; aktueller P7-Bau
verwendet package-surfaces und benötigt lokale historische Artefakte.
Lokale Detailbelege: work/audit-github-v113/Pruefbericht.txt und evidence.json.

Aktueller Ausbauplan: Pakete 0–6 abgeschlossen. Auf den Folgeauftrag „bei 7 bitte
weiter“ wurde Paket 7 vorgezogen und ist nun abgeschlossen. Paket 6a zur
integrierten FreeCAD-Laufzeit bleibt separat offen, ebenso Pakete 8–10.
Verbindlicher Umfang und Abnahme: [Ausbauplan ab 0.106](AUSBAUPLAN-AB-0.106.md).

Planergänzung vom 27.10.2026: Paket 6a liefert die benötigten FreeCAD-Komponenten
und Abhängigkeiten versioniert mit Formnaro aus. Ziel sind ein Download, ein
Programmstart und die vorhandene Formnaro-Oberfläche, ohne separate Installation
oder Laufzeitnachladen. Die integrierte Version muss automatisch gewählt werden;
bisherige Python-/FCStd-/Merkmalfunktionen und Prozessisolierung bleiben erhalten.
Abnahme an der gepackten Windows-Ausgabe ohne externes FreeCAD/Python, einschließlich
alter Quellen, Exporte, Undo/Redo, Abbruch und Laufzeitintegrität. Der genaue
Komponentenumfang wird durch Prüfung bestimmt. Paket 6a ist geplant, noch nicht
umgesetzt oder abgenommen. Der anschließende Nutzerauftrag zieht Paket 7 vor;
bis 6a wird dafür die vorhandene lokale FreeCAD-Anbindung verwendet. Die geprüfte
Ausgabe 0.112.0-r2 bleibt unverändert. Weitere Aktualisierungen zuerst privat.

Die lokale Entwicklungshistorie unter `work/kontext.txt` bleibt auf dem
jeweiligen Rechner; diese Datei enthält den gemeinsamen technischen Stand.

## CAD-Ausbau und Zeichnungsblätter 0.82.0

Verbindlicher Gesamtumfang in CAD-AUSBAUPLAN.md, sieben sequenzielle Pakete.
Paket1 ergänzt technische Zeichnungen; Pakete2–7 beginnen erst nach eigener
portabler Source-/EXE-/Datei-/Leistungsabnahme von Paket1.

Projektfeld drawings mit strengem Zeichnungsschema1 benötigt Projekt-/
Bibliotheksformat12. Alte Formate5–11 unverändert lesbar. Native Projektion
im vorhandenen CAD-Worker liefert gemeinsame 2D-Kurven für Papier-SVG/PDF
und Modell-DXF1:1mm. Neue Module cad-drawing-native/data/export/ui/automation,
backend/drawing-pdf.cjs. Projektionen nur auf ausdrückliche Aktualisierung;
Layout/Zoom nutzt Kurven weiter. Blattänderungen besitzen einen geprüften
metadatenbezogenen Controller-Vorschauweg ohne Geometrieneubau. Alle anderen
Projektfelder müssen dabei exakt erhalten bleiben. Übernahme ein Undo.

Quellensignaturen berücksichtigen native Quellen und vollständige Platzierung,
keine Farben/Namen. Geometriebezogene Kurvenkennungen verhindern automatisches
Umdeuten verlorener Maße. Export verweigert veraltete Quellen und verlorene
Maßbezüge; unvollständige Blätter bleiben speicherbar. Bibliotheksauswahl nimmt
nur vollständige quellengebundene Blätter mit und ordnet beim Einsetzen alle
Dokument-/Quellenkennungen um. Lokale KI führt dieselben Blattvorschauen aus.

Anleitung TECHNISCHE-ZEICHNUNGEN.md. Eine portable Freigabe wird erst durch die zugehörige vollständige Abnahme belegt.
Blattmitten bleiben bei Weltplatzierungs-/Maßstabsänderungen erhalten. Lokale
PDFs behalten native Vektor-/Fontstreams und erhalten exakt geprüfte Papierboxen
mit entsprechender Ursprungskorrektur; keine Rasterisierung oder Zusatzruntime.
Die Quellrevision bleibt bis zum Ende einer Zeichnungsdateiausgabe gesperrt;
Abbruch vor atomarer Dateifreigabe erhält vorhandene Ausgabedateien.

## CAD-Werkzeuge auf Abruf 0.81.0

Unabhängige Flächenkonturkopie nach Version2-Skizze und native Modellierrezepte
für Flächenversatz, innere Schale, Loft und Sweep. Vorhandener OCCT-Kern, keine
zusätzliche Runtime. Neue Module cad-face-sketch-native, cad-modeling-data,
cad-modeling-native und aufrufgebundene UI. Keine Kamera-/Leerlaufberechnung;
Vorschau/Revision/Abbruch/Übernahme verwenden den vorhandenen Controller.

source:'modeling' erhält Originale unter children, modeling.version1 speichert
das strikte Rezept. Flächenoperationen binden die ursprüngliche Kindgeometrie
über eine ID-unabhängige sourceSignature; geänderte Quellen werden abgewiesen.
Die Signatur wird auf Cachemiss geprüft, nicht bei jedem Root-Verschieben.
Loft-/Sweep-Profile werden aus erhaltenen nativen Skizzen und relativen vollen
Matrizen aufgebaut. Eigene Resultat-BRep ermöglicht normale Ansicht und Export.
Neue Inhalte verlangen Projekt-/Bibliotheksformat11; alte Formate bleiben
lesbar und werden ohne neue Inhalte nicht pauschal angehoben. Gespeicherte
Flächen-/Shell-/Sweep-Parameter sind ohne zusätzlichen Wrapper editierbar.

Konturübernahme unterstützt echte Linien/Kreise/Bögen und Innenöffnungen,
begrenzt auf128Elemente; Splines/Ellipsen/gekrümmte Flächen werden abgewiesen.
Flächenversatz ist auf sichere orthogonale Ebenennachbarn beziehungsweise
vollständige gerade Zylinder mit zwei ebenen Enden begrenzt. Shell nach innen;
Loft/Sweep zunächst Außenkontur ohne Löcher, UI-Loft zwei Profile und Sweep
Gerade/Kreisbogen1–180Grad. Numerischer Tangentenfix in sketch-profile entfernt
nur nachweisbare ULP-Reste und erhält echte Selbstschnittablehnung.
Anleitung: CAD-MODELLIERWERKZEUGE.md. Separate Source-/EXE-/Leistungs- und
unabhängige STEP/STL-Abnahme muss vor Finalauslieferung abgeschlossen sein.

## Flüssiger arbeiten 0.80.0

Skizzendialoge halten pro veränderlichem Entwurf eine private Ansichtsberechnung
in `sketch-view-cache.js`. Kamera, Auswahl und Einpassen verwenden aufgelöste
Konturen, Punktgriffe und Mittelpunkte weiter. Jede vorhandene Änderungsroute
verwirft den Cache; ein ersetztes Entwurfsobjekt wird ebenfalls neu aufgelöst.
Offene oder überkreuzte Entwürfe behalten ihre bearbeitbare Geometrieansicht und
den vollständigen Validierungsfehler. Ungültige Formeln leeren alte Griffdaten.
Native bzw. Mesh-Vorschau prüfen den Modellierauftrag weiterhin unabhängig.
Ein vollständig zugeklappter Objektbaum benötigt für Arbeitsplatzabfragen keine
erneute Traversierung seiner Quellhistorie.

Die Netzauswahl berechnet Welt-Flächennormalen erst für besuchte Dreiecke der
Oberflächenauswahl. Andere Auswahlarten benötigen diesen zusätzlichen Aufwand
nicht. Unveränderliche Geometrie kann vorbereitete Auswahl-/Normalendaten im
passenden Transformationsbezug weiterverwenden. An Auswahl- und technische
Netzworker gehen die benötigten Felder des betroffenen Teils, ohne seine gesamte
Quellhistorie zusätzlich zu kopieren. Größen-, Geometrie- und Revisionsprüfungen,
Originaldreiecksnummern, Schutzbereiche und Abbruch bleiben erhalten.

Identische CAD-Anzeigepuffer werden innerhalb einer Workerantwort einmal
übertragen; weitere Instanzen verwenden einen kurzlebigen Verweis. Der Decoder
hält benötigte Daten für diese Antwort auch bei Überschreitung seines regulären
Caches bereit. Verweise bleiben an die Worker-Generation gebunden. Der native
Anzeigecache kann das Netz derselben exakten BRep-Geometrie bei gleicher
Winkelgrenze weiterverwenden, wenn seine lineare Deflektion zwischen dem
angeforderten Wert geteilt durch 1,1 und dem angeforderten Wert liegt. Diese
Grenze betrifft den Deflektionswert und ist keine Vorgabe für die Dreieckszahl.
Die angeforderte Anzeigetoleranz wird dabei eingehalten.

Projekt-/Bibliotheksformat bis 10, Arbeitsplatzformat 4, gespeicherte Geometrie,
Quellen, Qualitätsvorgaben, native Präzisionsabfragen, Exporte und Undo/Redo
behalten ihre bisherigen Verträge. Gekrümmte CAD-Geometrie kann weiterhin eine
aufwendige native Vernetzung erfordern; mehrfarbige CAD-Gruppen benötigen ihre
native Farbaufteilung. Bedienung und Grenzen: `ARBEITSGESCHWINDIGKEIT.md`.

## Kernwerkzeuge ohne Zusatzeditor 0.79.0

Der vollständige zusätzliche SolidCraft-Editor wird nicht mehr mitgeliefert oder
aus Formnaro gestartet. Bestehende native Skizzen- und Netzwerkzeuge bleiben:
Version-2-Konturen mit Bögen/Öffnungen/Langlöchern, lokale benannte Maße und
Formeln, Trimmen/Verlängern/Spiegeln/Versatz, Skizzen-Anbauten und Ausschnitte an
CAD/geschlossenen Netzen, vier Beispielskizzen und Bibliothek sowie technische
Netzbereiche, Modellvergleich und beide Reduktionsmethoden. Vorschauen, erhaltene
Quellen, Sperren und Undo verwenden weiterhin die vorhandenen Verträge.

Projekt-/Bibliotheksformat bis 10 und Arbeitsplatzformat 4 bleiben. Alte Format-9-
CAD-Teile und optionale `metadata.parametricSource` bleiben beim Öffnen und
Speichern erhalten. Die eingebettete Editorquelle ist hier nicht editierbar;
keine automatische Umwandlung in native Skizzen oder Neuberechnung der Timeline.
Die vorhandene CAD-Geometrie benötigt den Zusatzeditor nicht. Frühere portable
Ausgaben bleiben unverändert. Die Mini-Ausgaben werden nicht geändert.

Lokale Skizzenformeln sind kein allgemeiner Bedingungslöser oder globaler
Abhängigkeitsbaum. Loft/Sweep/Shell des früheren Zusatzeditors sind nicht
integriert; das bestehende Netz-Aushöhlen bleibt separat erhalten. Keine neue
Cloudanbindung. Bedienung: `FORMNARO-KERNWERKZEUGE.md`; Altprojekte:
`OFFLINE-MODELLIEREN.md`.

## Blauer Drehkreis 0.77.0

Drei DOM-Drehgriffe X/Y/Z an der Auswahl übernehmen die Bedienung der Minis:
flüchtiger blauer 3D-Ring mit 5°-Teilstrichen und 15°-Marken, Winkelanzeige,
15°-Raster innerhalb, 1° außerhalb, Shift erzwingt 15°. Weltachsen bzw. aktive
Arbeitsebenenachsen wie bisher; Einzelteile, Mehrfachauswahl und CAD-Quellen.
Der bisherige TransformControls-Drehgizmo entfällt; die Drehgriffe stehen auch
im Verschiebe-/Größenmodus bereit. Andere Werkzeuge, gesperrte/verborgene Teile
und laufende Übernahmen blenden die Griffe aus. Vorhandene Hebegriffe werden
bei der Positionierung ausgespart. Griffe und Winkelanzeige meiden auch das
schwebende Easy-Eigenschaftenfenster und Ansichtsbedienelemente. Kantenansicht behält den Mini-Zieh-Fallback.
Vollständige affine Welttransformation um die Mitte der Auswahl, ohne Zerlegen
von Spiegelung/Scherung. Bestehender revisionsgebundener Gestencommit; Vorschau
ändert weder Projekt noch History, Loslassen ein Undo, Escape/Pointer-Abbruch
restauriert exakt. Keine neuen Dateidaten, Kerneländerungen oder Daueranimation.
Die Modellier-Einstellungen erklären das feste Mini-Raster; der frühere
Drehfang-Selektor entfällt dort, gespeicherte Präferenzdaten bleiben kompatibel.
Anleitung: `BLAUER-DREHKREIS.md`.

## Schnellere Baugruppen 0.76.2

Private tief unveränderliche CAD-Lesestände speichern ihre einmal berechnete
Revision bei unverändertem Algorithmus. Vollständige CAD-Wurzeltranslationen
können einen an bestätigten Stand und Anzeigequalität gebundenen nativen
Ansichtsbeleg verwenden: exakter Eigenschaftsvergleich außer Translation,
verschobene native Weltgrenzen und unveränderte Anzeigenetze. Maximal zwei
private Belegstände; andere Geometrie-/Quellen-/Dreh-/Skalieränderungen sowie
Annotationen, Teilungen und Bezugsebenen bleiben nativ. Keine Geometrieprüfung
aus Dreiecken. Gestencommit sperrt weitere Bearbeitungszüge bis Ansicht/Übernahme
fertig sind; Fehler restaurieren keine neueren Modellstände. Quellansichten
nach Revision/Auswahl/Qualität wiederverwenden und nicht in aktive Züge setzen.
Modell-/Ansichtsautosave gemeinsam nach 1 s Ruhe (500-ms-Takt), Signatur bindet
auch Modellrevision. Reguläres beforeunload sichert weiterhin sofort bestätigt.
Anleitung und Grenzen: `SCHNELLERE-BAUGRUPPEN.md`.

## Skizzenkomfort 0.67.0

Paket 1 des beauftragten Skizzen-/Mesh-Ausbaus erweitert den bisherigen Dialog
um lokale 2D-Kamera, Punktfang, Polygonpunktauswahl/-verschiebung und eigene
Entwurfshistorie. `sketch-interaction.js` ist reine Daten-/Interaktionslogik ohne
Kernel oder Modellhistorie. Formelkoordinaten bleiben beim Ziehen geschützt.
Skizzenformat 1 und Projektformate 5/7/8/9 unverändert. Die 3D-Vorschau rendert
nur bei Änderung statt in einer Endlosschleife. Eigener isolierter
`--verify-sketch-upgrade`-Pfad mit realen Maus-/Tastenereignissen.
Ausbaufolge und Anleitung: `SKIZZEN-UND-MESH-AUSBAU.md`.

## Historisch: Parametrisches Offline-Modellieren 0.66.0

Die damalige große Windows-Ausgabe ergänzte die portable SolidCraft-0.16.2-
Runtime als zusätzlichen lokalen Editor. Dieser Lieferumfang entfällt ab 0.79.0;
die folgenden Angaben beschreiben die historische Anbindung, nicht den aktuellen
Start- oder Bearbeitungsweg. OCCT und Manifold blieben die Formnaro-Rechenkerne.
Der vollständige Download und jede Runtime-Datei sind per SHA-256 gebunden.
Start erst durch ausdrücklichen Bedienauftrag; keine Hintergrundprozesse oder
Updateabfragen im Normalbetrieb. Eigene Sitzungsprofile, authentifizierte
Loopback-Verbindung, feste Austauschpfade und deaktivierte Editor-KI.

CAD-Auswahl als STEP, Netzauswahl als STL; Originale bleiben erhalten. Ein
zusammenhängender Editorauftrag exportiert parametrische Quelle und STEP.
Formnaro prüft die native Rückgabe in seiner Vorschau; nur Übernehmen ändert
Modell und Undo. Die Quelle wird begrenzt GZIP-komprimiert mit gespeichert.
Weiterbearbeiten öffnet dieselbe Historie im Zusatzeditor und aktualisiert das
entsperrte CAD-Gesamtteil unter Erhalt seiner Formnaro-Platzierung. Fremde
Geometrieänderungen verhindern das stille Überlagern mit einer alten Quelle.

Optionales `metadata.parametricSource` mit Engine-/Schemaversion, GZIP-Base64,
Quellen- und BRep-SHA256 verlangt Projekt-/Bibliotheksformat 9. Alte Projekte
bleiben bei 5/7/8. Gemeinsame Wiederherstellung und Bibliothek lesen Format 9;
vorige lokale CAD-Bestände bleiben erhalten. Neue Quelldaten werden nur bei
Editorstart dekomprimiert. STEP maximal 30 MiB, Quelle vor/nach Kompression
10 MiB, bestehende Körper-/Projektgrenzen unverändert. Ganze Quellen sind im
Projekt enthalten, nicht an einen privaten Sitzungsordner gebunden.

Die Editorkernfunktionen haben ihre eigenen Geometriegrenzen. Formnaro übernimmt
CAD-Gesamtgeometrie; die parametrische Timeline liegt im mitgespeicherten
Editorentwurf. Kein automatischer Port von Rust-Features in unseren Quellenbaum,
keine neue Cloudberechtigung, keine Übernahme in die beiden Mini-Ausgaben.
Sitzungen/Sicherungen bleiben lokal. Anleitung: `OFFLINE-MODELLIEREN.md`;
Runtime-Provenienz und Beschaffung: `parametric/README.md`.

## STEP-Baugruppen und Wanddickenkarte 0.61.0

Nativer STEPCAF/XCAF-Leser in der vorhandenen gemeinsamen OCCT-WASM-Bridge.
UI-Import `importStepAssembly` erhält Hierarchie in Projektordnern und getrennte
STEP-CAD-Blätter, Instanzplatzierungen, Namen, Teil-/Flächenfarben. Bestehendes
`importStep` für Konverter und interne Ganzkörperimporte bleibt unverändert.
Gemeinsame Importzentrierung von 0.60 bleibt erhalten. Optionales strenges
Metadatenfeld `stepFaceColors`; nur auf unveränderten STEP-Blättern anzeigen und
exportieren, bei Topologieänderungen keine alten Flächenindizes auf neue Flächen
übertragen. Flächenfarben auch in farbfähige Netzexporte. Keine STEP-Hierarchie
im bisherigen Teileexport. Projekt-/Importbudgets bleiben strikt.

Wanddickenkarte: vorübergehende schreibgeschützte Auswahlansicht, aktuelles
CAD-Anzeigenetz mit nativen Normalen bzw. ursprüngliches Netz in Weltkoordinaten.
CAD-Gesamtkörper vor Farbpartitionierung verwenden. Ein nach Bedarf gestarteter
BVH-Worker, 200k Dreiecke/600k Punkte, maximal 12k Stichproben/20s; Abbruch durch
Termination. Strikte Netz-Topologievorprüfung, mehrdeutige Intervalle grau,
keine Interpolation ungeprüfter Dreiecke. Keine globale Mindestdickenzusage oder
Druckprüfung. Keine Modell-/Undo-/Exportänderung, keine Leerlaufanalyse.
Revisions-/Auswahl-/Qualitätsbindung und Positionspufferreuse beim Umfärben.
Details und Grenzen: `STEP-BAUGRUPPEN-UND-WANDDICKEN.md`.

## Schnittebene und Klickmessung 0.59.0

Die große Anwendung ergänzt eine gemeinsame verschiebbare Schnittebene für
sichtbare CAD-/Netzmaterialkörper: Grafik-Clipping an unveränderten Puffern beim
Ziehen mit Mausgriff/Slider, genauer bestehender nativer Schnitt nach Loslassen.
Ein laufender Auftrag und höchstens ein letzter Folgeauftrag, revisions- und
werkzeuggebundene Ergebnisübernahme. Keine Veränderung von Modell oder Undo;
vorhandenes Arbeitsplatz-Schnittformat und vollständige Exporte bleiben erhalten.

Das neue Messpanel bietet native Kreis-Zylinder-Durchmesser/Radius,
CAD-/Netz-Zweipunktabstand und kleinsten Abstand zweier begrenzter CAD-Flächen,
auch am selben Körper. Weltgeometrie statt Anzeigedreiecken für CAD; keine
Kreisbehauptung bei nichtkreisförmiger affiner Verzerrung. Kein automatischer
STL-Kreisfit oder neue Maßabhängigkeiten. Alte Maß-/Punktfangwerkzeuge bleiben
über Weitere Messwerkzeuge erreichbar. Alles lokal mit vorhandenen Kernen,
keine zusätzliche Laufzeitabhängigkeit und kein Leerlauf-Analyseprozess.
Details und Abnahmeweg: `SCHNITTEBENE-UND-KLICKMESSUNG.md`.

## Modellierpinsel und Symmetrie 0.58.0

Die große Anwendung ergänzt unter Netz-Werkzeuge fünf Pinsel: Auftragen,
Abtragen, Verschieben, Abflachen und Glätten. Der Entwurf sammelt bis zu
16 Striche/128 Ansatzpunkte an einem sichtbaren entsperrten Netz mit bis zu
30.000 Dreiecken. Eine Welt-Spiegelebene X/Y/Z mit numerischer Position spiegelt
Striche mit überlappungsbereinigter Stärke. Die vorhandene Dreiecksstruktur
bleibt erhalten; Unterteilung bleibt ein ausdrückliches separates Werkzeug.

`mesh-sculpt.js` nutzt den gemeinsamen begrenzten Deformationsschutz aus
`mesh-smooth.js`: feste Schutz-/Auswahl-/Öffnungsränder, kumulative Weltgrenze,
kontinuierliche Orientierung, konservative Bewegungsabstände und tatsächliche
Dreiecksüberschneidungsprüfung. Ein exakter dyadischer Orientierungsfallback
beweist projektive Trennung an gemeinsamen Punkten/Kanten und vermeidet
numerisch erzeugte falsche Kontakte auf affinen planaren Gittern. Er ersetzt
keine Prüfung mehrdeutiger oder tatsächlich überlappender Geometrie.

`mesh-sculpt` und `sculptCatalog` verwenden die vorhandenen Worker,
Vorschau-/Revisions-/Schutzverträge und abgeschotteten KI-Werkzeuge.
Netzquellversion 3 archiviert Original und striktes deterministisches Strichrezept.
Eine Übernahme ist ein Undo; Projektformat 8 und Arbeitsplatz 4 bleiben.
Datei-/Modus-/Automations-/Maßänderungen während des Entwurfs sind gesperrt.
CAD, Minis, Nutzerprofile und vorhandene Ausgaben bleiben unabhängig.
Anleitung: `MODELLIERPINSEL-UND-SYMMETRIE.md`. Der isolierte
`--verify-mesh-sculpt`-Pfad prüft echte Mausstriche, alle fünf Pinsel,
Symmetrie, Abbruch, Originalvergleich, Schutz, Datei-/Exportwege und Layout.
Die separate Auslieferung verlangt erfolgreiche Quell- und EXE-Nachweise.

## Frühere Leistungsabnahme 0.55.0

0.55.0 ergänzt wiederverwendete Grenzen unveränderlicher Netze, lokale
Auswahl-/Sichtbarkeitsindizes und einmalige Eingabeprüfung bei reinen
Workerabfragen ohne separate Baseline. 56 gezielte Kernprüfungen und jeweils
210 Prüfpunkte an Quelle und tatsächlicher EXE bestanden. Auswahlpaar-Median
am synthetischen 49.152-Dreiecks-Netz: 12,5 auf 1,2 ms; 20 unveränderte
Aktualisierungen: 232,1 auf 20,8 ms. Kein allgemeiner Mini-Geschwindigkeitsfaktor
für Geometrieberechnungen. Formate und Qualität bleiben erhalten.

Seit 0.49.2 enthalten: STL-Deckel, isolierte KI-Skripte/Werkzeugmodule,
Formerkennung/Gegenstücke, reine Messrunden, tatsächliche Messebenen,
portionierte Berichte, konservative Radialspielprüfungen und zehn Minuten
Zeit je KI-Anbieteraufruf. Mini 0.6.1 ist eine separate Windows-Codebasis;
Android 0.5.0-test1 bleibt eine Tablet-Testausgabe ohne breite Geräteabnahme.
Persönliche Modelle und echte Anbieterproben bleiben ausschließlich lokal.

## Frühere Gesamtprüfung 0.49.2

CAD-Körper und Netze teilen sich Projektformat 8, Arbeitsplatzformat bis 4 und
lokale KI-API 1. Easy Tinker, Konverter, Netzwerkzeuge bis Paket 26 und lokale
KI-Ergebnisprüfung sind enthalten. Paket 27 (Druckprüfung) wurde am 18.10.2026
auf Nutzerwunsch gestrichen; Überhänge und Druckausrichtung bleiben beim Slicer.
Der ursprüngliche Paketplan ist damit abgeschlossen: 1–26 umgesetzt, 27 gestrichen.
Spätere Ausbauideen ab Modellierpinseln/Symmetrie bleiben zur Auswahl; noch kein
neuer Implementierungsauftrag. Historische Offen-Vermerke weiter unten gelten
für die jeweils dokumentierte frühere Entwicklungsetappe.
Die folgenden früheren Abschnitte dokumentieren die jeweilige Entwicklungsetappe.

Abnahme vom 16.10.2026: 157 Kernsuiten / 1056 Tests; insgesamt 194 Quellgruppen /
2588 Prüfpunkte und 37 Gruppen / 1530 Prüfpunkte an der tatsächlichen EXE.
Beide Ausgaben durchliefen je 30 Minuten und 60 vollständige Dateizyklen.
Physische Projekt-/STL-/OBJ-Ergebnisse wurden unabhängig geprüft; beide Archive
vollständig auf CRC und Einzelhashes sowie ein frischer EXE-Start kontrolliert.
Der Produktfix erhält exakt gemeinsame Endpunkte fast paralleler koplanarer
Kanten und verhindert einen falschen Selbstschnitt beim Aushöhlen gültiger
Make-Solid-Netze. Toleranzen und Projektformate wurden dabei nicht erweitert.
Verbleibende kleine Anzeigehinweise: englische Palette „Sechseck“ und Wortumbruch
„Pyramide“ bei 1000 Pixel. Prüfverfahren: [GESAMTPRUEFUNG.md](GESAMTPRUEFUNG.md).

GitHub-Veröffentlichung 0.49.2: aktueller Quellstand mit Anleitungen, Konverterquellen,
Tests und Lizenzen; geprüfte portable Windows-Ausgabe und zugehöriges Quellarchiv.
Die GitHub-Beschreibungen werden redaktionell aktualisiert, die abgenommenen
Produktdateien und ZIPs unverändert übernommen. Lokale PyInstaller-Zwischenstände
sind zusätzlich ausgeschlossen. Persönliche Modelle, Profile, Schlüssel und
lokale Nachweisordner bleiben außerhalb des Repositorys.

## Aktueller nativer CAD-Stand (0.11)

Der produktive Einstieg `src/cad-main.js` ersetzt die bisherige Modellierung
vollständig durch einen gemeinsamen OCCT-8.0.1-WASM-Kern. Alle 23 Formen,
Text/SVG-Originalkonturen, Plugins, Vorlagen, Präzisionswerkzeuge, Finish,
Quellenbearbeitung, sechs Exportformate und lokale KI verwenden denselben
CAD-Dienst. Die Three.js-Darstellung ist ausschließlich abgeleitet. Allgemeine
affine Matrizen erhalten Scherung und Spiegelung auch in verschachtelten Gruppen.

Projektformat 5 speichert Quellen/Rezepte und triangulierungsfreie BRep-Körper.
Neue CAD-Autosicherung und Bibliothek haben separate Keys/Dateien; alte
Modelldaten werden nicht automatisch gelesen, migriert, kopiert oder gelöscht.
Einstellungen, Layouts, Favoriten, Formenpakete und KI-Einstellungen behalten
ihren vorhandenen Vertrag. OBJ und der reguläre STL-Import sind getrennte
Referenzen; STEP ist CAD. Der spezialisierte STL-Gehäuseimport unten ist eine
zusätzliche native CAD-Option.

## STL-CAD-Prüfung 2 (12.10.2026)

Der bisherige Fachbox-Loft war nur für eine Beispielklasse geeignet und besaß
keine ausreichende Oberflächenprüfung. `src/cad-stl-housing.js` ist jetzt die
kompatible Fassade für `src/cad-stl-surfaces.js`: geschlossene, einheitlich
orientierte und zusammenhängende STL-Hüllen liefern native Ebenen und kubische
Dreiecks-Bézierflächen. Die Polynomialflächen werden exakt in Tensor-B-Splines
überführt; planare Bereiche werden nativ vereinigt. Die Geometrie bewahrt dünne
Gehäuse, Bohrungen, Ausschnitte und die ursprüngliche Lage. Eine gemeinsame
Winkelgewichtung der Ecknormalen und gemeinsam begrenzte Kantenkurven erhalten
Positionskontinuität; allgemeine G1-Tangentenstetigkeit wird nicht behauptet.
Das Verfahren rekonstruiert begrenzte Flächen, keine Originalradien/-historie.

Die maximale Kontrollpunktverschiebung ist 0,02 mm. Nichtnegative Bernstein-
Gewichte liefern einen beidseitigen Korrespondenzbound zur Eingabe-STL; der
Maßbound ist doppelt so groß. Native Toleranzen werden separat gegen das
reservierte Budget geprüft. Grad-4-Bernsteinkoeffizienten bestätigen die lokale
Projektionsorientierung; riskante gemeinsame Kanten werden lokal begrenzt.
Abnahmegrenzen: Oberfläche 0,25 mm, kritische Geometrie 0,10 mm, Volumen 1 %,
ein nativer gültiger Solid, BRep maximal 12 MiB. Unabhängige Exportmesh-
Stichproben sind zusätzliche Evidenz und kein allgemeiner Hausdorffbeweis.

Importauftrag `importStlHousing`, Projektformat 5 und lokale API 1 bleiben.
Das Ergebnis benutzt die bestehende importierte BRep-Quelle; Original-STL und
Dateiname sind kein ausführbarer Code. Objektnotizen zeigen Grenzen und Maße.
Fehlercodes `STL_INVALID`, `STL_LIMIT`, `STL_UNSUPPORTED`, `STL_QUALITY` erklären
Abweisungen. Binär-/ASCII-Vorprüfung begrenzt CAD-Import auf 40.000 Dreiecke und
50 MiB vor aufwendiger Verarbeitung; Referenzimport bleibt separat auswählbar.
Die Anwendung trägt eine sichtbare Vorschau-Buildkennung; frühere Installationen
werden durch den separaten Prüfbuild nicht verändert. Abnahmeverfahren unter
`docs/CAD-STL-ABNAHME.md`. Persönlicher Testbestand und Berichte bleiben lokal.

Preview/Apply, direkte Eingaben und KI verwenden einen festen bestätigten
Stand. Native Validierung, Serialisierungslimit und Kandidat-Anzeigepuffer werden
vor Bestätigung geprüft. Fehler, stale Antworten und Abbruch erhalten Modell,
Undo/Redo und Autosicherung. Mehrfachauswahl normalisiert Eltern/Kind-Bezüge;
Geschwisterquellen haben separate temporäre native Anzeigen und einen gemeinsamen
Undo-Schritt. Worker- und BRep-/Anzeigecaches sind begrenzt.

Anzeige standardmäßig 0,02 mm/8°, Export 0,01 mm/5°. glTF reserviert jeweils
die Hälfte des Exportbudgets für native Tessellierung und Koordinatenrundung.
Originalglyphen (627), Selbstschnitt-/Füllregeln, affine Schraubkörper und frische
STEP-/BRep-Leser sind tatsächlich geprüft. Maximal 0,0001 mm beziehungsweise
Merkmalsgröße/100 konstruktive CAD-Splineabweichung ist separat zertifiziert;
Volumen- oder Meshstichproben gelten nicht als allgemeiner Hausdorffnachweis.

155 native Basistests, 45 erweiterte Tests plus neue glTF-Regression und
97 historische Regressionen bestanden. Sechs echte Electron-UI-Harnesses prüfen
auch vertrauenswürdige Maus-/Tasten-/Palettendrag-/Pointercancelereignisse. Der
separate offizielle FreeCAD-STEP-Leser und die echte Electron/HTTP/Python-MCP-
Abnahme verwenden ausschließlich eigene Testprofile.

Build: `npm ci`, `npm run build`. Vollständige reproduzierbare Vorabgates:
`npm run test:cad-release`; Paket: `npm run package`. Der an Quell-/dist-SHAs
gebundene Gate-Report ist verpflichtend. Neue separate Ausgabe:
`release-formnaro-v0.11/`; alte Ausgabeordner bleiben bestehen. Kernelquellen,
generierte Bindings, immutable Toolchain, 14 Original-Lizenz-/Autorentexte und
24 Runtimeintegritätseinträge werden mitgeliefert. Manifold/Stock-OCJS sind nur
noch Entwicklungsabhängigkeiten für historische Tests. Produktiv gibt es genau
einen gemeinsamen Kern. Konkrete Paket-/EXE-Nachweise werden neben der
Auslieferung bereitgestellt; Verfahren und Grenzen stehen in
`CAD-ABNAHME-v0.11.md`. Kein Upload, Commit oder Push gehört zum Auftrag.

## Historische Architektur und Entwicklung (0.10)

- Electron 44.7.0, Vite 8.3.4 und Three.js 0.186.1.
- Manifold 3.5.4 für Netzformen und boolesche Geometrie.
- `replicad-opencascadejs` 1.1.0 als unveränderter lokaler OCCT-WASM-Kern
  für Kantenbearbeitung und STEP. Die Replicad-Modellierbibliothek wird nicht verwendet.
- `src/main.js` verbindet Oberfläche und Modellzustand; Geometrie, Werkzeuge,
  Projekt-/Exportdaten und Worker sind in eigenen Modulen organisiert.
- `backend/` und `preload.cjs` kapseln Dateizugriff, optionale Anbieter-KI
  und die lokale Loopback-Schnittstelle. Renderer ohne Node-Zugriff.
- `npm ci`, `npm run build`, `npm start`; `npm test` für Node-Prüfungen.
  Desktop-Suiten benötigen einen aktuellen Build und eigene Testprofile.
- `npm run package` erzeugt Windows x64 unter `release-formnaro-v0.10/`.

## Kompatibilität und Bearbeitung

Alle Modellmaße sind Millimeter. `.ocad` schreibt Format 4 und liest 1–3.
Format 4 enthält Kantenoperationen und importierte CAD-Daten; Version 0.9
kann es nicht öffnen. Autosicherung v4 liest bei Bedarf v3/v2/v1.
Chromium-Cache und vorübergehende KI-Verbindungsdatei behalten das Profil
`%APPDATA%/offlinecad`. Benutzereinstellungen, Bibliothek und Autosicherung
liegen portabel in `Daten/` neben der EXE, Layouts in `Layouts/` (Details unten).
`offlinecad_`-Werkzeuge und lokale Daten-API Version 1 bleiben kompatibel.

Native Formen, Gruppen und Quellen bleiben editierbar. Änderungen sind
transaktional, ungültige Ergebnisse rollen zurück. Nur bestätigte Zustände
werden gesichert. Sperren, Quellen-IDs, Parameter und Welttransformationen
bei Erweiterungen erhalten. Keine Tests im Benutzerprofil durchführen.

## Kanten, Passungen und STEP

`src/cad-kernel.js` kapselt OCCT; `cad-data.js`, `edge-tools.js`, `fit-tools.js`
und `fit-presets.js` verbinden CAD-Daten und Werkzeuge mit dem Projekt.
Kantenberechnungen und STEP arbeiten in abbrechbaren isolierten Workern.

Kantenrundung/Fase am entsperrten fertigen Root-Teil: Kantenauswahl,
Vorschau, Übernahme mit einem Undo-Schritt. Die Ausgangsgeometrie bleibt
als editierbare Quelle im Wrapper. Kantenanker verwenden Kurventyp,
Kantenanzahl und fünf normalisierte Punkte; mehrdeutige Wiederzuordnungen
werden abgelehnt. Grenzen: 40.000 Netz-Dreiecke pro Teil, 8.000 auswählbare
Kanten, 128 Kanten pro Operation, 20 Schritte, Maß 0,01–1.000 mm.

Passung: Öffnung größer/Einsatz kleiner, Spiel 0–5 mm je Seite und lokale
X/Y/Z-Achsen. Maßänderung berücksichtigt volle Elternskalierung.
Loch-Gegenstücke erhalten neue IDs; bis zu 50 Druckspielvorlagen.
Komplexe Konturen werden skaliert; kein äquidistanter Flächenoffset und
keine dauerhafte Maßabhängigkeit. Gewinde-Passungsvorlagen bleiben separat.

STEP/STP-Textimport bis 30 MB, Dateieinheiten nach mm, geschlossene Körper.
Mehrere Körper werden als ein Importobjekt mit relativer Anordnung gespeichert.
BREP, zentriertes Netz, Basisgröße und Meshhash bleiben in `.ocad` erhalten.
Hash normalisiert -0. Export: getrennte sichtbare Körper in mm, einschließlich
geschlossener Hohlräume. Analytische Flächen bleiben bei gleichmäßiger
Skalierung/Drehung/Spiegelung erhalten. Netzformen, boolesche Gruppen und
nichtproportionale Skalierung werden facettiert übertragen. STEP enthält
keine Farben, Quellenhistorie oder Baugruppenstruktur.

Die lokale KI-Daten-API erstellt keine neuen Kantenoperationen und exportiert
weiterhin STL/OBJ. CAD-Werkzeuge sind über die Oberfläche verfügbar.
Die lokale Verbindung benötigt keinen zusätzlichen Cloud-Schlüssel;
Verbindungsdateien, Token und Anbieter-Schlüssel niemals veröffentlichen.

## Prüfstand und weitere Planung

Version 0.10: 76/76 Node-Prüfungen und 13 Desktop-Suiten bestanden.
STEP zusätzlich mit unabhängigen Bindings gelesen; Windows-Paket mit
getrenntem Profil und 38 verglichenen Runtime-Dateien geprüft.
Details und Grenzen stehen in `docs/PRUEFBERICHT-v0.10.txt`.
Tests erzeugen lokale Nachweise unter dem ignorierten `work/`.

Offene Ausbauten: allgemeine dauerhafte Maßabhängigkeiten, Loft/Sweep,
freie Flächenmodellierung und bewegliche Baugruppen. Skizzen/Schaltungen
sind ausdrücklich ausgeschlossen. Eine breite GPU/DPI/Monitor/Screenreader-
Abnahme, vollständige reale Windows-Dateidialogrunde und vollständiger
Stromausfallnachweis wurden noch nicht abgeschlossen.

CAD-Drittanbieterlizenzen und Buildhinweise unter `licenses/`.
Genaue upstream Quellen inklusive Revisionen und Prüfsummen stehen im
separaten Release-Archiv `Formnaro-CAD-Quellen-v0.10.zip`.

## Repository und Auslieferung

GitHub: https://github.com/andyy909/Formnaro, Hauptbranch `main`.
Der erste Repository-Stand wurde am 10.10.2026 in einem frischen GitHub-Checkout
mit `npm ci`, 76/76 Node-Prüfungen und `npm run build` erfolgreich geprüft.
Version 0.10.0 erhält den Tag `v0.10.0` und einen Release mit Windows-Paket,
Quellcodearchiv aus Git, CAD-Bibliotheksquellen und SHA256-Prüfsummen.
Persönliche Modelle, Profile, Zugangsdaten, Gesprächshistorie und erzeugte
Testnachweise bleiben lokal. Git enthält Anwendungscode, Lockfile, Tests,
Anleitungen, Lizenztexte und eigene synthetische Beispiele.

## Ergänzung: Kantenbereichsauswahl (10.10.2026)

Im Kantenwerkzeug zieht die linke Maustaste einen Auswahlrahmen. Vollständig
eingeschlossene projizierte Kanten werden gewählt, einschließlich Rückseiten.
Ohne Modifikatortaste ersetzt der Rahmen die Auswahl; Umschalt fügt hinzu,
Alt entfernt. Einzelklicks schalten Kanten weiterhin um. Mehr als 128 Kanten
werden atomar abgelehnt, die vorherige Auswahl und Vorschau bleiben erhalten.
Pointercancel, verlorene Pointercapture und Schließen entfernen den Rahmen.
Auswahländerungen brechen laufende Vorschauen ab und verwerfen alte Antworten.
DE/EN-Hinweise und Anleitung aktualisiert. Kein Projektformatwechsel.

76/76 Node-Tests und erweiterte CAD-Desktop-Suite bestanden: echte Mausrahmen,
Teilauswahl, Hinzufügen/Entfernen, unveränderte Kamera und Modellgeometrie,
128-Limit an facettiertem Zylinder sowie Vorschau/Apply/Undo/Redo und bisherige
CAD-Funktionen. Neue portable Ausgabe `release-formnaro-kantenauswahl/`;
alte Ausgaben erhalten. Paketstart erfolgt im isolierten Prüfprofil.

## Ergänzung: Neue Bibliotheksformen auf Flächen (11.10.2026)

Beim Drag-and-drop aus der Formenbibliothek bestimmt `libraryDropPlacement`
in `src/main.js` die nächste sichtbare Körperfläche unter dem Loslasspunkt.
`planeFromHit` liefert eine temporäre Ebene, `placeOnPlane` setzt die neue
Form geometrisch auf und richtet sie aus. Die globale Arbeitsebene bleibt
unverändert. Horizontale, schräge, senkrechte, gespiegelte, Gruppen- und
Importnetzflächen werden unterstützt. Gesperrte Körper dürfen Unterlage sein;
Lochformen und ausgeblendete Teile werden ignoriert. Lokale Formenpakete
nutzen denselben Pfad. Ohne Treffer und bei Bibliotheksklicks gilt weiterhin
die Arbeitsebene. Das Verschieben vorhandener Teile bleibt unverändert.

Neue Suite `npm run test:library-placement` prüft echte Bibliotheks-/Drop-Handler
mit HTML-DragEvents, unabhängige Kontakt-/Orientierungsrechnung, einen Undo,
stabile Unterlagen/Arbeitsebene und native Mausbewegung eines bestehenden Teils.
76/76 Node-Tests und Arbeitsebenen-/CAD-Desktop-Suiten bestanden.
Neue portable Ausgabe `release-formnaro-flaechenplatzierung/` enthält auch die
Kantenbereichsauswahl. Format 4 und Anwendungsversion 0.10.0 bleiben erhalten.

## Ergänzung: Magnet für vorhandene Teile (11.10.2026)

`src/magnet-tools.js` verwaltet einen einmaligen Magnetmodus für ein ausgewähltes,
entsperrtes fertiges Root-Teil. Knopf neben Verschieben/Größe/Drehen; goldene
Markierung und Vorschau. Linkes Ziehen trifft andere sichtbare Körperflächen,
schließt das gezogene Teil selbst aus und setzt die Unterseite geometrisch auf.
Die lokale Z-Achse wird mit minimaler Drehung zur Außennormale ausgerichtet;
der Drehwinkel auf einer parallelen Fläche bleibt erhalten. Erst Loslassen
übernimmt Position/Drehung durch die bestehende Edit-Transaktion mit einem Undo.
Maße, Spiegelung, IDs, Parameter, Quellen, CAD-Daten und Organisation bleiben.
Keine dauerhafte Verbindung zum Ziel; die globale Arbeitsebene wird nicht neu
gesetzt. Bereits angehängte Arbeitsebenen behalten ihre bisherigen Bezugsregeln.

Escape, Pointercancel, Captureverlust, Auswahl-/Modelländerung und ein Drop ohne
Zielfläche verwerfen die Vorschau. Nach Platzierung endet der Modus. Gesperrte
Unterlagen sind erlaubt, gesperrte Quellen und Quellenbearbeitung ausgeschlossen.
Die Arbeitsfläche ist kein Magnetziel; Bibliotheksplatzierung bleibt unabhängig.
Externe Modelländerungen sind während des Magnetziehens als beschäftigt gesperrt.

`npm run test:magnet` prüft native Mausgesten, Original-/Autosicherungszustand
während Vorschau, Kontakt/Ausrichtung, ein Undo/Redo, Mirror/schräg/senkrecht,
Gruppen/Importnetze/Quellenerhalt, fehlendes Ziel/Selbsttreffer, Abbruch/Revision,
Sperren/Auswahlwechsel und DE/EN/Dark Mode bei 125% Zoom. Neue Suite plus
Bibliotheks-, Arbeitsebenen-, CAD-Desktop und 76/76 Node-Prüfungen bestanden.
Ausgabe: `release-formnaro-magnet/`; enthält auch Flächenplatzierung/Kantenrahmen.
Keine Formatänderung, keine Änderung an Benutzerprofilen oder laufenden Modellen.

## Ergänzung: Persönliche Oberflächenanordnung (11.10.2026)

Einstellungen → Oberfläche → Oberfläche anordnen aktiviert einen eigenen
Layouteditor. `src/layout-preferences.js` validiert die lokale Anordnung unter
`offlinecad-layout-v1`, unabhängig von Projekten, Undo und Programmeinstellungen.
Jedes der 37 Werkzeuge muss genau einmal in einer zulässigen Leiste vorkommen.
Beschädigte/unbekannte Anordnungen fallen auf den Standard zurück.

`src/layout-ui.js` verschiebt vorhandene DOM-Knöpfe und erhält IDs, Handler und
deaktivierte Zustände. Obere Knöpfe können zwischen Datei-/Werkzeugleiste wechseln;
Ansichts- und Bewegungswerkzeuge lassen sich in ihrer Gruppe umsortieren. Ein
goldener Einfügemarker zeigt den eingerasteten Platz vor dem Loslassen. Bereiche
besitzen eigene Griffe und markierte Andockziele: Bibliothek/Objektbaum und
Eigenschaften tauschen links/rechts; Ansicht links/rechts, Bewegungswerkzeuge
oben/unten auf der Gegenseite. CSS-Grid und schmale Seitenschubladen folgen dem
Layout. Lange Leisten bleiben scrollbar; Griffe berücksichtigen sichtbare Clips.

Separate Editorgriffe erlauben auch das Umordnen deaktivierter Knöpfe. Hintergrund
ist währenddessen `inert`; Mausaktionen, Modellkürzel und Dateidrops sind gesperrt,
Tab bleibt im Editor. Pfeiltasten bewegen Griffe, Strg+Pfeil wechselt obere Leisten.
Erst Anordnung speichern schreibt lokal; Abbrechen/Escape restauriert den letzten
gespeicherten Stand. Pointercancel/ungültiger Drop verwerfen die laufende Geste.
Standardanordnung ist im Editor und in Einstellungen wiederherstellbar.

`npm run test:layout` prüft native Mausgesten, Marker, Leistenwechsel, deaktivierte
Knöpfe, Bereichsplätze, unverändertes Modell/Undo, echte bestehende Aktionen nach
Umordnung, Speichern/Reload, Reset, Abbruch und Tastaturfokus. DE/EN, Dunkelmodus
und Schubladen bei 1100×760/125% Zoom geprüft; Screenshots visuell kontrolliert.
78/78 Node-Prüfungen sowie Einstellungen-, Bibliotheks- und Magnet-Desktop
bestanden. Format 4 und Anwendungsversion 0.10.0 bleiben erhalten.

CAD-Desktop-Regressionssuite ebenfalls bestanden. Portable Ausgabe unter
`release-formnaro-layout/`; enthält auch Kantenbereichsauswahl, Flächenplatzierung
und Magnet. 31 Runtime-Dateien im ASAR bytegleich geprüft, keine Benutzerprofile
oder Zugangsdaten. Paketstart im isolierten Prüfprofil und komplette native
Layout-Suite zusätzlich gegen das tatsächliche ASAR erfolgreich ausgeführt.

## Ergänzung: Benannte portable Layouts (11.10.2026)

Formnaro speichert die aktuelle Anordnung und bis zu 100 benannte Layouts in
`Layouts/layouts.json` direkt neben der gepackten EXE. Der Speicherort folgt der
EXE, unabhängig von Arbeitsverzeichnis und Benutzerprofil. Im Entwicklungsstart
liegt der Ordner neben dem Projekt; Git ignoriert ihn. Paketprüfungen verwenden
einen separaten Layoutordner im Prüfbereich. Die übrigen Profil-/Modellspeicher
bleiben unverändert. Beim PC-Wechsel oder Wechsel einer portablen Ausgabe den
Layouts-Ordner mitkopieren.

`backend/layout-data.mjs` enthält die gemeinsame Layout-/Sammlungsvalidierung.
`backend/layouts.cjs` bietet begrenzte IPC-Lese-/Änderungs-/Ordnerbefehle; Namen
werden nie als Dateipfade verwendet. UTF-8-Datei, atomare Schreibweise über
`writeAtomic`, Revisionsprüfung und Größen-/Anzahlgrenzen. Fehlerhafte oder fremd
geänderte Dateien werden nicht überschrieben. Schreibfehler melden den fehlenden
Speichererfolg; es erfolgt kein heimlicher Rückfall ins PC-Profil.

`src/layout-library.js` übernimmt beim ersten Start einen gültigen alten lokalen
Layoutstand, sofern keine portable Datei existiert. Vorhandene portable Daten
haben Vorrang, auch gegenüber anderen PC-Profilen. Browserstart ohne native
Brücke nutzt weiter Browserstorage. Aktuelle Anordnung und benannte Vorlage sind
getrennt: Bearbeiten speichert den aktuellen Stand; nur explizites Aktualisieren
überschreibt die gewählte Vorlage. Laden speichert die zuletzt verwendete Auswahl.

Einstellungen → Oberfläche bietet Auswahl/Laden, Neu speichern, Aktualisieren,
Umbenennen, bestätigtes Löschen und Ordner öffnen. Optionaler Name im Editor legt
beim Speichern eine neue Vorlage an. Zurücksetzen erhält benannte Vorlagen;
Abbrechen/Escape verändert die gespeicherten Daten nicht. Während eines Schreibens
sind Editoraktionen gesperrt. Namenseingabe erhält native Text-/Tastenereignisse;
sonstige Tastaturaktionen bleiben vom Modell abgeschirmt. DE/EN und Hilfen ergänzt.

87/87 Node-Prüfungen, bestehende Layout- und Einstellungen-Desktop-Suiten sowie
neue `npm run test:layout-profiles` bestanden. Native IPC, Namenseingabe/Maus,
Unicode, Migration, Vorlagenverwaltung, Modell-/Undo-Erhalt, Neustart, kopierter
Ordner mit frischem Chromium-Profil, fehlerhafte Datei und veraltete Revision
geprüft. Dunkelmodus/EN bei 125% samt Screenshots visuell kontrolliert.

Magnet-Desktop-Regressionssuite und Paketstart im isolierten Prüfprofil ebenfalls
bestanden. Neue portable Ausgabe `release-formnaro-layouts/`; 33 Runtime-Dateien
im ASAR bytegleich geprüft, keine Benutzerprofile oder Zugangsdaten. Die komplette
native Layoutprofile-Suite inklusive Kopiertest zusätzlich gegen das tatsächliche
ASAR bestanden. Anwendungsversion 0.10.0 und Projektformat 4 bleiben erhalten.

## Ergänzung: Portable Einstellungen und Bibliothek, Textmenüs (11.10.2026)

Die Desktopausgabe speichert Programmeinstellungen, Formenpakete, persönliche
Vorlagen, Favoriten, Gewinde-/allgemeine Passungsvorlagen, Modellprüfeinstellungen
und Autosicherungen v1–v4 in `Daten/` neben der EXE. Die Dateinamen und Bytegrenzen
stehen in `backend/program-data.json`, gemeinsam für Renderer und Backend.
`src/program-storage.js` bietet den bestehenden synchronen Storage-Vertrag über
begrenzte, fenstergebundene IPC. Ein Schreibvorgang aktualisiert den Rendererstand
erst nach erfolgreicher atomarer Dateispeicherung. SHA256-Revisionen verhindern
das Überschreiben zwischenzeitlich geänderter Dateien. Kein stiller Rückfall auf
AppData. Der Browserstart verwendet weiterhin Browserstorage.

`backend/program-storage.cjs` übernimmt bei fehlendem Datenordner einmal den
bisherigen Browserstorage und die verschlüsselten KI-Einstellungen. Die vollständige
Übernahme wird in einem temporären Nachbarordner vorbereitet und als Verzeichnis
übernommen. `profil.json` markiert Format 1; vorhandene portable Daten haben
Vorrang vor jedem späteren PC-Profil. Fehlgeschlagene Migration lässt keinen
teilweise gültigen Ordner zurück; beschädigte Markierung blockiert den Start,
zeigt einen lesbaren Fehler und erhält Dateien. Entwicklung und `--verify-local`
verwenden eigene Orte; `Daten/` ist aus Git und Runtime-ASAR ausgeschlossen.

`desktop-ai.cjs` erhält den portablen KI-Einstellungspfad explizit. API-Schlüssel
bleiben Windows/safeStorage-verschlüsselt; bei fehlender Entschlüsselbarkeit bleibt
die Anbieter-/Modellkonfiguration erhalten, der Schlüssel muss neu eingegeben
werden. Die vorübergehende KI-Verbindungsdatei und Chromium-Cache verbleiben im
kompatiblen PC-Profil; es wird kein Cloudaufruf für Migration oder Test benötigt.
Zum PC-Wechsel/Update Formnaro schließen und `Daten/` sowie `Layouts/` mitnehmen;
extern gespeicherte Projektdateien gesondert kopieren. Einstellungen → Allgemein
bietet den Datenordner-Knopf und DE/EN-Speicherhinweis.

`backend/edit-menu.cjs` hängt das native Textmenü an WebContents `context-menu`.
Editierbare Felder erhalten Undo/Redo, Ausschneiden, Kopieren, Einfügen, Löschen
und Alles auswählen als Electron-Rollen mit `editFlags` und DE/EN-Beschriftung.
Markierter statischer Text erhält Kopieren; unmarkierte Oberfläche/Canvas kein
Textmenü. Kameraorbit und Bibliotheks-Favoriten behalten ihre rechte Maustaste.
Bibliotheksfavoriten und Vorlagenlöschung ändern den UI-Stand erst nach Speicherung.

97/97 Node-Prüfungen, Einstellungen-/Layoutprofile-/KI-Desktop-Suiten und neue
`npm run test:portable-data` bestanden. Neue native Suite prüft echte Migration,
portable IPC-Dateien, Unabhängigkeit vom alten Browserprofil, Kopie von Daten und
Layouts auf frisches Chromium-Profil, nutzbare parametrisierte Vorlagen/Plugins,
KI-Konfiguration bei fremder Schlüsselverschlüsselung, portable KI-Speicherung,
beschädigte Startmarkierung ohne Dateiverlust sowie Wiederherstellung. Echte
Rechtsklick-Ereignisse mit nativen MenuItem-Rollen und Windows-Zwischenablage:
Maße, ein Modell-Undo, Ausschneiden/Einfügen/Alles auswählen, Layouteditor und
markierter Hinweistext. DE/EN/125%-Fenster und erhaltene Canvas-Rechtsbedienung
geprüft; Screenshots visuell kontrolliert. Keine externen Anfragen.

Neue Ausgabe `release-formnaro-portabel/` enthält alle bisherigen Erweiterungen.
36 Runtime-Dateien im ASAR bytegleich geprüft; keine Benutzerdaten/Zugangsdaten
im Paket. Der echte EXE-Start mit `--verify-local` und die vollständige neue
Desktop-Suite zusätzlich gegen das tatsächliche ASAR erfolgreich. Anwendung
0.10.0 und Projektformat 4 bleiben erhalten; vorherige Ausgaben bleiben bestehen.

## Ergänzung: Beauftragte durchgängige CAD-Umstellung (11.10.2026, in Arbeit)

Der verbindliche vollständige Auftrag steht in `docs/CAD-UMSTELLUNG-AUFTRAG.md`.
Die separate Ausgabe 0.11.0 darf erst nach Umstellung sämtlicher Formen und
Werkzeuge einschließlich KI, Persistenz, Export und tatsächlicher Paketabnahme
entstehen. Vorhandene 0.10-Ausgaben und alte Modelldateien bleiben erhalten;
keine Veröffentlichung oder automatische Migration ist beauftragt.

Neue, noch nicht im produktiven Renderer aktivierte CAD-Module implementieren
Format5, vollständige affine Matrizen, native Rezepte/Originalkonturen,
Quellenbäume, transaktionale Preview/Apply/Undo/Redo und einen dauerhaften Worker.
BRep-Geometrie wird nativ validiert und ohne Triangulierungen persistiert;
Anzeigepuffer sind außerhalb von Projekt, Undo und Modellrevision. Referenzmeshes
sind gesonderte, von CAD-Präzisions-/Booleschen-/Exportpfaden ausgeschlossene
Knoten. Schema-/Prüfmatrixdetails stehen in `CAD-PROJEKTFORMAT-5.md` und
`CAD-UMSTELLUNG-PRUEFMATRIX.md`.

Direkte STEP-Ein-/Ausgabe verwendet native OCCT/XCAF, Millimeter, getrennte
Körper sowie Namen/Farben/Transparenz. Native Common/Cut-Analyse liefert
Kollisionsvolumina und überschneidungsfreie Farbanteile mit erhaltenen Löchern.
Eine independent review schützt winzige SVG-Innenlöcher und begrenzt ungültige
Ellipsenwinkel; ursprüngliche Bézier-/Ellipse-Kurven werden nicht trianguliert.
Kontrollierte Schraubflächen ersetzen unkontrollierte Profil-Sweeps; vollständige
Gewinde/Muttern/Schrägzahnräder werden gesondert an CAD-Querschnitten geprüft.

`cad-kernel-build/` erweitert denselben festgelegten OCCT-Kern reproduzierbar
um allgemeine affine Transformationen, native CAD-Rays, triangulierungsfreie
Schreibweise und Double-Exporttessellierung. Das obligatorische native
Laufzeitgate ist bis zum erfolgreichen WASM-Build offen. Druckmesh-Export darf
bei fehlender Double-Schnittstelle nicht auf den Float32-Anzeigextraktor
zurückfallen. UI-/KI-Integration, geometrische Herkunft/Wiederzuordnung,
unabhängiges STEP-Lesen und vollständige portable Abnahme bleiben offen.
Der produktive Editor und die ausgelieferten Pakete sind weiterhin 0.10/Format4.

### Laufender CAD-Umstieg: bestätigter Zustand und native Oberfläche

Der isolierte CAD-Controller, der Befehlsrouter und der dauerhafte Browserworker
verwenden denselben nativen Kernel. Anzeige-/Exportqualität sind getrennte
Einstellungen und verändern die Modellrevision nicht. Quellen bleiben vollständig
affin; native Grenzen, Strahl-/Normalenabfragen und Präzisionswerkzeuge verwenden
CAD-Geometrie. `src/cad-main.js` integriert die vorhandenen Bedienelemente für den
neuen Format-5-Pfad; der produktive Einstieg bleibt bis zur vollständigen Abnahme
bei Version 0.10.0. Der vollständige Auftrag in `CAD-UMSTELLUNG-AUFTRAG.md` und die
Prüfmatrix bleiben maßgeblich; eine teilweise Umstellung ist keine Auslieferung.

STEP-Export registriert die nativen Writerparameter vor ihrer Verwendung und
schützt Unicode-Namen mit Part-21-Encoding. Ein zusätzlicher STEP-Strukturparser
und eine separate offizielle portable FreeCAD-Anwendung mit OCCT 7.8.1 lesen die
unveränderten AP214-Dateien. Geometrieprüfungen unterscheiden echte native
Optimalgrenzen von unbeschnittenen Surface-Bounds und adaptive Volumenintegration
von fester Quadratur. Fehlgeschlagene externe Leser werden separat dokumentiert.

### Aktueller Produktstand und Verschiebeleistung (11.10.2026)

Die vollständige native Ausgabe 0.11.0 ist inzwischen produktiv; `index.html`
verwendet `cad-main.js`. Projektformat 5, ein gemeinsamer OCCT-Kern und die
separate portable Ausgabe sind einschließlich tatsächlichem EXE-/HTTP-/MCP-Test
abgenommen. Ältere Aussagen über einen noch offenen Produktwechsel sind historisch.

Beim Loslassen eines verschobenen Teils werden unveränderte Geometrie und
Farbbereiche wiederverwendet. Der CAD-Dienst hält getrennte begrenzte Caches für
Körper, Darstellung und native Prüfwerte. Prüfwerte sind an die vollständigen
BRep-Bytes und die lineare Transformation gebunden; reine Translation verschiebt
native Extrema und erhält das Volumen. Eingelesene Projektstatistiken gelten
weiterhin nicht als Geometriebeweis. Neue Quellen/BRep oder lineare Matrizen
erfordern neue native Prüfung; Anzeigequalität und Farbdaten invalidieren die
betroffenen Darstellungen. Export und Flächenbezüge bleiben native CAD-Pfade.

Die vor Übernahme geprüfte Darstellung wird beim anschließenden Refresh direkt
verwendet. Die Abbruchanzeige erscheint erst bei Berechnungen über 200 ms und
hat auch im Dunkelmodus lesbare Farben. `cad-move-performance.test.mjs` prüft
Wiederverwendung ohne native Neuberechnung sowie Invalidation, affine Grenzen,
Arbeitsbereich, fehlerhafte BRep und Cachegrenzen. `cad-app-move-desktop.cjs`
prüft echte Mauszüge, zurückkehrende acht Eckgriffe/Markierung, unveränderte
Quellgeometrie, genau einen Undo-Schritt, Undo/Redo und unabhängige Anzeigequalität.

### Ausrichten bei Mehrfachauswahl (11.10.2026)

Das Ausrichten-Panel darf nicht im Einzelobjekt-Inspector liegen: Dieser ist bei
Mehrfachauswahl ausgeblendet. Zuvor wurden beim Aktivieren gleichzeitig die
Transformationsgriffe deaktiviert und das Werkzeug unsichtbar, was wie ein
Hänger wirkte. Die native Oberfläche setzt das Panel außerhalb des Inspectors,
blendet den leeren Hinweis währenddessen aus und öffnet bei schmalen Fenstern
die Eigenschaften. „Ausrichten beenden“ und Esc stellen die Griffe wieder her.
Idle-Abbruch behält den geladenen CAD-Worker und seine Caches; nur tatsächliche
laufende Aufträge werden beendet. Die echte Berechnung bleibt abbrechbar.
`cad-app-align-desktop.cjs` prüft sichtbare Bedienelemente mit echten Mausklicks,
zwei Teile einschließlich einer Lochform, unveränderte Worker-Generation,
native Ausrichtung, einen Undo-Schritt, exaktes Undo und Werkzeugende.
### Live-Maße beim Ziehen an Eckgriffen (11.10.2026)

Der native Renderer zeigt ab dem Drücken eines Eckgriffs Breite, Tiefe und Höhe
in Millimetern direkt am Modell. Bildschirmbezogene Maßlinien mit Pfeilen folgen
der aktuellen affinen Vorschau; Maßfelder verwenden dieselben lokalen Maße wie
die anschließende CAD-Eckskalierung, einschließlich Rasterfang. Gruppenquellen
zeigen wie der vorhandene Maßdialog die Quellenmaße vor Elterngruppenskalierung.
Die Anzeige benötigt keine CAD-Neuberechnung während des Ziehens. Sichtbarkeit,
DE/EN-Zahlenformat, Hell-/Dunkelmodus und getrennte Felder bei kantenparalleler
Ansicht werden in `cad-scale-dimensions.js` verwaltet. Loslassen, Escape und
Pointercancel entfernen die Anzeige; ein Eckklick öffnet weiterhin den Maßdialog.

`npm run test:cad-scale-ui` prüft mit echten Mausereignissen Live-Werte vor der
Übernahme, Übereinstimmung mit übernommenen nativen CAD-Maßen, affine Spiegelung/
Scherung, eine Gruppenquelle, genau einen Undo-Schritt und exaktes Undo sowie
Abbruch ohne Modelländerung. Die bestehende Gesten-Suite bestand ebenfalls.


### Getrennte Skaliergriffe für X/Y und Höhe (11.10.2026)

Die native Einzelteil-/Quellenbearbeitung verwendet vier untere Eckgriffe
für X/Y gemeinsam, vier Seitenmittelgriffe für X oder Y einzeln und einen
weißen oberen Mittelgriff ausschließlich für Z/Höhe. Unbeteiligte lokale Maße
werden auch bei Rasterfang nicht gerundet. Das lokale Gegenlager und der Boden
bleiben durch resizeCadAtCorner fest; affine Spiegelung/Scherung bleibt erhalten.
Der schwarze Kegel dient weiterhin ausschließlich zum Anheben/Verschieben und
ist vom Höhenmaßgriff räumlich getrennt. Der zentrale Skaliergizmo wird bei einem
CAD-Einzelteil durch diese Griffe ersetzt; Verschieben/Drehen und Mehrfachauswahl
behalten ihre bestehenden Werkzeuge. Live-Maße gelten für alle Skaliergriffe.

Pointerdelta wird auf die projizierten lokalen Achsen abgebildet. Eckzug löst
nur X/Y; bei kantenparalleler Ansicht bleibt die nicht sichtbare Achse stehen.
Der Höhengriff nutzt bei Blick entlang Z eine vertikale Mausbewegung. Geänderte
Maße respektieren Raster und Größenlimits, unveränderte Maße bleiben exakt.
Griffe folgen der affinen Livevorschau; Abbruch stellt den Anfangszustand her.
Die echte Mausprüfung testet beide Seitengriffe je Achse, separaten Höhengriff,
XY-Ecken, Gruppenquellen und gescherte/gespiegelte Teile einschließlich fester
Anker, exaktem Undo und unveränderter anderen Achsen.


### Ausrichtungspunkte wieder direkt auf der Arbeitsfläche (11.10.2026)

Die native CAD-Oberfläche ergänzt wieder neun anklickbare Punkte mit Führungslinien
und gestricheltem Auswahlrahmen: Minimum, Mitte und Maximum pro Achse. Die Punkte
folgen Kamera, Zoom, Projektion und Fenstergröße. Kurze oder kantenparallele
Achsen erhalten getrennte Bildschirmziele. Welt-/Arbeitsebenenmodus verwenden
X/Y/Z beziehungsweise U/V/N. Bereits ausgerichtete Positionen sind grau und
lösen keinen weiteren Undo-Schritt aus. Die Seitenleistenknöpfe bleiben nutzbar.

Ein gemeinsamer Plan aus nativen CAD-Grenzen im aktiven Koordinatenrahmen steuert
Bildpunkte, Hover-Vorschau und Seitenleiste. Hover/Fokus zeigt eine goldene
transparente Darstellung, ohne Projekt, BRep, Modellrevision oder Undo zu ändern.
Vorschauobjekte verwenden geteilte Anzeigegometrie und eigene Materialien;
Entfernen der Vorschau entsorgt ausschließlich diese Materialien. Die feste
Referenz bleibt beim Ausrichten unverändert und wird goldfarben markiert, auch
wenn sie gesperrt ist. Fremde Sperren und Quellen bleiben erhalten.

Klick übernimmt die Translation als einen Undo-Schritt. Referenz-/Revisionswechsel
verwerfen alte Pläne; Escape, Werkzeugwechsel oder Einzelwahl entfernen Punkte
und Vorschau. Eine native Bounds-Abfrage liefert Grenzen aller beteiligten Teile;
Hover und Kameraänderungen erzeugen keine nativen Geometrieabfragen.
`npm run test:cad-align-markers-ui` prüft die neun Punkte mit echter Maus,
Vorschau ohne Mutation, Native-Maße nach Ausrichtung, exaktes Undo, Referenz,
Arbeitsebene, Ansichtswechsel, schmales Fenster und Werkzeugende.

### Ausrichten per Leerflächenklick beenden und berührende Rahmenauswahl (11.10.2026)

Ein linker Klick auf freie Arbeitsfläche beendet das Ausrichten sofort, entfernt
Punkte/Vorschau und stellt die Transformationsgriffe wieder her. Die Auswahl
bleibt erhalten. Teileklicks behalten ihre Referenzwahl. Ein weiterer gewöhnlicher
Leerflächenklick hebt die Auswahl auf. Der CAD-Worker wird im Leerlauf erhalten.

Rahmenauswahl verwendet jetzt die projizierten Anzeigedreiecke statt vollständiger
Einschließung der acht Welt-Bounds-Ecken. Jede Berührung genügt in beiden
Ziehrichtungen und wird während des Ziehens sichtbar. Leere Silhouettenbereiche
und echte Öffnungen lösen keine Auswahl aus; verdeckte Teile bleiben wie bei der
bisherigen Rahmenauswahl erreichbar. Homogene Clippingebenen berücksichtigen
Perspektive, orthografische Ansicht und Kameragrenzen. Welt-Bounds dienen nur zur
schnellen Ablehnung. Umschalt ergänzt die zu Zugbeginn gespeicherte Auswahl;
Schrumpfen entfernt neu berührte Teile wieder. Esc/Pointercancel/Captureverlust
stellen die Anfangsauswahl wieder her. Versteckte Teile bleiben ausgeschlossen,
gesperrte Teile sind auswählbar. Modell, Quellen, Revision und Undo bleiben erhalten.

`npm run test:cad-selection` prüft Kontakt, Flächenquerung, Lücken, affine
Transformation und Clipping. `npm run test:cad-selection-ui` prüft echte
Mauszüge mit zwei Teilen einschließlich Lochform, beide Projektionen und
Ziehrichtungen, Liveauswahl/Schrumpfen/Umschalt/Esc, versteckte/gesperrte Teile,
Rohröffnung/kurvige Silhouette und Leerflächenklick samt Worker-/Modellstabilität.

### Schnellere native Gruppen, Körperprüfungen und Farbaufteilung (11.10.2026)

Mehrere aktive Schneidquellen werden mit einer gemeinsamen OCCT-Cut-Operation
berechnet. Ein gemeinsamer nativer Common liefert die entfernte Masse auch bei
überlappenden oder affinen Schneidkörpern. Die ursprünglichen Quellen bleiben
editierbar. Kleine Restvolumina werden direkt nativ integriert; Ergebnisse müssen
weiterhin vollständige Körper-, Topologie- und Arbeitsbereichsprüfungen bestehen.
Bei einem Fehler im gemeinsamen Schnitt verwendet der Dienst den bestehenden
sequenziellen Ablauf. Unterdrückte Quellen und Gruppen-Flächenbezüge bleiben erhalten.

`validateCadSolid` speichert vollständige native Prüfergebnisse ausschließlich
unter den aktuellen triangulierungsfreien BRep-Bytes. Geänderte Orientierung,
Geometrie oder native Flags erzwingen einen neuen Nachweis. Mutierbare Handles
und eingelesene Projektstatistiken ersetzen diesen Nachweis nicht. Ergebnisse
werden kopiert zurückgegeben. Pro OCCT-Modul sind höchstens 64 Prüfnachweise und
32 MiB zugelassen. Eine vorhandene Fingerprint-Abfrage wird für das Volumen
wiederverwendet; BRep-Lesen braucht keine zusätzliche Volumen-Proof-Registrierung.

Die Darstellung einer mehrfarbigen Gruppe mit vollständig gleichen Farben und
Deckkräften benötigt keine Farbgrenzen. Für unterschiedliche Farben speichert
ein eigener begrenzter Dienstcache die native Regionenaufteilung unabhängig von
Farbe, Name, Deckkraft und Anzeigequalität. Regionen sind an endgültige BRep,
Quellengeometrie, Reihenfolge und Transformation gebunden. Farbwechsel verwenden
Anzeigedreiecke wieder; Qualitätswechsel tessellieren die vorhandenen Regionen.
STEP und farbige Exporte behalten ihre bisherigen benannten Quellenanteile.
Der Cache wird beim Schließen des Dienstes geleert; keine Region oder Darstellung
wird in Projekt, Revision oder Undo gespeichert.

`test:cad-group-performance` prüft gemeinsame Schnitte gegen die sequenzielle
native Geometrie einschließlich überlappender/außerhalb liegender/berührender
Löcher, affiner Spiegelung/Scherung, kleinen Resten und leerem Ergebnis. Weitere
Prüfungen sichern Mutationserkennung, Cachegrenzen, verschachtelte Schneidgruppen,
Quellbearbeitung/Persistenz, Rückfall bei nativen Fehlern und Wiederverwendung
von Farbregionen/Anzeigedreiecken bei erhaltener Exportbenennung.

Abnahme am 12.10.2026: 162 Foundationprüfungen, 46 erweiterte native Prüfungen
und die umfangreichen Editing-/Tools-Desktopprüfungen bestanden. Der zusätzliche
verschachtelte Schneidgruppenfall wurde separat bestanden. Serielle Messung mit
denselben lokalen UI-Fixtures: vier Bohrungen ca. 220 → 173 ms, zwölf Bohrungen
717 → 439 ms, mehrfarbiges Gruppieren 426 → 240 ms, Farbwechsel 208 → 52 ms,
Anzeigequalitätswechsel 130 → 29 ms. Für frisch gruppierte Einlochplatten nach
dem Aufwärmen: Median 49 → 39 ms über jeweils vier Fälle. Zeiten erfassen den
fertigen CAD-/Anzeigestand ohne künstliches Framewarten. Modell, ein Undo und
exaktes Undo wurden gleichzeitig geprüft. Lokale Maschinen-/Fixturewerte,
keine allgemeine Faktor- oder Echtzeitzusage; Kernel-WASM und Projektformat bleiben.


## Programmweite Wiederverwendung und Aktualisierung (12.10.2026)

Der Format-5-Transaktionsspeicher bietet eine tief eingefrorene Lesesicht und
kodierte Projekttexte, jeweils privat an die bestätigte Objektgeneration
gebunden. Öffentliche Snapshots und Bearbeitungsentwürfe bleiben unabhängige,
veränderbare Kopien. Vorschauen ändern die Lesesicht nicht; Apply, Load und
Undo/Redo wechseln den Cachebesitzer. Controller, Auswahl, Inspector und
Werkzeuge verwenden diese Lesesicht für reine Lesezugriffe. Mehrfachauswahl
entfernt Duplikate und ausgewählte Nachfahren mit Sets statt paarweisen Vergleichen.

UI-Aktualisierungen werden zusammengefasst. Öffnen und Undo/Redo warten auf die
bereits von der bestätigten Änderung ausgelöste Aktualisierung. Szene und
Autosicherung werden nur bei einem neuen Modellstand erneut abgefragt bzw.
geschrieben; Schreibfehler setzen den Autosicherungsstand nicht weiter.
Unveränderte Anzeigequalität speichert und berechnet nichts neu. PortableStorage
liest weiterhin Datei/Profil und prüft die erwartete Revision, bevor identische
UTF-8-Dateibytes ohne erneutes atomisches Schreiben bestätigt werden. Externe
Änderungen, Schreibfehler und Größenbeschränkungen behalten ihren Schutz.

Bibliothek und Objektbaum erhalten ihre DOM-Elemente bei unveränderten Inhalten;
Auswahl aktualisiert Klassen. Der Baum berücksichtigt Namen, Hierarchie,
Container, Sichtbarkeit, Sperren, Quellenunterdrückung, Sprache und aufgeklappte
Quellen. Der Inspector erhält seine bisherigen Fokusregeln. Unveränderte native
Anzeigepuffer behalten ihre Three.js-Geometrie und Materialien. Ein vorbereiteter
Anzeigeplan wird vor Apply geprüft und beim anschließenden Anzeigen übernommen;
vorherige Körper werden erst nach erfolgreicher Prüfung ersetzt. Neue und
wiederverwendete Ressourcen haben getrennte Eigentümerschaft. Ungültige Puffer
und das 128-MiB-Limit dürfen die bestehende Szene nicht zerstören. Arbeitsflächen-
gitter und identische Ausrichtungs-/Maß-Overlays werden nicht erneut aufgebaut.
Der bestehende Renderloop bleibt bestehen; es gibt keine ungemessene FPS-Zusage.

Geometrisch identische Gruppen ohne eigene Kantenoperation können ihren nativen
Geometriecache trotz neuer Quellen-IDs beim Duplizieren/Einfügen/Muster verwenden.
IDs und Herkunftsbezüge bleiben unabhängige Modelldaten; Gruppen mit finish
behalten die Herkunfts-IDs im Schlüssel. Native Maßabfragen benutzen die bereits
geprüften BRep-/Transformationsnachweise auch in beliebigen affinen Bezugsrahmen,
niemals die Grenzen eines Anzeigegitters oder ungeprüfte gespeicherte Statistik.

STL vereinigt strikt getrennte native Körper in einem OCCT-Fuse. Trennung wird
mit nativen Grenzen einschließlich Abstand zu tatsächlichen Formtoleranzen
bewiesen; die native Volumensumme gilt ausschließlich für diese getrennten
Körper. Der Endkörper besteht die vollständige native Prüfung. Berührungen,
Überlappung und Batchfehler verwenden die bewährte sequenzielle Vereinigung.
Vorhandene lokale Farbregionen aus der Anzeige werden beim Export trotz
Root-Translation wiederverwendet; kalte Exporte behalten den einfachen
Welt-Platzierungspfad und cachen ihre Regionen. Namen, Quellenreihenfolge, Opazität und Farben bleiben erhalten.
Ein eigener begrenzter Float64-Exportcache verhindert wiederholte Tessellierung
bei identischer tatsächlicher BRep-Geometrie und Exportqualität. Alle diese
Caches bleiben außerhalb von Projektdateien, Revisionen und Undo.

`test:cad-program-performance` prüft unabhängige Kopien einschließlich nativer
Abrundung und remappter Kantenherkunft, Editierung der Kopie, native Maße in
Spiegel-/Scherrahmen, Batch-/sequenzielle Exportdreiecke und Volumen, Fehler-
rückfall, Exportumfang sowie Übersetzung/Stil/Buffer-Isolation der Exportcaches.
`test:cad-program-performance-ui` prüft 180 Teile, stabile DOM-/Geometrieobjekte,
Autosicherung/Undo/Redo/Open, unveränderte Einstellungen und atomische Anzeigefehler.


Abnahme: 168 Foundationprüfungen, danach die ergänzte native Finish-Kopierprüfung
und die tatsächlich ausgeführte Batchvereinigung, 46 erweiterte native Prüfungen,
20 Zustands-/Storageprüfungen und die breite echte Editing-/Tools-/Import-/
Auswahl-/Marker-/Maß-/Move-Bedienung bestanden. Die gezielte native Export-/
Cache-Abnahme umfasst zuletzt 18 Fälle. STL-Batchtests zählen eine native Build-
Operation und null paarweise Common-Operationen; ein korrektes Ergebnis allein
reicht nicht als Nachweis der Beschleunigung. Gemeinsame STL-Dreiecke werden
zusätzlich zwischen alter und neuer verpackbarer Oberfläche exakt verglichen.
Lokales serielles Fixture all (180): 1964.4 → 14.6 ms.
Lokales serielles Fixture move (180): 563.2 → 193.9 ms.
Lokales serielles Fixture undo (180): 579.4 → 130.7 ms.
Lokales serielles Fixture redo (180): 526.7 → 104.6 ms.
Lokales serielles Fixture duplicate-group (Testplatte): 139.7 → 31.2 ms.
Lokales serielles Fixture bounds-repeat (Testplatte): 14.9 → 1.5 ms.
Lokales serielles Fixture export-obj-repeat (Testplatte): 133.5 → 34.2 ms.
Lokales serielles Fixture export-stl (60): 7932.7 → 1076.3 ms.
Keine allgemeine Laufzeit- oder GPU-Zusage; Projektformat und Kernel-WASM bleiben.


## Export von Abrundungspolen (12.10.2026)

OCCT kann an abgerundeten Eck-/Polpunkten flächenlose Dreiecke mit identischen
Knoten erzeugen, obwohl der native Körper gültig ist. Der Float64-Exportadapter
entfernt jetzt ausschließlich exakt flächenlose Dreiecke vor Speicherung im
Exportcache und vor dem Encoding aller Mesh-Formate. Double-Koordinaten,
Reihenfolge/Orientierung der positiven Dreiecke und native Face-IDs bleiben
unverändert; die Offsets und Indexanzahlen der Face-Gruppen werden angepasst.
Eine komplett ohne positive Dreiecke verbleibende Fläche ist weiterhin ein
Fehler. Es gibt keinen Flächen-Epsilonfilter und keine Änderung an BRep,
Quellen, Konstruktionstoleranz, Anzeige, Revision oder Undo.

Der neue Exporthelfer benutzt ein schnelles Kreuzprodukt mit konservativer
Fehlerschranke und bei unsicherer Nullfläche bzw. Über-/Unterlauf exakte
Binärarithmetik der Double-Koordinaten. Positive, selbst sehr kleine Dreiecke
werden erhalten; STL-Normalen benutzen denselben robusten Helfer. Direkte
Encoder-Aufrufe mit ungeprüften flächenlosen Dreiecken werden weiter abgelehnt.
`test:cad-export-triangles` prüft degenerierte/kollineare Dreiecke, kleine
positive Flächen einschließlich Unterlauf, große Koordinaten, fehlende ganze
Flächen, Face-Zuordnung sowie native abgerundete und affin skalierte Quader/
Pyramiden samt Vereinigung bei mehreren Exportqualitäten und unveränderten
CAD-Daten. Der native Kernel/WASM muss hierfür nicht neu gebaut werden.


## Kompakter API-KI-Chat mit Bildreferenzen (12.10.2026)

Die native CAD-Oberfläche zeigt unten rechts auf der Arbeitsfläche einen
kompakten, einklappbaren KI-Chat. Der Kopf-KI-Button öffnet diesen Chat; über ↗
bleibt die große KI-Werkstatt einschließlich JSON-/Kontextfunktionen erreichbar.
Nachrichten, Rückfragen und Erklärungen erhalten einen begrenzten Verlauf.
PNG/JPEG/WebP-Bilder lassen sich über Dateiauswahl, Drag-and-drop oder Einfügen
anhängen, vor dem Senden ansehen und entfernen. Enter sendet, Shift+Enter
fügt einen Zeilenumbruch ein. API-Einstellungen benutzen weiterhin den
bestehenden Anbieter, das Modell und dessen Schlüsselverwaltung.

`ai-provider.cjs` unterstützt optionale Bilder, Verlauf und Chatantworten neben
den bisherigen JSON-CAD-Vorschlägen. Responses erhält `input_image`, die
kompatible Chat-API `image_url`, jeweils mit lokalen Base64-Data-URLs gemäß
[OpenAI Docs: Images and vision](https://developers.openai.com/api/docs/guides/images-vision).
Bilder benötigen ein bildfähiges Anbieter-Modell. Der Renderer sendet nur auf
explizites Senden; HTTP-Aufrufe und Schlüssel verbleiben im nativen Backend.
Anhänge werden nicht in CAD-Projekt, Autosicherung oder Einstellungen geschrieben.
Der Verlauf bleibt in Arbeitsspeicher; API-Kontext und Bilder sind begrenzt.
Die gemeinsamen Limits stehen in `backend/ai-input-limits.json`: PNG/JPEG/WebP,
5 MiB je Bild, vier Anhänge/12 MiB je Nachricht, maximal acht Bilder/20 MiB im
API-Kontext und zwölf vorherige Nachrichten. Die Oberfläche behält höchstens
24 sichtbare Nachrichten und kleine Vorschau-Thumbnails. Zu alte Kontextanteile
werden entfernt. Ungültige Base64-Daten, MIME-/Signaturabweichungen, Remote-URLs,
SVG und unzulässige Rollen werden vor dem Anbieteraufruf zurückgewiesen.

Antworten werden als Text angezeigt. CAD-Vorschläge werden vollständig nativ
geprüft und brauchen weiterhin explizites Übernehmen; Ansehen und Verwerfen sind
im Chat erreichbar. Rückfragen, Fehler und Abbruch ändern keinen bestätigten
CAD-Stand. Abbrechen umfasst die Anbieteranfrage und eine anschließend laufende
native Vorschau; verspätete Ergebnisse werden über einen Request-Zähler verworfen.
Entwurf/Bilder bleiben bei Fehlern oder Abbruch zum erneuten Senden erhalten.
Der bestehende Offline-/MCP-Vertrag und die bisherigen CAD-Optimierungen bleiben.

`test:cad-ai-chat` prüft beide Providerprotokolle, Bild-/Verlaufspayloads,
Erklärungen, native Revisionen sowie ungültige Inputs mit einem lokalen Mock.
`test:cad-ai-chat-ui` prüft echte IPC, Dateiauswahl und Enter, Bildreferenz bei
Rückfragen, native Vorschau/Apply/Undo/Redo, Paste/Drop, Anbieter- und nativen
Abbruch, Fehlerredaktion, unzulässige Bilder, untrusted HTML als Text,
Einklappen/Werkstatt/API-Einstellungen und enge Fenster. Es werden keine echten
Cloudanfragen, Nutzermodelle, Zugangsdaten oder Benutzer-Clipboarddaten verwendet.

## Anbieter- und Modellauswahl im KI-Chat (12.10.2026)

Der kleine Chat enthält Anbieter- und Modellauswahl sowie eine Aktualisieren-
Schaltfläche. DeepSeek listet die aktuellen Varianten und die weiterhin
unterstützten V4-Flash/Vision-Exp-Aliase; zusätzliche Modelle kommen aus der
Anbieterantwort. OpenAI/GPT-Modelle werden mit dem eingerichteten Schlüssel über
GET /models geladen. Reine Audio-, Realtime-, Bildgenerator-, Embedding- und
Instruct-Endpunkte werden aus der CAD-Chatliste gefiltert. Ein manuell
konfiguriertes Modell bleibt erreichbar. Keine automatische Modellumstellung
beim Update. Modellinformationen sind Anbieter-Daten und werden als Text gezeigt.
Quellen: https://api-docs.deepseek.com/api/list-models/,
https://api-docs.deepseek.com/quick_start/pricing/ und
https://developers.openai.com/api/reference/resources/models/methods/list.

Neue Backendmodule ai-profiles.cjs und ai-models.cjs halten Anbieterprofile nach
validiertem API-Origin getrennt. Das bisherige config/encryptedKey-Format wird
weiter gelesen; version 2 enthält außerdem profiles. Ein bestehender
verschlüsselter Schlüssel bleibt bei Modellwechsel bytegleich. Ein Anbieter
bekommt ausschließlich seinen eigenen Schlüssel. rememberKey=false bleibt
sitzungsbezogen; Schlüssel werden nie in öffentliche IPC-Antworten aufgenommen.
Fehlende oder auf diesem PC nicht entschlüsselbare gespeicherte Schlüssel werden
beim Wechsel nicht auf einen anderen Anbieter übertragen. Nicht entschlüsselbare
verschlüsselte Einträge bleiben für spätere Wiederherstellung erhalten.
Eine fehlgeschlagene Dateischreibung verändert den Zustand nicht. API-Einstellungen
zeigen den gewählten Anbieter und verwalten dessen Schlüssel separat; Löschen
betrifft nur diesen Anbieter. Lokale Bridge-Aktivierung bleibt anbieterunabhängig.

Der Modellkatalog wird fünf Minuten pro Basisadresse im Backend gecacht und kann
explizit aktualisiert werden. Abrufen überträgt keine Chat-/Bild-/Modelldaten.
GPT-Optionen werden ohne eigenen API-Schlüssel deaktiviert; die Oberfläche nennt
die Einrichtung über das Zahnrad. Bekannte bzw. vom Anbieter gemeldete Bildfähigkeit
wird angezeigt. DeepSeek Pro und ausdrücklich reine Textmodelle blockieren Bilder
auch im Verlauf vor dem Senden; Entwurf/Bilder bleiben erhalten. OpenAI /models
meldet nicht durchgehend Bildfähigkeit: unbekannte Fälle werden als abhängig vom
Modell gekennzeichnet, nicht als geprüft behauptet. Anbieter-/Modellwechsel sind
während laufender Anfragen in UI und Backend gesperrt; Chatverlauf bleibt erhalten
und geht erst beim nächsten expliziten Senden an den dann ausgewählten Anbieter.

Gezielte Prüfungen: tests/cad-ai-models.test.cjs für Profilmigration,
Schlüsseltrennung/-erhalt, Wiederherstellung, Diskfehler und Modellkatalog;
tests/cad-app-ai-models-desktop.cjs für tatsächliche Desktop-IPC, Modellwahl,
Anbieterverbindungen, Bild-/Verlaufssenden, Bildsperren, sichere Fehlermeldungen,
Abbruch und enge Fenster. Tests verwenden isolierte Profile und lokale Mock-APIs
mit Testschlüsseln; keine Nutzerzugangsdaten oder echten Cloudanfragen.

## KI-Bearbeitung und tatsächliche Rückmeldungen (12.10.2026)

Der Anbieterauftrag erlaubt ausdrücklich alle dokumentierten CAD-Befehle zur
Erstellung und Bearbeitung vorhandener Teile und Gruppenquellen. Klare Aufträge
berechtigen zur Vorschau ohne weitere Freigaberückfrage. Maße aus Szene und
Nutzerangaben werden wiederverwendet; bei einer reinen Höhenänderung bleiben die
anderen Achsmaße und der lokale Boden erhalten. Rückfragen betreffen fehlende
wesentliche Angaben oder mehrdeutige Ziele. Bei ausdrücklich erlaubten Schätzungen
oder Entwürfen darf die KI Maße wählen und muss die Annahmen offen benennen.
Unskalierte Bilder gelten weiterhin nicht als exakte physische Maßquelle.

Die Automationsszene enthält zusätzlich `selectionTargets` mit vollständigen
`{rootId,path}`-Adressen. `selection` bleibt aus Kompatibilitätsgründen eine Liste
der Root-IDs. Ein ausgewähltes Kind wird damit im API-Chat eindeutig adressierbar;
eine Kind-ID allein ist keine gültige Root-Adresse. Die Details stehen im
`editingGuidance`-Abschnitt des gemeinsamen, generierten KI-Kontexts.

Fehler im kleinen Chat werden als Formnaro gekennzeichnet. Der begrenzte Verlauf
behält auch fehlgeschlagene Nutzeraufträge und die vom Anbieter erhaltenen
Befehlsvorschläge. Tatsächliche Vorschau-/Übernahme-/Verwerfen-/Fehlerergebnisse
stehen als `[Formnaro application feedback]` in normalen User-Verlaufseinträgen,
ohne zusätzliche Systemrolle. Sie gehen beim nächsten ausdrücklichen Senden mit
der frisch gelesenen Szene an den Anbieter. Auch die große Werkstatt meldet
Übernahme/Verwerfen in denselben Chatverlauf. Lange Vorschläge werden innerhalb
des vorhandenen Textlimits explizit als gekürzt gekennzeichnet. Verlauf, Entwurf
und Bilder bleiben im Arbeitsspeicher; Fehler/Abbruch erhalten Entwurf und Bilder.
Keine zusätzlichen automatischen Anbieteraufrufe. Vorschau, explizites Übernehmen,
Revisionen, Sperren, native Validierung und Undo bleiben verbindlich.

## Schriften, Seitenleisten und Sammelversion 0.12 (12.10.2026)

Das Textwerkzeug enthält die bisherigen drei Schriften und 61 zusätzliche
Original-Schriftdateien bzw. Schriftschnitte aus 53 freien Google-Fonts-Familien.
Schriftkatalog mit Suche, Gruppen und Vorschau. Alle mitgelieferten Originale
liegen offline vor und werden erst bei Auswahl geladen. SIL-OFL-Copyrighttexte,
fixierte Upstream-Revision und Original-SHA256 stehen in `licenses/fonts/`.
OpenType.js 2.0.0 (MIT, Original-Lizenz beigefügt) liest TTF und CFF-OTF.
Originale Linien sowie quadratische/kubische Bézierkurven werden direkt an die
CAD-Klassifizierung übergeben. Nur exakt konstante, flächenlose Schriftsegmente
werden ausgelassen; Konturen werden nicht zu Polylinien angenähert. Kerning
neuer Schriften wird aus dem Original übernommen. Die drei bisherigen
FontLoader-Schriften behalten ihre bisherigen Konturen und Abstände.

Eigene TTF/OTF-Dateien lassen sich im Textwerkzeug importieren und entfernen.
Bis zu 50 Dateien, je 5 MiB und zusammen 20 MiB. Eigene Originaldateien liegen
als eigene portable Bibliothek `Daten/schriften.json`, unabhängig vom Modell.
Imports prüfen Dateiheader, Tabellen und OpenType-Metadaten im CAD-Worker;
native Textänderungen bleiben transaktional. Gespeicherte Projektkonturen und
BReps halten vorhandene Texte und Exporte auch ohne Schriftdatei verwendbar.
Zum Ändern des Textinhalts muss die Originalschrift verfügbar sein oder eine
andere Schrift gewählt werden; fehlende Schriften und Zeichen werden angezeigt.
Schriftdateien werden weder aus dem Netz nachgeladen noch an einen KI-Anbieter
übertragen. Die KI erhält nur IDs und Namen der aktuell verfügbaren Schriften.
Der Worker lädt eigene Schriften nach Neustart erneut aus dem portablen Bestand.
Eine fatale native WASM-Ausnahme beendet den betroffenen Worker; der nächste
Auftrag startet aus dem bestätigten Projekt, ohne den Modellstand zu ersetzen.

Beide Seitenleisten besitzen kleine Pfeiltaster zum Einklappen. Die Arbeitsfläche
bekommt den freigewordenen Platz. Einklappzustände und Seitentausch gehören zur
Layoutverwaltung; alte Layouts bleiben lesbar und starten mit geöffneten Leisten.
Einstellungen → Oberfläche bietet zusätzlich „Seiten links/rechts tauschen“.
Bestehendes Drag-and-drop und die Tastaturbedienung des Layouts bleiben nutzbar. Der KI-Chat sitzt
im unteren Bereich der physischen rechten Seitenleiste und folgt beim Seitentausch
dieser Position; er überlagert die Arbeitsfläche nicht. Der Kopf-KI-Knopf öffnet
auch die eingeklappte Chatseite. Nachrichten, Entwürfe und Bilder bleiben dabei
erhalten. Vorschau/Übernehmen, Anbieterwahl und Bildanhänge bleiben verfügbar.

0.12.0 umfasst zusätzlich die bisherigen nativen Leistungsverbesserungen,
STL-Nullflächenkorrektur, Bildchat/Modellwahl und KI-Fehlerrückmeldungen. Das
Projektformat bleibt 5, die lokale KI-API bleibt 1; der native Kernel bleibt
unverändert. Paket-/Versionsanzeige und generierter KI-Kontext nennen 0.12.0.

## Cloud-Entwicklung (12.10.2026)
GitHub Codespaces wird über .devcontainer/devcontainer.json mit Node.js 22 vorbereitet. Der Zweig cloud-development ist der Einstieg für ortsunabhängige Entwicklung und wird mit dem abschließend geprüften STL-CAD-Stand aktualisiert. postCreateCommand installiert npm-Abhängigkeiten, prüft die gemeinsame CAD-Runtime und baut das Frontend. npm run dev:cloud stellt die Browser-Vorschau auf Port 5173 bereit; Vite erlaubt bei Codespaces nur den aus den Codespaces-Umgebungsvariablen abgeleiteten zusätzlichen Host. Windows-/Electron-Abnahme bleibt separat. Siehe docs/CLOUD-ENTWICKLUNG.md. Persönliche Profile, Modelle, Schlüssel und work bleiben außerhalb von Git.
Die Dateien unter cad-kernel-build/runtime bleiben mit .gitattributes (-text) bytegenau erhalten; Git-Zeilenendennormalisierung darf die SHA256-geprüfte Laufzeit und ihre Lizenztexte nicht verändern.


## STL-CAD-Prüfung 2 – technische Abnahme

ASCII-STL wird für CAD mit Double-Koordinaten gelesen; STL-Volumenintegration
ist durch einen nahen Bezugspunkt gegen große Offsets stabilisiert. Unveränderte
importierte BRep-Quellen bleiben nach nativer Validierung bytegleich, während
Statistiken weiterhin unabhängig geprüft werden. Eigenständige Prüfungen
belegen diese Eigenschaften auch für gekrümmte Körper und manipulierte Stats.

Die lokale Gehäuseauswahl umfasst 25 Fälle sowie fünf Transformationsvarianten.
Sechs verbindliche Gehäuse und das Referenzmodell bestehen. 177 native
Grundprüfungen wurden nach dem BRep-Erhaltungsfix wiederholt; die breite
Programmabnahme umfasst 34 Gates einschließlich 17 Desktopabläufen, Schriften,
KI-Mocks, unabhängiger STEP-Leser und Electron/HTTP/Python-MCP. Quell-/Asset-
Manifeste und private Modelle/Einzelfallberichte bleiben unter work. Die neue
portable Ausgabe bleibt separat unter release-formnaro-stl-cad-preview2;
Projektformat 5, API 1 und CAD-Kern bleiben kompatibel.

Abschluss: 17 von 25 lokalen Dateien als CAD konvertiert, acht nach klaren
Netz-/Ressourcenkriterien abgewiesen. Oberflächen-Korrespondenzgrenze unter
0,0201 mm, kritische Geometrie unter 0,04003 mm, Volumenabweichung höchstens
0,63478 %. Separate gepackte EXE: 25 native Schnittstellen-/UI-Prüfungen grün.
Die gepackten Frontend-/Preload-/Backenddateien bestehen sieben erforderliche
Dateiimporte mit Speicherung/STEP/Undo/Redo, Bearbeitung, Fehlerrollback,
Abbruch/Worker-Neustart und 30 Wiederholungen. Alle sieben STEP-Ergebnisse
sind auch im getrennten offiziellen FreeCAD-Reader gültige geschlossene Solids;
dieser Reader nutzt dieselbe OCCT-Algorithmusfamilie, keinen Formnaro-WASM.
170 Runtime-Dateien gegen Produktionsstand geprüft, genau ein CAD-Kern.
Portable ZIP einschließlich Quellen/Lizenzen vollständig CRC-geprüft.
Diese Ergebnisse belegen die dokumentierten Fälle, keine beliebigen
Dauersitzungen oder allgemeine G1-Tangentenstetigkeit.

Die GitHub-Vorabversion heißt `v0.12.0-stl-cad-pruefung2`; der Programmname
zeigt weiterhin `0.12.0 · STL-CAD-Prüfung 2`. Der bisherige reguläre Download
0.10 bleibt erhalten. Die vollständige lokale Historie `work/kontext.txt`
bleibt außerhalb von Git; dieser gemeinsame Kontext enthält die technischen
Änderungen und Prüfzusammenfassung ohne persönliche Modelle oder Profile.

## Optionaler Trimesh-Reparaturversuch (12.10.2026)

Separates Offline-Python-Werkzeug `scripts/repair-stl-trimesh.py`, fixe optionale
Abhängigkeiten und acht gezielte Tests ergänzt; kein neuer App-/Kernelstand und
keine automatische Reparatur im Importdialog. Exakte Punktvereinigung,
Nullflächen-/Duplikatbereinigung und Trimesh-Orientierung; kleine Lochfüllung
explizit optional. Eigene ebenfalls optionale Ergänzung teilt bei isolierten
exakt kollinearen Nullflächen eine Nachbarkante am bereits vorhandenen Punkt.
Diese Kantenunterteilung ist keine eingebaute Trimesh-Funktion.

Reine Standardreparatur rettet keinen der vier ungültigen lokalen Fälle;
zusammen mit der kollinearen Kantenunterteilung besteht ein weiterer echter
Fall die native Solid-/Projekt-/STEP-Prüfung. Unabhängige Oberflächenproben
gegen die Original-STL maximal 0,015795 mm, separater Korrespondenzbound
0,02001 mm, CAD-Volumendelta etwa 0,3052 %. Reparierte STL-Koordinaten,
Außenmaße und berechnetes Volumen bleiben unverändert. Alle 17 bislang gültigen
Eingaben benötigen keine Bereinigung. Leere/nichtmannigfaltige Netze sowie
Datei-/Dreiecks-/BRep-Limits bleiben Grenzen. Keine relevante Speicherersparnis
belegt. Siehe `docs/STL-REPARATUR.md`; persönliche Rohbelege nur unter `work`.

## Integrierte STL-Reparatur und Speicher (12.10.2026)

Die erprobten Reparaturschritte sind nun als unabhängige JavaScript-Implementierung
im CAD-Worker verfügbar (`src/cad-stl-repair.js`), ohne Python-/Trimesh-Laufzeit im
portablen Programm. CAD-Importdialog: Reparatur aktiviert und abschaltbar, kleine
Lochfüllung separat und standardmäßig aus. Exakte Punktvereinigung, Nullflächen/
Duplikate, konsistente Orientierung und eigene kollineare Nachbarkantenunterteilung.
Nur dreieckige oder planare konvexe viereckige Randlücken werden optional gefüllt.
Keine Punktbewegung, Glättung, allgemeine Selbstschnittheilung oder Limitlockerung.
Die native Geometrieprüfung bleibt verbindlich; Reparaturschritte und Bezugsnetz
stehen in Objektnotizen. Fehler erhalten Modell und Importdialog. Das separate
Trimesh-Python-Werkzeug bleibt für Vergleiche/Kopien erhalten.

STL-Double-Parsing erfolgt erst im Worker, ohne zusätzliche Renderer-Netzkopie.
Sewing-/Unify-/Konstruktionsobjekte werden früher gelöscht, sobald der Folgekörper
ihre gemeinsame Topologie besitzt. Der unveränderte native CAD-Kern bleibt.
Worker meldet WASM-Kapazität; nach Übernahme eines leeren Projekts trimmt der
Controller einen mindestens 512-MiB-Worker, sobald alle wartenden Aufgaben beendet
sind. Unbestätigte Entwürfe und Undo/Redo lösen diesen Wechsel nicht aus. Große
fehlgeschlagene STL-Importe können den Worker ebenfalls freigeben. Der nächste
Auftrag initialisiert aus dem bestätigten Projekt, Modelldaten bleiben im Store.

Isolierter gleicher Speicherablauf: Spitzen-Arbeitssatz 4559,35 -> 3772,93 MiB
(−17,25 %), nach Wechsel zu kleinen Modellen 2325,09 -> 925,77 MiB (−60,18 %).
Volumen/BRep-Größen gleich. Große Importzeit 98,88 -> 115,24 s; keine Beschleunigung
behaupten. Einzelmessungen, keine allgemeine Dauersitzungs-/RAM-Garantie.
Vollständige Programm-/Paketabnahme und Installation werden lokal protokolliert.
Programm bleibt 0.12.0 mit Kennzeichnung „STL-Reparatur und Speicher“, Format5/API1.

Abschluss: 35 Freigabegruppen bestanden, darunter 180 Grund-, 46 erweiterte und
16 STL-/Reparaturprüfungen. Tatsächliche gepackte EXE 25/25, Reparaturdialog gegen
gepacktes Frontend/Preload/Backend 4/4; 66 Produktionsassets bytegleich.
Ein erwarteter Ablehnungsfehler wurde zunächst im neuen UI-Test als unerwartet
gezählt. Nach gezielter Testgerüstkorrektur wurde dieser Test vollständig
wiederholt, bereits bestandene Gruppen bei unveränderten Produktquellen erhalten
und alle fehlenden Gates ausgeführt. Frühere Berichte und Manifestaudit bleiben
lokal erhalten; keine Produktkorrektur aufgrund dieses Testfehlers.

Neue lokale portable Ausgabe `release-formnaro-stl-reparatur-speicher`; Programm,
Anwendungs-/Kernelquellen und Lizenzen im CRC-geprüften Windows-ZIP. Die vorherige
Installation wurde mit Sicherung aktualisiert; Daten und Layouts bytegleich.
Keine Veröffentlichung oder neue Cloud-Installation in diesem Auftrag.

## Arbeitsfläche und Projekte (12.10.2026)

Der CAD-Renderer ersetzt die überlappenden quadratischen GridHelper durch endliche
rechteckige Linien mit festen 10-/50-mm-Abständen. Auf einer zur Grundfläche
koplanaren Arbeitsebene wird nur ein Raster gezeichnet. Getrennte Ebenen behalten
ihre eigene Darstellung. Breite/Tiefe begrenzen beide Raster tatsächlich.

Projektformat 5 erhält ein optionales, strikt validiertes `workspace` für Ansicht,
Zoom, Root-/Quellenauswahl, Modus, Rasterfang, CAD-Qualität und Layout. Vorhandene
Dateien ohne dieses Feld bleiben lesbar. Neue Dateien mit diesem Feld benötigen
die aktuelle Ausgabe. Modellquellen/BRep bleiben unverändert; Undo und Worker-
Puffer werden nicht exportiert. Autosicherung erfasst auch ruhende Ansichts-
änderungen nach kurzer Verzögerung. Projektwechsel schützen ungespeicherte Arbeit.

`backend/projects.cjs` speichert atomar, aktualisiert bekannte geöffnete Dateien
und bietet Speichern unter, Öffnen, letzte 20 Dateien und einen portablen
Projektordner neben der EXE. Backendseitige Dateikennungen beschränken direkten
Zugriff auf zuvor ausgewählte/aufgelistete Dateien; externe Änderungen verhindern
unbemerkte Überschreibung. Exporte verwenden weiterhin die allgemeine Datei-API.
Der neue „Projekte“-Button wird auch in vorhandene individuelle Layouts eingefügt.
Persönliche Projektdateien, Verlauf und Testprofile bleiben außerhalb Git.

## Funktions-Plugins und direkter STL-STEP-Konverter (12.10.2026)

Der neue Bereich „Funktionen“ enthält das mitgelieferte STL-STEP-Funktionspaket.
Konvertierung nutzt einen kurzlebigen separaten CAD-Controller/Worker mit leerem
Projekt, dieselbe native STL-Reparatur/Rekonstruktion und den vorhandenen STEP-
Export. Es gibt keine Änderungen am aktuellen Projekt, seiner Auswahl oder Undo.
Abbrechen und Schließen beenden den temporären Worker. Einheit/Reparatur/optionale
kleine Lochfüllung sind auswählbar; bestehende STL-Grenzen bleiben verbindlich.
Es wird keine Python-/Cloudinstallation für diesen Ablauf benötigt.

Formenpakete behalten ihren bisherigen Format-1-Vertrag und Speicher. Neue
`Formnaro-FunctionPlugin`-Pakete Version 1 enthalten eine begrenzte `functions`-
Liste mit ID, Namen, optionaler Beschreibung und einem bekannten `action`-Namen.
Erlaubt sind der Konverter und vorhandene native Werkzeuge. Unbekannte Aktionen,
Skript-/Geometriefelder und doppelte Kennungen werden abgelehnt. Keine ausführbaren
JavaScript-Plugins. Der separate Key `offlinecad-function-plugins-v1` liegt portabel
in `Daten/funktionsplugins.json`; beschädigte Daten bleiben erhalten und hindern
den Programmstart nicht. Funktionen werden in der Formenliste weder gezählt noch
angezeigt. Bestehende individuelle Layouts bekommen den neuen Werkzeugknopf.

## STL-Topologie und dichte Kantenmodelle (12.10.2026)

Die STL-Rekonstruktion erhält getrennte Flächenfächer an identischen Koordinaten.
`cad-stl-faceted.js` baut explizit gemeinsam genutzte native Vertices/Kanten und
planare CAD-Flächen auf, ohne Nähe-Sewing an solchen Kontaktpunkten. Falls die
begrenzte Glättung keinen gültigen Körper liefert, dient derselbe Aufbau als
Fallback. Native Körperprüfung, Volumenabweichung und BRep-Größenlimit bleiben
verbindlich. Flächenzusammenfassung wird nur übernommen, wenn der zusammengefasste
Körper gültig bleibt und sein Volumen erhalten wird. STL-Originale und Koordinaten
werden nicht geändert; Facetten und fehlende ursprüngliche Radien werden in
Importdiagnose und Konverter ausdrücklich ausgewiesen.

Die native Kantenanzeige und der Finisher erlauben bis zu 60.000 eindeutige Kanten
(passend zum bestehenden 40.000-Dreieck-STL-Limit); die Gesamtpunkt-, BRep- und
Operationsgrenzen bleiben bestehen. Fehlgeschlagene native Abrundungen/Fasen geben
eine konkrete Meldung zu Maß/Kantenauswahl statt einer leeren Workerfehlermeldung.
Regressionen prüfen getrennte Flächenfächer, STEP-Roundtrip, unveränderte Eingaben
und ein dichtes rundes Modell mit über 8.000 auswählbaren CAD-Kanten. Ein optionaler
lokaler STL-Korpus in der UI-Abnahme bleibt außerhalb des gemeinsamen Projekts.

Dichte CAD-Kanten werden im Renderer als höchstens zwei LineSegments-Puffer (normal/ausgewählt) gezeichnet. Native Kurvenanker und Auswahl bleiben unverändert; tausende einzelne Geometrien, Materialien und Zeichenaufrufe entfallen. Eine CPU-Regressionsprüfung deckt 60.000 Kanten und getrennte Kurven ab; die lokale komplexe STL-UI-Prüfung kontrolliert auch die Zahl der Renderobjekte und protokolliert Rendererabstürze.

## Bedienleistung und Projektsicherung (12.10.2026)

Darstellungsgeometrien erhalten BoundingBoxes aus denselben Float32-Punkten wie
die Mausauswahl. Three kann dadurch Strahlen außerhalb dieser Grenzen vor den
Dreiecksprüfungen verwerfen. Unsichtbare Körper werden bereits vor dem Raycast
ausgeschlossen; Quellenpriorität und native CAD-Treffpunktabfragen bleiben
erhalten. Skaliergriffe teilen sich pro Aktualisierung ein Layoutrechteck.

Die bestätigte CAD-Transaktion hält einen privaten Serializer für Arbeitsplatz-
änderungen. Nur der kleine validierte Arbeitsplatz wird neu kodiert; die
kanonischen Modelldaten einschließlich BRep bleiben generationsgebunden im Cache.
Vorschauen ändern diese Sicherung nicht. Übernehmen, Öffnen, Undo und Redo
invalidieren den Cache. Format 5, Größenlimits und native Geometrieprüfung bleiben
verbindlich. Die portable Speicher-IPC bestätigt Schreibvorgänge mit der Revision,
ohne den bereits gesendeten gesamten Datenwert zurück zu übertragen; Preload
erhält den bisherigen Aufrufervertrag.

Der Dateistatus und der geschützte Projektwechsel berücksichtigen auch den
gespeicherten Arbeitsplatz, einschließlich Ansicht, Auswahl, Modus, Rasterfang,
Qualität und Layout. Reine Arbeitsplatzänderungen erhalten keine Geometrie-Undo-
Einträge. Die abschließende Funktions-, Desktop- und Paketprüfung wird lokal
protokolliert. Keine allgemeine Beschleunigung großer nativer CAD-Importe ableiten.

Abnahme am 13.10.2026: 40 vollständige Freigabegruppen bestanden, darunter
101 historische, 181 native Grund-, 46 erweiterte CAD- und 21 STL-/Kantenprüfungen.
Die tatsächliche gepackte EXE besteht zusätzlich 25 Prüfungen; Projekte und
Funktionen gegen ASAR/Preload/Backend jeweils zehn, einschließlich eines dichten
STL-Modells mit mehr als 9.000 Kanten. Geometrie, editierbare Quellen, Undo/Redo,
STEP-Rundlauf und geschützte Arbeitsplatzwechsel bleiben erhalten. Der CAD-Kern
ist bytegleich. Die neue Ausgabe heißt „Flüssigere Bedienung und sichere Projekte“.

Gleicher isolierter Electron-Ablauf vor/nach: Beim Ansichts-Autosave eines dichten
CAD-Modells sinkt die maximale 10-ms-Heartbeat-Spanne von 108,7 auf 44,8 ms,
die größte Bildspanne von 83,4 auf 33,4 ms. Die Ansichtsmessung startet keine
nativen Workeraufträge und ändert weder Modellrevision noch Undo. Einzelabläufe
im 1500×950-Testfenster, keine allgemeine Framerate-/Latenzgarantie. Synthetische
8-MiB-BRep-Speicherprobe mit UTF-8-Ausgabe: Median 31,89 auf 5,33 ms bei bytegleicher
Datei. Die reine Erfolgsantwort der Speicher-IPC sinkt von 8.949.735 auf 99 Byte.

Zusätzlicher großer Import/STEP/Undo/Redo/fünf kleine Folgeimporte bestanden;
Arbeitssatzspitze 5.042,49 MiB, anschließend 1.008,75 MiB. Der große Import dauert
119,87 s. Daraus keine neue Speicherersparnis oder Kernelbeschleunigung ableiten.
Alle persönlichen Modelle und Rohbelege liegen ausschließlich im lokalen `work`.


## Formensymbole und anpassbare Seitenleisten (13.10.2026)

Die 23 nativen Grundformen erhalten eigene lokale SVG-Vorschausymbole, auch
Gewinde, Mutter, Senkbohrung, Gehäuse und Polygon. Der gemeinsame Würfelersatz
entfällt; die Symbole benötigen keine CAD-Berechnung. Grundformenliste und
Objektbereich scrollen getrennt. Ziehbare Trennleisten ändern die Listenhöhe,
beide Seitenleistenbreiten und die Chathöhe. Pfeiltasten, Umschalt, Escape und
Doppelklick unterstützen Größenänderung, Abbruch und Rücksetzen.

Layoutversion 1 erhält optionale, validierte Maße libraryWidth, inspectorWidth,
shapeLibraryHeight und chatHeight (null = adaptive Standardgröße). Aktuelle und
benannte alte Layouts werden gemeinsam migriert. Größen reisen mit portablen
Layouts und Projektarbeitsplätzen; schmale Fenster begrenzen nur die Darstellung.
Modellgeometrie und Undo bleiben beim Ziehen unverändert. Native Desktopprüfungen
decken echte Mausgesten, Seitentausch, Einklappen, Neuladen und schmale Fenster ab.

## GitHub-Aktualisierung und Lizenzprüfung (13.10.2026)

Der aktuelle abgenommene Stand wird auf `main` und `cloud-development` synchronisiert.
Das Release `v0.12.0` enthält das geprüfte portable Paket vom 13.10.2026,
passende Anwendungs-/CAD-Kernquellen und Lizenzhinweise. Frühere Releases bleiben
historisch erhalten. 40 Freigabegruppen, echte EXE 25/25, Projekte 10/10 und
Funktionen 10/10 wurden bereits für diesen unveränderten Programmstand bestanden.
Lokale Entwicklungshistorie, Profile, persönliche Modelle und Zugangsdaten bleiben
außerhalb von Git und Release-Assets.

Lizenzinventar: MIT für Three.js, fflate, OpenType.js, Electron, Replicad-Wrapper
und Formnaro-Bridge; OpenCascade.js LGPL 2.1; OCCT LGPL 2.1 mit OCCT-Ausnahme;
FreeType nach FTL; freie Schriftdateien nach OFL 1.1 bzw. Magenta-Schriftlizenz.
Weitere native Systembibliotheken behalten ihre Originalbedingungen. CAD-Quellen
und Build-/Ersatzanleitung sind enthalten. Keine allgemeine Open-Source-Lizenz
für den eigenen Anwendungscode festgelegt.

Offene Compliance-Punkte: Das vollständige RapidJSON-Originalquellarchiv enthält
JSON_checker-Testdateien unter der JSON-Lizenz mit Nutzungsbeschränkung. Deren
Verwendung im produktiven CAD-Kern ist nicht nachgewiesen; keine pauschale
Einstufung des gesamten Quellenpakets als ausschließlich freie Open Source.
Außerdem sind genaue Electron-/Chromium-/FFmpeg-Build- und Quellenpflichten vor
einer abschließenden Verkaufsfreigabe zu prüfen. In dieser GitHub-Aktualisierung
werden die geprüften Binärdateien und Originalquellenarchive nicht verändert.

13.10.2026 – Formnaro0.12.1 integriert STL-Konverter0.6.0 als isolierten lokalen Desktopprozess. 21Engine-Pythonmodule bytegleich mit geprüftem Stand; provenance.json enthält SHA256-Pins. Neuer Headless-Dateiadapter, ElectronIPC/Preload, temporäre Eingabekopie, gebundener Auftrag/Abbruch, STEP-Hashbestätigung und zweiter nativer FormnaroSTEP-Reader. Keine Cloudschlüssel/Pythoninstallation beim Anwender. Modus/Toleranz/Einheit/Reparatur/Facettenrückfall, JSON-Bericht und CAD-Übernahme als einzelner Undo-Schritt; direkter STL-CAD-Import nutzt denselben Weg. Browser ohne Bridge behält bisherige begrenzte Rekonstruktion. Native Fehler werden angezeigt, Budget wird nicht umgangen. 50MiB Eingabe/30MiB STEP,10min Laufzeit; weitere Engine-/Projektlimits bleiben. Original-STL und unbeteiligte CAD-Quellen erhalten. Eigene Farbabweichungsansicht/reparierte3MF-Begleitdateien noch nicht inFormnaroUI; keine Konstruktionshistorie/Universalrekonstruktion/Fehlergarantie. Integration wird separat vorPortable-Auslieferunggeprüft; allgemeineCAD-Laufzeitunverändert. Keine Nutzer-/Zugangsdaten imgemeinsamenKontext. BRep/Rezepte bleiben beiNeuladenbytegleich; nativ neu berechnete Messwerte könnenFloatingPoint-ULPs differieren.
## Ausschnittanzeige und lokale Fehlerprotokolle (13.10.2026)

Lochkörper werden im CAD-Renderer grau und schraffiert angezeigt. Ein eigener
Stencil-Durchlauf markiert ihre Überlappung mit sichtbaren Körperflächen dunkler,
auch bei gekrümmten, überlappenden oder affinen Ausschnitten. Darstellungsgeometrie,
CAD-BRep, Auswahl und Undo werden dabei nicht verändert. Ohne sichtbare Lochkörper
bleibt der bisherige einzelne Renderdurchlauf erhalten.

Fehlerprotokolle liegen portabel unter `Daten/Fehlerprotokolle` als JSONL mit
Zeitpunkt, Programmversion, Sitzung, Fehlercode, Meldung und Stack. CAD-Workerfehler
enthalten zusätzlich Auftrag, Operation, Rechenschritt und Größenangaben.
Erfasst werden behandelte Oberflächen-/IPC-Fehler, unbehandelte Rendererfehler,
Rendererabstürze und fatale Fehler des Hauptprozesses. Benutzerabbruch ist kein
Fehler. Ein aktives Protokoll und vier Archive werden auf jeweils etwa 1 MiB
begrenzt. Vollständige Modelle, Befehle, Prompts und Einstellungen werden nicht
übernommen; erkennbare Zugangsdaten werden maskiert. Einstellungen → Allgemein
enthält „Fehlerprotokolle öffnen“. Fehler beim Schreiben verändern das Modell nicht.

Einzelne native boolesche Operationen konfigurieren nun `SetNonDestructive(true)`
vor `Build`, statt des unmittelbar berechnenden destruktiven Konstruktors.
Gültigkeit, geschlossene Körper, Quellen und Volumenprüfung bleiben verbindlich.
Die allgemeine Meldung „Keine gültige CAD-Geometrie“ bekommt einen maschinenlesbaren
Code und einen Rechenschritt für das Protokoll. Komplexe facettierte/skalierte
Schnitte können weiterhin an der nativen Topologieprüfung scheitern; es wird keine
allgemeine Fehlerfreiheit oder automatische Geometrie-Reparatur zugesichert.

## Impressum und nichtkommerzielle Anwendungslizenz (13.10.2026)

Der neue Dialog `cad-legal-ui.js` ist über Einstellungen → Allgemein erreichbar.
`formnaro-legal.js` hält ausschließlich öffentliche Releaseangaben: Rechteinhaber,
Copyrightjahr, optionalen Kontakt und den ausdrücklich gewählten eigenen
Lizenztext. Der Nutzer hat den Rechteinhaber bestätigt und nichtkommerzielle
Nutzung mit offenem Quellcode beauftragt. Der eigene Anwendungscode erhält
PolyForm Noncommercial 1.0.0; `LICENSE.txt` enthält Required Notice, Geltungsbereich,
zusätzliche zwingende LGPL-Berechtigungen und den unveränderten Originaltext.
Der Quellcode ist source-available, keine OSI-Open-Source-Lizenz. Bereits getrennt
lizenzierte Bestandteile, insbesondere die MIT-Bridge, bleiben unverändert.
Es werden keine fehlenden Anschriften oder Kontaktdaten erfunden; die Anzeige
ist keine Zusicherung eines vollständigen gesetzlichen Anbieterimpressums.

Originalhinweise aus `THIRD-PARTY-LICENSES.txt`, `licenses` und der lokalen
Konverter-Lizenzsammlung sind getrennt auswählbar und werden unverändert offline
geladen. Auch `LICENSE`-/`NOTICE`-Dateien ohne Erweiterung bleiben zugänglich.
Lizenztexte werden als Text ausgegeben und können gespeichert werden. Die
Desktopprüfung kontrolliert bestätigten Namen/Lizenz, bytegleichen Lizenzexport,
Originaltexte, Konverterhinweise, Sprachwechsel und unveränderte Modellgeometrie,
Auswahl und Undo. Neue Pakete und Quellenarchive nehmen `LICENSE.txt` mit auf;
historische Veröffentlichungen werden durch die lokale Änderung nicht ersetzt.

## Boolesche Topologiefehler: begrenzte Wiederherstellung (13.10.2026)

`cad-native-kernel.js` prüft das native Ergebnis bereits vor der zusätzlichen
Schnittmengenberechnung. Bei `INVALID_CAD_TOPOLOGY` versucht es zunächst die
mathematisch gleichwertige Operation mit einem temporär invertierten Operand.
Invertierte oder leere Ersatzkörper werden nicht gespeichert oder als Beweis
für eine vollständige Subtraktion verwendet. Scheitert dieser Weg, folgen
höchstens zwei native Fuzzy-Berechnungen. Die Obergrenze beträgt 0,001 mm und
wird für dünne/kleine Operanden auf 0,01 Prozent ihrer kleinsten Ausdehnung
reduziert. Erfolgreiche normale Operationen behalten ihre bisherige Genauigkeit.

Jeder Ersatzkörper wird vollständig auf native Gültigkeit, Körperzuordnung,
positives direkt integriertes Volumen und zulässige Operandgrenzen geprüft.
Gespeicherte Quellen, Parameter und Transformationen werden nicht verändert;
keine Netze oder Displaypuffer dienen als Geometrieersatz. Bleiben die Ergebnisse
ungültig, scheitert die Vorschau weiterhin ohne Änderung von Modell und Undo.
Die Wiederherstellung umfasst auch ungültige Hilfs-Schnittmengen, die vorher
eine an sich gültige Vereinigung/Subtraktion verhindern konnten.

Die Regressionen prüfen alle drei Operationen, gekrümmte/affine Operanden,
dünne Körper, den Fehlschlag sämtlicher Ersatzwege sowie Quellen, Undo/Redo und
tatsächliche erste UI-Klicks. Persönliche Fehlerbeispiele und ihre Diagnosen
bleiben ausschließlich unter `work`.


Zusätzliche Abnahme der korrigierten Ausgabe: Vereinigung, Schnittmenge und Subtraktion mit einem großen importierten CAD-Körper jeweils in frischem Kern und über die tatsächlichen UI-Schaltflächen im ersten Versuch erfolgreich. Isolierte Testkopien mit identischem Quader; native Körper-/Volumenprüfung, originale Quellen, ein Undo, exaktes Redo und Neuöffnen bestätigt. Persönliche Modelle und Einzelberichte verbleiben unter work; im Nutzerprojekt werden keine Testaktionen übernommen. Die Abnahme erfordert keine weiteren Produktänderungen.

## Unabhängiger Netz-Zweig (13.10.2026)

Auf ausdrücklichen Nutzerauftrag wird die historische Manifold-Netzmodellierung
von Formnaro 0.9 in einem unabhängigen Schwester-Repository `formnaro-netz`
weiterentwickelt. Version 0.13.0 übernimmt die neueren Oberflächen-, Projekt-,
Layout-, Font-, KI-, Plugin-, Fehlerlog- und Lizenzfunktionen durch getrennte
Netzadapter. Die Bedienung orientiert sich an Tinkercad. Native CAD/STEP/BRep,
Flächenrekonstruktion, freie CAD-Kantenoperationen und Konverter bleiben hier
im CAD-Zweig. Keine Änderung der nativen Architektur dieses Repositorys.

Die Netz-Ausgabe hat eigene portable Daten/Layouts/Projekte und das getrennte
Profil `offlinecad-netz`. Format 1–3 wird gelesen, Format 4 mit Arbeitsplatzdaten
geschrieben, Format 5 erklärend abgewiesen. Reine Kamerabewegungen ändern die
geometrische Revision nicht. Für Text vereint Manifold-CrossSection die
Originalglyph-Konturen mit NonZero-Füllregel vor der Netzextrusion.

106 Kernprüfungen, 24 zusätzliche Netz-Oberflächen-/Datei-/Font-/Bildprüfgruppen,
historische Workflow-/Griffprüfungen und die tatsächliche gepackte EXE sind
abgenommen. Das Netzpaket enthält nur Manifold als Geometrie-WASM. Beide
Quellzweige, Releaseordner und Nutzerprofile bleiben unabhängig; kein
persönliches Modell wird in den gemeinsamen Kontext oder Pakete übernommen.


## STL-Konverter 0.10, native Formnaro-Anbindung 0.12.2

Die geprüften eigenständigen Enginequellen werden per SHA-Pins in converter/
eingebunden. Bridgeprotokoll 2 ergänzt Analyse, quellengebundene Regionskorrektur,
überprüfte Begleitdateien und begrenzte Abweichungsproben. Der bestehende native
WASM-CAD-Importvertrag und Projektformat 5 bleiben erhalten. Der Editor arbeitet
an Originaldreiecken; seine Undo/Redo-Historie ist von der Projekthistorie getrennt.

Die lokale Oberfläche bietet Flächenfarben, Bereichs-/Dreiecksauswahl, Teilen,
Zusammenführen, Typvorgabe, Schutz, Korrektur-JSON und Original-/Ergebnis-/
Überlagerungs-/Abweichungsansichten. Native CAD-/Topologie-/Budget-/STEP-Gates
bleiben verpflichtend. Die Anzeigeabweichung ist einseitig an dargestellten
Dreiecksmittelpunkten und ersetzt keine globale Genauigkeitsprüfung. Reparierte
STL/3MF und Preview werden vor der Tempbereinigung als bestätigte Bytes übertragen.
Der neue eigene Headless-Runtime liegt in converter/runtime-v010. Ältere Runtime,
Ausgaben und Nutzerprofile bleiben erhalten. Reproduzierbare Quellen-/Runtime-
und echte Electron-/CAD-Import-Abnahme sind vor der Auslieferung erforderlich.


## Erneuerte Bedienungsanleitungen (13.10.2026)

Zwei getrennte deutsche PDF-Handbücher erstellt: CAD 0.12.1 mit 29 Seiten / 27
Kapiteln und Netz 0.13.3 mit 27 Seiten / 25 Kapiteln. CAD-Hauptteil beschreibt die
tatsächlich ausgelieferte Schnitt-Fix-Ausgabe mit STL-Engine 0.6; 0.12.2 / Engine
0.10 wird ausschließlich im Entwicklungsanhang erläutert. Je sechs Screenshots
aus hashgeprüften Release-ASARs, ausschließlich synthetische Montageplatten,
isolierte Profile ohne Desktop-/KI-Brücke oder externe Anfragen.

Neue Textquellen: docs/Formnaro-CAD-Handbuch-DE.txt und im Netz-Schwesterprojekt
docs/Formnaro-Netz-Handbuch-DE.txt; Bilder jeweils docs/handbuch-bilder. Gemeinsamer
PDF-Ersteller scripts/build-handbooks.py (ReportLab, Segoe UI, Inhaltsverzeichnis,
PDF-Lesezeichen). Ausgaben output/pdf; separates Dokumenten-ZIP mit Quellen,
Bildern und eingebauten Beispielprojekten. Beide PDFs vollständig gerendert,
visuell geprüft und alle Textzeichen auf Seitenbegrenzungen geprüft. Historische
Handbücher, Programmarchive und persönliche Modelle bleiben erhalten.

Ein EPIPE-Fehler des ersten lokalen Screenshot-Helfers wurde durch Datei-Logging
und gezieltes Beenden ausschließlich der eigenen Helfer korrigiert; daraus folgt
keine Produktänderung.


## Native CAD-Ausbaupakete: Übersicht (14.10.2026)

CAD 0.13.0 übernimmt Paket 1 des beauftragten achtteiligen Plans auf Basis
von 0.12.2: temporäre Auswahlisolation und lokale Projektminiaturen.
`cad-isolation.js` hält ausschließlich transienten Root-/Quellenbezug.
Dauerhafte Sichtbarkeit, Sperren, Projektformat 5, lokale API 1 und native
Modellgeometrie bleiben erhalten. Rendererfilter verwenden vorhandene
Geometrie-/Materialobjekte; Auswahlrahmen, Strg+A, Einpassen, native Punktwahl
und Schnittansicht folgen dem Filter. Export und KI-Szene behalten ihren
dauerhaften Gesamtprojektumfang. Explizite Auswahl nimmt neue Roots auf;
Gruppierung/Auflösung verfolgt Quellen. Projektwechsel beendet Isolation.

Projektminiaturen werden per erlaubtem Datei-Identifier bedarfsgerecht gelesen.
Ein eigener CAD-Worker und ein separater Three.js-Renderer erzeugen 240×160-PNGs
ohne offenen Projektstand, Kamera, Auswahl, Historienspeicher oder CAD-Caches
anzufassen. 32-MiB-Anzeigepufferlimit, serieller Auftrag und echter Workerabbruch
beim Dialogende. `Daten/Vorschaubilder` enthält an vollständige Dateihashes
gebundene lokale Caches; Dateirennen vor der Cacheübernahme werden abgewiesen.
Beschädigte/fehlende Vorschauen erhalten Platzhalter. Kein Bild im Projektformat.
Anleitung: `docs/CAD-ISOLATION-UND-MINIATUREN.md`. Jedes folgende Paket wird
separat geprüft und portabel ausgeliefert, ohne automatische Installation.

Der neue ausdrückliche Auftrag umfasst jetzt auch bearbeitbare native Skizzen
mit lokalen Maßformeln (Paket 4); frühere allgemeine Ausschlüsse von Skizzen
gelten für diesen beauftragten Ausbau nicht mehr. CAD-Format 7 ist erst für
neue gespeicherte Rezepte/Markierungen ab Paket 4 vorgesehen; Netzformat 6
bleibt getrennt. Folgepakete: Auflage, Bezugspunkte/Bohrungen, Skizzen,
Ebenenteilung, Körperzerlegung, KI-Markierungen/Bild, Darstellung/Leistung.


## Native Auflagefläche (Paket 2, CAD 0.14.0)

`cad-face-placement.js` prüft getrimmte analytische Ebenen am originalen BRep
und native Körpergrenzen in der Zielbasis. `previewLayOnFace` dreht/verschiebt
einen positiven entsperrten Root starr; vollständiger affiner Streckungsanteil,
Spiegelung, Scherung, Quellen, Parameter und BRep bleiben erhalten.
Eine am Root befestigte Arbeitsebene wird vor dem Lagewechsel in alter
Weltlage gelöst. Angepasste Layouts erhalten den Zugang neben Absetzen.
Vorschau, erneute Flächenwahl, Arbeitsebene/Grundebene, Auswahl-/Revisions-/
Sperrgates und nativer Workerabbruch verwenden den vorhandenen Vertrag.
Die Geometrieprüfung berücksichtigt OCCT-Confusion und numerische Reserven.

Das neue lokale API-Kommando `layOnFace` wird ausschließlich im nativen
CAD-Kontextschema ergänzt; der historische Netz-Command-Schema bleibt getrennt.
Die KI-Verträge erläutern jetzt auch den Gesamtprojektscope bei Isolation.
Format 5/API 1 und bestehende MCP-Namen bleiben erhalten. Anleitung:
`docs/CAD-AUF-FLAECHE-LEGEN.md`. Abnahme und separate portable Ausgabe folgen
nach den nativen/UI-/EXE-Prüfungen; keine automatische Installation.


Paket 2 ist abgenommen: 181 native Foundationtests, 101 allgemeine Regressionen,
31 gezielte Node-Prüfungen, 14 weitere native affine/Volumen-/Ebene-Proben,
30 Desktopgruppen und 55 Gruppen an der tatsächlich gepackten EXE.
Die portable Ausgabe enthält passende Quellen, Kernelquellen, Lizenzen, Anleitung
und Prüfnachweise; sämtliche Archiv-CRCs und Dateihashes sind bestätigt.
Einpassen berücksichtigt die Vorschaupose; Repick zeigt das Original wieder,
alte Auswahlrahmen bleiben während der Vorschau verborgen. Keine Installation.


## Native Bezugspunkte und Bohrungen (Paket 3, CAD 0.15.0)

Native Referenzpunkte verwenden ursprüngliche BRep-Topologie, vollständige
Kurvendomänen, isometrische Kreisebenen, getrimmte Ebenenflächen und native
Flächenschwerpunkte. Darstellungstokens sind revisionsephemer; jede Vorschau
löst sie erneut nativ auf. Markierungs-DOM bleibt bei Kamerabewegungen erhalten;
Verdeckung verwendet exakte projizierte Referenzpositionen. Punkte sind nach Typ
filterbar, die Darstellung ist auf 256 Marker begrenzt. Native freie Flächenwahl
bleibt für große Modelle verfügbar.

Bezugspunktplatzierung erhält die komplette lineare Affinität und verschiebt
nur den Root; keine dauerhafte Verbindung. Der Bohrungsassistent erstellt
bearbeitbare native negative Zylinder-/Senkquellen in einer äußeren Gruppe mit
erhaltenem Original. Native Körpergrenzen bestimmen die feste Durchgangslänge;
Materialentfernung, geschlossene Topologie und positives Volumen sind Pflicht.
Flacher Blindboden, kegelige Senkung, zylindrische Aufnahme und vorhandene
radiale Passungsvorlagen. Senkungen behalten die Grenzen der nativen Vorlage;
bei langem Durchgang ist der zusätzliche Zylinder unabhängig editierbar.

Native API-Kommandos `placeAtReference`/`drill`, unveränderte API 1/MCP-Namen.
GET scene ergänzt für einen ausgewählten sichtbaren Root bis 2000 native
Referenzpunkte; größerer Umfang bekommt erklärten freien Ray-Fallback.
Projektformat bleibt 5, neue gespeicherte CAD-7-Inhalte beginnen erst mit Paket 4.
Anleitung: docs/CAD-BEZUGSPUNKTE-UND-BOHRUNGEN.md. Keine automatische Installation.


Paket 3 final abgenommen: 181 native Foundationtests, 101 allgemeine Regressionen,
40 gezielte Node-Prüfungen, 42 Desktopgruppen sowie 67 Gruppen in der gepackten
EXE. Native Radius-/Blindboden-Tiefenproben, Originalquellen, tatsächliche
Mausmarkierungen, Worker-Abbruch, Undo/Redo und Neuöffnen bestätigt.
Alle Archiv-CRCs und Dateihashes sowie 480 gepackte Produktionsdateien geprüft.
Die UI zeigt ausschließlich relevante Bohrungsfelder; native Vorschau ist
vor dem Screenshot vollständig gezeichnet. Keine Installation.


14.10.2026 – CAD Paket 4 / 0.16.0: native Skizzenrezepte mit gespeicherten
Maßformeln, höchstens 40 benannten Maßen und 128 Polygonpunkten. Rechteck,
analytischer Kreis und einfache geschlossene Kontur werden nativ extrudiert.
Eigene Zeichenoberfläche mit CAD-Worker-Vorschau, lokalen Konturmaßen und
nativen Weltgrenzen; Quellenbearbeitung in Gruppen erhält die gesamte affine
Matrix und den lokalen Boden. Revision/Sperren/echter Worker-Abbruch und ein
Undo pro Übernahme; Duplikate/Bibliothek behalten Formeln mit eigenen IDs.

Externe Projektprüfung akzeptiert nur CAD 5 und 7. Neue Skizzen benötigen 7;
gewöhnliche serialisierte Projekte bleiben 5, Netz 6 ist ausgeschlossen.
CAD7-Autosave/Librarykeys sind getrennt von 5. Fehlender neuer Bestand erlaubt
validierten CAD5-Fallback; neue beschädigte Daten erlauben keinen Fallback.
Native Bibliotheksmigration prüft alle alten Einträge vor dem Schreiben und
erhält den Altbestand. Recovery-Schreibschutz prüft auch später ersetzte Werte
vor automatischem Schreiben/Beenden; unveränderte Werte werden gecacht.
API1/MCP-Namen erhalten; CAD-only Befehl sketch und Schema/Context erweitert.
Anleitung docs/CAD-SKIZZEN-UND-MASSFORMELN.md. Keine automatische Installation.
Die Etappenprüfung liegt in den beigelegten Prüfnachweisen; Pakete5–8 folgen
in der festgelegten Reihenfolge.


14.10.2026 – CAD Paket5 / 0.17.0: Ebenenteilung verwendet den vorhandenen
OCCT BRepAlgoAPI_Splitter mit echter Ebenenfläche und NonDestructive-Modus.
Zusätzliche native SOLID-Topologie, geschlossene Ergebnisse, Seitenzuordnung
und Volumensumme beweisen einen Materialschnitt; Tangenten, außerhalb und nur
durch Lücken werden abgewiesen. Teilungsbeschreibung version1 lokal, neuer
Quellentyp partition mit genau einer kompletten Originalkopie pro Seite.
Voller ursprünglicher Root-Affinebezug bleibt je Seite; Originalquelle liegt
in diesem Bezug identisch, untergeordnete Quellenmatrizen/Parameter/BRep erhalten.
Covektor-Pullback der Weltebene, einschließlich Spiegel/Scherung, ohne TRS-
Zerlegung. Neue Root-/Quellenkennungen unabhängig; negative Körper behalten
Lochstatus. Sourceänderung berechnet eigene Seite neu; native Kantenoperationen
finden nach Teilung statt und können zurückgesetzt werden.

Format7 für gespeicherte Teilung, gewöhnlich5/Netz6 getrennt; CAD7 Recovery/
Library weiterverwenden. Quellenbaum zeigt Seite/lokale Ebene, Library/Duplikate
und API1/MCP erweitert. Weltachsen/currentWorkplane/customNormale+mm-Abstand,
native Vorschau beider Seiten. Optischer Abstand ist nur GPU-Matrixtranslation
unter Wiederverwendung der Vorschaugeometrie; Apply übernimmt Originalpositionen
mit1Undo. Abgeleitete Teile dürfen nicht ungrouped werden. Workplane-Altbezug
nur bei genau einem nativen Besitzer übertragen, auf Naht mehrdeutig Weltlage
lösen. Anleitung docs/CAD-KOERPER-MIT-EBENE-TEILEN.md; Kernelbinary/Bindings
unverändert. Etappenbelege begleiten die portable Ausgabe, keine Installation.

14.10.2026 – CAD Paket6 / 0.18.0: source extraction enthält genau eine
vollständige Originalquellenkopie. Native TopAbs_SOLID statt Shell-Zerlegung;
innere Hohlräume bleiben ihrem Körper zugeordnet. Weltabstand verwendet native
BRepExtrema_DistShapeShape und Precision-Reserve; berührende/überlappende
Einzelkörper werden abgewiesen. Ganze native Volumensumme wird geprüft.
SHA-256 für semantische Originalgeometrie, vollständigen nativen Ausgangs-BRep
und ausgewählten Einzelkörper; ID-/Stiländerungen ignoriert, geometrische
Änderungen erzwingen erneutes Herauslösen. Keine indexbasierte Zuordnung.
constructionFrame speichert den ursprünglichen vollen affinen Berechnungsbezug,
so dass spätere Ergebnisbewegung keine native Approximationsdrift verursacht.
Ergebnis besitzt ursprüngliche Rootmatrix, eigene IDs; Originalquelle lokal I.
Originalgeometrie im Inspector geschützt, API ebenfalls nativ geprüft. Original
kopieren/einfügen ermöglicht Bearbeitung und neue Extraktion. Ergebnislage,
Farbe und nachgelagerte native Kantenoperationen bearbeitbar. Kein gewöhnliches
Auflösen abgeleiteter Teile. Format7/CAD7-Recovery/Library wie vorherige Pakete;
API1 extractSolids liefert Aliasarray, scene sourceGeometryReadonly+Rezept.
Toolbar/Funktionen/Layout DE/EN ohne Reset, Vorschau mit nativen Volumen und
Körperfarben, Revision/Sperren/Worker-Abbruch/1Undo. Anleitung
CAD-KOERPER-HERAUSLOESEN.md. Native Kerneldateien unverändert.

14.10.2026 – CAD Paket7 / 0.19.0: node.annotations version1 mit lokaler
Position/Einheitsnormale, Hinweis/Farbe/lokalem Radius, nativeStatus/reason und
Flächen-SHA. Max100 proQuelle/1000gesamt, unabhängige IDs in Duplikat, Clipboard
und Library. Native getrimmte FACE-Punktabstände und tatsächliche CAD-RayNormal
prüfen genau einen Besitzer; keine persistente indexbasierte Zuordnung. Nach
Rebuild sämtliche Quellenanker im jeweiligen fertigen Root-BRep prüfen, mit
voller Quellenmatrixkette. Boolean entfernt Fläche→sichtbar stale, keinegültige
Weltnormale; falsche gespeicherte Statusbehauptungen nativ revalidieren. Bounded
Annotationproofcache enthält DTOs ohne Handles; native Geometrie-/Displaycaches
bleiben unverändert. Ohne Markierungen kein zusätzlicher Quellenkopierdurchlauf.
Canvas-Ring mit voller affiner Matrix, Sprite-Text im Canvas, letzter gültiger
Anker für stale Anzeige; lokale/Weltpunkte und M^-T Normalen im Szene-Kontext.
Sourcebaum zeigt Markierungen. Neues mark/editMark/removeMark API1, CAD7 Inhalt,
Revision/Sperren/Preview/Apply1Undo/Worker-Abbruch. Toolbar/Funktionen/Layout DE/EN.
Bestehender Chat erhält Modellbild-PNG durch Canvas.toBlob und bisherigen addImages
Pfad, ohne onSend; Entwurf/History erhalten, vierAnhänge/12MB Grenzen bleiben.
Prüfmodus der EXE weiterhin offscreen (seit6), regulärer Start unverändert.
Anleitung CAD-KI-MARKIERUNGEN-UND-MODELLBILD.md. Kernel unverändert.

Paket7 Ergänzung: editMark kann die bestehende Kennung auf eine neue native Modellstelle setzen, auch bei erhaltenen Quellenpfaden; Punkt und Normale werden im fertigen Root geprüft und in den Quellrahmen zurückgeführt. Gemeinsame KI-Canvasvorschau zeigt Markierungen und entfernt sie beim Verwerfen. Auflage-Desktopprüfung wartet auf fertig gezeichnete Vorschau und aktivierte Übernahme, statt nur auf den früh gesetzten Vorschauzeiger.

14.10.2026 – CAD Paket8 / 0.20.0: expliziter cad-render-scheduler mit genau
einem vorgemerkten RAF, zusammengefassten Invalidierungen und getrenntem
Kameradrain. OrbitControls.update false allein genügt nicht: rohe Pose bis
numericalFloor (32*EPS component-scaled) beobachten, Rest über öffentliche
Dämpfungsabschaltung/update vollständig verarbeiten und finales Bild. Referenz
in Prüfung mit1200weiterenUpdates, production ohne privateOrbitProperties.
Render bei Kamera/Modell/Selection/Handles/Preview/Section/Theme/Resize, externe
Annotations/Measurement/Alignment und Gizmoevents ebenfalls. DOMOverlay/Handles/
ScaleDimensions nur beim Draw. Capture wartet auf aktuellenFrame, ScreenshotAPI
async intern, AntwortAPI1unverändert. Idle keine RAFticks/Draw/UIupdates.
NativeCaches/ShapeHandles/BRep/SerializedConfirmedModelCache unverändert.
Optionale Workertransportmessung zählt UTF8JSONrepräsentation und begrenzte128
Anfrageproben, im Normalbetrieb keine Beobachterserialisierung. Kein Anspruch
auf interne ChromiumwireBytes; gemesseneLatency enthält Beobachteraufwand.
CAD32Boxen61440mm3vergleich0.19native→0.20native, Baseline61passes/s→idle0,
WASM100MiBbeide, keine JSHeapsparzusage. NativeCADMessergebnisse/portableEXE
Freigabe beilegen. SelectiveWorkerTransfer weiterhinseparaterAusbau.
Anleitung CAD-DARSTELLUNG-UND-LEISTUNG.md; Kernelbinary/Bindings unverändert.

P8 Capture erzwingt einen Renderdurchlauf synchron im Renderer, damit versteckte/minimierte Fenster nicht auf pausierten RAF warten. Ein fehlgeschlagener Draw verwirft wartende Capture-Promises mit Fehler und startet keine Fehlerschleife. Die nächste explizite Änderung kann erneut zeichnen.

### Portable ZIP: kurze Entpackpfade (14.10.2026)

Windows Explorer meldete beim Entpacken der Ausgabe 0.20.0 einen zu langen
Zielpfad in der verschachtelten Lizenzsammlung des Konverters (`msinttypes`).
Das Verpackungsskript verwendet künftig `Formnaro-{version}.zip` und den äußeren
Programmordner `App`. Interne Konverterpfade und sämtliche Lizenztexte bleiben
erhalten. Die Startanleitung nennt `App/Formnaro.exe` und empfiehlt einen kurzen
Entpackordner. Die bisher freigegebenen Archive bleiben als historische Ausgaben
erhalten; die korrigierte Verpackung ändert keine Programm- oder Kerneldateien.


## DeepSeek-Denkstufen und Verbrauch (0.21.0)

Anbieterprofile erhalten reasoningEffort low/high/max, Standard high. Nur
DeepSeek-Anfragen setzen reasoning.effort (Responses) beziehungsweise thinking
und reasoning_effort (Chat). Verschlüsselte Schlüssel bleiben beim Wechsel
unverändert; andere Anbieter erhalten keine neuen Modellparameter.

runCadAIRequest hält Aufgabe, Anhänge, aktuelle Szene, Revision und Auswahl
über höchstens zwei Korrekturversuche fest. Ausgabe-/native Vorschaufehler
werden als verworfene Daten mit konkreter Fehlermeldung zurückgegeben.
Netzwerk-/Zugangsfehler, Abbruch und Modell-/Auswahlwechsel beenden die Schleife.
Ein Anbieter-/Modell-/Denkstufenwechsel verhindert eine weitere Anfrage unter
geänderter Konfiguration. Vorschauen werden niemals automatisch übernommen.

Gemeldeter Tokenverbrauch und Laufzeit werden pro Anfrage gesammelt; Denk-
Tokens sind Teil der Ausgabe, fehlende Zahlen bleiben null. Eine datierte
DeepSeek-USD-Preistabelle liefert eine Neben-/Hauptzeitspanne mit gemeldeter
Cache-Ermäßigung, keine behauptete Kontobelastung. Metriken bleiben außerhalb
des zurückgesendeten Chatverlaufs. Neue Anleitung und synthetischer Live-
Vergleich: CAD-KI-DENKSTUFEN-UND-VERBRAUCH.md / DEEPSEEK-CAD-VERGLEICH.md.
Persönliche Profile, Schlüssel und native Test-BReps bleiben lokal.


15.10.2026 – KI-Achsenmaße und Fehlerdetails: CAD0.22/Netz0.20.
Versionierte Arbeitsregeln werden bei jedem DeepSeek-Aufruf einschließlich
Korrekturen erneut als Programmtext gesendet. CAD-Szene liefert abgeleitete
geometrySize/editSize/worldAxisSize mit vollständigen affinen Matrizen; Netz
behält seine eigenen Achsenhilfen. Strukturierte begrenzte Fehler erhalten
Code, 1-basierten Befehlsindex und Ziel, soweit eindeutig, bis HTTP/Python/MCP.
Schutz-/Abbruchfehler stoppen Korrekturen, kein Auto-Apply oder Auto-Max.
Keine neuen Modellbefehle/Projektformate. Anleitung KI-ACHSENMASSE-UND-FEHLER.md.


15.10.2026 – Austauschformate 0.23.0: begrenzter gemeinsamer Offline-Dateileser für 3MF-Core/Production/Objektfarben und statische glTF2/GLB-Netze, alle Koordinaten in Welt-mm/Z-oben. Separate Teile und volle affine Hierarchien; kein Abruf externer URLs. Import als atomare Transaktion mit Revision/Abbruch. Netz prüft alle Teile im Manifold-Worker, offene Netze verhindern die gesamte Übernahme; CAD bleibt bei Netzreferenzen, 3MF/GLB/glTF-Export nimmt sichtbare bzw. ausgewählte Referenzen hinzu. GLB packt bestehende glTF-Puffer ohne Geometrieänderung. Keine Kernel-/Cloud-Abhängigkeiten ergänzt. Grenzen und Kompatibilität: AUSTAUSCHFORMATE-3MF-GLB-GLTF.md. Neue getrennte Ausgaben nach Abnahme; alte Installationen erhalten.

15.10.2026 – Neues Produktziel und Entwicklungsplan: langfristig ein Formnaro mit
Netz, nativem CAD und vorhandenem STL-zu-STEP-Konverter in einer Anwendung und
einem gemeinsamen Projekt. Bisherige getrennte Ausgaben bleiben als geprüfte
Ausgangspunkte erhalten. Kanonischer Plan: FORMNARO-GESAMTPLAN.md, Planfassung 1.
Bestätigte Priorität für neue Meshmixer-artige Werkzeuge: technische Teile und
3D-Druck; Reparieren, Teilen und Vereinfachen zuerst. Reihenfolge: gemeinsame
Projekt-/Befehlsgrundlage, Oberfläche und Rechenadapter, kontrollierte Übergänge
einschließlich Konverter; danach Oberflächenauswahl/offene Netze, Inspektor und
Reparatur, Teilung/Verbinder, Reduce/Remesh/Smooth, Make Solid/Hollow/Druckprüfung.
Sculpting und zusätzliche Funktionen später über priorisierten Backlog. Aktueller
Manifold-Körperpfad reicht für offene beschädigte Oberflächen nicht aus; eigener
Oberflächenzustand und Technikversuche nötig. Architektur, Pakete und Abnahmen
sind vorgeschlagen, noch nicht implementiert. Dieser Auftrag änderte Dokumente
und lokale Kontexte, keine Produktfunktionen, Releases oder Installationen.

## Gemeinsame Projektgrundlage (0.24.0)

Der 27-Pakete-Plan ist ausdrücklich zur Umsetzung beauftragt. Die erste
Ausbaustufe erweitert das bestehende Projektfundament um Format8 mit kind mesh,
getrennt von nativen CAD-Körpern und referenceMesh-Ansichtsvorlagen. Rohe offene
und beschädigte Dreiecksnetze dürfen gespeichert/angezeigt werden. Topologische
Kantenschließung ist keine Materialkörperprüfung. Originale affine Matrizen,
BRep-Quellen und gemeinsame Metadaten bleiben maßgeblich.

Ein bestätigter Store/eine Historie: cad-transactions/cad-controller. Native
Bearbeitungen bleiben im bisherigen CAD-Worker; ein eigener, erst bei Bedarf
geladener Netz-Worker bindet zunächst Altleser und Körperprüfung an. 24 reine
Netzmodule wurden aus Netz0.21 bytegleich übernommen; mesh-engine/origin.json
verzeichnet ihre Herkunft. Nachbarprogramm und historische Ausgaben bleiben
unverändert. Vollständige Netz-Bearbeitungen folgen in Paket6/8.

Netzformate1–4/6 werden durch den übernommenen Leser geprüft, auch bisherige
begrenzte gzip-Dateien. Ein neues Projekt archiviert Originaldaten in
migrationSource und die alten Quellen/Parameter je Teil in meshSource.
Aktive alte Netz-Ansichten und Netzflächenbezüge sind noch nicht angeschlossen;
Originaldaten und räumliche Ebenenlage bleiben erhalten, Import nennt die Grenze.
Format8 zählt diese Originaldaten im gemeinsamen50MB-Limit mit.

CAD5/7 bleibt lesbar und für reine alte Inhalte weiter schreibbar. Der erste
Wechsel einer bestehenden CAD-Datei zu Format8 erzwingt Speichern unter;
Netzmigration erhält keinen schreibbaren Verweis auf die Originaldatei.
Autosicherung-v8 hat einen eigenen portablen Schlüssel/Pfad. Vorherige CAD5/7-
Sicherungen bleiben erhalten; beschädigte neue Daten blockieren automatische
Schreibzugriffe und stillen Rückfall. Ein geschlossener Importdialog beendet
nur seinen eigenen Import; verspätete Dateien/Vorschauen prüfen Revision/Abbruch.

STL/OBJ enthalten jetzt auch bearbeitbare Netzteile, 3MF/GLB/glTF zusätzlich
Ansichtsvorlagen; lose Netz-Lochformen bleiben ausgeschlossen. STEP/SVG sind
weiter nativ. Keine implizite CAD-/Netzumwandlung und keine neue Kernbindung;
CAD- und Manifold-WASM sowie lokaler Konverter bleiben unverändert.
Anleitung GEMEINSAME-PROJEKTGRUNDLAGE.md, Übernahmeliste
FORMNARO-FUNKTIONSBESTAND.md, granularer Fortschritt FORMNARO-UMSETZUNGSSTAND.md.
0.24 ist die erste Projektgrundlage, keine Abnahme von Paket13 oder aller27Pakete.

Abnahme der Projektgrundlage0.24.0: Erstes gemischtes Zwischenziel erreicht,
Gesamtplan weiterhin offen. 45gezielte/116Regressionen/181native/31weitere,
Quelle137CAD+21gemischt, tatsächlicheEXE162CAD+21gemischt bestanden. 507ASAR-
Dateien,1535Konverterdateien und beideunverändertenWASM-Kerne bytegeprüft.
PortableZIPinklQuellen/passenderKernelquellen/Lizenzen: CRCundalleEinzelhashes
geprüft. VierhistorischeArchiveund474Nachbarquelldateienunverändert.
SeparateAusgabe release-formnaro-gemeinsame-grundlage-v0.24.0-r2, ZIP
output/Formnaro-Gemeinsame-Grundlage-v0.24.0.zip. LokaleNachweise work/unification/
checks/final-audit.json,archives.json,preservation.json. NachQuellenfreeze nur
Fortschrittsdokumentation ergänzt; abgenommene Programmdateien unverändert.
Paket6NetzbearbeitungenalsNächstes; Paket7Netzflächenbezüge/alteAnsichten,
Werkzeugparität8, direkteObjektkonvertierungen10/11 undrestlichePakete offen.


## Paket 6: Netz-Rechenmodul und konstruktive Werkzeuge (0.25.0)

Der eigene lazy Manifold-Worker verarbeitet jetzt konstruktive Bearbeitungen
über denselben cad-controller/cad-transactions-Stand wie native CAD-Aufträge.
Transportunabhängiger meshEngineRequest wird in Browser- und echten Node-
Workerprüfungen verwendet. Vorschläge durchlaufen Schema-, Größen- und
Darstellungsprüfung vor der Übernahme. Abbruch beendet den jeweiligen Worker;
Revisionen verhindern verspätete Übernahmen. Kein zweiter bestätigter Store.

Angeschlossen: explizite Netz-Grundformen/Generatoren, Rolle, Boolesche Gruppen,
Bohren mit dem unverändert übernommenen mesh-hole.js, Teilen, Materialkörper,
vorhandene Außenkanten/Randkonturen und Quellenbearbeitung/Auflösen. Nun 25
bytegleiche Module aus Netz 0.21.0 mit origin.json; Nachbarprodukt unverändert.
meshSource Version 2 hält Original-Netzobjekte inklusive voller Affinmatrizen,
Metadaten, Sperren und verschachtelter Historie neben dem Rechenrezept. Quellen
werden vor Bearbeitung/Auflösen auf passende aktuelle/erhaltene Geometrie geprüft.
Weder Scherung noch Spiegelung werden in verlustbehaftete TRS zerlegt.

Oberfläche cad-mesh-tools bietet Körperprüfung, Eingaben und gezielte Vorschauen,
die nur betroffene Originale ausblenden. Eingabewerte übertragen nur echte
Änderungen. Offene/beschädigte Netze bleiben erhalten; Beschriftung allein gibt
keine Körperoperation frei. Manifold-/Topologieprüfung ersetzt keine exhaustive
Selbstüberschneidungs- oder Druckprüfung. Veränderte Kantenbezüge werden verworfen;
Kanten neu wählen. Text/SVG und übrige Netz-Bedien-/Analysewerkzeuge folgen 7/8.

Separate Ausgabe/Quellen/Prüfungen über package-mesh-integration.mjs und
archive-mesh-integration.py, Anleitung NETZ-WERKZEUGE.md. Releaseprüfungen binden
alle Quell- und Nachweisbytes sowie EXE/ASAR-Hashes, Dateimengen, beide unveränderten
WASM-Dateien und alle Konverterdateien. Alte Ausgaben werden nicht überschrieben.
Weitere Pakete, insbesondere aktive Netzflächenbezüge 7, Werkzeugparität 8,
CAD↔Netz 10/11 und neue Meshmixer-Verfahren 14–27, bleiben offen.

Import-Dialoge besitzen zusätzlich eine Sitzungsnummer. Verspätete asynchrone
close-Ereignisse eines vorherigen Dialogs dürfen einen wieder geöffneten Import
nicht abbrechen. Handler ignorieren close bei bereits wieder offenem Dialog,
bleiben bis zum tatsächlichen Schließen aktiv und werden vor erfolgreichem/
explizitem Schließen entfernt. Aktuelle Importprüfung sowie catch/finally sind
an die eigene Sitzung gebunden; alte Aufträge verändern keine neuen Eingaben.

## Paket 7: gemeinsame Arbeitsfläche (0.26.0)

`mesh-workplane.js` verwaltet stabile lokale Dreiecksanker für bearbeitbare
Netze und Ansichtsvorlagen, einschließlich offener Netze. Referenzschema:
kind mesh, objectId, SHA256 geometryDigest der exakten lokalen verts/triangles,
triangleIndex, point, normal, tangent. Transform, Farbe und Rolle gehören nicht
zum Geometrie-Digest. Strikte externe Validierung; intern nach affinen Lagen
nachführen, bei geänderter/entfernter Quelle an letzter gültiger Ebene lösen und
Hinweis ausgeben. Inverse-transponierte Normale und orthogonaler rechtshändiger
Rahmen erhalten Scherung/Spiegelung ohne verlustbehaftete Zerlegung. Eine reine
Bezugsauswahl benötigt keine Manifold-Körperprüfung.

`cad-workplane-ui.js` vergleicht native CAD-Treffer mit exakten gespeicherten
Netzdreiecken. Sichtbarkeit und Isolation gelten gemeinsam. CAD setzt wie zuvor
direkt; Netz/Vorlage hat Vorschau/Übernehmen/Abbrechen. Eine bestätigte Revision
und Historie bleiben maßgeblich. Native Rebind-/Gruppenwege lassen fremde
Netzbezüge erhalten. Neue Netzgrundkörper akzeptieren optional frame:
frame * bisherige lokale Transform, Rechenrezept bleibt lokal. UI bietet
Arbeitsebene/Weltachsen und behält Eingaben beim Wechsel.

`cad-mesh-source-tree.js` stellt erhaltene Quellen als virtuelle Baumzeilen dar,
mit tatsächlichem Pfad zum bestehenden Quelleneditor. Keine zusätzlichen
Szenenobjekte oder Körperauswertung beim Aufklappen. Arbeitsplatzversion 2
speichert begrenzte/eindeutige expanded-Pfade neben der bisherigen Kamera und
physischen Auswahl. Dafür und für Mesh-Flächenbezüge ist Projektformat 8 nötig.
Reine CAD5/7-Dateien behalten Arbeitsplatzversion 1. Alte Netzprojekte aktivieren
nur passende gespeicherte Flächenbezüge und validierte Kameras; Schnittansichten
bleiben mit Hinweis im archivierten migrationSource, keine stillschweigende
Umdeutung als Arbeitsebene. Originaldateien bleiben erhalten.

Anleitung GEMEINSAME-ARBEITSFLAECHE.md; Release-/Archivskripte
package-shared-workspace.mjs und archive-shared-workspace.py. Nachweise separat
unter work/shared-workspace/checks, damit frühere Abnahmen unverändert bleiben.
Geprüft werden aktuelle Quellen und tatsächliche EXE mit isolierten Profilen,
Quellen-/Nachweisfreeze, exakten EXE/ASAR-Bytes, Dateimengen und unveränderten
CAD-/Manifold-Kernen sowie Konverterdateien. Historische Ausgaben, vollständige
0.24/0.25-Archive und Nachbarquellen werden auf Erhaltung geprüft. Paket 8 und
die übrigen Pakete einschließlich neuer Meshmixer-Verfahren bleiben offen.

## Paket 8: Eigenschaften und bestehende Werkzeuge (0.27.0)

`cad-mesh-extra-tools.js` verbindet bisherige Netz-Bedienabläufe mit dem gemeinsamen
Controller. `common-tool-operations.js` erhält volle Affinmatrizen für Anordnungen,
Passungen, Stützflächen, Magnet und Punktplatzierung. Netztreffer verwenden die
exakten gespeicherten Float64-Dreiecke (`mesh-surface.js`), native Treffer weiterhin
die BRep-Abfrage. Zwei-Punkt-Messen kann beide Arten verbinden. Körperoperationen
bleiben im passenden Kern; kein implizites Tessellieren von CAD. CAD-Netz-Kollision
ist ausdrücklich nicht Teil der bisherigen Modellprüfung. Abschnittsdarstellung
kombiniert native und Manifold-Ergebnisse, einschließlich explizit leerer Teile.

`mesh-contours.js` nutzt vorhandene Originalschriften und SVG-Füllregeln; Text/SVG
werden als ausdrücklich erzeugte Netzquellen extrudiert. Der gemeinsame grafische
Skizzeneditor unterstützt zusätzlich Netzskizzen und virtuelle Quellenpfade.
Format-1-Formpakete bleiben Daten, werden nativ geprüft und lassen sich ausdrücklich
als Netz erzeugen. Ihre Speicherung erfolgt im vorhandenen lokalen Plugin-Schlüssel.
Der mitgelieferte Netz-Funktionssatz ergänzt den bisherigen Konverter-Funktionssatz.

Netzquellenversion 3 kennzeichnet optionale appearance.multicolor beziehungsweise
Reparaturableitungen; ältere v1/v2 werden nicht um neue Felder erweitert. Quellenfarben
werden in disjunkte Materialbereiche des aktuellen Resultats geschnitten, für Anzeige
und farbfähige Exporte. Maßgebliche Geometrie/Originale bleiben unverändert. Bei ungültiger Körpergeometrie
bleibt die rohe einfarbige Darstellung erhalten, statt Öffnen/Speichern zu verhindern. Die alte
Reparatur (40.000-Dreiecke-Grenze) erhält das beschädigte Original in sources. Ein
zusätzlich bytegleich übernommenes section-geometry.js erweitert die vendorten Module
auf 26; origin.json enthält dessen Ausgangshash. Keine Änderung im Netz-Nachbarprojekt.

Arbeitsplatzversion 3 ergänzt strikte Schnittkonfiguration: Einheitsnormale, Offset,
Seite, begrenzte eindeutige Objektkennungen. Beim Öffnen werden Ansichtsnetze neu
berechnet, keine Cap-Meshes in Projekten gespeichert. Reine CAD5/7 behalten ihren
bisherigen Arbeitsplatz. Alte geeignete Netz-Schnitte werden in diese Ansicht übernommen.

Gemeinsame Bibliothek FormnaroCADLibrary v8 unter offlinecad-library-common-v8 / 
bibliothek-gemeinsam-v8.json; v5/v7 bleiben nativ und unverändert. Gemeinsame Speicherung
kopiert gelesene CAD-Vorlagen in den eigenen Namespace. Vorlagen enthalten nur die
ausgewählten Teile, keine äußere migrationSource/workspace. Parameterbindungen für
Netze unterstützen Größe/Position; CAD-Formparameter behalten die native Prüfung.
Strikte Bibliotheksprüfung, Revisions-/Speicherstandschutz und Undo beim Einfügen.
Keine automatische Übernahme persönlicher alter Netzbibliotheken (Paket 12).

Prüf-/Auslieferungswege: `tests/tool-parity*.mjs`, `tests/tool-parity-desktop.cjs`,
`backend/tool-parity-verification.cjs`, eigener `--verify-tools`-EXE-Einstieg,
`package-tool-parity.mjs` / `archive-tool-parity.py`. Nachweise getrennt unter
work/tool-parity/checks. Reale Maus-, Vorschau-, Abbruch-, Undo-, Datei- und Exportwege
werden an aktuelle Quellen und exakte EXE/ASAR-Bytes gebunden. Frühere 0.24/0.25/0.26
Ausgaben, vier historische ZIPs und alle 474 Nachbarquellen bleiben bytegeprüft erhalten.
Paket 9–13 und neue Netzverfahren 14–27 bleiben getrennte nächste Aufgaben.

## Paket 9: gemeinsamer dateibasierter Konverter (0.28.0)

Die vorhandene lokale Flächenanalyse, Bereichskorrekturen, eigene Korrekturhistorie,
3D-Vergleiche, Begleitnetze und Berichte bleiben in cad-stl-workbench.js. Direkter
Dateieinstieg oben bei Import/Export; derselbe Ablauf unter Funktionen. Keine
implizite Übergabe eines Szenennetzes (Paket 11) und keine CAD-Tessellierung (10).
Engine0.10/Protokoll2/Konverterruntime und CAD-/Manifold-WASM bleiben unverändert.

cad-converter-import.js berechnet gegen eine bestätigte gemeinsame Revision eine
native importStep-Proposal. Optionen: neue Kennung, aktive sichtbare/entsperrte
Organisation, aktuelle Arbeitsebene, Dateiname und vorhandene Kurzdiagnose. Keine
zweite Einheitsskalierung des bereits in Millimeter konvertierten STEP. Vorhandene
CAD-/Netz-/Vorlagenknoten bleiben unverändert. Nur ausdrückliches Apply erzeugt einen
Undo-Schritt; Discard, Abbruch, fremde Revision oder verspätetes Ergebnis übernehmen
nichts. clearPreview ist an die eigene Kennung gebunden. Kandidaten gelten für eine
lebende Workbench und dasselbe Konverterresultat; der Apply-Klick darf den eigenen
Prepare-Auftrag nicht über dessen Berechnungsticket entwerten.

Die Workbench wechselt zur gemeinsamen Vorschau in einen modeless Bestätigungsdialog
mit explizitem Z-Index über den Seitenleisten. Die Hauptszene bleibt bedienbar. Der gemeinsame modal-Helper normalisiert einen noch
offenen modeless Dialog beim Aufruf anderer App-Dialoge; alte Kandidaten werden verworfen. Konverterfelder werden am eigenen Host statt global am
aktuellen Dialog gesucht, damit auch die Entsorgung nach einem Inhaltswechsel sicher bleibt. Verwerfen
oder echtes Escape kehrt zur vollständigen modalen Ergebnisansicht zurück; Resultat und
bestätigte Regionen bleiben erhalten. Übernahme-Apply ist atomar. Änderungen am Projekt
verwerfen eine vorhandene Vorschau; eine neue kann gegen die aktuelle Revision berechnet
werden. Schließen/Navigation beenden den eigenen nativen Prozess. Ein erneuter Convert
wartet auf vorheriges Abbruch-Cleanup. view.fit erhält eine explizite includePreview-Option,
um neue Kandidaten einzupassen; das bisherige Standardverhalten bleibt bestehen.

Der vorhandene native Konverterprüfer ist mit gemischter Einrichtung/normalem Dateieingang
wiederverwendbar. Neue converter-workspace-Verifikation prüft Flächenkorrekturen, native
Konvertierungen, Vergleich/Reports/Begleitdateien und Übernahme in CAD+offenem/geschlossenem
Netz+gesperrter Vorlage. Echte Maus-/Escape-Eingaben, sichtbare Bestätigung über den
Seitenleisten, Verwerfen, fremde Revision, Undo/Redo, physisches Format-8-Speichern/Öffnen,
Exporte, Abbruch und Reload. Nur mitgelieferte synthetische Modelle; keine privaten Inputs.
Eigenes --verify-converter-workspace in der tatsächlich gepackten EXE und separate
package/archive-converter-workspace-Skripte. Nachweise work/converter-workspace/checks
bleiben von allen vorherigen Abnahmen getrennt. Erhaltung umfasst jetzt auch die volle
0.27-Ausgabe. Beschreibung: GEMEINSAMER-KONVERTER.md. Paket 10–13 und 14–27 bleiben eigene
nachfolgende Arbeitspakete.
 
## Gemeinsame KI-Anbindung für den Konverter (15.10.2026)

Formnaro 0.28.1 nutzt für den integrierten Flächeneditor dieselbe
`cad-ai:generate`-Verbindung und `createAIProfiles` wie der CAD-Chat.
`domain:converter` verwendet einen eigenen Regionsvertrag, denselben Transport,
Anbieter und serverseitigen Schlüssel. Kein zweiter Key-Speicher und keine
Schlüsselweitergabe an Renderer oder Konverter-Unterprozess. Der gemeinsame
Einstellungseditor kann innerhalb der Workbench geöffnet werden.

Anfragen tragen optional eine Kennung; Abbruch ohne Kennung gehört weiterhin
dem bisherigen CAD-Chat, Abbruch mit Kennung nur diesem Auftrag. Eine bereits
laufende Anfrage kann nicht durch den anderen Bereich abgebrochen werden.
Ein Konvertervorschlag enthält maximal 20 vorhandene type/protect/merge-Befehle
gegen maximal 256 zusammengefasste Bereiche. Keine Rohgeometrie, Dateinamen,
Pfade oder freien Modelltexte im automatisch gebildeten Konverterkontext.
Lokale Analyse berechnet einen isolierten Kandidaten; Apply erzeugt einen
Regions-Undo. Verwerfen, Abbruch, Close und Projektrevision entwerten den
Vorschlag. Native Prozessbereinigung wird vor der nächsten Berechnung abgewartet.

Die Engine 0.10.0/Protokoll 2 bleibt bytegleich. Der separat entwickelte
Solo-Konverter einschließlich seines Schlüsselspeichers wird nicht geändert;
seine neueren Maßrezepte werden hier nicht als bereits übernommen ausgegeben.
Nutzerpriorisierung zieht nur den API-/KI-Anbindungsteil von Paket 12 vor.
Projektformate und die lokale MCP-Schnittstelle bleiben unverändert.
Prüfungen verwenden synthetische Antworten über einen lokalen Testanbieter und
isolierte Profile; Anleitung `GEMEINSAME-KI-ANBINDUNG.md`.

## Paket 10: ausdrückliche CAD-Netzkopie (15.10.2026)

0.29.0 ergänzt die interne Workeroperation `cadToMesh`. Sie verwendet die
bestehende native Double-Exporttessellierung auf einer unabhängigen BRep-Kopie,
keine Anzeigegeometrie, kein STL-Zwischenformat und keine implizite Umwandlung.
Die native Solidvalidierung liefert das CAD-Volumen. Nur exakt gleiche
Punktkoordinaten werden indexmäßig zusammengefasst; es gibt keine tolerant
verschobenen Punkte, Lückenschließung oder automatische Reparatur. Der
Originalkörper bleibt unverändert. Die konservative Matrixnorm begrenzt die
lokale Deflektion bei Skalierung/Scherung; die volle affine Wurzelmatrix wird
auf dem neuen Netz erhalten. Gespiegelte Rahmen behalten lokal positive
Dreiecksorientierung; bestehende Netz-/Exportwege behandeln die Spiegelung.

Es entsteht genau eine neue rohe Meshwurzel mit eigener Kennung, Objektfarbe,
Deckkraft und Quellorganisation. `metadata.sourceReference` hält die schon seit
Paket 2 vorgesehene historische CAD-ID, Geometrie-/Posen-SHA256 und Operation
`cad-to-mesh`; die eingestellte Qualität steht in der Notiz. Kein neuer
Projektformatzusatz, keine CAD-Quelle innerhalb einer Manifold-Rezeptquelle,
keine automatische Aktualisierung nach CAD-Änderungen. Körperwerkzeuge prüfen
die Kopie separat im vorhandenen Netz-Rechenkern.

Das eigene Arbeitsflächenpanel verwendet gemeinsame Vorschau/Apply und ein
Undo. Vorschauersatz blendet nur die Originaldarstellung temporär aus;
Originalvergleich, Cancel und Escape stellen sie wieder her. Qualität,
Auswahl oder bestätigte Revision entwerten Kandidaten; späte Ergebnisse dürfen
keine neue Sitzung überschreiben. Bei Apply wird vor dem gemeinsamen Commit
die eigene Sitzung geschlossen, damit dessen Revisionsmeldung keinen eigenen
Abbruch auslöst. Auf Wunsch/defaultchecked wird die neue Kopie anschließend
über die bestehende, nicht persistierte Isolation zur Bearbeitung angezeigt.
Undo der Erstellung beendet eine dadurch ungültige Isolation automatisch.
Isolation beschränkt weiterhin keinen Produktionsexport.

Prüfungen verwenden gebohrte Baugruppen, ein dünnwandiges Rohr, unterschiedliche
Qualitäten und gescherte/gespiegelte Rahmen. Unbeteiligte rohe offene/geschlossene
Netze und gesperrte Vorlagen bleiben erhalten. Neue EXE-Verifikation
`--verify-cad-mesh-copy` arbeitet in frischen TEMP-Profilen und prüft echte
Maus-/Escape-Bedienung, native Vorschau/Apply, tatsächliche Netzteilung,
physisches Format-8-Speichern/Öffnen sowie ausgewählte Netzausgaben und
unveränderte native CAD-STEP-Ausgabe. Kernel-WASM und Konverterruntime
bleiben unverändert. Anleitung `CAD-ALS-NETZKOPIE.md`.


## Paket 11: direkte Netz-CAD-Kopie (15.10.2026)

Formnaro 0.30.0 ergänzt eine ausdrückliche Übergabe genau einer vollständigen,
sichtbaren, entsperrten Material-Netzwurzel an die vorhandene lokale Konverter-
Workbench. `cad-mesh-to-cad-data.js` bildet ASCII-STL aus gespeicherten Double-
Koordinaten und Indizes, unabhängig von Anzeige-/Exporttessellierung. Der volle
lineare 3×3-Anteil der affinen Lage wird vor der Konvertierung eingerechnet;
negative Determinante kehrt die Dreieckswindung um. Die Translation bleibt als
separater CAD-Wurzelrahmen. So gelten die Konverterbudgets in tatsächlichen
Millimetern und die Translation wird nicht in STL-Punkte gerundet. Keine zweite
Einheitsumrechnung oder Platzierung an der aktuellen Arbeitsebene.

Die quellgebundene Workbench fixiert Millimeter und startet ohne Reparatur.
Reparatur ist eine ausdrückliche Option ausschließlich für den Kandidaten. Die
Konvertierung löst keinen obligatorischen STEP-Speicherdialog aus; ein separater
Dateiexport bleibt möglich. Analyse, Regionskorrekturen und Ergebnisvergleich
verwenden dieselbe unveränderte Engine 0.10.0/Protokoll 2. Maximal 40.000 Dreiecke
und 50 MiB STL-Zwischendaten für die Objektübergabe, 20.000 Dreiecke im vorhandenen
Flächeneditor und 30 MiB STEP sowie bestehende Laufzeitbudgets bleiben Grenzen.
Keine automatische Reduktion, kein neues Netzverfahren und kein Cloudauftrag.

Die interne Workeroperation `meshToCad` verlangt den bestätigten Ausgangsstand,
eine aktuelle Quellen-ID und den Digest der gespeicherten Geometrie samt Pose.
Native STEP-Validierung erzeugt eine neue CAD-Wurzel mit eigener ID, Quellname-
Suffix, Objektfarbe, Deckkraft, Layer und Ordner. Das bestehende Format-8-Feld
`metadata.sourceReference` speichert Netz-ID, Geometrie-/Posen-Digest und
`operation:'mesh-to-cad'`; Diagnose in der Notiz. Das Originalnetz bleibt mit
Rezeptquellen, Quellenfarben, Markierungen und vollen Rohdaten erhalten. Die
Kopie ist unabhängig; spätere Änderungen oder Entfernen der Quelle ändern
sie nicht. Es werden keine ursprünglichen CAD-Konstruktionsparameter erfunden.

`createCadConverterImport` verwendet die gemeinsame native Vorschau und die
gemeinsame Historie. Bei der Vorschau ersetzt die Darstellung nur das Quellnetz;
Verwerfen/Escape stellen die normale Szene wieder her. Erst Apply erzeugt einen
Projekt-Undo. Quell-Digest und gesamte Projektrevision binden die Sitzung;
zwischenzeitliche Änderungen verhindern die Übernahme eines alten Ergebnisses.
Auf Wunsch/defaultchecked folgt die bestehende temporäre Isolation der CAD-Kopie.
Sie verändert keine gespeicherte Sichtbarkeit und schränkt keinen Export ein.

Getrennte Nachweise für den neuen Ablauf unter `work/mesh-to-cad/checks`, eigene
unveränderliche Ausgabe `release-formnaro-netz-cad-v0.30.0` und Archiv
`output/Formnaro-Netz-CAD-v0.30.0.zip`. Die Paket-/Archivskripte binden aktuelle
öffentliche Quellen, Originalprüfberichte, tatsächliche EXE/ASAR und die ganze
neue Runtime. Für die inzwischen benutzte 0.29-Ausgabe werden ausschließlich
ursprüngliche Runtime-Dateipfade ihres eingefrorenen Manifests gelesen; später
hinzugekommene Daten/Layouts/Projekte werden nicht durchsucht. Vorige Archive,
Konverterruntime, beide WASM-Kerne und Solo-Konverter bleiben Erhaltungsziele.
Die technische Implementierung ersetzt keine erfolgreiche Quell-/EXE-/Archiv-
Abnahme. Anleitung `NETZ-DIREKT-IN-CAD.md`; Paket 12/13 und 14–27 bleiben getrennt.


## Paket 12: gemeinsame Datei-/Einstellungs-/KI-Abläufe (16.10.2026)

Formnaro 0.31.0 führt Datei- und Konvertervorgaben unter dem versionierten
`offlinecad-workflow-settings-v1` zusammen. Das eng validierte Format enthält
Importeinheit, Netzverwendung und SVG-Höhe, Exportformat/-umfang sowie die
bestehenden Konverterwerte für Budget, Verfahren, Facettenrückfall und getrennte
Reparaturvorgaben für Datei- und Szenennetzwege. Die direkte Szenennetzübergabe
bleibt physisch in Millimetern. KI-Zustimmung gehört nicht zum gespeicherten
Workflowformat. Bestehende Preferences-, Qualitäts- und Layoutverträge bleiben.

`cad-workflow-settings.js` definiert zudem `FormnaroSettings` Version 1 für
übertragbare Programmeinstellungen, Qualität, Workflow und optionale aktuelle
anonyme Anordnung. Unbekannte Felder werden abgewiesen. Kein Modell-/Projekt-
oder Autosicherungsinhalt, Providerprofil, API-Key, Dateipfad oder benanntes
Layoutprofil im Bundle. Der normale Einstellungsdialog bietet separates Laden,
Prüfen, Übernehmen und Verwerfen. Vollständige Vorabvalidierung vor Änderungen;
Speicherversagen löst Rücksetzen der versuchten Bereiche aus, ein gescheitertes
Rücksetzen muss ausdrücklich gemeldet werden. Übernahme verändert keine
Projektgeometrie oder Modellhistorie.

Die Konverterauswahl Ohne KI/Mit KI ist ausdrücklich pro Auftrag und wird nicht
als künftige Zustimmung persistiert. Gemeinsamer bestehender Providertransport
und Schlüsselspeicher bleiben; der Solo-Konverter bleibt eigenständig. Der
STL-CAD-Import führt in die vorhandene Konverterprüfung mit gemeinsamer nativer
Vorschau/Übernahme, statt einen separaten impliziten Modellwechsel auszuführen.
Lokale Analyse und Konvertierung benötigen weiterhin keinen Cloudauftrag.

Die Erweiterung `cad-mixed-ai.js` beschreibt begrenzte vorhandene Netzwerkzeuge
und validiert Befehle auch an der lokalen Grenze. CAD-Segmente und Netzschritte
werden von ihren jeweiligen Rechenmodulen in einem transienten Kandidaten
berechnet. Kein Zwischen-Apply und kein Zwischen-Undo; erst das vollständige
geprüfte Ergebnis darf in die gemeinsame Transaktion übernommen werden.
Sperren, Quellen, affine Lagen und Revisions-/Abbruchschutz bleiben verbindlich.
Objektumwandlungen bleiben ausdrückliche Werkzeuge; neue Netzverfahren 14–27
werden nicht aus vorhandenen KI-Befehlen abgeleitet.

Eigene Quell-/EXE-/Archivnachweise in `work/unified-workflows/checks`, separate
Ausgabe `release-formnaro-gemeinsame-ablaeufe-v0.31.0` und Archiv
`output/Formnaro-Gemeinsame-Ablaeufe-v0.31.0.zip`. Neue Paket-/Archivskripte binden
vollständige öffentliche Quellen, Originalnachweise, tatsächliche EXE/ASAR und
die neue Runtime. Zur Erhaltung der inzwischen benutzten 0.30-Ausgabe werden
nur die ursprünglichen 1621 Runtime-Dateipfade ihres eingefrorenen Manifests
geprüft; später hinzugekommene Daten/Layouts/Projekte werden nicht durchsucht.
Native Engine 0.10.0/Protokoll 2, beide WASM-Kerne, frühere Archive und Solo-
Konverter sind Erhaltungsziele. Implementierung allein bedeutet keine erfolgreiche
Quell-/EXE-/Archivabnahme. Anleitung `GEMEINSAME-DATEIEN-EINSTELLUNGEN-KI.md`.
Paket 13 und die Netzverfahren 14–27 bleiben eigene folgende Arbeitspakete.


Paket-12-Bedienvertrag vor dem Quellenfreeze präzisiert: Der normale STL-CAD-
Import übergibt nach Importieren an dieselbe Workbench mit lokaler Analyse.
Datei-, Import- und Szenennetzwege beginnen je Auftrag Ohne KI. Mit KI verlangt
Vorschlag prüfen und anschließend Apply der Flächenkorrektur oder ausdrückliche
Bestätigung Ohne Flächenänderung weiter für eine gültige Nachricht ohne Befehle.
Rückfragen, Fehler, Verwerfen und Abbruch zählen nicht als bestätigte KI-Prüfung;
kein impliziter Ausweichweg. Der anschließende lokale Konverter und die gemeinsame
CAD-Vorschau/Übernahme bleiben getrennte Prüf- und Bestätigungsschritte mit einem
Projekt-Undo. Konverterstandänderungen entwerten die KI-Prüfung. Die optionale
Konverter-STEP im Import-/Szenennetzweg ist roh und auf den Konvertereingang
bezogen; aktuelle Weltposition/spätere CAD-Änderungen über normalen Projektexport.
Der Anwenderleitfaden beschreibt den tatsächlichen begrenzten vorhandenen Mesh-
KI-Werkzeugumfang und lässt spätere Netzverfahren ausdrücklich offen.

## Paket 13: Gesamtabnahme der gemeinsamen Ausgabe (16.10.2026)

Die separate Abnahmeausgabe 0.32.0 prüft die vollständige Kette aus normalen
Import-, CAD-/Netz-Bearbeitungs-, ausdrücklichen Objektumwandlungs-, Speicher-,
Öffnen- und Exportwegen. Der erste Anwendungsprozess speichert ein gemischtes
Format-8-Projekt und endet vollständig. Ein zweiter isolierter Prozess öffnet
dieselbe physische Datei, vergleicht BReps, Rohnetze, affine Lagen, Quellen,
Metadaten und Sperren, bearbeitet geeignete CAD-/Netzteile weiter und speichert
erneut. Der Export wird gegen die physische Geometrie geprüft. Die bisherigen
neun Oberflächensuiten und die native Grundlagensuite ergänzen diese Kette.

Die durchgehende Prüfung fand einen begrenzten Fehler im SVG-Bedienweg:
der Umfang des gemischten Projekts konnte ein offenes Netz an die vorhandene
Körperprojektion übergeben und eine rohe `NotManifold`-Fehlermeldung auslösen.
Der gemeinsame SVG-Helfer prüft den ausdrücklich gewählten, dauerhaft sichtbaren
Umfang vor den Rechenaufträgen auf offene/beschädigte Netze und weist diese mit
`SVG_OPEN_MESH` ab. Ein erst im vorhandenen Netzverfahren festgestellter ungültiger
Körper wird als `SVG_INVALID_MESH` verständlich zurückgegeben. Der normale
Exportdialog zeigt beide Fälle in `export-status`, bleibt geöffnet und erklärt
die Auswahl geeigneter Teile mit dem Umfang „Ausgewählte Teile“. Die lokale
Automation erhält denselben Vertrag. Keine stille Auslassung oder Reparatur,
keine Änderung von Projekt oder Historie und kein neues Projektionsverfahren.
Ansichtsvorlagen bleiben außerhalb der SVG-Produktion; vorübergehende Isolation
ändert den dauerhaft sichtbaren Exportumfang nicht.

Ein zusätzlicher Export-Lifecycle-Fix bindet die Rückmeldung und Dateiausgabe an
die ursprüngliche Dialogsitzung und deren verbundenes Statusfeld. Schließen oder
Ersetzen des Dialogs während einer asynchronen Berechnung entwertet die Sitzung;
eine verspätete Rückmeldung schreibt kein fremdes oder entferntes Statusfeld und
schließt keinen nachfolgenden Dialog. Der optionale `current`-Prüfer in
`exportModel` unterdrückt die noch nicht gestartete Dateiausgabe eines solchen
Ergebnisses. Projekt, Quellen und Historie werden dadurch nicht verändert.

Eigene Nachweise liegen in `work/release-acceptance/checks`, eigene Ausgabe
unter `release-formnaro-gesamtabnahme-v0.32.0` und portables Archiv unter
`output/Formnaro-Gesamtabnahme-v0.32.0.zip`. Erfolgreiche Originalberichte mit
regulärem Prozessende, ihre Zuordnung zur tatsächlichen EXE/ASAR und vollständige
Quell-/Runtime-/Archivprüfung sind Voraussetzung für den Abschluss. Maßgeblich
sind die neuen `final-audit.json` und `delivery.json`; diese Verfahrensbeschreibung
ist selbst kein positiver Prüfbericht. Es werden keine Prüfpunkte allein aus
früheren Versionen als frisch bestanden übernommen.

Die vorhandene native Konverter-Engine 0.10/Protokoll 2, gepinnte Quellen und
beide WASM-Kerne bleiben erhalten. Bereits benutzte portable Altversionen werden
nur anhand der ursprünglichen bekannten Programmdateipfade ihrer eingefrorenen
Manifeste geprüft. Private spätere Daten-/Layout-/Projektordner werden nicht
durchlaufen. Die Abnahme nutzt eigens erzeugte Geometrie und isolierte Profile,
KI-Wege ausschließlich lokale synthetische Anbieterantworten. Kein echter
Cloudaufruf oder persönlicher Zugangsdatenbestand ist dafür erforderlich.

Anleitung und Prüfmatrix: `GESAMTABNAHME-FORMNARO.md`. Paket 13 schließt bei
erfolgreicher Abnahme das gemeinsame Zwischenziel der Pakete 1–13 ab. Die neuen
Netzverfahren 14–27 und spätere Modellierpinsel bleiben getrennte Arbeitspakete.


## Paket 14: ursprüngliche Netzflächen auswählen (16.10.2026)

Formnaro 0.33.0 ergänzt eine geometrieerhaltende Auswahl für bearbeitbare
Netzobjekte. `mesh-selection-data.js` definiert den strikten persistierten
Vertrag `FormnaroMeshSelection` Version 1: Objekt-ID, exakter Digest der
ursprünglichen Netzarrays, ursprüngliche Dreiecks-IDs und Randkanten mit
ursprünglichen Punktindizes. Die Auswahl wird in Arbeitsfläche Version 4 des
bestehenden Format-8-Projekts gespeichert. Entwürfe bleiben transient;
Übernehmen verändert die Arbeitsfläche ohne Modell-Undo, Abbrechen/Schließen/
Escape stellen die vorher bestätigte Auswahl wieder her.

Die Nachbarschaft verwendet nur exakt koordinatengleiche logische Punkte und
schreibt keine Netzarrays um. Komponentenauswahl wächst über reguläre Kanten
mit zwei entgegengesetzt orientierten Vorfällen. Punktberührungen, Mehrfach-
verbindungen, doppelte/entartete oder widersprüchlich orientierte Dreiecke sind
keine durchlaufbaren Verbindungen. Oberflächen vergleichen die Normalen an
jeder Nachbarkante im vollständigen affinen Weltrahmen; sukzessiv kleine Winkel
können eine größere gekrümmte Fläche erreichen. Es wird keine technische
Konstruktionsfläche rekonstruiert. Öffnungsränder sind eindeutige unverzweigte
Grad-2-Ringe aus echten Einzelinzidenzkanten und speichern keine Dreiecksauswahl.

Die Berechnung ist auf 500.000 Dreiecke und 1.000.000 Punkte begrenzt, läuft im
abbrechbaren Worker und liefert keine Reparatur oder Körperfreigabe. Tatsächliche
sichtbare Ray-Hits bestimmen den ursprünglichen Dreiecksindex; vordere Objekte,
CAD-/Vorlagenarten und geerbte Sperren dürfen nicht umgangen werden. Auswahl-
Overlays sind reine Ansicht und nehmen an keinem Geometrieexport teil. Stil und
Pose erhalten gültige Geometriebezüge; echte Rohdatenänderungen entwerten sie.

Eigene Nachweise liegen in `work/mesh-selection/checks`, die separate Ausgabe
unter `release-formnaro-netzauswahl-v0.33.0` und das portable Archiv unter
`output/Formnaro-Netzauswahl-v0.33.0.zip`. Das Paket fordert aktuelle gezielte
Automatikprüfungen und echte Quellen-/EXE-Oberflächenläufe für die Auswahl und
betroffene bestehende Netz-/Arbeitsflächen-/CAD-/gemeinsame Dateifunktionen.
Die unveränderten nativen Kerne werden erhalten; keine frische vollständige
Kernelabnahme wird allein aus früheren Berichten behauptet. Vollständige
öffentliche Quellen ohne Ausnahmen, neue Runtime/ASAR, Rohberichte und externe
Exit-/Identitätsnachweise werden gebunden. Nur die 1623 bekannten ursprünglichen
Programmdateipfade der benutzten 0.32 werden gelesen; persönliche spätere
Daten/Layouts/Projekte werden nicht durchlaufen. Solo-Konverter, alte Archive,
1535 Konverterdateien und beide WASM-Kerne bleiben Erhaltungsziele.

Maßgeblich für den Abschluss sind die erfolgreichen `final-audit.json` und
`delivery.json`; diese technische Beschreibung ist kein positiver Prüfbericht.
Anleitung `NETZ-FLAECHENAUSWAHL.md`. Pinsel/Lasso/Schutzbereiche aus Paket 15 und
weitere Verfahren 16–27 bleiben folgende getrennte Arbeitspakete.

## Paket 15 – Auswahlpinsel, Lasso, Schutzbereiche (0.34.0)

Aufbau auf P14, keine Reparatur-/Reduce-/Sculpt-Verfahren vorgezogen.
`mesh-selection-screen.js` bildet eine private Float64-Welt-BVH aus Originalnetz
und sichtbaren Anzeigeteilen zur Verdeckungsprüfung. Sichtbare Mittelpunkte
werden über Kreiszug oder EvenOdd-Lasso ausgewählt, Pinsel zusätzlich mit
Strahlproben am Pfad. Original-IDs und Geometrie-SHA bleiben erhalten. Worker
kann beim Abbruch beendet werden; ein Strich ist ein begrenzter lokaler
Undo-Schritt. Renderer-Overlays und Konturen bleiben reine Ansichtsdaten.

`metadata.meshProtection` (FormnaroMeshProtection/version1) speichert höchstens
32 benannte Masken je Netz, purpose bore/contact/custom, Rohgeometrie-SHA und
ursprüngliche Dreiecksnummern. UI entwirft Masken gemeinsam mit der Auswahl;
Übernehmen ist nur bei geänderten Schutzmetadaten eine Modelltransaktion.
Gemeinsamer Transaktionsguard vor und nach Builder verweigert Geometrieänderung
und Entfernung geschützter Netze, bis Masken separat explizit entfernt wurden.
Bestehende ganze-Netz-Verfahren ignorieren Schutz daher nicht stillschweigend.
Affine Pose/Größe und Stil bleiben erlaubt, Quellen und andere Teile erhalten.
Open/New und Undo/Redo ersetzen ganze geprüfte Zustände; geänderte geladene
Geometrie darf alte Masken behalten, die sichtbar ungültig bleiben und nicht
auf neue Dreiecke abgebildet werden. Kein neues Projektformat über8 nötig.

Anleitung `NETZ-AUSWAHLPINSEL-SCHUTZ.md`, neue UI-Abnahme erweitert die reale
P14-Zeiger-/Import-/Dateikette um Rasterstriche, technische Bohrungs-/
Anlageflächenmasken, Modell-Undo, Guard und Export. Separate0.34-Ausgabe und
Archiv; Freigabe ausschließlich durch erfolgreiche neue final-audit/delivery
unter work/mesh-selection-advanced/checks. Keine persönlichen Testdateien.

## Paket 16 – Netzinspektor (0.35.0)

Reine Diagnose in eigenem modeless Panel und eigenem abbrechbaren Auswahlworker.
`mesh-inspector.js` konsumiert die originale exakt-koordinatengebundene
Auswahltopologie. Kategorien: offene Randkanten, alle betroffenen Duplikatflächen,
entartete Originalflächen, inkonsistente Nachbarrichtung, Kanten mit >2 Flächen,
getrennte lokale Punktfächer und kleine Nebenkomponenten. Iteratives Union-Find
für kantenverbundene Komponenten und lokale Flächenfächer, keine geometrische
Mutation oder Toleranzverschmelzung. Bestehende Auswahldaten/Schutzbereiche
bleiben erhalten. Grenzen500kDreiecke/1mPunkte; Hauptkomponente deterministisch
nach Dreieckszahl/Originalstart, Nebenkomponentengrenze frei0..500k. Details der
ersten256 Komponenten im begrenzten Bericht, Gesamtzahl und Markierungen voll.

Renderer erzeugt separat entsorgte farbige Face/Line/Point-Overlays. Kategorien
und explizite Tiefenprüfung/Durchsicht sowie Welt-Fundstellenfokus sind reine
Ansicht. Ursprüngliche IDs + GeometrieSHA binden Ergebnisse; geänderte Quelle
verwirft, affine Lage/Farbe behalten gültige Diagnose. Locks verhindern diese
Read-only-Abfrage nicht. Kein Projektformatwechsel, keine Diagnosepersistenz,
kein Modell-Undo, keine Änderung an Exportumfang. Selbstüberschneidungen,
Wandstärken, konsistent nach innen gerichtete Hüllen und gültiger Körper werden
ausdrücklich nicht durch diesen Topologiebericht nachgewiesen.

Anleitung NETZINSPEKTOR.md; eigener tatsächlicher UI-Test importiert synthetisch
alle sieben Fehlerarten und unauffälliges geschlossenes Netz, prüft Kategorien,
Fokus, Locks/Schutz, Abbruch, aktuelle/ungültige Geometriebezüge, normalen
Dateirundlauf und Objekt-OBJ/STL. Entartete Originalflächen bleiben im Projekt
und OBJ; der bisherige STL-Export weist sie weiter ab. Separate0.35-Ausgabe, Roh-/Exit-/Identitätsnachweise
unter work/mesh-inspector/checks. Abnahme nur bei erfolgreichem final-audit und
delivery. Bisherige0.34/Standalone-Konverter bleiben unverändert.


Paket17 – Gezielte einfache Netzreparatur (0.36.0)
Neuer mesh-simple-repair-Auftrag im gemeinsamen abbrechbaren Mesh-Worker, ohne Materialkörper-Vorbedingung. Pure mesh-simple-repair.js arbeitet mit der exakten logischen P14-Topologie, robust bestätigtem Nullflächenprädikat, deterministischer Duplikatauswahl und iterativem Paritätsabgleich. Nur vorhandene Flächen löschen oder zwei Indizes vertauschen, keine Koordinatenverschiebung/Weld/Fill/Tjunction-Splits/Außenorientierung. Orientierung ungeeigneter ganzer Komponenten bleibt unverändert. Quellgebundene paginierte Kleinteilliste: Hauptteil und Punktkontakte bleiben geschützt, max256 ausdrücklich gewählte Komponenten. Verwendete Koordinaten exakt, unbenutzte Punkte entfallen; alte Auswahl-IDs werden regulär verworfen.
Eigenes Panel mit drei opt-in Schritten, Vergleich Original/Ergebnis, Bericht inkl. Inspektorkategorien vorher/nachher, Vorschau/Übernehmen/Abbrechen. Gemeinsame Transaktion, Revisionstickets, Undo/Redo und vorbereitete Darstellung gelten unverändert. Zentraler P15-Schutzvertrag weiterhin verbindlich, kein automatisches Maskenremapping oder Entfernen. CAD/Referenz/historische Pfade/Locks keine Reparaturziele. Dateiaufträge und unpassende Tastaturaktionen im Entwurf blockiert.
Gesamte Originalnode inkl. bisheriger Historie bleibt im bestehenden MeshSource3 repair/options.method=simple-v1 erhalten. Optionen strikt geprüft und gegen RohgeometrieSHA gebunden, kein stiller Rückfall auf Importreparatur. Vorhandene sourceReference bleibt bestehen; sonst historischer mesh-edit-Verweis. Projektformat8, Arbeitsplatz4, NativeWASM/Standalone-Konverter unverändert. Offene Resultate weiter speicherbar/anzeigbar, Körperwerkzeuge benötigen unabhängige bestehende Materialprüfung. Anleitung NETZREPARATUR.md; Nachweise work/mesh-simple-repair/checks, separate0.36-Ausgabe erst bei final-audit+delivery abgenommen. Paket18 nicht vorgezogen.

Farbprojektion von Reparaturketten verwendet bei einfachen Blattfarben den neuesten gültigen Reparaturfußabdruck statt eines möglicherweise noch defekten Zwischenstands. Echte historische Quellgruppen behalten ihre getrennten Farbregionen. Geprüft: mehrere Teilreparaturen mit Legacy-Quellenfarbe, mehrfarbige Quellgruppe und anschließende Körperteilung.

Paket18 – Einfache ebene Öffnungen schließen (0.37.0)
Pure mesh-hole-fill.js auf exakter P14-Topologie, eigener abbrechbarer holeCatalog im Auswahlworker, mesh-close-hole im gemeinsamen Mesh-Worker. Genau ein ausdrücklich gewählter SHA-gebundener Rand je Vorgang, 3..512 Kanten; paginierte Liste128. Einfache konkave Polygone und gerade Unterteilung unterstützt. Normierte lokale Geometrie, relative Planarität1e-8, konservative Schnitt-/Innenrandprüfung gegen vorhandene Dreiecke. Keine allgemeine Selbstüberschneidungs- oder Körpergarantie. Neue Dreiecke mit Gegenrichtung zum ursprünglichen Rand; alle bisherigen gespeicherten Koordinaten/Indizes/Reihenfolge exakt erhalten. Kein Weld, keine Projektion/Remesh, keine automatische Wahl beabsichtigter Bohrungen. Mehrdeutige Ränder/Flächenfächer/Schäden und ungünstige Numerik abweisen; danach unabhängiger Vergleich der Topologiekategorien, keine neu erzeugten Fehler zulässig.
Modelloses Panel mit expliziter Randauswahl, orangefarbenem Originaloverlay, Welt-Kamerafokus, Vergleich Original/Vorschau und Vorschau/Übernehmen/Abbrechen. Gemeinsame Revisionstickets/Displayvorbereitung/UndoRedo, zentraler Schutzvertrag, Datei-/KI-/Shortcutguards wie P17. Gesamtquelle in bestehendem MeshSource3 repair/options.method=planar-cap-v1, striktes Optionsschema, bestehende sourceReference/Farben/Transform bleiben erhalten. Quellenrezept wiederholbar, keine stille automatische Reparatur. Projekt8/Workspace4 unverändert. Anleitung NETZ-OEFFNUNGEN-SCHLIESSEN.md; isolierte synthetische Prüfungen und separate Ausgabe unter work/mesh-hole-fill/checks, Abnahme erst nach final-audit/delivery. Paket19 nicht begonnen.


Easy Tinker und flexible Oberflächenanordnung (0.38.0)
Eigener portabler Bedienmodus Normal/Easy Tinker, ohne Modell-/Undo-/Layoutänderung
beim Umschalten. Easy: Formen/Suche rechts, grundlegende Bearbeitung oben,
Arbeitsebene/Lineal rechts und kompakte Auswahlkarte; KI/Objektverwaltung/
Spezialwerkzeuge verborgen. Normal: sechs Werkzeugkategorien und umbrechende
Leisten ohne horizontale Scrollpflicht. Bestehende Originalcontrols werden
umgeordnet, keine parallelen Modellierpfade.
Layoutformat1 erweitert um hiddenTools/objectsFirst/workspaceFirst und registriert
Netz-/Umwandlungs-/Bohr-/Arbeitsebenentools. Alte Profile werden unter Erhalt der
Positionen migriert. Werkzeuge zwischen Dateileiste/Toolbar/Ansicht verschiebbar;
Liste im Anordnungseditor erreicht auch nicht sichtbare Controls, Sichtbarkeit,
Reihenfolge, Seitenleistenabschnitte und benannte Layouts. Einstellungen bleibt
erreichbar. Bewegungsmodi bleiben eigene Zone. Mode-Schlüssel getrennt von
Projekt/Layouts: offlinecad-workbench-mode-v1, bedienmodus.json. Bearbeitungsentwürfe
blockieren Moduswechsel. Projekt8/Arbeitsplatz bis4, Geometrie und Kernel unverändert.
Anleitung docs/EASY-TINKER-UND-LAYOUT.md. Dies ist eine UI-Erweiterung außerhalb
der Netzpaketfolge; Paket19 wird dadurch nicht begonnen.


Easy Tinker: getrennte CAD-/Netzbereiche (0.39.0)
Persistenter CAD/Netz-Schalter in Easy, Standard CAD; Normal bleibt gemischt.
Gemeinsames Projekt8 und Undo bleiben vollständig: Filter über Renderer-Isolation,
ausgewählte Wurzeln, Strg+A, Zwischenablage und Export; inaktiver Typ/Referenzen
bleiben gespeichert. Keine automatische Umwandlung. Standardpalette/Formpakete
nutzen direkt nativen CAD- oder bestehenden Mesh-Worker, Texte Originalkonturen.
Netzquellen über kompakten „Formparameter …“-Zugang; bestehende Mesh-Vorschau/
Übernahme bei Gruppe/Lochform. CAD/native Bytes unverändert bei Netzerstellung.
Domain-/Moduswechsel blockiert in Entwürfen, Dialogen und laufender Erstellung.
Importtyp auf aktiven Bereich beschränkt, inkompatible Formate mit Wechselhinweis;
CAD-STL nutzt bestehenden Rekonstruktionsdialog. Async-Import/-Export bindet neben
Modellrevision auch Arbeitsbereichsticket. Speichern/Öffnen behält beide Bereiche;
Export nur sichtbare Wurzeln des aktiven Typs, Netz bietet kein STEP.
Portabler Programmdaten-Key offlinecad-easy-domain-v1, easy-arbeitsbereich.json,
getrennt von Projekt/Layouts. Bisherige Kernel und Konverter bleiben unverändert.
Eigene isolierte UI-Prüfung --verify-easy-domain, Belege work/easy-domains/checks;
separate0.39-Ausgabe erst nach final-audit/delivery abgenommen. Paket19 unberührt.


Easy Tinker: automatischer Netzreparaturversuch (0.40.0)
Deferred serialer Scheduler nur bei aktivem Easy-Netzbereich und freiem UI.
Sichtbare entsperrte Mesh-Wurzeln ohne Schutzmasken, keine CAD-/Referenzänderung.
Worker-query autoRepair bietet ausschließlich bestehende Reparaturaufträge an:
simple-v1 (keine Nebenbestandteilentfernung), danach begrenztes mesh-repair mit
fillSmallHoles:true (3/4-Randkanten, bestehende exakte T-Knotenbehandlung).
Unabhängige inspectSolid-Prüfung vor Angebot und bei eigentlicher Vorschau;
nur vollständig gültige Resultate automatisch übernehmen, keine Teilbereinigung
bei weiterhin ungültigem Ergebnis. Vollständige Quellen und vorhandene
sourceReference bleiben erhalten; gemeinsame Transaktion/Undo/Redo/Displaygrenzen.
Keine neuen Geometrie-/Projektformate. Gescheiterte Versuche bleiben unverändert.
Geometrie-Digests binden Versuch und Ergebnis; begrenzte Sitzungscaches verhindern
Wiederholung auch nach Undo. Domain-Epoche, Revision und Idle-Prüfung schützen vor
späten Ergebnissen, Dialog-/Entwurfsunterbrechung und Konkurrenz. Früh angeklicktes
Gruppieren wartet auf den laufenden Reparaturversuch. Normale Werkzeuge unverändert.
Anleitung docs/EASY-TINKER-UND-LAYOUT.md, eigene isolierte Abnahme unter
work/easy-auto-repair/checks. Keine Änderung an nativen Kerneln/Konverter und
keine Vorwegnahme der Netzpaketfolge. Separate0.40-Ausgabe nach final-audit/delivery.


Erweiterte Easy-Funktionsprüfung und Korrekturen (0.41.0)
Neuer --verify-easy-complete-Prüfpfad mit allen23Paletteformen×CAD/Netz,
Originalinspektor, native Mausbewegung/Skaliergriff und HTML-DragData, Tastatur,
Gruppieren/Auflösen, Ausrichten/Festreferenz, Spiegeln/Escape, Lineal, Arbeitsebene,
Text, Favoriten, Dateiexport und schmale Fenster. Ergänzt bestehende Domain-/
Autorepair-/Layout-/Dateirundlauf-Prüfungen; synthetische TEMP-Profile.
Drei reproduzierte0.40Probleme: CAD-only Auswahl und bounds ids beiAusrichten
zu generischen bounds targets geändert, Mesh-Referenzpick überOriginalrenderer;
Escape schließt Spiegelpanel; commonFromLegacy bereinigt ausschließlich exakt
Nullflächen des erzeugten Float32-Manifold-Outputs, bestätigt geschlossene
Topologie, positiven Körper und Volumenerhalt1e-6rel. Keine Koordinatenänderung,
Duplikatentfernung, Orientierung oderLochfüllung in diesem Generatorpfad.
Gewindemutter bei32/64/96Segmenten und anschließende Parameteränderung geprüft,
gesundeAusgaben bytegleich. Nutzermeshimporte unverändert. Native Kernels/
Konverter unverändert, keine Projekt-/Layoutformatänderung. Separate0.41Abnahme
unter work/easy-mode-audit-20261016/checks. Native CAD-Gewinde bleiben aufwendig;
57sGewinde/25sMutter im isolierten0.40Nachtest, kein Performancegewinn behauptet.

Paket19 – Vorhandenes Netzteilen komfortabler (0.42.0)
Erweitert cad-mesh-tools über eigenes cad-mesh-partition-ui.js und pure mesh-partition-review.js. Vorhandene Manifold-Teilung und Materialzerlegung unverändert: beide Seiten bzw. alle Materialkörper in Ursprungslage, geschlossene Hohlräume zugeordnet, Materialvolumen innerhalb bestehender Toleranzen geprüft. Numerischer Weltabstand entlang normalisierter Normale, X/Y/Z/Arbeitsebene/custom, projizierter Originalpunktbereich durch volle affine Matrix, Mitte/Schritt/Prozentregler. Arbeitsebene setzt initial dot(normal,origin), kein stiller relativer Offsetwechsel.
Zusätzlicher flüchtiger Workerbericht review.parts mit ursprünglicher Ausgabe-ID, Weltbounds, ebenennahen gespeicherten Dreiecken und expliziter Markierungstoleranz. Gelbe Preview-Overlay-Records nutzen vorhandene echte Dreiecke; enthalten möglicherweise schon vorher koplanare Flächen. Markierte Fläche nicht als neu erzeugte Schnittfläche ausgeben. cutArea bleibt vorhandene unabhängige Oberflächenbilanz. Renderer-MeshBasicMaterial/PolygonOffset nur für temporary previewOverlay-Records. Gap/Compare/Focus verändern nur Vorschau, niemals Rezept/Projekt/Export; Apply bleibt an dasselbe Preview gebunden. Körperliste mit Farben/Volumen und Ansehen je Körper. Kein automatisches Entfernen von Nebenbestandteilen.
Bestehendes MeshSource2-Split/Bodies-Rezept und gesamte Originalnode erhalten, keine Formaterweiterung. Bestehende metadata.sourceReference wurde bisher bei diesen Operationen überschrieben; neuer reproduzierender Test, jetzt ausschließlich split/extract bewahren vorhandenen historischen Verweis. Gemeinsamer Undo/Revision/Abbruch/Displayvertrag und zentraler Schutz bleiben verbindlich. Neue Guard-Ergänzung für Split/Bodies-Draft gegen Datei/Shortcut/Toolbar, KI bereits über vorhandenen Busy-Zustand geschützt. Normalmodus über vorhandene Netz-Werkzeuge; Easy-Bereiche/Autoreparatur/Layout und native CAD-Split/Extract bleiben erhalten. Anleitung NETZE-TEILEN-UND-KOERPER.md, getrennte0.42-Ausgabe und Nachweise work/mesh-partition/checks; Abschluss erst bei final-audit/delivery. Paket20 nicht begonnen.

Paket19-Abnahme: Der bestehende P15-Schutzbereichstest prüft die vorgezogene UI-Sperre ausdrücklich (Vorschau deaktiviert, Erklärung sichtbar) sowie zusätzlich die Ablehnung eines direkten Vorschauaufrufs ohne Modell-/Undoänderung. Produkt-Schutzverhalten unverändert; keine Abschwächung der Prüfkriterien. Vollständiger erneuter Quellenabgleich vor Paketierung.


Paket20 – Passstifte und passende Aufnahmen (0.43.0)
mesh-connectors.js erzeugt 1–8 feste zylindrische Stifte und passende Sacklochaufnahmen an genau zwei aneinanderliegenden positiven Meshmaterialkörpern. Referenz in Weltkoordinaten, normalisierte Richtung vom Stiftteil in die Aufnahme, U/V aus bestehendem referenceFrame. Radialspiel je Seite und zusätzliche Tiefe unabhängig; explizite Durchmesser/Länge/Verankerung/Mindestmaterial/Anzahl/Reihenabstand/UV-Versatz/Kreisabschnitte. Vollständige konservative zylindrische Materialhüllen über Boolean-Differenz geprüft, umschriebener Querschnitt mit cos(pi/n)-Korrektur, kein bloßes Wandstärken-Sampling. Hüllen auf beiden Seiten und hinter Sackloch/Verankerung; Kontaktepsilon1e-4mm und begrenzte Volumentoleranzen. Vorherige Paarüberschneidung sowie Kollision der Ergebnisse werden abgewiesen. Netz-Nachbarn mit exakter Stiftüberschneidung, CAD-Nachbarn konservativ anhand transformierter BBox; unprüfbare nahe Nachbarn abweisen, alle Materialnachbarn inklusive ausgeblendeter/gesperrter berücksichtigen. Keine automatische Reparatur/Materialverstärkung und keine globale Festigkeits-/Druckgarantie.
Gemeinsame Workertransaktion mesh-connectors; beide IDs und jeweilige Organisation/Farbe/Deckkraft/Notiz/Herkunft erhalten, gesamte beide Originale in beiden MeshSource3-Rezepten mit type=connectors/part0oder1. Strikte Optionen-/Referenz-/Quellpaarvalidierung, deterministische Geometriewiedergabe. Farbprojektion je Ergebnisteil nutzt ausschließlich seinen Originalteil; neues Stiftmaterial erbt dessen Farbe. Historische gepaarte Quellen sind geometrisch nicht einzeln editierbar, um unpassende Gegenstücke zu verhindern; allgemeine Eigenschaften/Transform der Resultate bleiben verfügbar. Neue Rezepte benötigen0.43, Projekt8/Workspace4 unverändert.
Normal-Netzmenü und bestehender Werkzeugwähler mit createMeshConnectorsUI: explizite Stiftteilwahl, Weltpunkt/Normale inklusive echtem Flächenpick, veränderliche Maße; farbige auseinandergezogene Vorschau und Originalvergleich ausschließlich Darstellung. Apply an denselben geprüften Vorschlag gebunden, gemeinsame1Undo/Redo, Abbrechen/Escape und späte Resultate verwerfen. Entwurf gegen Datei-/Tastatur-/Toolbar-/Moduswechsel und direkte Modellgesten geschützt. Neuer Menüeintrag im bestehenden Layoutschema mit Migration und Easy-Ausblendung registriert. Easy CAD/Netz/Autorepair bleiben enthalten. Keine neuen Geometriekernel oder Konverter. Anleitung STECKVERBINDER.md; separate0.43-Ausgabe und Abnahme unter work/mesh-connectors/checks; Abschluss erst bei final-audit/delivery. Paket21 nicht begonnen.


Paket21 – Netze formtreu vereinfachen (0.44.0)
Reine workerfähige planar-v1-Kantenreduktion auf bestehende Nachbarpunkte; feste Ausgangsebenen verhindern Winkelverkettung über Bohrungen. Kurvenfacetten, Ebenengrenzen, Öffnungsränder, markierte Schutzdreiecke und ungewählte Flächen bleiben fest. Linkbedingung, positive Flächen, Duplikatprüfung, unabhängige Topologie-/Komponenten-/Randprüfung sowie Weltmaß-/Abweichungsgrenze. Geschlossene Eingaben zusätzlich Manifold-Körper-/Volumenprüfung. Bis150.000 Dreiecke, deterministisches begrenztes Budget; Zielprozent/-zahl begrenzt durch Schutz, keine erzwungene Kurvenannäherung.
mesh-reduce als gemeinsame Transaktion; MeshSource3 type=reduce speichert gesamte Originalquelle und strikte gebundene Optionen. Eigenschaften/Herkunft/Lage erhalten. Lokales Rezept-Playback und sicherer Farbrückfall wie Reparatur; historische Geometrieänderungen im Rezept blockiert, allgemeine Ergebnisattribute bedienbar. Zentrale Schutzprüfung erlaubt ausschließlich für das vor Workeraufruf erfasste mesh-reduce-Ziel eine unabhängig verifizierte bijektive Neuzuordnung identischer Schutzdreieckskoordinaten; keine Workerflags als Autorität. Andere Werkzeugschutzsperren unverändert. Projekt8/Workspace4 unverändert, neues Rezept benötigt0.44.
Eigener Normal-Netzmenüeintrag mit Layoutmigration; vorhandene Flächenauswahl als optionaler Umfang. Vorschau/Originalvergleich, Zahlenbericht, Abbrechen/Escape, 1Undo/Redo, späte Ergebnisse verwerfen, Sperren für Dateivorgänge, Moduswechsel und Gesten. Easy bleibt Bestandteil der Abnahme. Anleitung NETZE-VEREINFACHEN.md. Separate Ausgabe und Nachweise unter work/mesh-reduce/checks; Abschluss erfordert final-audit/delivery, reale EXE-Suiten und unabhängig gelesene Projekt-/STL-/OBJ-Geometrie. Synthetischer dichter Bohrungsquader in backend/mesh-reduce-fixture.json; keine Nutzermodelle. Paket22 nicht begonnen.


Paket22 - Neuvernetzen mit Formvergleich (0.45.0)
Workerfaehiges mesh-remesh mit planar-isotropic-v1 und getrennten Modi remesh/subdivide. Neuverteilung in festen ebenen Ausgangspatches durch sichere Splits, qualitaetsverbessernde Flips und lokale Relaxation; feste Form-/Bohrungs-/Oeffnungskanten und Kurvenfacetten im Remeshmodus. Unterteilung erhaelt vorhandene facettierte Oberflaeche und kann Randsegmente verfeinern. Kein allgemeines Kurvenremesh/Coarsening/Smooth. Zielkantenlaenge in Weltmm,1-8 Iterationen,0-1mm Formgrenze; Input150000/Output250000Dreiecke und begrenztes Budget. Positive lokale Flaechen, eindeutige Topologie, Bestandteile und Randdomaene geprueft; analytische feste Ebenengrenze und gesonderte numerische Toleranz, bidirektionale Oberflaechenstichproben ausdruecklich nicht als globaler Nachweis. Geschlossene Eingaben zusaetzlich unabhaengige Manifold-Koerper-/Volumenpruefung.
MeshSource3 type remesh archiviert vollstaendiges Original und strikt gebundene Optionen; Replay/Farbpfad wie Reduce, historische Geometrie gesperrt. Zentrale Transaktion erfasst explizites Ziel vor Workeraufruf; Schutz-Ausnahme nur nach unabhaengig exakt geprueften geordneten Dreieckskoordinaten und erhaltenen Maskenidentitaeten. Ungewaehlte Dreiecke exakt. Herkunft, Lage, Organisation und Aussehen erhalten;1Undo/Redo. Projekt8/Workspace4 unveraendert.
Normales Netzmenue, migrierter Layoutzugang und cad-mesh-remesh-ui mit Original/Ergebnis/ueberlagerter Wireframe-Ansicht aus gleicher Kamera; Anzeigeobjekte ausserhalb Projekt und Export und auf jedem Abbruch entsorgt. Entwurfs-/Datei-/Keyboard-/Modus-/Maus-/Easy-Autorepair-Guards wie Reduce. Anleitung NETZE-NEUVERNETZEN.md; separate0.45Ausgabe, Quelle/EXE/Easy/physischeDateien-/Archive-/Deliverynachweise unter work/mesh-remesh/checks. Abgeschlossen erst nach final-audit und delivery. Paket23 nicht begonnen.


Paket23 - Ausgewaehlte Netzbereiche glaetten (0.46.0)
smoothSelectedMesh / bounded-laplacian-v1 verarbeitet zwingend nichtleere digestgebundene Dreiecksauswahl. World-space konservativer Jacobi-Schritt, Staerke0..1 (0ohneuebernehmbareAenderung),1-30Durchgaenge,maxDeviation gegenOriginal uebergesamtenLauf,Formkantenwinkel0-180. Alle geschuetzten/unselektierten Dreiecke und damit deren incidentVertices, Oeffnungsraender und scharfeOriginalkantenfest. VerbatimPunktreihenfolge/Indices erhalten,Duplikatvertizesgemeinsam. Globale bidirektionale Oberflaechengrenze folgt aus maximaler tatsaechlicher gespeicherter Punktverschiebung bei identischer baryzentrischer Vernetzung; numericalAllowance separat. Rauheit als RMS-Nachbarmittelabweichung im beweglichen Bereich. Maß-/Volumenaenderungen explizit, keinVolumenerhaltsversprechen. Input30000Tris/120000Vertices,1m geometrischePaarpruefungen;FehlerbeiBudgetgrenze stattungepruefterAusgabe. Topologie,Original-/Ergebnis-/Bewegungsueberschneidungen,konservativeAbstandsgrenzen undgesamteSchrittorientierunggeprueft;geschlosseneEingaben zusaetzlichManifold-Koerperpruefung. KeineallgemeineDruck-/Reparaturgarantie.
MeshSource3 type smooth archiviert Original+strikteOptionen,Replay/Farbpfad wieReduce/Remesh; historischeGeometriegesperrt. GemeinsameTransaktion erfasstexplizitesZielvorWorker,Schutzausnahme unabhaengigexaktegeordneteKoordinaten+MaskenidentitaetwieReduce. Herkunft/Organisation/Lage/Aussehenerhalten;1Undo/Redo;Projekt8/Workspace4unveraendert. cad-mesh-smooth-ui undLayoutmigration imNormalmodus;fehlendeAuswahl inlineblockiert mitRueckwegzurAuswahl. Original/Ergebnis/Overlay+echteungezoomteWeltverschiebungslinien,max6000klarbezeichneteAnzeigeauswahl;alleAnzeigeobjektefluechtig. Vorschau-/Datei-/Keyboard-/Gesten-/Modus-/EasyAutorepair-Sperren. Anleitung NETZBEREICHE-GLAETTEN.md. Separate0.46Abnahmeunterwork/mesh-smooth/checks;Abgeschlossen erstnachAudit/Delivery. Paket24nichtbegonnen.


Paket24 – Beschädigte Netzbereiche ersetzen (0.47.0)
eraseFillSelectedMesh/planar-replace-v1 benötigt eine nichtleere digestgebundene explizite Flächenauswahl. Ein zusammenhängender scheibenförmiger Träger mit einem vollständigen einfachen ebenen Interface-Rand; alle Randkanten genau einem erhaltenen Nachbarn zugeordnet. Auswahl berührt keinen Schutz und keinen ursprünglichen offenen Außenrand. Innere umgekehrte/noisy/doppelte/exaktentartete Flächen bei eindeutigem Träger entfernbar; ungewählte topologische Schäden abweisen. Alle originalen gespeicherten Punkte unverändert, alle ungewählten geordneten Dreiecke unverändert und in Originalreihenfolge, neue planare Fülltriangulierung angehängt. Schutzbereiche mit identischen Koordinaten/Identitäten remappen; zentrale Transaktion erfasst ausdrückliches mesh-erase-fill-Ziel vor Workeraufruf und prüft unabhängig. Grenzfälle/Innenränder/Überdeckung/Kreuzungen/Mehrfachränder/Numerik sicher abweisen, kein generisches EraseFill auf beliebigen Kurven. Limit30000Tris/10000Auswahl/512Randkanten. Verbleibende offene Ränder erhalten; nur geschlossenes Ergebnis zusätzlich Manifold-Körperprüfung. Beschädigtes Originalvolumen nicht als bewiesen ausgeben.
MeshSource3 type erase-fill archiviert gesamtes Original und strikte Optionen; deterministischer Replay/Farbpfad wieRepair, historischeGeometriegesperrt. Eigenschaften/Herkunft/Organisation/Lage/Aussehen/1UndoRedo erhalten; Projekt8/Workspace4 unverändert. Eigene cad-mesh-erase-fill-ui im Normal-Netzmenü/Layoutmigration; verbindliche Auswahl, Original/Ergebnis/Overlay mit tatsächlich entfernten roten und neuen grünen Dreiecken aus gleicher Kamera. Nur flüchtige Anzeigeobjekte; vollständige Entwurfs-/Abbruch-/Datei-/Modus-/Keyboard-/Canvas-/EasyAutorepair-Guards wieP23. Beidseitige ausgewählte Oberflächenstichproben ausdrücklich keine globale Grenze, Außenmaße nur referenzierte Oberflächenpunkte. Anleitung NETZBEREICHE-ERSETZEN.md, getrennte Ausgabe0.47 aufF:, Nachweise work/mesh-erase-fill/checks; Abschluss erst nach final-audit/delivery. Paket25nichtbegonnen.

P24 Zusatzprüfung tatsächlicher emittierter Ersatzdreiecke gegen erhaltene Flächen und untereinander: lokale normalisierte Koordinaten, BVH/AABB,500000Paare/2mSuchbudget; gemeinsame topologische Randkontakte gezielt erlaubt, numerisch dünne unklare Nachbarflächen abweisen. Realer Regressionfall mit Randabweichung5e-8mm und in den tatsächlichen Cap reichender Nachbarfläche wird jetzt abgewiesen, obwohl eine reine ideale Ebenenprüfung ihn zuließ. P18-Füller unverändert. Unveränderte Außen/Außen-Paare werden ausdrücklich nicht geometrisch auditiert; keine globale Selbstüberschneidungs-/Reparaturgarantie.

Paket25 – Make Solid als verglichene neue Annäherung (0.48.0)
makeSolidMesh/voxel-wrap-v1 rastert ganze ungeschützte sichtbare entsperrte Meshquelle in Weltmaßen mittels konservativem Dreieck/Zell-SAT, optionalem euklidischen Raster-Closing, Außen-6-Nachbarflood und Signed-Distance-EDT. Vorhandene Manifold-levelSet erzeugt geschlossene positive Oberfläche; lokale und Weltkörperprüfung. Weltauflösung, Schließradius0..3Rasterweiten, signedOffset±3Rasterweiten. Grenzen30000InputTris/120000Vertices/500000Rasterpunkte/160proAchse/150000OutputTris und festeRaster-/EDT-/Levelsetbudgets. Numerisch unauflösbare Weltanker, unklare oder überschrittene Fälle fail closed. Keine Rekonstruktion unbekannter Form/Detailgarantie/Aushöhlung/Wandstärkengarantie. Flächenkomponenten sind nicht automatisch Materialkörper. Punktweise Öffnungsbefunde beziehen sich nur auf einzelne geeignete ebene offene Randringe, keine Garantie für ganze Öffnungen oder Durchgangsbohrungen. Begrenzte beidseitige Abweichungsstichproben, ausdrücklich kein globaler Fehlernachweis; beschädigtes Originalvolumen unbekannt.
mesh-make-solid ergänzt exakt ein neues Objekt mit vorab privat erfasster neuerID; alle bisherigen Objekte/Original exakt, vollständiges Original zusätzlich in MeshSource3 make-solid und neue metadata.sourceReference. Ganze affine Originaltransformation erhalten; inverseWeltgeometrie/Mirroring korrigiert. Schutzbereiche sperren Werkzeug vollständig, keine Protection-Ausnahme. Zentraler unabhängiger Original-/Projektkopievertrag,1Undo/Redo, strenger deterministischer Replay, historische Geometrie gesperrt; Projekt8/Workspace4 unverändert. Normal-Netzmenü/cad-mesh-make-solid-ui mit Original/Ergebnis/Overlay, tatsächlichen offenen Quellkanten und einzelnen Öffnungsprüfpunkten; flüchtige Anzeigegeometrie, volle Entwurfs-/Datei-/Modus-/Keyboard-/Canvas-/EasyAutorepair-Guards. NachApply beideObjekte sichtbar; ausgewählten neuen Körper exportieren. Anleitung MAKE-SOLID.md, separateF-Ausgabe0.48, Nachweise work/mesh-make-solid/checks. Abschluss erst nach final-audit/delivery.
Öffentliche rein synthetische Fixture: beschädigter Float32-Bohrungsquader1007Facets,12×10×8mm,Ø2-Bohrung,kleine fehlendeTopfacette+3Flips. Fein .3/0/0 erhält echte Bohrung (Axis0Hits); grob .6/.6/0 schließt sie (Axis2Hits) und erzeugt7864Tris. Keine Nutzerdateien/Profile/Keys. EDT unabhängiger BruteForceReview24gemischteRaster/48000Distanzen exakt, Core/UI/Controller35gezielt grün vor Vollabnahme. Paket26 nicht begonnen.


Paket26 - Netzkörper aushöhlen (0.49.0)
hollowMesh/signed-distance-shell-v1 benötigt eine ganze ungeschützte sichtbare entsperrte Meshquelle mit genau einer gesunden geschlossenen äußeren Oberfläche und positivem Materialkörper. Strikter Geometriedigest, Wandstärke und Rasterweite in Weltmillimetern, bis acht endliche Ablaufzylinder mit Weltmittelpunkt, normalisierter Richtung, Durchmesser und vollständiger Länge. Konservativer Signed-Distance-Innenraum mit zusätzlichem Raster-/Numerikspielraum wird vom unveränderten facettierten Original abgezogen. Alle tatsächlich erzeugten Innenraumdreiecke werden über begrenzte räumliche Dreiecksabstandsprüfung gegen die Originaloberfläche geprüft; untere Wandstärkengrenze umfasst Dreiecksinneres und affine Speicherrückrechnung. Sie gilt vor den absichtlich abgezogenen Ablauföffnungen. Keine bloße Punktstichprobe als globale Wandstärkengarantie. Quellselbstüberschneidungen und unklare dünne Flächen sicher ablehnen. Bestehende native Manifold-Levelset-/Boolean-Verfahren, kein neuer Geometriekernel.
Vollständige konservative Zylinderendhüllen müssen einem erzeugten Innenraum und dem Außenraum zugeordnet sein; jeder Ablauf muss zusätzlich nachweisbar Material entfernen. Bericht nennt alle, entwässerte und noch geschlossene Höhlungen sowie Materialkörper. Ein Ablauf ist keine Behauptung, dass alle getrennten Höhlungen verbunden oder entwässert sind. Ergebnis muss ein positiver zusammenhängender Materialkörper bleiben und gespeicherte lokale/Weltkörperprüfung bestehen. Limits30000InputTris/120000Punkte/500000Rasterpunkte/160jeAchse/150000OutputTris/8Abläufe/64Höhlungen sowie feste Such-/Abstands-/Levelsetbudgets; numerisch unklare oder überschrittene Fälle fail closed. Kein allgemeiner Druck-/Harzablauf-/Festigkeitsnachweis.
mesh-hollow fügt exakt ein neues Objekt mit vorab privat erfasster neuerID hinzu. Alle bisherigen Objekte, Original, Organisation und übrigen Projektfelder bleiben exakt. Ganze affine Lage und Aussehen erhalten; MeshSource3 type hollow speichert gesamte Originalquelle und strikte gebundene Optionen, deterministischer Replay, historische Geometrie gesperrt, neue Herkunft und1Undo/Redo. Zentraler unabhängiger Original-/Projektkopievertrag wieMakeSolid; Schutzquellen vollständig ablehnen. Neues Rezept benötigt0.49, Projekt8/Workspace4 unverändert.
Normal-Netzmenü/cad-mesh-hollow-ui mit Wandstärke/Raster,0-8Abläufen und echter Flächenwahl für Weltmittelpunkt/Normale. Original/Ergebnis/Überlagerung aus gleicher Kamera und flüchtiger Weltachs-Anschnitt tatsächlicher Innen-/Außendreiecke; grüne Zylinder zeigen vollständige eingestellte Ablaufwerkzeuge. Anzeigegeometrie gehört niemals zu Projekt/Export. Volumen, Wandgrenze, Rasterspielraum und Hohlraumzuordnung sichtbar. Volle Entwurfs-/Abbruch-/Stale-/Datei-/Modus-/Keyboard-/Canvas-/EasyAutorepair-Sperren. Easy Tinker und bisherige Funktionen bleiben Bestandteil der Abnahme. Anleitung AUSHOEHLEN.md; separateAusgabe0.49, Nachweise work/mesh-hollow/checks. Abschluss erst nach final-audit und delivery. Paket27 nicht begonnen.


## CAD-Regeln und lokale KI-Ergebnisprüfung (0.49.1)

Die additive checks-Erweiterung der gemeinsamen Vorschau-API misst size/bounds, natives Weltvolumen, Materialkörperanzahl, minimalen CAD-Abstand und freie endliche Weltzylinder am berechneten Kandidaten. Schema und bounded Validator in cad-ai-result-checks.js, native Prüfung im bestehenden Worker, kein Python-Generator. Maximal32/6000JSON-Zeichen, Toleranz1e-6..0.1 (Default0.01), Körperanzahl exakt. size/bounds erlauben Netze mit expliziter Quellen-Evidenz; native Prüfungen lehnen Netze ab. Auskunft über solids stammt wie Volumen aus service.inspect/BRep, nicht aus übergebenen stats. Keine Aussage über vollständiges Sprachverständnis oder allgemeine Druckbarkeit; clearance beweist nur den um radialen Spielraum reduzierten Mindestkorridor.
Preview führt alle Prüfungen vor Veröffentlichung durch, verwirft jeden fehlgeschlagenen/späten Kandidaten, blockiert Apply während der Prüfung und bleibt an dieselbe Ausgangsrevision gebunden. Erster gültiger Prüfsatz bleibt während maximal2 automatischen Korrekturen fest, auch wenn die KI später Sollwerte/Toleranzen ändert oder checks weglässt. Strukturierte sichere Fehlerrückgabe enthält checkIndex/checkKind/expected/actual/tolerance. Chat/Werkstatt zeigen Messwerte und nicht geprüfte Anforderungen ausdrücklich. Ältere API-Clients dürfen checks weglassen, Projektformat8/Workspace4/API1 bleiben. Konverter behält eigenen Bereichsvertrag. Neuer isolierter CLI-Prüfpfad --verify-ai-result-checks; Anleitung docs/CAD-KI-ERGEBNISPRUEFUNG.md. Abnahmebelege lokal work/cad-ai-result-checks/checks; neue separate Ausgabe nach erfolgreicher Prüfung, alte0.49 erhalten.


## Gemeinsame Funktionsprüfung ab 0.49.2

Der neue test:all-functions-Einstieg katalogisiert eigenständige Node-Suiten und führt aktuelle Oberflächenprüfungen über den echten Electron-Einstieg aus. Jeder Lauf erhält isolierte Profile, neue Rohlogs, Exitcodes und Quell-/EXE-/ASAR-Identitäten. Neue gezielte Prüfungen: zehn reproduzierbare 30-Schrittfolgen, 30-minütiger Dateiwiederholungslauf, erzwungener Testprozessabbruch mit anschließender Autosicherungswiederherstellung und überwachte synthetische Importgrößen. Dokumentation docs/GESAMTPRUEFUNG.md; Erfolg ausschließlich anhand neuer vollständiger Nachweise. Projekt8/Workspace4/API1 bleiben unverändert; keine persönlichen Testdateien und kein Start von Paket27.

Verkettete Make-Solid→Aushöhlen-Prüfung reproduzierte einen echten falschen Selbstschnittbefund: nahezu parallele koplanare Kanten mit exakt gemeinsamem Endpunkt erzeugten durch Determinantendivision einen um 2.2e-10 mm verschobenen Scheinschnitt. segmentTriangleHits erhält identische Endpunkte nun exakt, ohne Kontakt-/Wandgrenzen auszuweiten. Kollineare Überlappung bleibt durch Endpunktcontainment und übrige Kanten geprüft; echte beschädigte Quellen weiterhin abgewiesen. Neue tatsächliche Make-Solid/Aushöhlungsregression mit 7792 Quellflächen und unabhängiger physischer Prüfung; keine Änderung der Geometrieverfahren oder Projektformate.

## Formnaro Mini: Android-Tablet-Testausgabe

Mini 0.5 erhält unter mini/android eine separate native Java-Android-Hülle
(AndroidX WebKit, WebViewAssetLoader, SDK-Ziel 35/Mindest-API 29).
Renderer, Modellformat 1 und Manifold-WASM bleiben gemeinsame Quellen.
mini/src/platform.js trennt Android-Nachrichtenanbindung und Electron-Brücke.
Die Android-Origin ist auf lokale APK-Assets und das Hauptfenster begrenzt;
kein Netzwerkrecht, keine externe Navigation, keine allgemeinen Dateipfade.
Systemdateien laufen über OPEN_DOCUMENT/CREATE_DOCUMENT; internes Autosave
und Bibliothek über geordnete native Schreibvorgänge mit AtomicFile bzw.
Veröffentlichung vollständiger temporärer Bibliotheksordner.
Touch-Platzierung durch Antippen, eigene Ein-/Zweifingernavigation, sichtbare
Mehrfachauswahl, größere Griffe und einblendbare Seitenleisten. Android-Build
getrennt unter dist-android; Buildanleitung und Prüfgrenzen in mini/ANDROID.md.
Erste Ausgabe ist eine Debug-signierte Tablet-Test-APK; eine dauerhafte
Releasesignatur, Store-Veröffentlichung und breite physische Geräteabnahme
sind offen. Private Signierschlüssel, Modelle und Profile niemals mitliefern.

Android-Erstabnahme: 28 Kern- und 2 Touchgruppen, 67 Desktopquellen-Prüfpunkte sowie 13 echte Android-Emulator-Prüfpunkte einschließlich nativer Projekt-/STL-Dateirunde bestanden. Export zusätzlich unabhängig auf geschlossene orientierte Kanten und Sollvolumen geprüft. Physische Geräteprüfung bleibt offen.


Formnaro0.50.0 – lokale KI-Analyse und formangepasste Deckel (in Abnahme)
mesh-lid.js analysiert begrenzte ebene Gehaeuseoeffnungen und kreisfoermige Schraubaufnahmen aus originalen Netzflaechen ohne Quellreparatur. scene.meshLids bietet nur Messzusammenfassungen und an Geometrie+Affine Lage gebundene Kandidaten. Neues dokumentiertes op mesh/tool lid erzeugt ein unabhaengiges Mesh mit archivierter Originalquelle und Netzquellformat3-Rezept, Preview/Apply/Verwerfen/1Undo. Originale und gemeinsame Projektmetadaten werden fuer diesen Schritt zentral unabhaengig erhalten. Querschnittskandidaten, Bohrungsfit, vollstaendige projizierte Quellflaechen im Einsteckbereich und gespeichertes Ergebnis werden geprueft; keine Gewinde-/Dichtungs-/physische Passgarantie. Bis100000Dreiecke, sechs transformierte Quellachsen, einfache dominante Oeffnung, hoechstens8Bohrungen. Numerische Randvereinfachung mit Abstandsreserve, Float32- und Topologiepruefung. KI-Vorschlag zeigt eigenen Geometriebericht. Bestehende Anbieteranbindung/API-Schluessel unveraendert, keine freie Skriptausfuehrung durch das Modell. Handbuch docs/KI-DECKEL.md. Vorbestehende Mini-/Android-Aenderungen bleiben erhalten; Auslieferung erst nach fertiger Abnahme.

Formnaro0.51.1 – allgemeine KI-Modellierwerkzeuge und isolierte lokale Berechnungen (Abnahme)
Zusatzbefehle op:tool und op:script erweitern die bisherige kompatible Befehlsliste. tool delegiert die vorhandenen CAD-/Netzoperationen an dieselben lokalen Geometrieworker; hinzu kommen die vorhandenen gemeinsamen Passungs-/Referenz-/Auflage-/Magnet-/Linealhilfen, geladene Schrift-/Formpaketressourcen und die bestehende lokale Modellkonvertierung samt Regionsanalyse. Neue berechnete Netzgeometrie entsteht ausschliesslich als unabhaengig gepruefter neuer Koerper. Die KI darf Algorithmen und ES-Werkzeugmodule als Quelltext bereitstellen und intern importieren.
Scriptcode und importierte Module laufen in einem Worker innerhalb eines sandbox-iframe ohne gemeinsame Ursprungsrechte; CSP unterbindet externe Datei-, Netzwerk- und Codeladevorgaenge. Modellzugriff nur per serialisierter model/query/run-RPC; keine generische Electron-/Datei-/Provider-/OS-Schnittstelle. Ein Gesamtvorschlag bleibt vorlaeufig, erhaelt Sperren/Schutzflaechen und wird als ein Undo uebernommen; Fehler/Abbruch verwerfen alle Schritte. Schutzremapping wird weiterhin unabhaengig anhand identischer geschuetzter Flaechenkoordinaten geprueft. Anbieteranbindung entfernt die ehemalige pauschale Skriptverbotsanweisung; API-Zugangsdatenverwaltung unveraendert. Rechenzeit-/Daten- und bestehende Geometriekernlimits bleiben technische Grenzen. Hinweise und Vertrag in docs/KI-WERKZEUGE.md und ai/OfflineCAD-KI-Kontext.json. Getrennte Mini-/Android-Ausgaben werden nicht geaendert.

Erweiterte Aufrufbeschreibung nach praktischer Modellprobe: api.model liefert rohe Projektwurzeln unter nodes und dem gleichwertigen objects-Alias, vorbereitete Szenen bleiben cad/scene. Netz-Ziel id/target, direkte oder verschachtelte Katalogabfragen und der vorhandene Werkzeugmethoden-Standard werden einheitlich angenommen. inspectSolid meldet closed nur nach echtem Rechenkernbeweis. Geometrievalidierung, gemessene Digests, Sperren und Schutzbereiche bleiben unveraendert.


## Klare Netzansicht (0.51.2)

Der gemeinsame CAD-/Netzrenderer zeigt reguläre Netzteile standardmäßig deckend
mit Tiefenschreiben an, auch bei früher importierten und mit 60 Prozent Deckkraft
gespeicherten Modellen. Die kleine Kennzeichnung unten links zählt tatsächlich
sichtbare Netzobjekte und bietet einen Ansichtsschalter, der bei Bedarf die
gespeicherte Deckkraft wieder sichtbar macht. Der Schalter ist rein flüchtig und
beim Programmstart aktiv; Projekt, Undo und Export behalten ihre Originalwerte.
Neue STL-/OBJ-Netzimporte erhalten Deckkraft 1 statt 0,6. Ansichtsvorlagen, CAD,
Lochdarstellung und temporäre Vorschauen behalten ihre bisherigen Materialregeln.
Normalmodus und Easy Tinker verwenden denselben Renderer; Mini bleibt separat.
Der isolierte Prüfpfad --verify-mesh-display prüft echten STL-Import, alte
Deckkraft, Umschalten, Wiederverwendung, Sichtbarkeit/Isolation, Löcher, Vorschau,
CAD/Ansichtsvorlagen, Easy-Domänen und die Erreichbarkeit in kompakter Ansicht.
Projektformat 8, Workspace 4 und lokale KI-API 1 bleiben unverändert.

Die Normalansicht erhält zusätzlich eine feste Bearbeitungsleiste mit den
vorhandenen Mini-Symbolen (Tabler/MIT). Kopieren, Einfügen, Duplizieren, Löschen,
Undo/Redo, Bündeln, Gruppieren/Auflösen, Ausrichten, Spiegeln und Absetzen sind
direkt erreichbar; die bisherige Kategorie Bearbeiten entfällt. Dieselben
Originalbuttons und Ereignisse bleiben erhalten, beim Layouteditor werden sie
an ihre gespeicherten Zonen zurückgeführt. Erweiterte Werkzeuge bleiben in
Anordnen/CAD/Netz/Umwandeln/Extras; die feste Leiste bricht bei Platzmangel um.


2026-10-17 – Formnaro 0.52.0: mesh-features.js katalogisiert gemessene ebene Dreiecksbereiche und geschlossene Schnittprofile mit Kreisfits, stabilen quellen-/lagegebundenen Profilkennungen und lokalen freien Schnittebenen. mesh-counterpart.js baut neue unabhaengige prismatische Einsaetze/Huelsen/Abdeckungen mit echten 2D-Konturversätzen und konservativer Volltiefen-Quellflaechenprojektion; gespeicherte Float32-Geometrie separat geprueft. Keine allgemeine Freiform-CAD-Rekonstruktion, keine Gewinde-/physische Passungsgarantie. Gemeinsamer Worker, erhaltene Quellen/Verfahren, unabhängige Originalerhalt-Guards, Preview/Apply/Undo. Manuelle UI unter Netz-Werkzeuge; KI scene.meshFeatures, featureCatalog, typisierter counterpart und generischer mesh-counterpart inklusive Skripten. Sandbox-/Datei-/Netzrechte unveraendert. Details docs/FORMERKENNUNG.md; Abnahmebelege werden pro Ausgabe separat gespeichert.


2026-10-17 – Formnaro0.53.0: vorbereitende reine KI-Messrunden (max2, je8Abfragen, kompakte Rueckmeldung, insgesamt max5Anbieteraufrufe inklKorrekturen), ohne Modell-/Undo-Aenderung. Neue resultChecks fuer geschlossene Materialnetze: Koerperanzahl, Weltvolumen, freie endliche Bohrkorridore mit umschriebenem256-Eck und konservativen Float32-Sicherheitszugaben; keine allgemeinen Netzabstaende oder exakten Lochdurchmesser behauptet. CAD-/Netzpruefungen kombiniert im bisherigen Preview/Apply-Vertrag, Evidenz getrennt. Aktueller Modell-/Auswahlstand, Abbruch, Quelldaten-/Datei-/Netzgrenzen bleiben erhalten. Einzelheiten docs/KI-MESSUNGEN.md. Echte Anbieterproben und persoenliche Modelldaten bleiben ausschliesslich im privaten work-Kontext.

2026-10-17 – Formnaro 0.53.1: Zeitlimit je einzelner KI-Anbieteranfrage in desktop-ai.cjs von vier auf zehn Minuten (600000 ms) erhöht. Manuelles Abbrechen und Aufräumen des Zeitgebers bleiben erhalten; Messrunden und Korrekturen behalten ihre bisherigen Grenzen.


## Messebenen, Radialspiel und Berichtsseiten (0.54.0)

Feature-/Deckelkataloge ergänzen tatsächliche Messebenen und Mittelpunkte einschließlich numerischem Schnittversatz; alte nominelle Anker/Profilkennungen bleiben kompatibel. Die Formerkennung zeigt beide Ebenen. Reine KI-Messaufträge unterstützen begrenzte, ausdrücklich gekennzeichnete Berichtsseiten mit Gesamtzahlen und Fortsetzungspositionen. Zwei Runden/acht Abfragen/32.000 Zeichen Gesamtfeedback bleiben erhalten.

`radialClearance` als reine Netzabfrage und atomare KI-Ergebnisprüfung misst mehrere Schnitte und verifiziert zusätzlich konservative Radialspiel-Untergrenzen über das volle angegebene Höhenintervall durch Projektion aller in adaptive Höhenabschnitte geschnittenen Dreiecke. Zwei sichtbare, geschlossene Material-Netzteile, explizite Weltachse, 3–33 Schnitte, maximal 100.000 Dreiecke je Teil und begrenztes Rechenbudget. Keine universelle Netzabstands- oder physische Passungszusage; unrunde/exzentrische Fälle können konservativ abgewiesen werden. Integration in vorhandene Preview/Apply/Undo-, Korrektur-, Worker- und Skriptwege. Details: [KI-MESSUNGEN.md](KI-MESSUNGEN.md).

## Easy-Tinker-Leistung (0.55.0)
Unveraenderliche bestaetigte Netzpunkte erhalten schwach referenzierte lokale Bounds fuer Massfelder; mutable Entwuerfe werden weiter gescannt und Rueckgaben bleiben unabhaengige Arrays. Auswahl/Sichtbarkeit verwenden pro Aktualisierung lokale Indizes; leere Quellenansicht erspart erneuten Sichtbarkeitsdurchlauf. Read-only-CAD-Workerauftraege ohne separate Baseline validieren/identifizieren ihre identische Eingabe einmal; Bearbeitungsauftraege und explizite Baselines behalten getrennte Kopien und Revisionspruefungen. Preview/Apply/Undo, Geometriequalitaet und Formate unveraendert. Isolierter Pruefpfad --verify-easy-performance mit 49152-Dreiecks-Netz, 120CAD-Teilen, unveraenderter Anzeigegeometrie und exaktem Undo/Redo; vorhandene Easy-Gesamtabnahme bleibt verpflichtend. Details docs/EASY-TINKER-LEISTUNG.md. Abnahme abgeschlossen: 56 Kernprüfungen und jeweils 210 Quell-/EXE-Prüfpunkte bestanden.

## Kontextabhaengige Formenpalette im Normalmodus (0.56.0)
Direkt ueber der Palette waehlt Neue Formen zwischen Automatisch/CAD/Netz; eine Statuszeile nennt den naechsten Typ. cad-creation-domain.js entscheidet ohne Konvertierung: leeres/CAD-Projekt -> CAD, reines Netzprojekt -> Netz; in gemischten Projekten bestimmt eine homogene Auswahl den Typ, sonst Hinweis und keine Erstellung. Ansichtsvorlagen zaehlen nicht. Explizite Wahl gewinnt und wird getrennt von Projekt/Undo als portable neue-formen.json gespeichert. Grundformen, Text, Formenpakete und DragDrop verwenden dieselbe Entscheidung, Easy Tinker weiterhin seinen unabhaengigen CAD-/Netzbereich. Import/Export, Sichtbarkeit, vorhandene Geometrie und KI-Befehle behalten ihren bisherigen Vertrag. Bedienhinweise docs/NEUE-FORMEN.md; isolierter --verify-creation-domain prueft reale STL-/Lochsubtraktion, Quellen-/Undoerhalt, Mischprojekte, explizite Wahl, Text/Pakete/Drop, Editiersperren, Layout, Sprache und Neustart. Separate Ausgabe nach erfolgreicher Quell- und EXE-Abnahme; kein neues Projektformat.


## Separate Formnaro Mini CAD 0.1.0 (18.10.2026)

Zusätzliche eigenständige Windows-Codebasis unter `mini-cad/`, mit der
Bedienung von Mini 0.6.1: zwölf Grundformen, Mausgriffe, Flächenablage,
Mehrfachauswahl, Quellen/Gruppen, Bildbibliothek und die schnellen Werkzeuge.
OCCT 8.0.1 ist die einzige Modelliergeometrie; kein Manifold im Laufzeitpaket.
STEP/STP bis 30 MB, ausgewählter STEP- und STL-Export; optional geschlossene
STL bis 10.000 Dreiecke als facettiertes CAD. Eigene `.fmcad`-Projekte,
`Daten-Mini-CAD` und `Bibliothek-CAD`; keine automatische Übernahme von
`.fmini`, `.ocad` oder vorhandenen Profilen. Frühere Mini und Großversion
bleiben unverändert. Native Module sind unabhängig kopiert, mit Herkunftsbeleg.

Grundformrezepte und triangulierungsfreie BRep-Körper sind maßgeblich;
Anzeigedreiecke werden nur abgeleitet. Bestätigte Auflage und Außenmaße werden
nativ berechnet; Flächentreffer und Zweipunktmessung verwenden die Anzeige.
Scherung wird beim Auflösen nötigenfalls als nativer CAD-Körper mit zusätzlich
aufbewahrtem Originalrezept erhalten. Details und Grenzen: `mini-cad/README.md`.

Abnahme: 33 Kernprüfungen, je 85 Bedienprüfungen an Quelle und tatsächlicher
EXE; keine gemeldeten Rendererfehler/externen Anfragen. Separater FreeCAD-
Leser (OCCT 7.8.1) bestätigt Maße, Volumen und acht analytische Zylinderflächen
der STEP-Prüfplatte. Frischer unabhängiger Quellenaufbau und Kernprüfungen
bestanden. Geprüftes Windows-/Quellenpaket mit Original-CAD-Quellen und Lizenzen;
Laufzeit enthält genau ein unverändertes CAD-WASM. Keine pauschale Zusage
zur Geschwindigkeit gegenüber der Netz-Mini. Keine GitHub-Veröffentlichung.

## 18.10.2026 – CAD-Tempo im großen Formnaro 0.57.0

Auf Wunsch wurden Wiederverwendungsprinzipien der CAD-Mini in den großen
CAD-Worker und Renderer übernommen, besonders für Bewegen, Drehen und
Skalieren im Easy-Tinker-Modus. Generationlokale Anzeigenetzverweise sparen
wiederholte Übertragung; ausschließlich privat validierte, unveränderliche
Anzeigepuffer erlauben den schnellen Geometrievergleich. Der Empfängercache
ist auf 128 Einträge/64 MiB begrenzt, laufende Anfragen behalten ihre Verweise
auch bei Verdrängung. Neustart und Abbruch verwerfen die Generation.

Eine konservative rotationsunabhängige Streckungsschranke verhindert unnötige
Neuvernetzung bei Drehungen. Mehrfarbige Gruppen behalten ihre vorhandene
Weltpartition bei nachgewiesener starrer Lageänderung oder Spiegelung;
echte Streckung/Scherung berechnet weiterhin die ursprüngliche native
Weltpartition neu. CAD-Konstruktion, Export, Qualität, Quellen, Projektformate
und Undo/Redo bleiben erhalten. Details: `docs/CAD-TINKER-TEMPO.md`.

Abnahme: 69 Kernprüfungen, je 155 Bedienprüfungen an Quelle und tatsächlicher
Windows-EXE, inklusive echter STEP-Importe und mehrfarbiger Bohrgruppe.
Im isolierten Vergleich mit zwölf fein dargestellten STEP-Kugeln betrugen
die Mediane vorher/nachher: Verschieben 1062/23 ms, Drehen 3904/21 ms,
Skalieren 2860/1769 ms. Synthetischer Vergleich mit unveränderter 0.56.0,
keine allgemeine Geschwindigkeitszusage. Bei der Farbgruppe blieb Skalieren
ungefähr gleich aufwendig. Separate portable Ausgabe; alte Ausgaben und
Nutzerprojekte/-profile unverändert, keine Veröffentlichung oder Installation.


## Mini CAD 0.2.0: optionale KI und native Konstruktionswerkzeuge (18.10.2026)

`mini-cad/` ergänzt die bisherigen Anbieterprofile, Chat/Bildvorlagen, JSON-Werkstatt
und optionale authentifizierte Loopback-Schnittstelle der großen Version. Die
Mini verwendet eigene Einstellungen; Zugangsdaten oder Profile werden nicht aus
anderen Ausgaben übernommen. Normale Modellierung bleibt offline möglich.

Die zusätzliche Werkzeugebene lädt bei Bedarf und nutzt dieselbe vorhandene
OCCT-8.0.1-WASM-Instanz im Mini-Rechenworker. Native Formen einschließlich
Text/Gewinden, Quellen, Skizzen mit Formeln, Bohrungen, Teilung, Körperauszug,
Kantenbearbeitung, Referenz-/Passungshelfer und native Messungen sind angebunden.
Skripte und mitgelieferte ES-Werkzeugmodule laufen in einem origin-isolierten
Frame/Worker mit eigenem CSP und ohne Datei-, Netzwerk- oder Desktopfähigkeiten.
Die große Netz-Werkzeugebene und der STL-Konverter werden nicht mitgeladen.

Vorschau, Übernahme, Abbruch, Revisionsprüfung und ein gemeinsamer Undo-Schritt
halten den bestätigten Mini-Zustand getrennt. Native Ergebnisprüfungen können
Fehlvorschläge zurückweisen; Mess- und Korrekturrunden bleiben begrenzt. Erweiterte
Quellen speichern `cadSource`, nativer Arbeitskontext `cadWorkspace` im bisherigen
Mini-CAD-Format 1. Kompatible native Grundformen behalten bei starrer Platzierung
die kompakte Mini-Darstellung samt Parametereingaben. Reine Erscheinungs-/Notiz-
änderungen erhalten Geometrie und Lagewerte. Solche Projekte mit 0.2.0 bearbeiten,
da frühere Mini-Ausgaben den Zusatzkontext nicht vollständig kennen.

Abnahme: 56 Kernprüfungen; Quelle und tatsächliche EXE jeweils 100 Bedienpunkte,
keine Rendererfehler oder externen Renderer-Anfragen. Vollständiger Anbieterablauf
mit lokalem Testserver; keine echten Schlüssel für diese Abnahme erforderlich.
Unabhängiger FreeCAD-STEP-Leser und separater STL-Topologieleser bestätigen die
synthetische KI-Lochplatte. Quellen separat mit festgelegten Abhängigkeiten gebaut.
Geschwindigkeitsvergleich mit 0.1.0, 36 Teilen, 12 echten STEP-Kugeln, KI-erzeugten
Teilen und echten EXE-Starts: weiterhin Millisekundenbereich für die normale
Bedienung, einzelne kleine Messunterschiede; keine pauschale Null-Mehrkosten- oder
Geschwindigkeitsgarantie. Aktive Geometrie benötigt weiterhin Rechenzeit. Genau
ein CAD-WASM und kein lokales Sprachmodell. Details: `mini-cad/README.md` und die
jeweiligen Abnahme-/Leistungsberichte neben der getrennten Ausgabe.
## Netz-Mini 0.7.0: optionale KI und automatische Reparatur (18.10.2026)

`mini/` übernimmt die bisherige Anbieteranbindung, Chat mit Bildvorlagen,
JSON-Werkstatt und eine optional aktivierbare, authentifizierte Loopback-API.
Die Netz-Mini verwendet eigene Einstellungen und übernimmt keine Zugangsdaten
oder Profile anderer Ausgaben. KI-Oberfläche, Modellwerkzeuge und Reparaturmodule
laden bei Bedarf; sie verwenden dieselbe einzelne Manifold-3.5.4-WASM-Instanz.
Die normale Modellierung bleibt offline und rendert weiterhin bei Änderungen.

Der dokumentierte KI-Umfang umfasst die zwölf Mini-Grundformen, absolute
Maß-/Lage-/Parameteränderungen, Duplikation, CSG-Gruppen/Schnittmengen mit
erhaltenen Quellen, ausdrückliches Auflösen, Bodenplatzierung und automatische
Reparatur. Native CAD-/STEP-Werkzeuge, freie Skripte und nicht dokumentierte
Großversionswerkzeuge sind nicht enthalten. Begrenzte Mess- und Korrekturrunden
halten die ursprünglichen Sollprüfungen fest. Eine revisionsgebundene Vorschau
wird erst mit Übernehmen zu einem gemeinsamen Undo-Schritt.

Der STL-Import versucht nach einem fehlgeschlagenen normalen Import automatisch
die vorhandene konservative Reparaturkette. Der Knopf **Netz reparieren** prüft
die sichtbare entsperrte Auswahl ohne Einstellungen. Exakte Duplikate/entartete
Flächen und eindeutige Richtungsfehler werden bereinigt; anschließend können
bis 40.000 Eingabedreiecke mit kollinearen T-Verbindungen und einfachen drei-
oder ebenen konvexen Vierpunkträndern behandelt werden. Das Ergebnis muss eine
geschlossene eindeutige Topologie und einen positiven Manifold-Körper haben.
Mehrdeutige beschädigte Mehrfachhüllen werden im zweiten Schritt abgewiesen;
keine Komponentenlöschung, Punktverschiebung oder Voxel-/Hull-Rekonstruktion.
Die Randbegrenzung bezieht sich auf die Punktzahl, nicht Millimetergröße; eine
beabsichtigte Öffnung kann nicht automatisch erkannt werden. Kein allgemeiner
Selbstschnitt-, Wandstärken- oder Druckbarkeitsnachweis.

Das Mini-Format bleibt Version 1. Optionale `repairSource`-/`repairReport`-Felder
erhalten Originalnetz und Bericht bei Datei-/Bibliotheksrundläufen und auch bei
affin verzerrter Quellenextraktion; sie zählen zum Projektbudget. Details und
Bedienung stehen in `mini/KI-UND-NETZREPARATUR.md`. Diese Lieferung betrifft die
Windows-Netz-Mini; die bestehende Android-Test-APK bleibt unverändert.

Abnahme: 54 Kernprüfungen nach unabhängiger Installation der festgelegten
Abhängigkeiten; Quelle und tatsächliche Windows-EXE jeweils 94 Bedienpunkte,
ohne Rendererfehler oder externe Renderer-Anfragen. Der lokale Testanbieter
prüft Messrunde, absichtlich falsches Maß, Korrektur und anschließende Übernahme.
Ein unabhängiger Python-STL-/Topologieleser bestätigt Quelle und EXE: ein
geschlossener Körper für die synthetische Vierlochplatte, erwartete Außenmaße
und Polygonvolumen; reparierter Testwürfel wieder geschlossen mit erhaltener
Originalquelle. Separate portable Ausgabe, kein echtes Anbieterprofil/Schlüssel
oder Nutzerprojekt für die Abnahme verwendet. Kein allgemeiner Leistungs- oder
Druckbarkeitsnachweis. Maßgeblicher Ausgabestand ist `Mini-v0.7.0-r2`;
`Mini-v0.7.0` blieb ein vor der letzten Quellenkorrektur abgebrochener Zwischenbau.


## Importplatzierung, Zur Mitte und Exportnummern (0.60.0)

Die grosse Ausgabe verschiebt Dateiimporte nach dem Parsen als gemeinsame
Baugruppe: Welt-XY-Mitte auf den Importplatz, gemeinsame Unterkante auf Z0.
Folgeplaetze liegen je15mm in X/Y versetzt; vorhandene Importwurzeln zaehlen,
mehrteilige Dateien werden waehrend der Sitzung als ein Auftrag gezaehlt.
Originalnetzpunkte, BRep, Quellen und relative Baugruppenlage bleiben erhalten;
der zweite gepruefte Entwurf wird zusammen mit dem Import als ein Undo angewandt.
Abbruch und Revision werden vor und nach den asynchronen Schritten geprueft.
Projektdateien und explizite Automationskoordinaten werden nicht neu platziert.
Der direkte Zur-Mitte-Knopf in Normal/Easy verschiebt die gemeinsame Auswahl
auf dieselbe Grundebene, prueft Sperren und passt die Auswahl in der Ansicht ein.
Bestehende Layouts erhalten den neuen Knopf ohne Umordnung ihrer Kontrollen.

Nur Modell-Exporte fordern beim nativen Datei-IPC nummerierte Vorschlaege an.
Serien je vorgeschlagenem Namen/Endung merken gewaehlten Ordner/Basis und
naechste Nummer (Original,2,3,...), ueberspringen belegte Folgenamen und werden
nur nach erfolgreichem atomarem Dateischreiben fortgesetzt. Portable private
export-series.json speichert bis200Serien; Abbruch/Fehler verbrauchen nichts.
Browserdownloads verwenden einen Sitzungszaehler. Projekt-/Hilfsdateien behalten
ihren Speichervertrag. Keine neue Laufzeitabhaengigkeit oder Formatversion.
Isolierter Pruefpfad --verify-model-placement; Bedienung und Details in
`docs/IMPORTMITTE-UND-EXPORTNUMMERN.md`. Mini/MiniCAD/Android bleiben separat.


## 0.62: Kompakte Ansichtswerkzeuge

Die Workbench praesentiert nur Startansicht, Oben, Vorn, Rechts und Einpassen
in der seitlichen Kameraleiste ohne Scrollcontainer. Die zehn uebrigen
Ansichts-/Pruefkontrollen liegen in Normal und Easy im oberen zweispaltigen
Menue Ansicht & Pruefen. Bestehende DOM-Knoten, Handler und Layoutdaten bleiben
erhalten. Der Layouteditor restauriert die gespeicherten Zonen; beim Verlassen
gilt wieder die kompakte Praesentation, auch fuer alte benutzerdefinierte Zonen.
Keine Aenderung an Modellformat, Geometrie, CAD-Kern oder Laufzeitabhaengigkeiten.
Aufklappen per Maus/Tastatur, Escape mit Fokusrueckgabe; Koordinatenauswahl
bleibt ein natives Select. Isolierte Bedienpruefung --verify-view-toolbar.
Pfeilnavigation im Menue stoppt die Weiterleitung an Modellierkuerzel, damit
keine unbeabsichtigte Verschiebung der aktuellen Auswahl entsteht.

## Robuster STL-Netzimport (0.63.0)

Ein eigener wegwerfbarer Importworker trennt STL-Dateibudgets (256 MiB binaer,
5 Millionen Dreiecke; ASCII 64 MiB) von bestehenden Projekt-/Koerperbudgets.
Exaktes logisches Punktindexieren, begrenzte sichere Duplikat-/Nullflaechen- und
Orientierungsbereinigung; offene/weiter beschaedigte Ergebnisse unter 500.000
Dreiecken bleiben ladbar. Keine automatische Kappe/Komponentenentfernung und
kein stiller CAD-Rekonstruktionszwang. Easy-Hintergrundfallback erhaelt diese
bewusst offenen neuen Importkonturen. Neue Vorgabe bearbeitbares Netz; bestehende
Verwendungseinstellungen bleiben gueltig. CAD/andere Formate unveraendert.

Ueber 500.000 Dreiecken optionale Meshoptimizer-Arbeitskopie Ziel 250.000,
Fehlerwert 0–1 mm (Vorgabe 0,02), LockBorder, 35-Grad-Normalenspruenge und
Extremrepraesentanten gesperrt. Bereits in Three.js vorhandene lokale Bibliothek;
keine neue NPM-Abhaengigkeit. Exakte kollineare Restflaechenaufloesung und
unabhaengiger Vergleich von Inzidenzen/Orientierung/Komponenten/Eulerzahl,
gerichteter Randkantenmenge/Extremmassen/gesperrten Punkten. Keine allgemeine
Selbstschnitt-, Passmass-, Hausdorff- oder Druckpruefung. Fehler ist ausdruecklich
Algorithmusschaetzung. Ziel kann wegen Schutz/Fehlerwert unerreicht bleiben;
Arbeitsgrenze wird nicht umgangen, Fehlerwert nicht automatisch gelockert.
Vereinfachte Kopie mit Zahlenbericht vor zweitem Uebernahmeklick; Abbruch/
Dialog-/Revisionswechsel beendet den Worker und uebernimmt nichts. Strukturierter
Importbericht mit Quelldatei-SHA256 in Objektnotizen fuer bestehende KI; Geometrie
und Originaldatei bleiben lokal. Grosse Quelldatei nicht zusaetzlich ins Projekt
einbetten; sie fuer Neuimporte aufbewahren. Anleitung ROBUSTER-NETZIMPORT.md.

### Gemeinsamer Import in Netz-Mini 0.8 und Mini CAD 0.3

Der neue begrenzte Importkern liegt auch als gepruefte lokale Kopie unter
mini[/mini-cad]/src/import-core (eigene Provenance; unbenutzter Auswahlworker-
Dienst entfernt). Beide Windows-Minis erhalten denselben abbrechbaren Dialog,
Grundbereinigung ohne Kappen und bestaetigte grosse Arbeitskopien. Ihre eigenen
32-MiB-Projekt-/500.000-Netzdreieckbudgets bleiben bestehen. Netz-Mini zeigt auch
offene Rohnetze und bietet deren Bounds/Transformation/Einzel-STL-Export; der
KI-Inspektor prueft Originaltopologie, Volumen unbekannter Rohnetze bleibt null.

Mini CAD versucht kleine geeignete STL weiterhin als native facettierte CAD;
groessere/beschaedigte oder ausdruecklich als Rohnetz gewaehlte Teile bleiben
Rohnetze. Native CAD-/STEP-Werkzeuge verlangen weiterhin CAD. Gemischte .fmcad-
Dateien mit Rohnetzen verwenden Format 2, reine CAD-Dateien bleiben Format 1.
Die native KI erhaelt unbeteiligte Rohnetze mit Bericht und Reihenfolge exakt;
sie sind fuer ihre nativen Werkzeuge keine gueltigen Ziele. Fuer fatale native
WASM-Fehler wird der Mini-CAD-Worker vor der naechsten Berechnung erneuert.

Die echte Float32-STL-Ausgabe wird nach Koordinatenspeicherung separat geprueft.
Exakt kollineare Rundungsrestflaechen werden durch denselben begrenzten
Nachbarsplit ohne Punktverschiebung aufgeloest. Komponenten/Eulerzahl/Raender
und neue Inzidenz-/Orientierungsfehler werden kontrolliert; sonst kein Export.
Das Projekt wird beim Export nicht geaendert. Grenzen stehen in der jeweiligen
NETZIMPORT.md. Die Minis haben keine neuen NPM-Abhaengigkeiten und benoetigen
fuer die Grundbereinigung/Vereinfachung keine Anbieteranfrage. Android-APK und
bereits ausgelieferte aeltere Programmordner bleiben eigenstaendige Staende.

### Lochgruppen in der großen Ausgabe ab 0.64

CAD- und Netz-Gruppieren akzeptieren reine Lochquellen und erhalten die äußere
Lochrolle. Die Quellengeometrien werden vereinigt beziehungsweise geschnitten;
eine spätere Materialgruppe zieht die gemeinsame Lochgeometrie ab. Native
Bedienwerkzeuge, Befehlsrouter und Netz-Quellrekonstruktion verwenden dieselbe
Semantik. Gemischte Gruppen behalten den bisherigen Material-/Lochabzug;
unterdrückte Materialquellen dürfen keine Lochgeometrie zu Material machen.
Exportpfade verlangen weiterhin Material. Originalquellen, Quellenbearbeitung,
Auflösen, Projektformat sowie Undo/Redo bleiben erhalten. Anleitung
LOCHGRUPPEN.md; gezielte echte Kernel-/Workerprüfungen hole-groups.test.mjs und
isolierte Bedienprüfung --verify-hole-groups für Normal/Easy und CAD/Netz.

### Lochgruppen und Eckmaße in beiden Minis

Ab Netz-Mini 0.9 heißt die sichtbare Anwendung **Formnaro Mini Mesh**;
die native Ausgabe heißt weiterhin **Formnaro Mini CAD** (ab 0.4).
Formate `.fmini`/`.fmcad`, interne IPC-Namen, `Daten-Mini` und Bibliothek
bleiben kompatibel. Die Windows-Ausgaben sind weiterhin unabhängig.

Beide Minis können reine Lochformen vereinigen und schneiden. Das Ergebnis
bleibt eine Lochform mit erhaltenen Quellen, gemeinsamem Transformieren,
Auflösen, Speichern und Undo/Redo. Materialexport verlangt weiterhin Körper.
Der unabhängige Lazy-KI-Kern der CAD-Mini berücksichtigt dieselbe Semantik;
seine drei angepassten CAD-Module sind im lokalen Herkunftsmanifest markiert.

Beim Ziehen der Eck- oder Höhengriffe erscheinen drei beschriftete Maßlinien
für Breite, Tiefe und Höhe in Millimetern mit zwei Nachkommastellen.
`scale-dimensions.js` ist eine lokale Präsentationskopie der großen Ausgabe
mit eigenem affinen Punkthelfer; es besteht keine Laufzeitabhängigkeit vom
Hauptprojekt. Die Werte stammen aus demselben Auswahlrahmen wie die Griffe,
aktualisieren nur die Vorschau und verschwinden bei Abschluss oder Abbruch.
Drehwinkelanzeige, feste gegenüberliegende Ecke, Skalierung mit Shift und
eine gemeinsame Undo-Transaktion bleiben erhalten. Die UI-Prüfungen umfassen
alle vier Ecken sowie gedrehte/gespiegelte Teile im schmalen Fenster.

### Lesbare Zahlen in der großen Ausgabe ab 0.65

`src/ui-numbers.js` vereinheitlicht die alltäglichen Eigenschaftenfelder
(Größe, Position, Drehung, Formmaße und numerische Parameter) und den
Eckmaß-Dialog auf maximal zwei Nachkommastellen ohne Rechenreste oder
negatives Nullzeichen. Deutsch verwendet Komma, Englisch Punkt.
Bewusst neue Feldeingaben werden auf zwei Stellen gerundet; unveränderte
gerundete Werte werden auf den ursprünglichen präzisen Modellwert abgebildet.
Fokus/Blur/Escape und unverändertes Bestätigen erzeugen dadurch keine
Quantisierung oder zusätzliche Undo-Schritte. Unveränderte Achsen bleiben
präzise. Die CAD-Geometrie, internen Berechnungen und Projektformate werden
durch reines Anzeigen nicht gerundet. Anleitung LESBARE-MASSE.md.


### 0.68.0 – Skizzenversion 2 (Paket 2 des Ausbauplans)
Gemeinsamer reiner Profilvalidator für native CAD- und Netzskizzen: stabile IDs,
Linien, echte Dreipunkt-Kreisbögen, freie Kreise, Konstruktionslinien, eine äußere
Materialkontur und mehrere getrennte Innenöffnungen. Analytische Flächen- und
Schnittprüfungen vor Extrusion; vorhandene OCCT-Konturverfahren bewahren Kreisbögen,
Netze verwenden qualitätsabhängige Polygone. Rich-UI ergänzt Zeichenformen,
Elementfelder, echte Bogenmittelpunkte und gemeinsame Punktgriffe ohne eigenen
Bedingungslöser. Version1 bleibt ohne automatische Konvertierung bearbeitbar.
Neue Profilinhalte verlangen Projekt-/Bibliotheksformat10, inklusive verschachtelter
CAD-/Netzquellen; vorhandene Formate5/7/8/9 bleiben für alte Inhalte erhalten.
Speichern unter, gemeinsame Arbeitsumgebung, Wiederherstellung und Bibliothek
verwenden den bestehenden Speicherweg; Arbeitsplatzformat bleibt unverändert.
MCP-API1/Werkzeugnamen bleiben; native Skizzenbefehle akzeptieren beide Versionen.
Netzskizzen bleiben über vorhandene validierte Programmwerkzeuge erreichbar.
Anleitung docs/SKIZZEN-UND-MESH-AUSBAU.md; Abnahmezustand in jeweiliger Ausgabe.


### 0.69.0 – Maße, Trimmen/Verlängern, Spiegeln und Konturversatz
Paket3 ergänzt reine gemeinsame Profilbearbeitungen in sketch-tools.js und einen
gemeinsamen begrenzten Ausdrucksparser für CAD/Netz. Direkte Länge/Winkel werden
als normale Punktformeln mit ausschließlich sind/cosd(Grad) gespeichert; Start
bzw. Kreismittelpunkt bleibt Anker, numerisch gemeinsame Endpunkte erhalten die
neue Formel. Literal-Ziehen bleibt möglich; Ausdrücke werden gegen Drag geschützt.
Trimmen/Verlängern verwendet analytische Linien-/Kreis-/Bogenschnitte. Offene
Entwürfe sind erlaubt, Extrusion bleibt gesperrt. Spiegelungen erzeugen neue IDs;
ganze gespeicherte Skizzen können als neues Teil eingefügt werden. Copy-Moduswechsel
verwirft vorhandene Vorschauen. Kein vollständiger Bedingungslöser.
Konturversatz rechnet nur auf Aufruf im bestehenden abbrechbaren CAD-Worker über
BRepOffsetAPI_MakeOffset und exakte Linien-/Kreisbogenrücklese. Readonly-Abfrage
sketchOffset ist auch im vorhandenen lokalen Skriptvertrag verfügbar. Max128
Eingabeelemente; signierter Abstand0.001–1000mm; nur ein eindeutiger geschlossener
Resultatrand wird übernommen. CAD-Bögen werden nicht polygonisiert. Neue Kontur
bleibt unabhängige Momentaufnahme; Quellkontur optional Konstruktion. Keine neue
Formatstufe über die bereits benötigte10 und keine Arbeitsplatzänderung.


### 0.70.0 – Zusammenhängende technische Netzbereiche (Paket 4)
Neuer technischer Unterdialog an bestehender Formerkennung. Lokaler Konverter
bleibt unverändert; seine Analyse wird über sourcegebundene Originaldreiecke
verwendet, anschließend passt ein abbrechbarer Worker Ebenen/Zylinder räumlich an.
Max20k analysierte Dreiecke pro Auftrag, auch ausgewählte Teilbereiche größerer
Quellen. ASCII-Doubles mit separater Translation bewahren Modellmillimeter;
Konverter-Rückgabe wird unabhängig nach Dreieckskoordinaten zurückgeordnet.
Mehrdeutige Duplikate werden abgewiesen; entfernte Flächen werden kenntlich.
PCA-Ebene; Zylinderachse aus Normalenkovarianz, Radius aus projiziertem Kreisfit,
Prüfung von Punktabweichung, radialen Normalen und räumlicher Ausdehnung. Weil die
bestehende Analyse Zylinder oft als ebene Facettenstreifen meldet, werden zusätzlich
über Kanten verbundene Normalen unter35Grad untersucht; scharfe Deckflächen bleiben
getrennt. Bloße Kreis-Schnittkonturen begründen keine Zylinderbehauptung.
Zeigt Weltachsen/-punkte, Durchmesser, gemessene Länge, RMS und Abweichung an
Eckpunkten/Kantenmitten/Schwerpunkten; kein globaler Fehler-/Bohrungs-/Solidnachweis.
Hervorhebung verwendet originale Dreiecks-IDs und ändert keine gespeicherte Auswahl.
Bezugsebene wird mit reference:null als unabhängige Momentaufnahme übernommen,
ein gemeinsamer Undo, unveränderte Quellen. Revisions-/Auswahl-/Ticketkontrollen
verwerfen veraltete Antworten; Schließen beendet Worker und Konverterauftrag.
API1/Werkzeugnamen unverändert; app/technicalMesh über vorhandene Skript- und
Messabfragen verwendet denselben Worker, Optionenvalidator und Rückmeldebudget.
Neue schwere Berechnungen nur auf expliziten Aufruf; keine Mini-/Arbeitsplatzänderung.


### 0.71.0 – Skizzen-Anbau und Ausschnitt (Paket5)
Gemeinsamer reiner prepareSketchAttachment/checkSketchAttachment-Validator bindet
Materialziel, Referenzpunkt/Normale/Digest, Profil und Kontaktüberlappung. Der neue
native Auftrag sketchAttachment und mesh-sketch-attachment verwenden bestehende
Skizzenextrusion und gleichartige Gruppenbooleans. CAD bleibt CAD, Netz bleibt Netz;
Original und Profil2 bleiben Quellen, Format10. Extrusion orientiert sich starr an
der gemessenen Fläche; Kontaktüberlappung wird zur gespeicherten Höhe addiert und
zum Startpunkt kompensiert, damit äußere Anbauhöhe/Ausschnitttiefe stimmen.
Kontrolliert echte Volumenänderung und Körperanzahl; getrennte Ansätze und verfehlte
Ausschnitte werden abgewiesen. Meshquelle benötigt echte Kernel-Solidprüfung.
Arbeitsebenenbezüge werden nach Meshänderung mit bestehendem Synchronisierer geprüft.
Native neue Skizzenbefehle können frame erhalten; beim Editieren einer vorhandenen
Skizze ist frame verboten, damit alle16 Originalmatrixeinträge erhalten bleiben.
GUI-Flächenpicker gehört zur Skizzen-Lebensdauer und prüft Revision/Auswahl/Sperren.
MCPAPI1/Toolnamen bleiben: generische Programmbefehle erreichen dieselben Validatoren.
Native rayPick liefert Geometrie-Digest nur auf explizites withGeometryDigest:true;
gewöhnliche Picks erhalten keinen zusätzlichen Hashaufwand. Meshskizzen respektieren
nun ihren beauftragten Namen, auch im erhaltenen Quellenbaum.
Zusatzkorrektur: unverändertes Apply verbraucht seine Vorschau, erzeugt kein Undo,
bleibt idempotent und erhält andere Vorschläge derselben Revision. Damit hinterlässt
erneutes unverändertes Projektöffnen keine verbrauchte Vorschau. Dark-Skizzenstatus
und feste Fußaktionen haben passenden Hintergrund und geprüften Textkontrast.
Unabhängige FreeCAD-Prüfung berücksichtigt vorhandene STEP-Farbregionsaufteilung,
prüft alle Solidteile und ihre materialgleiche geschlossene Vereinigung; STL-Kanten,
Orientierung, Komponenten und Volumen werden separat kontrolliert.

Paket 5 abgeschlossen (0.71.0): Direkte Flächenauswahl für Skizzen-Anbauten und Ausschnitte an CAD/geschlossenen Netzen; gleicher Validator und Previewpfad in UI/API, erhaltene Original-/Skizzenquellen und ein gemeinsamer Undo. Referenzdigests schützen vor veralteten Flächentreffern. Add/Cut prüfen Materialkontakt bzw. Volumenänderung und Körperanzahl. Portable Ausgabe separat mit Quelle und EXE abgenommen.

Paket6 in Entwicklung0.72: Readonly Zweimodellvergleich in separatem nur auf Aufruf erzeugtem Worker, BVH-Nächste-Oberfläche beidseitig, 200k Dreiecke je Oberfläche/12k ausgewählte Dreiecke je Richtung/20s Budget. Unbekannte Dreiecke bleiben grau; nur Stichprobenmaximum, keine globale Fehlergarantie. Native Vergleichsfläche aus vollständigem BRep ohne innere Farbregionengrenzen. Vergleichsgruppe besitzt eigene Materialien/Puffer; Quellen und Speicherdaten unverändert. Child-Lebenszyklus an Wanddicken-UI, Vorschauverknüpfung erhält zugrundeliegende Bearbeitung. Noch nicht ausgeliefert.

Paket6 abgeschlossen (0.72.0): Allgemeiner schreibgeschützter Modellvergleich mit getrennten bidirektionalen Stichproben, Messrichtungen/Unbekanntstatus/Begrenzungen; direkter Einstieg aus Bearbeitungsvorschau erhält die zugrundeliegende Änderung. API1 app/modelComparison in Analyse und Sandbox, gleiche begrenzte Worker. Quelle und portable EXE inklusive Performance/Integrität separat abgenommen.

Paket7 in Entwicklung0.73: Explizite curved-v1-Methode im gemeinsamen Reduktionswerkzeug plus eigener Einstieg. Lazy Meshoptimizer;150kDreiecke/0.02mmStandard, nichtgewählte/geschützte Flächen exakt kopiert/Vertices fixiert,35GradKanten/Ränderfest,Topologie/Komponenten/Volumen<=1%geprüft. Zusätzlicher beidseitiger Stichprobenvergleich mit bis4 engeren Optimiererbudgets oder Abweisung; keine globaleFehlergarantie. Native vorhandene planar-v1-Methode behält strengeVolumenprüfung. Kurvenrezept triggertProjekt/Bibliothek10,Originalquelleerhalten. 25neue+alteReduktions-Kern/Controllerfälleund33Kontrakt/Altformat/AIProgrammfällebestanden. Quelle/EXE-Abnahme noch offen.

Paket7 abgeschlossen (0.73.0): Gekrümmte Meshoptimizer-Reduktion mit expliziten Auswahl-/Schutzgrenzen, Abweichungsbudget, zusätzlichen bidirektionalen Stichproben und 1-%-Volumengrenze. Bestehende Ebenenmethode separat erhalten. Format10 für neue Rezepte; Quellen/Schutzkennungen bleiben überprüft bearbeitbar. Quelle und tatsächliche portable EXE einschließlich bisheriger Netzwerkzeuge, unabhängiger Exporte, Performance und Integrität separat abgenommen.

Paket8 in Entwicklung0.74: Vier reine benannte Formelvorlagen (Halteplatte/Langlochplatte/Distanzring/Gehäuserand) versorgen CAD- und Netzextrusion sowie die vorhandene Bibliothek; keine automatischen Nutzerbibliotheks-/Modelländerungen. Easy-Opt-in-Menü Zeichnen & Netz, direkte gemeinsame Skizzenoberfläche und kontextuelle Kurzhilfe. Lokale API1-Analyse/Sandbox app/sketchTemplate nutzt dieselbe reine Fabrik; app/resources listet Deskriptoren. Bei Vorlage sind benannte Maße vor Elementkoordinaten sichtbar. Pointer-Fokus am SVG verhindert Scrollsprünge; Kurzhilfe steht außerhalb der Zeichenfläche. Fünf Vorlagen-Kerngruppen und26Kernel/Library/AI-Gruppen bestanden; Quellpreflightr2 insgesamt100UI/0Fehler/0extern sowie unabhängige FreeCAD-/STL-Proben allerVorlagen und altenAnbau/Kurvenexporte bestanden. Vollständige Quell-/EXE-Auslieferungsprüfung noch offen.

21.10.2026 – Achtteiliger Skizzen-/Mesh-Ausbau abgeschlossen. Finale große Ausgabe0.74.0 enthält Komfortzeichnung, gemeinsameVersion2-Profile, Maß-/Konturwerkzeuge, gemessene technischeNetzbereiche, Skizzenanbauten/-ausschnitte, readonlyModellvergleich, geschützteKurvenvereinfachung und vier bearbeitbare Beispiele. EasyTinkeröffnetfortgeschritteneWerkzeugegezielt;Bibliothek und lokaleAPI1verwenden dieselbenProfile/Validatoren. FinaleAbnahme:171Kernprüfungen undQuelle+echteportableEXEje324Bedienprüfpunkte;unabhängigeFreeCAD/STEP/STLPrüfungen,Leistungsgrenzegegen0.66,Source/Runtime/ASAR/ArchivintegritätundfrühereAusgabebewahrungbestanden. JedesPaket0.67–0.74hatseparateportableAusgabeundPrüfbericht;keineInstallationoderGitHub-Veröffentlichung. DasvollständigeSpezifikations-/Bedienhandbuch stehtin docs/SKIZZEN-UND-MESH-AUSBAU.md. BewussteGrenzendesPlansbleibenerhalten,insbesonderekeinVollsolverundkeineglobaleFehlergarantieausStichproben. DieserAbschlussvermerkistnachderAuslieferungsprüfungergänzt;dieabgenommeneQuell-/RuntimeMomentaufnahmeundHashesbleibenimjeweiligenPrüfberichtfestgehalten.


## Maßlinien beim Verschieben 0.75.0

Große Ausgabe: `cad-move-dimensions.js` projiziert die ursprüngliche
Auswahlbegrenzung auf die aktive Arbeitsebene und zeigt signierte X-/Y-Abstände
der tatsächlichen, gerasterten Translation mit Hilfslinien/Pfeilen und zwei
Nachkommastellen in Millimetern. Ein flüchtiges SVG-/DOM-Overlay ohne Kernel-,
Projekt- oder Quellenänderung; Normal/Easy, CAD/Netz, Mehrfachauswahl und
Gruppenquellen verwenden denselben Rendererpfad. Start erst beim Ziehen;
Ende/Abbruch/Disposal räumen auf. Rotations- und Größenwerkzeuge behalten ihre
Anzeige; kein neues Dateiformat. Isolierter `--verify-move-dimensions`-Pfad
prüft echte Mausgesten gegen Vorschau, Commit und Undo/Redo.
Bedienung und Semantik: `VERSCHIEBEMASSE.md`.

## CAD-Gruppierleistung 0.78.0
CAD-Gruppen verwenden cadFuseMany mit expliziter balanced-Option: ausgewogene
binaere Vereinigungen reduzieren wiederholte grosse Zwischenergebnisse.
Nativ mit vollstaendigen Koerpergrenzen und Konstruktionstoleranzen als getrennt
bewiesene Teilmengen nutzen denselben abgesicherten Batch-Fuse wie der Export.
Ueberlappungen bleiben beim bisherigen Zweioperand-/Schnittvolumennachweis;
fehlgeschlagene Baumassoziationen fallen auf die bisherige Reihenfolge zurueck.
Standardexport, Schnittmengen und Lochsubtraktion behalten ihre Pfade. Quellen,
Formate und Transaktionsvertrag bleiben erhalten. Details: GRUPPIEREN-TEMPO.md.

## CAD-Ausbau Paket 1 abgeschlossen – Technische Zeichnungen 0.82
Zeichnungsdaten1 in Projekt/Bibliothek12: A4/A3 in beiden Ausrichtungen,
Titelblock, Maßstab, native Front-/Seiten-/Drauf- und Schnittansichten sowie
Länge, Winkel, Radius, Durchmesser und Beschriftungen. Ein gemeinsamer nativer
Kurvenkern versorgt SVG, lokale Electron-PDFs und ASCII-DXF AC1015 mit
Modellgeometrie1:1mm. Nur Blatt aktualisieren rechnet im bestehenden CAD-Worker;
Papierlayout und Zoom verwenden den Cache. Verlorene/veraltete Quellen oder
Maßbezüge sperren die Ausgabe bis zum Aktualisieren beziehungsweise Zuordnen.
Revisionsgebundene UI/KI-Preview, Apply und gemeinsames Undo; Quellen unverändert.
Eigenständige portable Source- und EXE-Abnahme:332Kern-/je547Bedienprüfpunkte,
unabhängige Papier-/SVG-/DXF-/PDF-Reader, serielle Vergleiche gegen0.81,
Quell-/Runtime-/Archivintegrität. Anleitung: TECHNISCHE-ZEICHNUNGEN.md.

## CAD-Ausbau Paket 2 in Entwicklung – Projektparameter und Varianten 0.83
Strikt versionierte Parametertabelle1 in Projekt/Bibliothek13, stabile Kennungen,
Formel-DAG mit Zyklusprüfung, explizite Bindungen an freie Skizzen-/Form-/Modelliermaße.
Nur Aktualisieren berechnet aktive Geometrie; gesammelt gezielter Aufbau mit jedem
betroffenen Teil höchstens einmal, gemeinsame Preview/Apply/Undo. Alte Vorlagen
verwenden denselben gesammelten Teilaufbau. Originalformeln und Sperren bleiben.
Metadatenänderungen ohne Geometriefolgen benötigen keinen nativen Job. Varianten
speichern Werte und Status getrennt von begrenzt zwischengespeicherter Geometrie.
Der gezielte Aufbau hält auch für wiederverwendete native Näherungsquellen die
bestätigten Konstruktionsbudgets fest. Nach der endgültigen affinen Platzierung
werden alle Quellen unter betroffenen Wurzeln einschließlich unveränderter
Nachfahren geprüft; ein engerer unerfüllter Weltfehlerbedarf verwirft die
Vorschau atomar. Dadurch umgeht auch eine wiederholte starke Skalierung weder
die Genauigkeitsgrenze noch die Vorgabe höchstens eines Neubaus je Quelle.
Exportumfänge berücksichtigen verlorene Wurzeln aus Bindungen und den wirksamen
Basis-/Variantenstatus. Auch ein gelöschtes, ausschließlich über Status
referenziertes Teil darf im Gesamtexport nicht still fehlen; eine ausdrücklich
unabhängige Auswahl bleibt ausgebbar. Verlorene Bezüge sind explizit zu lösen.
Quell-/EXE-/Leistungsabnahme von 0.83 noch offen; Paket1 in eigener 0.82-Ausgabe
abgenommen, weitere Pakete erst nach vollständiger separater Paket2-Abnahme.

### CAD-Ausbau Paket 2 abgeschlossen – 0.83.0
Die eigenständige portable Ausgabe ist mit 428 Kernprüfungen und jeweils585
Bedienprüfpunkten an Quelle und tatsächlicher EXE abgenommen. Unabhängige native
Leser bestätigen30 Original-/Basis-/Variantenkörper,STEP/STL,Formeln und den
vollständigen Arbeitsplatz; technische Zeichnungen bleiben mitgeprüft.
Beide Leistungsreferenzen0.81 und0.82,je48 historische Vergleiche und jeweils2
ABAB-Paare mit warmem Median/p95 sind grün. Source/Stage/ASAR/Runtime,68ältere
Programmdateien und beide zugehörigen Quellarchive wurden vollständig geprüft.
Eine einzelne frühere Gruppiermessung war auffällig; zwei gesonderte saubere
AB-Paare bestätigten sie nicht. Die Freigabe beruht auf dem frischen vollständigen
Paketlauf, keine Produktgenauigkeit oder Prüfschwelle wurde dafür reduziert.
Die echte EXE-Oberfläche und gerenderten PDFs wurden zusätzlich visuell geprüft.
Paket3 verknüpfte Konturen beginnt erst nach dieser Abnahme; weitere Pakete4–7
des CAD-Ausbaus bleiben offen. Anleitung: PROJEKTPARAMETER.md.

## CAD-Ausbau Paket 3 in Entwicklung – Verknüpfte Konturen 0.84
Projekt/Bibliothek14 erweitert optional contourLinks1 und stabile Quellenrollen an Zeichnungskurven/Maßen; alte Formate behalten ihre Version. Objekt-/Quellenpfade und eindeutige native Flächen-/Elementrollen ersetzen dauerhafte Flächennummern. STEP folgt Lageänderungen bei identischer Originalgeometrie; Austausch/Mehrdeutigkeit erfordern explizites Rebind. Derselbe typisierte DAG sammelt Projektparameter, Konturen und CSG-Vorfahren; gezielter nativer Aufbau je ID höchstens einmal, ursprüngliche Formeln und vollständige affine Rahmen bleiben erhalten. Blatt aktualisieren verbindet benötigte Eingaben und native Projektionen in einer atomaren Vorschau; reine Layoutänderungen nutzen eine private geprüfte Geometrievorschau ohne Neubau. Export betroffener veralteter/verlorener Ergebnisse gesperrt, unabhängige Auswahl bleibt möglich. Copy/Library schreiben IDs um und erfassen benötigte Quellfamilien ohne fremde Geschwister. Noch keine portable Paket3-Abnahme; Pakete4–7 bleiben offen. Anleitung: VERKNUEPFTE-KONTUREN.md.

Die native STEP-Auswahl prüft bei koplanaren Flächen mit gleichen Grenzen zusätzlich vollständige analytische Linien-/Kreis-/Bogenkonturen auf Mehrdeutigkeit (konservative1e-7mm-Prüfgrenze); der gespeicherte exakte Face-BRep-Schlüssel bleibt unverändert. Affine Parameter an verknüpften Zielen aktualisieren ihre Platzierungsbelege nur bei ansonsten unveränderter Quell-/Profilbasis. Nur neu erzeugte Konturrezepte werden vor Cacheablage kanonisiert, damit Wiederöffnen nach engem Cache dieselben bewiesenen BReps wiederverwendet. Genauigkeitsbudgets aller unberührten Näherungsquellen bleiben geschützt.
Asynchrone Modell-Exporte prüfen die bestätigte Revision auch nach Rückkehr der nativen Bytes. Vorschau-Abbruch gehört zu genau ihrem eigenen laufenden Auftrag; BUSY- oder revisionsabgewiesene Anfragen verändern weder dessen Metadaten noch dessen Abbruchzustand. Die private Clipboard-Projektidentität folgt auch Undo/Redo über einen echten Projektwechsel, ohne gespeichertes Zusatzfeld oder zusätzliche Historiekopie.

Die historische Leistungsprüfung unterscheidet potenzielle Einzelwertauffälligkeiten von wiederholbaren Verschlechterungen. Im Paket3-Protokoll bleiben alle ursprünglichen Vergleiche und deren materialSlowdown-Flags erhalten. Ein expliziter Deferredmodus verschiebt ausschließlich die Freigabeentscheidung auf zusätzlich verpflichtende serielle AB-Paare: Quelle und EXE gegen0.81/0.83,je2Paare,16Prozesse/192Vergleiche, identischer Harness und unveränderte Qualität. Wiederholte Überschreitungen beim gleichen Ablauf von mehr als25Prozent UND10ms verwerfen das Paket. Der alte Reporterstandard bricht weiterhin bei jeder potenziellen Auffälligkeit ab. Die zusätzlichen warmen Median/p95- und Kaltlaufprüfungen bleiben verpflichtend. Keine Konstruktions- oder Exporttoleranz wurde reduziert.

### CAD-Ausbau Paket 3 abgeschlossen – 0.84.0
Die separate portable Ausgabe ist vollständig abgenommen:513 Kernprüfungen sowie je633 Bedienprüfpunkte an Quelle und echter EXE(585 frühere und48 neue). Native Konturrollen, gezielte Kettenaktualisierung, volle affine Platzierungen, tatsächliche STEP-Mehrdeutigkeit/Geometrieaustausch, Parameteranbindung, Bibliotheks-/Clipboard-Quellabschluss und gemeinsame Zeichnungsmaßbezüge sind geprüft. Unabhängige Leser bestätigen jeModus18 Konturkörper,30 Parameterkörper,STEP/STL sowiePDF/SVG/DXF;vier physische Papierformate zusätzlich exaktgeprüft. Alle70 geschützten früheren Programmdateien bleiben bytegleich. Die unveränderten Referenzen0.81 und0.83 sind mit jeweils48 historischen Erstvergleichen,zusätzlich16 seriellen Legacy-Prozessen/192 wiederholten Vergleichen und84 warmenMedian/p95-/Kaltlaufvergleichen geprüft;keine wiederholbare Überschreitung der unveränderten AND-Schwelle25Prozent/10ms. Frühere auffällige Erstläufe bleiben ausdrücklich nicht abgenommen und separat dokumentiert. Konstruktionstoleranzen und Exportqualität wurden nicht reduziert. Voller Abschlussaudit:14 Prüfbereiche/836 Belege,Stage/ASAR/Runtime/Quellenfreeze und beide Archive einschließlich jederCRC/SHA gelesen(40 CAD-/1733 Programmeinträge). Reale EXE-Bilder und exportierte PDF-Renderings sind visuell geprüft. Auf ausdrücklichen Nutzerwunsch wird nach Paket3 pausiert;Pakete4–7 sind offen und wurden nicht begonnen. Punkt9 echtes selektivesLaden bleibt bisPaket7 offen. Anleitung:VERKNUEPFTE-KONTUREN.md.

### CAD-Ausbau Paket 4 in Entwicklung – 0.85.0
Die Arbeit wurde nach der Paket3-Pause ausdrücklich fortgesetzt. Skizzenversion3 ergänzt die ursprünglichen Profil2-Daten um streng validierte stabile Element-/Punktbezüge und höchstens256 Beziehungen. Ein kernel-/DOM-freies numerisches Modul verwendet gedämpfte Ausgleichsrechnung mit spaltenpivotierter Householder-QR-Zerlegung und Rangprüfung. Nur numerisch freie Koordinaten sind Unbekannte; bestehende Koordinatenformeln und neue Maßbedingungsformeln bleiben gespeichert und verbindlich. Connected-Component-Auswahl,128Elemente/80Iterationen/1s sowie vollständige Konflikt-/Timeout-Rücknahme begrenzen den Auftrag. UI-Lösen geschieht beim Loslassen/Setzen in einem kurzlebigen eigenen Worker; die native CAD-/Netzvorschau bleibt ein ausdrücklicher gesonderter Aufruf mit bestehendem Revisions-/Undo-Vertrag. V3 benötigt Projekt/Bibliothek15 einschließlich verschachtelter CAD-/Netzquellen. Altformate5/7–14 und Skizzen1/2 bleiben erhalten. Gesammelte Projektparameter lösen jede geänderte V3-Skizze vor einmaliger Konstruktion; freie Maßbedingungswerte stehen im vorhandenen Katalog. Spiegelkopien remappen Element-/Relationsbezüge und Fixwerte/Winkel. Lokale KI-API1 verwendet dieselben Validatoren und Vorschaupfade; keine neuen Zugangsdaten. Abnahme ist noch offen, Pakete5–7 noch nicht begonnen; Punkt9 weiter offen. Anleitung:SKIZZENBEDINGUNGEN.md.

Die Paket4-Abnahme fand außerdem eine zuvor sporadische Änderung stillstehender Kamerakoordinaten durch die sphärische Rückrechnung von OrbitControls. Der Kamera-Schritt erhält jetzt die exakte ruhende Lage nach dem internen Dämpfungsabbau; reine Erfassung, Arbeitsbereichslesen und Neuzeichnen machen eine gespeicherte Ansicht nicht mehr numerisch schmutzig. Echte Dämpfungsbewegung und bewusst gesetzte Perspektiv-/Orthokameras bleiben erhalten. BRep-/Mesh-Koordinaten oder Exportgenauigkeit werden dafür nicht gerundet. Die ursprüngliche exakte Workspace-Save-Prüfung bleibt unverändert.

### CAD-Ausbau Paket 4 abgeschlossen – 0.85.0
Die separate portable Ausgabe ist vollständig abgenommen:547 Kernprüfungen, je650 Bedienprüfpunkte an Quelle und echter EXE(633 vorherige und17 neue). Echte Mausbewegungen belegen keinen Löser während des Ziehens, genau einen 2D-Lauf beim Loslassen und keinen CAD-Aufbau bis zur ausdrücklichen Vorschau. Formelbindung, Fixierungen, geometrische Beziehungen, Widerspruchsrücknahme, Abbruch, Quellen-/Sperrschutz, Undo/Redo, Bibliothek15, Spiegelbezüge und identische native/Netzverträge sind geprüft; zehn parametergebundene Skizzen werden je einmal konstruiert. Unabhängige Leser bestätigen gespeicherte Beziehungen/Formeltexte und tatsächliche BRep-/STEP-/STL-Volumina sowie alle bisherigen Zeichnungs-/Vorlagen-/Importausgaben. Vier physische PDF-Papierformate und reale EXE-/PDF-Ansichten sind geprüft. Beide unveränderten Referenzen0.81 und0.84 bestehen je48 historische Erstvergleiche sowie die verbindlichen16 seriellen Wiederholungsprozesse/192 Vergleiche und84 warmenMedian/p95-/Kaltlaufvergleiche; keine wiederholbare Überschreitung der unveränderten AND-Schwelle25Prozent/10ms. Alle72 geschützten alten Programmdateien, komplette Stage/ASAR/Runtime und beide Quellenarchive(40/1751 Einträge,jedeCRC/SHA) sind exakt bestätigt. Abschlussaudit15 Prüfbereiche/856 Belege und gesonderte Sicht-/Auslieferungsprüfung sind vollständig. Der erste Lauf bleibt als nicht abgenommene Historie erhalten; seine strenge Kameraspeicherprüfung wurde durch einen Produktfix und einen vollständig frischen Gesamtlauf erfüllt. Keine Modell- oder Exportgenauigkeit wurde reduziert. Pakete1–4 sind fertig. Paket5 Gelenke beginnt jetzt; Pakete5–7 und Planpunkt9 bleiben offen. Anleitung:SKIZZENBEDINGUNGEN.md.


### CAD-Ausbau Paket 5 in Entwicklung – 0.86.0
Gelenke verwenden optionales Projekt-/Bibliotheksformat16 mit festen Basen und einem eindeutigen Baum aus festen, Dreh- und Schiebegelenken. Körperlokale vollständige affine Bezugssysteme erhalten Spiegelungen/Scherungen. Ein reiner kompilierter Bewegungszustand hält Referenzen und gecachte Grenzen; die Regler erzeugen nur betroffene Anzeigematrizen ohne Projekt-/Geometriekopien oder Workerjobs. Gemeinsames Übernehmen1Undo, Abbruch exakte Ausgangslage; Sperren, Grenzen und beschädigte Bezüge blockieren atomisch. Ausdrückliches Rebind erhält bestätigte Lage und Wert. Interne Kopier-/Vorlagenverbindungen erhalten frische Kennungen; Teilkopien werden gelöst. Modeless-Seitenbereich in Normal/Easy, strikte lokale KI-Vorschau und paginierte Abfragen.
Kollision ist ausschließlich eine ausdrücklich angeforderte Zwei-Teil-Stellungsprüfung: BRep nativ, geschlossene Netze im Netzkern, gemischt gekennzeichnetes0,01mm/5Grad-Vernetzungsziel ohne Maximalabweichungsgarantie; positiver Volumenschnitt, kein Berührungs-/Bewegungswegnachweis. Interne Prüfvorschau wird auch bei echtem laufendem Abbruch verworfen. Details/Grenzen in GELENKE-BEWEGUNG.md. Sourcevorprüfung21UI ohne Fehler/extern und unabhängiger FreeCAD/STEP/STL-Reader grün, Portable-/Vollabnahme noch offen. Pakete1–4bleiben abgenommen;6–7noch nicht begonnen, Punkt9offen.

P5 Vollabnahme fand einen reproduzierten bisherigen Flächenpicker-Fehler: Der im Capture-Handler behandelte pointerdown konnte nach synchronem Schließen des Pickers/erneutem Anheften des Gizmos noch dessen späteren Listener erreichen und eine unerwünschte Transformationsvorschau starten. Der Picker konsumiert das Ereignis jetzt vor seinem Callback mit stopImmediatePropagation. Die bestehenden echten Flächenklickprüfungen kontrollieren zusätzlich unveränderte Modell-/Undo-Bytes und keine offene Transaktion direkt nach der Flächenwahl; keine Grenz-/Zeit-/Assertlockerung.

P5 zweite Vollabnahme:572Kern und Quelle/EXE je671UI sowie16historischeProzesse/192Vergleiche ohne wiederholbare starke Regression grün; letzter zusätzlicher Workflowprozess brach beim redundanten Layoutschreiben während Wiederöffnen ab, kein gemessener Zeitgrenzverstoß.500 isolierte originale Schreibwiederholungen reproduzierten den Dateifehler nicht; der ursprüngliche genaue OS-Code war vom Layoutspeicher verdeckt. Der Speicher überspringt nun nach strikter Revision-/Validierungsprüfung identische bereits gespeicherte Layoutdaten, erhält deren Revision und meldet künftig auch OS-Fehlercodes. Atomisches Ersetzen wiederholt ausschließlich WindowsEPERM/EACCES/EBUSY begrenzt bis310ms, ohne vorheriges Löschen des Originals; Abbruch wird vor jedem Versuch geprüft. Kontrollierte Fehler-/Abbruchtests erhalten Originalbytes und beseitigen nur die neue temporäre Datei. Vollabnahme weiterhin offen.


### CAD-Ausbau Paket 5 abgeschlossen – 0.86.0
Die separate portable Ausgabe ist vollständig abgenommen:582 Kernprüfungen, Quelle und echte EXE je671 Bedienprüfpunkte(650 bisherige und21 Gelenkprüfungen), null Rendererfehler/extern. Reine Matrixvorschau ohne Geometriejobs, feste Mitnehmer, zehn abhängige Teile, volle affine Spiegelungen/Scherungen, Sperren, Grenzen, letzter gültiger Zustand, explizites Rebind, gemeinsame Bewegung1Undo, exaktes Undo/Redo, Bibliothek16/Kopien und lokale KI sind geprüft. Tatsächlich gespeicherte Bezugsmatrizen/Quellen und echte STEP/STL-Dateien wurden unabhängig mit FreeCAD geprüft, darunter affine Weltvolumina1848 und1200mm³. Ausdrückliche native, Netz- und gemischte Stellungs-Kollisionen erhalten Modell/Historie; auch ein laufender Abbruch gibt die interne Vorschau frei.
Gegen unveränderte0.81 und vorherige0.85 bestehen die kompletten historischen Arbeitsabläufe in16seriellenProzessen/192Vergleichen sowie die zusätzliche Alternierungsreihe mit21warmenProben,p95und3Worker-kaltenProben(84Vergleichszeilen) ohne wiederholbare starke Regression. Alle74geschützten früheren EXE-/ASAR-Dateien exakt, vollständige Source/Stage/ASAR/Runtime-Manifeste und beide Quellarchive mit CRC/jedemSHA bestätigt. Finalaudit16Bereiche/886Belege; vier echte EXE-Ansichten und zwei gerenderte PDFs visuell geprüft, Auslieferungsbeleg vor/nach vollständigem Runtime-/Altdateienvergleich. Zusätzlicher Runtimeumfang216.467Bytes, keine zusätzlichen Geometriekerne.
Zwei fehlgeschlagene frühere Gesamtläufe bleiben samt getrennt markierten Binaries und Rohbelegen erhalten: reproduzierter synchroner Flächenpicker/Gizmo-Klickfehler, danach ein nicht erneut isoliert reproduzierter Layoutschreibfehler im letzten Workflowprozess. Korrekturen und Grenzen sind oben dokumentiert, keine Abnahmegrenze gelockert. Die erfolgreiche Abnahme wurde mit sämtlichen Gates frisch wiederholt. Pakete1–5fertig, jetzt6–7offen; Planpunkt9erstnachPaket7 vollständig.


### CAD-Ausbau Paket 6 in Entwicklung – 0.87.0
Die Baugruppenanzeige hält ein separates begrenztes Ladeset im Arbeitsplatz5. Auswahl vollständig darstellen, Nachladen und Alle Teile verwenden denselben reinen Zustand ohne Körper-/Quellen-/Sichtbarkeits-/Undoänderung. Explizites Alles enthält alleIDs, vernetzt aber dauerhaft verborgene Teile nicht; alte Dateien ohne Ladeset behalten den bisherigen Standardpfad. Die native display-Anfrage trägtIDs, die vor jeglichem BRep-Lesen/Vernetzen ausgewertet werden; ein leeres Set spart den Anzeige-Workerauftrag. Kleine Rahmen/unsichtbare Ray-Proxies bleiben auswählbar, respektieren Isolation und Easy-CAD/Netz-Domäne und bewegen sich bei Gelenkvorschauen mit. Rahmen aus acht affinen Grenzpunkten erhalten Scherungen/Spiegelungen; Meshgrenzen sind je Quelle gecacht.
Speichern/Autosicherung erhalten sämtliche Geometrie, Save/Open/Recovery stellen das Ladeset vor dem Meshen her. Wiederöffnen identischer Modellrevisionen zeichnet bei geändertem Ladeset ausdrücklich den vorbereiteten Teilumfang, selbst wenn kein Modell-onChange ausgelöst wird. Für Arbeitsplatz5 wird ein bisheriges reinesCAD5/7nur beim Ausgeben als gemeinsamesFormat8 gespeichert; alte Arbeitsplätze1–4bleiben kompatibel. Der Defaultpfad bekommt keine zusätzliche Modellierung/Vernetzung oder Wiederöffnungsrunde. Lokale API POST/v1/assembly und bedingter achter Python-MCP-Befehl trennen view-only-State/only/load/all vom Modellpreview; strictRevision undIDs, keineUndoänderung. GemeinsameKontext-/OpenAPI-/CLI-Verträge aktualisiert, AltAppsweiter7MCPTools.
Sourcevorprüfung16UI ohne Rendererfehler/extern grün; unabhängiger FreeCAD-Reader bestätigt13originaleBReps einschließlichGruppenkindern,12gespeicherteWurzeln bei1geladen, vollenexaktgespeichertenWorkspace5,STEP12Solids/4111.36mm³undSTL13geschlosseneorientierteKomponenten/4431.36mm³mitvollenWeltgrenzenundexakterQuellerhaltung. NativeTestsbeweisenkeinLesen/VernetzenunlesbarerausgelassenerBRepundunverändertenFullExport. EigenePortable/VollabnahmefürP6nochOFFEN. In dieser Stufe bleiben alleBReps/NetzeimSpeicher; nativeSzenenabfragendürfenallesprüfen. P7erstnachP6Abnahme;Planpunkt9erstnachP7vollständig.

P6AltdateischutzvorFreezeergänzt: Speichern verwendet eine gemeinsame Funktion für tatsächlich benötigte Ausgabeversion und SaveAs-/Dateireceipt-Entscheidung. Damit fordert Arbeitsplatz5 bei reinemCAD5/7 eine neueFormat8-Datei an, obwohl das bestätigteModell seineVersionbeibehält;einAltformatwirddurcheineAnsichtseinstellungnichtimplizitüberschrieben. EchteUI+unabhängigerReaderprüfenOriginalhashundneueDatei samt unverändertenKörpern;Sourcevorprüfungnun17UIund9Artefakte. VollerKernvorlauf595/595grün,gezielteWorkspace/Speicher-/Auditnachprüfung10/10grün.

P6Review vor erster portabler Erstellung: Unveränderte Rahmen wurden bei Szenenrefresh neu erzeugt und konnten eine laufende Gelenk-Matrixvorschau ihrer Objekte berauben. Der erste Full-Lauf wurde nach595grünenKern-/erstenSourcegates bewusst gestoppt(keinBinaryerstellt). Reproduzierter echterRenderer-/JointViewTest fandObjektwechsel; Rahmen werden nun bei identischen Daten behalten, auch ihre Drahtlinien verwenden explizite Matrizen ohne automatische Positionsrekonstruktion. Zusätzliche echteUIprüft Gelenkbewegung eines ausgelassenen Rahmenteils über SceneRefresh/RenderReady und exaktesCancel/Undo. Vollabnahme bleibt offen und wird frisch wiederholt.


### CAD-Ausbau Paket 6 vollständig abgenommen – 0.87.0

Die eigene portable Ausgabe besteht596Kernprüfungen sowie je689Bedienprüfpunkte an Quelle und tatsächlicher EXE. Alle bisherigen Prüfbereiche bleiben erhalten. Unabhängige Reader bestätigen13originaleBReps einschließlichGruppenquellen,12gespeicherteWurzeln bei1geladen,exakteWorkspace5-Rundreise, vollständigenSTEP(12Solids,4111.36mm³)/STL(13geschlosseneorientierteKomponenten,4431.36mm³) und unverändertesCAD5-Original bei neuerFormat8-Ausgabe. Die beiden Referenzen0.81/0.86 bestehen16serielleLegacyprozesse/192Vergleiche und84zusätzlicheMedian/p95-/Kaltlaufvergleiche ohne wiederholbare starke Regression. Alle76geschütztenProgrammdateien,Quelle/Stage/ASAR/Runtime sowie beideQuellarchive(CRC und jederSHA) sind exakt geprüft. Abschlussaudit17Bereiche/916Belege,vierEXE-Bilder und zweiPDFs visuell sowie gesonderteAuslieferungsprüfung sind vollständig. Laufzeit wächst um73458Bytes;keinezusätzlicheKernelinstanz.

Der erste Gesamtlauf wurde vor portabler Erstellung wegen der oben dokumentierten Rahmen-/Gelenkintegration gestoppt. Ein zweiter Lauf bestand sämtliche Gesamttests, scheiterte aber am falschen17/18-Skizzenzählwert des Auditors; zugleich zeigte die Sichtprüfung ein zu früh abgegriffenesEasy-Offscreenbild. Der Zählwert hat einen Regressionstest; das Abgreifen wartet auf denCompositor und verlangt sichtbareKörperpixel. Danach wurde alles in einem dritten frischen Lauf wiederholt. Historie und nichtabgenommene Ausgabe bleiben getrennt erhalten.

Pakete1–6sind fertig;Paket7(indexiertes.fnpack,echtesbedarfsgerechtesGeometrieladen) ist noch offen. In0.87 bleiben alleGeometriequellen imSpeicher. Planpunkt9ist erstnachPaket7vollständig erfüllt. Anleitung:BAUGRUPPENANZEIGE.md.


### CAD-Ausbau Paket 7 in Entwicklung – 0.88.0

Das eigenständige `.fnpack` ergänzt `.ocad`: 64-Byte-Kopf, begrenzter SHA-256-geprüfter JSON-Index mit Projektkatalog 17 und adressierten BRep-/Netzblöcken. Identische Geometrie wird dedupliziert, Instanzen behalten Kennungen, Quellen und volle affine Platzierungen. Der erste STEP-Import bleibt vollständig; spätere Paketöffnungen lesen nur Index und die benötigten Blöcke. Die ursprüngliche STEP-Datei ist dafür nicht erforderlich. Ladeset, Sichtbarkeit und tatsächliche Geometrieresidenz bleiben getrennt. Kataloggrenzen sind ausdrücklich kein nativer Geometriebeweis.

Ein privater Resolver prüft Blockprüfsummen, teilt gleichzeitige Zugriffe und begrenzt den dekodierten Cache auf ungefähr 128 MiB/256 Blöcke. Geometrische Befehle laden ihren notwendigen Quellenabschluss; reine Darstellungsänderungen bleiben ohne fremde Geometriezugriffe. Vollständige Exporte laden ihren unterstützten Materialumfang oder brechen atomisch ab. Speichern streamt und prüft auch nie geladene Blöcke; private Quellenkopien erhalten alte Undo-Zustände beim Überschreiben. Paket-Autosicherungen sind selbstständig, Schließen wartet auf ihren Abschluss. Vorlagen und Clipboard enthalten vollständige ausgewählte Quellen ohne private Paketverweise. Alte Projektformate bleiben lesbar; Bibliotheken verwenden weiterhin vollständig materialisierte Modelle bis Version 16.

Die Bedienung ist in FNPACK.md, das begrenzte Binärformat in FNPACK-FORMAT.md beschrieben. Die portable Ausgabe und die vollständige Abnahme stehen noch aus; Planpunkt 9 bleibt bis zu deren Abschluss offen. Vorprüfungen mit unabhängigen Lesern umfassen tatsächliche STEP-/STL-Ausgaben, Wiederherstellung aus alleiniger Paket-Autosicherung und erhaltene ältere Parameter-, Kontur-, Skizzen-, Gelenk- und Zeichnungsmodelle.


### CAD-Ausbau Paket 7 vollständig abgenommen – 0.88.0

Die eigene portable Ausgabe mit indexiertem `.fnpack` ist vollständig abgenommen. 621 Kernprüfungen und je 717 Bedienprüfpunkte an Quelle und tatsächlicher EXE sind bestanden, einschließlich aller zuvor abgenommenen Prüfbereiche. Der unabhängige Paketleser prüft je Modus 24 tatsächliche Artefakte und sechs physische Pakete, Kopf/Index/jeden Blockhash, vollständige Originalquellen, deduplizierte affine Instanzen und tatsächliche Bereichszugriffe. Die ursprüngliche STEP-Datei wird vor dem Wiederöffnen gelöscht. Speichern erhält nie geladene Blöcke ohne vollständige Renderer-Hydration; beschädigte benötigte Blöcke verhindern Export oder Ersatz einer bestehenden Ausgabe atomisch. STEP umfasst sechs gültige geschlossene Solids mit 2368 mm³, STL sieben geschlossene orientierte Komponenten mit 84 Dreiecken und 2688 mm³. Unterschiedliche Materialumfänge entsprechen den bisherigen Formatverträgen.

Ein frischer Prozess stellt das Modell ausschließlich aus seiner eigenständigen Paket-Autosicherung wieder her. Auch echtes natives Fensterschließen wartet nach einer ungespeicherten Metadatenänderung auf die vollständige atomische Sicherung. Clipboard und Bibliothek übertragen vollständige ausgewählte Originalquellen ohne Paketabhängigkeit. 21 zuvor nativ abgenommene Parameter-, Kontur-, Skizzen-, Gelenk- und Zeichnungsmodelle aus fünf Bereichen werden als tatsächliche Pakete geschrieben und unabhängig dekodiert; sämtliche Quellen und Metadaten, Formeln, Korrespondenzen und Zeichnungssignaturen bleiben exakt.

Die unveränderten Referenzen 0.81 und 0.87 bestehen 16 serielle historische Messprozesse mit 192 wiederholten Vergleichen sowie 84 zusätzliche Ablaufvergleiche mit warmen Medianen, p95 und Kaltstarts. Keine wiederholbare Überschreitung der unveränderten AND-Schwelle von 25 Prozent und 10 ms. Alle 78 geschützten früheren Programmdateien sowie Quelle/Stage/ASAR/Runtime sind exakt geprüft. Beide Quellarchive werden einschließlich jeder CRC und jedes Eintragshashes gelesen. Laufzeitumfang wächst um 99058 Bytes gegenüber 0.87; keine zusätzliche Kernelinstanz. Abschlussaudit: 20 Bereiche und 1063 Belege. Fünf tatsächliche EXE-Bilder und zwei PDF-Renderings sind visuell geprüft; die gesonderte Auslieferungskontrolle prüft Laufzeit und frühere Programme vor und nach der Dokumentation erneut.

Ein erster Gesamtlauf stoppte vor portabler Erstellung beim Chromium-Aufnahmefehler UnknownVizError. Ein zweiter bestand sämtliche Gesamtprüfungen, doch der abschließende Auditor enthielt noch den früheren Runner-Dateinamen; zugleich war die Easy-Offscreenaufnahme vor dem fertigen 3D-Bild entstanden. Ausschließlich die Prüfhelfer wurden korrigiert: passende Runner-Identität, begrenztes Warten und höchstens drei Aufnahmeversuche mit sichtbaren Körperpixeln. Keine Produktgeometrie, Genauigkeit oder Prüfschwelle wurde geändert. Danach wurde die komplette Abnahme in einem dritten frischen Lauf wiederholt. Frühere Belege und die nicht abgenommene Ausgabe bleiben getrennt erhalten.

**Pakete 1–7 und Planpunkt 9 sind vollständig erfüllt.** Die Abschlussnotiz wurde nach der eingefrorenen Auslieferung ergänzt; abgenommene Programme, Archive und Belege bleiben unverändert. Anleitungen: FNPACK.md und FNPACK-FORMAT.md.


## Automatische Bemaßung 0.89.0 – in Prüfung

Kernel-freie Vorschläge aus aktuellen nativen Zeichnungskurven in zwei Modi.
Grundmaße und sichtbare Kreisdurchmesser, zusätzlich Koordinaten von Kreismitten,
Radien, Kantenlängen und schräge Ecken. Geometrische distance-Maße mit Achse und
zwei analytischen Punktrollen, gemeinsame Berechnung für UI/PDF/SVG/DXF.
Vorhandene Maße/Platzierungen bleiben erhalten, identische globale Achsenmaße
werden über Ansichten dedupliziert. Platzierung prüft Papier, Ansichten,
Titelblock, Texte und Maßlinien; ausgelassene Vorschläge werden angezeigt.
Analytische Gesamt-/Positionsmaße werden bei sichtbaren Splines nicht geraten.
Project/library18 nur für neue Abstandsmaße; .fnpack akzeptiert17/18 und erhält
selektives Laden. Alte Formate unverändert. Lokale KI drawing/action:dimension
verwendet denselben Pass mit basic/detailed und üblicher Preview/Apply/Undo.
Keine Fertigungstoleranzen oder Vollständigkeitsgarantie. Neue portable Abnahme
steht noch aus. Anleitung: TECHNISCHE-ZEICHNUNGEN.md.

Stabile Zeichnungsmaßrollen normalisieren auch die Schlüssel innerhalb des
Quellenbezugs (rootId/path); kanonisch gespeicherte Ansichten und frisch erzeugte
Maßvorschläge bleiben beim Wiederöffnen und erneutem Bemaßen semantisch gleich.


## Automatische Bemaßung 0.89.0 vollständig abgenommen

Grund- und Detailbemaßung sind in einer eigenen portablen Ausgabe abgenommen:
633 Kernprüfungen, jeweils 736 Bedienprüfpunkte an Quelle und tatsächlicher EXE,
21 Bereiche im Abschlussaudit. Unabhängige Leser bestätigen die neuen
Gesamt-/Mittelpunktabstände, alle zwölf Prüfmaße sowie tatsächliche SVG-, DXF-,
PDF-, Projekt-18-, Paket-18- und Bibliothek-18-Dateien; die bisherige vollständige
CAD-/Netz-/Export-/Wiederherstellungsabnahme bleibt erhalten. Sieben tatsächliche
EXE-/PDF-Bilder sind visuell geprüft, drei zugehörige PDFs beigefügt.

Beide unveränderten Referenzen 0.81 und 0.88 wurden mit den historischen
Wiederholungsreihen und vollständigen Arbeitsabläufen geprüft; keine
wiederholbare starke Regression nach der bestehenden AND-Grenze 25 Prozent
und 10 ms. Keine Geometrie-, Konstruktions- oder Exportgenauigkeit wurde
reduziert, kein weiterer Kernel hinzugefügt. Alle 80 geschützten älteren
Programmdateien sowie Quelle/Stage/ASAR/Runtime und beide Quellenarchive
(einschließlich jeder CRC/SHA) sind bestätigt.

Die erste Gesamtabnahme blieb wegen eines bei der Sichtprüfung entdeckten
Feldreihenfolgefehlers in gespeicherten Maßrollen ausdrücklich unveröffentlicht.
Die semantische Normalisierung von rootId/path und eine eigene Regression samt
harter Wiederöffnen-/Exportprüfung wurden durch einen vollständig frischen
zweiten Gesamtlauf bestätigt. Die erste Ausgabe bleibt als nicht abgenommene
Historie erhalten.

Final: F:/Formnaro-Ausgaben/Automatische-Bemassung-v0.89.0/Formnaro-win32-x64/Formnaro.exe.
Abnahme, Abschlussprüfung, Sichtprüfung und Auslieferungsprüfung stehen daneben.
Neue Abstandsmaße benötigen Format18; bestehende Inhalte behalten ihre
Generation, vollständige Fertigungsbemaßung und Toleranzen bleiben bewusste
Vorgaben. Anleitung: TECHNISCHE-ZEICHNUNGEN.md.
Dieser Abschlussnachtrag wurde nach der eingefrorenen Auslieferung ergänzt;
abgenommene Runtime, Archive und Belege bleiben unverändert.


## Python-Modellierung 0.90.0 – fertig

Neuer op:python verwendet dieselbe gemeinsame native CAD-/Netz-Vorschau wie
JS-Skripte. Ein nur auf ausdrücklichen Aufruf geladener Pyodide314.0.7/Python3.14.2
Worker läuft im bestehenden opaque-origin-Sandboxrahmen. Ausschließlich
mitgelieferte Blob-Runtimebytes, keine Hostmounts/Netz-/Desktoprechte.
Native Konstruktion und Messungen verbleiben bei den bisherigen Workern;
Abbruch/Fehler/Stale/Quellensperren und ein gemeinsames Apply/Undo bleiben erhalten.
Neue private Runtimeoptionen sind keine öffentlichen Befehlsfelder.

Gemeinsame SDK-Quelle ai/python/formnaro: CPython3.10+ und eingebettete Laufzeit,
Körper/Skizzen/Boolesche/Loft/Sweep sowie Messabfragen und Quellenadressen.
Externes Client.preview/ausdrückliches apply verwendet den lokalen Token intern.
Bedingtes MCP-Werkzeug offlinecad_python und UI-Pythonbereich nutzen denselben
Befehl; Anbieter und Schlüssel werden nicht verändert. Laufzeitdaten und
Quellarchiv mit festen Prüfsummen und Lizenznachweisen unter python-runtime.
Ergebnisse sind gewöhnliche native Quellen; keine zusätzliche Projektversion
oder automatische Skriptausführung beim Öffnen. Anleitung: PYTHON-SCHNITTSTELLE.md.


Portable 0.90.0 vollständig abgenommen: 637 Kerntests, jeweils758 UI-Prüfungen
in Quelle und tatsächlicher EXE, darunter22 neue Python-Prüfungen. Reale lokale
Python-Workerprüfung17, externe SDK3, tatsächliche MCP- und CPython-Steuerung;
unabhängige Leser prüfen2 native Modelle/7 gespeicherte BReps/6 OCAd-/STEP-/STL-
Dateien. Fehler nach Teilberechnung, Abbruch, Stale und Undo/Redo geprüft.
Alle bisherigen Quellen-, Format-, Export-, Papier- und Wiederherstellungsgates
bleiben erhalten. Gegen feste0.81 und vorherige0.89 beide wiederholten
Leistungsreihen bestanden,82 ältere Programmdateien unverändert. Laufzeit rund
12.59MB größer; CAD-/Netz-Kerne und Geometriegenauigkeit unverändert.
Abschlussaudit22 Bereiche,7 tatsächliche Screenshots/PDF-Renderings visuell
geprüft und abschließende Runtime-/Altdateihashes vor/nach Auslieferung bestätigt.
Final: F:/Formnaro-Ausgaben/Python-Modellierung-v0.90.0/Formnaro-win32-x64/Formnaro.exe.
Anleitung/SDK/Beispiele mitgeliefert; native geprüfte Beispieldateien zusätzlich
im Ausgabeordner Beispiele. R1 scheiterte vor dem Bauen ausschließlich an einer
alten festen MCP-Werkzeuganzahl; neue Prüfung erhält alle bisherigen Werkzeuge
und prüft sämtliche Unterstützungskombinationen. Vollfrischer R2 ist freigegeben.
Dieser Nachtrag erfolgte nach Quellenfreeze, Audit und Auslieferung; akzeptierte
Runtime, Archive und Berichte bleiben unverändert. Den Frozen-Auditor nicht
gegen den erst danach dokumentierten Arbeitsbaum erneut ausführen.


## KI-Modellierkontext 0.91.0 – abgenommen

Persönliche bearbeitbare Daten/KI-Modellierkontext.md wird bei jeder CAD-
Modellieranfrage neu eingelesen (16KB); strukturierte Erfahrungen separat in
KI-Modelliererfahrungen.json (max60 aggregierte Einträge/64KB, letzter24erAuszug).
Nur vorgegebene Outcome-/Werkzeug-/Prüfungstypen und Fehlercodes, Modellkennung,
Version, Anzahl und Zeiten. Keine Prompts, Geometrien, Bilder oder Schlüssel.
Bestehende und beschädigte Dateien bleiben erhalten. Lesefehler blockieren die
Modellierung nicht. Kontext ist Referenzdaten, ersetzt keinen aktuellen Vertrag
oder Auftrag und kann keine Werkzeuge/Rechte erweitern. Status/Pfade/Ordneraktion
unter KI-Einstellungen. Frontend erfasst Korrekturfehler, geprüfte Vorschauen und
Übernahmen getrennt; die KI schreibt keine eigenen freien Erfolgsaussagen hinein.
Native Python-Boolesche/Loft/Sweep unterstützen zusätzlich stabile Ergebnisalias-
namen, damit Top-Level-Ergebnisprüfungen auf Python-Ergebnisse verweisen können.
Gezielte13 Kontext-/Provider-/Vertragstests und SDK4 grün; portable Abnahme offen.

Desktop-Providerfehler benötigen ein Plain-Data-Reply über contextBridge:
Electron erhält Customprops geworfener Errors nicht im anderen JS-Kontext.
Neue generateAIReply-Funktion und renderer ai-desktop-client rekonstruieren
code/feedback/aiUsage/aiRetryable lokal; LegacygenerateAI bleibt verfügbar.
CAD-, Konverter- und Legacy-UI nutzen denselben Adapter. Echte UI-Regression
belegt vor Fix fehlende Wiederholung (4statt5Anfragen), danach automatische
Korrektur bei finish_reason=length. MemoryUI jetzt10 Gruppen, SDK4, Worker19.

Nutzer hat ein deutlich höheres Antwortbudget beauftragt: maxOutputTokens als
optionalnull/1..393216Providerprofilfeld; alte DeepSeek-Profile automatisch
131072 (4x), andereResponsesweiter12000. Responsesmax_output_tokens/Chatmax_tokens,
aktuellesrequestConfigprüftauchBudget, ConverterübernimmtgleichesProfil.
Antwortannahme16MiB statt2MiB, abbrechbarerProviderTimeout30min statt10min.
OffizielleDeepSeekAPI25.10.2026 unterstützt393216max. UIbudgetgespeichertundim
actualsynthetischenHTTPrequestauf393216verifiziert. Nodebudget4neueTests,
MemoryUIjetzt11Gruppen,full657Kernfinal bestanden. KeineGeometrie-/Kerneländerung.


Abschluss0.91.0: 657Kernfälle/0fail, SDK4, realer PythonWorker19; Quelle und
actualEXE je148gezielte UI-Prüfungen (Modellierkontext11/Python22/bisherige
KI-Ergebnisprüfungen91/gemeinsameCAD-KonverterKI24), Renderer/Extern0. JeModus
unabhängigerReader2nativeBeispiele/7BReps/6Dateien. Alle84älterenEXE/ASARhashes
vor/nach unverändert, frühere0.90SDK-/Worker-Receipts exakt erhalten. DreiWASM-
Payloads bytegleich zu0.90, Quellen/Stage/ASAR/Runtimefreeze und Quellenarchive
geprüft. R3 ist abgenommen; R1 unverändert als nicht abgenommener Entwurf
aufbewahrt, R2 vor Binärbau wegen Helper-Hashliteral gestoppt. Keine Lockerung
von Geometrie-, Ergebnis- oder Archivprüfungen. Frühere758UI-/16Legacy-/Workflow-
Leistungskampagne für diese kleine Erweiterung NICHT wiederholt; keine neue
allgemeine Leistungsaussage. Scope steht ausdrücklich in Abnahme.json.
FinalEXE F:/Formnaro-Ausgaben/KI-Modellierkontext-v0.91.0/Formnaro-win32-x64/Formnaro.exe.
FinaleByte-/Sicht-/Auslieferungsprüfung bestanden; BerichtSHA256
1421469faab04e4ab170ef7d765b21420202e4227222c31494ee2c3e5bc15dd0.
Zwei echte EXE-Screenshots zeigen Budgetkontrolle und lesbaren/erreichbaren
Kontextordner bei Normal-/Mindestgröße. Diese Dokumentation wurde nach der
gefrorenen Auslieferung ergänzt; akzeptierte Runtime/Archive bleiben unverändert.
Persönliche Modelliertests und Anwenderdateien bleiben außerhalb des gemeinsamen
Projektkontexts. Technischer nächster Ansatz aus Auswertungen: vorhandenes
CAD-faceSketch/confirmed-modelComparison wiederverwenden; vollständige geordnete
Mesh-Schnittkonturen und Kandidatenvergleich vorApply wären eigenständige,
noch nicht implementierte Erweiterungen. Keine globale Fehlergarantie aus
beidseitigen Oberflächenstichproben ableiten.

25.10.2026 – 0.92 KI-Rekonstruktionswerkzeuge im Quellcode: mesh/sectionContours misst explizite Original-Netzschnitte als vollständige geschlossene geordnete Loops samt parentIndex/role/frame, offengelegter Epsilonlage, konservativem 2D-Linien-/Bogen-/Kreisfitbound inklusive Sehnensagitta, optionalen Rohpunkten und gewöhnlicher V2-Skizze. Große Konturlisten werden atomar abgelehnt statt verschachtelt gekürzt; lokale Skripte können sie direkt nutzen. SDK1.2 model.section erhält alle Außenschleifen/Lochkonturen und verteilt große Gesamtschnitte auf native Skizzen/Boolesche; jede Einzelkontur <=128Elemente, keine automatische Merkmalsauslassung. start=dot(unitNormal,worldPoint), Rückgabe ist bereits Part. app/modelComparison akzeptiert den transienten Skriptentwurf vorApply, meldet beidseitige schlimmste gemessene Orte; surfaceDeviation-Ergebnischeck gegen geometrisch unveränderte bestätigte Referenz mit festem .01mm/5Grad-Vernetzungsziel und unveränderten Sollbedingungen in Korrekturen. Kein globaler Fehlerbeweis; Stichproben und unbekannte Dreiecke explizit. Vergleichsworker abbrechbar. Bisheriger Input-/Werkzeug-/Erfahrungskontext nicht gekürzt. Keine Kernel-, Genauigkeits-, Projektformat- oder Hintergrundsolveränderung. Anleitung docs/KI-REKONSTRUKTION.md. 667Kernprüfungen grün; SDK5, realerPythonWorker19, sieben neue tatsächliche Appprüfungen mit unabhängigem FreeCAD-Leser (analytisches Rohr, gültig/geschlossen/einSolid, symmetrische Differenz unter .002mm3). Portable separate Abnahme noch ausstehend. Persönliche Rekonstruktionsversuche und Providerdaten bleiben lokal außerhalb des gemeinsamen Kontextes.

0.92.0 portable separat abgenommen:667Core,19PythonWorker,SDK5,je155Source/EXE-UI(7Rekonstruktion/11Memory/22Python/91Ergebnis/24Shared),unabhängigePython- undSchnittleser,WASMbytegleich,88alteEXEASAR+historische.90Receiptsunverändert,Quellenarchive/Freeze/Sicht/Delivery geprüft. Quellen bleiben für nächsteÄnderung weiterentwickelbar.
0.92.1 behebt als weiteren Befund zustandsloser KI-Korrekturen den fehlenden vorherigen Programmkontext: bisherige rejectedBatch-Zusammenfassung ließcode/modules aus, folglich musste Anbieter neu konstruieren. rejectedPrograms gibt vollständige vorherige Python-/JavaScript-Programme samtModulen/Befehlsindex als untrustedReferenz zurück. GesammelterQuellenrahmen180kZeichen, übergroße/ungültigeProgramme explizit ausgelassen, keineTeilquellen. InterneProvider-Correctiongrenze256k statt12k, bisherigerGesamtinputrahmenunverändert. AnweisungbewahrtfunktionierendeGeometrieund verlangtvollständigeskorrigiertesJSON. KeineAusführungdurchFeedback,keinezusätzlichenBerechtigungen,ersteSollprüfungen/Sandbox/Undo/unveränderterUserkontexterhalten. ViergezielteTests einschließlich echterlokalerHTTP-Anfrageüber12k,Code/Moduleexakt,privateZusatzfelderausgeschlossen. Persönliche Provider-A/B-Versuche bleiben lokal.

25.10.2026 – 0.92.1 final separat ausgeliefert: F:/Formnaro-Ausgaben/KI-Rekonstruktionswerkzeuge-v0.92.1/Formnaro-win32-x64/Formnaro.exe. 671Core0Fehler/Skip/Cancel/Todo, frischerSDK5/PythonWorker19; Quelle UND tatsächlicheEXE je155gezielteUI(7Rekonstruktion/11Modellierkontext/22Python/91Ergebnis/24Shared). JeModus unabhängigePython-Beispiele und analytischeSchnittrekonstruktion durchFreeCADgeprüft, neueBoolsplit256Elemente mitLoch undatomaremUndo. Alle90geschütztenAltEXEASAR sowie historischeSDK/Worker-Belege inklusive0.92.0exakterhalten. DreiWASMPayloadsbytegleich. Quellen/Stage/ASAR/Runtimefreeze,Sourcearchive undNormal-/Mindestfenstersicht bestanden. Deliverye88c17b10d36caeab4d00f5462f5a75ba1df37633a1a70cc1751a7e3b424f63c. Frühere758UI/Performancekampagne nichtwiederholt, keineallgemeineTiming-/Tokenersparnis-/Rekonstruktionsgarantie. VollständigerKorrekturcodefunktionaltransportgeprüft; Modellqualität bleibt unabhängig zumessen. PersönlicheEvaluationsdetails separatlokal. DieseNotiz nachgefrorenerAuslieferung ergänzt; akzeptierteBinaries/Archivebleibenunverändert, alteFreezeauditsnichtgegenweiterentwickeltenRooterneutlaufenlassen.


## 0.93: Gemessene Python-Modellierhilfen

SDK1.3 ergänzt cylinder_between für explizite Weltstrecken mit symmetrischem Überstand und asynchrones Part.resize mit gemessenem Mittelpunkt im Elternrahmen; edit(size) bleibt an der unteren Ecke verankert. Beide verwenden vorhandene primitive/native Befehle, kein neues Rezept oder Dateiformat. Native Eulerrotationen benötigen das echte Three.Euler-Objekt mit öffentlichen x/y/z/order-Feldern. Skriptaufrufe übernehmen die vollständige aktualisierte Aliasabbildung nach nativen Gruppierungen, damit erhaltene Quellen über weitere Aufrufe adressierbar bleiben. Vollständiger bestehender Werkzeug-/Eingabe-/Erfahrungskontext bleibt erhalten. Details: KI-MODELLIERHILFEN.md. Persönliche Modellvergleiche sind nicht Teil dieses Dokuments.


0.93.1: Der bestehende Standard-Modellierkontext wurde vollständig als Präfix erhalten und um geprüfte Anker-/Frame-/Querschnitts-/Validierungsregeln ergänzt. Neue Helfer nur bei Angebot im aktuellen Werkzeugvertrag benutzen, damit ältere Programme kompatibel bleiben. Alle neuen deutschsprachigen Dokumentationsfragmente sind UTF-8. Die native Modellierlogik und SDK1.3 bleiben unverändert.


## 0.94: KI-Fehlervorschau

Berechenbare KI-Entwürfe bleiben nach fehlgeschlagenen oder nicht messbaren Ergebnisprüfungen zur bewussten Übernahme erhalten. Alle Prüfungen bleiben sichtbar; erfolgreiche Korrekturen behalten die ersten Sollwerte. Ein späterer Korrekturfehler verliert den vorherigen darstellbaren Entwurf nicht. Interne Ergebnisreports und explizite acceptFailedChecks-Zustimmung schützen die Übernahme; externe Vorschauen bleiben standardmäßig streng. Rot markiert gemessene abweichende Oberflächenstichproben, andernfalls das betroffene Teil. Markierungen verändern keine Modellfarben oder Geometrie. Abbruch, Stale-/Auswahlprüfung, Sperren, Undo und native Validierung bleiben erhalten. Details: KI-FEHLERVORSCHAU.md. Vollständiger bestehender KI-Kontext bleibt unverändert.


## Klarere STL-Anzeige (Quellstand, 25.10.2026)

Netz-Anzeigepuffer verwenden getrennte Dreiecksecken mit winkelbegrenzten
Normalen (35 Grad), statt scharfe Modellkanten pauschal weich zu mitteln.
Exakt gleiche Float32-Positionen verbinden STL-Naehte nur fuer die Schattierung.
Dezente tiefengepruefte Feature-Kanten zeigen offene Raender und scharfe
Uebergaenge, keine koplanaren Dreiecksdiagonalen. Lochkoerper und temporaere
Vorschauen erhalten keine zusaetzlichen Konturlinien. Linien folgen dem
Objekttransform und tragen die rootId fuer die Schnittvorschau.
Originalmesh, Dreiecksreihenfolge, Modellhistorie und Export bleiben erhalten;
Anzeigevergleich unterstuetzt expandierte Puffer und Wiederverwendung. Das
128-MB-Anzeigebudget beruecksichtigt Normalen, expandierte Positionen und
maximale Konturpuffer. Modul: src/mesh-display-geometry.js.
Portable Ausgabe 0.94.1: Klare STL-Konturen.

STL-Ansicht unter Einstellungen > Allgemein: Technisch Blau/Weiss, Matt Sand, Graphit. Gespeicherte Programmeinstellung meshDisplayStyle, Standard blue; alte Einstellungen erhalten diesen Standard. Stil wechselt nur Material und Kontur in der Ansicht; Originalfarben, Exporte, History, CAD-Koerper, Vorschau-/Diagnosefarben und mehrfarbige Flaechen bleiben erhalten.

Die Auswahl in 0.94.1 umfasst sechs Stile: Blau, Weiss, Sand, Graphit sowie Fusion-inspiriert und SolidWorks-inspiriert. Die beiden letzten sind eigene Annaeherungen an Schattiert-mit-Kanten, keine Originalrenderer. Sie wechseln zusaetzlich Szenenlicht und hellen Hintergrund; im dunklen Programmthema bleibt der dunkle Hintergrund erhalten.


25.10.2026 – 0.95.0: STL-Import mit expliziter KI-Auswahl automatisiert nun Einstellungen, komplette Regionenprüfung, lokale Konvertierung und native CAD-Vorschau. Zweiphasiger Vertrag (Settings, automatisch paginierte Regionen), numerische lokale Geometriezusammenfassungen statt Rohnetz; gemeinsame Profile/Tokenbudget und voller Modellierkontext. Toleranz darf nicht erhöht, Einheit/Schutz nicht geändert werden. Ein Korrekturversuch bei Plan-/Flächenfehlern und ein neuer Gesamtversuch bei Konvertierungsfehlern. Finale Projektübernahme bleibt explizit, manuelle KI-Flächenkorrektur separat verfügbar. Siehe docs/KI-STL-AUTOMATIK.md. Bestehende Fehlervorschau und sechs STL-Ansichtsstile bleiben erhalten.

25.10.2026 – 0.96.0 KI-Prüfwerkzeuge: Anbieter-Kontext dedupliziert identische requestSchema/commandSchema ohne Änderung der öffentlichen lokalen API; V3-Skizzenanleitung konsistent. UI-Messadapter reicht reportBudget weiter, Korrekturfeedback enthält alle fehlgeschlagenen Istbefunde. Native bore-Prüfung und cad/bore-Abfrage messen vollständige analytische zylindrische Innenflächen inkl Weltachse, Tiefe, Freiraum und kontinuierlichem Materialring; Grenzen explizit. Interner Chat erhält nach erfolgreicher numerischer Prüfung automatisch vier isoliert gerenderte Entwurfsansichten, bei Bildmodellen begrenzte Rückprüfung/Korrektur; keine automatische Übernahme, unveränderte Erstprüfungen und Revisions-/Auswahlbindung. Offene/nicht-mannigfaltige STL werden nicht durch bloßes Abschalten der Konverterreparatur akzeptabel; Werkzeugvertrag und Budgetablehnungsfeedback erläutern diese Voraussetzung. Siehe docs/KI-PRUEFWERKZEUGE.md.

Zusatz 0.96.0: Auch eine ausgefallene letzte Bildprüfung oder Korrektur behält den letzten berechenbaren Entwurf; Canvas, Chat und Werkstatt bieten „Mit Warnung übernehmen“. Numerische Fehler behalten rote gemessene Stellen/Teilmarkierungen und „Mit Fehlern übernehmen“. Abbruch und veraltete Revisionen werden weiterhin verworfen; ohne berechenbare Geometrie entsteht kein Ersatzkörper.


## 0.97 Lokale Spracheingabe
KI-Chat besitzt expliziten Recorder mit lokalem whisper.cpp/large-v3-turbo Q5_0, ohne Cloud-Speech/API-Key. Aufnahme maximal180s; Stoppen transkribiert in den bestehenden Entwurf, niemals automatisch senden. Abbruch/Chat-Schließen beendet Mikrofon; fester CLI-Aufruf, Runtimehashes, temporäre WAV/Text-Bereinigung und Mainframe-Audiozugriff. Portable Ressourcen separat unter resources/speech; Setupmanifest und MIT-Lizenzen im Repository. Details docs/SPRACHEINGABE.md. Abnahme mit synthetischem deutschem Audio durch echten MediaRecorder/IPC/Whisper geplant; physisches Mikrofon separat zu erproben.


## 0.98 ChatGPT-Abo-Anmeldung
Offizielle OAuth-Anbindung fuer lokal betriebene Apps (SIWC dynamic_agent_client), getrennt von API-Schluesseln. PKCE/State/Nonce, signierte ID-Token, Windows-verschluesselte Sitzungen, rotierende Refresh-Token und Kontoauswahl. Offizieller Responses-SSE-Transport, nur abgeschlossene Antworten, kontobezogene Modellliste; bestehende lokale CAD-Pruefung unveraendert. API-Kompatibilitaetsfelder fuer aeltere Releases erhalten. Whisper bleibt lokal; Abo-Route unterstuetzt keine Transkription. Siehe docs/CHATGPT-ANMELDUNG.md, insbesondere echte Konto-Freischaltung separat von synthetischen Tests.


0.98.1: ChatGPT/OpenAI-Denkaufwand in Chat und Einstellungen, kontobezogene Modellfähigkeiten plus konservative dokumentierte Fallbacks; eigener openAIReasoningEffort=auto erhält bisherigen Providerstandard bei Migration. Explizite Auswahl wird übertragen und im Anfragekonfigurationsvergleich gebunden. Modellwechsel setzt automatisch zurück. SSE-Empfänger akzeptiert fehlenden MIME-Header und abgeschlossene output_item.done bei leerem terminalem output; kein Erfolg ohne response.completed. Beide Fälle live am offiziellen Abo-Endpunkt reproduziert. Tests für Transport, Persistenz und reale UI/IPC-Auswahl ergänzt.


26.10.2026 – 0.98.2: Anbieterbezogenes Modelliergedächtnis über backend/ai-provider-memory.cjs, stabile getrennte Ordner für ChatGPT-Abo, OpenAI-API, DeepSeek und benutzerdefinierte Origins. Alte gemeinsame Dateien bleiben unverändert; historische persönliche DeepSeek-Notizen und eindeutig DeepSeek zuordenbare Journaleinträge werden einmalig kopiert. Neue Anbieter erhalten ausschließlich die allgemeine Vorlage. Desktop-Generierung pinnt den Kontext an die ausgewählte Konfiguration. Chat speichert Verlauf/Bilder/Entwurf/Verbrauch innerhalb der Sitzung je Provider, Modellwechsel beim selben Provider erhält Verlauf. Wechsel aus Einstellungen und Modellkatalogfehler dürfen keinen fremden Verlauf senden. Unit-Isolation und tatsächliche IPC/UI-Request-Prüfungen hinzugefügt.

## 0.99 Solid-Modus
Dritter Bedienmodus solid neben easy/normal. cad-solid-state/ui/css verschieben die echten Werkzeuge und Managerinhalte nur zur Anzeige; Marker stellen Originalparent/IDs/Handler und gespeicherte Layouts beim Verlassen wieder her. Register, klassische Menues, linker Modellbaum/Eigenschaften/Operationen, Grundkoerper/Dokument und bei Bedarf KI-Taskpane. Native CAD-Neuanlage im Solid-Modus laesst die Normal-Creationeinstellung erhalten. Portable Solidoptionen mit eigenem Store/Datei; optional Mittelmausrotation, Strg-Pan, Umschalt-Zoom und S/Space/Strg1-7, keine Uebernahme von Texteingaben/Bearbeitungen. Linearer Schnitt verwendet bestehenden revidierten Flaechenskizzenweg mit explizitem initial mode=cut, Standard weiter add. Keine Projektformat-/Kernel-/Dateileser-Erweiterung. Anleitung docs/SOLID-MODUS.md. Eigener --verify-solid und gezielte bestehende Regression; konkrete portable Abnahme in der Ausgabe.


0.99 Rechtsklick-Erweiterung: cad-context-menu-state/menu/css, eigener portabler Store offlinecad-context-menu-v1/rechtsklick-menues.json. Drei unabhaengige validierte Befehlslisten (max32) plus aktivierte Funktions-Plugin-Referenzen; keine freie Codeausfuehrung. Solid-Kontextleiste, native angeklickte Flaeche fuer Skizze/Schnitt, Root-/Quellenauswahl und Multiselektionsschutz; Sperren und vorhandene Befehls-/Vorschau-/Revisionsguards. Rechte Ziehgeste dreht unveraendert, Eingaben/Palette bleiben eigene Kontextbereiche. Rechtsklick bei aktiven Operationen erlaubt Cancel/validierte Apply-Buttons. Kontext wird bei Revision/Auswahl/Modus/Resize geschlossen. Einstellungen > Rechtsklick ordnet/fuegt hinzu/entfernt/resetjeModus; deaktivierte Plugins nie ausfuehrbar. Eigener isolierter --verify-context-menu prueft reale Maus, native Flaeche/Verrundung/Undo, Plugins, Persistenz und bestehende Favoriten.



26.10.2026 – FreeCAD-Erweiterung in Entwicklung: Desktop-Prozessadapter mit statischem Datenplan-Interpreter, Part-/Sketcher-Konstruktion, unveränderten STEP/STL-Eingängen und gespeicherter FCStd-/Planquelle. Vorschau und Undo laufen weiter durch den nativen Formnaro-Controller. KI erhält ein einstellbares Gesamtbudget (Standard24,7–80) für wiederholte Messungen/Korrekturen/Bildprüfung. Unabhängiger FreeCAD-STEP-Check und Beibehaltung besser geprüfter Entwürfe; Details docs/FREECAD-KI.md. Noch keine Auslieferungsabnahme an dieser Stelle.

26.10.2026 – Gemeinsame Ausgabe0.100.0: FreeCAD-/KI-Erweiterung gemeinsam mit Solid-Oberfläche und anpassbarem Rechtsklick abgenommen.82 gezielte Tests und332 Gruppen an der tatsächlichen EXE einschließlich Skizzen und Spracheingabe bestanden. Reale GPT-6.1-Sol/high-Erprobung am eigenen synthetischen STL-Prüfkörper und erneutes Abspielen des erzeugten Programms in der finalen EXE erfolgreich; Maßhaltigkeit und Exportgültigkeit getrennt geprüft. FreeCAD bleibt eine lokal installierte zusätzliche Engine, keine Weitergabe seiner Binaries. Version im isolierten Release-Freeze gesetzt; parallele UI-Entwicklungsmetadaten im gemeinsamen Arbeitsbaum bleiben zur Abstimmung erhalten.


## 0.101 Fusion-Modus
Vierter Bedienmodus `fusion` neben `easy`, `normal` und `solid`, sichtbar als Fusion 360. Eigene cad-fusion-state/ui/css mit Designregistern Volumenkoerper/Skizze/Netz/Werkzeuge, aufklappbaren Werkzeuggruppen, linkem Browser und rechter Eigenschaften-/Operationspalette. Echte vorhandene Kontrollelemente werden mit Markern umgedockt und beim Verlassen wiederhergestellt; Modell, Undo und gespeichertes Layout bleiben unveraendert. Untere Quellenleiste zeigt die erhaltene Konstruktion in Abhaengigkeitsreihenfolge und waehlt echte Root-/Quellenziele, keine neue chronologische Timeline oder Feature-Neuordnung. Navigation Mittelmaus-Pan/Umschalt-Mittelmaus-Orbit, S-Werkzeugsuche und E/F/H/M/I/J auf bestehende Befehle, Eingaben/Bearbeitungen behalten Tastaturhoheit. Eigener portabler Store offlinecad-fusion-settings-v1/fusion-einstellungen.json mit Navigation/Tasten/Startregister. Fusion legt native CAD-Grundkoerper an, ohne die Normalpraeferenz zu ueberschreiben. Rechtsklick besitzt vierten eigenen Modus, Drei-Modus-Alteinstellungen werden ohne Schreibzwang und ohne Verlust der bisherigen Listen ergaenzt. Keine Projektformat-/Kernel-/Fusion-Dateileser-Erweiterung. Anleitung docs/FUSION-MODUS.md; eigener --verify-fusion plus bestehende Solid/Rechtsklick/Workbench/Skizzen/KI/FreeCAD/Sprache-Regressionspruefungen. Bisherige gemeinsame0.100-Ausgabe bleibt Basis und geschuetzt; konkrete neue Portable-Abnahme im Ausgabeverzeichnis.

26.10.2026 – Fusion0.101.0 als eigene portable Windows-Ausgabe abgenommen:134 gezielte Tests und366 Gruppen an der tatsächlichen EXE einschließlich34 Fusion-,29 Solid-,27 Rechtsklick-,14 Workbench-,103 Skizzen-,146 KI/FreeCAD- und13 Sprachprüfungen. Alle ohne Rendererfehler oder externe Anfragen. Die endgültige Dateiprüfung bestätigt festgeschriebene Quellen, Stage/ASAR, Laufzeitdateien und116 unveränderte bisherige Programmdateien. Fünf tatsächliche EXE-Ansichten visuell geprüft; Abnahme/Freigabe und Vorschau liegen neben der neuen Ausgabe. Eine fehlende synthetische Sprachtestdatei im neuen Pakethelfer wurde ergänzt; derselbe unveränderte Programmstand bestand danach den vollständigen Sprachtest. Nutzerprofile und Modelle bleiben unberührt.

## 0.102 Lokale KI-Arbeitsumgebung (in Abnahme)
Anbieterunabhaengige Python/JavaScript-Analyseprogramme mit Originalmodelldaten, lokalen Messdateien und persistenter SHA-versionierter Werkzeugbibliothek. Wissenschaftliche Python-Wheels inklusive Abhaengigkeiten sind offline eingebunden und durch SHA geprueft; NumPy/SciPy/Shapely/Trimesh/SymPy/NetworkX/Matplotlib. Ausfuehrung verbleibt in opaque Sandboxworkern ohne Hostdatei-/OS-/Netzwerkrechte. Reine Analysen koennen keine Modellbefehle ausfuehren; Konstruktionen bleiben atomare native/FreeCAD-Vorschauen mit Apply und Undo. Ein Konverter-Topologiefehler blockiert gezielt denselben Weg pro Auftrag; die KI kann den beauftragten gemessenen CAD-Neuaufbau fortsetzen, ohne Sollpruefungen zu lockern. Vollstaendige lokale Skripte werden vor Ausfuehrung als ungepruefte Referenzquellen archiviert; allgemeine Helfer koennen gesucht, gelesen, wiederverwendet und in der Werkstatt exportiert werden. Modellierhinweise bleiben vollstaendig, Provider-Kontexte/Anmeldungen getrennt, Werkzeugbibliothek gemeinsam. GPT-Tokenanzeige bietet einen datierten API-Gegenwert im Standardtarif mit Cache-/Langkontextberuecksichtigung je Anfrage und ausdruecklicher Abgrenzung zur Abo-Abrechnung; unbekannte Angaben bleiben unbekannt. Details docs/KI-ARBEITSUMGEBUNG.md. Personenmodelle und Laufdaten verbleiben lokal. Portable-Abnahme folgt separat; accepted0.101 bleibt unveraendert.


26.10.2026 – 0.102.0 freigegeben: eigener eingefrorener Release-Stand,178 gezielte Tests und392 Gruppen an der echten Windows-EXE bestanden, jeweils ohne Rendererfehler oder externe Netzwerkanfragen. Zusaetzliche24 Gruppen in einem zweiten Prozess bestaetigen gespeicherte Helfer und bytegleiche Erhaltung aller bisherigen elf Test-Werkzeugversionen. Gleiche Wissenschafts-/Modellierwerkzeuge fuer GPT und DeepSeek ueber simulierte Anbieterantworten durch den tatsaechlichen Chat-/Desktop-/Sandbox-/CAD-Ablauf geprueft. API-Gegenwert am realen UI-Transport und Abo-Kennzeichnung separat rechnerisch geprueft; kein neuer persoenlicher STL-Genauigkeitsnachweis.118 bisherige EXE/ASAR-Dateien unveraendert, Source/Stage/ASAR/Runtime-Pruefungen bestanden. Freigabedetails im neuen Ausgabeverzeichnis. Nachtraegliche Kontextnotizen gehoeren nicht zum eingefrorenen Release-Quellmanifest.


26.10.2026 – GitHub-Aktualisierung auf0.102.0: gesamter bisher lokal weiterentwickelter Quellstand seit0.55.0 einschliesslich Mini Mesh0.9.0/Mini CAD0.4.0, Tests, Dokumentation, Runtime-Provenienz und Lizenzen wird gemeinsam synchronisiert. README zeigt den aktuellen Hauptstand und trennt historische Downloads. Lokale Entwicklungshistorie, persoenliche Daten und temporaere PDF-Vorschaubilder bleiben ignoriert. Fuer den Windows-Download werden ausschliesslich die Datei-Eintraege der geprueften0.102-Laufzeit verwendet; nachtraeglich entstandene Nutzerdaten im Programmordner gehoeren nicht ins Archiv. Der Produktquellcode stimmt mit dem geprueften Release-Freeze ueberein; anschliessende Aenderungen betreffen Dokumentation und Git-Verwaltung.



26.10.2026 – 0.103.0: Große erfolgreiche Python-/JavaScript-Messausgaben und nicht paginierbare atomare Geometrieberichte bleiben vollständig in Auftragsdateien; die KI erhält workspaceResult.path mit Struktur-/Größenhinweis statt einer weiteren Fehler-/Messrunde. Erfolgreicher Code wird über results[].program.path referenziert, fehlgeschlagener Code bleibt vollständig im Korrekturbeleg. Eine erfolgreiche Messrunde löscht erledigte Korrekturrückmeldungen. FreeCAD-Fehler behalten kompakte Eingabe-/Operandenprüfungen auch bei großen Topologieberichten; das Limit nennt den letzten konkreten Fehler. Hinweise zu Schnitten auf beiden Seiten einer Materialstufe und zur unveränderten abschließenden Oberflächenprüfung ergänzt. Frozen182Tests und395Gruppen an der tatsächlichen EXE bestanden, darunter drei neue große-Messbericht-Gruppen in der echten isolierten Python-Laufzeit; zwei weitere Regressionstests separat bestanden. Alle120 bisherigen EXE-/ASAR-Dateien unverändert. Kein neuer autonomer Cloud-Modelllauf als Qualitätsbeweis; persönliche Modelle und deren Prüfartefakte bleiben lokal.

## Vollständige native FreeCAD-Python-Werkzeuge (26.10.2026)

Neben den kompatiblen Datenplänen unterstützt die Desktop-KI eigene FreeCAD-Python-Skripte (`programTools.freecadPython`, `operation.script`). Die installierte API wird ohne Funktions- oder AST-Whitelist benutzt; ein Windows-AppContainer mit eigener Arbeitskopie und Job-Prozessbaum verhindert Zugriff auf fremde Nutzerdaten und Netzwerk. `gui:true` nutzt eine eigene unsichtbare FreeCAD-GUI für GUI-abhängige Module. Native API-Erkundung, Flächenvernähen, exakte Punktklassifikation und echte parametrische Dokumentabhängigkeiten sind erreichbar. Die Numerik-Python-Laufzeit bleibt ein separater Interpreter.

Vollständige Skripte/Helfer werden vor Ausführung in der gemeinsamen Werkzeugbibliothek archiviert. Quellen/Parameter und FCStd bleiben am CAD-Ergebnis erhalten; die Szenenübersicht enthält nur einen kompakten Quellhinweis. Große native Messberichte bleiben vollständig in auftragslokalen Dateien. Ergebnisse durchlaufen Geometrieprüfung, STEP-Readback und normale Vorschau/Apply/Undo. Details: `docs/FREECAD-KI.md`; Backend: `backend/freecad-python.cjs`, `freecad-python-worker.py`, `freecad-container.cs`, `formnaro_freecad.py`. Diese Notiz beschreibt die Implementierung; die konkrete Portable-Abnahme wird separat dokumentiert.


26.10.2026 – Sicherheitsupdate0.103.1 auf freigegebener0.103-Funktionalitaet: Electron44.9.3 in Hauptprogramm/Minis, Undici7.30.1, Pillow13 und setuptools84.2.1 in tatsaechlichem nativen Konverter UND Python-WASM. Neues Pillow-WASM aus SHA-gepinnten offiziellen Quellen mit LibWebP1.6/LibTIFF4.7.2; Buildrezepte/Lizenzen und Rollback-Schutz gegen alte Wheels enthalten. Vorher48DependabotEintraege/5kritisch; NPM-Audits aller3Projekte0 und pip-audit68nativePakete0. Neuer separater Konverter mit vollstaendigem synthetischem Beispielbestand, Engine-Pythonmodule/Bridge unveraendert.199FrozenTests und471Gruppen an echterHauptEXE sowie MiniMesh117/MiniCAD123Source+EXEGruppen bestanden;beideMinisElectron44.9.3/Node24.22direktbelegt.122alteHaupt-EXE/ASARunveraendert. Parallele nochunabgenommene FreeCAD-Erweiterungen gezielt ausserhalb diesesSecurity-Releases gehalten. GitHub-Warnungszustand wird nach dem Push frisch geprueft; keineDismissals.


26.10.2026 – Abschluss Sicherheitsupdate 0.103.1: GitHub meldet nach dem Push 0 offene Dependabot-Warnungen. Alle 48 vorherigen Eintraege sind als fixed markiert; 0 Dismissals. Die drei npm-Audits sowie pip-audit fuer 68 native Python-Pakete enthalten 0 bekannte Funde. Quellstand a321f7c und Tag v0.103.1 identifizieren die abgenommene Auslieferung. Download-Pakete, Pruefbericht und SHA-256-Liste gehoeren zum Release.

Die separate Portable-Ausgabe **0.104.0-r4** mit vollständiger FreeCAD-Python-API wurde abgenommen: 196 Kernprüfungen und 411 Prüfgruppen an der tatsächlichen EXE, einschließlich nativer Python-/GUI-Ausführung, parametrischer Dokumentpersistenz, Werkzeugarchivierung sowie GPT-/DeepSeek-Transport mit simulierten Antworten. Der native Starthelfer wird getrennt vom beschreibbaren Modellarbeitsordner kompiliert und geschützt. Ausgeführter Code kann ihn nicht für spätere Host-Aufrufe ersetzen. Geprüfte frühere Ausgaben bleiben erhalten. Details der lokalen Abnahme liegen außerhalb von Git; keine persönlichen Modelle oder Profile werden verteilt.

0.104.1: Auftragslokale kumulative Fehlerbelege in `context.taskEvidence`, unabhängig
vom jeweils letzten Korrekturtext. Erfolgreiche Messungen/Formatfehler löschen keine
früheren abgelehnten Werkzeugwege. Wiederholungen aggregiert, alle bis zu 80 Runden
in begrenzter Zusammenfassung erhalten, Reset pro Auftrag/Revision; volle letzte
native Analyseskripte als untrusted Referenz. Interne Anfragen normalisieren den
Schemaalias schon vor IPC; öffentliche API kompatibel. Backend-Provider hatte diese
Dopplung bereits vor 0.104.1 entfernt: lokale IPC-Größe allein beweist keine doppelte
API-Abrechnung. Regressionsbelege umfassen echte Chat-/Responses-Payloads und
Fehler→Messung→JSON-Fehler→native Vorschau über beide Provider. Konkrete Portable-
und Cloud-Abnahmen werden separat geführt, keine persönlichen Modellquellen hier.

0.104.2: Verbrauchsstatistik und lokale Kontextgrößen unter Einstellungen > KI/API.
Backend `ai-usage-ledger.cjs` speichert ausschließlich atomare Tagesaggregate nach
Anbieter/Modell/Authart/Auftragskategorie in der portablen Datei KI-Verbrauch.json.
Alle Korrekturaufrufe zählen, ein UI-Auftrag behält eine nicht an den Provider
gesendete Statistikkennung. Fehlende Nutzungszahlen/Preise bleiben erkennbar;
API-Kosten und Abo-API-Gegenwert werden getrennt dargestellt. Keine Prompts,
Geometrie oder Zugangsdaten in dieser Statistik. Ein Statistikfehler blockiert
keine KI-Antwort. Die Kategorien sind eine automatische Auftragszuordnung, keine
exakte Zerlegung eines einzelnen Requests in Arbeitsschritte.

`ai-context-metrics.cjs` liest beim Appstart lokal die kompakten Kontextbausteine
und bekannte Kontextdateien. Die UI unterscheidet physischen Dateitext von den
tatsächlich geladenen Komponenten; Schätzung Zeichen/4 plus Eingabepreis ohne
Cache, Szene/Auftrag/Verlauf/Bilder/Laufberichte zusätzlich. Neue schreibfreie IPCs
für Statistik und Größen, UI `cad-ai-meter.js/css`; keine Cloudanfrage zur Messung.
Die bestehende Modellierpipeline und Sicherheitsgrenzen bleiben erhalten.

0.104.2 als separate portable Ausgabe abgenommen: 212 Kernprüfungen und 461
Prüfgruppen an der tatsächlichen EXE, darunter 32 für Auftragsfehlerhistorie und
18 für Verbrauch/Kontextanzeige. Keine Rendererfehler oder externen Anfragen in
diesen Prüfungen; Anbieterantworten simuliert. Alle 130 geschützten früheren
EXE/ASAR-Dateien unverändert. Helle und dunkle Anzeige sowie kleinere Fenster
visuell geprüft; die dunkle Darstellung anhand des nach dem Themewechsel bereits
neu gezeichneten kleinen Fensters bestätigt. Persönliche Rekonstruktionsversuche
und deren Kosten-/Genauigkeitsberichte bleiben getrennt von dieser Freigabe.
# Programm-Assistent (0.105.0, in Entwicklung)

Der interne KI-Chat unterstützt zusätzlich lokale Hilfesuche, benannte UI-Ziele,
sichtbare Bedienfolgen und kumulative Modellvorführungen. Werkzeugkatalog und
aktueller UI-Zustand gelten für Easy/Normal/Solid/Fusion; lazy Register werden
gezielt geöffnet. Großer Zeiger, blauer Rahmen, Pause/Tempo/Stop und Esc zeigen
die Aktionen. Modellvorführungen bleiben gewöhnliche geprüfte Vorschauen bis
Nutzer-Apply; ein Undo für den gesamten Batch. Programmfragen erhalten einen
vorhandenen Entwurf und den lokalen Task-Arbeitsbereich. Neue Notiz-IPC hängt
höchstens 2000 Zeichen an die feste Kontextdatei des aktiven Anbieters an, mit
Hash-/Größen-/Redaktionsprüfung. Keine freien Dateipfade, OS-Eingaben oder
beliebigen DOM-Selektoren. Details in `docs/PROGRAMM-ASSISTENT.md`.


## Freigabe Programm-Assistent 0.105.0

222 Kernprüfungen und 513 Prüfgruppen an der tatsächlichen EXE
bestanden, davon 52 für den neuen Assistenten. Alle vier Bedienmodi,
Dialoge, Pause/Stop/Esc/eigener Klick, Kontextnotizgrenzen, dunkle
Darstellung, schnelles Zeigertempo, normale CAD-Vorschau/Apply/ein Undo und
Erhalt vorhandener Vorschläge geprüft. Programmfragen funktionieren im Chat
und in der großen KI-Werkstatt. Anbieterantworten der Abnahme simuliert,
keine neuen Cloud-Inferenzkosten. 132 geschützte frühere EXE/ASAR-Dateien
unverändert; persönliche Modelle und Profile gehören nicht zur Ausgabe.

## Foto-Assistent 0.106.0

Interner KI-Chat bindet frontale Fotoreferenzen per SHA-256 an den aktuellen
Bildanhang und dessen aufrechte Originalabmessungen. Eigener Bilddialog mit
Pixelraster/Zoom, Maus- und numerischer Punktwahl, getrennten editierbaren
Punktgruppen, Referenzmaß/Herkunft/geschätzter Unsicherheit, Bildmaßen,
Nutzervorgaben/Annahmen, Außenkontur und nicht überlappenden inneren Öffnungen.
Abbruch erhält die bisherigen Referenzdaten und verändert kein Modell.

Interne photo/measure- und photo/grid-Analysen lesen ausschließlich aktuelle
Fotodaten. Zusätzliche Raster/Ausschnitte beachten vorhandene Bildbudgets, ohne
Originale oder Verlauf zu verdrängen; ausgelassene Zusatzbilder werden genannt.
Kalibrierter orthografischer Rastervergleich projiziert ausschließlich neue oder
geänderte sichtbare Materialroots aus der unveränderten Kandidatenvorschau.
IoU bei echtem Maßstab, separat normierte Formdiagnose, Außenmaßabweichungen,
Öffnungsüberdeckung und Rot/Blau/Grün-Overlay gelangen in die bestehende
Korrekturschleife. Referenzen und native Sollchecks bleiben fest; bessere
Kandidaten erhalten Vorrang. Fotoähnlichkeit bleibt eine begrenzte Zusatzprüfung,
keine native Körper-/Maß-/Tiefen-/Passungsgarantie. Eigener Berichtsbetrachter mit
JSON-Export der Werte/Herkunft/Annahmen/Originalpunkte ohne Bildbytes.

Neue cad-photo-data/images/ui/task/preview-Module, Integration in bestehende
Chat-/Request-/Automationszugänge; externen Modellierzugängen werden keine
freien Bildpfade eröffnet. Kein neues Projektformat, keine zusätzliche Runtime
oder Cloud-Abhängigkeit. Eigenständige Implementierung, inspiriert durch
mfranzon/print3d (292ce13366155915ed7be4b4eec5a7ea570e3eb9); keine Übernahme
fremder Fotobeispiele. Perspektivische Entzerrung und allgemeine Mehrbild-
rekonstruktion sind nicht Bestandteil dieses ersten Ausbaus. Anleitung
FOTO-ASSISTENT.md. Konkrete Portable-Abnahme wird gesondert dokumentiert.


26.10.2026 – Foto-Assistent 0.106.0 separat freigegeben: 232 Kernprüfungen und
567 Prüfgruppen an der tatsächlichen Windows-EXE bestanden, einschließlich
54 Foto-Prüfgruppen. Beide Anbieterprotokolle verwenden in der Abnahme simulierte
Antworten; Messrunde, absichtlich falsche Breite, Korrektur bei unveränderter
Referenz/Sollprüfungen, native Geometrie, Apply und ein Undo geprüft. Keine neue
allgemeine Cloud-Fotorekonstruktions-Genauigkeitsbehauptung. Die Anzeige verwendet
für zuverlässige Fenstergrößenwechsel ein Bild mit getrennten SVG-Markierungen;
kleine und wieder vergrößerte Ansichten wurden anhand tatsächlicher Screenshot-
Bildpunkte und visuell geprüft. Alle 134 geschützten früheren EXE-/ASAR-Dateien
unverändert; Quellen/Stage/ASAR/Laufzeit und neue Vorschauabbildungen geprüft.
Persönliche Fotos, Modelle und Profile sind nicht Bestandteil der Auslieferung.


26.10.2026 – Neuer Ausbauplan 0–10 in docs/AUSBAUPLAN-AB-0.106.md, historische
Pläne zugeordnet; die gestrichene Druckprüfung bleibt gestrichen. Paket 0 besitzt
nun echte synthetische OCCT-Bohrplatten und STEP-Baugruppe mit analytischen
Sollwerten, offene Netzprobe und Fotos. scripts/expansion-baseline.mjs erzeugt
Modelle, SHA-Manifest sowie lokale Laufzeit-/Speicherstichproben. Speicherwerte
sind keine Peaks. Paket 1 für 0.107 in Abnahme: persistente Originalfotos mit
SHA-256, Vierpunkt-Rechteckhomographie, rückführbare Originalpunkte, bilineare
Ebenenansicht, lokale bestätigungspflichtige konvexe Kantenvorschläge. Projektformat
19 nur bei Fotos, alte Versionen lesbar; .ocad/.fnpack/Autosave erhalten Bilddaten.
Gemeinsamer Fotozugang auch ohne Chat. Kein allgemeiner Mehrbildrekonstruktor.

26.10.2026 – Formnaro 0.107.0-r3 freigegeben: 276 eingefrorene Tests und 664
Prüfgruppen an der echten Windows-EXE, davon Projektfoto-/Perspektivoberfläche31,
frontaler Foto-KI-Ablauf56 und schräger Ablauf64. 16 simulierte Anbieteraufrufe
mit vier tatsächlich erreichten finalen Bildprüfrunden, keine externen Testaufrufe.
Alle 136 geschützten älteren EXE-/ASAR-Dateien unverändert; Source/Stage/ASAR/Runtime
entsprechen sich. Rückgängig/Redo, .ocad/.fnpack/Autosave, vier Bedienmodi, direkter
Fotoimport, kleine/dunkle/entzerrte Ansichten und Overlays geprüft. Der Vergleich
rastert Vektorkonturen unabhängig von Pixel-/Millimetereinheiten auf ein begrenztes
Raster; dadurch keine groben Alias-Fehlwarnungen bei korrekt entzerrten Konturen.
Die Bildrasterung beweist keine zusätzliche fotografische Auflösung. Paket 0 und
1 abgenommen, Paket 2–10 offen. Keine allgemeine Mehrbildrekonstruktion enthalten.


26.10.2026 – Paket 2 für 0.108 in Abnahme: versionierte Foto-Ansichtssätze mit
Originalreferenz-Digests, gemeinsamen Originalpixel-Nullpunkten und XYZ-Zielmaßen.
Drei v2-Skizzenprofile bilden eine native Schnittmenge; drei neue Projektparameter
binden neun Variablen. Typed CAD-Herkunft und Foto-Sätze verwenden Format 20,
reine Fotos bleiben 19. Vergleichsfunktion unterstützt explizite Registrierung
am gemeinsamen Nullpunkt; Einzelbildverhalten bleibt erhalten. Private
Controller-Prüfbelege sperren ungeprüfte Übernahme unabhängig vom öffentlichen
Berichtsobjekt. Native Außenmaße, einzelner Körper und optionale Korridor-/Bohrungs-
prüfungen bleiben von Bildunsicherheit getrennt. Read-only Nachprüfung verlangt
aktuelle Parameterbindungen. Quelleinheiten mit bekanntem L-Profil und rechteckigem
Durchgang prüfen exaktes Volumen, XYZ-Parameteränderung, STEP, Undo und gesperrtes
unbeteiligtes Teil. Keine Behauptung unbekannter Innengeometrie aus Silhouetten.

26.10.2026 – 0.108.0-r3 abgenommen: 285 eingefrorene Tests,
738 actual-EXE-Prüfgruppen, davon je 37 gerade/schräge Mehransichtenfälle.
Gemeinsame Registrierung, native Funktionsprüfungen, 4-mm-Durchgang positiv und
6-mm-/falsche Bohrung negativ, drei editierbare Profile, XYZ-Parameteränderung,
STEP, .ocad/.fnpack, Berichtexport ohne Bilder, geänderte Referenzen, Satzentfernung
und exaktes Undo geprüft. Kleine/dunkle Fenster und tatsächliche Screenshots
geprüft. 138 ältere EXE-/ASAR-Dateien unverändert, Source/Stage/ASAR/Runtime
identisch, keine externen Testanfragen. Paket 2 abgenommen, 3–10 offen.


26.10.2026 – Paket 3 in Arbeit, noch keine Freigabe: neue reine Merkmalsbezugsdaten
und native Read-only-Abfrage featureReference. Flächen/Kanten sind durch vollständige
native Domänen-SHA und geprüfte Anker gebunden; Flächennummern bleiben transient.
Quellen-/Skizzenbezüge vergleichen tatsächliche BRep-/Rezeptdaten und Weltframe,
bleiben bei unveränderten Geschwisterquellen erhalten. Bohrungszuordnung prüft
native Zylinderachse und Durchmesser plus getrimmten Flächenanker, liefert alle
mehrdeutigen Quellen. Kein nächstgelegenes Merkmal wird stillschweigend gewählt.
Interner Worker-Auftrag featureEdits verarbeitet lokale Bezugs-IDs und skalare
Felder. Bohrungsdurchmesser baut das Zylinderrezept analytisch neu auf; Achse und
Tiefe bleiben. Gehäusewand, Skizzenvariable, Flächenversatz und Kantenrundung nutzen
vorhandene Konstruktion, Preview/Apply/Undo und getrennte native Nachprüfung.
Zu diesem ersten Zwischenstand wurden Parameter-/Konturabhängigkeiten noch
abgelehnt; der unten dokumentierte skalare Folgepfad ergänzt sie inzwischen.
Die vollständige Portable-Abnahme ist noch offen.

26.10.2026 – Paket-3-Quellstand erweitert, weiterhin nicht freigegeben:
Merkmalsbezüge werden bedarfsgerecht in Projektformat 21 gespeichert; alte
Formate bleiben unverändert. .ocad, indexiertes .fnpack, Wiederherstellung und
ein Metadaten-Undo sind geprüft; Teilevorlagen kopieren keine Projektbezüge.
Der Merkmalsmanager bietet native Flächen-/Kanten-/Bohrungsklicks sowie erhaltene
Quellen und Skizzen, eigenes Benennen, Speichern, Zuordnen und Chat-Anhänge.
Chat und Modell heben den gewählten Bezug gemeinsam hervor. Neu zugeordnete
Bezugs-IDs dürfen alte Chat-Anhänge nicht stillschweigend umlenken.
Lokale feature-Befehle erlauben ausschließlich angehängte IDs und numerische
Felder; generische Lösch-/Ersatzbefehle werden vor der Konstruktion abgefangen.
Der Vorschlag zeigt native Durchmesserprüfung und Erhalt unabhängiger Quellen.
Der strukturierte Modellierjournal-Vertrag kennt das neue Werkzeug.
41 fokussierte Tests bestanden. Der tatsächliche Electron-Quelllauf besteht
34 Prüfgruppen, einschließlich beider simulierten Anbieterprotokolle mit je
zwei abgewiesenen Bereichsverletzungen, nativem 4→6-mm-Ergebnis, erhaltener
zweiter 4-mm-Bohrung, exaktem Undo, allen fünf Bezugsarten und allen vier
Bedienmodi. Zwei echte Bildprüfrunden im simulierten Ablauf, keine Cloud-
oder externen Testanfragen, keine Rendererfehler. Kleine/dunkle Oberfläche
und native Prüfberichtsanzeige anhand tatsächlicher Screenshots geprüft.
Paket 3 bleibt in Arbeit; der nachfolgende Stand ergänzt skalare Abhängigkeiten.

26.10.2026 – Skalare KI-Merkmalsänderungen erhalten nun ihre notwendigen
Projektparameter-, Kontur- und Zeichnungsabhängigkeiten. Der lokale Plan nutzt
den vorhandenen Abhängigkeitsgraphen; die KI kann keine zusätzlichen Zieladressen
angeben. Eindeutige affine Formeln werden über ihren freien Eingang geändert,
Formeln und Bindungen bleiben erhalten. Mehrere mögliche Eingänge, nichtlineare
Umkehrungen und widersprüchliche Zielmaße werden diagnostiziert. Aktive Varianten
erhalten bei Bedarf einen eigenen Wert; Basis und andere Varianten bleiben.
Symmetrische Zylindermaße werden analytisch aufgebaut, einschließlich anderer
Bohrungsquellen mit demselben Parameter. Parameter, Konturketten und CSG-Vorfahren
teilen einen gesammelten Aufbau; betroffene Quellen werden höchstens einmal
konstruiert. Unbeteiligte, bereits veraltete Zweige behalten Quellen und Belege.
Nur betroffene Zeichnungsansichten werden aktualisiert; native Bemaßungsbezüge
folgen anhand ihrer erhaltenen Rollen. Ein neu ungültiger Gelenkrahmen verlangt
bewusste Neuzuordnung, statt unbeteiligte Teile stillschweigend zu verschieben.
Der Vorschlag listet die Folgeänderungen. Ein privater Übernahmebeleg verlangt
deren ausdrückliche Bestätigung, unabhängig vom veränderbaren Anzeigebericht.
Chat und Werkstatt verwenden „Mit Folgeänderungen übernehmen“. Im begrenzten
KI-Auftrag können Programmnotizen, Bedienhilfen, Vorführungen oder freie Python-
Vorschauen diese Begrenzung nicht umgehen; lokale Hilfesuche bleibt lesend.
72 gezielte Tests und 39 tatsächliche Electron-Prüfgruppen bestanden, keine
Rendererfehler oder externen/Cloud-Testanfragen. Gemeinsame 4→6-mm-Bohrungen,
Formel-/Variantenbindung, zwei Konturgenerationen, 20→30-mm-Zeichnungsbemaßung,
unbeteiligte veraltete Ansichten desselben Blatts, Undo, STEP und Neuladen geprüft.
Der tatsächliche Chat zeigt beide abhängigen Bohrungen und die Parameternachweise;
auch die Bildprüfrunde erhält diese lokal berechneten Werkzeugergebnisse.
Dieser Zwischenstand war noch nicht freigegeben. Die folgende Erweiterung
deckt inzwischen auch die Quellenzuordnung bei Flächen- und Kantenoperationen ab.

26.10.2026 – Native Flächen-/Kantenänderungen erhalten gebundene Konstruktionen:
Ein neuer Strukturpfad folgt dem tatsächlich erzeugten Quellenbaum und prüft
BRep-Bytes, Konstruktionsdaten, Beschriftungsinhalt und Weltlage jeder erhaltenen
Quelle. Beim Flächenversatz folgen ursprüngliche Parameter der unveränderten
Originalquelle; bei einer Rundung bleiben affine Außenmaße am fertigen Körper
und intrinsische Rezept-/Skizzenmaße an der erhaltenen Quelle. Verschachtelte
CSG-Quellen werden anhand ihrer vollständigen Struktur zugeordnet. Es gibt keine
Zuordnung über benachbarte Flächen oder alte Flächennummern. Variantenstatus der
Wurzel gilt weiterhin für das fertige Teil, verschachtelte Zustände folgen ihren
Quellen. Parameterwerte und Formeln werden bei dieser Strukturänderung erhalten.
Konturquellen und -ziele folgen ihren bewiesenen Originalquellen mit korrekt
umgerechneten relativen Rahmen. Unveränderte Originalquellen unter einer
geschützten Modellieroperation sind für Konturabfragen lesbar; Bearbeitungssperren
bleiben erhalten. Gelenkrahmen werden bei einer Koordinatenänderung der Wurzel
umgerechnet, ohne die verbundenen Teile oder gespeicherten Bewegungswerte zu
verschieben. Nur Zeichnungsansichten des geänderten fertigen Körpers werden
erneut projiziert. Arbeitsebenen und Flächenmarkierungen werden nativ geprüft;
verlorene Bezüge bleiben mit ihren Punkten/Notizen gespeichert und werden zur
bewussten Neuzuordnung angezeigt. Übernahme benennt Warnung und Folgeänderungen.
Ein Flächenversatz wird zusätzlich am fertigen BRep an Punkt und Normale nativ
nachgemessen. Nicht unterstützte Flächenarten bieten der KI kein Versatzfeld an.
Die vorhandenen geometrischen Eignungsgrenzen der Modellierwerkzeuge gelten
weiter; ungeeignete gescherte Flächen werden ohne Modelländerung diagnostiziert.
120 gezielte Tests bestanden. Der tatsächliche Electron-Quelllauf besteht
46 Prüfgruppen mit 16 simulierten Anbieteraufrufen und vier erreichten
Bildprüfrunden, ohne Rendererfehler, externe Anfragen oder Cloud-Aufrufe.
Geprüft sind unter anderem 22-mm-Ergebnis bei unveränderter gebundener
20-mm-Originalquelle, verschachtelte Bohrungsquellen, Konturziele unter einer
Rundung samt späterer Höhenänderung, erhaltene Gelenk-/Arbeitsebenenrahmen,
gespiegelte gleichmäßig skalierte Quellen, veraltete Markierungen, STEP,
Wiederöffnen und exaktes Undo. Tatsächliche Warnungs-/Zuordnungsanzeige gesichtet.
Paket 3 bleibt bis zur vollständigen gepackten Windows-Abnahme offen. Eine
Signieridentität ist weiterhin nicht eingerichtet; neue signierte Ausgaben sind
noch nicht freigegeben. Die Entwicklung erfolgt weiterhin lokal.

Umfangsabgleich: Die neuen Referenzen bezeichnen ausdrücklich native CAD-Flächen,
Kanten, Bohrungsquellen, Skizzen und Konstruktionsmerkmale. Bestehende Netzauswahl
bindet Originaldreiecke an ihren Geometriedigest; die vorhandene Netzmerkmals-
analyse liefert vermessene Ebenen/Schnittprofile und keine analytischen Bohrungen.
Es erfolgt keine automatische Netz-zu-CAD-Ersetzung. Die im ursprünglichen Plan
ausdrücklich beauftragten Netzflächen-, Pinsel- und Reparaturarbeiten der Pakete
8/9 bleiben Teil des Gesamtauftrags und weiterhin offen.


26.10.2026 – Nutzer fordert digitale Signaturen für die Windows-Ausgaben und
bestätigt: noch kein Zertifikat, zunächst Einrichtung vorbereiten. Entwicklung
und Portable bleiben lokal; GitHub ist zusätzliche Veröffentlichung. Neuer
Signierhelfer unterstützt Windows-Zertifikatspeicher und Microsoft Artifact
Signing, SHA-256/RFC3161, Windows-Verifikation und separaten PE-Bytevergleich.
Gemeinsamer Packager kann vor Manifest/EXE-Prüfungen signieren; explizite
Signaturpflicht ohne Profil bricht vor dem Build ab. Historische freigegebene
Ordner dürfen nur als getrennte signierte Kopien verarbeitet werden.
Fünf Werkzeugtests sowie echte negative Vorprüfungen bestanden: kein Zertifikat,
keine Kopie und kein Build bei fehlender vorgeschriebener Identität. 0.108-EXE und
ASAR unverändert. Kein Zertifikat erzeugt/importiert, kein Vertrauen installiert,
kein Konto oder kostenpflichtiger Dienst angelegt. Anleitung WINDOWS-SIGNATUR.md.
Ein echter erfolgreicher Signiervorgang ist mangels verifizierter Identität noch
nicht geprüft. Neue Release-Wrapper müssen die gewünschte Signaturpflicht setzen;
vor Veröffentlichung sind Signatur-/Zeitstempelprüfung und neue Abnahme nötig.


0.109-Entwicklungsstand: eigener Merkmals-Packager integriert alle drei neuen nativen Merkmals-Suiten und die reale Electron-Merkmalsprüfung in den eingefrorenen Windows-Build. Normaler Wrapper erzwingt Signatur; expliziter --candidate-only-Modus hat getrennte Namen/Belege, releaseReady:false und NICHT-FREIGEGEBEN.txt auch im Programmordner. Er ersetzt keine signierte Freigabe. Alte 0.108-Ausgabe und gegebenenfalls die getrennte Chat-Ausgabe zusätzlich geschützt. Anleitung KI-MERKMALSBEZUEGE.md; Paket 3 bleibt bis vollständiger gepackter Abnahme in Arbeit.

Paket 3 ist nun technisch als lokaler unsignierter 0.109.0-r3-Testkandidat geprüft:
321 eingefrorene Tests und 785 Prüfungen in 16 tatsächlichen Windows-EXE-Suiten,
darunter 46 Merkmalsprüfungen. Zehn Merkmalsaufnahmen und das kompakte Sprachfeld
wurden visuell geprüft. Der vollständige Programmordner umfasst 1804 Dateien;
140 eindeutig zugeordnete Dateien älterer Ausgaben sind exakt erhalten. Keine
Cloud-Inferenz oder Änderung von Nutzerprojekten. Neue Bezüge verwenden Format 21.

Zwei ältere Bedienprüfungen mussten die neue Chat-Kategorie vor Sprache bzw.
Projektfotos öffnen; die Produktfunktionen blieben dabei unverändert. Nach allen
bestandenen EXE-Suiten stoppte eine fehlerhafte Berichtsauswertung, die die Liste
der simulierten Aufrufe mit einer Zahl verglich. Korrigiert auf `calls.length`.
Die Kandidatenbelege wurden anschließend gegen eingefrorene Quellen, ASAR/Stage,
die komplette Laufzeit aus Build-Eingaben und alle 16 EXE-/ASAR-Prüfsummen geprüft;
die Wiederherstellung des technischen Berichts ist ausdrücklich protokolliert.
Künftige Builds speichern das vollständige Laufzeitmanifest bereits vor den
EXE-Tests. Doppelte Windows-Pfadschreibweisen werden mit identischer erwarteter
Prüfsumme zusammengeführt. Die Ausgabe erhält nur `Testabnahme.json`, weiterhin
`candidateOnly: true`, `releaseReady: false` und keine `Freigabe.json`.

Eine signierte Veröffentlichung braucht weiterhin die einzurichtende Identität.
Signaturvorbereitung und Anleitung sind vorhanden; es wurde kein Zertifikat,
Vertrauen oder kostenpflichtiger Dienst eingerichtet. Die nächsten lokalen
Entwicklungspakete bleiben unabhängig davon bearbeitbar. Paket 4 beginnt mit dem
vorhandenen archivierten FCStd und der isolierten FreeCAD-Anbindung; getrennte
Wege für Skriptparameter-Neulauf und native Dokumentmerkmale vorsehen.



Paket 4 begonnen (lokaler Entwicklungsstand, noch keine neue Windows-Ausgabe):
Der eigene FCStd-Dokumentdienst liest echte Objekte, Eigenschaften, Einheiten,
Formeln und Abhängigkeiten im vorhandenen Windows-AppContainer. Ein eigener
Einstieg „FreeCAD-Merkmale“ ist in allen vier Bedienmodi erreichbar. Der Baum
zeigt das eindeutige Ergebnis zuerst, gemeinsam verwendete Quellen als Verweise
und separat aufklappbare Eigenschaften. Statische Part::Feature-Shapes erhalten
keine erfundene Historie. Lesen verändert weder Projekt noch Undo.

Der interne Änderungsdienst bearbeitet explizite numerische, boolesche oder
Auswahleigenschaften an einer Dokumentkopie. Quellhash, Objektkennung, Typ und
Vorwert binden den Auftrag. Formeln, Schutzstatus, native Verknüpfungen und
unabhängige Quellen bleiben erhalten. Nach Neuberechnung wird der tatsächliche
Zielwert erneut geprüft; notwendige skalare Folgeänderungen werden gesondert
berichtet. Native serialisierte Eigenschaftsdaten und vollständige BRep dienen
dem Erhaltungscheck; Python-Wrapper-Darstellungen enthalten Speicheradressen und
eignen sich dafür nicht. ZIP-Zeitstempel der Property-Dumps werden normalisiert.
Native Körpergültigkeit, Geschlossenheit sowie STEP-Rückleseprüfung einschließlich
Volumenvergleich müssen bestehen. Die geänderte FCStd-Ausgabe kann inzwischen
über eine revisionsgebundene Vorschau ausdrücklich am vorhandenen Teil
übernommen werden; ein Undo stellt den vollständigen Vorzustand wieder her.

Prüfungen: aktuelle Dokumentsuite 6/6 nativ, breitere FreeCAD-/Python-/gemischte
CAD-Regression 43/43, tatsächlicher isolierter Electron-Lauf 9 Prüfgruppen ohne
Rendererfehler oder externe Anfragen. Radius 3→4 mm wurde nativ neu berechnet
und sein STEP in einer unübernommenen Formnaro-Vorschau unabhängig auf Volumen
geprüft. Treiberhöhe 6→8 mm berechnet die Formel-Höhe der Bohrung von 8→10 mm.
Alle vier Bedienmodi sowie Hell/Dunkel und kleines Fenster geprüft; drei finale
Aufnahmen visuell kontrolliert. Der bisherige 0.109-r3-Testkandidat ist unverändert.

Paket 4 bleibt in Arbeit: Skriptparameter-Neulauf, Projektparameter-/Variantenbindung
und volle Windows-Abnahme fehlen noch. Native Bearbeitung, versionierte Quellen
und ihre Speicherung sind inzwischen integriert; aktueller Nachweis unten.
Anleitung: FREECAD-MERKMALE.md. Keine Cloud-Inferenz, Signierung, Veröffentlichung
oder Änderung von Nutzerprojekten in diesem Entwicklungsschritt.

### Paket 4 – native Änderungen am bestehenden Teil, 27.10.2026

`previewFreeCADDocument` führt den isolierten nativen Auftrag aus. Der bestehende
CAD-Worker ersetzt anschließend genau die gespeicherte STEP-Quelle und berechnet
notwendige Vorfahren und Formnaro-Abhängigkeiten neu. Quellhash, Projektrevision,
Objektkennung, Typ und Vorwert bleiben verbindlich. Vollständige affine Lage,
Kennungen, Stil und unabhängige Teile werden erhalten. Das private Prüfergebnis
verlangt bei Folgeänderungen oder verlorenen Bezügen ausdrückliche Annahme; eine
Änderung des öffentlichen Vorschau-Berichts umgeht diese Sperre nicht.

Verlorene STEP-Konturbezüge bleiben mit Diagnose erhalten. Flächenfarben werden
nur über eindeutige native Flächengeometrie übernommen; übrige Zuordnungen bleiben
mit Originalwerten und ursprünglicher Dokument-/Flächenidentität gespeichert.
`freecadSource.version: 2` speichert Ergebniskennung, Dokumenthash, Änderungsmodus
und Werte; ihre Verwendung erfordert Projektformat 22, auch in `.fnpack`.
Version 1 bleibt streng lesbar. Originalskript oder -plan bleiben erhalten.

Native Änderungen nutzen die FreeCAD-GUI ohne sichtbares Fenster, damit das
Dokument seine ViewProvider behält. Der Geometrie-Erhaltungscheck entfernt
Displaytriangulationen aus dem BRep-Vergleich und normalisiert ausschließlich das
flüchtige OCCT-Checked-Prüfflag. Anzahl und Struktur der Flagzeilen müssen exakt
stimmen; alle übrigen Geometrie-, Topologie- und Toleranzbytes bleiben maßgeblich.
Die Reihenfolge der sieben Flags ist im
[OCCT-Serializer](https://github.com/Open-Cascade-SAS/OCCT/blob/V7_8_0/src/TopTools/TopTools_ShapeSet.cxx)
belegt. Native Eigenschaftsdumps werden nach Inhalt statt ZIP-Zeitstempel geprüft.

Gespeicherte Python-Helfermodule stehen im isolierten Dokumentauftrag zur
Wiederherstellung echter FeaturePython-Klassen bereit. Das Hauptskript wird beim
nativen Lesen/Ändern nicht ausgeführt. Fehlende Proxys werden sichtbar angezeigt
und sperren sämtliche Dokumentänderungen. Helfernamen sind begrenzt; Windows-
Gerätenamen, interne Dateien und Kollisionen ohne Beachtung der Großschreibung
werden abgewiesen. Kein beliebiges externes Add-on wird damit als unterstützt
behauptet.

Aktueller nativer Nachweis: 18/18 Dokument-/Python-Prüfungen, darunter eigener
persistenter FeaturePython, fehlende Helfer, gültiger STEP und erneutes Öffnen.
Weitere 6/6 Controller-/Worker-Prüfungen decken affine Lage, private Annahme,
verlorene Konturen, Zeichnungen, Farbzuordnung, `.fnpack` 22, Undo/Redo, eine
verschachtelte Gruppenquelle und echten Abbruch mit anschließend neuer Vorschau
ab. Zuvor bestand die breitere Speicher-/Parameter-/P3-Regression mit 65 Tests.
Der abschließende Desktoplauf bestand 22 Gruppen ohne Rendererfehler oder externe
Anfragen, einschließlich echter Helfer-Änderung, Übernahme, Undo und sichtbarer
Sperre bei fehlendem Modul. Vorschau-, Folgeänderungs-, 3D-, kleine dunkle
Baumansicht sowie beide Helferfälle wurden visuell kontrolliert.
Keine neue gepackte Windows-Ausgabe oder Freigabe.

### Paket 4 – getrennter Skript-/Plan-Neulauf, 27.10.2026

`previewFreeCADRerun` führt das gespeicherte Skript oder den gespeicherten CAD-Plan
mit geänderten Parametern aus und aktualisiert die bestehende STEP-Quelle über
dieselbe atomare Vorschau-/Übernahme-Pipeline. Der Merkmaldialog bietet dafür
einen eigenen Änderungsweg mit Parameterfeldern und ausdrücklicher Quellenwahl.
Quellcode, Helfermodule und Planschritte dürfen nicht ersetzt werden; unbekannte
Parameter, ungültige JSON-Daten, Quellrevisionen und gesperrte Ziele werden vor
einem nativen Lauf abgewiesen. Auch ein bereits abgebrochener Auftrag startet
keinen Prozess.

Alte Quellen speichern keine verlässlichen Eingabezuordnungen. Jeder manuelle
Neulauf verlangt daher eine explizite aktuelle Liste, auch wenn sie leer ist.
Ergebnis und seine Folgegeometrie dürfen keine eigenen Eingaben sein. Die
Vorschau nennt tatsächlich gewählte Quellen und Format sowie die SHA-256 der
übergebenen STEP-/STL-Datei. Die Ausgabekennung stammt aus dem nativen Auftrag.
Skript- und CAD-Planläufe liefern eine STEP-Rückleseprüfung; der Planworker prüft
zusätzlich Geschlossenheit, Körperanzahl und Volumenübereinstimmung.

Ein Neulauf nach nativen Änderungen ersetzt diese Änderungen durch das Ergebnis
des gespeicherten Programms. Diese Wirkung wird im Dialog und Bericht angezeigt;
eine private Übernahmesperre verlangt ausdrückliche Annahme. Das öffentliche
Warnungs-/Berichtsobjekt kann die Sperre nicht umgehen. Ein Undo stellt die
vorherige native FCStd und ihre ursprünglichen Programmparameter wieder her.
Nach Übernahme bleibt Quelle 2 mit Modus `script` oder `plan`, aktuellen
Parametern und Dokumenthash in Format 22 gespeichert. Es gibt keine zusätzlichen
unversionierten Quellfelder oder automatische Annahme alter Eingabezuordnungen.
Die interne Geometrieersetzung kann nicht direkt als öffentlicher Vorschauauftrag
eingereicht werden; sie entsteht nur aus den beiden geprüften FreeCAD-Abläufen.

Prüfstand: 9/9 Skript-/Plan- und native Planprüfungen; breitere Regression 51/51
mit bestehender FreeCAD-Integration, nativen Änderungen einschließlich Abbruch
und Gruppe, Projekt-/Fnpack-Daten und gemischter KI-Steuerung. Der abschließende
Desktoplauf bestand 27 Gruppen einschließlich tatsächlicher Parameterbearbeitung,
Vorschau, Warnungsübernahme und Undo. Die Parameteransicht und kompakte 3D-Vorschau
wurden visuell geprüft. Die direkte interne Übernahme wurde zusätzlich gezielt
als unzulässiger API-Auftrag geprüft. Paket 4 bleibt offen: automatische Bindung
an Formnaro-Projektparameter und Varianten, externer FCStd-Import sowie vollständige
Export-/Windows-Paketabnahme folgen. Keine neue portable Ausgabe oder Publikation.

### Paket 4 – globale FreeCAD-Programmparameter und Varianten, 27.10.2026

Die bestehende Projektparametertabelle bindet nun tatsächliche numerische
Skript-/Planparameter unter `freecad.parameters.KEY`. Es gibt keinen zweiten
skalaren Graphen. Parameterversion 2 führt ausdrückliche Eingabezuordnungen
`freecad: [{target, inputs: [{name, target, unresolved?}]}]`; ihre Verwendung
erfordert Projektformat 23. Version 1 und ältere Projekte bleiben lesbar.
Projektparser, Bibliotheken, `.fnpack`, KI-Vertrag und erzeugte API-Dokumente
kennen das neue Format.

Ein FreeCAD-Lauf ist ein eigener Knoten im gemeinsamen Abhängigkeitsgraphen.
Native Eingabegeometrie und ihre Weltlage gehen dem Lauf voraus; sein Ergebnis
geht abhängigen Körpern voraus. Der CAD-Worker delegiert ausschließlich die
autorisierten, tatsächlich gebundenen Programme an den Desktop und importiert
deren geprüften STEP an derselben Stelle des geordneten Aufbaupasses. Der Host
prüft Ziel, Quellhash, unverändertes Programm, ausgewertete Parameter und
Eingabenamen; jeder Quelllauf ist pro Auftrag einmal erlaubt. Worker-Anfragen und
Antworten bleiben an Auftrag, Revision und Generation gebunden. Abbruch beendet
auch native Arbeit; späte Antworten werden nicht übernommen.

Native Körper und FreeCAD-Läufe ergeben eine Vorschau und ein Undo. Fehler in
späteren Läufen übernehmen keine bereits berechneten Zwischenkörper. Eine
gemeinsame Desktop-Warteschlange hält einen abgebrochenen Prozess bis zu seiner
tatsächlichen Antwort als Grenze für den nächsten Lauf. So kann die neue
Berechnung nach dem Aufräumen starten, ohne eine alte Antwort zu übernehmen.

Bestätigte Eingaben werden anhand tatsächlicher Geometrie und Weltlage sowie
des gespeicherten Programms geprüft. `applied.inputs.freecadSignature` in
Parameterversion 2 darf durch einen wirklichen Neulauf oder eine unverändert
nachgewiesene vorherige Eingabe bestätigt werden; ein gleicher Zahlenwert allein
reicht nicht. Gruppieren und Kopieren verwenden exakte Quellenpfade. Ein
Bibliotheksexport markiert nicht enthaltene externe Eingaben ungeklärt; passende
Kennungen im Zielprojekt lösen sie nicht still auf. Eine geänderte Quelle macht
die Ausgabe aktualisierungspflichtig und sperrt ihren Export. Ausgeblendete
oder einzeln unterdrückte Eingaben dürfen ausdrücklich als gespeicherte
Geometrie gelesen werden; ihre bloße Sichtbarkeitsänderung erfordert keinen
unnötigen Neulauf.

Geprüft sind eine Formel über ein natives Eingabeteil und zwei abhängige
FreeCAD-Skripte, Varianten, ein Datenplan, fehlende/zyklische Eingaben, Änderungen
der Quelle bei gleichem Parameterwert, Fehler im zweiten Lauf, echter Abbruch
und erneuter Versuch, affine Gruppen und Kopien, Format 23, `.fnpack`-Wiederlesen
und vollständiges Undo/Redo. Die breitere Regression bestand mit 66 Tests;
gezielte native Prüfungen, Daten-/Automationsprüfungen und Transportprüfungen
wurden anschließend passend zu den weiteren Änderungen erneut bestanden.

Der abschließende tatsächliche Desktoplauf bestand 37 Gruppen ohne
Rendererfehler oder externe Anfragen. Er bedient Bindung, native Vorschau,
Warnungsannahme, Variante und Undo in einem isolierten synthetischen Projekt.
Ein verzögerter nativer Lauf wurde abgebrochen und eine neue Vorschau danach
erfolgreich berechnet. Die kompakte Ansicht wurde visuell geprüft; ihr längerer
Übernahmeknopf bleibt vollständig sichtbar und wurde dort tatsächlich geklickt.

Paket 4 bleibt in Arbeit. Weitere Kombinationen mit Kontur-/Flächen-/Zeichnungs-
bezügen und direkten Änderungen an Eingabequellen, externer FCStd-Import sowie
Export- und gepackte Windows-Abnahme sind noch erforderlich. Noch keine neue
portable Ausgabe, Signierung, Veröffentlichung oder Änderung von Nutzerprojekten.


### 27.10.2026: FCStd-Import und zusätzliche FreeCAD-Folgebezüge

Vorhandene FCStd-Dateien können über die normale CAD-Dateiauswahl oder Drop
importiert werden. Der native Merkmalsbaum wird zuerst gelesen; ein Ergebniskörper
muss ausdrücklich gewählt werden. Die Vorschau prüft dessen gespeicherte native
Geometrie und eine erneut gelesene STEP-Ausgabe. Das vollständige Originalarchiv
bleibt als FreeCAD-Quelle Version 2 ohne erfundenes Skript oder erfundene Historie
im Projektformat 22 erhalten. Import und native Maßänderung haben jeweils ein
Undo. Die Quelldatei wird zum Import nicht neu gespeichert.

Die interne additive Übernahme prüft ausschließlich den neuen Körper. Vorhandene
BReps und gespeicherte Statistikwerte bleiben exakt erhalten; damit werden auch
kleine Rundungsänderungen durch unnötigen Neuaufbau vermieden. Nicht benötigte
Geometrieblöcke eines `.fnpack` bleiben ungeladen, selbst wenn sie nicht verfügbar
sind. Die interne Operation kann nicht direkt über die öffentliche
Controller-Vorschau eingeschleust werden.

Globale FreeCAD-Parameter aktualisieren nun die betroffenen Zeichnungsansichten.
Nicht mehr exakt passende STEP-Konturen und Maße bleiben mit ihren ursprünglichen
Daten ausdrücklich ungeklärt. Verlorene Arbeitsebenen- und Markierungsbezüge
werden vor der Übernahme benannt. Ein nachfolgendes Programm mit einer solchen
ungeklärten Kontur als Eingabe wird vor seinem nativen Lauf abgelehnt; der gesamte
Auftrag bleibt ohne Übernahme. Unabhängige Ansichten, Teile und Gelenke bleiben
erhalten. Gezielte Flächenänderungen führen FreeCAD-Parameterziele und bestätigte
Programmeingaben über die tatsächlichen erhaltenen Quellenpfade weiter.
Geometrisch geschützte Originale bleiben schreibgeschützt.

Prüfung: elf Tests für globale Parameter und zusätzliche Abhängigkeiten bestanden;
Import, Austauschformate und die vorhandenen gezielten Strukturänderungen wurden
gezielt geprüft. Zusätzliche native Importfälle belegen exakte bestehende
FreeCAD-Geometrie/Statistiken sowie den Import neben ungeladenen Paketquellen.
Die tatsächliche Desktop-Abnahme bestand 44 Gruppen ohne Rendererfehler oder
externe Anfragen, darunter Dateiauswahl, ausdrückliche Körperwahl, kompakte
3D-Importvorschau, Übernahme, native Längenänderung und beide Undo-Schritte.
Die finalen Vorschauen wurden visuell geprüft. Der Build ist erfolgreich.

Paket 4 bleibt in Arbeit: Weitere direkte Änderungen an Eingabequellen und
Exportfälle sowie die gepackte Windows-Abnahme stehen noch aus. Es wurde keine
neue portable Ausgabe erstellt oder veröffentlicht. Die lokale
Signaturvorbereitung bleibt vorhanden; eine vertrauenswürdige Signierung
benötigt weiterhin die tatsächliche Signieridentität.


### 27.10.2026: Native FreeCAD-Änderungen aktualisieren Folgeprogramme

Native Dokumentänderungen und manuelle Programm-Neuläufe erhalten bei
Projektparameterdefinition Version 2 einen eigenen Ausführungszugang für die
wirklich nachfolgenden FreeCAD-Programme. Er wird aus dem gespeicherten
Abhängigkeitsgraphen abgeleitet. Das eigene Ursprungsprogramm und unabhängige
Programme erhalten keine zusätzliche Ausführungsfreigabe. Die bestehenden
Prüfungen für Quellarchiv, Programmdefinition, ausgewertete Parameter,
Eingabenamen, Auftrag, Revision und Worker-Generation gelten unverändert.

Die Programme werden im bestehenden geordneten Konstruktionspass mit den neuen
Geometrieeingaben ausgeführt. Nur tatsächlich ausgeführte Programme dürfen neue
Eingabebelege erhalten. Quellen, globale Parameterdefinitionen und unabhängige
Teile bleiben erhalten. Fehler, Abbruch und verlorene Konturprofile verhindern
eine teilweise Übernahme. Die gemeinsame Übernahme benötigt einen Undo-Schritt.
Die Zusatzberichte enthalten die tatsächlichen Folgeprogramme mit nativer
Geometrieprüfung und STEP-Rückleseprüfung.

Eine zusätzliche Prüfung fand einen unerwünschten Neulauf des geänderten
Eingabeprogramms, wenn dessen Skriptparameter selbst global gebunden waren.
Unveränderte Bindungen werden nun nicht mehr als neue Berechnungsursache
behandelt. Damit überschreibt der alte Programmparameter eine native
Eigenschaftsänderung nicht still. Die begrenzte Ausführungsfreigabe hatte die
falsche Rückfrage zuvor ohne Modelländerung abgelehnt.

Geprüft sind native Eingabeänderung, manueller Eingabe-Neulauf, Fehler im
Folgeprogramm mit erfolgreichem Neuversuch, Abbruch während des Folgelaufs mit
anschließendem Neuversuch, ein verlorenes Konturprofil sowie echte native
Berechnung mit nur teilweise geladenen Paketquellen. Die breitere Regression
bestand 29 Tests, nach dem Bindungsfix die gezielte Regression mit den neuen
Fällen und bisherigen gezielten Strukturänderungen erneut 27 Tests. Ein
zusätzlicher nativer Netzeingabefall belegt tatsächlichen STL-Export und einen
Neulauf nach Skalierung bei unverändertem Programmparameter.

Die tatsächliche Desktop-Prüfung erreichte 47 Gruppen ohne Rendererfehler oder
externe Anfragen, einschließlich gemeinsamer Übernahme und exaktem Undo beider
Dokumente und Parameterbelege. Bei der visuellen Kontrolle wurde anschließend
die Auswahl der Vorschaugeometrie um die betroffenen Folgeprogramme ergänzt.
Der abschließende erneute Desktoplauf bestand ebenfalls 47 Gruppen und prüft
ausdrücklich, dass Eingabe und Folgeprogramm beide als Vorschaugeometrie
vorhanden sind. Die finale kompakte Vorschau wurde visuell geprüft.

Paket 4 ist weiterhin unvollständig. Insbesondere direkte skalare
Merkmalsänderungen an Eingaben benötigen weitere Integration. Zusätzliche
Exportfälle und die gepackte Windows-Abnahme stehen ebenfalls noch aus.
Es wurde keine neue portable Ausgabe, Signatur oder Veröffentlichung erstellt.


### 27.10.2026: Manueller Neulauf mit eigenen global gebundenen Parametern

Der manuelle Skript-/Plan-Neulauf leitet Änderungen eigener global gebundener
Programmfeldeinträge über die vorhandene eindeutige skalare Maßplanung ab.
Freie Eingänge beziehungsweise die aktive Variantenübersteuerung werden geändert;
Formeln und Basisdefinitionen bleiben erhalten. Andere davon abhängige
Programmfeldeinträge werden aus der Formel ermittelt. Ungebundene Programmwerte
bleiben im selben Auftrag bearbeitbar. Mehrdeutige oder nichtlineare Umkehrungen
und widersprüchliche geänderte Felder werden vor der nativen Ausführung abgelehnt.

Die neue private Operation `freecadBoundRerun` berechnet geänderte skalare Eingaben,
das ausdrücklich gewählte Programm und seine Folgeprogramme in einem geordneten
Pass. Sie verwendet den bestehenden FreeCAD-Host mit begrenzten Programmen,
exakter Definition und exakt ausgewerteten Parametern. Das Hauptprogramm wird
nicht vorzeitig mit alten Eingaben exportiert und nicht doppelt ausgeführt.
Die private Operation kann nicht über die öffentliche Vorschau eingeschleust
werden. Der normale globale Aktualisierungsweg bleibt erhalten.

Die geänderten Parameterbelege werden nur im betroffenen Bereich und für wirklich
ausgeführte FreeCAD-Programme erneuert. Unbeteiligte, schon vorher veraltete
Bindungen und ihre Geometrie bleiben unverändert. Der vorhandene Hinweis beim
Ersatz nativer Dokumentänderungen und die private Übernahmeprüfung gelten weiter.
Fehler oder Abbruch nach dem Hauptlauf übernehmen weder skalare Eingaben noch
Parameter oder Dokumente teilweise. Ein neuer Versuch wartet die native
Prozessbereinigung ab.

Bestätigte Eingabezuordnungen werden im Programm-Dialog angezeigt, einschließlich
gewählter Quellen innerhalb einer Gruppe. Neue und fehlende Zuordnungen bleiben
explizit. Die Paketauflösung liest nur die nötigen Geometrieblöcke. An den
Speicherformaten wurde dabei nichts erweitert: Quellen bleiben Version 2,
Projektparameterdefinitionen Version 2 und solche Projekte Format 23.

Zehn neue native Fälle prüfen unter anderem Formel- und Variantenfortführung,
die Reihenfolge mit tatsächlich geändertem Eingabeteil, ungebundene zusätzliche
Werte, neu bestätigte Eingaben, native Rücksetzung, unveränderte unabhängige
Geometrie, bestehende fremde veraltete Bindungen, fehlende Paketblöcke,
Gruppenquellen, Fehler, Abbruch und einen erfolgreichen Neuversuch.
Der abschließende Lauf mit diesen Fällen, bisherigen manuellen Neuläufen,
Ausführungsfreigabe und Paketauflösung bestand 19 Tests. Zuvor bestand die
betroffene breitere FreeCAD-Regression 27 Tests. Diese Mengen überschneiden sich.

Die tatsächliche Desktopprüfung bestand 53 Gruppen ohne Rendererfehler oder
externe Anfragen. Sie bedient den gebundenen Programm-Neulauf, prüft beide
Vorschaukörper, globale Parameteränderung, gemeinsame Übernahme und exaktes Undo.
Auch die sichtbare bestätigte Eingabe wird tatsächlich für einen unveränderten
Neulauf verwendet; Verwerfen bleibt ohne Modell- oder Undo-Änderung. Die finale
kompakte Vorschau wurde visuell geprüft. Beim Wiederlesen kanonisch geordneter
Modelldaten wurde zusätzlich die Quellenauswahl gegen unterschiedliche
JSON-Feldreihenfolgen stabilisiert. Ein gezielter nativer Test mit umgeordnetem
Zielobjekt prüft anschließend denselben Schutz für interne Programmparameter;
der abschließende Build ist erfolgreich. Keine neue portable Ausgabe oder
Veröffentlichung.
Paket 4 bleibt für zusätzliche native Merkmaltypen, Exportfälle und
die tatsächliche gepackte Windows-Abnahme offen.


### 27.10.2026: Gezielte skalare Änderungen mit FreeCAD-Folgeprogrammen

Die neue reine Maßplanung `planCadAIScalarFeatureOperation` ermittelt aus
angehängten aktuellen Referenzen und den bestehenden Parameterkanten die nötigen
skalaren Änderungen und FreeCAD-Programme. Der Controller verwendet diesen Plan
für die begrenzte Host-Freigabe. Der Worker löst die Referenzen weiterhin nativ
auf und gleicht seine tatsächlich ermittelten Maße vor einem Host-Aufruf mit der
reinen Planung ab. Ein anderer Programmcode, andere Werte, Eingabenamen oder
unbeteiligte Programme erhalten keine Ausführungsfreigabe.

Der bestehende geordnete Aufbau aktualisiert Eingabegeometrie, Parameter und
Folgeprogramme gemeinsam. Bestätigte numerische Programmfelder können ebenfalls
gezielt bearbeitet werden. Ohne bestätigte Programmeingaben wird keine neue
Zuordnung geraten. Die native Durchmesser- und Achsenprüfung bleibt erhalten.
Neue FreeCAD-Quellen und Flächenfarben sind nur an tatsächlich berechneten
Programmen und ihren zugehörigen erhaltenen Quellen erlaubt; andere Metadaten
bleiben exakt erhalten.

Ein zusätzlicher Scope-Test fand und verhindert das unbeauftragte Nachholen
fremder veralteter Bindungen über gemeinsam genutzte Zeichnungsansichten.
Auch dort bleiben die unbeteiligte Geometrie und ihre alte ungeklärte Bindung
unverändert. Verlorene Folgekonturen können mit Diagnose erhalten bleiben;
ein weiteres Programm, das sie als Eingabe benötigt, wird vor seinem nativen
Start abgelehnt. Flächenmarkierungspunkte, Texte und die Lage einer gelösten
Arbeitsebene bleiben erhalten. Die private Übernahmeprüfung lässt sich durch
Änderung des öffentlichen Vorschau-Berichts nicht umgehen.

Zwölf neue native Fälle prüfen skalare Eingaben, eigene Programmfelder,
formelgebundene Bohrungen mit Auswertung des tatsächlich geänderten Materials,
gemeinsame Zeichnungsansichten, Paketauflösung, Fehler, Abbruch und Neuversuch,
fehlende/veraltete/gesperrte Bezüge, verlorene Folgekonturen und Markierungen,
einen gesperrten weiteren Folgelauf, Spiegelung mit Scherung sowie Varianten.
Zwei zusätzliche reine Freigabetests prüfen die erlaubten Programme und Werte.
Die betroffene bestehende Regression bestand 51 Tests; die Mengen sind keine
additive Gesamtabnahme.

Die tatsächliche Electron-Prüfung bestand 60 Gruppen ohne Rendererfehler oder
externe Anfragen. Zusätzlich zu den bisherigen 53 Gruppen erfasst sie eine
native Bohrung per Mausklick und hängt sie an den eingeschränkten Chat an.
Ein synthetischer Modelltransport liefert genau einen eingeschränkten Vorschlag
und eine Bildprüfung. Die native Bohrungsänderung und der tatsächliche
FreeCAD-Folgelauf werden mit ihren Prüfbelegen im Bericht und im Bildprüfungs-
Payload gezeigt, gemeinsam per echtem UI-Klick übernommen und mit einem Undo
vollständig zurückgenommen. Die Vorschau wurde visuell geprüft. Es fand keine
externe Modellinferenz statt.

Der Build ist erfolgreich. Noch keine neue portable Ausgabe, Signierung oder
Veröffentlichung. Paket 4 bleibt für zusätzliche native Merkmaltypen,
Exportfälle und die tatsächliche gepackte Windows-Abnahme in Arbeit.

### Paket 4: native Pad-Konstruktion und physische Exporte

Der Entwicklungsstand ist auf 0.110.0 angehoben. Ein originales Body/Sketch/Pad
ist nativ lesbar und lässt sich von Länge 5 auf 8 mm neu berechnen (300 →
480 mm³), mit erhaltener Skizze und unabhängigem Objekt. Der Test fand einen
realen Lesefehler für nicht gesetzte LinkSub-Eigenschaften; leere Bezüge werden
nun als null gelesen. Zwei native Tests bestehen.

Die tatsächliche Electron-Abnahme besteht 71 Gruppen ohne externe Anfragen
oder Rendererfehler. Neu sind die native Pad-Änderung in einer Gruppe, der
bytegenaue FCStd-Export über Einstellungen, natives Wiederöffnen, physisches
fnpack23-Speichern und Projekt-Wiederöffnen mit erhaltener globaler Bindung
sowie STEP/STL über den echten Exportdialog. Unabhängiges natives Rücklesen
misst die ausgewählte Gruppe mit zwei Körpern und 504 mm³; das andere Rootteil
bleibt außerhalb des Exports. Die wiedergeöffnete 3D-Ansicht wurde geprüft.

Paketierung und technische Kandidatenabnahme für 0.110.0 sind vorbereitet.
Alle bisherigen Windows-Suiten und der neue FreeCAD-Dokumentlauf sind Pflicht;
Quellen und Runtime werden eingefroren und ältere Ausgaben einschließlich des
0.109-Testkandidaten über ihre Prüfsummen geschützt. Eine tatsächliche
Windows-Abnahme und signierte Veröffentlichung werden erst nach deren Prüfung
behauptet. Das Signierzertifikat fehlt weiterhin, die Entwicklung bleibt lokal.

### Paket 4: technische Windows-Abnahme 0.110.0-r1

Der lokale unsignierte Testkandidat in
`output/FreeCAD-Parameter-Testkandidat-v0.110.0-r1` ist technisch abgenommen.
Alle 467 Tests des eingefrorenen Quellstands bestehen, ebenso 856 Prüfgruppen
in 17 tatsächlichen Windows-EXE-Läufen. Darunter sind 71 FreeCAD-Dokumentfälle
mit 11 physischen Speicher-/Exportprüfungen. Die 20 übernommenen Aufnahmen
wurden visuell geprüft. Native Pad-Länge 8 und 480 mm³, originales FCStd,
fnpack23 mit globalen Bindungen sowie ausgewählte STEP/STL-Gruppe mit zwei
Körpern und 504 mm³ sind unabhängig zurückgelesen. Alle bisherigen Suiten
bleiben Teil der Abnahme. Kein externer Modellaufruf war nötig.

Der Paketlauf vergleicht eingefrorene Quellen, ASAR und Runtime unverändert
mit ihren Verzeichnissen und Prüfsummen. 142 eindeutig zugeordnete Dateien
älterer Ausgaben einschließlich des 0.109-Testkandidaten sind unverändert.
`Testabnahme.json` hält diese technische Abnahme fest. `candidateOnly=true`,
`releaseReady=false` und `signed=false` bleiben ausdrücklich erhalten; es gibt
keine signierte Freigabe. Kein Zertifikat, Vertrauensspeicher oder kostenpflichtiger
Dienst wurde eingerichtet. Die lokale Entwicklungsansicht ist ebenfalls auf
0.110.0 gebaut. Änderungen der gemeinsamen Dokumentation nach der technischen
Abnahme verändern die eingefrorene geprüfte Ausgabe nicht.

Paket 5 ist der nächste lokale Entwicklungsschritt: gespeicherte Auftragsziele,
Annahmen, Schutzbereiche und Prüfungen, sicher wiederaufnehmbare Kandidaten
sowie Abbruch wiederholter erfolgloser Versuche. Paket 5–10 ist noch offen.

### Paket 5: Fortschrittsprüfung und vorbereitete Auftragsablage

Der lokale Entwicklungsstand ergänzt den bestehenden KI-Anfragelauf um eine
anwendungsseitige Fortschrittsprüfung. Drei gleiche Fehler, drei gleiche
Messbefunde oder drei geometrisch gleiche geprüfte Entwürfe in einer
Bildkorrektur stoppen den Lauf. Sechs Schritte ohne belegte Verbesserung
stoppen ebenfalls. Tatsächlich verbesserte native Messwerte erlauben weitere
Korrekturen innerhalb des unveränderten Budgets. Die Entwurfswahl vergleicht
neben fehlgeschlagenen Prüfungen deren gemessene Sollabweichung. Ein besserer
55-mm-Entwurf bleibt deshalb gegenüber späteren schlechteren Entwürfen erhalten.

Feste Auftragsvorgaben können schon vor der ersten Modellantwort Sollprüfungen
setzen und ganze Teile beziehungsweise erhaltene Quellen schützen. Native
Vorschauen werden vor der Freigabe auf unveränderte Quelldaten, Weltlage und
wirksame Sperr- und Sichtbarkeitszustände geprüft. Technische Aufgaben und freie
Formgestaltung haben getrennte Qualitätsbeschreibungen; explizite Maße und
native Geometrieprüfungen bleiben in beiden Fällen verbindlich.

Der neue optionale Speicher-Hook liefert defensive Kopien von Fortschritt,
Prüfungen, Fehlergedächtnis, Messungen und Kandidatendaten. Auch der endgültige
Bildprüfungsstatus und eine Stoppursache werden vor Rückgabe abgewartet.
Schreibfehler führen zu keiner weiteren Modellkorrektur und verändern keine
bestätigte Geometrie. Die native Kandidatengeometrie ist über die bestehende
Vorschauabfrage verfügbar; sie muss beim späteren Wiederaufnehmen als neue
Vorschau mit frischen Prüf- und Übernahmebelegen behandelt werden.

Die private JSON-Auftragsablage hat Prüfsummen, atomare Dateischreibung,
Anbietertrennung, feste Projekt-/Auswahl-/Referenzbezüge, Generationsvergleich
und eine prozessübergreifende Fortsetzungssperre. Die Koordination verwendet
SQLite aus der bereits vorhandenen Node-/Electron-Laufzeit ohne zusätzliche
Paketabhängigkeit. Der Besitzer wird über einen tatsächlichen Prozessaufruf
geprüft; nach seinem Ende bleibt ein unterbrochener Stand mit demselben
verbrauchten Budget lesbar. Abgeschlossene oder gestoppte Aufgaben können nicht
einfach erneut beansprucht werden. Lesen führt kein archiviertes Programm aus.

Die Desktop-Anbindung verwendet rohe Antworten und rekonstruiert Fehler im
Renderer: Electron überträgt zusätzliche Error-Eigenschaften nicht zuverlässig
über contextBridge. Dadurch bleiben Konflikt- und Revisionskennungen erhalten.
Diese Anbindung ist noch keine fertige Auftragsliste. Vollständige
Wiederaufnahme, Messdateien, gesperrte Fehlrouten, native Vorschau-Wiederherstellung
und die zugehörige Oberfläche sowie die Windows-Abnahme bleiben offen.

Der aktuelle betroffene Prüflauf besteht 87 Tests, einschließlich tatsächlicher
OCCT-Geometrie, gespeicherter nativer Kandidaten und eines zweiten Prozesses mit
abstürzendem Besitzer. Die fokussierte Electron-Prüfung besteht 13 Gruppen mit
beiden API-Protokollen und tatsächlicher Journal-IPC. Die Modelle und
Anbieterantworten sind synthetisch, ohne externe Modellinferenz. Details und
Restumfang stehen in `docs/KI-AUFTRAEGE.md`. Keine neue portable Ausgabe,
Signierung oder Veröffentlichung; die frühere technische 0.110.0-Abnahme bleibt
auf ihrem eingefrorenen Quellstand gültig.

Die abschließende bestehende Electron-Regression besteht ebenfalls alle
191 Prüfgruppen ohne Rendererfehler oder externe Anfragen. Ihr älterer
FreeCAD-Prüffall verwendete drei identische Ressourcenabfragen, die nun
erwartungsgemäß gestoppt wurden. Er prüft jetzt drei unterschiedliche reine
Abfragen, drei anhand nativer Maße verbesserte Korrekturen und eine Bildprüfung.
Der Konstruktionsumfang und die bisherigen Prüfgruppen bleiben erhalten.
Die beiden finalen Chat-Aufnahmen wurden visuell geprüft. EXE und ASAR der
bereits geprüften 0.109- und 0.110-Testkandidaten sind unverändert.

Arbeitsablauf erneut bestätigt: Nach Abschluss und Prüfung des aktuellen Pakets
GitHub mit dem passenden geprüften Quellstand und den Prüfergebnissen
aktualisieren. Entwicklung und lokale Ausgaben bleiben im Projektordner.
Eine Quellaktualisierung ist von der noch offenen signierten Veröffentlichung
zu unterscheiden.

### Öffentliches Download-Repository (27.10.2026)

Fertige Windows-Pakete werden getrennt vom privaten Entwicklungsrepository unter
https://github.com/andyy909/Formnaro-Downloads bereitgestellt. Die Startseite enthält
eine deutsche Beschreibung, Startanleitung und vier echte Bildschirmbilder der
geprüften Ausgabe. Zuerst veröffentlicht wurde die letzte freigegebene Version
0.108.0 mit unverändertem Windows-Archiv, Prüfbericht und passender SHA-256-Liste.
Am 27.10.2026 wurde anschließend 0.110.0-r1 als aktueller Download veröffentlicht,
mit 467 Tests und 856 Prüfgruppen am geprüften Windows-Build. Der Nutzer hat
ausdrücklich entschieden, keine Codesignatur einzurichten und keine entsprechenden
Hinweise auf Downloadseite oder in Versionshinweisen anzuzeigen. Eine Signatur ist
keine weitere Freigabevoraussetzung. Das Weitergabearchiv enthält die unveränderten
geprüften Programmdateien unter `App/`, eine Startanleitung und einen öffentlichen
Prüfbericht. Nur der historische Freigabesperrvermerk wurde aus dieser neuen
Archivkopie entfernt; ursprüngliche Kandidatenordner und Testbelege bleiben erhalten.
Die nachfolgende unfertige Entwicklung ist nicht Teil des Downloads.
Der Download ist ohne GitHub-Anmeldung zugänglich; das Entwicklungsrepository
bleibt privat. In das öffentliche Git-Repository kommen nur Beschreibung und Bilder;
kein Quellcodearchiv und keine private Entwicklungshistorie werden übernommen.

### Paket 5: Fortsetzung im Anfragekern (27.10.2026, weiter in Arbeit)

`cad-ai-task-runtime.js` stellt vollständige Arbeitsdateien und blockierte
Konverterrouten erst nach vollständiger Validierung gemeinsam wieder her.
`cad-ai-task-resume.js` bindet die Fortsetzung an vollständige Projekt-,
Auftrags-, Auswahl-, Referenz- und Vorgabenprüfsummen sowie das ursprüngliche
Budget. Fehlerdiagnosen besitzen einen vollständigen lokalen Checkpoint;
der Anbieter erhält weiterhin die kompakte Zusammenfassung. Analysequelltext,
Hilfsmodule, Parameter und vollständige Messergebnisse werden atomar archiviert.
Die beiden Anwendungsordner für Analysebelege sind für Modellskripte schreibgeschützt.

Native Kandidaten erhalten durch den normalen CAD-Aufbau neue private
Vorschauen und anschließend neue Sollprüfungen. Gespeicherte Python-Programme
werden dabei nicht erneut ausgeführt. Ein Vergleich aller gespeicherten
Nicht-Statistikfelder einschließlich vollständiger BRep- und Netzdaten verhindert
eine stille Geometrieänderung. Geänderte Materialnetze brauchen einen echten
frischen Netzkernnachweis; Folgeänderungen erhalten ihre private Bestätigung
zurück. Vorschaukennungen sind über Controllerinstanzen hinweg eindeutig.
Ausstehende Bildprüfungen verwenden neue Ansichten und behalten den bereits
gezählten Versuch. Kandidaten werden dafür erst nach abgeschlossener lokaler
Prüf- und Fortschrittsbuchführung gespeichert (`candidateSettled`). Ältere
unvollständige Kandidatenstände bleiben gesperrt.

Kernbelege: `work/ai-task-candidate-final-r5.log` mit 119 erfolgreichen Tests
und `work/ai-task-candidate-mesh-r1.log` mit zwei weiteren erfolgreichen Tests.
Die Tests umfassen echte FreeCAD- und Netzkernmessungen, neues Controllerleben,
55-mm-Fehlkandidat bei festem 60-mm-Soll, erhaltene geschützte Originale,
frische Übernahmesperren, eine atomare Übernahme mit Rückgängig und das erneute
Erzeugen einer ausstehenden Bildprüfung. Alle Modelle und Modellantworten
sind synthetisch; es wurden keine echten Anbieteranfragen ausgeführt.

Die automatische Chat-Auftragsablage, der Vorgabeneditor, die Auftragsliste,
der vollständige App-Neustart einschließlich Paketgeometrie und die neue
Windows-Paketabnahme sind noch offen. Diese Entwicklungsänderungen gehören
nicht zum veröffentlichten 0.110.0-r1-Paket. Nach vollständiger technischer
Abnahme von Punkt 5 ist die Aktualisierung des privaten Entwicklungsrepositorys
vom Nutzer ausdrücklich beauftragt; lokale Versionsordner bleiben erhalten.

Aktueller Desktop-Regressionstand dazu: je 13 Prüfgruppen für Fortschritt und
Ablage, 64 für den Fotoablauf mit Perspektive sowie 191 allgemeine KI-/CAD-
Prüfgruppen erfolgreich. Berichte liegen unter
`work/ai-task-candidate/{desktop-r2,photo-desktop-r2,general-desktop-r2}/result.json`.
Alle Läufe verwenden getrennte Profile und synthetische Anbieterantworten;
Fehler- und externe Anfragenlisten sind leer. Der aktuelle Entwicklungsbuild
ist erfolgreich erstellt. Die bestehenden 0.109-r3- und 0.110-r1-Programmdateien
und ASAR-Archive stimmen weiterhin mit ihren ursprünglichen SHA-256-Werten überein.

### Paket 5: Auftragsoberfläche und automatische Chat-Ablage

Der Chat bindet den privaten Auftragsmanager jetzt automatisch an. Neue
`cad-ai-task-journal.js`- und `cad-ai-task-ui.js`-Module verbinden Vorgabeneditor,
Liste, Fortsetzung, Budget und die vorhandenen atomaren Ablageoperationen.
`cad-ai-task-basis.js` sichert das genaue Ausgangsprojekt, seine Auswahl und
alle ursprünglichen Paketblöcke mit SHA-256. Kandidaten werden vor der Ablage
vollständig materialisiert. Das ausdrückliche Öffnen der Basis verwendet den
vorhandenen Projektwechsel einschließlich Speichern-/Verwerfen-Dialog.
Keine Projektrevision wird dafür still umgebunden. Dateifähigkeiten und
Zugangsdaten werden nicht in Auftragsdaten gespeichert.

Ein neuer Inspektions-Lease schützt die erneute lokale Prüfung eines gestoppten
Entwurfs; die Fortsetzungssperre und das verbrauchte Budget bleiben dabei
bestehen. Der Anfragekern besitzt dafür einen ausdrücklichen `restoreOnly`-Pfad
mit frischen Geometrie-, Soll- und gegebenenfalls unabhängigen Prüfungen,
jedoch ohne weiteren Anbieteraufruf. Die Ablage vermerkt anschließend tatsächliche
Übernahme oder Verwerfen. Scheitert das Speichern nach einem bereits erfolgten
Modelleffekt, meldet die Oberfläche beide Tatsachen getrennt. Kann nach einem
Schreibfehler auch der Abschluss nicht gespeichert werden, lässt sich nur der
prozessgebundene eigene Lease freigeben; die letzte gute JSON-Datei bleibt erhalten.

Aktuelle Belege: 129/129 Kernprüfungen in `work/ai-task-ui-final-core-r2.log`,
vier neue echte Journal-/Basisfälle darin mit OCCT, Disk-Full, Budgetfortsetzung,
privaten Übernahmebelegen und vollständiger Paketgeometrie. Der neue isolierte
Desktopprüfer `backend/ai-task-ui-verification.cjs` besteht 18 Prüfgruppen unter
`work/ai-task-ui/actual-r3/`: echter Editor und Chat, dauerhafte Vorgaben ab der
allerersten Antwort, Abbruch nach reserviertem zweiten Schritt, neuer Renderer
und CAD-Controller, unveränderte generative Vorgaben trotz frischem Editor,
blockierte Fortsetzung auf geändertem Modell, ausdrücklich wieder geöffnete Basis,
Fortsetzung bei Schritt drei und vier, drei kumulative Fehlbefunde, Entwurfsprüfung
mit null zusätzlichen Anbieteraufrufen sowie Übernahme und genau ein Rückgängig.
Alle Modelle und Antworten sind synthetisch; keine echten Cloud-Anfragen.

Der vollständige Neustart des Hauptprozesses, weitere Paket-/Foto-/Bezugs- und
Exportfälle sowie die gepackte Windows-Abnahme von Paket 5 stehen noch aus.
Die laufende Entwicklung bleibt außerhalb der veröffentlichten 0.110.0-r1-Ausgabe.

Finale Regression dieses UI-Stands: 129 Kernprüfungen erfolgreich; der aktuelle
Entwicklungsbuild besteht 19 Auftrags-UI-Gruppen, 13 Fortschritts-/Ablagegruppen,
64 Fotogruppen mit Perspektive und 191 allgemeine KI-/CAD-Gruppen, zusammen
287 Desktopprüfgruppen. Berichte: `work/ai-task-ui/actual-r5/`, `progress-r2/`,
`photo-r2/`, `general-r2/`. Alle Fehler- und externen Anfragenlisten sind leer.
Der UI-Prüfer fordert nach direktem Themewechsel einen vollständigen Renderframe
an; zusätzlich ist der tatsächliche dunkle Kontrollkontrast gemessen.
Bestehende 0.109-r3-/0.110-r1-EXE- und ASAR-Dateien sind erneut SHA-256-identisch.
Paket 5 bleibt bis zur vollständigen Neustart-/Paket-/Export-/Windows-Abnahme
in Arbeit.


### Paket 5: vollständiger Prozessneustart und Windows-Abnahme vorbereitet

Die gesicherte Auftragsbasis lässt sich ohne die ursprüngliche Paketdatei öffnen.
Benötigte validierte Geometrieblöcke aus der Auftragsablage werden beim erneuten
Paket-Speichern mitgegeben. Zwei echte isolierte Hauptprozesse prüfen denselben
Auftrag, erhalten Budget und Nutzungskennung, vollständige Analyseprogramme und
Messbefunde, Fotokalibrierung und Ausschnitt sowie den besseren nativen Entwurf.
Die erfolgreiche native Analyse wird beim Fortsetzen nicht erneut ausgeführt.
Neue Paketdatei, Wiederöffnen, Undo/Redo sowie physische STEP-/STL-/FCStd-Exporte
sind erfolgreich geprüft. Fehlendes FreeCAD wird mit konkretem Befund gespeichert
und beendet den betroffenen Lauf. Erschöpftes Budget bleibt auch nach manueller
Entwurfswiederherstellung erschöpft. Private Bestätigungspflichten werden beim
Wiederherstellen auch für gespeicherte native Merkmalsbezüge neu erzeugt.

Die Journaldatei bleibt bei Schreibfehlern erhalten. Unter Windows wird nur das
abschließende atomare Umbenennen bei temporären Zugriffs-/Sperrfehlern begrenzt
wiederholt; fehlender Speicherplatz wird sofort gemeldet. Keine alte Zieldatei
wird vorab gelöscht. Tests decken diese Fehler gezielt ab.

Version 0.111 ist für die vollständige Windows-Abnahme vorbereitet. Der eigene
Paketlauf übernimmt alle bisherigen Prüfgruppen, ergänzt Auftrags-UI,
Fortschrittsprüfung und zwei Prozessstarts; vorhandene 0.109-/0.110-Ausgaben
werden über ihre unveränderten Prüfsummen geschützt. Die Freigabe bleibt bis zur
erfolgreichen EXE-Prüfung und Sichtkontrolle offen. Die vom Eigentümer gewählte
Verteilung benötigt keine Signieridentität. Ältere Abnahmebelege bleiben erhalten.


### Paket 5: Windows-Abnahme 0.111.0-r2 abgeschlossen

Die gepackte Windows-Ausgabe hat 524 Tests am eingefrorenen Quellstand und
929 Prüfgruppen in 21 tatsächlichen EXE-Läufen bestanden. Alle bisherigen
Suiten bleiben enthalten; hinzu kommen Fortschritt (13), Auftragsoberfläche (19)
und zwei getrennte Hauptprozesse (41). Die ursprüngliche Paketdatei wird vor
dem zweiten Prozess entfernt. Gesicherte Modellbasis, vollständige Programme
und Messbefunde, Fotokalibrierung/Ausschnitt, Merkmalsbezüge und Restbudget
bleiben erhalten. Unabhängige physische STEP-/STL-Prüfung, bytegenaues FCStd,
Paket-Wiederöffnen, Undo/Redo, geänderte Referenzen, fehlende Engine, Budgetende
und doppelte Fortsetzung sind abgedeckt. Keine echte Cloud-Inferenz für diese
synthetischen Prüfungen.

Sieben neue Auftragsaufnahmen und vier weitere Regressionsaufnahmen wurden
visuell geprüft. Alle 144 geschützten Dateien älterer Ausgaben sind unverändert.
Die separate `Freigabe.json` bindet die Abnahme an EXE, ASAR und Dateimanifest.
Der erste 0.111-r1-Paketlauf blieb wegen einer fehlenden Wartebedingung beim
zweiten asynchronen Öffnen des Fotodialogs unvollständig. Nur der Testablauf
wurde korrigiert; der neue r2-Lauf ist vollständig bestanden. Alte Ausgaben und
ihre ursprünglichen Prüfbelege bleiben erhalten. Paket 6–10 sind weiterhin offen.

Die Windows-Ausgabe ist am 27.10.2026 als [v0.111.0-r2](https://github.com/andyy909/Formnaro-Downloads/releases/tag/v0.111.0-r2) veröffentlicht. Öffentliche Assets sind Windows-ZIP, Prüfbericht und Prüfsummen; alle drei GitHub-Digests und Größen stimmen mit den lokalen Dateien überein. Der anonyme Download ist erreichbar. Der Entwicklungsquellstand samt Historie bleibt privat; das öffentliche Git-Repository enthält nur Beschreibung und fünf Bildschirmbilder.

### Aktualisierungen zuerst privat (Nutzerentscheidung 27.10.2026)

Neue Entwicklungen und allgemeine Aufträge zum Aktualisieren werden zuerst im
privaten Repository `andyy909/Formnaro` gesichert und aktualisiert. Die öffentliche
Kopie `andyy909/Formnaro-Downloads` wird nicht automatisch synchronisiert.
Öffentliche Quellcode- oder Download-Veröffentlichungen erfolgen erst auf einen
zusätzlichen ausdrücklichen Nutzerauftrag. Diese Regel ersetzt frühere Notizen,
die eine öffentliche Veröffentlichung unmittelbar nach jedem Paketabschluss
vorsahen. Bestehende öffentliche Stände bleiben bis dahin erhalten.


### Paket 6: Kurven und erweiterte CAD-Merkmale

Skizze V4 erhält kubische Bézier- und geklemmte gleichmäßige kubische B-Spline-Kurven (4–16 Pole), Kontrollformeln und vorhandene Bedingungen. Analytische Fläche/Extrema und native Kurvenkanten bleiben unabhängig von Anzeigetessellierung. Projektformat 24 wird nur bei neuen Kurven oder erweiterten Loft-/Sweep-Rezepten erforderlich. Mehrprofil-Lofts führen eine ausdrückliche Profilreihenfolge und Orientierungswahl; zusammengesetzte G1-Pfade enthalten Linien, Bögen und kubische Kurven mit begrenzten konservativen Krümmungs-/Kontaktprüfungen.

FreeCAD-Funktionen werden durch tatsächliche Objekterzeugung beziehungsweise Shape.defeaturing geprüft. Neue getrennte Konstruktionen erhalten statische STEP-Basen, keine erfundene alte Historie: nativer PartDesign-Draft, geeignete statische Merkmalentfernung, native Revolution und native Helix mit verknüpftem FeaturePython-Kreisprofil/Sweep. Archivierte versionierte Helfermodule ermöglichen native Parameteränderungen nach FCStd-Wiederöffnung. Flächen werden nach STEP-Transfer eindeutig über Punkt und Normale zugeordnet. Das Original bleibt erhalten; ausdrückliches Ausblenden wird mit dem neuen Teil in einem Undo übernommen.

Gezielte native Tests einschließlich FreeCAD 1.1.4, echter Winkel-/Steigungsänderungen, ungültiger Helix, statischer Quellenkennzeichnung, PartDesign-Sichtbarkeit und physischem FNPACK24/STEP sind bestanden. Die abgeschlossene Prüfung der gepackten Windows-Ausgabe ist im folgenden Abschnitt dokumentiert. Bedienung und Grenzen: CAD-KURVEN.md. Paket 7–10 bleiben offen. Neue Quellen und Ausgaben werden gemäß Nutzerentscheidung zunächst privat aktualisiert.


### Paket 6: abgeschlossene Windows-Abnahme 0.112.0-r2

627 Tests am eingefrorenen Quellstand und 962 Prüfgruppen in 22 Läufen der gepackten Windows-Anwendung bestanden. Die neue Suite umfasst 33 Gruppen; die bisherigen 21 Suiten bleiben erhalten. Zehn aktuelle Kurven-/Loft-/Sweep-/FreeCAD-Aufnahmen wurden visuell geprüft. Alle 146 geschützten Dateien älterer Ausgaben sind unverändert. Die separate Freigabe bindet Abnahme und Bilder an EXE, ASAR und Dateimanifest. Statische übernommene Basen und statische Merkmalentfernung bleiben ehrlich gekennzeichnet. Keine echte Cloud-Inferenz. Der erste r1-Paketlauf wurde wegen des alten 700.000-Zeichen-Limits der Kontextgrößenanzeige gestoppt. Die Anzeige akzeptiert jetzt höchstens 2 MiB UTF-8 und zählt weiterhin die tatsächlich verwendete deduplizierte Anbieterdarstellung. Ein Regressionstest mit dem vollständigen aktuellen CAD-Kontext verhindert Wiederholung. Der neue r2-Stand wurde vollständig geprüft; r1 bleibt unfreigegeben erhalten. Abschlussdokumentation wurde nach der Abnahme ergänzt; funktionale Programmquellen bleiben unverändert. Paket 7–10 bleiben offen.

Die öffentliche Kopie Formnaro-Downloads enthält seit dem 27.10.2026 auch den freigegebenen getrackten Quellstand von 0.111 aus privatem Commit 7d1900d, als unabhängigen Snapshot ohne private Git-Historie. Frühere Beschreibungen als reines Download-Repository sind historisch. Neue Änderungen ab diesem Stand werden gemäß Nutzerentscheidung zuerst privat aktualisiert; die öffentliche Kopie wird nicht automatisch synchronisiert.


Die geprüfte Windows-Ausgabe ist im privaten Repository als [Formnaro 0.112.0-r2](https://github.com/andyy909/Formnaro/releases/tag/v0.112.0-r2) bereitgestellt. Quelltag v0.112.0-r2 bindet den funktionalen Stand an Commit e43773c; die Abschlussdokumentation wird danach separat ergänzt. Das Windows-ZIP enthält 1.830 vollständig zurückgelesene und SHA-geprüfte Dateien (1.817 Laufzeitdateien). GitHub-Größen und SHA-256-Digests aller drei Assets entsprechen den lokalen Dateien. Die separate öffentliche Kopie wird dadurch nicht aktualisiert.


### Paket 7: Flächen und Prägungen 0.113.0-r3 abgenommen

640 Tests am eingefrorenen Quellstand und 979 Prüfgruppen in 23 Läufen der gepackten Windows-Anwendung bestanden, darunter 17 Flächenprüfgruppen. Die bisherigen 22 Suiten bleiben erhalten. Alle 148 geschützten Dateien älterer Ausgaben sind unverändert. Acht aktuelle Flächenaufnahmen wurden visuell geprüft. Keine echte Cloud-Inferenz.

Vier kubische Bézier-Ränder bilden eine exakte bikubische Coons-Fläche mit gerichteter Materialhöhe. G0-Übergänge melden Randabstände und Normalenwinkel getrennt von Körpergültigkeit. Vollständige Hüllen werden mit Freikantendiagnose vernäht. Prägung/Vertiefung unterstützt Polygonkonturen mit Öffnungen auf Ebenen und orthogonale UV-Konturen auf äußeren Kreiszylindern; schräge UV-Kanten, Bohrungsflächen und andere gekrümmte Flächen bleiben ausgeschlossen. STEP-Rücklesen, archivierte FeaturePython-Helfer, native Tiefen-/Höhenänderung, physisches FNPACK, Vorschau/Abbruch/Undo und unbeteiligte Quellen sind geprüft.

Neue Module: cad-surfaces-data/ui und backend/freecad-surfaces.py, eingebunden in den bisherigen FreeCAD-Werkzeuglebenszyklus. Kein zweiter Undo- oder Geometriestack, keine neue Projektformatgeneration. Statische Basen erhalten ein festes InputName unabhängig von FreeCADs automatisch umbenannten Labels. Der Vorschauersatz vermeidet doppelte Originalflächen, Sichtbarkeit wird nur auf ausdrückliche Wahl zusammen mit dem neuen Teil übernommen. Die 0.112.0-r2-Ausgabe bleibt unverändert. Paket 6a ist weiterhin offen; Paket 8–10 noch nicht begonnen. Anleitung CAD-FLAECHEN.md.

Abnahmebedingte Stabilitätskorrekturen in 0.113.0-r3: Der synchrone Programmspeicher verwendet für Einstellungen, Zugangsdaten und Bibliotheken den bereits vorhandenen atomaren Task-Writer. Ausschließlich vorübergehende Windows-Sperren beim abschließenden Umbenennen werden begrenzt wiederholt; bestehende Dateien und ursprüngliche Fehler bleiben erhalten. Drei zusätzliche Tests prüfen vorübergehende und dauerhafte Sperren sowie nicht wiederholbare Fehler. Der Desktop-Prüfhelfer wartet nach Fensteränderungen auf eine stabile SVG-Bildschirmtransformation, bevor er echte B-Spline-Mausklicks ausführt. Geometrieprüfungen bleiben unverändert streng.

Private Bereitstellung abgeschlossen: [Formnaro 0.113.0-r3](https://github.com/andyy909/Formnaro/releases/tag/v0.113.0-r3), Quellstand `1e094a028ff9c2fd6251d02f59f649b14ca7db03`. Windows-ZIP, Prüfbericht und Prüfsummen sind hochgeladen; Größen und GitHub-SHA-256 stimmen mit den lokalen Dateien überein. Die öffentliche Kopie wurde nicht aktualisiert. Paket 6a bleibt offen.


### Kompakte Solid-/Fusion-Oberfläche (27.10.2026)

Die Hauptmenüs beider CAD-Modi stehen direkt über dem Anwendungskopf. Gemeinsame,
auf Solid und Fusion begrenzte Regeln in `src/cad-workbench-compact.css` reduzieren
Kopfzeilen, Werkzeugabstände, Browserbreite und die Fusion-Konstruktionsschrittleiste.
Werkzeuggruppen, Register, Befehle und gespeicherte Normal-/Easy-Layouts bleiben erhalten.
Der sichtbare Modusname lautet auf Nutzerwunsch überall „Fusion“; interne Kennungen
und Einstellungsdateien verwenden unverändert `fusion`.
Die gezielte Abnahme umfasst vier Fenstergrößen in beiden Themes, Menüs/Register,
Moduswechsel, Docking, unverändertes Modell/Undo und die bestehenden Solid-/Fusion-
Bedienprüfungen. Kein allgemeiner Gesamttest für diese Oberflächenänderung.
`backend/workbench-compact-verification.cjs` verwendet isolierte Prüfprofile;
`scripts/package-compact-ui.mjs` erstellt eine separate Ausgabe auf Basis der
abgenommenen 0.113.1-r2-Laufzeit. Vorherige Ausgaben bleiben erhalten.

Gezielte Windows-Abnahme abgeschlossen: Ausgabe `Kompakte-Oberflaeche-v0.113.1-r4`,
13 Zustandstests und 100 tatsächliche EXE-Prüfgruppen bestanden. Vier finale
Paketbilder visuell geprüft, vorherige 0.113.1-r2-EXE/ASAR unverändert.
Der Zwischenstand r3 ist durch r4 mit kompakten Fusion-Gruppenmenüs ersetzt.


### Kopfzeile und Register weiter zusammengelegt (27.10.2026)

Auf ausdrücklichen Folgeauftrag stehen die Dateiaktionen einschließlich Einstellungen
in Solid und Fusion zwischen Modellname und Modusauswahl. Unter 1100 CSS-Pixeln
weichen sie geordnet in eine zweite Kopfzeile aus. KI-Werkstatt, Projektfotos,
KI-Merkmalsbezüge und FreeCAD-Merkmale sind über Extras beziehungsweise die
Fusion-Dienstprogramme erreichbar und nicht mehr oben sichtbar. Die Menüeinträge
lösen weiterhin die ursprünglichen Schaltflächenhandler aus.
Schnellaktionen und Werkzeugregister teilen sich eine Zeile im Ribbon. Beim
Moduswechsel werden die Originalsteuerelemente und die übrigen Layouts wiederhergestellt.
Die Folgeabnahme verwendet ausschließlich den gezielten Oberflächenprüfer;
keine allgemeinen oder vollständigen Solid-/Fusion-Werkzeugsuiten.

Die gezielte Windows-Abnahme dieser Folgeänderung ist als `Kompakte-Oberflaeche-v0.113.1-r5` abgeschlossen: 39 Oberflächenprüfgruppen, vier visuell geprüfte Paketbilder. Keine allgemeinen Tests oder vollständigen Werkzeugsuiten wiederholt; vorherige r4-EXE und ASAR unverändert.
