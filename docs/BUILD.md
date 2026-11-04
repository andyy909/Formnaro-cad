# Build Formnaro from source

Use Windows x64 for the desktop application and packaging. Install a supported
Node.js release meeting the minimum in [package.json](../package.json). CI uses
the exact Node 22 release recorded in [the Node version file](../.node-version).

## Build and run the desktop application

From the repository root:

```powershell
npm ci
node cad-kernel-build/verify-runtime.mjs
npm run build
npm start
```

The standard build verifies the checked-in Windows dictation helper and its
source hash. To regenerate both the helper and its pin after editing the C#
source, use `npm run setup:windows-dictation` on Windows x64 with the .NET
Framework compiler available.

The dev container can build the renderer. The native Windows integrations and
portable release tests require Windows.

## Prepare the native runtimes for a package

Perform these steps from the repository root after `npm ci`:

1. Run `npm run setup:cad-runtime`. The script downloads and verifies the pinned
   FreeCAD 1.1.4 distribution and corresponding source. It compiles the Windows
   isolation launcher and records the full runtime in
   `freecad-runtime/runtime/manifest.json`.
2. Run `node scripts/setup-speech-runtime.mjs`. The installer verifies the
   speech engine files by SHA-256. The larger speech model is downloaded
   separately in the application when a user requests it.
3. Prepare the converter folder named by
   [converter/provenance.json](../converter/provenance.json) under `converter/`.
   The current folder is `runtime-v010-minimal`. Use the matching complete
   build runtime with the pinned executable, its dependencies and licenses.
   See the [converter build notes](../converter/README.md) and its
   [dependency lock](../converter/uv.lock) for rebuilding. A fresh converter
   build may produce different bytes and requires new provenance and verification.
   The minimal freeze uses `converter/headless-vtk/vtk.py` and omits optional
   viewer and JIT backends. Use `scripts/prepare-minimal-converter.py` to verify
   a new freeze against the original security-build binaries and preserve their
   license notices.
4. Install a local German Windows system voice for the synthetic speech test.

## Run the release checks and create a package

```powershell
npm run package -- r1
```

The command freezes the sources, builds the renderer and runs the Windows
release checks. It uses a fresh staging directory under `work/release-build`
and writes the result under `output/Formnaro-v<VERSION>-r<N>`. Choose a new
revision for a repeat run. Release evidence is under `work/current-release`.
Use `FORMNARO_RELEASE_BUILD_ROOT` and `FORMNARO_RELEASE_OUTPUT_ROOT` to set
different directories before starting the command. For a signed build, supply
a configured `FORMNARO_SIGNING_PROFILE`. Set `FORMNARO_REQUIRE_SIGNATURE=1`
when the build must reject an absent signing profile.

Use `npm run test:cad-release` for the release source and desktop checks without
creating a package. For the broader Node test inventory, use:

```powershell
node scripts/test-all-functions.mjs --mode source --suite unit --output work/all-tests
```

The GitHub workflow checks dependency installation, WASM integrity, the renderer
build and a subset of source tests. Package checks, distribution approval and
reproducing identical release archive bytes are separate.

The lock uses scoped overrides for the packager's ASAR dependencies
`glob` and `minimatch`. Revisit them when ASAR declares compatible patched
versions itself. The advisories are
[GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) and
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).

Earlier version-specific workflows and acceptance notes are collected in
[the build history](BUILD-HISTORY.de.md).
