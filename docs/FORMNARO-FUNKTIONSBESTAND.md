# Zu erhaltender Funktionsbestand

Stand: CAD 0.23.0, Netz 0.21.0, lokaler Konverter 0.10.0 / Protokoll 2.
Diese Liste ist die Übernahmeliste für Paket 1 des Gesamtplans. Eine Funktion
gilt erst nach einer Prüfung im gemeinsamen Programm als übernommen. Vorhandene
Einzelfunktionen sind keine Zusage für beliebige Geometrien.

Die genaue Liste der Oberflächenbefehle mit ihren Quelldateien wird beim
Sichern erzeugt: `cad-functions.json` und `netz-functions.json` neben dem
lokalen Sicherungsbericht. Jeder Eintrag beginnt mit Status `pending`.
Die folgende Tabelle ergänzt diese Befehle um Dateiwege, Daten und Bedienabläufe,
die sich nicht durch einzelne Schaltflächen erfassen lassen.

| Bereich | Erhaltene Funktionen / Daten | Bestehende Quellen | Prüfgrundlage für die Übernahme |
|---|---|---|---|
| Native CAD-Geometrie | Grundformen, physische Formparameter, Originalkonturen für Text/SVG, Schriftbibliothek, Form-Plugins, maßgebliche BRep-Geometrie | `src/cad-recipes.js`, `cad-self-contours.js`, `cad-sketch.js`, `cad-template-recipes.js` | Native Foundation, Originalkonturen, Schriftkorpus, Plugin-/Skizzenprüfungen |
| CAD-Konstruktion | Vereinigen, Ausschneiden, Schnittmenge, Quellenbaum, Unterdrücken, Quelle bearbeiten/entfernen, Auflösen, Mehrfarbquellen | `cad-service.js`, `cad-tools-native.js`, `cad-command-router.js`, `cad-form-controls.js` | Native Gruppierungs-, Historien-, Affin- und Volumenprüfungen |
| CAD-Kanten / Bezüge | Abrunden/Fasen mit Herkunft, Flächen-/Kanten-/Punktbezüge, Bohren, Platzieren, Magnet, Teilung, Materialkörper, Markierungen | `cad-finish-native.js`, `cad-topology-native.js`, `cad-tools-ui.js`, `cad-partition-native.js`, `cad-extraction-native.js`, `cad-annotations-native.js` | Kanten-, Bezugs-, Platzierungs-, Teilungs-, Extraktions- und Markierungsprüfungen |
| Netz-Geometrie | Grundformen und Parameter, importierte Dreiecke, Text/SVG, Form-Plugins; Manifold als eigener Rechenkern | Netz: `geometry.js`, `mesh-import.js`, `mesh-fonts.js`, `mesh-sketch.js`, `plugins.js` | Netzregressionen und echte Netz-EXE |
| Netz-Konstruktion | Boolesche Gruppen, Löcher, Schnittmenge, Quellenhistorie, Bohrassistent, Bezugspunktplatzierung, Auf-Fläche-Legen, geprüfte gerade Außenkanten, Ebenenteilung und Materialkörper | Netz: `analysis-worker.js`, `mesh-reference.js`, `mesh-face-floor.js`, `mesh-edge-finish.js`, `mesh-partition.js` | Netz-, Bezugs-, Kanten- und Teilungsprüfungen; Hohlräume und kleine Körper erhalten |
| Begrenzte Netzreparatur | Nullflächen/Duplikate, Orientierung und exakt kollineare Nachbarkanten; optional geeignete kleine Lücken; bisher Größenlimit 40.000 Dreiecke | Netz: `mesh-stl-repair.js`; CAD: `cad-stl-repair.js` | Vorher/Nachher, unveränderte Punktkoordinaten, ungeeignete Fälle ablehnen |
| Gemeinsame Bedienung | Auswahl, Mehrfachauswahl, Rahmen, Objekt-/Quellenbaum, Kopieren/Einfügen, Duplizieren, Löschen, Namen, Farben, Deckkraft, Notizen, Sperren, Ausblenden | `cad-main.js`, `cad-interface.js`, `cad-renderer.js`; Netz: `main.js` | Oberfläche, Sperren, Quellen und übrige Objekte |
| Position und Maße | Verschieben, Drehen, Spiegeln, Skalieren, Maßfelder/Griffe, Ecke/Lift, Ausrichten, Absetzen, Raster, Lineal, Reihen-/Kreis-Anordnung | `cad-affine.js`, `cad-interface-state.js`, `cad-tools-ui.js`; Netz: `scene-tools.js`, `scene-tools.js` | Welt-/lokale Achsen, gespiegelte und gescherte Transformationen, numerische Maße |
| Arbeitsfläche | Perspektive/Orthografie, Standardansichten, Einpassen, Isolation, gemeinsame Arbeitsebene, Welt-/Ebenenkoordinaten, Layer und Ordner | `cad-renderer.js`, `cad-workspace.js`, `cad-interface-state.js`; Netz: `coordinates.js`, `workplane-tools.js`, `organization.js` | Auswahl/Sichtbarkeit und Kamera nach Wiederöffnen |
| Analysen | Messen, Schnittansicht, Kollision/Passung; CAD nativ, Netz stichprobenbasierte Wandstärke und Hinweise | `cad-analysis-native.js`, `cad-tools-ui.js`; Netz: `model-analysis.js`, `measure-tools.js` | Leere Ergebnisse, Fehlerfälle; Stichproben ausdrücklich kennzeichnen |
| Dateien | CAD: STEP/STP, SVG, STL-CAD und STL/OBJ-Referenzen; beide: 3MF/GLB/glTF mit Namen, Farben, mm-Maßen und Baugruppenlage | `cad-main.js`, `cad-step-io.js`, `exchange-formats.js`; Netz: `mesh-import.js` | Bestehende Austauschprüfungen einschließlich externer lokaler BIN-Datei und Abbruch |
| Export | CAD: STEP, STL, OBJ/MTL, 3MF, GLB, glTF, SVG; Netz: STL, OBJ/MTL, 3MF, GLB, glTF, SVG; Auswahl und dauerhafte Sichtbarkeit | `cad-service.js`, `cad-mesh-formats.js`; Netz: `exports.js` | Dateischreiben, unabhängiges Lesen, Maße/Farben/Transformationen; STEP nur aus CAD |
| Projekte | CAD-Formate 5/7; Netz 1–4/6 und begrenztes gzip; Quellen/Parameter, Bett, Organisation, Lineal, Arbeitsfläche; Projektübersicht/Vorschaubilder | `cad-project.js`, `cad-persistence.js`, `cad-projects-ui.js`; Netz: `main.js`, `mesh-project-file.js` | Originale nie überschreiben, neue Datei bei Migration; vollständiger Rundlauf |
| Zustandsänderung | Vorschau/Übernehmen/Abbrechen, Undo/Redo, Revisionsprüfung, abgesagte Worker, Wiederherstellung/Autosicherung | `cad-transactions.js`, `cad-controller.js`, `cad-recovery.js`; Netz: `edit-transaction.js`, `mesh-worker-session.js`, `history.js` | Veraltete/fehlerhafte Ergebnisse ändern bestätigten Stand nicht |
| Konverter | Lokaler STL→STEP-Prozess, Einheiten/Toleranzen, Reparaturoptionen, Flächenanalyse, Bereich teilen/verbinden/korrigieren/schützen, eigene Korrekturhistorie, Original/Ergebnis/Überlagerung, Abweichungsstichproben, Berichte | `backend/stl-converter.cjs`, `cad-stl-converter.js`, `cad-stl-workbench.js`, `converter/provenance.json` | Quellenhash, Ausgabehash, Abbruch, native STEP-Prüfung; bisherige Größen-/Zeitbudgets |
| Einstellungen | Layouts/Seitenleisten, Darstellung/Exportqualität, lokale Programmdaten, Bibliotheken, Sprache, Shortcuts, Hilfe/Impressum, Fehlerprotokoll | `cad-interface-settings.js`, `layout*.js`, `program-storage*.js`, `backend/*storage*`, `backend/error-log.cjs` | Isoliertes Profil, keine privaten Daten in Auslieferungen |
| Lokale KI / Automatisierung | Szene/Kontext, Typen/Werkzeuge, Befehlsschema, Maß-/Achsenregeln, Vorschauprüfung, Fehlerdetails, Zugriff über lokale Bridge/MCP; vorhandene Chat-/Modelloberfläche | `cad-ai-context.js`, `cad-automation-access.js`, `command-schema.js`, `backend/ai*.cjs`, `scripts/offlinecad_ai.py` | Synthetische Anbieterantworten, kein Auto-Apply; Schlüssel/Token außerhalb von Projekten |
| Auslieferung / Leistung | Separate portable EXE, Lizenzen und Kern-/Konverterquellen; Render-/Geometriecaches, Workerabbruch, dichtes Netz, numerische Präzision | `scripts/package-*.mjs`, `cad-renderer.js`, `cad-worker-client.js`; Netz: `mesh-worker-session.js`, `mesh-snapshot.js` | Gepackte EXE, ASAR-/Archivhashes, Export und Wiederöffnen; alte Ausgaben unverändert |

