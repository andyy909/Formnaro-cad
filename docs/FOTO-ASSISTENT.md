# Photo assistant

Attach a PNG, JPEG or WebP image to an AI chat and open the photo measurement
tool. You can also use Project Photos from any workspace without opening a
chat. Measurement runs locally. Sending the reference through chat uses the
configured provider and its normal attachment rules.

## Calibrate and measure

1. For a front-on photo, pick the endpoints of a known reference length and
   enter its length in millimetres, provenance and uncertainty.
2. For an oblique photo of a planar part, pick the four corners of a known
   rectangle clockwise from the upper left and enter its width and height.
   Measure features in that same plane and inside the calibrated rectangle.
   Lens distortion and differences in depth can still affect results.
3. Name each measurement and pick its two points. The grid, zoom and original
   pixel coordinates help you place points. The list reports measurements
   and estimated image uncertainty. Add supplied dimensions and assumptions
   separately.
4. Optionally trace and close the outer contour and each visible opening.
   Local edge suggestions can propose a connected edge and convex hull.
   Review and confirm any suggestion before using it. Add recesses and openings
   manually. Use the point editor to make corrections. Changing the reference
   recalculates measurements.
5. Attach the measurement to the modelling request. Supply any required
   hidden dimensions, such as thickness or bore depth, separately.

The rectified view maps its pointer back to original pixels. The marks
are stored in original coordinates. Cancelling or pressing Esc discards
unsaved marks. Saving a project photo preserves the upright original, its
checksum, provenance, annotations and calibration. A confirmed project
photo change has one Undo step. Up to four originals can be saved, with
limits of 5 MiB per original and 8 MiB of encoded image data in total.

The AI receives the photo, grid, view, calibration, measured points,
estimated uncertainty, assumptions, contours and open questions. Image
and reference are bound by SHA-256 and upright decoded size. Local
`photo/measure` and `photo/grid` operate on current chat photo references
without file or network access. Optional grids may be omitted to respect
attachment limits.

## Compare a candidate to a photo

A confirmed contour can be compared to changed visible material parts in
an uncommitted preview. The comparison aligns contour bounds without
changing the calibrated scale. Red marks missing model areas, blue marks
excess areas and green marks overlap. Outer dimensions and visible
openings are reported separately. The correction workflow preserves the
fixed reference and native requirements across attempts.

The raster comparison checks a projected display mesh. Verify exact
dimensions, solid validity, hidden features, fit and critical bores with
native checks. The image estimate does not change their tolerances.
Export a JSON report with values and provenance if you need to retain it
without image bytes. Apply is required to change the model.

## Reconstruct from three registered views

In Project Photos, link calibrated front (X/Z), right (Y/Z) and top (X/Y)
views. Correct their contours and openings first. For oblique photos,
the same planar calibration limits apply.

1. In each original, mark the same physical origin. The first axis points
   right and the second points up. Use the suggested lower-left point only
   when it denotes the same physical reference in all three views.
2. Confirm shared width X, depth Y and height Z, their provenance, native
   tolerance and separate world placement. Explicitly describe concealed
   geometry and confirm whether visible openings cut through the full depth.
3. If needed, add native functional checks for free cylindrical corridors or
   actual cylindrical bores. Specify their endpoints in common local XYZ
   millimetres. A through check extends past the outer faces. A clear
   corridor alone establishes clearance, while a bore check also requires
   the cylindrical wall.
4. Compute a new CAD variant. Formnaro intersects three editable sketch
   profiles and binds nine sketch variables to three shared parameters.
   Existing parts, parameters and locks are preserved.
5. Inspect the three comparisons and native findings before applying. The
   comparisons use the common origin, so a shifted candidate can fail even
   with correct overall dimensions. Apply is available after the required
   checks pass and records one Undo step.

View sets can be stored separately from a CAD variant and reopened later.
Missing originals or changed annotations require explicit rebinding. You
can recheck a committed variant and export the three image and native
reports as JSON. Projects with photos require format 19, and view sets
or reconstruction provenance require format 20. OCAD, FNPACK and recovery
preserve the data. Part templates may include provenance and bindings
without whole project images.

This workflow constrains the supplied projections. Unseen internal geometry
requires explicit information and checks. Curved outlines use confirmed
polylines with at most 128 contour points per view. Image quality, calibration
and reference agreement determine the usefulness of the results.

The grid and silhouette feedback were inspired by [mfranzon/print3d](https://github.com/mfranzon/print3d)
at commit `292ce13366155915ed7be4b4eec5a7ea570e3eb9`. Formnaro uses its own
photo, CAD and chat implementation.
