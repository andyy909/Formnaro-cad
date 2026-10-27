> Historische Referenz. Aktueller Folgeauftrag ab 26.10.2026: [Ausbauplan ab 0.106](AUSBAUPLAN-AB-0.106.md). Die damaligen Pakete sind abgeschlossen; die zusätzliche Druckprüfung bleibt gestrichen.

# Gemeinsames Formnaro: Arbeitspakete und Nachweise

Maßgeblich ist der vom Nutzer beauftragte Plan mit 27 aufeinander aufbauenden
Paketen. Ziel ist eine Arbeitsfläche und ein Projekt für native CAD-Körper,
bearbeitbare geschlossene/offene Netze und Ansichtsvorlagen. Der vorhandene
lokale STL→STEP-Konverter wird darin verwendet. Hauptbasis bleibt das CAD-Projekt.

Planentscheidung vom 18.10.2026: Die Pakete 1–26 sind abgeschlossen.
Paket 27 (Druckprüfung) wurde auf Nutzerwunsch gestrichen; Überhangbeurteilung
und Druckausrichtung bleiben beim Slicer. Die ursprünglichen Paketnummern bleiben
zur Zuordnung der historischen Nachweise erhalten. Anschließend sind
Modellierpinsel und Symmetrie ausdrücklich beauftragt und im Quellstand 0.58.0
als erste Stufe mit vorhandener Vernetzung implementiert. Die separate Abnahme
verlangt erfolgreiche neue Kern-, Quelloberflächen- und EXE-Nachweise.
Weitere spätere Ausbauideen sind damit noch nicht beauftragt.

Ein Paket wird nicht allein wegen vorhandenen Quellcodes abgenommen. Die jeweils
betroffenen Wege müssen geprüft sein: Oberfläche, Vorschau/Abbruch/Undo,
Dateirundlauf, Export, erhaltene Quellen/Sperren/Maße und gepackte Anwendung.
Reine Daten-/Technikpakete bekommen vor ihrer Oberflächenanbindung begrenzte
Techniknachweise; eine Produktabnahme wird daraus nicht abgeleitet.

