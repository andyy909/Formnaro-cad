# Formnaro Mini CAD 0.4.1

Mini CAD is a standalone portable Windows modeller. Its primitives,
fillets and booleans use native OCCT CAD bodies. Its `.fmcad` projects retain
recipes, BReps and group sources. Use STEP to exchange CAD geometry with
other applications.

## Work with parts

Start `Formnaro Mini CAD.exe` and drag a shape onto the workplane or another
part. Use Shift-click or the selection box for multiple parts. Corner and
height handles show the resulting dimensions in millimetres. Rotate using
the small arrows and 15° snap ring. Middle-drag pans and right-drag rotates.

Group solids and holes to cut material. Groups retain their source parts.
Ungrouping a sheared source preserves its complete affine geometry as a
native body and retains its original recipe. That resulting body has no
direct primitive parameters. Undo restores the previous editable group.

Import STEP or STP up to 30 MB to retain native geometry and placement.
A closed oriented STL of up to 10,000 triangles can be converted explicitly
to a faceted CAD body. STL cannot recover the original analytic surfaces
or construction history. The [raw mesh import guide](NETZIMPORT.md) covers
the separate mesh import path.

Select visible parts for STEP or STL export. Selected holes subtract
material. With no holes, STEP retains separate selected parts, names and
colours. A joint subtraction exports the result as one CAD model. The
STEP result contains geometry and excludes the Mini edit history.

## Precision and file limits

Display modes use tessellation settings of 0.08 mm/16°, 0.02 mm/8° or
0.008 mm/5°. STEP retains native geometry. Binary STL uses a separate
0.01 mm/5° tessellation and Float32 coordinates. Large world coordinates
can add rounding.

Display picking and two-point measurement use displayed faces. Confirmed
placement on the picked tangent plane and overall bounds use native geometry.
Surface placement is not a clearance test. The project limit is 32 MB with
up to 200 roots and 1,000 sources. BReps are limited to 12 MB per body and
24 MB total. Display is limited to 250,000 triangles per part.

## Portable data and AI

`Daten-Mini-CAD` and `Bibliothek-CAD` are stored beside the executable.
Preserve both on update and back up any custom library separately. The
library can open, insert and drag complete saved Mini CAD models.

Open AI settings to choose a provider and model. Provider requests can
include the chat, attachments and current model context when you send them.
Saved keys use Windows encryption and remain in this app's own profile.
The JSON workshop and local API can run without a cloud key. Review the
candidate before Apply. One Apply is one Undo step.

Advanced AI constructions retain a native source tree (`cadSource`) and
workspace data (`cadWorkspace`). Mini CAD 0.2.0 or later is needed for that
additional context. The project format remains Formnaro Mini CAD version 1.

For local automation, enable the local interface and use the displayed
connection path with the bundled client. Keep the path's connection file
and token private.

```powershell
python scripts/offlinecad_ai.py --connection "<connection file path>" context
```

## Development

Use Node.js 22.16 or later. Run the commands in `mini-cad/`.

```powershell
npm ci
npm test
npm run build
npm run test:desktop
npm run package
```

The packager uses versioned paths on drive F by default. Set
`FORMNARO_MINI_OUTPUT` and `FORMNARO_MINI_BUILD` for fresh locations elsewhere.
The kernel runtime is under [cad-kernel-build/runtime](cad-kernel-build/runtime).
See [native module provenance](src/native/origin.json) and [package.json](package.json)
for source and dependency versions.

Own application code is covered by [LICENSE.txt](LICENSE.txt). Third-party
notices are in [THIRD-PARTY-LICENSES.txt](THIRD-PARTY-LICENSES.txt) and
[licenses](licenses/).
