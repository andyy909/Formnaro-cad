"""Real Tk/Spawn acceptance for region colours and shared-boundary conversion."""
from pathlib import Path
import json
import time
import tkinter as tk
import traceback

from . import __version__
from .hybrid_verification import _identity, _sha256


def _capture(root, destination):
    """Capture only the test app's client window, never the desktop."""
    import ctypes as ct
    from ctypes import wintypes as wt
    from PIL import Image
    root.update_idletasks()
    user, gdi = ct.windll.user32, ct.windll.gdi32
    for name, args, result in (("GetAncestor", [wt.HWND, wt.UINT], wt.HWND),
                               ("GetDC", [wt.HWND], wt.HDC)):
        getattr(user, name).argtypes, getattr(user, name).restype = args, result
    for name, args, result in (("CreateCompatibleDC", [wt.HDC], wt.HDC),
                               ("CreateCompatibleBitmap", [wt.HDC, ct.c_int, ct.c_int], wt.HBITMAP),
                               ("SelectObject", [wt.HDC, wt.HGDIOBJ], wt.HGDIOBJ)):
        getattr(gdi, name).argtypes, getattr(gdi, name).restype = args, result
    user.PrintWindow.argtypes = [wt.HWND, wt.HDC, wt.UINT]
    gdi.GetDIBits.argtypes = [wt.HDC, wt.HBITMAP, wt.UINT, wt.UINT, ct.c_void_p, ct.c_void_p, wt.UINT]
    gdi.DeleteObject.argtypes = [wt.HGDIOBJ]
    gdi.DeleteDC.argtypes = [wt.HDC]
    user.ReleaseDC.argtypes = [wt.HWND, wt.HDC]
    w, h = root.winfo_width(), root.winfo_height()
    handle = user.GetAncestor(root.winfo_id(), 2)
    dc = user.GetDC(handle)
    memory = gdi.CreateCompatibleDC(dc)
    bitmap = gdi.CreateCompatibleBitmap(dc, w, h)
    old = gdi.SelectObject(memory, bitmap)
    class Header(ct.Structure):
        _fields_ = [("size", wt.DWORD), ("width", wt.LONG), ("height", wt.LONG), ("planes", wt.WORD),
                    ("bits", wt.WORD), ("compression", wt.DWORD), ("image_size", wt.DWORD),
                    ("xppm", wt.LONG), ("yppm", wt.LONG), ("colours", wt.DWORD), ("important", wt.DWORD)]
    info = Header(ct.sizeof(Header), w, -h, 1, 32, 0, w*h*4, 0, 0, 0, 0)
    pixels = ct.create_string_buffer(w*h*4)
    try:
        if not user.PrintWindow(handle, memory, 3):
            raise ValueError("Eigene Fensteraufnahme fehlgeschlagen")
        if not gdi.GetDIBits(memory, bitmap, 0, h, pixels, ct.byref(info), 0):
            raise ValueError("Eigene Fensterpixel fehlen")
        Image.frombuffer("RGB", (w, h), pixels, "raw", "BGRX", 0, 1).save(destination)
    finally:
        gdi.SelectObject(memory, old)
        gdi.DeleteObject(bitmap)
        gdi.DeleteDC(memory)
        user.ReleaseDC(handle, dc)


