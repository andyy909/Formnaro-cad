"""Source-preserving modelling for Formnaro, in CPython and the local Python worker.

Coordinates are millimetres. Primitives start at ``origin`` (a box's lower
corner, a round body's base centre); all geometry still uses Formnaro's CAD
kernel. Creating a Model only collects commands. Client.preview or the built-in
worker validates them without applying them to the confirmed project.
"""
import json
import math
import uuid
import re

__version__ = "1.3.0"
_rpc = None
_models = []


class FormnaroError(RuntimeError):
    def __init__(self, message, *, code=None, status=None, feedback=None):
        super().__init__(message)
        self.code, self.status, self.feedback = code, status, feedback


def _vector(value, length=3):
    values = list(value)
    if len(values) != length or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in values):
        raise ValueError("Finite coordinates required")
    return values


def _positive(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
        raise ValueError("A positive finite dimension is required")
    return value


def _target(value):
    if isinstance(value, Part):
        return value.target
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict) and set(value) == {"rootId", "path"}:
        return value
    raise ValueError("Choose a Part, object ID or source address")


def frame(origin=(0, 0, 0), normal=(0, 0, 1), x_axis=(1, 0, 0)):
    """Right-handed column-major sketch frame; extrusion follows its normal."""
    origin, normal, x_axis = map(_vector, (origin, normal, x_axis))
    norm = math.sqrt(sum(v*v for v in normal))
    if norm < 1e-12:
        raise ValueError("A nonzero normal is required")
    z = [v/norm for v in normal]
    dot = sum(a*b for a, b in zip(x_axis, z))
    x = [a-dot*b for a, b in zip(x_axis, z)]
    norm = math.sqrt(sum(v*v for v in x))
    if norm < 1e-12:
        raise ValueError("X axis must not be parallel to the normal")
    x = [v/norm for v in x]
    y = [z[1]*x[2]-z[2]*x[1], z[2]*x[0]-z[0]*x[2], z[0]*x[1]-z[1]*x[0]]
    return [*x, 0, *y, 0, *z, 0, *origin, 1]


class Part:
    def __init__(self, model, target):
        self.model, self.target = model, target

    def move(self, offset, space="world"):
        self.model.command({"op": "transform", "target": self.target, "translate": _vector(offset), "space": space})
        return self

    def rotate(self, degrees, space="world"):
        self.model.command({"op": "transform", "target": self.target, "rotate": _vector(degrees), "space": space})
        return self

    def edit(self, **values):
        self.model.command({"op": "update", "target": self.target, "set": values})
        return self

    async def resize(self, size, *, anchor="center"):
        """Resize in existing edit axes, preserving the measured parent-frame centre.

        ``edit(size=...)`` and anchor="min" retain the existing lower-corner
        behaviour. This helper needs the local Python worker / preview_python.
        It does not infer a cylinder axis or compensate inherited scaling.
        """
        size = [_positive(v) for v in _vector(size)]
        if anchor not in ("center", "min"):
            raise ValueError('Resize anchor must be "center" or "min"')
        if anchor == "min":
            return self.edit(size=size)
        resolved = await self.model.query("cad", "bounds", targets=[self.target])
        target = resolved["byId"][0]["target"]
        scene = await self.model.query("cad", "scene")
        obj = next((n for n in scene["objects"] if n["target"] == target), None)
        if obj is None or obj.get("kind") != "cad":
            raise ValueError("A measured native CAD source is required")
        bounds, matrix = obj["localBounds"], obj["transform"]
        centre = [(a+b)/2 for a, b in zip(bounds["min"], bounds["max"])]
        parent_centre = [matrix[12+k]+sum(matrix[j*4+k]*centre[j] for j in range(3)) for k in range(3)]
        return self.edit(size=size, pos=parent_centre)

    def hole(self, enabled=True):
        return self.edit(solid=not enabled)

    def union(self, *others, name="Vereinigung", alias=None):
        return self.model.union(self, *others, name=name, alias=alias)

    def cut(self, *tools, name="Ausschnitt", alias=None):
        return self.model.cut(self, *tools, name=name, alias=alias)

    def intersect(self, *others, name="Schnittmenge", alias=None):
        return self.model.intersect(self, *others, name=name, alias=alias)


