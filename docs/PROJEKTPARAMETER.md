# Project parameters and variants

Open the shared parameter table from the CAD tools. In Easy Tinker it is also
available from the drawing and mesh tools.

## Bind dimensions and apply changes

1. Add a named parameter with a value or formula. Names use letters, digits
   and underscores. Formulas support `+ - * /`, parentheses, and `sind` and
   `cosd` for angles in degrees.
2. Under bindings, select a parameter, a part or group source, and an available
   target dimension. Each binding records its specific target.
3. Update to calculate and validate affected parts. Apply to commit the table
   and geometry together in one Undo step. Closing the editor discards the draft.

For example, set `width = 26` and `inside = width - 4`. Bind these to free
sketch variables, supported native shape parameters, local sizes or centres,
or modelling dimensions such as wall thickness, offset and sweep radius.
If an existing sketch already calculates width as `outer - 2 * wall`, bind an
upstream free variable to preserve the sketch formula. Unsupported or protected
dimensions are disabled with an explanation.

Geometry updates only when requested. Typing, selection, camera movement,
unused parameters, renames and changes to inactive variants avoid a rebuild.
Updating rebuilds each affected source and its dependent construction at most
once and reuses independent committed parts.

## Variants

A variant stores value or formula overrides and explicit visibility or CAD
suppression states. Select it, update, and apply. The active variant has
computed geometry. A bounded cache can reuse recent results.

Hiding controls output of a whole part. Suppression excludes a CAD source
from its construction or a finished CAD part from output. Switching to a
variant without that override restores the base state. Mesh and view templates
use visibility. Part, source, layer and folder locks also apply to variants.

## References, files and export

Stable IDs preserve bindings across renames. Renaming also updates referring
parameter formulas. Cycles, unknown names, duplicate target bindings and
invalid values are rejected before Apply. Reassign missing targets or remove
their bindings. Cancelled, failed or stale updates leave the committed project
intact.

An edit to a bound source can leave it marked as needing an update. You can
save this state. Update affected models and drawing sources before export.
An explicitly selected independent subset can still be exported. Whole-project
export checks pending active variant states so required parts cannot silently
drop out.

These features require project and library format 13 and parameter format 1.
Older projects retain the format their contents require. Library entries
store selected sources and their formula dependencies. Insertion remaps IDs
and resolves name conflicts. Use either a legacy template control or a project
parameter to drive a given dimension.

Limits are 100 parameters, 500 bindings, 32 variants, 500 distinct variant
state targets and 100 values per variant. Existing tool geometry limits still
apply. Geometry for inactive variants is calculated on demand.

## Local automation

Use `parameter` operations with `put`/`data`, `selectVariant`/`variantId`,
or `remove` in a homogeneous preview batch. End the batch with `update` when
a put or variant change affects geometry. Reading the table or binding catalog
leaves geometry alone. A revision-bound Apply commits the batch. Consult the
[local API contract](../ai/) for complete request schemas.
