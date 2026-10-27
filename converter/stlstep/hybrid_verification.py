"""Isolated native hybrid-converter acceptance through the real Tk worker.

Only generated fixtures in the supplied directory are used. The window stays
withdrawn; no user profile, user model, or unrelated screen is read or captured.
"""
from __future__ import annotations

from collections import Counter
import hashlib
import json
from pathlib import Path
import sys
import time
import tkinter as tk
import traceback


def _sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _identity():
    if getattr(sys, "frozen", False):
        return {"frozen": True, "executable": str(Path(sys.executable).resolve()),
                "executable_sha256": _sha256(sys.executable)}
    package = Path(__file__).resolve().parent
    manifest = {f"stlstep/{path.name}": _sha256(path) for path in sorted(package.glob("*.py"))}
    for name in ("launch.pyw", "pyproject.toml"):
        path = package.parent / name
        if path.exists():
            manifest[name] = _sha256(path)
    return {"frozen": False, "source_sha256_manifest": manifest}


def _inputs(output):
    import cadquery as cq
    import numpy as np
    import trimesh

    inputs = {}
    inputs["profile"] = output / "rounded-profile-input.stl"
    shape = cq.Workplane("XY").rect(30, 20).extrude(5).edges("|Z").fillet(3).val()
    shape.exportStl(str(inputs["profile"]), tolerance=0.008, angularTolerance=0.12,
                    relative=False, parallel=False)
    inputs["rounded_box"] = output / "rounded-box-input.stl"
    rounded_box = cq.Workplane("XY").box(24, 17, 11).edges().fillet(2).val()
    rounded_box.exportStl(str(inputs["rounded_box"]), tolerance=0.01, angularTolerance=0.12,
                         relative=False, parallel=False)
    from OCP.BRepFilletAPI import BRepFilletAPI_MakeFillet
    import math
    block = cq.Workplane("XY").box(24, 17, 11).val()
    builder = BRepFilletAPI_MakeFillet(block.wrapped)
    for edge in block.Edges():
        direction = np.abs(np.array(edge.endPoint().toTuple()) - np.array(edge.startPoint().toTuple()))
        builder.Add(2 if int(np.argmax(direction)) == 2 else .7, edge.wrapped)
    builder.Build()
    if not builder.IsDone():
        raise RuntimeError("Unequal-radius reference fixture could not be built.")
    mixed = cq.Shape.cast(builder.Shape())
    inputs["mixed_box"] = output / "mixed-radii-box-input.stl"
    mixed.exportStl(str(inputs["mixed_box"]), tolerance=.012, angularTolerance=.18,
                    relative=False, parallel=False)
    s = math.sqrt(.5)
    turning = (cq.Workplane("XZ").moveTo(3, 0).lineTo(9.2, 0)
               .threePointArc((9.2 + .8*s, .8 - .8*s), (10, .8)).lineTo(10, 4)
               .threePointArc((9+s, 4+s), (9, 5)).lineTo(7.4, 5)
               .threePointArc((7.4 - .4*s, 5.4 - .4*s), (7, 5.4)).lineTo(7, 11.4)
               .threePointArc((6.4 + .6*s, 11.4 + .6*s), (6.4, 12)).lineTo(3, 12)
               .close().revolve().val())
    inputs["mixed_turning"] = output / "mixed-radii-turning-input.stl"
    turning.exportStl(str(inputs["mixed_turning"]), tolerance=.008, angularTolerance=.12,
                      relative=False, parallel=False)
    lower = cq.Workplane("XY").box(30, 20, 2, centered=(True, True, False)).edges("|Z").fillet(3)
    lower = lower.faces(">Z").workplane().pushPoints([(-10, 0), (10, 0)]).hole(3)
    upper = (cq.Workplane("XY", origin=(0, 0, 2)).box(12, 10, 4, centered=(True, True, False))
             .edges("|Z").fillet(1))
    layered = lower.union(upper).faces(">Z").workplane().hole(2).val()
    inputs["layered"] = output / "layered-radii-input.stl"
    layered.exportStl(str(inputs["layered"]), tolerance=.01, angularTolerance=.18,
                      relative=False, parallel=False)
    plate = cq.Workplane("XY").box(30, 20, 6, centered=(True, True, False)).edges("|Z").fillet(3).val()
    for x in (-7, 7):
        plate = plate.cut(cq.Solid.makeCylinder(2, 6, cq.Vector(x, 0, 0)))
        plate = plate.cut(cq.Solid.makeCone(2, 4, 2, cq.Vector(x, 0, 4)))
    inputs["conical_bores"] = output / "countersunk-bores-input.stl"
    plate.exportStl(str(inputs["conical_bores"]), tolerance=.01, angularTolerance=.18,
                    relative=False, parallel=False)
    chamfered = (cq.Workplane("XY").box(24, 18, 6, centered=(True, True, False))
                 .faces(">Z").edges().chamfer(1).faces(">Z").workplane().hole(4).val())
    inputs["chamfered_plate"] = output / "chamfered-plate-input.stl"
    chamfered.exportStl(str(inputs["chamfered_plate"]), tolerance=.01, angularTolerance=.18,
                        relative=False, parallel=False)
    housing = (cq.Workplane("XY").box(30, 20, 8, centered=(True, True, False))
               .cut(cq.Workplane("XY", origin=(0, 0, 2)).box(24, 14, 6, centered=(True, True, False))))
    housing = housing.faces(">Z").edges().chamfer(.8).val()
    inputs["chamfered_case"] = output / "chamfered-case-input.stl"
    housing.exportStl(str(inputs["chamfered_case"]), tolerance=.01, angularTolerance=.18,
                      relative=False, parallel=False)
    organic = trimesh.creation.icosphere(subdivisions=1, radius=8)
    vertices = organic.vertices.copy()
    vertices[:, 0] *= 1.3 * (1 + 0.09 * np.sin(vertices[:, 2] / 3) + 0.03 * vertices[:, 1] / 8)
    vertices[:, 2] = vertices[:, 2] * 0.8 + 0.08 * vertices[:, 0] * vertices[:, 1] / 8
    organic.vertices = vertices
    inputs["organic"] = output / "organic-input.stl"
    organic.export(inputs["organic"])
    tetrahedron = trimesh.convex.convex_hull(np.array([[0, 0, 0], [10, 0, 0],
                                                      [0, 10, 0], [0, 0, 10]], dtype=float))
    inputs["tetrahedron"] = output / "tetrahedron-input.stl"
    tetrahedron.export(inputs["tetrahedron"])
    box = trimesh.creation.box(extents=(20, 30, 40))
    a, b, c = box.faces[0]
    middle = len(box.vertices)
    seam = trimesh.Trimesh(np.vstack((box.vertices, (box.vertices[a] + box.vertices[b]) / 2)),
                          np.vstack((box.faces[1:], [a, middle, c], [middle, b, c])), process=False)
    inputs["seam"] = output / "t-seam-input.stl"
    seam.export(inputs["seam"])
    return inputs


