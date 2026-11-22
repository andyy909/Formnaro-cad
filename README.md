<p align="center">
  <img src="bilder/formnaro-logo.png" alt="" width="180">
</p>

<h1 align="center">Formnaro</h1>

<p align="center"><strong>A local 3D workshop for Windows</strong></p>
<p align="center">Design CAD parts, repair meshes, build assemblies and prepare technical drawings for model making and 3D printing.</p>

<p align="center">
  <a href="#download">Download</a> ·
  <a href="docs/USER-GUIDE.md">User guide</a> ·
  <a href="beispiele/README.md">Example models</a> ·
  <a href="docs/BUILD.md">Build from source</a> ·
  <a href="https://www.paypal.com/donate/?hosted_button_id=TPZ9RQ242TJES">Support via PayPal</a> ·
  <a href="README.de.md">Deutsch</a>
</p>

## Download

Formnaro is portable on Windows x64. The modelling workspace works offline.

[Formano Mini for Android](https://github.com/andyy909/Formnaro-Android) is new and under active development. The Android repository offers early APK builds and lists the tested Windows companion build.

| Build | Best for | Download |
| --- | --- | --- |
| **0.144.0-r1** · stable release | AI Lab development checks and evidence | **[Windows x64 ZIP](https://github.com/andyy909/Formnaro-cad/releases/download/v0.144.0-r1/Formnaro-v0.144.0-r1-Windows-x64.zip)** · [Separate sources and release notes](https://github.com/andyy909/Formnaro-cad/releases/tag/v0.144.0-r1) · [SHA-256 checksums](https://github.com/andyy909/Formnaro-cad/releases/download/v0.144.0-r1/SHA256SUMS.txt) |
| **0.147.1-r2** · Windows Nightly | Solid command search, selection of overlapping bodies, and editing saved rounds and chamfers | **[Windows x64 ZIP](https://github.com/andyy909/Formnaro-cad/releases/download/v0.147.1-r2/Formnaro-v0.147.1-r2-Windows.zip)** · [Release notes and sources](https://github.com/andyy909/Formnaro-cad/releases/tag/v0.147.1-r2) · [SHA-256 checksums](https://github.com/andyy909/Formnaro-cad/releases/download/v0.147.1-r2/SHA256SUMS.txt) |

Formnaro starts with an empty workspace. The welcome screen shows three bundled examples, up to three recent projects and a restore button when an autosave is available. [Current release and verification](docs/AKTUELLER-STAND.md)

Extract the whole application ZIP into a writable folder and open the **Formnaro starten** shortcut. FreeCAD and Python are bundled. Source archives are separate downloads. [All releases](https://github.com/andyy909/Formnaro-cad/releases) · [Packaging policy](docs/PORTABLE-PAKETE.md)

## AI Lab

Open **Settings → AI / API → AI test lab**. In stable release 0.144.0-r1, **Simple** runs a 15-task development check at Low, with targeted retries at High and optional Max. Everyday CAD, STL conversion and photo mode can be checked separately. Use **Advanced** to set up custom trials.

**Results** shows first-attempt passes and passes after verifier feedback. The export also records earlier stages, gaps in context, recurring patterns and initial reactions.

[Preview 0.145.0-r1](https://github.com/andyy909/Formnaro-cad/releases/tag/v0.145.0-r1) includes the standard benchmark v13, extended plan v14, STL diagnostics and a fit benchmark with a skill comparison. The automated campaign can stall in this version. Two open reference cases cover countersink opening direction in STL reconstruction and a name-dependent end-stop check.

### AI model comparison in benchmark v13

Eight runs covered 25 CAD, STL and technical drawing tasks. GPT-6.2 Sol solved the most tasks, at 24 out of 25. GPT-6.1 Terra had the lowest average time per solved task. DeepSeek Flash High had the lowest reported API cost estimate per solved task.

[![Five v13 chart panels on tasks solved, costs, elapsed time, tokens and individual task results](docs/benchmarks/modellvergleich-v13.png)](docs/benchmarks/modellvergleich-v13.png)

The sample contains one to three runs per model and reasoning setting. Plan v14 uses different budgets and some revised tasks and is evaluated separately. The original chart is in German.

[Result tables and methodology](docs/benchmarks/modellvergleich-v13.md) · [AI Lab on formnaro.de](https://formnaro.de/en/ai-lab/#benchmark-v13) · [Archive of earlier 16-trial runs and retests](docs/benchmarks/README.md)

## A look inside Formnaro

| **Easy Tinker** · bearing bracket (dark mode) | **Normal** · precision vise (dark mode) |
| :---: | :---: |
| [![Easy Tinker with a bearing bracket and shape palette in dark mode](docs/bilder/formnaro-easy-lagerhalter-dark.png)](docs/bilder/formnaro-easy-lagerhalter-dark.png) | [![Normal with a precision vise in dark mode](docs/bilder/formnaro-normal-schraubstock-dark.png)](docs/bilder/formnaro-normal-schraubstock-dark.png) |
| **Solid** · ATLAS-5 gantry mill (light mode) | **Fusion** · two-stage helical gearbox (light mode) |
| [![Solid with the ATLAS-5 gantry mill, five axes and a coupled A-axis drive](docs/bilder/formnaro-solid-atlas5.png)](docs/bilder/formnaro-solid-atlas5.png) | [![Fusion with construction steps and a four-gear helical gearbox](docs/bilder/formnaro-fusion-getriebe.png)](docs/bilder/formnaro-fusion-getriebe.png) |

*Actual application screenshots: Easy Tinker and Normal in dark mode from 0.117.0-r8; Solid with ATLAS-5 in light mode from 0.120.0-r4; Fusion in light mode from 0.119.0-r2. Click an image to enlarge it.*

[Application sources for 0.144.0-r1](https://github.com/andyy909/Formnaro-cad/releases/download/v0.144.0-r1/Formnaro-Quellcode-v0.144.0-r1.zip) · [STL-to-CAD guide](docs/STL-TO-CAD.md)

## Quick start

1. Download the Windows ZIP and extract it completely into its own folder.
2. Keep all subfolders together and open **Formnaro starten**.
3. Open an example from the welcome screen or use **Open** to load an existing project.

See the [user guide](docs/USER-GUIDE.md) for project files, workspace modes and portable updates. Speech options depend on the build. See the [speech guide](docs/SPRACHEINGABE.md) for the current source branch.

## Features

- **Design parts:** primitives, sketches, holes, cutouts, fillets, lofts and sweeps.
- **Edit dimensions:** parameters, formulas and variants for related parts.
- **Edit meshes:** import, inspect, repair and selectively modify models.
- **Create drawings:** export views, sections and dimensions as PDF, SVG or DXF.
- **Organise assemblies:** joints, gear couplings, materials, mass, bills of materials and exploded views.

STEP, STL, OBJ, 3MF and GLB/glTF support model exchange. Choose from four interface modes: **Easy Tinker, Normal, Solid and Fusion**. Changes can be checked in a preview and undone.

**Optional AI assistance** helps with modelling tasks, reference photos and application questions. Cloud requests require a provider account or API access and an internet connection; provider charges may apply. Python and FreeCAD tools run locally.

### ATLAS-5 in motion

![ATLAS-5: X, Y and Z travel, an A-axis tilting cradle with a coupled pinion, and a C-axis rotary table](docs/bilder/formnaro-atlas5-bewegung.gif)

**144 parts, 78 joints and five axes.** This short GIF shows actual joint movements in Formnaro 0.120.0-r4. The cradle and pinion are coupled at **48:20** and move together with the Y-axis carrier. [Download the editable example](https://github.com/andyy909/Formnaro-cad/releases/download/v0.120.0-r4/atlas-5.ocad). The model was constructed with Codex (Astra) through Formnaro's local MCP interface. The animation was then recorded using a separate model copy, without another AI request during recording. It demonstrates kinematics, not contact forces or approval for manufacturing.

### Gearbox in motion

![Four helical gears with automatically coupled shafts and a 6:1 reduction ratio](docs/bilder/formnaro-schraeggetriebe-6zu1.gif)

Two stages, four gears and a **6:1 reduction ratio** — an open gearbox concept, for example for a slow rotary table. Only the input shaft is driven; the others follow through the coupling. [Download the example project](https://github.com/andyy909/Formnaro-cad/releases/download/v0.119.0-r3/schraeggetriebe-6zu1.ocad). This is a kinematic demonstration from 0.119.0-r2, not a contact or load simulation.

### Practice mode: drilling and a circular pattern

[![Eight drilled sleeves in a circular pattern — video at 100% practice speed](bilder/formnaro-uebungsmodus-muster-100.jpg)](https://formnaro.de/practice-pattern-100.mp4)

**Formnaro 0.139.1-r1 · DeepSeek Flash/high · 22 visible steps · 5/5 native checks passed.** Turn one cylinder into eight separate sleeves with real through-bores, while preserving an unrelated part.

[Watch: 100% speed, 1:06](https://formnaro.de/practice-pattern-100.mp4) · [Download MP4](bilder/formnaro-uebungsmodus-muster-100.mp4) · [Prompt, usage and cost calculation](docs/demos/muster-100.md)

**Exact prompt (German, 66 words):**

> Bohre den vorhandenen Zylinder Ø10×12 mm, Mitte (37,7,9), koaxial durchgehend Ø4. Erzeuge daraus insgesamt acht getrennte identische Hülsen einschließlich des gebohrten Originals. Die Mittelpunkte liegen auf Radius30 um die Welt-Z-Achse X7,Y7, Z-Mitte9, gleichmäßig alle45°. Das Original bei (37,7,9) gibt den Startwinkel0° vor. Jede Hülse reicht von Z3 bis15 und muss dieselbe echte Durchgangsbohrung besitzen. Alle unbeteiligten Teile einschließlich Schutzteil vollständig erhalten. Modellierung ausschließlich mit sichtbaren Übungswerkzeugen.

**13,758 tokens:** 7,354 input (including 6,912 cached) + 6,404 output (including 5,705 reasoning). One original provider request. The 100% recording replays the same plan in real time with no additional AI tokens; it is not a new AI benchmark.

**Estimated AI-request cost: USD 0.00393 ≈ EUR 0.00356.** [DeepSeek weekend rate](https://api-docs.deepseek.com/quick_start/pricing/), checked 14 November 2026; [ECB rate](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/eurofxref-graph-usd.en.html) dated 13 November 2026: EUR 1 = USD 1.1052. Rate-based estimate, not a verified account debit. Codex work and video production are excluded; see the report for details.

## Documentation

Some detailed reference material is available in German.

| Topic | Read more |
| --- | --- |
| Getting around | [User guide](docs/USER-GUIDE.md) · [Examples](beispiele/README.md) · [Solid](docs/SOLID-MODUS.md) · [Fusion](docs/FUSION-MODUS.md) |
| Modelling | [Parameters and variants](docs/PROJEKTPARAMETER.md) · [Curves, lofts and sweeps](docs/CAD-KURVEN.md) |
| Drawings and assemblies | [Technical drawings](docs/TECHNISCHE-ZEICHNUNGEN.md) · [Parts, materials and bills of materials](docs/TEILE-MATERIAL-BAUGRUPPEN.md) |
| AI assistance | [AI guide](docs/AI-GUIDE.md) · [AI tasks](docs/KI-AUFTRAEGE.md) · [Photo assistant](docs/FOTO-ASSISTENT.md) · [Application assistant](docs/PROGRAMM-ASSISTENT.md) |
| Development | [Build instructions](docs/BUILD.md) · [Architecture](docs/ARCHITECTURE.md) |

<!-- formnaro-development-status:start -->
## Earlier release 0.142.0-r1

Practice stays in the selected Solid or Fusion workbench. A new native trapezoidal thread primitive accepts lengths up to 3,000 mm.

[Release](https://github.com/andyy909/Formnaro-cad/releases/tag/v0.142.0-r1) · [Abnahme / acceptance](docs/VEROEFFENTLICHUNG-0.142.0-r1.md)

## Earlier release: 0.139.1-r1

0.139.1-r1 bundled the AI Lab improvements from 0.139.0 with process shutdown and JSON handling fixes. The release report documents four targeted live retests from that version.

[Release](https://github.com/andyy909/Formnaro-cad/releases/tag/v0.139.1-r1) · [Source tag](https://github.com/andyy909/Formnaro-cad/tree/v0.139.1-r1) · [ZIP](https://github.com/andyy909/Formnaro-cad/releases/download/v0.139.1-r1/Formnaro-Quellcode-v0.139.1-r1.zip) · [Abnahme / acceptance](docs/VEROEFFENTLICHUNG-0.139.1-r1.md)

<!-- formnaro-development-status:end -->

<details>
<summary>Run from source</summary>

With Node.js 22.16 or later and npm:

```sh
git clone https://github.com/andyy909/Formnaro-cad.git
cd Formnaro-cad
npm ci
npm run build
npm start
```

For FreeCAD features in a development checkout, run `npm run setup:cad-runtime`. The [build instructions](docs/BUILD.md) cover additional runtimes, tests and packaging.

</details>

## Contributing and licence

Found a bug or have an idea? Open an [issue](https://github.com/andyy909/Formnaro-cad/issues). For bug reports, include the version you used and steps to reproduce the problem.

The application's own code is licensed under **[MIT](LICENSE.txt)**. Third-party components retain their [own licences](THIRD-PARTY-LICENSES.txt); the combined CAD kernel is not entirely MIT-licensed. [Licence details](docs/LIZENZ-MIT.md) · [CAD sources and build information](licenses/CAD-Quellen-und-Build.txt).
