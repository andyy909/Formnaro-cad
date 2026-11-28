# CAD exchange manifest v1

The manifest describes the editable CAD exchange package. Its STEP payload
contains the exact solid geometry, assembly hierarchy and rigid placements.
The manifest adds stable identities and display names for solid definitions
and their occurrences.

## Header and coordinates

| Field | Required value in v1 |
| --- | --- |
| `format` | `formnaro-cad-exchange` |
| `version` | JSON integer 1 |
| `units.length` | `mm` |
| `units.angle` | `rad` |
| `coordinates.handedness` | `right` |
| `coordinates.up` | `+Z` |
| `step.sha256` | Lowercase SHA-256 hex digest of the exact accompanying STEP bytes |

Coordinates use X, Y, Z order with +X × +Y = +Z. The world frame shares the
STEP assembly origin and axes. Definition geometry uses its own local frame.
STEP placements map that geometry into the assembly. Writers convert units and
axes before export. Readers reject unsupported headers and a STEP payload
whose bytes do not match the digest.

## Definitions and occurrences

Both arrays require 1–500 records. Each definition contains an `id` and a
display `name`.Each occurrence adds a `definitionId` that refers to a
definition in the same manifest. Every definition must be used. IDs are
case-sensitive and unique within their array. Each ID starts with an ASCII
letter or digit and can contain letters, digits, hyphens and underscores, up to
96 characters total. Display names may repeat and support Unicode text up to
200 UTF-16 code units. Stable IDs survive renames, placement edits and
reordering. Package authors retain existing IDs through those operations and
allocate new IDs when creating definitions or occurrences.

The STEP payload carries a `FORMNARO-D-<id>` alias in each solid
definition's `PRODUCT` identifier and name. It carries a `FORMNARO-O-<id>` alias
in the name field of each corresponding `NEXT_ASSEMBLY_USAGE_OCCURRENCE`.
Assembly group names, hierarchy and placements come from STEP. The manifest
covers every solid leaf and each leaf has a unique occurrence alias. If an
assembly definition is reused, its leaf occurrences must still have distinct
aliases under each parent. The package writer can expand the assembly
structure to give each leaf its own usage while sharing its solid definition.

The reader checks the definition alias and the actual reference of each
occurrence. Repeated aliases are valid for the shared definition when they
resolve to the same STEP definition. An occurrence alias must resolve exactly
once. The reader rejects missing occurrences, additional occurrences and
conflicting assignments before returning a geometry tree. STEP entity
numbers, XCAF label paths and display names are unsuitable as package IDs.
An add-in resolves the aliases from the STEP fields. A generic CAD importer
may show the product name in the object tree even when the occurrence name
is present in the STEP file.
Formnaro reads each package STEP back through the native reader before it
creates the manifest. The payload follows the limits of that reader, including
30 MiB, 500 solid occurrences, 1000 tree entries and 12 levels.

The package STEP uses AP214 and the same native geometry path as Formnaro's
ordinary STEP export. The ordinary export continues to use display names.
The current manifest scope covers geometry binding. Sketches, features,
joints and the package archive are specified in the subsequent exchange
tickets.
