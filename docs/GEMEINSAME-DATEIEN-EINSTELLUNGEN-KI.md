# Gemeinsame Dateien, Einstellungen und KI · Paket 12 · Formnaro 0.31.0

## Gemeinsame Vorgaben einstellen

Unter **Einstellungen → Dateien** stehen die Vorgaben für die gemeinsame
Arbeitsfläche:

- Import: Einheit für STL/Netze, Verwendung als Ansichtsvorlage oder bearbeitbares
  Netz und SVG-Höhe. Die CAD-Rekonstruktion als Importverwendung gilt für STL.
- Export: Dateiformat und Umfang, also sichtbare oder ausgewählte Teile.
- Konverter: Abweichungsbudget, Verfahren, erlaubter Facettenrückfall und die
  Reparaturoptionen für STL-Dateien beziehungsweise ausgewählte Szenennetze.

Import-, Export- und Konverterdialoge verwenden diese Vorgaben. Vor dem Start
lassen sich die Werte für den jeweiligen Auftrag anpassen. Die Anzeige- und
Exportqualität bleibt getrennt unter **Einstellungen → Modellieren** einstellbar.
Einheitenlos gespeicherte Netze benötigen eine passende Importeinheit. Bei der
Übergabe eines bereits platzierten Szenennetzes an den Konverter bleibt die
Einheit fest auf Millimeter; seine Skalierung und Lage sind bereits berücksichtigt.

Die Vorgabe für Reparatur wird getrennt verwaltet: ursprünglich ist sie beim
STL-Dateiweg eingeschaltet und beim ausgewählten Szenennetz ausgeschaltet.
Reparatur betrifft den Kandidaten. Absichtliche Öffnungen und technische Details
vor der Übernahme prüfen. Die Konvertergrenzen und die Aussagekraft der
Abweichungsstichproben gelten weiter wie in `NETZ-DIREKT-IN-CAD.md`.

## Einstellungen als Datei übertragen

1. **Einstellungen → Dateien → Einstellungen speichern …** wählen.
2. Die Einstellungsdatei enthält Programmeinstellungen, Anzeige-/Exportqualität,
   Datei-/Konvertervorgaben und gegebenenfalls die aktuelle Oberflächenanordnung.
3. In der gewünschten Programmausgabe **Einstellungen laden …** wählen.
4. Nach erfolgreicher Prüfung **Einstellungen übernehmen** oder **Verwerfen**
   anklicken. Das bloße Auswählen einer Datei ändert noch keine Einstellungen.

Das aktuelle Modell und seine Änderungshistorie bleiben erhalten. Die übertragbare
Datei enthält keine API-Schlüssel, KI-Anbieterprofile, Modelle, Bibliotheken oder
Autosicherungen. Eine Oberflächenanordnung beschreibt die aktuelle Anordnung der
Bedienelemente; benannte Layoutprofile bleiben in ihrer vorhandenen Bibliothek.
Für Projektteile weiterhin das gemeinsame Projekt speichern und öffnen.

Die Datei wird vollständig geprüft, bevor ihre Werte übernommen werden. Bei einem
Speicherfehler versucht Formnaro, die vorherigen Einstellungen wiederherzustellen.
Falls das nicht vollständig gelingt, nennt die Meldung die betroffenen Bereiche.
Unbekannte Zusatzfelder und Formate werden abgewiesen. Die Dateigröße ist auf
256 KiB begrenzt. Einstellungen gehören zur jeweiligen portablen Programmausgabe;
bestehende private Daten werden nicht aus anderen Ausgaben automatisch kopiert.

## Konvertieren mit ausdrücklicher KI-Auswahl

Dateiimport, **STL → STEP** und **Netz → CAD …** bieten denselben Wahlschalter
**Ohne KI** / **Mit KI**. Jeder neue Auftrag beginnt mit **Ohne KI**. Diese Wahl
führt die vorhandenen lokalen Verfahren aus. Eine KI-Auswahl wird nicht als
künftige Zustimmung in Dateivorgaben oder Einstellungsdateien gespeichert.

Für den normalen STL-Import als CAD:

1. **Importieren** öffnen, die STL-Datei wählen und als Verwendung
   **STL als CAD-Körper rekonstruieren** einstellen. Einheit, Verfahren,
   Abweichungsbudget und Reparatur prüfen.
2. Unter **Umwandlung** ausdrücklich **Ohne KI** oder **Mit KI** wählen.
3. **Importieren** öffnet die gemeinsame Konverteransicht und startet die lokale
   Flächenanalyse. Die Datei wird dabei noch nicht als CAD-Körper übernommen.
4. Bei **Ohne KI** anschließend lokal konvertieren. Bei **Mit KI** übernimmt die KI automatisch Einstellungen, alle Flächenbereiche, lokale Konvertierung und die CAD-Übernahmevorschau.
5. Das fertige Ergebnis mit **Übernehmen** oder **Vorschau verwerfen** abschließen. Erst Übernehmen fügt einen CAD-Körper mit einem Rückgängig-Schritt hinzu.

Details, Datenumfang und Grenzen: [KI-STL-AUTOMATIK.md](KI-STL-AUTOMATIK.md). Die bisherige einzelne Flächenkorrektur ist als **KI-Flächenkorrektur manuell** weiterhin verfügbar.

Die Flächenkorrekturen behalten ihr eigenes Rückgängig im Konverter. Änderungen
am Konverterstand entwerten eine vorherige KI-Prüfung. Eine zwischenzeitlich
veraltete Übernahmevorschau muss neu geprüft werden. Beim ausgewählten Szenennetz
verhindert eine Projekt- oder Quellenänderung die Übernahme des alten Ergebnisses.
Seine Einheit bleibt fest Millimeter, einschließlich der bereits berücksichtigten
Skalierung und Scherung.

