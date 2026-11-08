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
  <a href="README.de.md">Deutsch</a>
</p>

## Download

Formnaro is portable on Windows x64. The modelling workspace works offline.

| Build | Best for | Download |
| --- | --- | --- |
| **0.137.1-r1** · current release | Fixed 16-trial benchmarks, repaired practice navigation and clean AI shutdown | **[Windows x64 ZIP](https://github.com/andyy909/Formnaro-cad/releases/download/v0.137.1-r1/Formnaro-v0.137.1-r1-Windows-x64.zip)** · [Verification and separate sources](https://github.com/andyy909/Formnaro-cad/releases/tag/v0.137.1-r1) |

Extract the whole application ZIP into its own folder and start **Formnaro.exe**. FreeCAD and Python are bundled. Source archives are separate downloads. [All releases](https://github.com/andyy909/Formnaro-cad/releases) · [Packaging policy](docs/PORTABLE-PAKETE.md)

## A look inside Formnaro

| **Easy Tinker** · bearing bracket (dark mode) | **Normal** · precision vise (dark mode) |
| :---: | :---: |
| [![Easy Tinker with a bearing bracket and shape palette in dark mode](docs/bilder/formnaro-easy-lagerhalter-dark.png)](docs/bilder/formnaro-easy-lagerhalter-dark.png) | [![Normal with a precision vise in dark mode](docs/bilder/formnaro-normal-schraubstock-dark.png)](docs/bilder/formnaro-normal-schraubstock-dark.png) |
| **Solid** · ATLAS-5 gantry mill (light mode) | **Fusion** · two-stage helical gearbox (light mode) |
| [![Solid with the ATLAS-5 gantry mill, five axes and a coupled A-axis drive](docs/bilder/formnaro-solid-atlas5.png)](docs/bilder/formnaro-solid-atlas5.png) | [![Fusion with construction steps and a four-gear helical gearbox](docs/bilder/formnaro-fusion-getriebe.png)](docs/bilder/formnaro-fusion-getriebe.png) |

*Actual application screenshots: Easy Tinker and Normal in dark mode from 0.117.0-r8; Solid with ATLAS-5 in light mode from 0.120.0-r4; Fusion in light mode from 0.119.0-r2. Click an image to enlarge it.*

[Matching application sources](https://github.com/andyy909/Formnaro-cad/releases/download/v0.137.1-r1/Formnaro-Quellcode-v0.137.1-r1.zip) · [STL-to-CAD guide](docs/STL-TO-CAD.md)

## Quick start

1. Download the Windows ZIP and extract it completely into its own folder.
2. Keep all subfolders together and double-click **Formnaro.exe**.
3. Create a new project or open an existing model.

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

### Practice mode

![Practice mode: create three gears, snap them together and demonstrate coupled motion](bilder/formnaro-uebungsmodus.gif)

Three functions are shown in a separate practice window using Formnaro's controls:

1. **Create gears:** insert three involute gears from the library and set their parameters.
2. **Snap gears together:** drag the gears into place to create revolute joints and gear couplings automatically.
3. **Show coupled motion:** set the driver to −90°, 0° and +90°, then apply the final position. The middle gear turns in the opposite direction at half the speed.

[Full-quality video with model and token labels (MP4, 1:52)](bilder/formnaro-uebungsmodus-zahnraeder.mp4)

**Exercise brief written by Codex (GPT-6.1 Sol, xhigh), translated from German**

> In practice mode, show three involute gears with 20, 40 and 20 teeth, a module of 1.5 mm and a width of 6 mm. Demonstrate automatic snapping by visibly dragging the gears. Then show the coupled motion with the driver at −90°, 0° and +90°, and apply the final position. The two small gears turn in the same direction. The middle gear turns in the opposite direction at half their speed. Keep the action clearly visible.

Codex prepared the plan before playback; the practice window executes it through the actual controls without further model requests. The displayed **3,381,395 tokens including cached input** cover the entire gear task: planning, recording and verification.

Recorded with the locally tested development build **0.125.0-r35**. The current download above provides 0.137.1-r1.

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
## Current release: 0.137.1-r1

The model picker compares complete individual16-trial benchmarks under matching conditions. Earlier practice and partial results remain in the details. DeepSeek V4.1 Flash/high passed16/16 on0.137.0-r1; this measurement is preserved unchanged in0.137.1-r1. The AI lab has independent modeler, supervisor and reviewer roles. [Measured conditions and provenance](docs/benchmarks/core-deepseek-2026-11-08.json).

Local verification covered **3,135 Node test cases and 28 Python tests**. The full Node run initially reported 12 outdated or incomplete test setups; all 12 were corrected and passed together in targeted follow-up checks. The packaged EXE passed model-picker IPC/UI checks, native drilling, FreeCAD modeling and all four workspace modes with normal shutdown. Complete runtime files were read back against their checksums. No new real AI performance tests or clean-Windows-VM run were performed.

[Release and checksums](https://github.com/andyy909/Formnaro-cad/releases/tag/v0.137.1-r1) · [Matching source tag](https://github.com/andyy909/Formnaro-cad/tree/v0.137.1-r1) · [Application source ZIP](https://github.com/andyy909/Formnaro-cad/releases/download/v0.137.1-r1/Formnaro-Quellcode-v0.137.1-r1.zip) · [Acceptance report](docs/ABNAHME-0.137.1-r1.md)

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