def run(directory, model_path=None):
    import numpy as np
    import trimesh
    import cadquery as cq
    from .gui import App, PANEL
    from .local_regions import face_colours
    output = Path(directory).resolve()
    output.mkdir(parents=True, exist_ok=True)
    identity, checks, errors = _identity(), {}, []
    state = {"phase": "recognition", "heartbeat": 0, "done": False}
    started = time.monotonic()
    if model_path:
        source = Path(model_path).resolve()
    else:
        source = output / "mixed-input.stl"
        body = cq.Workplane("XY").box(30, 20, 4, centered=(True, True, False)).val()
        body = body.fuse(cq.Workplane("XY").box(8, 8, 3, centered=(True, True, False)).val().translate((0, 0, 4)))
        for x in (-10, 10):
            body = body.cut(cq.Solid.makeCylinder(2, 4, cq.Vector(x, 0, 0)))
        body = body.cut(cq.Solid.makeCone(2, 3, 1, cq.Vector(-10, 0, 3)))
        body = body.cut(cq.Solid.makeCone(.8, 0, .6, cq.Vector(3, 0, 7), cq.Vector(0, 0, -1)))
        body.exportStl(str(source), tolerance=.008, angularTolerance=.16, relative=False, parallel=False)
    source_hash = _sha256(source)
    alternate = output / "alternate-input.stl"
    trimesh.creation.box(extents=(2, 3, 4)).export(alternate)
    root = tk.Tk()
    app = App(root)
    app.tolerance.set("0,2")
    app.select_source(source)
    app.view.set("Flächenarten")
    app.draw()

    def finish():
        if state["done"]:
            return
        state["done"] = True
        if app.process is not None:
            app.cancel()
        checks["source_unchanged"] = _sha256(source) == source_hash
        checks["source_code_or_executable_unchanged"] = _identity() == identity
        checks["worker_stopped"] = app.process is None
        result = {"passed": bool(checks) and all(checks.values()) and not errors,
                  "checks": {k: bool(v) for k, v in checks.items()}, "errors": errors,
                  "version": __version__, "seconds": time.monotonic()-started,
                  "results": state.get("results", {}), **identity}
        (output/"regions-check.json").write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding="utf-8")
        app.close()

    def callback_error(kind, value, trace):
        errors.append("".join(traceback.format_exception(kind, value, trace)))
        finish()
    root.report_callback_exception = callback_error

    def heartbeat():
        if not state["done"]:
            state["heartbeat"] += 1
            root.after(20, heartbeat)

    def poll():
        if state["done"]:
            return
        if time.monotonic()-started > 180:
            errors.append(f"Zeitlimit in {state['phase']}")
            finish()
            return
        if state["phase"] == "recognition":
            if app.region_thread is not None:
                root.after(50, poll)
                return
            if app.region_analysis is None:
                errors.append(app.region_error or "Keine Regionsanalyse")
                finish()
                return
            analysis = app.region_analysis
            checks["colour_view_before_conversion"] = app.report is None and "Flächenarten" in app.view_select.cget("values")
            checks["colour_data_complete"] = len(analysis.face_regions) == len(app.region_mesh.faces)
            checks["plane_and_cylinder_colours"] = len(np.unique(face_colours(analysis, np.arange(len(analysis.face_regions))),axis=0)) >= 2
            checks["cylinder_proposals_present"] = sum(r["type"] == "CYLINDER" for r in analysis.regions) >= (26 if model_path else 2)
            checks["cone_proposals_present"] = sum(r["type"] == "CONE" for r in analysis.regions) >= (6 if model_path else 1)
            checks["no_colourbar_axes"] = len(app.figure.axes) == 1
            checks["coloured_mesh_and_boundaries_drawn"] = len(app.axes.collections) == 2
            checks["tk_heartbeat_during_analysis"] = state["heartbeat"] >= 3
            app.canvas.draw()
            app.figure.savefig(output/"regions.png",dpi=140,facecolor=PANEL)
            _capture(root, output/"regions-desktop.png")
            from PIL import Image
            pixels = np.asarray(Image.open(output/"regions-desktop.png").convert("RGB")).astype(int)
            checks["visible_colour_pixels"] = np.count_nonzero(np.max(np.abs(pixels - (88,185,231)),axis=2) < 10) > 100
            # Thin conical bands are antialiased together with their boundary
            # overlay. A 20-level RGB window still excludes blue/orange/rest.
            checks["visible_cone_pixels"] = np.count_nonzero(np.max(np.abs(pixels - (119,206,141)),axis=2) < 20) > 30
            app.show_regions()
            checks["region_details_open"] = app.region_dialog is not None and app.region_dialog.winfo_exists()
            old_generation = app._region_generation
            app.select_source(alternate)
            checks["old_details_closed"] = app.region_dialog is None
            app._region_messages.put((old_generation,"done",analysis))
            app._poll_regions()
            checks["stale_analysis_discarded"] = app.region_analysis is None
            checks["source_change_returns_original"] = app.view.get() == "Original"
            app.select_source(source)
            state["phase"] = "conversion"
            settings = app.settings()
            settings["samples"] = 1000
            app.begin_conversion(output/"region-result.step",settings)
            checks["real_spawn_started"] = app.process is not None and app.process.pid is not None
        elif state["phase"] == "conversion":
            if app.process is not None:
                root.after(50,poll)
                return
            if app.report is None:
                errors.append(app.result_text.get())
                finish()
                return
            report = app.report
            shape = cq.importers.importStep(str(output/"region-result.step")).val()
            stage_key="connected_stage_in_real_worker" if model_path else "advanced_stage_in_real_worker"
            checks[stage_key] = report["bodies"][0]["stage"] == ("patches" if model_path else "advanced")
            checks["native_step_valid_closed"] = shape.isValid() and all(s.Closed() for s in shape.Shells())
            checks["native_cylinders"] = report["surface_types"].get("CYLINDER",0) >= (8 if model_path else 2)
            checks["native_cones"] = report["surface_types"].get("CONE",0) >= (6 if model_path else 1)
            checks["saved_report_identical"] = json.loads(Path(report["report"]).read_text(encoding="utf-8")) == report
            checks["sampled_budget_including_reserve"] = report["deviation"]["sampled_max_mm"]+report["tessellation_allowance_mm"] <= .2
            checks["shared_boundary_report"] = report["bodies"][0]["details"]["sewing_used"] is False
            state["results"] = {"faces":report["output_faces"],"surface_types":report["surface_types"],"sampled_max_mm":report["deviation"]["sampled_max_mm"]}
            app.view.set("Flächenarten")
            app.draw()
            state["phase"] = "after-result"
        elif state["phase"] == "after-result":
            if app.region_thread is not None:
                root.after(50,poll)
                return
            checks["colour_view_after_conversion"] = app.region_analysis is not None and app.region_error is None
            app.canvas.draw()
            _capture(root,output/"result-regions-desktop.png")
            from PIL import Image
            pixels = np.asarray(Image.open(output/"result-regions-desktop.png").convert("RGB")).astype(int)
            checks["visible_colour_pixels_after_result"] = np.count_nonzero(np.max(np.abs(pixels - (88,185,231)),axis=2) < 10) > 100
            app.cancel()
            checks["cancel_clears_analysis"] = app.region_analysis is None and app.view.get() == "Überlagert"
            checks["cancel_preserves_valid_result"] = app.report is not None and app.report["valid"]
            finish()
            return
        root.after(50,poll)
    root.after(20,heartbeat)
    root.after(50,poll)
    root.mainloop()
