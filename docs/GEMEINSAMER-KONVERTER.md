# Formnaro 0.28.0: gemeinsamer STL-STEP-Konverter

Paket 9 übernimmt die vorhandene Konverteroberfläche in das gemeinsame Programm.
**STL → STEP** oben bei Import/Export öffnet die Dateiauswahl. Derselbe Konverter
bleibt unter **Funktionen → STL → STEP** erreichbar. Es wird ausdrücklich eine
STL-Datei gewählt. Die direkte Übergabe eines ausgewählten Netzobjekts folgt
mit Paket 11; CAD-Netzkopien folgen mit Paket 10.

## Schritt für Schritt

1. STL-Datei auswählen. Einheit, Abweichungsbudget, Verfahren und Reparaturoption
   einstellen. Die Flächenanalyse zeigt Vorschläge in einer Liste und einer
   eigenen 3D-Ansicht. Die vorhandenen Projektteile bleiben erhalten.
2. Bereiche am Modell oder in der Liste wählen. Strg/Shift ergänzt die Auswahl.
   Dreiecksklick trifft die vordere Fläche; ein Rechteck wählt Dreiecksmitten auch
   hinter anderen Flächen. Bereiche teilen, benachbarte Bereiche verbinden,
   Flächentyp vorgeben oder Originaldreiecke schützen. Die Korrekturen haben
   eigenes Rückgängig/Wiederholen und lassen sich als JSON speichern und laden.
3. **Konvertieren und STEP speichern** anklicken. Die native Engine prüft das
   Ergebnis und den tatsächlichen STEP-Rückimport. Ein abgebrochener Speicherdialog
   erhält das geprüfte Ergebnis zum erneuten Speichern. Projekt und Projekthistorie
   bleiben durch Analyse, Korrekturen, Konvertieren und Dateiausgabe unverändert.
4. Original, Ergebnis, Überlagerung oder Abweichung vergleichen. Prüfbericht,
   reparierte STL/3MF und Ergebnisnetz lassen sich separat speichern.
5. **CAD-Übernahme prüfen** berechnet eine zusätzliche native CAD-Vorschau im
   gemeinsamen Projekt. Das kleine Bestätigungsfenster lässt die Arbeitsfläche
   sichtbar und bedienbar. Der neue Körper liegt auf der aktuellen Arbeitsebene,
   im aktiven sichtbaren und entsperrten Layer/Ordner. Die Einheit wurde bereits
   durch die Konvertierung in Millimeter umgerechnet und wird nicht erneut skaliert.
6. **Übernehmen** fügt den Körper mit genau einem gemeinsamen Rückgängig-Schritt
   hinzu. **Vorschau verwerfen** oder Escape erhält das Konverterergebnis und
   kehrt zur ausführlichen Konverteransicht zurück. Ändert sich das Projekt
   zwischenzeitlich, wird die Übernahmevorschau verworfen und muss neu berechnet
   werden. Ein geprüftes Dateiresultat lässt sich danach erneut vorschlagen.
7. Das gemeinsame Projekt normal speichern und öffnen. Native BReps, Netzdreiecke,
   Quellen, Sperren, Farben und affine Lagen bleiben erhalten. Der übernommene Körper
   kann mit den bestehenden CAD-Werkzeugen bearbeitet und nativ nach STEP exportiert
   werden. Gemeinsame STL-/OBJ-/3MF-/GLB-/glTF-Exporte bleiben verfügbar.

**Berechnung abbrechen** beendet den eigenen Konverterprozess. Erneutes Starten
wartet auf dessen Aufräumen. Schließen oder ein Programmneustart übernimmt keine
laufende Berechnung und keine Vorschau. Bereits bestätigte Projektteile bleiben
in der normalen Autosicherung erhalten. Regionen-Korrekturen lassen sich vor dem
Schließen ausdrücklich speichern.

## Grenzen und erhaltene Daten

Der unveränderte lokale Konverter 0.10.0 verwendet Protokoll 2. Kein Cloudkonto,
Cloudschlüssel oder eigenes Python ist für den Anwender nötig. Er erhält die
ursprüngliche STL-Datei. Rekonstruierte Flächen sind Vorschläge; schwierige Bereiche
können facettiert bleiben. Die ursprüngliche Konstruktionshistorie entsteht dadurch
nicht erneut. Der vollständige Bericht bleibt eine separate Datei; eine kurze
Diagnose und der Dateiname werden am übernommenen CAD-Körper gespeichert.

Abweichungen im Bericht sind beidseitige Stichproben mit Vernetzungsreserve.
Die farbige Ansicht misst dargestellte Ergebnis-Dreiecksmitten gegen das Original.
Beides ist kein mathematisch garantierter Maximalfehler. Geschützte Originaldreiecke
werden zusätzlich in der tatsächlichen STEP auf die vorhandenen Schutzbedingungen
geprüft. Fremde Korrekturdateien werden abgewiesen; Einheit und Budget gehören zur
Quellenbindung. Ein Einheits-/Budgetwechsel verlangt eine neue Analyse.

Es gelten weiterhin 50 MiB STL, 30 MiB STEP, höchstens 20.000 Originaldreiecke im
Flächeneditor und zehn Minuten pro Auftrag sowie die bisherigen Ressourcenbudgets.
Ungültige offene Hüllen werden verständlich abgewiesen. Reparatur wird nur nach
Auswahl angewandt; absichtliche Öffnungen nicht ungeprüft schließen lassen.
Die Konstruktionsteile und Rohnetze im gemeinsamen Projekt bleiben unabhängig davon.

## Prüfungen und Ausgabe

`test:converter-workspace` prüft den gemeinsamen Übernahmevertrag und das native
Dateiprotokoll. `test:converter-workspace-ui` verwendet echte native Konvertierungen
und die normale Oberfläche mit einem gemischten synthetischen Projekt: CAD-Körper,
geschlossenes affines Netz, absichtlich offenes Netz und gesperrte Ansichtsvorlage.
Flächenkorrekturen, Vorschau, Verwerfen, Escape, Revisionswechsel, Übernahme, Undo/Redo,
Berichte, Exporte, tatsächliche Dateien, Abbruch und Neustart werden geprüft.
Daneben bleiben die bisherigen Netz-, Arbeitsflächen-, Werkzeug- und CAD-Suiten.

Separate Nachweise liegen unter `work/converter-workspace/checks`. Quellen und
Prüfberichte werden an dieselbe gestartete EXE/ASAR gebunden; Laufzeitdateimenge,
Rechenkerne, Konverterdateien und die früheren Ausgaben werden bytegenau geprüft.
Das Archiv enthält Anwendung, Anleitungen, Quellen, passende native Kernelquellen,
Lizenzen und Prüfberichte; persönliche Modelle und Zugangsdaten werden nicht kopiert.

Separate Ausgabe:
`release-formnaro-konverter-arbeitsflaeche-v0.28.0/Formnaro-win32-x64`.
Portable ZIP: `output/Formnaro-Konverter-Arbeitsflaeche-v0.28.0.zip`.
Das gesamte ZIP in einen eigenen kurzen lokalen Ordner entpacken, beispielsweise
`C:\Formnaro028`, und `App/Formnaro.exe` starten. Ältere Ausgaben bleiben erhalten.

Paket 9 schließt die Konverteroberfläche ab. Direkte Objektumwandlungen 10/11,
Vereinheitlichung von Dateien/Einstellungen/KI 12 und die Gesamtabnahme 13 bleiben
getrennte nächste Schritte. Neue Meshmixer-Verfahren folgen ab Paket 14.
