# Gemeinsame Formnaro-Ausgabe: Gesamtabnahme

Paket 13 prüft den zusammenhängenden Arbeitsablauf der gemeinsamen Anwendung:
**importieren, bearbeiten, konvertieren, speichern, vollständig beenden,
wieder öffnen, weiter bearbeiten und exportieren.** Die eigene Ausgabe 0.32.0
baut auf den Paketen 1–12 auf. Die zusätzlichen Netzverfahren 14–27 bleiben
nachfolgende Arbeitspakete.

Die Abnahme ist nur gültig, wenn die neuen Berichte unter
`work/release-acceptance/checks` erfolgreich sind und `final-audit.json` sowie
`delivery.json` dieselben eingefrorenen Quellen, Programmdateien, Prüfberichte
und Archive bestätigen. Die Beschreibung dieses Prüfverfahrens allein ist
kein bestandener Test. Die abgeschlossenen früheren Ausgaben bleiben erhalten.

## Durchgehender Arbeitsablauf

Der Prüfbestand wird eigens erzeugt. Er enthält technische CAD-Geometrie,
geschlossene und absichtlich offene Netze sowie eine gesperrte Ansichtsvorlage.
Persönliche Modelle, vorhandene Benutzerprofile oder echte Zugangsdaten werden
dabei nicht geöffnet.

| Schritt | Prüfung und erwartetes Ergebnis |
|---|---|
| 1. Importieren | Die normalen Dateiwege lesen die Prüfdateien in dasselbe gemischte Projekt ein. Einheit, Abmessungen, Lage und passende Objektart werden geprüft. Ein offenes Netz bleibt als solches erhalten. |
| 2. Bearbeiten | Die vorhandenen CAD- und Netzwerkzeuge bearbeiten geeignete Teile über die gemeinsame Vorschau und Übernahme. Abbruch verändert nichts; eine bestätigte Änderung besitzt einen gemeinsamen Undo-Schritt. Quellen, gesperrte und unbeteiligte Teile bleiben erhalten. |
| 3. Konvertieren | Ein CAD-Körper wird ausdrücklich als unabhängige Netzkopie erzeugt. Ein geeignetes ausgewähltes Netz wird durch den lokalen Konverter als zusätzlicher CAD-Körper übernommen. Originale und historische Quellenverweise bleiben erhalten. |
| 4. Speichern und beenden | Der normale Speichervorgang erzeugt eine physische Format-8-Projektdatei. Der erste Anwendungsprozess wird vollständig beendet; ein bloßes Neuzeichnen der Szene zählt nicht als Neustart. |
| 5. Wieder öffnen | Ein zweiter Anwendungsprozess öffnet genau die gespeicherte Datei über den normalen Dateidialog. Native BReps, rohe Netzdaten, Quellenverweise, Lage, Farben, Sperren und Organisation werden mit dem gespeicherten Stand verglichen. |
| 6. Weiter bearbeiten | Nach dem erneuten Öffnen bleiben CAD und Netz bearbeitbar. Eine weitere bestätigte Bearbeitung wird erneut gespeichert und der gespeicherte Stand geprüft. |
| 7. Exportieren | Der normale Export erzeugt physische Dateien aus dem wieder geöffneten Projekt. Geeignete native CAD- und Netzteile werden mit passendem Umfang exportiert; exportierte Geometrie, Abmessungen und Lage werden zusätzlich zum Vorhandensein der Datei geprüft. |

Die beiden Anwendungsprozesse müssen regulär mit Exitcode 0 enden. Ihre Berichte
werden der tatsächlich gestarteten EXE und ihrer `resources/app.asar` über
SHA-256 zugeordnet. Die beiden Phasen dürfen nicht auf eine andere, bereits
laufende Benutzerinstanz zurückgreifen.

Projektdateien und Übergabedateien werden bytegenau geprüft. Für neu berechnete
abgeleitete Messwerte werden ausschließlich die Zahlen in `stats` nativer
CAD-Objekte und ihrer nativen CAD-Kinder auf zwölf signifikante Dezimalstellen
verglichen. Die Regel `cad-stats-12-significant-digits-v1`
steht ausdrücklich in den Berichten und der Übergabedatei und wird unabhängig
im Prüflauf sowie im Paketaudit angewandt. BRep, Rezepte, Dreiecke, Transformation,
Quellenverweise, Metadaten und sämtliche übrigen Felder bleiben exakt verglichen.

Für **SVG** geeignete native CAD-Körper und geschlossene, gültige Netzteile
auswählen und den Exportumfang **Ausgewählte Teile** verwenden. Offene oder
beschädigte Netze dürfen im gemischten Projekt bleiben, eignen sich aber nicht
für die vorhandene Körperprojektion. Enthält der Exportumfang solche Teile,
zeigt der Exportdialog jetzt einen verständlichen Hinweis und bleibt geöffnet.
Die Teile werden weder stillschweigend ausgelassen noch repariert. Der Umfang
**Sichtbare Teile** verwendet die dauerhaft sichtbaren Teile; eine vorübergehende
Ansichtsisolation begrenzt den Exportumfang nicht. Ansichtsvorlagen gehören nicht
zur SVG-Produktion. Die Gesamtabnahme prüft sowohl den Hinweis im gemischten
Projekt als auch den anschließenden erfolgreichen Export geeigneter Teile.
Wird der Exportdialog während einer noch laufenden Berechnung geschlossen oder
durch einen anderen Dialog ersetzt, löst das verspätete Ergebnis keine
Dateiausgabe aus und verändert den inzwischen geöffneten Dialog nicht.

