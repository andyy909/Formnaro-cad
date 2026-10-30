<p align="center">
  <img src="bilder/formnaro-logo.png" alt="Formnaro" width="200">
</p>

# Formnaro

**CAD und Netzbearbeitung für Modellbau und 3D-Druck.** Konstruiere Bauteile, bearbeite 3D-Modelle und erstelle technische Zeichnungen. Formnaro läuft lokal unter Windows; die normale Modellierung funktioniert offline.

**[Für Windows herunterladen](https://github.com/andyy909/Formnaro-cad/releases/download/v0.117.0-r8/Formnaro-v0.117.0-r8-Windows.zip)** · [Anleitungen](#anleitungen) · [Versionshinweise](https://github.com/andyy909/Formnaro-cad/releases) · [Feedback](https://github.com/andyy909/Formnaro-cad/issues)

Windows 64 Bit · portabel · Download **0.117.0-r8** · ca. **1,89 GB**

![In Formnaro konstruiertes Elektronikgehäuse mit abgehobenem Deckel und separater Platine](bilder/beispiel-elektronikgehaeuse.png)

*Beispiel aus Formnaro 0.114.0-r7.* [Bearbeitbares Gehäuseprojekt](beispiele/elektronikgehaeuse.ocad) · [Lagerhalter](beispiele/lagerhalter.ocad) · [Getriebestudie](beispiele/getriebestudie.ocad)

## Schnell starten

1. Windows-ZIP herunterladen und vollständig in einen eigenen Ordner entpacken.
2. Alle Unterordner zusammenlassen und **„Formnaro starten“** doppelklicken.
3. Ein neues Projekt anlegen oder ein Beispiel öffnen.

FreeCAD und Python sind im Windows-Paket enthalten. Eine separate Installation ist dafür nicht nötig.

## Funktionen

- **Bauteile konstruieren:** Grundformen, Skizzen, Bohrungen, Ausschnitte, Rundungen, Loft und Sweep.
- **Maße bearbeiten:** Parameter, Formeln und Varianten für zusammengehörige Teile.
- **Netze bearbeiten:** Modelle importieren, prüfen, reparieren und gezielt verändern.
- **Zeichnungen erstellen:** Ansichten, Schnitte und Bemaßungen als PDF, SVG oder DXF ausgeben.
- **Baugruppen organisieren:** Gelenke, Material, Masse, Stücklisten und Explosionsansichten.

STEP, STL, OBJ, 3MF und GLB/glTF ermöglichen den Modellaustausch. Vier Bedienmodi stehen zur Wahl: **Easy Tinker, Normal, Solid und Fusion**. Änderungen lassen sich in der Vorschau prüfen und rückgängig machen.

**Optionale KI-Unterstützung** hilft bei Modellieraufträgen, Referenzfotos und Bedienfragen. Cloud-Anfragen benötigen einen Anbieterzugang und Internet; je nach Anbieter können Kosten entstehen. Python- und FreeCAD-Werkzeuge rechnen lokal.

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

Der Quellcode **0.120.0** enthält neuere Funktionen als der Windows-Download **0.117.0-r8**, darunter mitwachsende Bohrungen, verknüpfte Muster und direkte Skizzenmaße. Die vollständige gemeinsame GUI-, Windows-Paket-, Dauerlauf- und Wiederherstellungsabnahme dieses Entwicklungsstands steht noch aus.

[Prüfstand und Grenzen](docs/PRUEFSTAND-0.120.0.md) · [Ausbau und offene Punkte](docs/ALLTAGSAUSBAU-UMSETZUNGSSTAND.md) · [Prüfbericht des Windows-Downloads](https://github.com/andyy909/Formnaro-cad/releases/download/v0.117.0-r8/Pruefbericht.txt)
<!-- formnaro-development-status:end -->

<details>
<summary>Vorschau: Übungsmodus</summary>

Der Übungsmodus führt ausgewählte Modellierschritte in einem eigenen Übungsfenster vor. Er ist **nicht im Windows-Download 0.117.0-r8 enthalten**.

[Demo ansehen](bilder/formnaro-uebungsmodus.gif) — Wiedergabe eines zuvor von DeepSeek erzeugten Plans; während der Aufnahme läuft keine Live-KI-Anfrage.

</details>

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