| Nr. | Paket | Status / Nachweis |
|---|---|---|
| 1 | Ausgangsstand sichern und Funktionen erfassen | Abgeschlossen: 735 CAD- und 474 Netz-Quelldateien gesichert, CRC und alle Einzelhashes geprüft; vier historische Release-Archive unverändert. Funktionsliste: `FORMNARO-FUNKTIONSBESTAND.md`; 46 CAD-/44 Netz-Oberflächenbefehle mit Quelldateien erfasst. Lokaler Nachweis: `work/unification/baseline-20261015T074816953013Z/result.json` |
| 2 | Gemeinsame Objektstruktur | Abgenommen in der Projektgrundlage 0.24.0: gemeinsame Metadaten, native BReps, rohe geschlossene/offene/beschädigte Netze und Ansichtsvorlagen; Technik-, Oberflächen- und EXE-Prüfung bestanden |
| 3 | Gemischtes Projekt speichern und öffnen | Dateifundament abgenommen: Format 8, echter Dateirundlauf und Altleser 1–4/6 einschließlich gzip; Originaldaten/Rezepte archiviert, neuer Speicherdialog beim CAD-Formatwechsel und eigene Autosicherung. Paket 7 aktiviert passende alte Netz-Ansichten/Flächenbezüge; geeignete alte Schnittansichten werden in Paket 8 übernommen |
| 4 | Gemeinsames Rückgängig und Vorschauen | Abgenommen für gemischte Daten: ein bestätigter Stand/eine Historie; Abbruch, veraltete/verspätete Ergebnisse und echte Oberflächenimporte einschließlich gepackter EXE geprüft |
| 5 | CAD-Rechenmodul anschließen | Abgenommen: bestehender nativer Worker arbeitet mit dem gemischten Projekt; 181 native Prüfungen und bisherige CAD-Abläufe in der EXE bestanden; Netzquellen bleiben bei CAD-Bearbeitung erhalten |
| 6 | Netz-Rechenmodul anschließen | Umgesetzt in 0.25.0: vorhandene Netz-Grundformen, Boolesche Verfahren, Rollen, Bohren, Teilen, Materialkörper, Fasen/Runden und Quellenbearbeitung im eigenen Worker; gemeinsame Vorschau/Übernahme/Abbruch/Undo, Dateirundlauf und getrennte EXE-Prüfung. Anleitung: `NETZ-WERKZEUGE.md`; Nachweise: `work/mesh-integration/checks` |
| 7 | Gemeinsame Arbeitsfläche und Objektbaum | Umgesetzt in 0.26.0: gemeinsame sichtbare Flächenauswahl, aktive Netz-/Vorlagenbezüge mit Vorschau und affine Nachführung, Quellenbaum, gespeicherter Baumzustand, alte Kamera/Flächenbezüge und Netzgrundkörper auf der Arbeitsebene. Anleitung: `GEMEINSAME-ARBEITSFLAECHE.md`; Quell- und separate EXE-Nachweise: `work/shared-workspace/checks` |
| 8 | Eigenschaften und bestehende Werkzeuge übernehmen | Umgesetzt in 0.27.0: übrige Eigenschaften, Maßgriffe/Absetzen, Platzierung/Magnet, Messen/Lineal, Anordnungen/Passung, Schnittansicht/Prüfung, Text/SVG/Skizzen/Formpakete, Quellenfarben und gemeinsame Vorlagen. Abgleich aller 44 Netz-/46 CAD-Befehle; Anleitung `EIGENSCHAFTEN-UND-WERKZEUGE.md`, getrennte Quell-/EXE-Nachweise `work/tool-parity/checks` |
| 9 | Konverteroberfläche einbauen | Umgesetzt in 0.28.0: direkter STL-Dateieinstieg, vorhandene Flächenanalyse/Bereichskorrekturen/Vergleich/Reports im gemeinsamen Programm; native Übernahmevorschau, Verwerfen/Escape, Revisionsschutz und ein Projekt-Undo. Gemischte Quell-/EXE-Prüfung mit unveränderter Engine; Anleitung `GEMEINSAMER-KONVERTER.md`, Nachweise `work/converter-workspace/checks` |
| 10 | CAD als Netzkopie bearbeiten | Abgenommen in 0.29.0: unabhängige native Netzkopie mit eigener Feinheit, Vergleich/Vorschau/Abbruch/Undo, Netzbearbeitung, Format-8-Dateirundlauf und geprüfter EXE. Anleitung `CAD-ALS-NETZKOPIE.md`; Nachweise `work/cad-mesh-copy/checks` |
| 11 | Ausgewähltes Netz in CAD umwandeln | Umgesetzt in 0.30.0: ausgewähltes Materialnetz direkt an den lokalen Konverter übergeben, vergleichen und als unabhängige CAD-Kopie mit Vorschau/Übernahme/Undo ergänzen; Quelle erhalten und veraltete Ergebnisse abweisen. Nachweise `work/mesh-to-cad/checks`; Anleitung `NETZ-DIREKT-IN-CAD.md` |
| 12 | Dateien, Einstellungen und KI vereinheitlichen | Umgesetzt in 0.31.0: gemeinsame Datei-/Konvertervorgaben, geprüfte Einstellungsdateien, ausdrückliche KI-Auswahl pro Konvertierung und gemeinsame CAD-/Netz-KI-Vorschau. Anleitung `GEMEINSAME-DATEIEN-EINSTELLUNGEN-KI.md`; maßgebliche Abnahme über `work/unified-workflows/checks/final-audit.json` und `delivery.json` |
| 13 | Erste gemeinsame separate EXE abnehmen | Abgenommen in 0.32.0: durchgehender Datei-/Bearbeitungs-/Konvertierablauf mit Prozessneustart und Weiterbearbeitung. 579 EXE-Prüfpunkte und vollständige Archivprüfung; Nachweise `work/release-acceptance/checks/final-audit.json` und `delivery.json`. Verfahren: `GESAMTABNAHME-FORMNARO.md` |
| 14 | Dreiecke, zusammenhängende Bereiche und Öffnungsränder wählen | Implementierung für 0.33.0: eigener Auswahlentwurf für ursprüngliche Dreiecke, Oberflächen, Komponenten und eindeutige Randringe; unveränderte Geometrie und gespeicherte Arbeitsflächenauswahl. Abschluss verlangt neue erfolgreiche `work/mesh-selection/checks/final-audit.json` und `delivery.json`. Anleitung `NETZ-FLAECHENAUSWAHL.md` |
| 15 | Auswahlpinsel, Lasso und Schutzbereiche | Implementierung 0.34.0: sichtbarer Pinsel/Konturlasso, benannte Bohrungs-/Anlageflächenmasken, Vorschau/Abbruch/Undo und gemeinsame Schutzprüfung. Abschluss verlangt neue erfolgreiche `work/mesh-selection-advanced/checks/final-audit.json` und `delivery.json`. Anleitung `NETZ-AUSWAHLPINSEL-SCHUTZ.md` |
| 16 | Netzinspektor, zunächst Diagnose | Implementierung 0.35.0: sieben sichtbare Topologiekategorien, Fundstellenfokus, Kategorie-/Tiefenfilter und abbrechbare reine Diagnose; keine Reparatur oder Körpergarantie. Anleitung `NETZINSPEKTOR.md`; Abschluss verlangt erfolgreiche neue `work/mesh-inspector/checks/final-audit.json` und `delivery.json` |
| 17 | Einfache Fehler gezielt reparieren | Implementierung 0.36.0: drei gezielte opt-in Reparaturschritte, ausdrückliche Komponentenwahl, Vorschau/Originalvergleich, Apply/Cancel und Originalhistorie. Anleitung `NETZREPARATUR.md`; Abschluss verlangt neue erfolgreiche `work/mesh-simple-repair/checks/final-audit.json` und `delivery.json` |
| 18 | Einfache/planare Öffnungen schließen | Abgeschlossen in 0.37.0: ein ausdrücklich gewählter einfacher ebener Rand, Vorschau/Übernehmen/Abbrechen, Originalquelle und weitere Öffnungen erhalten; Nachweise work/mesh-hole-fill/checks/delivery.json |
| 19 | Ebenenteilung und Materialkörper komfortabler machen | Implementierung 0.42.0: numerische Position, Mitte/Schritt/Regler, getrennte farbige Vorschau, Schnittflächen/Materialbericht, individueller Körperfokus; Abgenommen mit work/mesh-partition/checks/final-audit.json und delivery.json. Anleitung NETZE-TEILEN-UND-KOERPER.md |
| 20 | Passstifte und Steckverbinder mit Spiel | Implementierung 0.43.0: zwei Netzteile, feste Stifte und passende Sacklochaufnahmen, Spiel je Seite/Tiefenspiel, Materialhüllen und Kollisionsprüfung, Vorschau/Abbruch/gemeinsames Undo sowie Dateirundlauf. Abnahme verlangt work/mesh-connectors/checks/final-audit.json und delivery.json. Anleitung STECKVERBINDER.md |
| 21 | Reduce mit Schutzbereichen und Maßvergleich | Implementierung 0.44.0: formtreue Reduktion ebener Bereiche, feste Bohrungs-/Kurven-/Kantenkonturen, exakte Schutzflächen-Neuzuordnung, Teilflächenziel, Maß-/Volumenvergleich, Vorschau/Abbruch/Undo und Originalrezept. Bis150.000 Dreiecke; Kurven werden nicht vergröbert. Abnahme verlangt work/mesh-reduce/checks/final-audit.json und delivery.json. Anleitung NETZE-VEREINFACHEN.md |
| 22 | Remesh, getrennt von reiner Unterteilung | Implementierung 0.45.0: konservative ebene Neuverteilung durch Kantenteilung, Diagonalentausch und Punktoptimierung; eigene formtreue Unterteilung, Zielkantenlaenge, Teilflaechen/Schutz, Qualitaet/Abweichung und ueberlagerter Original-/Ergebnisvergleich. Keine allgemeine Kurven-Neuvernetzung oder Glaettung. Abnahme verlangt work/mesh-remesh/checks/final-audit.json und delivery.json. Anleitung NETZE-NEUVERNETZEN.md |
| 23 | Lokal glätten, Schutzbereiche festhalten | Implementierung0.46.0: verbindlich uebernommene Flächenauswahl, begrenzte Staerke und Weltverschiebung, feste Schutz-/Aussen-/Rand-/Formkantenpunkte, unveraenderte Vernetzung, geometrische Bewegungs-/Ueberschneidungspruefung, Original/Ergebnis/echte Verschiebung und Maß-/Volumenaenderung. Bis30000Dreiecke. Abnahme verlangt work/mesh-smooth/checks/final-audit.json und delivery.json. Anleitung NETZBEREICHE-GLAETTEN.md |
| 24 | Beschädigte Bereiche löschen und ersetzen | Implementierung0.47.0: ausdrücklich übernommene Flächenauswahl entfernen und bei einem einfachen ebenen Rand neu füllen; ausgewählte innere Schäden entfernen, ungewählte/geschützte Flächen exakt erhalten. Original/Ergebnis und rote/grüne reale Flächenmarkierung, begrenzte Abweichungsstichproben ausdrücklich kein globaler Fehlernachweis. Max30000Dreiecke/10000Auswahl/512Randkanten. Abnahme verlangt work/mesh-erase-fill/checks/final-audit.json und delivery.json. Anleitung NETZBEREICHE-ERSETZEN.md |
| 25 | Make Solid als verglichene neue Annäherung | Implementierung 0.48.0: neue geschlossene Rasterannäherung mit Auflösung/Schließradius/Versatz in Weltmaßen, Original als unabhängiges unverändertes Objekt erhalten. Original/Ergebnis/Überlagerung und echte offene Originalkanten; Maß-/Volumenänderung und Abweichungsstichproben, keine Detail- oder globale Fehlergarantie. Schutzquellen ausdrücklich abweisen. Abnahme verlangt work/mesh-make-solid/checks/final-audit.json und delivery.json. Anleitung MAKE-SOLID.md |
| 26 | Aushöhlen mit Wandstärke und Ablauföffnungen | Abgeschlossen in 0.49.0: Originalvergleich, einstellbare Wandstärke und bis zu acht Ablauföffnungen; Anleitung AUSHOEHLEN.md, lokale Abnahme work/mesh-hollow/checks/final-audit.json und delivery.json |
| 27 | Druckprüfung: Wandstärke, Überhänge, Orientierung | Am 18.10.2026 auf Nutzerwunsch gestrichen. Überhänge und Druckausrichtung werden im Slicer beurteilt; kein offenes Entwicklungspaket. |

