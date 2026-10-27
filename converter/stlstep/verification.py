"""Isolated desktop smoke test for source and frozen Windows application."""
from pathlib import Path
import json
import time
import tkinter as tk


def run(directory, model_path=None):
    import os
    os.environ["STLSTEP_VERIFY_TRACE"] = "1"
    import trimesh
    from .gui import App
    output = Path(directory).resolve()
    output.mkdir(parents=True, exist_ok=True)
    if model_path:
        source = Path(model_path).resolve()
        mesh = trimesh.load_mesh(source, process=False)
    else:
        source = output / "desktop-input.stl"
        mesh = trimesh.creation.cylinder(radius=8, height=5, sections=96)
        mesh.export(source)
    import hashlib
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    root = tk.Tk()
    root.withdraw()
    app = App(root)
    app.select_source(source)
    settings = app.settings()
    settings["samples"] = 6000 if model_path else 500
    started = time.monotonic()
    checks = {}
    errors = []
    phase = {"value": "cylinder"}
    def callback_error(kind, value, traceback):
        import traceback as trace
        errors.append("".join(trace.format_exception(kind, value, traceback)))
        finish()
    root.report_callback_exception = callback_error
    app.begin_conversion(output / "desktop-result.step", settings)
    def poll():
        if time.monotonic() - started > (300 if model_path else 150):
            errors.append("Desktop conversion timeout")
            finish()
        elif app.process:
            root.after(100, poll)
        elif not app.report:
            errors.append(app.result_text.get())
            finish()
        elif phase["value"] == "cylinder":
            checks["worker_conversion"] = app.report["valid"]
            if model_path:
                checks["windows_model_repair"] = app.report["repairs"].get("backend") == "Windows.Printing3D.RepairAsync"
                checks["original_deviation_within_budget"] = app.report["deviation"]["sampled_max_mm"] < app.report["options"]["tolerance"]
                checks["indexed_repaired_3mf_exported"] = Path(app.report["repaired_3mf"]).exists()
            else:
                checks["analytic_cylinder"] = app.report["surface_types"].get("CYLINDER", 0) > 0
            checks["original_preserved"] = source.exists() and hashlib.sha256(source.read_bytes()).hexdigest() == source_hash
            checks["output_controls_enabled"] = str(app.folder_button.cget("state")) == "normal"
            root.deiconify()
            root.update_idletasks()
            root.after(800, screenshot_and_cancel)
        else:
            checks["planar_worker_conversion"] = app.report["valid"]
            checks["planar_simplification"] = app.report["bodies"][0]["method"].startswith("Planare") and app.report["output_faces"] < 320
            app.begin_conversion(output / "cancelled.step", settings)
            root.after(300, cancel_check)
    def screenshot_and_cancel():
        try:
            from PIL import Image
            import ctypes as ct
            from ctypes import wintypes as wt
            x, y = root.winfo_rootx(), root.winfo_rooty()
            width, height = root.winfo_width(), root.winfo_height()
            # Capture this application's client area directly. Screen grabs can
            # show an unrelated foreground app when the test stays behind it.
            user, gdi = ct.windll.user32, ct.windll.gdi32
            user.GetAncestor.argtypes = [wt.HWND, wt.UINT]
            user.GetAncestor.restype = wt.HWND
            user.GetDC.argtypes = [wt.HWND]
            user.GetDC.restype = wt.HDC
            gdi.CreateCompatibleDC.argtypes = [wt.HDC]
            gdi.CreateCompatibleDC.restype = wt.HDC
            gdi.CreateCompatibleBitmap.argtypes = [wt.HDC, ct.c_int, ct.c_int]
            gdi.CreateCompatibleBitmap.restype = wt.HBITMAP
            gdi.SelectObject.argtypes = [wt.HDC, wt.HGDIOBJ]
            gdi.SelectObject.restype = wt.HGDIOBJ
            user.PrintWindow.argtypes = [wt.HWND, wt.HDC, wt.UINT]
            gdi.GetDIBits.argtypes = [wt.HDC, wt.HBITMAP, wt.UINT, wt.UINT, ct.c_void_p, ct.c_void_p, wt.UINT]
            handle = user.GetAncestor(root.winfo_id(), 2)
            dc = user.GetDC(handle)
            memory_dc = gdi.CreateCompatibleDC(dc)
            bitmap = gdi.CreateCompatibleBitmap(dc, width, height)
            old = gdi.SelectObject(memory_dc, bitmap)
            class Header(ct.Structure):
                _fields_ = [("size", wt.DWORD), ("width", wt.LONG), ("height", wt.LONG),
                            ("planes", wt.WORD), ("bits", wt.WORD), ("compression", wt.DWORD),
                            ("image_size", wt.DWORD), ("xppm", wt.LONG), ("yppm", wt.LONG),
                            ("colours", wt.DWORD), ("important", wt.DWORD)]
            info = Header(ct.sizeof(Header), width, -height, 1, 32, 0, width * height * 4, 0, 0, 0, 0)
            pixels = ct.create_string_buffer(width * height * 4)
            try:
                if not user.PrintWindow(handle, memory_dc, 3):
                    raise RuntimeError("PrintWindow failed")
                gdi.GetDIBits(memory_dc, bitmap, 0, height, pixels, ct.byref(info), 0)
                Image.frombuffer("RGB", (width, height), pixels, "raw", "BGRX", 0, 1).save(output / "desktop.png")
            finally:
                gdi.SelectObject(memory_dc, old)
                gdi.DeleteObject.argtypes = [wt.HGDIOBJ]
                gdi.DeleteDC.argtypes = [wt.HDC]
                user.ReleaseDC.argtypes = [wt.HWND, wt.HDC]
                gdi.DeleteObject(bitmap)
                gdi.DeleteDC(memory_dc)
                user.ReleaseDC(handle, dc)
            checks["convert_button_visible"] = app.convert_button.winfo_rooty() + app.convert_button.winfo_height() <= y + height - 80
            checks["cancel_button_visible"] = app.cancel_button.winfo_rooty() + app.cancel_button.winfo_height() <= y + height - 80
            checks["measurement_note_visible"] = app.measurement_note.winfo_rooty() + app.measurement_note.winfo_height() <= y + height
            checks["model_preview_visible"] = (app.preview_source is not None
                                               and app.preview_result is not None
                                               and len(app.axes.collections) == 2
                                               and "Vorschau nicht verfügbar" not in app.status.get())
            root.withdraw()
            planar_source = output / "planar-input.stl"
            trimesh.creation.icosphere(subdivisions=2, radius=3).export(planar_source)
            app.select_source(planar_source)
            phase["value"] = "planar"
            planar_settings = dict(settings, mode="planar", tolerance=0.3, target_faces=50)
            app.begin_conversion(output / "planar-result.step", planar_settings)
            root.after(100, poll)
        except Exception as exc:
            errors.append(str(exc))
            finish()
    def cancel_check():
        app.cancel()
        checks["cancellation_stops_worker"] = app.process is None
        checks["cancelled_output_absent"] = not (output / "cancelled.step").exists()
        checks["previous_result_retained"] = (output / "desktop-result.step").exists()
        finish()
    def finish():
        import sys
        from . import __version__
        (output / "ui-check.json").write_text(json.dumps({"checks": checks, "errors": errors,
            "passed": not errors and all(checks.values()), "seconds": round(time.monotonic() - started, 2),
            "version": __version__, "frozen": bool(getattr(sys, "frozen", False)),
            "exe_sha256": hashlib.sha256(Path(sys.executable).read_bytes()).hexdigest() if getattr(sys, "frozen", False) else None,
            "last_status": app.status.get(), "last_result": app.result_text.get()},
            indent=2, ensure_ascii=False), encoding="utf-8")
        try:
            app.close()
        except Exception:
            root.destroy()
    root.after(100, poll)
    root.mainloop()
