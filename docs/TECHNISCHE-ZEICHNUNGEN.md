# Technical drawings

Select the complete visible CAD material parts you want to document and open
the technical drawing tool in Normal or Easy Tinker. Existing sheets also open
without a new selection. Mesh parts cannot supply the native projections.

## Create and update a sheet

A new sheet includes front, side and top views. Set the A4 or A3 paper size,
orientation, scale and title block. To add a section view, specify a world axis
and a cut position in millimetres. Update the sheet to calculate projections
and sections in the native CAD service. Cancelling the calculation preserves
the committed model and the previous sheet.

The first update centres each complete view on the page, even when its sources
are far from the model origin. Subsequent updates and scale changes preserve
each manually chosen view centre. Drag views to arrange them on the page.
Zoom, paper scale and layout reuse the computed curves.

## Dimensions and labels

- Pick a straight edge for length, two lines in one view for an angle, or a
  circle or arc for diameter or radius.
- To add a horizontal or vertical distance, select two points in the same
  view. On a line, pick the required endpoint. On a circle or arc, pick its
  centre. The drawing stores geometric references.
- Add labels by entering text and clicking the page. You can move labels and
  dimension text. Use the dimension list to remove a dimension whose reference
  has been lost.

After updating the sheet, choose an automatic dimensioning mode.

- **Basic** proposes overall dimensions and diameters of visible circles.
  A given overall axis is dimensioned once per source selection across the
  front, side and top views.
- **Detailed** also proposes circle centres measured from the minimum contour
  coordinates, arc radii, further edge lengths and angles at straight corners.
  A shared position dimension is proposed once. A recognised circle carries
  no inferred hole, shaft, countersink or thread classification.

Automatic overall and position dimensions require fully analytic visible
contours. Views with splines can still contribute recognised lines and circles
for individual dimensions. Hidden edges are excluded from automatic
dimensioning. The limit is 200 new proposals per operation and 1,000 annotations
per sheet.

The layout accounts for the page boundary, title block, labels and dimension
lines. If space runs out, move views, reduce the scale or select a larger
sheet and try again. Repeating the operation preserves manually placed
dimensions and avoids duplicates. Apply commits the sheet in one Undo step.
Cancel discards the sheet draft.

## Export

Edited sources mark their views as needing an update. Update and review them
before exporting. A missing or changed dimension reference is reported.
Reassign or delete it before export. You can save a sheet in this state.
A running export uses a fixed model state. Cancelling before the output is
committed preserves any existing output file.

| Format | Output |
| --- | --- |
| PDF | Local vector output through Electron at the selected paper size |
| SVG | Page layout in paper millimetres, with scale and title block |
| DXF | AutoCAD 2000 ASCII DXF (`AC1015`), model curves at 1:1 in millimetres, with separate layers for views and individual dimension elements |

Native projections supply lines, circles, arcs, ellipses and rational Bézier
curves. DXF preserves the corresponding vector entities or rational splines.
SVG and PDF may subdivide rational curves within a bounded deviation.
The stored native curve and displayed model dimensions are preserved.
Manufacturing datums, fits and tolerances are the author's responsibility.

Drawings require project and, where applicable, library format 12. Horizontal
and vertical distances require format 18 and are supported by `.fnpack`.
Projects use the version required by their contents. Libraries retain complete
sheets when all their sources are included and remap IDs on insertion.

## Local automation

Use `drawing` with `put` to store layout and references, `update` to compute
native projections, and `remove` to remove a sheet. For an up-to-date sheet,
use `{op:"drawing", action:"dimension", sheetId, mode:"basic"|"detailed"}`.
Update and apply linked sheets before dimensioning. Preview, revision checks,
Apply, Cancel and Undo follow the same rules as the UI. Export with
`drawing-svg`, `drawing-dxf` or `drawing-pdf` and the `sheetId`.