## Geeignete Prüfkörper

- Gebohrte Platte und Gehäuse: Maße, Bohrungen, CAD-Quellen und geschlossene Netze.
- Offene Platte mit absichtlichem Durchbruch: Anzeigen/Speichern ohne Zwangsreparatur.
- Hohlkörper mit separatem kleinem Materialkörper: Innenraum und Bestandteile erhalten.
- Gespiegelte Baugruppe mit gesperrter Quelle in ausgeblendetem Ordner: Metadaten,
  Affinmatrizen, Sichtbarkeit und unveränderte unbeteiligte Teile.
- Dichtes Netz und sehr dünne Wand: Reaktionsfähigkeit und klar bezeichnete Messgrenzen.

Es werden synthetische Prüfkörper verwendet. Private Modelle, Profile, Layouts
und Zugangsdaten gehören weder in diese Liste noch in die Sicherungsarchive.

## Übernahme in Paket 6 (0.25.0)

Die konstruktiven Netzverfahren sind im gemeinsamen Programm angeschlossen:
Grundformen/Generatoren, Rollen, drei Boolesche Wege, Bohrassistent, Ebenenteilung,
Materialkörper, vorhandene gerade Außenkanten/Randkonturen sowie erhaltene
Quellen bearbeiten, aussetzen und auflösen. Gemeinsame Vorschau, Abbruch,
Rückgängig, Speichern/Öffnen und Export werden mit synthetischen Teilen geprüft.
Die übrigen Netz-Bedien- und Analysewerkzeuge einschließlich Text/SVG,
Flächenbezügen und Werkzeugparität bleiben der Abgleich für Paket 7/8.
Neue Meshmixer-Verfahren sind damit nicht vorgezogen.

