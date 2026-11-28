# Formnaro architecture

The main application is a portable Windows desktop app. Electron starts the local Vite-built UI. The UI combines native CAD modelling and mesh tools in one workspace, with Easy Tinker, Normal, Solid and Fusion as different working modes.

| Area | Entry point |
| --- | --- |
| Desktop windows, IPC and local services | [electron.cjs](../electron.cjs), [preload.cjs](../preload.cjs), [backend](../backend) |
| Active renderer and model controls | [index.html](../index.html), [src/cad-main.js](../src/cad-main.js) |
| Native CAD and mesh engines | [CAD kernel build](../cad-kernel-build), [mesh engine](../src/mesh-engine) |
| Project schema and geometry packages | [Project schema](../src/cad-project.js), [FNPACK specification](FNPACK-FORMAT.md) |
| Optional AI and local integration | [AI guide](AI-GUIDE.md), [Python interface](PYTHON-SCHNITTSTELLE.md) |
| Windows build and release workflow | [Build guide](BUILD.md), [package policy](PORTABLE-PAKETE.md) |

Project files retain editable construction sources and model metadata. Native CAD operations use BReps. Mesh tools and the display also work with triangle data. The geometry package uses a versioned container and an independently versioned project model. [Geometry packages](FNPACK.md)

Project format 40 stores each exploded drawing view with a snapshot of its source parts’ explosion directions and distance. Native projection applies those saved offsets for the drawing. The view refresh uses its own snapshot, and assembly placement stays in the model. The local AI context reports the project parser’s supported formats.

Project and library format 41 stores item balloons with a projected edge reference and the placement ID. The balloon reads its number from the active parts-list row, including after projection refresh. The sheet marks a lost placement or edge reference and blocks technical export until it is resolved.

The Parts & Material panel edits existing component definitions through the native Preview/Apply transaction. It can detach one complete placement or change the shared nominal length of simple native cylinders or tubes. Preview preserves installed transforms and checks all affected parts before applying the operation.

The former SolidCraft integration is documented under [parametric](../parametric) for older saved projects.

For dated development and verification notes, see the [technical project history](PROJEKTKONTEXT.md). For the portable Windows package, see the [current release](AKTUELLER-STAND.md).