def run(directory):
    """Run twelve sequential real Spawn conversions; write hybrid-check.json."""
    import os
    os.environ["STLSTEP_VERIFY_TRACE"] = "1"
    for name in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS", "NUMBA_NUM_THREADS"):
        os.environ.setdefault(name, "1")
    from .gui import App
    from . import __version__

    output = Path(directory).resolve()
    output.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    identity = _identity()
    checks, errors, results = {}, [], {}
    state = {"index": -1, "finished": False, "phase_started": started}
    root = None
    app = None
    cases = [
        ("rounded_profile", "profile", {"mode": "auto", "tolerance": 0.1}, True),
        ("regional_roundings", "rounded_box", {"mode": "auto", "tolerance": 0.1}, True),
        ("mixed_edge_radii", "mixed_box", {"mode": "auto", "tolerance": 0.15}, True),
        ("mixed_turning_radii", "mixed_turning", {"mode": "auto", "tolerance": 0.15}, True),
        ("layered_radii", "layered", {"mode": "auto", "tolerance": 0.15}, True),
        ("conical_bores", "conical_bores", {"mode": "auto", "tolerance": 0.15}, True),
        ("chamfered_plate", "chamfered_plate", {"mode": "auto", "tolerance": 0.15}, True),
        ("chamfered_case", "chamfered_case", {"mode": "auto", "tolerance": 0.15}, True),
        ("organic_smooth", "organic", {"mode": "smooth", "tolerance": 0.1}, True),
        ("smooth_fallback", "tetrahedron", {"mode": "smooth", "tolerance": 0.1}, True),
        ("fallback_disabled", "tetrahedron", {"mode": "smooth", "tolerance": 0.1, "fallback": False}, False),
        ("local_seam_repair", "seam", {"mode": "exact", "tolerance": 0.001, "repair": True}, True),
    ]

    def finish():
        if state["finished"]:
            return
        state["finished"] = True
        checks["all_cases_finished"] = len(results) == len(cases)
        if app is not None:
            if app.process is not None:
                app.cancel()
            checks["no_worker_remaining"] = app.process is None
        try:
            current_identity = _identity()
            checks["tested_code_unchanged"] = current_identity == identity
        except Exception as exc:
            errors.append(f"Code identity check failed: {exc}")
        document = {"passed": bool(checks) and not errors and all(checks.values()), "version": __version__,
                    "checks": checks, "errors": errors,
                    "seconds": round(time.monotonic() - started, 2),
                    "phase_timeout_seconds": 120, "cases": results, **identity}
        (output / "hybrid-check.json").write_text(json.dumps(document, indent=2, ensure_ascii=False), encoding="utf-8")
        if app is not None:
            try:
                app.close()
            except Exception:
                if root is not None:
                    root.destroy()
        elif root is not None:
            root.destroy()

    def callback_error(kind, value, trace):
        errors.append("".join(traceback.format_exception(kind, value, trace)))
        finish()

    def check_success(name, destination, report):
        import cadquery as cq
        import numpy as np
        from OCP.BRepAdaptor import BRepAdaptor_Surface

        prefix = name + "."
        checks[prefix + "valid_report"] = bool(report.get("valid")) and report.get("solids") == 1
        checks[prefix + "report_path"] = (Path(report["report"]).resolve() == destination.with_suffix(".bericht.json")
                                           and Path(report["report"]).is_file())
        saved = json.loads(Path(report["report"]).read_text(encoding="utf-8"))
        checks[prefix + "saved_report_matches"] = saved == report
        checks[prefix + "step_and_preview_written"] = destination.is_file() and Path(report["preview"]).is_file()
        shape = cq.importers.importStep(str(destination)).val()
        checks[prefix + "native_step_valid_closed"] = (shape.isValid() and len(shape.Solids()) == 1
            and shape.Volume() > 0 and bool(shape.Shells())
            and all(shell.isValid() and shell.Closed() for shell in shape.Shells()))
        types = dict(Counter(face.geomType() for face in shape.Faces()))
        checks[prefix + "surface_types_match_step"] = types == report["surface_types"]
        checks[prefix + "original_deviation_within_budget"] = (
            report["deviation"]["sampled_max_mm"] + report["tessellation_allowance_mm"]
            <= report["options"]["tolerance"])
        checks[prefix + "result_controls_enabled"] = str(app.folder_button.cget("state")) == "normal"
        checks[prefix + "preview_loaded"] = app.preview_source is not None and app.preview_result is not None
        stage = report["bodies"][0]["stage"]
        if name == "rounded_profile":
            checks[prefix + "analytic_round_profile"] = (stage == "profiles" and types.get("CYLINDER", 0) >= 4
                                                         and len(shape.Faces()) <= 12)
        elif name == "regional_roundings":
            checks[prefix + "regional_reconstruction"] = stage == "regions"
            checks[prefix + "compact_analytic_roundings"] = types == {"PLANE": 6, "CYLINDER": 12, "SPHERE": 8}
        elif name == "mixed_edge_radii":
            details = report["bodies"][0]["details"]
            native_radii = sorted(BRepAdaptor_Surface(face.wrapped, True).Cylinder().Radius()
                                  for face in shape.Faces() if face.geomType() == "CYLINDER")
            checks[prefix + "distinct_radii_reconstructed"] = (stage == "regions"
                and details.get("regional_model") == "distinct_constant_edge_fillet_box"
                and len(details.get("radius_groups_mm", [])) == 2
                and np.allclose(details["radius_groups_mm"], [.7, 2], atol=.002, rtol=0)
                and len(native_radii) == 12
                and np.allclose(native_radii, [.7]*8 + [2]*4, atol=.002, rtol=0))
            checks[prefix + "compact_native_roundings"] = (len(shape.Faces()) == 26
                and types.get("PLANE") == 6 and types.get("CYLINDER") == 12)
        elif name == "mixed_turning_radii":
            details = report["bodies"][0]["details"]
            native_radii = sorted(BRepAdaptor_Surface(face.wrapped, True).Torus().MinorRadius()
                                  for face in shape.Faces() if face.geomType() == "TORUS")
            checks[prefix + "distinct_torus_radii"] = (stage == "profiles" and types.get("TORUS") == 4
                and len(details.get("radius_groups_mm", [])) == 4
                and np.allclose(details["radius_groups_mm"], [.4, .6, .8, 1], atol=.002, rtol=0)
                and len(native_radii) == 4
                and np.allclose(native_radii, [.4, .6, .8, 1], atol=.002, rtol=0))
            solid = shape.Solids()[0]
            checks[prefix + "compact_bore_preserved"] = (len(shape.Faces()) == 10
                and not solid.isInside(cq.Vector(0, 0, 6)) and solid.isInside(cq.Vector(5, 0, 6)))
        elif name == "layered_radii":
            details = report["bodies"][0]["details"]
            checks[prefix + "layered_profiles_reconstructed"] = (stage == "layers"
                and len(details.get("layers", [])) == 2 and details.get("profile_count") == 2)
            solid = shape.Solids()[0]
            checks[prefix + "compact_holes_preserved"] = (len(shape.Faces()) < 30
                and not solid.isInside(cq.Vector(0, 0, 1)) and not solid.isInside(cq.Vector(10, 0, 1))
                and not solid.isInside(cq.Vector(-10, 0, 1))
                and solid.isInside(cq.Vector(4, 0, 3)))
        elif name == "conical_bores":
            cones = [BRepAdaptor_Surface(face.wrapped, True).Cone()
                     for face in shape.Faces() if face.geomType() == "CONE"]
            checks[prefix + "native_countersinks_reconstructed"] = (stage == "features"
                and len(cones) == 2 and len(shape.Faces()) <= 16
                and all(abs(abs(cone.SemiAngle()) - np.pi / 4) < .002 for cone in cones))
            solid = shape.Solids()[0]
            checks[prefix + "bore_and_countersink_voids_preserved"] = (
                all(not solid.isInside(cq.Vector(x, 0, 2)) for x in (-7, 7))
                and not solid.isInside(cq.Vector(10.5, 0, 5.8))
                and solid.isInside(cq.Vector(10.5, 0, 3)) and solid.isInside(cq.Vector(0, 0, 3)))
        elif name == "chamfered_plate":
            checks[prefix + "compact_native_chamfer"] = (stage == "features"
                and types == {"PLANE": 10, "CYLINDER": 1})
            solid = shape.Solids()[0]
            checks[prefix + "chamfer_and_hole_preserved"] = (not solid.isInside(cq.Vector(0, 0, 3))
                and solid.isInside(cq.Vector(11.8, 0, 4))
                and not solid.isInside(cq.Vector(11.8, 0, 5.8))
                and solid.isInside(cq.Vector(10, 0, 5.8)))
        elif name == "chamfered_case":
            checks[prefix + "compact_native_rim_chamfer"] = (stage == "features" and types == {"PLANE": 19})
            solid = shape.Solids()[0]
            checks[prefix + "cavity_and_rim_preserved"] = (solid.isInside(cq.Vector(0, 0, 1))
                and not solid.isInside(cq.Vector(0, 0, 5))
                and solid.isInside(cq.Vector(14, 0, 7.8))
                and not solid.isInside(cq.Vector(14.9, 0, 7.8)))
        elif name == "organic_smooth":
            checks[prefix + "native_bspline_surface"] = stage == "smooth" and types.get("BSPLINE", 0) > 0
            checks[prefix + "pn_orientation_certified"] = bool(report["bodies"][0]["details"]["local_orientation_certified"])
        elif name == "smooth_fallback":
            checks[prefix + "conservative_exact_fallback"] = stage == "exact" and len(shape.Faces()) == 4
            checks[prefix + "smooth_rejection_recorded"] = any(
                attempt.get("method") == "smooth" and not attempt.get("accepted") for attempt in report["attempts"])
        elif name == "local_seam_repair":
            checks[prefix + "local_repair_selected"] = report["repairs"].get("backend") == "local.split_collinear_seams"
            checks[prefix + "six_planar_faces"] = stage == "exact" and types == {"PLANE": 6}
            checks[prefix + "repair_geometry_unchanged"] = report["repairs"].get("geometry_changed") is False
        return {"stage": stage, "faces": len(shape.Faces()), "surface_types": types,
                "sampled_max_mm": report["deviation"]["sampled_max_mm"], "report": report["report"],
                "step": str(destination), "step_sha256": _sha256(destination)}

    def start_next():
        if state["finished"]:
            return
        state["index"] += 1
        if state["index"] == len(cases):
            finish()
            return
        name, input_key, overrides, expected_success = cases[state["index"]]
        source = inputs[input_key]
        destination = output / (name + ".step")
        if destination.exists() or destination.with_suffix(".bericht.json").exists():
            errors.append(f"{name}: Test output already exists; choose a fresh verification directory.")
            finish()
            return
        app.select_source(source)
        settings = dict(app.settings(), samples=500, target_faces=100, fallback=True, repair=False,
                        rounds="keep", **{key: value for key, value in overrides.items()
                                          if key not in {"fallback", "repair", "rounds"}})
        settings.update(overrides)
        state.update(phase_started=time.monotonic(), source=source, destination=destination,
                     source_hash=_sha256(source), name=name, expected_success=expected_success)
        app.begin_conversion(destination, settings)
        state["pid"] = app.process.pid if app.process else None
        checks[name + ".spawn_worker_started"] = state["pid"] is not None and state["pid"] != os.getpid()
        root.after(100, poll)

    def poll():
        if state["finished"]:
            return
        name = state["name"]
        if time.monotonic() - state["phase_started"] > 120:
            errors.append(f"{name}: 120-second phase timeout; {app.status.get()}")
            finish()
            return
        if app.process is not None:
            root.after(100, poll)
            return
        checks[name + ".worker_finished"] = app.process is None
        checks[name + ".original_preserved"] = _sha256(state["source"]) == state["source_hash"]
        result = {"seconds": round(time.monotonic() - state["phase_started"], 2),
                  "worker_pid": state["pid"], "source_sha256": state["source_hash"]}
        if state["expected_success"]:
            if app.report is None:
                errors.append(f"{name}: {app.status.get()}; {app.result_text.get()}")
                results[name] = result
                finish()
                return
            result.update(check_success(name, state["destination"], app.report))
        else:
            checks[name + ".failure_reported"] = app.report is None and "Keine gültige Vereinfachung" in app.result_text.get()
            checks[name + ".no_output"] = not any(state["destination"].with_suffix(suffix).exists()
                for suffix in (".step", ".bericht.json", ".vorschau.stl", ".repariert.stl", ".repariert.3mf"))
            result["expected_error"] = app.result_text.get()
        results[name] = result
        root.after(100, start_next)

    try:
        inputs = _inputs(output)
        root = tk.Tk()
        root.withdraw()
        root.report_callback_exception = callback_error
        app = App(root)
        root.after(0, start_next)
        root.mainloop()
    except Exception:
        errors.append(traceback.format_exc())
        finish()
    return json.loads((output / "hybrid-check.json").read_text(encoding="utf-8"))
