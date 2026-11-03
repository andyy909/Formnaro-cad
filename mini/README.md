# Formnaro Mini Mesh 0.9.1

Mini Mesh is a standalone Windows application for mesh modelling and 3D
printing. It uses `.fmini` project files and a separate `Daten-Mini` directory.
See the [Android test build notes](ANDROID.md) for the separate tablet edition.

## Work with meshes

Drag primitives or saved library shapes onto the workplane or a part. The
placement preview follows the target surface and grid. Drop or confirm to
place the parts in one Undo step. Press Esc to cancel. Multi-part templates
keep their individual parts, colours, holes and sources.

Use Shift-click or a selection box to select multiple parts. Drag corner
or height handles to resize while reading the displayed millimetre dimensions.
Rotation snaps to 15° inside the blue ring and uses 1° steps outside it.
Hold Shift for 15° steps. Middle-drag pans, right-drag rotates and the wheel
zooms. Group hole shapes to subtract them together. Ungroup to restore sources.

STL import accepts open and damaged meshes and runs bounded cleanup.
Large files can use an optional simplified working copy. Keep the original
STL for future imports. Inspect the report before confirming simplification.
STL export uses selected visible parts. [Mesh import details](NETZIMPORT.md)

Optional AI features include provider profiles, chat, images, a JSON workshop
and a local interface. Selected meshes can also be repaired using the built-in
mesh tool. [AI and mesh repair notes](KI-UND-NETZREPARATUR.md)

## Portable data and library

`Bibliothek` next to the executable is the default library. It supports
previews, search, folders, favourites, opening and inserting. You can select
another folder from the library view. Migration from `Daten-Mini/Bibliothek`
keeps the originals. Preserve both `Daten-Mini` and `Bibliothek` when updating,
and back up any library you placed elsewhere.

## Development

Use Node.js 22.16 or later. Run the commands in `mini/`.

```powershell
npm ci
npm run build
npm test
npm run test:desktop
npm start
```

`npm run package` creates a separate Windows build after its desktop checks.
The script defaults to versioned paths on drive F. On another system set
`FORMNARO_MINI_OUTPUT` and `FORMNARO_MINI_BUILD` to fresh locations.

Three.js renders the scene and a cancellable Manifold worker handles mesh
operations. The renderer has isolated file IPC and provider requests run in
the main process. The local API is disabled by default. See [package.json](package.json)
for pinned tool versions and [engine provenance](src/engine/origin.json) for
the Formnaro modules used as its starting point.

Own application code is covered by [LICENSE.txt](LICENSE.txt). Third-party
notices are in [THIRD-PARTY-LICENSES.txt](THIRD-PARTY-LICENSES.txt) and
[licenses](licenses/).