## Verbindliche Entscheidungen

- Originalgeometrie bleibt im passenden Format: BRep/Rezepte beziehungsweise
  Dreiecke. Darstellungstessellierung ersetzt keine CAD-Quelle.
- Eine bestätigte Projektrevision und eine Historie; Rechenmodule liefern
  geprüfte Vorschläge. Fehler, Abbruch und veraltete Ergebnisse übernehmen nichts.
- Umwandlungen werden ausdrücklich aufgerufen und erzeugen zusätzliche Teile.
- Offene/beschädigte Netze dürfen angezeigt und gespeichert werden. Erst eine
  erfolgreiche Körperprüfung schaltet Körperoperationen frei.
- Alte Programme/Dateien bleiben erhalten. Migration wird in eine neue Datei
  gespeichert. Bestehende Versionsnummern werden nicht mit neuen Inhalten belegt.
- Neue Netzverfahren zuerst als begrenzten Technikversuch prüfen. Stichproben
  sind keine garantierte maximale Abweichung.
- Neue Wünsche erhalten Nutzen, Abhängigkeiten und ein eigenes Paket; begonnenes
  Paket zuerst beenden. Modellierpinsel folgen später.

## Abnahme der ersten Projektgrundlage

Das erste Zwischenziel – ein zuverlässig gespeichertes gemischtes Projekt aus
CAD-Körper, geschlossenem Netz und offenem Netz – ist erreicht. Es ersetzt keine
Abnahme aller 27 Pakete. **Paket 6 ergänzt die vorhandenen konstruktiven Netzverfahren;
Paket 7 verbindet Arbeitsfläche, Quellenbaum und aktive Netzbezüge. Paket 8 übernimmt die übrigen Eigenschaften und bestehenden Werkzeuge. Paket 9 ergänzt die gemeinsame Konverteroberfläche. Paket 10 ergänzt die ausdrücklich erzeugte CAD-Netzkopie und Paket 11 die direkte Netz-CAD-Kopie. Paket 12 führt Datei-, Einstellungs- und KI-Abläufe zusammen; Paket 13 prüft diese gemeinsame Ausgabe in einem vollständigen Arbeitsablauf und erneut in den bestehenden Funktionssuiten.**

