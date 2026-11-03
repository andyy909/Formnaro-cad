# Selective loading with .fnpack

A `.fnpack` file is a self-contained Formnaro geometry package. It stores an index, the required geometry blocks, and instances with their own IDs and complete transforms. Instances can share identical stored geometry. Reopening, loading more parts, saving and exporting work from the package after the original STEP file has been removed.

## Create and open a package

1. Create or import a model. The first STEP import uses the complete STEP parser.
2. To save a selective loading set, choose **Nur Auswahl vollständig darstellen** (show only the selection in full) under **View & Inspect**.
3. Under **Projects**, choose **Als Geometriepaket (.fnpack) speichern …** (save as a geometry package).
4. Use **Open** or the project list to open the package. Subsequent saves use the package format. **Save As** creates a separate file.

Formnaro first reads the header and index. It then reads and tessellates visible parts in the saved loading set. **Teil nachladen** (load part) reads selected root parts and their construction sources. **Alles darstellen** (show all in full) requests all visible parts. Visibility, the loading set and the geometry cache are tracked separately. Instances reuse identical blocks that have already been read.

Visible parts outside the loading set remain selectable bounding boxes. Selection and camera movement leave those blocks unloaded. Box dimensions come from the stored catalogue. Fresh native measurements and geometric edits load the parts and sources needed for the calculation.

## Sources, saving and export

The package retains construction trees, sketch constraints and dimension formulas, parameters, links, drawings, joints, locks and affine placements. It preserves the original geometric precision and native BReps.

Saving streams and verifies even blocks that have never been loaded into the renderer. A fully written and synchronised temporary file then atomically replaces the destination. If a required block is missing or corrupt, the save stops and preserves the previous file and confirmed model.

A full export loads the material needed by the selected format or stops if it cannot do so. STEP exports visible native CAD material. STL and other mesh formats export the visible material each format supports. Export leaves the loading set and the model's Undo history intact.

Saving as ordinary `.ocad` materialises the required model data. Standalone `.ocad` files require fully resolved data. Personal templates and copied parts contain the selected construction sources and can be used independently of the package session.

## Recovery and limits

Package autosaves are self-contained files under `Daten/Paket-Autosicherung.fnpack`. The portable marker `autosicherung-auswahl.txt` selects the package autosave or the ordinary project autosave. This leaves older autosaves intact. Formnaro waits for the atomic package autosave during a normal shutdown. An existing damaged recovery file blocks automatic replacement to preserve the original data.

When overwriting an open package source, Formnaro can keep private copies under `Daten/Paketquellen` for blocks used by older Undo states. Reusable sources are consolidated. The copies are cleaned up after their accesses finish during shutdown. Connection files and access tokens stay outside the package index and blocks.

Formnaro 0.125.0-r36 reads container version 1 with embedded project versions 17 through 32. Saving uses at least project version 17. Features can require a higher version, such as version 32 for saved inspection records. Earlier standalone OCAD project versions 5 and 7 through 16 remain readable.

A package can hold up to 500 root parts and 5,000 source nodes. The container limit is 2 GiB and the index limit is 16 MiB. A BRep block can hold up to 12 MiB and a mesh block up to 128 MiB, within the mesh point and triangle limits. The decoded block cache holds approximately 128 MiB and up to 256 entries. Those limits apply to the cache. A session can hold up to 128 package sources, with unchanged geometry sources reused.

[Container format](FNPACK-FORMAT.md) · [Current public release](AKTUELLER-STAND.md)
