<p align="center">
  <img src="bilder/formnaro-logo.png" alt="Formnaro" width="200">
</p>

# Formnaro

**CAD und Netzbearbeitung für Modellbau und 3D-Druck.** Konstruiere Bauteile, bearbeite 3D-Modelle und erstelle technische Zeichnungen. Formnaro läuft lokal unter Windows; die normale Modellierung funktioniert offline.

**Windows 64 Bit · portabel – zwei Downloads zur Auswahl:**

| Download | Version | Größe | Inhalt |
| --- | --- | --- | --- |
| **[Nur das Programm herunterladen](https://github.com/andyy909/Formnaro-cad/releases/download/v0.122.0-r3/Formnaro-v0.122.0-r3-Windows.zip)** | **0.122.0-r3** | ca. **671 MB** | Kleine Portable-Version mit benötigten Laufzeiten, Lizenzen und Beispielen; ohne Entwicklungswerkzeuge und eigene Tests. |
| **[Großes Entwicklungspaket herunterladen](https://github.com/andyy909/Formnaro-cad/releases/download/v0.120.0-r4/Formnaro-v0.120.0-r4-Windows.zip)** | **0.120.0-r4** | ca. **1,9 GB** | Bisheriges, ungekürztes Paket mit zusätzlichen Entwicklungs- und Testbestandteilen. |

Für die normale Nutzung genügt **„Nur das Programm“**. Das große Paket ist die ältere Ausgabe **0.120.0-r4**; die kleine Portable-Version ist **0.122.0-r3**. Den Quellcode zum Weiterentwickeln findest du zusätzlich in den Quellenarchiven der jeweiligen [Version](https://github.com/andyy909/Formnaro-cad/releases).

[Anleitungen](#anleitungen) · [Versionshinweise](https://github.com/andyy909/Formnaro-cad/releases) · [Feedback](https://github.com/andyy909/Formnaro-cad/issues)

| **Easy Tinker** · Lagerhalter (Dark Mode) | **Normal** · Schraubstock (Dark Mode) |
| :---: | :---: |
| [![Easy Tinker mit Lagerhalter und Formenpalette im Dark Mode](docs/bilder/formnaro-easy-lagerhalter-dark.png)](docs/bilder/formnaro-easy-lagerhalter-dark.png) | [![Normal mit Präzisionsschraubstock im Dark Mode](docs/bilder/formnaro-normal-schraubstock-dark.png)](docs/bilder/formnaro-normal-schraubstock-dark.png) |
| **Solid** · ATLAS-5-Portalfräse (Light Mode) | **Fusion** · zweistufiges Schräggetriebe (Light Mode) |
| [![Solid mit ATLAS-5-Portalfräse, fünf Achsen und gekoppeltem A-Antrieb](docs/bilder/formnaro-solid-atlas5.png)](docs/bilder/formnaro-solid-atlas5.png) | [![Fusion mit Konstruktionsschritten und Schräggetriebe mit vier Zahnrädern](docs/bilder/formnaro-fusion-getriebe.png)](docs/bilder/formnaro-fusion-getriebe.png) |

*Echte Programmaufnahmen: Easy Tinker und Normal im Dark Mode aus 0.117.0-r8; Solid mit ATLAS-5 im Light Mode aus 0.120.0-r4; Fusion im Light Mode aus 0.119.0-r2. Zum Vergrößern auf ein Bild klicken.*

## Schnell starten

1. Windows-ZIP herunterladen und vollständig in einen eigenen Ordner entpacken.
2. Alle Unterordner zusammenlassen und **„Formnaro starten“** doppelklicken.
3. Ein neues Projekt anlegen oder ein Beispiel öffnen.

Die kleine Portable-ZIP enthält das ausführbare Programm mit den benötigten Laufzeiten, Lizenzen und drei Beispielmodellen – ohne Entwicklungswerkzeuge und Testdateien. FreeCAD und Python sind enthalten; eine separate Installation ist nicht nötig. Das optionale Modell für Offline-Sprache wird bei Bedarf direkt im Programm heruntergeladen. Zum Starten wird nur die Windows-ZIP benötigt; die separaten Quellenarchive sind für Entwickler.

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

### KI in Aktion

![KI-Übungsmodus: Formnaro führt die Modellierschritte für eine Platte mit Bohrung im eigenen Übungsfenster vor](bilder/formnaro-uebungsmodus.gif)

Das GIF zeigt die Wiedergabe eines zuvor von DeepSeek erzeugten Plans, ohne Live-KI-Anfrage während der Aufnahme. Der begrenzte Übungsmodus ist im neuen Entwicklungsdownload enthalten und arbeitet in einem getrennten Übungsfenster.

## Anleitungen

| Thema | Weiterlesen |
| --- | --- |
| Bedienung | [Grundlagen](LIES-MICH.txt) · [Solid](docs/SOLID-MODUS.md) · [Fusion](docs/FUSION-MODUS.md) |
| Konstruktion | [Parameter und Varianten](docs/PROJEKTPARAMETER.md) · [Kurven, Loft und Sweep](docs/CAD-KURVEN.md) |
| Zeichnungen und Baugruppen | [Technische Zeichnungen](docs/TECHNISCHE-ZEICHNUNGEN.md) · [Teile, Material und Stücklisten](docs/TEILE-MATERIAL-BAUGRUPPEN.md) |
| KI-Unterstützung | [KI-Aufträge](docs/KI-AUFTRAEGE.md) · [Foto-Assistent](docs/FOTO-ASSISTENT.md) · [Programm-Assistent](docs/PROGRAMM-ASSISTENT.md) |
| Entwicklung | [Bauanleitung](docs/BUILD.md) · [Architektur](docs/PROJEKTKONTEXT.md) |

<!-- formnaro-development-status:start -->
## Entwicklungsstand

Der Windows-Download **0.122.0-r3** verkleinert die Portable-ZIP auf **671 MB** (entpackt etwa **1,78 GB**). Gegenüber 0.120.0-r4 ist der Download rund **65 % kleiner**. **42 gezielte Unit-Prüfungen und 363 UI-Prüfschritte über r2/r3** sind dokumentiert; ZIP-Inhalte, frische Extraktion und die drei Beispielmodelle wurden geprüft. Die Ausgabe bleibt eine Entwicklungsausgabe; eine unabhängige Prüfung auf einer frischen Windows-Installation und eine neue allgemeine Gesamtabnahme stehen aus.

Der zugehörige Quellstand liegt unter [v0.122.0-r3](https://github.com/andyy909/Formnaro-cad/tree/v0.122.0-r3); der Entwicklungszweig `main` bleibt beim bisherigen Programmstand.

[Prüfbericht des Downloads](https://github.com/andyy909/Formnaro-cad/releases/download/v0.122.0-r3/Paket-Analyse.txt) · [Ausbau und offene Punkte](docs/ALLTAGSAUSBAU-UMSETZUNGSSTAND.md)
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