- 45 gezielte Grundlagenprüfungen, 116 bisherige Regressionen, 181 native
  Grundlagenprüfungen und 31 weitere gezielte Prüfungen bestanden.
- Aktuelle Quelloberfläche: 137 CAD- und 21 gemischte Prüfpunkte bestanden.
- Tatsächlich gepackte EXE: 162 bisherige CAD-Prüfpunkte und 21 gemischte
  Prüfpunkte bestanden. Gemischte Prüfungen verwenden normale Import-,
  Eigenschaften-, Speicher-/Öffnen- und sechs Exportwege in isolierten Profilen.
- 507 ASAR-Dateien, 1535 unveränderte Konverterdateien und beide unveränderten
  CAD-/Manifold-WASM-Dateien geprüft. Vier historische Archive und alle 474
  gesicherten Quelldateien des Nachbarprogramms unverändert.
- Portable ZIP einschließlich Quellen, zugehöriger nativer Kernelquellen,
  Lizenzen und Anleitung: CRC und sämtliche Einzelhashes geprüft, keine
  Nutzerprofile oder Zugangsdaten enthalten.

Programm: `release-formnaro-gemeinsame-grundlage-v0.24.0-r2/Formnaro-win32-x64/Formnaro.exe`.
Portable ZIP: `output/Formnaro-Gemeinsame-Grundlage-v0.24.0.zip`.
Lokale Nachweise: `work/unification/checks/final-audit.json`, `archives.json`,
`preservation.json`. Diese Fortschrittsdokumentation wurde nach dem Einfrieren
aktualisiert; die abgenommenen Programmdateien und Quellarchive bleiben erhalten.