class Model:
    def __init__(self):
        self.commands = []
        self._cursor = 0
        self._prefix = "py" + uuid.uuid4().hex[:12]
        self._sequence = 0
        _models.append(self)

    def command(self, command):
        if len(self.commands) >= 2000:
            raise ValueError("At most 2000 modelling operations per Python run")
        self.commands.append(json.loads(json.dumps(command, allow_nan=False)))
        return self

    def _part(self, command, alias=None):
        self._sequence += 1
        if alias is None:
            alias = self._prefix + "_" + str(self._sequence)
        if not isinstance(alias, str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]{0,63}", alias) or any(c.get("as") == alias for c in self.commands):
            raise ValueError("A unique result alias of 1 to 64 letters, digits, underscores or hyphens is required")
        self.command({**command, "as": alias})
        return Part(self, "$" + alias)

    def get(self, object_id, path=None):
        return Part(self, _target(object_id) if path is None else {"rootId": object_id, "path": list(path)})

    def primitive(self, kind, size, *, origin=(0, 0, 0), normal=(0, 0, 1), name=None, hole=False, color="#599fd1", params=None):
        """Round primitives use a base centre; boxes use a lower local corner."""
        size = [_positive(v) for v in _vector(size)]
        normal = _vector(normal)
        matrix = frame(origin, normal, (0, 1, 0) if abs(normal[0]) > .9*math.sqrt(sum(v*v for v in normal)) else (1, 0, 0))
        local = [size[0]/2, size[1]/2, size[2]/2] if kind in ("box", "roundbox") else [0, 0, size[2]/2]
        for k in range(3):
            matrix[12+k] += sum(matrix[j*4+k]*local[j] for j in range(3))
        recipe = {"type": kind, "size": size}
        if params is not None:
            recipe["params"] = params
        return self._part({"op": "tool", "engine": "cad", "operation": {"kind": "create", "recipe": recipe,
            "options": {"name": name or kind, "solid": not hole, "color": color, "transform": matrix}}})

    def box(self, width, depth, height, **options):
        return self.primitive("box", [width, depth, height], **options)

    def cylinder(self, radius, height, **options):
        radius = _positive(radius)
        return self.primitive("cylinder", [2*radius, 2*radius, height], **options)

    def cylinder_between(self, *, diameter, start, end, overrun=0, **options):
        """Native cylinder on an explicit world segment, extended at both ends.

        Points are world millimetres for a new root. They are never implicitly
        source-local coordinates. Transform measured source points to world
        before calling. The normal and length follow start -> end.
        """
        diameter = _positive(diameter)
        start, end = _vector(start), _vector(end)
        if isinstance(overrun, bool) or not isinstance(overrun, (int, float)) or not math.isfinite(overrun) or overrun < 0:
            raise ValueError("A nonnegative finite overrun is required")
        delta = [b-a for a, b in zip(start, end)]
        length = math.sqrt(sum(v*v for v in delta))
        if not math.isfinite(length) or length < .01:
            raise ValueError("Cylinder endpoints must be at least 0.01 mm apart")
        if any(k in options for k in ("origin", "normal", "height", "radius")):
            raise ValueError("Cylinder placement is defined by start and end")
        normal = [v/length for v in delta]
        origin = [v-overrun*n for v, n in zip(start, normal)]
        return self.cylinder(diameter/2, length+2*overrun, origin=origin, normal=normal, **options)

    def cone(self, radius, top_radius, height, **options):
        _positive(radius)
        if not isinstance(top_radius, (int, float)) or not math.isfinite(top_radius) or top_radius < 0 or top_radius > radius:
            raise ValueError("Top radius must lie between zero and base radius")
        return self.primitive("cone", [2*radius, 2*radius, height], params={"topDiameter": 2*top_radius}, **options)

    def sketch(self, sketch, *, plane=None, name="Skizze", hole=False, color="#599fd1", alias=None):
        return self._part({"op": "sketch", "sketch": sketch, "frame": list(plane) if plane is not None else frame(),
                           "name": name, "solid": not hole, "color": color}, alias=alias)

    async def section(self, source, height, *, normal, point, start=None, fit_tolerance=0.02,
                      name="Schnittrekonstruktion", alias=None):
        """Extrude all measured section loops as editable native sketches.

        start is the world plane distance dot(unit_normal, xyz). None uses the
        actual measured plane. Holes are never silently omitted to meet the
        128-element native sketch limit; separate retained cutters are used.
        This reconstructs ONE prismatic section, not the whole source volume.
        """
        _positive(height)
        normal, point = _vector(normal), _vector(point)
        if start is not None and (isinstance(start, bool) or not isinstance(start, (int, float)) or not math.isfinite(start)):
            raise ValueError("A finite world plane distance is required")
        data = await self.query("mesh", "sectionContours", id=_target(source),
                                options={"normal": normal, "planePoint": point, "fitTolerance": fit_tolerance})
        loops = data.get("loops", [])
        if not data.get("complete") or not loops or any(not l.get("complete") or not l.get("elements") or len(l["elements"]) > 128 for l in loops):
            raise ValueError("Complete section loops with at most 128 elements EACH are required; no holes were omitted")
        by_index = {l["index"]: l for l in loops}
        if len(by_index) != len(loops) or any(l["parentIndex"] is not None and l["parentIndex"] not in by_index for l in loops):
            raise ValueError("Section nesting is incomplete")
        plane = list(data["frame"])
        if start is not None:
            n = plane[8:11]
            offset = start - sum(a*b for a, b in zip(n, plane[12:15]))
            plane[12:15] = [v+offset*n[k] for k, v in enumerate(plane[12:15])]

        def profile(rows):
            return {"version": 2, "kind": "profile", "variables": [], "dimensions": {"height": height},
                    "elements": [e for row in rows for e in row["elements"]],
                    "loops": [{"id": "s"+str(row["index"]), "role": "outer" if i == 0 else "hole",
                               "elements": [e["id"] for e in row["elements"]]} for i, row in enumerate(rows)]}

        outers = [l for l in loops if l["role"] == "outer"]
        bodies = []
        for outer in outers:
            holes = [l for l in loops if l["role"] == "hole" and l["parentIndex"] == outer["index"]]
            rows = [outer, *holes]
            final_alias = alias if len(outers) == 1 else None
            if sum(len(l["elements"]) for l in rows) <= 128:
                body = self.sketch(profile(rows), plane=plane, name=name, alias=final_alias)
            else:
                body = self.sketch(profile([outer]), plane=plane, name=name+" – Außenkontur")
                cutters = [self.sketch(profile([h]), plane=plane, name=name+" – Loch "+str(h["index"]), hole=True) for h in holes]
                body = self.cut(body, *cutters, name=name, alias=final_alias)
            bodies.append(body)
        if not bodies:
            raise ValueError("No outer material loop in section")
        return bodies[0] if len(bodies) == 1 else self.union(*bodies, name=name, alias=alias)

    def polygon(self, points, height, *, plane=None, name="Kontur", hole=False):
        points = [_vector(p, 2) for p in points]
        if points and points[0] == points[-1]:
            points.pop()
        sketch = {"version": 1, "kind": "polygon", "variables": [{"name": "hoehe", "value": str(_positive(height))}],
                  "dimensions": {"height": "hoehe"}, "points": [[str(v) for v in p] for p in points]}
        return self.sketch(sketch, plane=plane, name=name, hole=hole)

    def profile(self, elements, height, *, loops=None, variables=None, **options):
        """Version-2 lines/arcs/circles; arbitrary valid inner contour loops."""
        elements = json.loads(json.dumps(elements, allow_nan=False))
        for i, element in enumerate(elements):
            element.setdefault("id", "e" + str(i+1))
        sketch = {"version": 2, "kind": "profile", "variables": variables or [],
                  "dimensions": {"height": str(_positive(height))}, "elements": elements,
                  "loops": loops or [{"id": "outer", "role": "outer", "elements": [e["id"] for e in elements]}]}
        return self.sketch(sketch, **options)

    def union(self, *parts, name="Vereinigung", alias=None):
        if len(parts) < 2:
            raise ValueError("At least two operands are required")
        return self._part({"op": "group", "targets": [_target(p) for p in parts], "operation": "union", "name": name}, alias=alias)

    def cut(self, body, *tools, name="Ausschnitt", alias=None):
        if not tools:
            raise ValueError("At least one cutting tool is required")
        for tool in tools:
            self.command({"op": "update", "target": _target(tool), "set": {"solid": False}})
        self.command({"op": "update", "target": _target(body), "set": {"solid": True}})
        return self.union(body, *tools, name=name, alias=alias)

    def intersect(self, *parts, name="Schnittmenge", alias=None):
        if len(parts) < 2:
            raise ValueError("At least two operands are required")
        return self._part({"op": "group", "targets": [_target(p) for p in parts], "operation": "intersection", "name": name}, alias=alias)

    def loft(self, *profiles, name="Profilübergang", keep_profiles=False, hole=False, alias=None):
        part = self._part({"op": "profileModeling", "kind": "loft", "targets": [_target(p) for p in profiles]}, alias=alias)
        part.edit(name=name, solid=not hole)
        if not keep_profiles:
            for profile in profiles:
                self.command({"op": "delete", "target": _target(profile)})
        return part

    def sweep(self, profile, path, *, name="Profil entlang Pfad", keep_profile=False, alias=None):
        part = self._part({"op": "profileModeling", "kind": "sweep", "targets": [_target(profile)], "path": path}, alias=alias)
        part.edit(name=name)
        if not keep_profile:
            self.command({"op": "delete", "target": _target(profile)})
        return part

    def duplicate(self, part, offset=(0, 0, 0)):
        return self._part({"op": "duplicate", "target": _target(part), "translate": _vector(offset), "space": "world"})

    def offset_face(self, part, face_index, distance):
        self.command({"op": "modeling", "target": _target(part), "operation": {"kind": "face-offset", "faceIndex": face_index, "offset": distance}})
        return part

    def shell(self, part, opening_faces, thickness):
        self.command({"op": "modeling", "target": _target(part), "operation": {"kind": "shell", "faceIndices": list(opening_faces), "thickness": _positive(thickness)}})
        return part

    def finish(self, part, step):
        """Fillet/chamfer step using edge origins returned by the native query."""
        self.command({"op": "tool", "engine": "cad", "operation": {"kind": "finish", "target": _target(part), "step": step}})
        return part

    def drill(self, part, reference, **options):
        return self._part({"op": "tool", "engine": "cad", "operation": {"kind": "tool", "name": "previewDrill", "options": {"id": _target(part), "reference": reference, **options}}})

    def edit_sketch(self, part, sketch):
        self.command({"op": "sketch", "target": _target(part), "sketch": sketch})
        return part

    def remove(self, part):
        self.command({"op": "delete", "target": _target(part)})

    async def flush(self):
        if _rpc is None:
            raise RuntimeError("Outside Formnaro use Client.preview(model), then explicit Client.apply(proposal)")
        while self._cursor < len(self.commands):
            await _rpc("run", self.commands[self._cursor])
            self._cursor += 1

    async def snapshot(self):
        await self.flush()
        return await _rpc("model", None)

    async def query(self, engine, kind, **options):
        await self.flush()
        return await _rpc("query", {"engine": engine, "kind": kind, "options": options})


