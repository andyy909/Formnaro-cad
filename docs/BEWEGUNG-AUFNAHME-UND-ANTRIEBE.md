# Change reports, motion recording and drive couplings

## Change reports

Local preview and apply requests accept `responseDetail:"summary"` to return
affected roots, numerical dimensions and placements, joint and coupling
changes, check results, warnings, revision and next actions.
`responseDetail:"full"` requests detailed output. Calls without the option
retain detailed output, and compact MCP adapters request summaries explicitly.
A preview reports its base revision and preview ID. Apply reports the
confirmed revision and preserves any check or post-commit errors in the reply.
The Python SDK accepts `response_detail="summary"|"full"`.

## Play and record motion

The joint dialog can play motion at selected sizes and capture PNG or GIF.
Playback uses the compiled joint tree and current display geometry, without
applying the model or rebuilding native bodies per frame. Completion,
cancellation and recording errors restore the original display. GIF recording
is limited to 160 frames at 480 × 360 pixels with a fixed RGB332 palette.
Incomplete recordings are labelled in the file name and JSON receipt, which
also records joint values for captured frames. PNG captures the current preview.

## Screw and planar actuator drives

- **Screw drive** uses `joint/drive-create` with `drive.kind:"screw"`,
  `rotary` and `linear`. Set lead in millimetres per turn, or give pitch
  and number of starts, and set direction to +1 or −1. The current position
  is the reference. Either end can drive the relation, including in
  combination with existing gear couplings.
- **Planar actuator** uses `drive.kind:"actuator"`, `table`, `swivel`,
  `extension` and the table `attachment` point in world millimetres.
  The table and swivel share a rigid parent and parallel axes. The
  extension hangs directly from the swivel. Its joint reference is at
  the table attachment, and its axis follows the line between the
  connections. The solver updates table angle, swivel angle and extension
  together. Inverse operation chooses the nearest feasible table position
  and reports ties or unreachable attachments. A swivel angle alone
  does not identify a drive position. A connected drive group supports
  one nonlinear relation.

All dependent limits and locks apply. Conflicting drives are rejected
atomically. Remove a drive with `joint/drive-remove` and its `driveId`.
Read the live tool schemas for exact commands and `app/joints` for saved
drives. These drives use joint data version 3 and project or library format
31. OCAD, FNPACK and complete internal copies preserve the relationships.
Partial copies drop couplings whose full participants are absent.

## Sample a range of motion

`app/motionRange` is read-only. Provide `jointId`, `from`, `to`, optionally
`step` (default 1° or 1 mm), and explicit `leftId` and `rightId` pairs.
`timeLimitMs` defaults to 30 seconds and can be set up to 300 seconds.
The request covers up to 16 pairs and 501 positions, including the endpoints
if the budget reaches them. The same motion solver computes coupled poses.
Positive volume intersections report the pair, drive value and measurement
method. Limits and cancellation identify any untested remainder.

The report describes sampled positions and pairs. Continuous clearance,
contact forces and manufacturing approval require other evidence. See
[saved inspection records and release verification](GESAMTPLAN-RELEASE-ABNAHME.md).
The [original development record](https://github.com/andyy909/Formnaro-cad/blob/v0.125.0-r36/docs/BEWEGUNG-AUFNAHME-UND-ANTRIEBE.md)
contains the earlier targeted checks.
