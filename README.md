# Formnaro

**Deine lokale 3D-Werkstatt für Windows.**

Mit Formnaro konstruierst du technische Teile, bearbeitest 3D-Modelle und bereitest eigene Ideen für Modellbau und 3D-Druck vor. CAD-Körper, Netze, Skizzen und technische Zeichnungen stehen in einer Anwendung zur Verfügung. Die normale Modellierung funktioniert offline; Projekte bleiben auf deinem Rechner.

## Herunterladen

### [Formnaro 0.113.1-r5 für Windows herunterladen](https://github.com/andyy909/Formnaro-cad/releases/download/v0.113.1-r5/Formnaro-v0.113.1-r5-Windows.zip)

**Windows · 64 Bit · portable**

[Versionshinweise, Prüfbericht und Prüfsummen](https://github.com/andyy909/Formnaro-cad/releases/tag/v0.113.1-r5) · [Alle Versionen](https://github.com/andyy909/Formnaro-cad/releases)

1. ZIP-Datei herunterladen und vollständig in einen eigenen Ordner entpacken.
2. `App/Formnaro.exe` starten. Alle Unterordner, Laufzeiten und Lizenzen zusammenlassen.
3. Eigene Einstellungen und Werkzeuge bei Bedarf über den bisherigen Datenordner mitnehmen.

Persönliche Modelle, Profile und Zugangsdaten sind nicht enthalten. FreeCAD-Funktionen benötigen weiterhin eine separate lokale FreeCAD-Installation.

## Neu in 0.113.1-r5

- **Mehr Modellfläche:** kompakte Kopf- und Werkzeugleisten in Solid und Fusion.
- **Dateiaktionen oben:** Neu, Öffnen, Speichern, Projekte, Import, Export und Einstellungen zwischen Modellname und Modusauswahl.
- **Zusatzfunktionen im Menü:** KI-Werkstatt, Projektfotos und Merkmalsfunktionen unter Extras beziehungsweise Dienstprogramme.
- **Eine gemeinsame Zeile:** Schnellaktionen und Werkzeugregister nebeneinander.
- **Modusname Fusion:** vertraute Befehle und bisherige Bedienung erhalten.
- **Fehlerkorrekturen enthalten:** robuster Start, geschützte Speicherdateien, verbesserte Theme-Umschaltung und lokale Skriptausführung.
- **CAD-Erweiterungen seit 0.111:** Bézier-/B-Spline-Kurven, Mehrprofil-Lofts, zusammengesetzte Sweeps sowie Flächen und Prägung/Vertiefung.

Die letzte Layoutänderung besteht **39 gezielte Prüfgruppen an der tatsächlichen Windows-EXE** und vier visuelle Paketprüfungen. Vorherige Wartungs- und Oberflächenprüfungen sind im Prüfbericht getrennt aufgeführt. Kein erneut ausgeführter allgemeiner Gesamttest für diese Layoutänderung.

### Aktuelle Oberfläche: Solid und Fusion

Diese Aufnahmen stammen aus der geprüften Windows-Ausgabe 0.113.1-r5.

![Kompakte Solid-Oberfläche mit Dateiaktionen neben dem Modellnamen](bilder/solid-r5.png)

![Fusion mit gemeinsamer Schnellaktions- und Registerzeile](bilder/fusion-r5.png)

## Was du mit Formnaro machen kannst

- **Einfach einsteigen:** Grundformen platzieren, Maße ändern, Teile verschieben, ausrichten, spiegeln und gruppieren.
- **Technisch konstruieren:** Skizzen, Maßformeln, Projektparameter und Varianten sowie CAD-Werkzeuge für Anbauten, Ausschnitte, Bohrungen und weitere Formänderungen verwenden.
- **3D-Druck-Modelle bearbeiten:** STL- und andere Netzmodelle importieren, prüfen, gezielt reparieren und mit Netzwerkzeugen bearbeiten; CAD über STEP austauschen.
- **Zeichnungen erstellen:** Technische Ansichten und Bemaßungen anlegen und als PDF, SVG oder DXF ausgeben.
- **Mit Referenzbildern arbeiten:** Projektfotos speichern, ebene Bilder entzerren und bestätigte Vorder-, Seiten- und Draufsichten zu einer bearbeitbaren CAD-Variante verbinden.
- **Optional KI nutzen:** Modellieraufträge, Foto-Unterstützung und Programmhilfe über einen eingerichteten Anbieter verwenden. Lokale Python-Werkzeuge sind enthalten; FreeCAD-Funktionen benötigen eine zusätzliche lokale FreeCAD-Installation.

Änderungen lassen sich vor der Übernahme in einer Vorschau prüfen und anschließend rückgängig machen. Für KI-Anfragen an einen Cloud-Anbieter wird eine Internetverbindung benötigt; abhängig vom eingerichteten Zugang können Anbietergebühren anfallen.

## Feste Vorgaben für KI-Aufträge

Ziel, Annahmen, geschützte Quellen und native Sollprüfungen bleiben beim gespeicherten Auftrag erhalten. Die folgende Aufnahme stammt aus der geprüften Ausgabe 0.111.0-r2 und zeigt ein synthetisches Testbeispiel.

![Auftragsvorgaben mit festem Ziel und nativer Maßprüfung](bilder/ki-auftragsvorgaben.png)

## Ein Blick ins Programm

Die folgenden Bildschirmbilder stammen aus der geprüften Windows-Ausgabe 0.108.0 und zeigen mitgelieferte Testbeispiele.

### Easy Tinker – Formen und Maße direkt im Blick

Die vereinfachte Oberfläche bietet eine Formenpalette, direkte Größenfelder und Griffe zum Verschieben und Drehen.

![Easy Tinker mit Formenpalette und direkt bearbeitbaren Maßen](bilder/easy-tinker.png)

### Solid – Werkzeuge und Modellbaum

Vier Bedienmodi stehen zur Wahl: **Easy Tinker, Normal, Solid und Fusion**. Hier ist der Solid-Modus mit dunkler Darstellung zu sehen.

![Solid-Modus mit Werkzeugregistern, Modellbaum und ausgewähltem CAD-Körper](bilder/solid-modus.png)

### Skizzen – Konturen, Öffnungen und Formeln

Bearbeitbare Skizzen verbinden technische Konturen mit benannten Maßen und Maßbeziehungen.

![Skizzeneditor mit Bohrungen, Langloch und benannten Maßen](bilder/skizzen.png)

### Neu in 0.108.0 – technische Fotoansichten verbinden

Bestätigte Vorder-, Seiten- und Draufsichten teilen sich Nullpunkte und Zielmaße. Aus den Profilen entsteht eine native CAD-Vorschau; jede Ansicht und die Funktionsmaße werden vor der Übernahme geprüft.

![Native CAD-Vorschau aus drei bestätigten technischen Ansichten](bilder/technische-fotoansichten.png)

Bilder zeigen nur sichtbare Konturen. Verdeckte Innengeometrie und die spätere Passung eines gedruckten Teils müssen gesondert geklärt und geprüft werden.

## Geprüfte Ausgabe

**0.111.0-r2** ist die aktuelle veröffentlichte Programmversion. Die technische Abnahme umfasst **524 Tests am eingefrorenen Quellstand und 929 Prüfgruppen in 21 Läufen der tatsächlichen Windows-Anwendung**, darunter 19 Auftrags-UI- und 41 Neustartprüfungen über zwei echte Anwendungsprozesse. Die ursprüngliche Projektpaketdatei wurde zwischen den Prozessstarts entfernt; die gesicherte Basis und ihre Referenzen bleiben wiederherstellbar. KI-Anbieterantworten wurden simuliert. Der [Prüfbericht](https://github.com/andyy909/Formnaro-cad/releases/download/v0.111.0-r2/Pruefergebnis.json) beschreibt Umfang und Grenzen. Die weiteren Ausbaupakete 6–10 sind noch offen.

Die Anleitungen liegen im Download unter `App/docs` und hier im Verzeichnis [docs](docs).

## Vollständiges Projekt und Entwicklung

Dieses Repository enthält außerdem eine eigenständige Kopie des vollständigen Projektstands **0.111.0-r2**: Anwendung, beide Mini-Versionen, CAD-Kern, Tests, Buildskripte, Anleitungen und Lizenzen. Die Kopie ist vom privaten Original unabhängig. Änderungen an diesem Repository verändern das private Original nicht.

| Verzeichnis | Inhalt |
| --- | --- |
| `src`, `backend`, `electron.cjs`, `preload.cjs` | Anwendung und Desktop-Anbindung |
| `cad-kernel-build`, `converter`, `python-runtime`, `speech-runtime` | CAD-Kern sowie Laufzeit- und Buildgrundlagen |
| `mini`, `mini-cad` | Eigenständige Mini-Versionen |
| `tests`, `scripts` | Prüfungen, Build- und Paketwerkzeuge |
| `docs`, `ai`, `licenses` | Anleitungen, Schnittstellen und Lizenztexte |

Für die lokale Entwicklung mit Node.js 22.16 oder neuer:

```powershell
git clone https://github.com/andyy909/Formnaro-cad.git
cd Formnaro-cad
npm ci
npm run build
npm start
```

Zusätzliche Konverter-, Sprach- und FreeCAD-Funktionen benötigen die in ihren Anleitungen beschriebenen Laufzeiten. Wer das fertige Programm nutzen möchte, verwendet den Windows-Download oben.

Die [bisherige ausführliche Projektbeschreibung](README-Entwicklung.md) enthält die Entwicklungshistorie; einzelne ältere Versionsangaben sind dort historisch. Der [technische Projektkontext](docs/PROJEKTKONTEXT.md) beschreibt den Stand 0.111.0-r2.

Der eigene Anwendungscode steht unter der [PolyForm Noncommercial License 1.0.0](LICENSE.txt). Fremdkomponenten behalten ihre jeweiligen Lizenzen; siehe [Drittanbieterhinweise](THIRD-PARTY-LICENSES.txt). Persönliche Datenordner, Profile, Zugangsdaten und lokale Arbeitsdateien sind nicht Teil der Projektkopie.
