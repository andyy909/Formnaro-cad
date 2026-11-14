<p align="center">
  <img src="bilder/formnaro-logo.png" alt="Formnaro" width="200">
</p>

# Formnaro

[English](README.md) | **Deutsch**

**CAD und Netzbearbeitung für Modellbau und 3D-Druck.** Konstruiere Bauteile, bearbeite 3D-Modelle und erstelle technische Zeichnungen. Formnaro läuft lokal unter Windows; die normale Modellierung funktioniert offline.

**Windows 64 Bit · portabel – Programm und separate Quellen:**

| Download | Version | Größe | Inhalt |
| --- | --- | --- | --- |
| **[Programm herunterladen](https://github.com/andyy909/Formnaro-cad/releases/download/v0.139.1-r1/Formnaro-v0.139.1-r1-Windows-x64.zip)** | **0.139.1-r1** | siehe Release | Portables Programm, benötigte Laufzeiten, Lizenzen und Startanleitung. |
| [Separate Quellarchive](https://github.com/andyy909/Formnaro-cad/releases/tag/v0.139.1-r1) | **0.139.1-r1** | siehe Release | Formnaro-, FreeCAD- und CAD-Kern-Quellen; optionale Downloads zum Weiterentwickeln. |

**Neu:** Verbesserte Laborspeicherung, Werkzeugrückmeldungen und Prozess-/KI-Antwortbehandlung. Historische Benchmarks bleiben erhalten. [Versionshinweise](https://github.com/andyy909/Formnaro-cad/releases/tag/v0.139.1-r1).

## Aktuelle Ausgabe: zuverlässigeres KI-Labor

**0.139.1-r1** integriert sichere Ergebnisspeicherung, klarere Werkzeug- und Auswerterrückmeldungen, kompatible alte Skizzenkantenbezüge und die Prozess-/KI-Antwortkorrekturen. 128 Standardtests, 152 gezielte Regressionen und vier gezielte Liveversuche bestanden. Ein Liveversuch benötigte eine erfolgreiche Formatkorrektur. Die vollständige Testkampagne und die Ursache langen nativen Prozessabbaus bleiben offen; kein neuer Vollbenchmark. [Releasebericht](docs/VEROEFFENTLICHUNG-0.139.1-r1.md) · [Versionierte Belege](docs/benchmarks/lab-targeted-01391-2026-11-14.json).

## Neuer vollständiger Sol-Benchmark: 16/16

GPT-6.1 Sol/high bestand alle sechzehn frischen Versuche auf der veröffentlichten **0.137.4-r2 / Suite 1.0.4** (acht feste CAD-Aufgaben, je zweimal; Überwacher aus). DeepSeeks ursprüngliche **16/16 auf 0.137.0-r1 / Suite 1.0.2** bleiben unverändert. Unterschiedliche Programm-, Werkzeug- und Promptstände sind ausdrücklich beschriftet; dies ist keine Modellrangliste auf gleichem Stand. Sols frühere 14/16 und 15/16 sowie Zeichnungsnachtests 2/2 und Bohrungsnachtest 1/1 bleiben erhalten.

![DeepSeek 16/16 (0.137.0-r1) / Sol 16/16 (0.137.4-r2)](docs/bilder/benchmark-sol-deepseek-16-2026-11-08.svg)

[Sol-Beleg](docs/benchmarks/core-sol-01374-2026-11-08.json) · [Vergleichsdaten](docs/benchmarks/sol-deepseek-16-vergleich-2026-11-08.json) · [Alle Originalergebnisse](docs/benchmarks/README.md)

[Passende Programmquellen](https://github.com/andyy909/Formnaro-cad/releases/download/v0.139.1-r1/Formnaro-Quellcode-v0.139.1-r1.zip) · [STL-zu-CAD-Anleitung](docs/GEMEINSAMER-KONVERTER.md).

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

Aufgenommen mit dem lokal getesteten Entwicklungsstand **0.125.0-r35**. Der aktuelle Download enthält 0.137.4-r2.

## Anleitungen

| Thema | Weiterlesen |
| --- | --- |
| Bedienung | [Kurzstart](LIES-MICH.txt) · [Handbuch (EN)](docs/USER-GUIDE.md) · [Beispiele](beispiele/README.md) · [Solid](docs/SOLID-MODUS.md) · [Fusion](docs/FUSION-MODUS.md) |
| Konstruktion | [Parameter und Varianten](docs/PROJEKTPARAMETER.md) · [Kurven, Loft und Sweep](docs/CAD-KURVEN.md) |
| Zeichnungen und Baugruppen | [Technische Zeichnungen](docs/TECHNISCHE-ZEICHNUNGEN.md) · [Teile, Material und Stücklisten](docs/TEILE-MATERIAL-BAUGRUPPEN.md) |
| KI-Unterstützung | [KI-Aufträge](docs/KI-AUFTRAEGE.md) · [Foto-Assistent](docs/FOTO-ASSISTENT.md) · [Programm-Assistent](docs/PROGRAMM-ASSISTENT.md) |
| Entwicklung | [Bauanleitung](docs/BUILD.md) · [Architektur](docs/ARCHITECTURE.md) |

<!-- formnaro-development-status:start -->
## Veröffentlichungsstand: 0.139.1-r1

Die neue Ausgabe enthält die geprüften Verbesserungen aus 0.139.0 und die anschließenden Prozess-/JSON-Korrekturen. Die vier gezielten Live-Nachtests ersetzen keinen neuen Vollbenchmark. Weitere Testbedingungen und die genaue Ursache langsamen nativen Prozessabbaus bleiben offen.

[Release](https://github.com/andyy909/Formnaro-cad/releases/tag/v0.139.1-r1) · [Source tag](https://github.com/andyy909/Formnaro-cad/tree/v0.139.1-r1) · [ZIP](https://github.com/andyy909/Formnaro-cad/releases/download/v0.139.1-r1/Formnaro-Quellcode-v0.139.1-r1.zip) · [Abnahme / acceptance](docs/VEROEFFENTLICHUNG-0.139.1-r1.md)

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


## Aufbaubenchmark und gezielte Reparaturen

Neu in **0.138.2-r4**: ebene Bohrflächen skalierter Quader, Auswahl des bearbeiteten Körpers, eindeutige Checkbox-Zustände sowie Rückmeldung zu Skizzenersatz und Höhenlage. Der ursprüngliche DeepSeek-Aufbaulauf bleibt **5/16 auf 0.138.0-r1**. Durch getrennte Nachtests sind alle 16 ursprünglichen Bedingungen über mehrere Programmstände bestätigt; das ist kein neuer vollständiger 16/16-Lauf. Der letzte A07-Test mit der neuen EXE bestand 8/8 native Kriterien in 144,199s. [Versionierte Ergebnisse und getrennte Nachtests](docs/benchmarks/advanced-deepseek-2026-11-09.json).