## Neue Wünsche

Noch keine zusätzlichen Wünsche seit Beauftragung der 27 Pakete.

## Paket 6: vorhandene Netzverfahren

0.25.0 verbindet die vorhandenen konstruktiven Netzverfahren mit dem gemeinsamen
Projekt. Vollständige affine Quellen bleiben in `meshSource` Version 2 erhalten;
ein veralteter oder nicht mehr passender Quellen-/Kantenbezug wird abgewiesen.
Netz- und CAD-Bearbeitung verwenden denselben bestätigten Stand und dieselbe
Historie. Offene/beschädigte Netze bleiben sichtbar; Körperverfahren erfordern
eine aktuelle Prüfung. Die bestehende begrenzte Netzgenauigkeit bleibt erhalten.

Separate Ausgabe: `release-formnaro-netz-werkzeuge-v0.25.0-r2/Formnaro-win32-x64`.
Anleitung: `NETZ-WERKZEUGE.md`. Prüfungen und Archivprüfung liegen unter
`work/mesh-integration/checks`. Die früheren Ausgaben und der Netz-Nachbarzweig
bleiben unverändert. Paket 7 ist in der nachfolgenden Ausgabe ergänzt; Paket 8
und die neuen Netzverfahren 14–27 bleiben offen.

## Paket 7: gemeinsame Arbeitsfläche

0.26.0 ergänzt Netz- und Vorlagenflächen als gemeinsame Arbeitsebene. Vorschau,
Abbruch und Übernahme verwenden die gemeinsame Historie. Ein stabiler Bezug
folgt der vollständigen affinen Lage; geänderte oder entfernte Dreiecksquellen
lösen den Bezug an seiner letzten gültigen Lage mit Hinweis. Erhaltene
Netzquellen sind im gemeinsamen Baum erreichbar. Kamera, physische Auswahl
und aufgeklappte Zeilen werden im gemischten Projekt gespeichert.

Neue Netzgrundkörper können ausdrücklich entlang der Arbeitsebene oder der
Weltachsen erzeugt werden. Alte Netzprojekte übernehmen passende Kamera- und
Flächenbezüge; alte Schnittansichten bleiben mit Hinweis archiviert. Reine
CAD-Projekte 5/7 behalten ihren bisherigen Ansichtsabschnitt; gemeinsame
Baumzustände und Netzflächenbezüge gehören zu Format 8.

Separate Ausgabe: `release-formnaro-arbeitsflaeche-v0.26.0/Formnaro-win32-x64`.
Portable ZIP: `output/Formnaro-Arbeitsflaeche-v0.26.0.zip`.
Anleitung: `GEMEINSAME-ARBEITSFLAECHE.md`. Die Releaseprüfung bindet Quellen,
Prüfberichte und die tatsächlich gestartete EXE/ASAR an exakte Hashes. Die
abschließenden lokalen Nachweise sind `work/shared-workspace/checks/delivery.json`,
`final-audit.json`, `archives.json` und `preservation.json`.