## Übernahme in Paket 8 (0.27.0)

Die verbleibenden Netz-Eigenschaften und Bedienwerkzeuge sind über die gemeinsame
Oberfläche angeschlossen. Der vollständige Befehlsabgleich ist in
[WERKZEUG-ABGLEICH.json](WERKZEUG-ABGLEICH.json) enthalten: 44 Netz- und 46 CAD-Befehle
mit aktuellem Weg und zugehörigen Prüfsuiten. Ein registrierter Befehl allein ist
keine Ablaufabnahme; die Suiten prüfen die darunterliegenden Arbeitsabläufe.

| Bisheriger Bereich | Gemeinsamer Weg / Erhalt |
|---|---|
| Name, Farbe, Deckkraft, Notizen, Sperren; Verschieben/Drehen/Spiegeln/Maße | Gemeinsame Eigenschaften, numerische Felder, Eck-/Höhen-/Liftgriffe, Absetzen; gesperrte Layer/Ordner beachten |
| Reihen, Raster, Kreis; Passungen | Weitere Netz-Werkzeuge, vollständige Affinmatrizen, Vorschau/Abbruch/ein Undo; Druckspiele speichern/entfernen, Lochgegenstück ausdrücklich |
| Messen, Lineal, Bezugspunkte, Auf-Fläche-Legen, Magnet | Gemeinsame Treffer und Koordinaten, CAD-BRep-Abfrage/gespeicherte Netzdreiecke; äußere Stützflächen und native Zielbezüge |
| Schnittansicht und bestehende Modellprüfung | Beide Kerne, reine Ansicht mit gespeichertem Abschnitt; Netz-Wandstärke als Stichprobe, keine CAD-Netz-Kollision |
| Text, SVG, Skizzen, Formpakete | Originalschriften und Konturen, SVG-Innenräume, grafischer Skizzeneditor mit Formeln, bestehende Format-1-Pakete; ausdrücklich als Netz erzeugen |
| Quellenhistorie und Farben | Virtuelle Quellenpfade, Farbe/Deckkraft/Notiz, Text-/SVG-/Skizzenbearbeitung; Quellenfarben in Darstellung und farbfähigen Exporten |
| Bisherige begrenzte Reparatur | Vorhandenes Verfahren bis 40.000 Dreiecke; Ausgangsstand erhalten, optionale kleine Lücken, Fehler ohne Übernahme |
| Persönliche Vorlagen | CAD/Netz/gemischte Auswahl speichern und einfügen; eigene Bibliotheksversion 8, alte CAD-Dateien erhalten; Größen-/Positionsformeln |
| SVG und Austauschdateien | Gemeinsame SVG-Projektion; vorhandene STL/OBJ/MTL/3MF/GLB/glTF-Wege erhalten, Quellenfarben ergänzt; STEP aus CAD |
| Übrige CAD-Werkzeuge/Konverter | Vorhandene native Wege und Rechenkerne erhalten, bestehende CAD-Oberflächensuite/EXE-Prüfung; weitere Konverterübernahme bleibt Paket 9 |

Persönliche alte Netzbibliotheken, Einstellungen und KI-Werkzeugfreigaben werden
mit Paket 12 zusammengeführt. Direkte CAD-/Netzkonversionen bleiben Paket 10/11;
neue Meshmixer-Werkzeuge bleiben Paket 14–27. Anleitung und Verfahrensgrenzen:
[EIGENSCHAFTEN-UND-WERKZEUGE.md](EIGENSCHAFTEN-UND-WERKZEUGE.md).