Im Import- und Szenennetzablauf ist **Konverter-STEP speichern** ein optionaler
Dateiexport des rohen Konverterergebnisses. Diese Datei bezieht sich auf den
Konvertereingang. Für die CAD-Kopie in ihrer aktuellen Szenenposition und mit
späteren Änderungen den normalen gemeinsamen Export verwenden. Dort für die
Kopie allein **Ausgewählte Teile** wählen. Eine Ansichtsisolation begrenzt den
Export nicht. Beim direkten Dateiwerkzeug **STL → STEP** bleibt der Dateiexport
über **Konvertieren und STEP speichern** verfügbar.

Die vorhandene KI-/API-Einrichtung wird unter **Einstellungen → KI / API**
verwaltet. CAD-/Netz-Chat und integrierter Konverter verwenden denselben Anbieter,
dasselbe Modell und denselben geschützten Schlüsselspeicher. Die Konverteranfrage
enthält den Auftrag und begrenzte Flächenzusammenfassungen. Modellgeometrie
und Quelldateipfade werden nicht automatisch übertragen. Der separat gestartete Solo-Konverter behält seine
unabhängige Einrichtung.

Für eine zusätzliche Netzkopie eines CAD-Körpers **CAD → Netzkopie …** wählen.
Die beiden Objektumwandlungen erzeugen unabhängige zusätzliche Objekte und
bewahren ihre Quellen.

## Gemeinsame KI-Vorschau für CAD und Netz

Der Chat erhält die Objektarten und die verfügbaren Werkzeuge des gemeinsamen
Projekts. Vorhandene CAD- und Netzwerkzeuge können in einem Vorschlag aufeinander
folgen. Die jeweiligen Rechenmodule prüfen die Schritte zunächst in einem
Kandidaten. Erst die bestätigte gemeinsame Übernahme erzeugt einen Projektstand
mit einem Rückgängig-Schritt. Fehler, Abbruch oder eine veraltete Revision ändern
keinen bestätigten Zwischenstand.

Gemeinsame Befehle unterstützen Namen, Maße und affine Lage, Spiegelung, Farbe,
Deckkraft, Notizen und Sichtbarkeit sowie Duplizieren, Löschen, Ausrichten,
Absetzen, Anordnungen und die vorhandene Organisation. Sie erhalten die
ursprünglichen Netzpunkte. CAD-Konstruktionsparameter bleiben an CAD gebunden.

Für bearbeitbare Netze sind die vorhandenen Grundformen, Gruppieren, Teilen,
Bohren, Fasen/Runden geeigneter Kanten, Materialkörper herauslösen, Gruppen
auflösen, Material-/Lochrolle und die bisherige begrenzte Reparatur erreichbar.
Erhaltene Netzquellen können über ihre verfügbaren numerischen Parameter,
Lage- und Erscheinungswerte bearbeitet werden. Text/Schrift, freie Konturen,
Plugininstallation und grafische Skizzen bleiben die ausdrücklich bedienten
Werkzeuge der Oberfläche. Eine CAD-Netz-Umwandlung bleibt ein eigenes Werkzeug.

Körperverfahren verlangen eine erfolgreiche Prüfung im Netz-Rechenkern. Bei
offenen oder beschädigten Netzen stehen zunächst gemeinsame Lage-/Stiländerungen
und die ausdrücklich angeforderte bisherige Reparatur zur Verfügung. Diese
Reparatur bleibt auf 40.000 Dreiecke begrenzt; kleine Öffnungen werden nur auf
ausdrücklichen Wunsch geschlossen. Kantenbearbeitung verwendet aktuelle,
geometriegebundene Kantenbezüge. CAD- und Netzteile werden jeweils mit den zu
ihrer Objektart passenden Verfahren bearbeitet.

Sperren, Quellen und unbeteiligte Teile bleiben auch bei KI-Vorschlägen verbindlich.
CAD- und Netzgeometrie behalten ihre jeweilige Darstellung und Genauigkeit.
Neue Meshmixer-Verfahren aus den späteren Paketen werden dadurch nicht ergänzt.
KI-Vorschläge bleiben vom technisch zulässigen Werkzeugumfang abhängig.

## Ausgabe und Nachweise

Separate Ausgabe:
`release-formnaro-gemeinsame-ablaeufe-v0.31.0/Formnaro-win32-x64`.
Portable ZIP: `output/Formnaro-Gemeinsame-Ablaeufe-v0.31.0.zip`.
Das gesamte Archiv in einen eigenen kurzen lokalen Ordner entpacken, etwa
`C:\Formnaro031`, und `App/Formnaro.exe` starten. Frühere Ausgaben bleiben erhalten.

Eigene Nachweise unter `work/unified-workflows/checks` binden die überprüften
Quellen und tatsächlichen Programmdateien. Für die Veröffentlichung sind
übereinstimmende Quell-/EXE-Prüfberichte, `final-audit.json`, `archives.json` und
`delivery.json` maßgeblich. Eine Implementierung allein ersetzt diese Abnahme
nicht. Die unveränderten nativen Rechenkerne und Konverterdateien werden
bytegenau geprüft; persönliche Modelle, Profile und Schlüssel gehören nicht
in die Ausgabe.

Paket 12 verbindet die vorhandenen Abläufe. Paket 13 prüft anschließend die
vollständige gemeinsame Ausgabe. Neue Netzverfahren ab Paket 14 bleiben
eigenständige Arbeitspakete.