## Paket 8: Eigenschaften und vorhandene Werkzeuge

0.27.0 ergänzt die verbliebenen Netz-Bedienwege einschließlich grafischer Skizzen,
Text/SVG, Formpaketen, Quellenfarben, eigener Quellendeckkraft und Notizen. Messen
verbindet CAD- und Netzpunkte; Lineal, Anordnungen, Passungen und Platzieren erhalten
die gemeinsamen Quellen und vollständigen affinen Lagen. Die Schnittansicht arbeitet
in beiden Kernen und wird als Ansicht gespeichert. Die bestehende Modellprüfung
bleibt eine Stichprobe; CAD-Netz-Kollisionen werden ausdrücklich nicht berechnet.
Die bisherige begrenzte Reparatur erhält den beschädigten Ausgangsstand.

Gemeinsame Vorlagen verwenden eine neue Bibliotheksversion/-Datei 8; die bisherigen
CAD-Bibliotheksdateien bleiben erhalten. Persönliche Netzbibliotheken werden erst
mit ausdrücklicher Datenübernahme in Paket 12 zusammengeführt. Quellenfarben und
Reparaturrezepte verwenden Netzquellenversion 3; Schnittansichten Arbeitsplatz 3.
Alte Leser weisen unbekannte Zusatzversionen ab. Keine stillschweigende Konversion.

Separate Ausgabe und Anleitung: `EIGENSCHAFTEN-UND-WERKZEUGE.md`. Lokale Abnahme
unter `work/tool-parity/checks/{delivery,final-audit,archives,preservation}.json`;
vorhandene Nachweise früherer Ausgaben werden nicht überschrieben.

## Paket 9: gemeinsame Konverteroberfläche

0.28.0 ergänzt den direkten Dateieinstieg bei Import/Export. Der vorhandene
Flächeneditor, Original-/Ergebnisvergleich und die Berichte arbeiten unverändert
mit der lokalen Engine. Eine gemeinsame native Vorschau zeigt den zusätzlichen
CAD-Körper in der Arbeitsfläche. Das Bestätigungsfenster bleibt über den Seitenleisten
sichtbar und lässt die Szene bedienbar. Verwerfen/Escape behalten das Konverterresultat;
ein Projektwechsel entwertet den Vorschlag. Erst Übernehmen erzeugt einen Projekt-Undo.

Die Abnahme verwendet synthetisches CAD, geschlossenes affines Netz, absichtliche
Öffnung und gesperrte Ansichtsvorlage. Normale Datei-, Korrektur-, Vorschau-, Übernahme-,
Undo/Redo-, Export-, Abbruch- und Neustartwege werden an aktuelle Quellen und eine
separate tatsächliche EXE gebunden. Die native Engine 0.10.0 und ihre 1535 Runtime-
Dateien bleiben erhalten. Persönliche Modelle werden dafür nicht verwendet.
Anleitung: `GEMEINSAMER-KONVERTER.md`; getrennte Nachweise in
`work/converter-workspace/checks/{delivery,final-audit,archives,preservation}.json`.
Die ausdrücklich erzeugten Objektumwandlungen werden in den nachfolgenden
Abschnitten zu Paket 10/11 beschrieben.

## Gemeinsame KI-Anbindung (Ergänzung auf Nutzerwunsch)

0.28.1 vereinheitlicht den Anbieter-, Modell- und Schlüsselspeicher für CAD-Chat
und integrierten Konverter. Die vorhandenen Flächenkorrekturen erhalten eigene
lokal geprüfte KI-Vorschläge mit Übernehmen, Verwerfen und Regions-Undo.
Der Solo-Konverter behält seine unabhängige Einrichtung. Seine neueren
Maßrezept-Werkzeuge bleiben ein separates Integrationspaket.
Anleitung: `GEMEINSAME-KI-ANBINDUNG.md`. Dies zieht einen begrenzten Teil von
Paket 12 vor; der übrige Datei-/Einstellungsteil bleibt ein eigenes Paket.
Die später ergänzten Objektumwandlungen stehen in den nachfolgenden Abschnitten.

## Paket 10: CAD als bearbeitbare Netzkopie