## Ergänzende Prüfbereiche

Die zusammenhängende Kette ergänzt die bisherigen Einzelfunktionsprüfungen;
sie ersetzt sie nicht. Für dieselbe neue Ausgabe werden die bestehenden
Oberflächensuiten erneut ausgeführt:

| Bereich | Abgedeckte Wege |
|---|---|
| Native CAD-Funktionen | Native Quellen und Bearbeitungen, Präzisions-/Platzierungswerkzeuge, Dateiaustausch, lokale Schnittstelle und bestehende CAD-Oberfläche |
| Netz-Rechenmodul | Bestehende Grundformen, Boolesche Verfahren, Bohren, Teilen, Materialkörper, Kantenbearbeitung, Quellen, beschädigte/offene Netze und Körperprüfung |
| Gemeinsame Arbeitsfläche | Auswahl, Arbeitsebene, affine Netzbezüge, Objekt-/Quellenbaum, Sichtbarkeit, Organisation und Sperren |
| Übernommene Werkzeuge | Eigenschaften, Maßgriffe, Messen, Anordnen, Passung, Schnittansicht, Text/SVG/Skizzen, Vorlagen und begrenzte bestehende Reparatur |
| CAD als Netzkopie | Qualität, Vergleich, Abbruch, veraltete Ergebnisse, Übernahme, Undo/Redo, Netzbearbeitung und Export |
| Netz als CAD-Kopie | Lokale Konvertierung, affine Lage, geschützte Originale, Vorschau, Revisionsschutz, native Weiterbearbeitung und Export |
| Konverteroberfläche | Flächenanalyse und -korrekturen, Vergleich, Berichte, Begleitnetze, Abbruch, Prozessbereinigung und gemeinsame CAD-Übernahme |
| Gemeinsame KI | Gemeinsamer Anbieter-/Modellspeicher, begrenzte lokale Vorschläge, Verwerfen/Übernehmen und Schutz vor verspäteten Antworten |
| Dateien und Einstellungen | Geprüfte Einstellungsdateien, Neustart, gemeinsame Dateivorgaben, Import mit/ohne KI und atomare gemischte CAD-/Netz-Vorschläge |

Die vorhandene native Grundlagensuite wird für Paket 13 frisch ausgeführt.
KI-Prüfungen verwenden ausschließlich lokale synthetische Anbieterantworten.
**Ohne KI** muss ohne Generierungsanfrage funktionieren. **Mit KI** verwendet
die bestehende gemeinsame Anbindung und die ausdrückliche Prüfung des
Vorschlags; es wird kein echter Cloudaufruf zur Releaseprüfung benötigt.

Abbruch, Escape, Undo/Redo, gesperrte Teile und veraltete Vorschläge werden an
den betroffenen Einzelfunktionswegen geprüft. Die Zahl der Prüfpunkte wird aus
den erfolgreichen Originalberichten abgeleitet. Enthaltene Unterberichte werden
nicht nochmals zu ihren übergeordneten Prüfungen addiert.

## Dateiprüfung und Auslieferung

Der Abschluss prüft die genaue Dateimenge und die SHA-256-Werte der neuen
Runtime und ihres ASAR-Inhalts. Die lokale Konverter-Engine, ihre gepinnten
Quellen und beide WASM-Kerne bleiben Erhaltungsziele. Für eine bereits benutzte
frühere portable Ausgabe werden ausschließlich die ursprünglichen bekannten
Programmdateien ihres eingefrorenen Manifests gelesen. Nachträglich angelegte
private Daten-, Layout- und Projektordner werden nicht durchsucht.

Die portable ZIP wird vollständig auf CRC und alle Einzelhashes geprüft. Sie
enthält die Anwendung, Anleitung, Quellen, passende native Kernelquellen,
Lizenzen und Prüfbelege. Persönliche Modelle, Profile und Zugangsdaten gehören
nicht in die Auslieferung. Die Originalberichte bleiben erhalten; ein späterer
erfolgreicher Lauf überschreibt keinen dokumentierten Fehlversuch.

Neue Ausgabe: `release-formnaro-gesamtabnahme-v0.32.0/Formnaro-win32-x64`.
Portable Archiv: `output/Formnaro-Gesamtabnahme-v0.32.0.zip`.
Das vollständige ZIP in einen eigenen kurzen lokalen Ordner entpacken und
`App/Formnaro.exe` starten. Bestehende portable Benutzerdaten werden nicht
automatisch aus einer früheren Ausgabe kopiert.

## Umfang des abgeschlossenen Zwischenziels

Erfolgreiche Nachweise schließen Paket 13 für die geprüften repräsentativen
Arbeitsabläufe ab: ein gemeinsames Programm, eine Arbeitsfläche, ein gemischtes
Projekt, die übernommenen vorhandenen Werkzeuge und der eingebettete lokale
Konverter. Die geprüften Grenzen der einzelnen Geometrieverfahren bleiben
maßgeblich. Eine Umwandlung rekonstruiert keine ursprüngliche CAD-Historie;
Abweichungsstichproben sind keine garantierte maximale Oberflächenabweichung.

Als nächstes folgt Paket 14 mit gezielter Dreiecks-, Bereichs- und Randwahl.
Reduce, Remesh, lokale Glättung, Make Solid, Aushöhlen und die ausgebaute
Druckprüfung sind weiterhin eigene, noch offene Pakete.
