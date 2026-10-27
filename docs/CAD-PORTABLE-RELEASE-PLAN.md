# Portable CAD release audit

The application package and production entry have switched together to
**0.11.0** after the native source gates passed: 155 foundation tests and
45 extended tests. Production `index.html` loads `src/cad-main.js`; the old
Manifold Vite plugin is removed. Historic kernels remain development fixtures
and are excluded from the production graph. Existing portable releases and
user data remain intact. A separate `release-formnaro-v0.11/Formnaro-win32-x64/`
application has been packaged and its actual `Formnaro.exe` passed the strict
25-check native UI/HTTP/MCP acceptance with product version0.11.0. No upload
has occurred. Source archive/checksum and final delivery inventory are audited
separately by the release tooling.

## Materialized kernel and license inventory

`node cad-kernel-build/verify-runtime.mjs` genuinely verifies 24 materialized
files, including 14 complete original license/author files. The mandatory native
proof passed before copying the exact JS/WASM build; the current stock/extended
kernel regression passed 19 tests. Current WASM is 23062347 bytes, SHA256
`964835f6a345ab3a9ab07852fb8d047fb081d38c20849a65b1c037c1d3f2ad8c`.
Build inputs, full source archive hashes, generated binding configuration and
original build image digest are preserved. The WASM and loader must be copied
byte for byte by Vite and compared inside the final ASAR; output asset filenames
may contain Vite hashes.

| Distributed component | Preserved license/notice | Release action |
|---|---|---|
| Original OpenCascade.js / replicad-opencascadejs | LGPL2.1 text in runtime/licenses/replicad-opencascadejs-LGPL-2.1.txt | Include full notice and corresponding build sources |
| OCCT8.0.1 | Same full LGPL2.1 text and runtime/licenses/OCCT-Exception.txt | Keep the OCCT exception scoped to OCCT |
| Original Replicad wrappers | runtime/licenses/Replicad-MIT.txt | Preserve original copyright notice |
| Added Formnaro bridge | runtime/licenses/Formnaro-Bridge-MIT.txt | Preserve independent source notice; combined library retains its original license terms |
| FreeType | runtime/licenses/FreeType-FTL.txt | Include the selected FTL terms and FreeType attribution |
| RapidJSON and its bundled notices | runtime/licenses/RapidJSON.txt | Include complete original notice, not only the top MIT paragraph |
| Emscripten runtime and linked mimalloc/musl/C++ libraries | Emscripten/AUTHORS/mimalloc/musl/libcxx/libcxxabi/libunwind/compiler-rt texts in runtime/licenses | Sources and hashes are pinned in system-license-lock.json |
| Three.js0.186.1, fflate0.8.3 and three Magenta font datasets | Full locally verified MIT/font notices in THIRD-PARTY-LICENSES.txt | Generated reproducibly by scripts/generate-cad-licenses.mjs |
| Electron/Chromium runtime | Licenses supplied by Electron packaging | Preserve both Electron license and Chromium notices in the portable directory |

`runtime/package.json` deliberately says `SEE LICENSE IN README.md`, not a
single permissive license for the combined WASM. The local runtime package's
internal `0.11.0-proof.1` build identifier is independent of the product's
`0.11.0` version; it is the same proven binary used by the production worker.

The current `licenses/CAD-Quellen-und-Build.txt` now describes the new native
0.11 library, the 11 October 2026 bridge/binding additions, all five exact
corresponding source archive revisions/sizes/SHA256 values, immutable builder
image, toolchain, fresh-folder preparation, materialization and complete paired
JS/WASM replacement. `THIRD-PARTY-LICENSES.txt` contains complete actual Three,
fflate, Magenta font, Electron and all 14 native original license/author texts.
`scripts/generate-cad-licenses.mjs` checks the native license manifest hashes
before reproducing it. Existing 0.10 releases were not changed.