model = Model()


async def _flush_all():
    for item in _models:
        await item.flush()


class Client:
    """Standard-library local client. Tokens stay inside the transport."""
    def __init__(self, connection=None):
        if _rpc is not None:
            raise RuntimeError("In the built-in worker use model.query / model.snapshot")
        from ._transport import Transport
        self._transport = Transport(connection)

    def context(self):
        return self._transport.request("context")

    def scene(self):
        return self._transport.request("scene")

    def project(self):
        return self._transport.request("project")

    def preview(self, model_or_commands, *, revision=None, label="Python-Modell", checks=None):
        commands = model_or_commands.commands if isinstance(model_or_commands, Model) else model_or_commands
        if not isinstance(commands, list) or not 1 <= len(commands) <= 200:
            raise ValueError("External preview needs 1–200 commands; use a Python command for larger calculated workflows")
        request = {"revision": revision or self.scene()["revision"], "label": label, "commands": commands}
        if checks is not None:
            request["checks"] = checks
        return self._transport.request("preview", request)

    def preview_python(self, code, *, revision=None, label="Python-Modell", checks=None):
        if not self.context().get("programTools", {}).get("python"):
            raise RuntimeError("Python inside the application requires Formnaro 0.90 or newer")
        return self.preview([{"op": "python", "code": code}], revision=revision, label=label, checks=checks)

    def apply(self, proposal):
        return self._transport.request("apply", {k: proposal[k] for k in ("previewId", "revision")})

    def export(self, format="step", *, ids=None):
        import base64
        request = {"format": format}
        if ids is not None:
            request["ids"] = ids
        return base64.b64decode(self._transport.request("export", request)["dataBase64"], validate=True)


__all__ = ["Client", "FormnaroError", "Model", "Part", "frame", "model"]