0.29.0 ergänzt einen ausdrücklichen CAD-zu-Netz-Aufruf für einen fertigen
positiven CAD-Körper. Eine separate Feinheit steuert die native Double-
Tessellierung. Vorschau und Originalvergleich verändern das bestätigte Projekt
nicht; Übernehmen fügt ein neues Netzteil mit historischem Quellenverweis hinzu.
CAD-BRep, native Quellen, Parameter und alle anderen Teile bleiben erhalten.
Die Kopie behält den affinen Rahmen, Objektfarbe, Deckkraft und Organisation.
Neue Daten passen in das bestehende Projektformat 8; keine neue Dateimigration.

Vorschauwechsel, Abbruch, Escape, Revisions-/Auswahlschutz, gemeinsames Undo/Redo,
echte Netzbearbeitung, physisches Speichern/Öffnen und betroffene Exportwege
werden mit synthetischen technischen Teilen geprüft. Die optionale Isolation
ändert nur die Ansicht; für den Export allein der Kopie Auswahlumfang wählen.
Anleitung: `CAD-ALS-NETZKOPIE.md`; eigene Nachweise unter
`work/cad-mesh-copy/checks`. Paket 11 folgt im nächsten Abschnitt; der übrige
Datei-/Einstellungsteil von Paket 12 bleibt offen.


## Paket 11: ausgewähltes Netz als CAD-Kopie

0.30.0 ergänzt den ausdrücklichen Aufruf **Netz → CAD …** für ein ausgewähltes
Material-Netzteil. Die Übergabe verwendet gespeicherte Dreiecke einschließlich
affiner Skalierung, Spiegelung und Scherung. Der vorhandene Konverter bleibt
unverändert; Millimeter sind festgelegt und Reparatur ist zunächst ausgeschaltet.
Analyse, Bereichskorrekturen und Vergleich bleiben verfügbar. Das Konvertergebnis
kann ohne vorgeschalteten Dateispeicherdialog als gemeinsamer CAD-Vorschlag
geprüft werden. Erst Übernehmen fügt eine unabhängige CAD-Kopie mit einem Undo
hinzu. Projektänderungen entwerten die quellgebundene Sitzung.

Quellnetz, Quellen, CAD-Körper und weitere offene/geschlossene Netze bleiben
unverändert. Die Kopie erhält die Organisation und Objektfarbe des Netzes sowie
einen historischen Quellenverweis im bestehenden Format 8. Eine optionale
Isolation verändert nur die Ansicht. Für einen Export allein der Kopie weiterhin
**Ausgewählte Teile** verwenden. Keine ursprüngliche Konstruktionshistorie oder
garantierte maximale Oberflächenabweichung wird daraus abgeleitet.

Anleitung: `NETZ-DIREKT-IN-CAD.md`. Getrennte Quell-/EXE-/Archivnachweise liegen
unter `work/mesh-to-cad/checks`. Die Veröffentlichung verlangt vollständige
erfolgreiche Nachweise für dieselben Quellen und Programmdateien. Paket 12/13
und die neuen Netzverfahren 14–27 bleiben offen.


## Paket 12: gemeinsame Datei-, Einstellungs- und KI-Abläufe

0.31.0 verbindet die Datei-/Konvertervorgaben für die gemeinsame Arbeitsfläche.
Ein geprüfter Einstellungsdatensatz überträgt Programmeinstellungen, Anzeige-/
Exportqualität, Dateivorgaben und optional die aktuelle anonyme Anordnung.
Laden prüft zunächst; erst die gesonderte Übernahme ändert Einstellungen.
Modelle, API-Schlüssel, Anbieterprofile, Bibliotheken und Autosicherungen
werden nicht in diesen Datensatz aufgenommen.

Datei-, Import- und Szenennetzkonverter beginnen jeden Auftrag mit Ohne KI.
Mit KI verlangt Vorschlag prüfen und eine ausdrückliche Bestätigung des
Flächenvorschlags oder der gültigen Antwort ohne Änderungen. Rückfragen, Fehler
und Abbruch führen nicht stillschweigend zur lokalen Konvertierung. Diese Wahl
wird nicht als künftige Zustimmung gespeichert. Die vorhandene
Anbieteranbindung bleibt gemeinsam; der Solo-Konverter bleibt unabhängig.
Der STL-CAD-Import verwendet die gemeinsame Konvertervorschau und ausdrückliche
CAD-Übernahme. Bestehende CAD- und Netzwerkzeuge rechnen gemischte KI-Vorschläge
in einem Kandidaten; ein gemeinsames Apply erzeugt einen Undo-Schritt.
Abbruch, Fehler und veraltete Ergebnisse verändern kein bestätigtes Teilprojekt.