The license inventory was checked against the pinned source texts:
[OpenCascade.js LGPL2.1](https://github.com/taucad/opencascade.js/blob/ebd263f15337b440b391492af073662707e86482/LICENSE),
[OCCT exception](https://github.com/Open-Cascade-SAS/OCCT/blob/b8f597c677811d1f9f4d8a97f5ae2825c0353a42/OCCT_LGPL_EXCEPTION.txt).
For corresponding sources, accompany the portable release with the complete
exact source archive at the same delivery location. Include original sources,
generated configuration, wrapper additions, source pins, build scripts and
replacement instructions; do not rely only on external upstream links.
`Formnaro-CAD-Quellen-v0.11.zip` carries all five full source archives under
`upstream/` and the build inputs under `generated/`.
`Formnaro-Quellcode-v0.11.zip` carries the application and real runtime tests.
Extract both into a fresh folder and copy `upstream/*.tar.gz` into
`work/cad-v011-build/archives/` to reuse the accompanying sources; otherwise the
preparation script downloads and verifies the same exact archives.

## Repeatable package acceptance steps

1. Finish the authorized full CAD interface/service/tool/AI migration and remove
   Manifold imports, old modeling mesh fallbacks and the old Vite virtual-WASM
   plugin from the production entry graph. Keep permitted STL/OBJ references as
   separate reference objects. Reinspect the actual compiled bundles, rather
   than inferring absence from a dependency list.
2. Run native foundation/extended gates, separate STEP reader gate, complete
   browser/UI/worker and isolated portable-data tests. The reader gate is
   `cad-kernel-build/step-reader-proof/run.ps1`; it actually invokes separate
   native FreeCAD1.1.4/OCCT7.8.1 and states its shared algorithm family clearly.
3. Wire the new renderer's `createProgramStorage(...,{cadOnly:true})`. Backend
   version0.11+ selects the same policy server-side. Old mesh autosave1-4 and old
   mesh library are neither read, copied nor returned; existing files stay on
   disk. Preferences, manifests, favorites, layout and AI settings remain usable.
   New CAD autosave5 and CAD library5 use separate files. Meaningful policy tests
   are in `tests/program-storage-cad.test.cjs`, including forbidden stat/read and
   oversized/corrupt legacy files, actual IPC, monotonic mode and browser fallback.
4. Only after complete feature and workflow acceptance, set product/version/
   release output to0.11.0 together. Stage a fresh portable output directory;
   never update an existing0.10 EXE or release directory in place.
5. Package a runtime whitelist: Electron/preload/backend, production dist,
   application documentation, exact license notices and kernel build provenance.
   Include no work directories, build OCI/rootfs, downloaded FreeCAD/BRL-CAD,
   test profiles, model files, program data, layout folders, local settings,
   connection files or credentials. Source/build/test code belongs in the
   separately reviewed source archives, not the runtime ASAR. Avoid including a
   second raw23MB WASM copy merely because cad-kernel-build is not on the old
   packager ignore list.
6. Audit the actual package: exact version/name, every runtime file and native
   WASM hash, all required notices, only one common modeling kernel, no source
   maps leaking local paths, no profile/model/secret files. Replace the old
   `scripts/check-package.mjs` hard-coded0.10/path assertions for the new release,
   while retaining independent validation of the existing0.10 release.
7. Start the actual packaged EXE with an isolated verification profile and
   portable directory. Repeat source edits, undo/redo, save/reopen5, old-format
   rejection, workplane/ray/magnet, bounds/fits, plugin/template operations,
   display/export-quality independence, colors/holes, cancellation/stale/restart,
   memory-cache budgets, native files/menus, layout and KI preview/apply. Confirm
   network request blocking and no live user project/profile changes.

## Actual packaged EXE evidence

`node tests/cad-portable-proof.cjs <absolute-path-to-Formnaro.exe>` launched the
actual packed application using its original ASAR backend/preload and compiled
native worker. The completed report is
`work/cad-v011/portable-native-ixOhBi/result.json` (local, excluded from Git).
It records product version0.11.0, Format5, 25 checks, all seven actual controlled
save files, original native mouse input, preservation of old mesh fixture files
and preferences/favorites, and final local-bridge shutdown. The external Python
MCP process reads a byte-identical public adapter materialized from ASAR in its
own verification folder; no credential is printed or copied into delivery.

The report also records independent ASAR extraction of exactly one common
CAD WASM, 23062347 bytes, SHA256
`964835f6a345ab3a9ab07852fb8d047fb081d38c20849a65b1c037c1d3f2ad8c`.
This is the exact same binary already checked by the source and native gates.
The previous stage-only evidence is kept as history; this final result genuinely
uses `Formnaro.exe`, not the development Electron runner.
