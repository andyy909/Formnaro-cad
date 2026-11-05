<p align="center">
  <img src="bilder/formnaro-logo.png" alt="Formnaro" width="200">
</p>

# Formnaro

[English](README.md) | **Deutsch**

**CAD und Netzbearbeitung für Modellbau und 3D-Druck.** Konstruiere Bauteile, bearbeite 3D-Modelle und erstelle technische Zeichnungen. Formnaro läuft lokal unter Windows; die normale Modellierung funktioniert offline.

**Windows 64 Bit · portabel – Programm und separate Quellen:**

| Download | Version | Größe | Inhalt |
| --- | --- | --- | --- |
| **[Programm herunterladen](https://github.com/andyy909/Formnaro-cad/releases/download/v0.125.0-r36/Formnaro-v0.125.0-r36-Windows.zip)** | **0.125.0-r36** | ca. **667 MB** | Portables Programm, benötigte Laufzeiten, Lizenzen und Startanleitung. |
| [Separate Quellarchive](https://github.com/andyy909/Formnaro-cad/releases/tag/v0.125.0-r36) | **0.125.0-r36** | siehe Release | Formnaro-, FreeCAD- und CAD-Kern-Quellen; optionale Downloads zum Weiterentwickeln. |

**Nightly-Ausgabe.** [0.127.0 Nightly r10](https://github.com/andyy909/Formnaro-cad/releases/tag/v0.127.0-r10) ergänzt die lokale STL-Prüfung um gezielte KI-Flächenkorrekturen und eine geprüfte Symmetrierekonstruktion. KI-Chat und Übungen auf einer Projektkopie sind ebenfalls enthalten. [Windows-x64-ZIP](https://github.com/andyy909/Formnaro-cad/releases/download/v0.127.0-r10/Formnaro-v0.127.0-r10-Nightly-Windows-x64.zip).

[Passende r10-Quellen](https://github.com/andyy909/Formnaro-cad/releases/download/v0.127.0-r10/Formnaro-Quellcode-v0.127.0-r10.zip) · [STL-zu-CAD-Anleitung](docs/GEMEINSAMER-KONVERTER.md).

Für die normale Nutzung genügt die Programm-ZIP. Die Quellarchive werden immer als separate Release-Dateien angeboten. [Paketregel](docs/PORTABLE-PAKETE.md).

[Anleitungen](#anleitungen) · [Versionshinweise](https://github.com/andyy909/Formnaro-cad/releases) · [Feedback](https://github.com/andyy909/Formnaro-cad/issues)

| **Easy Tinker** · Lagerhalter (Dark Mode) | **Normal** · Schraubstock (Dark Mode) |
| :---: | :---: |
| [![Easy Tinker mit Lagerhalter und Formenpalette im Dark Mode](docs/bilder/formnaro-easy-lagerhalter-dark.png)](docs/bilder/formnaro-easy-lagerhalter-dark.png) | [![Normal mit Präzisionsschraubstock im Dark Mode](docs/bilder/formnaro-normal-schraubstock-dark.png)](docs/bilder/formnaro-normal-schraubstock-dark.png) |
| **Solid** · ATLAS-5-Portalfräse (Light Mode) | **Fusion** · zweistufiges Schräggetriebe (Light Mode) |
| [![Solid mit ATLAS-5-Portalfräse, fünf Achsen und gekoppeltem A-Antrieb](docs/bilder/formnaro-solid-atlas5.png)](docs/bilder/formnaro-solid-atlas5.png) | [![Fusion mit Konstruktionsschritten und Schräggetriebe mit vier Zahnrädern](docs/bilder/formnaro-fusion-getriebe.png)](docs/bilder/formnaro-fusion-getriebe.png) |

*Echte Programmaufnahmen: Easy Tinker und Normal im Dark Mode aus 0.117.0-r8; Solid mit ATLAS-5 im Light Mode aus 0.120.0-r4; Fusion im Light Mode aus 0.119.0-r2. Zum Vergrößern auf ein Bild klicken.*

## Schnell starten

1. Windows-ZIP herunterladen und vollständig in einen eigenen Ordner entpacken.
2. Alle Unterordner zusammenlassen und **Formnaro.exe** doppelklicken.
3. Ein neues Projekt anlegen oder ein vorhandenes Modell öffnen.

Die Portable-ZIP enthält das Programm, benötigte Laufzeiten, Lizenzen und Startanleitungen. FreeCAD und Python sind enthalten; eine separate Installation ist nicht nötig. Das optionale Modell für Offline-Sprache wird bei Bedarf im Programm heruntergeladen. Die Quellarchive stehen separat auf der Release-Seite.

## Funktionen

- **Bauteile konstruieren:** Grundformen, Skizzen, Bohrungen, Ausschnitte, Rundungen, Loft und Sweep.
- **Maße bearbeiten:** Parameter, Formeln und Varianten für zusammengehörige Teile.
- **Netze bearbeiten:** Modelle importieren, prüfen, reparieren und gezielt verändern.
- **Zeichnungen erstellen:** Ansichten, Schnitte und Bemaßungen als PDF, SVG oder DXF ausgeben.
- **Baugruppen organisieren:** Gelenke, Zahnradkopplungen, Material, Masse, Stücklisten und Explosionsansichten.

STEP, STL, OBJ, 3MF und GLB/glTF ermöglichen den Modellaustausch. Vier Bedienmodi stehen zur Wahl: **Easy Tinker, Normal, Solid und Fusion**. Änderungen lassen sich in der Vorschau prüfen und rückgängig machen.

**Optionale KI-Unterstützung** hilft bei Modellieraufträgen, Referenzfotos und Bedienfragen. Cloud-Anfragen benötigen einen Anbieterzugang und Internet; je nach Anbieter können Kosten entstehen. Python- und FreeCAD-Werkzeuge rechnen lokal.

### ATLAS-5 in Bewegung

![ATLAS-5: X-, Y- und Z-Verfahrt, A-Schwenkwiege mit gekoppeltem Ritzel sowie C-Rundtisch](docs/bilder/formnaro-atlas5-bewegung.gif)

**144 Bauteile, 78 Gelenke und fünf Achsen.** Das kurze GIF zeigt die tatsächlichen Gelenkbewegungen in Formnaro 0.120.0-r4. Wiege und Ritzel sind mit **48:20** gekoppelt und werden gemeinsam vom Y-Träger mitgenommen. [Bearbeitbares Beispiel herunterladen](https://github.com/andyy909/Formnaro-cad/releases/download/v0.120.0-r4/atlas-5.ocad). Das Modell wurde mit Codex (Astra) über die lokale MCP-Schnittstelle von Formnaro konstruiert. Die Animation wurde anschließend in einer getrennten Modellkopie aufgenommen, ohne eine erneute KI-Anfrage während der Aufnahme. Sie demonstriert Kinematik, keine Kontaktkräfte oder Fertigungsfreigabe.

### Getriebe in Bewegung

![Vier Schrägzahnräder mit automatisch gekoppelten Wellen und 6:1 Untersetzung](docs/bilder/formnaro-schraeggetriebe-6zu1.gif)

Zwei Stufen, vier Räder, **6:1 Untersetzung** – ein offenes Getriebekonzept etwa für einen langsamen Drehteller. Nur die Antriebswelle wird bewegt; die übrigen folgen der Kopplung. [Beispielprojekt herunterladen](https://github.com/andyy909/Formnaro-cad/releases/download/v0.119.0-r3/schraeggetriebe-6zu1.ocad). Kinematische Demonstration aus 0.119.0-r2, keine Kontakt- oder Belastungssimulation.

### Übungsmodus

![Übungsmodus: drei Zahnräder erstellen, automatisch einrasten lassen und gekoppelt bewegen](bilder/formnaro-uebungsmodus.gif)

Im eigenen Übungsfenster werden drei Funktionen mit den Bedienelementen von Formnaro gezeigt:

1. **Zahnräder erstellen:** drei Evolventenzahnräder aus der Bibliothek einfügen und ihre Parameter einstellen.
2. **Automatisch einrasten:** die Räder durch Ziehen zusammenführen; dabei entstehen Drehgelenke und Zahnradkopplungen.
3. **Gekoppelt bewegen:** den Antrieb auf −90°, 0° und +90° stellen und die letzte Stellung übernehmen. Das mittlere Rad dreht gegenläufig mit halber Drehzahl.

[Video in voller Qualität mit Modell- und Tokenanzeige (MP4, 1:52)](bilder/formnaro-uebungsmodus-zahnraeder.mp4)

**Von Codex formulierte Aufgabenbeschreibung (GPT-6.1 Sol, xhigh):**

> Zeige im Übungsmodus drei echte Evolventenzahnräder mit 20, 40 und 20 Zähnen, Modul 1,5 mm und Breite 6 mm. Führe das automatische Einrasten durch sichtbares Ziehen vor, zeige anschließend die gekoppelte Bewegung bei Antrieb -90°, 0°, +90° und übernimm die letzte Stellung. Die beiden kleinen Räder laufen gleichsinnig, das mittlere gegenläufig mit halber Drehzahl. Zeige alles gut sichtbar.

Der vorab von Codex erstellte Plan wird im Übungsfenster über die echten Bedienelemente ausgeführt; die Wiedergabe benötigt keine weiteren Modellanfragen. Die eingeblendeten **3.381.395 Tokens inklusive Cache** beziehen sich auf den gesamten Zahnradauftrag mit Planung, Aufnahme und Prüfung.

Aufgenommen mit dem lokal getesteten Entwicklungsstand **0.125.0-r35**. Der oben verlinkte geprüfte Download enthält 0.125.0-r36.

## Anleitungen

| Thema | Weiterlesen |
| --- | --- |
| Bedienung | [Kurzstart](LIES-MICH.txt) · [Handbuch (EN)](docs/USER-GUIDE.md) · [Beispiele](beispiele/README.md) · [Solid](docs/SOLID-MODUS.md) · [Fusion](docs/FUSION-MODUS.md) |
| Konstruktion | [Parameter und Varianten](docs/PROJEKTPARAMETER.md) · [Kurven, Loft und Sweep](docs/CAD-KURVEN.md) |
| Zeichnungen und Baugruppen | [Technische Zeichnungen](docs/TECHNISCHE-ZEICHNUNGEN.md) · [Teile, Material und Stücklisten](docs/TEILE-MATERIAL-BAUGRUPPEN.md) |
| KI-Unterstützung | [KI-Aufträge](docs/KI-AUFTRAEGE.md) · [Foto-Assistent](docs/FOTO-ASSISTENT.md) · [Programm-Assistent](docs/PROGRAMM-ASSISTENT.md) |
| Entwicklung | [Bauanleitung](docs/BUILD.md) · [Architektur](docs/ARCHITECTURE.md) |

<!-- formnaro-development-status:start -->
## Entwicklungsstand

Die portable Ausgabe **0.125.0-r36** erweitert native Modellierung, Fehler- und Speicherbehandlung, revisionsgebundenes Speichern, gezielte Werkzeugauskunft, Schraub- und Kippkopplungen sowie gespeicherte Prüfstände. Bestehende Quellen und ein gemeinsamer Undo-Schritt bleiben erhalten.

Der vollständige lokale Funktionskatalog wurde abgearbeitet: **2906 Node-Tests und 71 Desktop-Prüfgruppen**, ergänzt durch **20 Python-Tests und acht native CNC-Regressionsfälle**. Befunde aus dem ersten Lauf und ihre Nachprüfungen sind im Prüfbericht ausgewiesen. Ein neuer DeepSeek-Harness-Durchlauf prüfte Fehlerkorrektur, explizites Apply und das Erkennen eines veralteten Prüfstands. Die gepackte EXE wurde mit isoliertem Profil, nativem FreeCAD, Speichern und regulärem Prozessende geprüft; das ZIP zusätzlich nach frischem Entpacken in einen Umlautordner aus einem fremden Arbeitsverzeichnis.

Bewegungs- und Abstandsprüfungen gelten für die tatsächlich berechneten Stellungen und Paare. Sie sind keine durchgehende Kontakt-, Last- oder Fertigungsfreigabe. Eine frische Windows-VM-Abnahme ist nicht enthalten. Neue Prüfstände verwenden Projektformat 32; ältere Projekte bleiben lesbar.

Passende Quellen: [Versions-Tag](https://github.com/andyy909/Formnaro-cad/tree/v0.125.0-r36) · [Quellcode-ZIP](https://github.com/andyy909/Formnaro-cad/releases/download/v0.125.0-r36/Formnaro-Quellcode-v0.125.0-r36.zip) · [Prüfbericht](https://github.com/andyy909/Formnaro-cad/releases/download/v0.125.0-r36/Paket-Pruefstand.json) · [Abnahmeumfang](docs/GESAMTPLAN-RELEASE-ABNAHME.md)
[Aktueller veröffentlichter Stand](docs/AKTUELLER-STAND.md)

<!-- formnaro-development-status:end -->

<details>
<summary>Aus dem Quellcode starten</summary>

Mit Node.js 22.16 oder neuer und npm:

```sh
git clone https://github.com/andyy909/Formnaro-cad.git
cd Formnaro-cad
npm ci
npm run build
npm start
```

Für FreeCAD-Funktionen im Entwicklungscheckout: `npm run setup:cad-runtime`. Weitere Laufzeiten, Tests und Paketierung beschreibt die [Bauanleitung](docs/BUILD.md).

</details>

## Mitmachen und Lizenz

Fehler oder Ideen? Erstelle ein [Issue](https://github.com/andyy909/Formnaro-cad/issues). Bei Fehlern helfen die verwendete Version und nachvollziehbare Schritte.

Der eigene Anwendungscode steht unter **[MIT](LICENSE.txt)**. Fremdkomponenten behalten ihre [eigenen Lizenzen](THIRD-PARTY-LICENSES.txt); der kombinierte CAD-Kern ist nicht insgesamt MIT-lizenziert. [Lizenzdetails](docs/LIZENZ-MIT.md) · [CAD-Quellen und Build](licenses/CAD-Quellen-und-Build.txt).

