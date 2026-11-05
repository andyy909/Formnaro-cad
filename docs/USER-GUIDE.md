# Formnaro user guide

This guide covers the portable Windows application. The release page lists downloads, matching sources and verification reports for each published build. [Formnaro releases](https://github.com/andyy909/Formnaro-cad/releases)

## Start a project

1. Extract the complete Windows ZIP into a folder and start `Formnaro.exe`. Keep the accompanying files and the `resources` directory with the executable.
2. Choose **New** for a blank project or **Open** for an existing `.ocad` or `.fnpack` project. Start with a sample if you want to explore a finished model. [Example projects](https://github.com/andyy909/Formnaro-cad/tree/main/beispiele)
3. Select a shape from the palette, place it on the workplane and edit its dimensions. Formnaro uses millimetres. Select an existing part in the model tree to inspect its properties or expand its editable construction sources.
4. Save the project. Use **Save As** to keep a separate copy when exploring a sample or modifying a project from another release.

## Work with models

- **Easy Tinker** provides a compact workspace for placing and combining shapes. **Normal** adds more modelling and inspection controls.
- **Solid** gives access to native CAD operations, assembly joints and movement. **Fusion** exposes editable construction steps and source relationships.
- Import STEP for native CAD geometry or STL for mesh geometry. To share a model, choose an export format suited to the recipient. Keep your Formnaro project for subsequent edits to the original sources.
- **.ocad** is the ordinary editable project file. **.fnpack** stores geometry in an indexed package and supports loading selected parts of a large assembly. Keep the full package file when moving the project to another computer. [Geometry packages](https://github.com/andyy909/Formnaro-cad/blob/main/docs/FNPACK.md)
- Motion and clearance checks describe the sampled positions and pairs. Their reports are useful when reviewing an assembly's range of motion. [Movement and drives](https://github.com/andyy909/Formnaro-cad/blob/main/docs/BEWEGUNG-AUFNAHME-UND-ANTRIEBE.md)

## Optional AI and speech

Modelling and file operations work offline. **Settings → AI / API** controls the optional provider and local AI interface. Requests sent to a cloud provider may include model context. Review an AI preview before applying it. The local API can also be used by MCP-capable clients. Offline speech may require a one-time language model download. [AI guide](https://github.com/andyy909/Formnaro-cad/blob/main/docs/AI-GUIDE.md), [Speech input](https://github.com/andyy909/Formnaro-cad/blob/main/docs/SPRACHEINGABE.md)

## Move or update a portable installation

Back up your project files and any portable `Daten`, `Layouts` and `Projekte` folders before switching installations. Extract the new release into its own folder and check that it opens your projects. You may have to re-enter Windows-protected credentials when moving to another computer.

## STL conversion in Nightly r10

Choose Import → reconstruct as CAD for a checked local STEP candidate. Optional AI refinement examines measured or selected regions. The converter also offers symmetry reconstruction from an overlapping side. Review the CAD preview and apply it with one Undo step. See the [converter guide](STL-TO-CAD.md) for steps, precision and size limits.
