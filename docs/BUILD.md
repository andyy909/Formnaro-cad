# Build Formnaro Nightly r10

This tag and the separate source ZIP contain the application source snapshot for **0.127.0-r10**. The default branch retains its existing application baseline. Native CAD, FreeCAD and converter dependencies are separate from the application sources.

## Renderer and source tests

Use Windows x64 and a Node.js version supported by the pinned Vite and Electron dependencies. Install dependencies with `npm ci`, verify the CAD runtime with `node cad-kernel-build/verify-runtime.mjs`, then run `npm test`.

Build only the renderer with `node node_modules/vite/bin/vite.js build --base ./`. `npm run build` also regenerates the Windows dictation helper and its integrity pin using the Windows .NET Framework compiler. Regenerated native bytes require verification before distribution.

Run converter source checks with:

```powershell
node --test tests/converter-autopilot.test.mjs tests/converter-symmetry.test.mjs tests/cad-workflow-settings.test.mjs tests/stl-converter.test.cjs
```

## Desktop runtimes

`npm start` runs the desktop sources. Native operations need the matching runtimes. The converter development path in this application snapshot is `converter/runtime-v010-security`. Copy the complete `resources/converter` folder from the r10 Windows package to that path. The folder name is historical; the bundled runtime is the verified minimal freeze described by its provenance.

The packaging policy reads `converter/provenance.json`, whose runtime path is `converter/runtime-v010-minimal`. To build a package, provide the same verified runtime at that path as well. Retain the executable, dependencies, provenance and licences together. See [converter build notes](../converter/README.md) for rebuilding from source. A rebuilt executable needs new provenance and acceptance.

Prepare FreeCAD with `npm run setup:cad-runtime` and speech with `node scripts/setup-speech-runtime.mjs`. See their pinned manifests, dependency notices and source archives linked from the release. The Windows package includes the runtimes for end users; no separate FreeCAD or Python installation is required.

## Package verification

`npm run package -- r<N>` invokes the repository's broader release workflow after the runtimes are installed. It generates fresh staging and evidence. It is separate from the targeted r10 Nightly acceptance and does not reproduce identical archive bytes automatically.

The published Nightly passed standard source tests, targeted converter tests and packaged Preview/Apply/Undo checks. The public verification asset records hashes and scope. Full release acceptance and a clean Windows VM run remain pending. Read [the release overview](AKTUELLER-STAND.md) and [converter guide](STL-TO-CAD.md).
