# Python modelling in Formnaro

Use Python to compute a local modelling preview with the same CAD kernel,
precision and tool limits as the interactive workspace. The desktop app
loads its bundled Python runtime on demand.

## In the application

Open the AI workshop, expand Python modelling and insert an example.
Calculate the preview and inspect the model and dimensions before applying.
Apply commits the whole result in one Undo step.

```python
from formnaro import model

plate = model.box(60, 40, 6, origin=(-30, -20, 0), name="Plate")
holes = [model.cylinder(2.5, 8, origin=(x, 0, -1), hole=True)
         for x in (-20, 20)]
part = model.cut(plate, *holes, name="Drilled plate")
result = {"holes": len(holes)}
```

Dimensions are in millimetres. A box origin is its lower local corner.
A cylinder or cone origin is the centre of its base. `normal` gives the
extrusion direction. `frame(origin, normal, x_axis)` defines a right-handed
sketch plane. Sketches extrude along local +Z.

The runtime executes pending commands at successful script completion.
`await model.flush()` submits pending commands before an intermediate check.
`await model.snapshot()` and `await model.query(...)` flush automatically.
Top-level `await` is supported.

| Operation | Python call |
| --- | --- |
| Box, cylinder and truncated cone | `model.box(...)`, `model.cylinder(...)`, `model.cone(...)` |
| Cylinder between points | `model.cylinder_between(diameter=8, start=(30,-1,18), end=(30,41,18), overrun=0.5, hole=True)` |
| Extrude a contour or native sketch | `model.polygon(...)`, `model.profile(...)`, `model.sketch(...)` |
| Boolean operations | `model.union(...)`, `model.cut(body, *tools)`, `model.intersect(...)` |
| Loft and sweep | `model.loft(*profiles)`, `model.sweep(profile, {"kind":"line", "length":30})` |
| Duplicate or find a source | `model.duplicate(part, offset=(x,y,z))`, `model.get(observed_id, path=[source_ids])` |
| Edit placement and dimensions | `part.move(...)`, `part.rotate(...)`, `part.edit(...)`, `await part.resize([10,10,44], anchor="center")` |
| Modify features | `model.offset_face(...)`, `model.shell(...)`, `model.drill(...)`, `model.finish(...)` |

`model.command(command)` exposes documented CAD and mesh operations. Linked
contours, parameters, joints and drawings use their own preview flows.
Loft and sweep save editable profile copies. Use `keep_profiles=True` for
a loft or `keep_profile=True` for a sweep to keep the separate helper parts.

Read part, face and edge references from the current scene or a measurement.
Refresh them after a geometry change. Native validation determines which
imported faces can be offset, shelled or rounded. Errors, cancellation and
timeouts discard intermediate work. A stale preview cannot replace a newer
project revision.

## External Python scripts

Use Python 3.10 or newer. Add `ai/python` to the Python path or install it
with `python -m pip install <path>/ai/python`. Enable the local interface in
the running app. [AI and local automation guide](AI-GUIDE.md)

```python
from formnaro import Client, Model

client = Client()  # Or pass the connection file path.
context = client.context()
scene = client.scene()
model = Model()
model.box(30, 20, 5, name="Part")
preview = client.preview(model, revision=scene["revision"])
# Inspect the preview before applying.
client.apply(preview)
```

`Client.preview_python(code)` runs a script inside the bundled runtime.
`Client.export("step")` returns file bytes. The client reads the local access
token internally. Keep it and the connection file private. This connection
requires no cloud key. Use `Client.discard(preview)` to discard a completed
preview without changing the confirmed model or Undo history. MCP provides
`offlinecad_python` for preview and `offlinecad_apply` for Apply.

## Runtime and saved models

In-app Python uses an isolated worker with an opaque origin and a temporary
WebAssembly filesystem. It has no mounted user folders, network, desktop
bridge, credentials or program storage. External CPython scripts run with the
permissions of the environment that started them.

Projects store the resulting Formnaro sources. Reopening a model does not run
the original script. The required project version depends on the features used.
See [Python examples](../ai/python/examples),
[runtime provenance](../python-runtime/provenance.json) and
[modelling helper semantics](KI-MODELLIERHILFEN.md).
