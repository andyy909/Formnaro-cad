"""Isolated Tk acceptance for the asynchronous mm deviation preview.

Only synthetic fixtures and this application's own figure are produced. The
window stays withdrawn; no user document or unrelated desktop is inspected.
"""
from __future__ import annotations

import json
from pathlib import Path
import threading
import time
import tkinter as tk
import traceback

from . import __version__
from .hybrid_verification import _identity, _sha256


def run(directory):
    import os
    for name in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS", "NUMBA_NUM_THREADS"):
        os.environ.setdefault(name, "1")
    import numpy as np
    import trimesh
    from . import gui
    from .deviation import display_face_indices, measure_deviation

    output = Path(directory).resolve()
    output.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    identity = _identity()
    checks, errors, results = {}, [], {}
    state = {"finished": False, "phase": "conversion", "phase_started": started, "heartbeats": 0}
    root, app = None, None
    blocked = threading.Event()
    release = threading.Event()
    original_function = gui.measure_deviation
    source = output / "cylinder-in-centimetres.stl"
    second_source = output / "other-source.stl"
    destination = output / "centimetre-result.step"
    before_files = None

    def finish():
        if state["finished"]:
            return
        state["finished"] = True
        gui.measure_deviation = original_function
        release.set()
        if app is not None:
            if app.process is not None:
                app.cancel()
            checks["no_conversion_worker_remaining"] = app.process is None
        try:
            checks["tested_code_unchanged"] = _identity() == identity
        except Exception as exc:
            errors.append(str(exc))
        document = {"passed": bool(checks) and all(checks.values()) and not errors,
                    "checks": {key: bool(value) for key, value in checks.items()}, "errors": errors, "version": __version__,
                    "seconds": round(time.monotonic() - started, 2),
                    "phase_timeout_seconds": 120, "results": results, **identity}
        (output / "deviation-check.json").write_text(json.dumps(document, indent=2, ensure_ascii=False), encoding="utf-8")
        if app is not None:
            app.close()
        elif root is not None:
            root.destroy()

    def callback_error(kind, value, trace):
        errors.append("".join(traceback.format_exception(kind, value, trace)))
        finish()

    def heartbeat():
        if not state["finished"]:
            state["heartbeats"] += 1
            root.after(20, heartbeat)

    def next_phase(name):
        state.update(phase=name, phase_started=time.monotonic())
        root.after(50, poll)

    def poll():
        nonlocal before_files, app, root
        if state["finished"]:
            return
        if time.monotonic() - state["phase_started"] > 120:
            errors.append(f"120-second timeout in {state['phase']}: {app.status.get()}")
            finish()
            return
        phase = state["phase"]
        if phase == "conversion":
            if app.process is not None:
                root.after(50, poll)
                return
            if not app.report:
                errors.append(f"Conversion failed: {app.result_text.get()}")
                finish()
                return
            import cadquery as cq
            shape = cq.importers.importStep(str(destination)).val()
            report = app.report
            checks["valid_actual_step"] = (report.get("valid") and shape.isValid()
                and len(shape.Solids()) == 1 and shape.Volume() > 0
                and all(shell.isValid() and shell.Closed() for shell in shape.Shells()))
            checks["input_centimetres_result_mm"] = report["options"]["unit"] == 10.0 and np.allclose(shape.BoundingBox().zlen, 8, atol=1e-5)
            checks["original_preserved"] = _sha256(source) == state["source_sha"]
            checks["default_overlay"] = app.view.get() == "Überlagert"
            checks["deviation_only_after_valid_result"] = "Abweichung" in app.view_select.cget("values")
            before_files = {str(path): _sha256(path) for path in (destination, Path(report["report"]), Path(report["preview"]))}
            state["companions_before"] = {path.name for path in output.glob(destination.stem + ".*")}
            state["report_before"] = json.dumps(report, sort_keys=True)
            app.view.set("Abweichung")
            state["request_started"] = time.monotonic()
            app.draw()
            checks["measurement_runs_in_thread"] = app.deviation_thread is not None and app.deviation_thread is not threading.current_thread()
            next_phase("heatmap")
            return
        if phase == "heatmap":
            if app.deviation_error:
                errors.append(app.deviation_error)
                finish()
                return
            if app.deviation_samples is None:
                root.after(50, poll)
                return
            sample = app.deviation_samples
            checks["heatmap_ready"] = len(sample.distances_mm) > 0 and np.isfinite(sample.distances_mm).all()
            checks["display_indices_exact"] = np.array_equal(sample.face_indices, display_face_indices(len(app.preview_result.faces)))
            checks["display_budget_20000"] = len(sample.face_indices) <= 20000
            expected = measure_deviation(app.preview_source, app.preview_result, 10.0)
            checks["distances_use_converted_mm"] = np.allclose(sample.distances_mm, expected.distances_mm, atol=1e-12)
            checks["legible_mm_colourbar"] = (app._deviation_colorbar is not None
                and app._deviation_colorbar.ax.get_ylabel() == "Abstand in mm"
                and app._deviation_colorbar.norm.vmin == 0
                and app._deviation_colorbar.norm.vmax == app.report["options"]["tolerance"])
            checks["one_way_metric_visible"] = ("Einseitige Stichprobe" in app.preview_note.get()
                and "Ergebnis → Original" in app.preview_note.get()
                and "Dreieckszentren" in app.preview_note.get())
            checks["exactly_two_axes_in_heatmap"] = len(app.figure.axes) == 2
            checks["per_triangle_rgba_without_shading"] = np.allclose(
                app.axes.collections[0]._facecolor3d,
                app._deviation_colorbar.cmap(app._deviation_colorbar.norm(sample.distances_mm)), atol=1e-12)
            app.figure.savefig(output / "deviation-preview.png", dpi=140, facecolor=gui.PANEL)
            checks["own_preview_render_written"] = (output / "deviation-preview.png").is_file()
            for _ in range(3):
                app.view.set("Überlagert")
                app.draw()
                if len(app.figure.axes) != 1:
                    errors.append("Colourbar axes leaked when leaving deviation view.")
                app.view.set("Abweichung")
                app.draw()
                if len(app.figure.axes) != 2:
                    errors.append("Colourbar axes duplicated on deviation view.")
            checks["view_switch_no_axes_leak"] = not errors and len(app.figure.axes) == 2
            checks["report_unchanged"] = json.dumps(app.report, sort_keys=True) == state["report_before"]
            checks["outputs_unchanged_no_extra_companion"] = (all(_sha256(path) == digest for path, digest in before_files.items())
                and {path.name for path in output.glob(destination.stem + ".*")} == state["companions_before"])
            results.update(display_triangles=len(sample.face_indices), sampled_one_way_max_mm=float(sample.distances_mm.max()),
                           input_unit_mm=app.report["options"]["unit"], step_sha256=_sha256(destination),
                           preview_image=str(output / "deviation-preview.png"))

            # Simulate a late non-cooperative completion from the old source.
            # Real measurements remain independently cancellation-tested.
            def deliberately_late(reference, candidate, unit, event):
                blocked.set()
                if not release.wait(5):
                    raise TimeoutError("Verifier did not release delayed preview.")
                return original_function(reference, candidate, unit)

            app._invalidate_deviation()
            gui.measure_deviation = deliberately_late
            state["heartbeat_before_block"] = state["heartbeats"]
            app.draw()
            state["late_thread"] = app.deviation_thread
            state["late_generation"] = app._deviation_generation
            next_phase("blocked_thread")
            return
        if phase == "blocked_thread":
            if not blocked.is_set() or state["heartbeats"] - state["heartbeat_before_block"] < 3:
                root.after(50, poll)
                return
            checks["tk_responsive_during_measurement"] = state["heartbeats"] - state["heartbeat_before_block"] >= 3
            app.select_source(second_source)
            gui.measure_deviation = original_function
            checks["new_source_cancels_old_measurement"] = app._deviation_generation > state["late_generation"]
            release.set()
            next_phase("stale_result")
            return
        if phase == "stale_result":
            if state["late_thread"].is_alive():
                root.after(50, poll)
                return
            app._poll_deviation()
            checks["stale_result_discarded"] = app.deviation_samples is None and app.report is None and app.preview_result is None
            checks["new_source_has_no_heatmap"] = "Abweichung" not in app.view_select.cget("values") and len(app.figure.axes) == 1
            checks["new_source_stays_original"] = app.view.get() == "Original"
            checks["new_source_preserved"] = _sha256(second_source) == state["second_sha"]
            checks["no_conversion_worker_remaining"] = app.process is None
            checks["close_marks_cancelled"] = True  # Actual close is tested immediately below.
            app.close()
            checks["close_marks_cancelled"] = app._closed and app._deviation_poll is None
            app = None
            root = None
            finish()

    try:
        if destination.exists() or (output / "deviation-check.json").exists():
            raise ValueError("Choose a fresh deviation verification directory.")
        trimesh.creation.cylinder(radius=.5, height=.8, sections=24).export(source)
        trimesh.creation.box(extents=(.2, .4, .8)).export(second_source)
        state["source_sha"], state["second_sha"] = _sha256(source), _sha256(second_source)
        root = tk.Tk()
        root.withdraw()
        root.report_callback_exception = callback_error
        app = gui.App(root)
        app.select_source(source)
        checks["no_deviation_before_result"] = "Abweichung" not in app.view_select.cget("values") and app.deviation_samples is None
        settings = dict(app.settings(), unit=10.0, tolerance=.08, mode="auto", samples=500, repair=False)
        app.begin_conversion(destination, settings)
        checks["real_spawn_worker"] = app.process is not None and app.process.pid != os.getpid()
        root.after(20, heartbeat)
        root.after(50, poll)
        root.mainloop()
    except Exception:
        errors.append(traceback.format_exc())
        finish()
    return json.loads((output / "deviation-check.json").read_text(encoding="utf-8"))
