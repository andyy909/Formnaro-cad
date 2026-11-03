# Parts, materials and assemblies

Open the parts and material tool from the view and inspection tools in Normal
and Easy Tinker, or from the tools menu in Solid and Fusion. Each workspace
uses the same committed parts and transactions.

## Material and density

Select a complete visible, unlocked CAD or mesh part. Enter a material group
and density in **g/cm³**. An empty density remains unknown. A material name or
colour supplies no default density. The calculation treats a finished part
as homogeneous.

Preview leaves the saved model untouched. Apply records one Undo step.
Material properties preserve the BRep, mesh points, assembly, parameters and
original sources.

## Face colours and groups

Select a fully loaded part. Click native CAD faces, mesh triangles or use an
applied mesh face selection. Click a selected face again to remove it from
the selection. Enter a group name and colour, preview, and apply. Assigning
a face to a new group replaces its prior assignment. Other imported STEP
face colours are retained.

With source colours enabled on a multicolour part, the source colours take
precedence. Turn that option off to use custom face groups. Re-enabling it
restores source colours in the view and export while retaining the custom
groups. Removing custom groups can be undone.

CAD face indices are tied to the exact local BRep and mesh groups to the exact
points and triangles. Translating or rotating the part preserves this identity.
A geometry edit can leave groups stale. Formnaro retains their records for
reassignment and excludes stale groups from colouring the new geometry.

CAD face colour exports support STEP, OBJ/MTL, 3MF and glTF/GLB. Mesh face
colour exports support OBJ/MTL, 3MF and glTF/GLB. STL carries no face colours.
Material names and density remain in the project and CSV bill of materials.

## Mass, centre of mass and bill of materials

Inspect parts to refresh the bill of materials. Formnaro checks visible,
finished material parts, loading geometry when the display is simplified.
Hidden parts, hole tools, suppressed sources and view templates are excluded.
Each finished root counts once. Retained construction sources do not add
extra rows. The CSV reports one unit per part ID.

The OCCT kernel integrates CAD volume and first moments. Mesh calculation
integrates the stored triangles after bounded intersection checks and an
independent Manifold solid comparison. The mesh path supports up to **30,000
triangles**. Larger, open or unverified meshes produce no confirmed mass.

`Mass (g) = volume (mm³) × density (g/cm³) ÷ 1000`

The overall centre of mass is weighted by part masses. If density or solid
verification is missing, overall mass and centre stay unknown and the known
subtotal is labelled separately. Overlapping finished parts are added as
separate parts.

CSV includes part ID, name, material group, quantity, density, volume, mass,
centre coordinates and verification status. Unknown values are empty.
CSV text is escaped, including leading spreadsheet formulas.

The bounded calculation cache belongs to the active engine session. Its key
includes the algorithm version, exact geometry, complete placement and saved
part properties.

## Saved exploded view

Generate directions from the current assembly to distribute visible finished
parts away from the centre of their display bounds. The distance control moves
the display along the saved unit directions. Show the assembly to restore the
original matrices or show the saved explosion to use the settings again.

Explosion is a display feature. Model editing is locked during the explosion
and tool preparation restores the original arrangement before an edit.
Saving, mass calculation and model export continue to use the original
assembly. Saved workspaces remember explosion directions and distance.
The display describes neither collision clearance nor physical motion.

Part properties require project and library version **25**. Explosion
settings require workspace version **6** and project version 25. OCAD, FNPACK,
recovery and Undo follow the existing storage paths. A project's required
version depends on the features it contains.

The shared API exposes `cad/partProperties` and `mesh/partProperties` with
`{id}`, and `mesh/toolsQuery` with `{kind: 'partProperties', id}`. These
queries return `volumeMm3` and `centerMm`. Use explicit density to derive mass.

Historical verification for this feature is recorded in the [0.117.0-r7
acceptance report](GESAMTABNAHME-AUSBAU-0.117.md).
