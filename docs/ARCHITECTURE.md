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

[Mini Mesh](../mini) and [Mini CAD](../mini-cad) are separate applications. The former SolidCraft integration is documented under [parametric](../parametric) for older saved projects.

For dated development and verification notes, see the [technical project history](PROJEKTKONTEXT.md). For the packaged public preview, see the [current release](AKTUELLER-STAND.md).