Anleitung: `GEMEINSAME-DATEIEN-EINSTELLUNGEN-KI.md`. Separate Nachweise unter
`work/unified-workflows/checks`; Veröffentlichung setzt erfolgreiche Prüfungen
an denselben Quellen und Programmdateien voraus. Paket 13 bleibt die eigene
Gesamtabnahme; Netzverfahren 14–27 werden nicht als erledigt ausgegeben.

## Paket 13: erste vollständige gemeinsame Ausgabe

Die eigene Abnahmeausgabe 0.32.0 verbindet die bereits umgesetzten Pakete 1–12
in einer durchgehenden Prüfung mit normalen Import-, Werkzeug-, Konverter-,
Speicher-, Öffnen- und Exportwegen. Ein zweiter frischer Anwendungsprozess
öffnet die physisch gespeicherte Projektdatei, prüft die erhaltenen Daten und
bearbeitet CAD und Netz weiter. Die exportierten Dateien werden auch auf ihre
Geometrie geprüft. Die bisherigen neun Oberflächensuiten und die native
Grundlagensuite werden für die neue Ausgabe erneut geprüft.

Die Gesamtabnahme klärt außerdem den vorhandenen SVG-Exportumfang: offene oder
beschädigte Netze lösen einen Hinweis im Exportdialog aus. Geeignete CAD-Körper
und geschlossene, gültige Netze lassen sich ausdrücklich als ausgewählte Teile
exportieren; Ansichtsvorlagen werden nicht als SVG-Produktion übernommen.
Die Korrektur ergänzt die verständliche Behandlung des bestehenden Verfahrens.

Die erfolgreichen Originalberichte, exakte EXE-/ASAR-Zuordnung und vollständige
Quell-/Runtime-/Archivprüfung unter `work/release-acceptance/checks` sind die
Voraussetzung für den Abschluss. Maßgeblich sind `final-audit.json` und
`delivery.json`; diese Dokumentation allein bestätigt keine bestandene Prüfung.
Anleitung: `GESAMTABNAHME-FORMNARO.md`. Die früheren Ausgaben bleiben erhalten.
Die neuen Netzverfahren 14–27 werden anschließend einzeln begonnen.


## Paket 14: Netzflächen und Öffnungsränder auswählen

0.33.0 ergänzt einen getrennten Auswahlmodus für bearbeitbare Netzteile.
Dreiecke behalten ihre ursprünglichen Indizes; Oberflächen wachsen anhand des
Nachbarwinkels, Komponenten anhand geeigneter gemeinsamer Kanten. Eindeutige
offene Randringe werden als Kanten ausgewählt. Hinzufügen und Entfernen arbeiten
mit Umschalt beziehungsweise Strg; ein Entwurf wird ausdrücklich übernommen
oder verworfen. Keine Geometrieänderung, Modellhistorie oder automatische
Reparatur ergibt sich aus der Auswahl.

Die bestätigte Auswahl gehört zur versionierten Arbeitsfläche im bestehenden
Format-8-Projekt. Ein exakter Geometriedigest verhindert alte Dreiecksbezüge
nach Koordinaten-/Topologieänderungen; Farben und affine Lagen behalten gültige
Bezüge. Sichtbarkeit, Sperren und vordere Objekte werden beim Klicken beachtet.
Der normale Export bleibt ein vollständiger Objektexport.

Anleitung `NETZ-FLAECHENAUSWAHL.md`, getrennte Nachweise unter
`work/mesh-selection/checks`. Neue Quellen-/EXE-Berichte mit tatsächlichem
Prozessende, Dateirundlauf, geometrieerhaltendem Export und vollständiger
Archivprüfung sind Voraussetzung für den Abschluss. Vorige 0.32 und Solo-
Konverter bleiben erhalten. Die Pakete 15–27 sind weiterhin offen.

Paket17: gezielte einfache Reparaturen in0.36.0 implementiert, Abnahme nach erfolgreichen work/mesh-simple-repair/checks/final-audit.json und delivery.json. Drei opt-in Schritte, explizite Komponentenwahl, Original/Ergebnis-Vorschau, Apply/Cancel und erhaltene Originalquelle. Paket18 Öffnungen schließen bleibt eigenständig.
