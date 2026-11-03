# Curves and advanced CAD features

## Bézier and B-spline curves

In the sketch editor, select a curve tool under contours with openings. A
Bézier curve uses four clicks for its start, two control points and end. A
B-spline takes four to sixteen control points. Finish the spline, then use
the close-polyline command if a closing edge is needed. Close open contours
before previewing a body.

Coordinates and formulas remain editable in the element editor. You can
insert or remove B-spline control points. Release any constraint that uses
a point before removing it. Other sketch constraints stay in place. The
B-splines are clamped, uniformly knotted cubic curves without weights.
The CAD model retains analytic edges and displays an approximation.

## Loft and sweep

For a loft, select two to eight native sketches and set their order. Profiles
must advance along the connection. You can use automatic orientation or
preserve the start of each profile. Loft profiles must have no inner openings.

For a sweep, select a native cross-section sketch. A composite path can contain
up to 32 lines, three-point arcs, Bézier or B-spline segments. Coordinates are
relative to the profile frame. The path starts at the origin with an initial
tangent along +Z. Segment tangents must agree where they meet. Curvature and
clearance checks reject overly tight, reversing and ambiguous paths. The final
native body is checked separately.

Reopen a saved loft or sweep through the CAD edit command. Its source profiles
stay available. Use the model-view control to minimize the preview dialog.

## FreeCAD tools

The portable desktop distribution bundles FreeCAD and Python. Formnaro checks
the object type or native defeaturing function and reports unavailable features.

- **Draft** uses selected faces and a separate planar neutral face. Set the
  angle and direction. The result contains a native PartDesign Draft with a
  static base.
- **Remove features** attempts to extend neighbouring faces to remove the
  selected faces. The result is static. You can rerun the archived program.
- **Revolve** uses a planar profile face, an explicit axis point and direction,
  and an angle. The imported profile is static. The revolve angle remains
  editable as a native feature.
- **Helix** creates a native helix, a linked circular profile and a native sweep.
  Set the radius, pitch, height, wire cross-section, axis and handedness.
  The helix radius must exceed the wire radius and the pitch must exceed the
  wire diameter. The tool supports up to 200 turns with zero taper.

These operations create separate parts. Apply can hide the original while
retaining its geometry and source. A STEP base transfers shape without the
old FreeCAD construction history. Edit the resulting native parameters with
FreeCAD Features. The FCStd archive includes the helper modules needed to
recompute the helix profile.

Preview, Apply and Cancel are separate. Applying the result and its optional
visibility change creates one Undo step. Curve sketches and advanced loft or
sweep recipes require project format 24 or later, depending on the other
features used.
