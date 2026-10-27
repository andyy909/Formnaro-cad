"""Desktop UI. CAD runs in a cancellable process, never on Tk's UI thread."""
from __future__ import annotations
from dataclasses import asdict
import multiprocessing as mp
import os
from pathlib import Path
import queue
import sys
import threading
import tkinter as tk
from tkinter import ttk, filedialog, messagebox

from . import __version__
from .deviation import DeviationCancelled, colour_limit, display_face_indices, measure_deviation


def conversion_worker(source, destination, settings, messages):
    trace_path = Path(destination).with_suffix(".lauf.log") if os.environ.get("STLSTEP_VERIFY_TRACE") == "1" else None
    def progress(line):
        if trace_path:
            import datetime
            trace_path.parent.mkdir(parents=True, exist_ok=True)
            with trace_path.open("a", encoding="utf-8") as stream:
                stream.write(f"{datetime.datetime.now().isoformat(timespec='seconds')} {line}\n")
        messages.put(("progress", line))
    try:
        from .engine import Options, convert
        report = convert(source, destination, Options(**settings),
                         progress, overwrite=True)
        messages.put(("done", report))
    except Exception as exc:
        progress(f"Fehler: {exc}")
        messages.put(("error", str(exc)))


BG = "#101923"
PANEL = "#182531"
TEXT = "#e7eef3"
MUTED = "#9bb0bf"
ACCENT = "#6cdac2"


class App:
    def __init__(self, root):
        self.root = root
        self.source = None
        self.report = None
        self.process = None
        self.messages = None
        self.preview_source = None
        self.preview_result = None
        self.deviation_samples = None
        self.deviation_error = None
        self.deviation_thread = None
        self._deviation_messages = queue.Queue()
        self._deviation_cancel = None
        self._deviation_generation = 0
        self._deviation_poll = None
        self._deviation_colorbar = None
        self.region_analysis = None
        self.region_base_analysis = None
        self.region_mesh = None
        self.region_edits = None
        self.region_editor = None
        self.selected_regions = set()
        self.selected_faces = set()
        self._edit_key = None
        self._selection_start = None
        self._selection_patch = None
        self.region_error = None
        self.selected_region = None
        self.region_dialog = None
        self.region_thread = None
        self._region_key = None
        self._region_generation = 0
        self._region_cancel = None
        self._region_messages = queue.Queue()
        self._region_poll = None
        self._closed = False
        self.root.title(f"STL → STEP · Gemeinsamer Konverter {__version__}")
        self.root.geometry("1160x820")
        self.root.minsize(950, 720)
        self.root.configure(bg=BG)
        self.root.protocol("WM_DELETE_WINDOW", self.close)
        self.unit = tk.StringVar(value="Millimeter")
        self.tolerance = tk.StringVar(value="0,15")
        self.mode = tk.StringVar(value="Automatisch erkennen")
        self.rounds = tk.StringVar(value="Kreise und Kreisbögen erhalten")
        self.target = tk.StringVar(value="500")
        self.fallback = tk.BooleanVar(value=True)
        self.repair = tk.BooleanVar(value=True)
        self.view = tk.StringVar(value="Original")
        self.region_pick_mode = tk.StringVar(value='Drehen')
        self.preview_note = tk.StringVar(value="Ziehen dreht die Ansicht. Grau: Original · Türkis: Ergebnis")
        self.status = tk.StringVar(value="STL auswählen, Toleranz einstellen und konvertieren.")
        self.filename = tk.StringVar(value="Noch keine Datei gewählt")
        self.result_text = tk.StringVar(value="Hier erscheint das geprüfte Ergebnis.")
        self._style()
        self._layout()

    def _style(self):
        style = ttk.Style(self.root)
        style.theme_use("clam")
        style.configure("TFrame", background=BG)
        style.configure("Panel.TFrame", background=PANEL)
        style.configure("TLabel", background=PANEL, foreground=TEXT, font=("Segoe UI", 10))
        style.configure("Muted.TLabel", foreground=MUTED)
        style.configure("Title.TLabel", background=BG, foreground=TEXT, font=("Segoe UI", 23, "bold"))
        style.configure("Sub.TLabel", background=BG, foreground=MUTED, font=("Segoe UI", 10))
        style.configure("TButton", background="#2a3e4d", foreground=TEXT, padding=(13, 8), font=("Segoe UI", 10))
        style.map("TButton", background=[("active", "#3a5262"), ("disabled", "#21313e")],
                  foreground=[("disabled", "#748795")])
        style.configure("Primary.TButton", background=ACCENT, foreground="#10242a", font=("Segoe UI", 11, "bold"))
        style.map("Primary.TButton", background=[("active", "#8aebd8"), ("disabled", "#31584f")])
        style.configure("TEntry", fieldbackground="#0e1b25", foreground=TEXT, padding=7)
        style.configure("TCombobox", fieldbackground="#0e1b25", background="#2a3e4d", foreground=TEXT, padding=5)
        style.map("TCombobox", fieldbackground=[("readonly", "#0e1b25")], foreground=[("readonly", TEXT)])
        style.configure("TCheckbutton", background=PANEL, foreground=TEXT, font=("Segoe UI", 9))
        style.map("TCheckbutton", background=[("active", PANEL)])
        style.configure("Horizontal.TProgressbar", background=ACCENT, troughcolor="#233744")

    def _layout(self):
        header = ttk.Frame(self.root, padding=(25, 20, 25, 14))
        header.pack(fill="x")
        ttk.Label(header, text="Aus Dreiecken wird CAD.", style="Title.TLabel").pack(anchor="w")
        ttk.Label(header, text="STL → STEP   ·   Flächenbereiche und Rundungen erkennen   ·   Geprüfte Rückfallwege   ·   Lokal",
                  style="Sub.TLabel").pack(anchor="w", pady=(7, 0))
        main = ttk.Frame(self.root, padding=(25, 0, 25, 12))
        main.pack(fill="both", expand=True)
        main.columnconfigure(1, weight=1)
        main.rowconfigure(0, weight=1)
        left_shell = ttk.Frame(main, style="Panel.TFrame", width=340)
        left_shell.grid(row=0, column=0, sticky="nsew", padx=(0, 15))
        left_shell.grid_propagate(False)
        actions = ttk.Frame(left_shell, style="Panel.TFrame", padding=(16, 8, 16, 16))
        actions.pack(side="bottom", fill="x")
        scroll_area = ttk.Frame(left_shell, style="Panel.TFrame")
        scroll_area.pack(fill="both", expand=True)
        sidebar_canvas = tk.Canvas(scroll_area, background=PANEL, highlightthickness=0, width=320)
        scrollbar = ttk.Scrollbar(scroll_area, orient="vertical", command=sidebar_canvas.yview)
        scrollbar.pack(side="right", fill="y")
        sidebar_canvas.pack(side="left", fill="both", expand=True)
        sidebar_canvas.configure(yscrollcommand=scrollbar.set)
        left = ttk.Frame(sidebar_canvas, style="Panel.TFrame", padding=(16, 16, 12, 8))
        sidebar_window = sidebar_canvas.create_window((0, 0), window=left, anchor="nw")
        left.bind("<Configure>", lambda _: sidebar_canvas.configure(scrollregion=sidebar_canvas.bbox("all")))
        sidebar_canvas.bind("<Configure>", lambda event: sidebar_canvas.itemconfigure(sidebar_window, width=event.width))
        ttk.Label(left, text="1  ·  STL auswählen", font=("Segoe UI", 12, "bold")).pack(anchor="w")
        self.choose_button = ttk.Button(left, text="Datei öffnen …", command=self.choose)
        self.choose_button.pack(fill="x", pady=(10, 8))
        ttk.Label(left, textvariable=self.filename, style="Muted.TLabel", wraplength=278).pack(anchor="w")
        ttk.Label(left, text="2  ·  Ergebnis einstellen", font=("Segoe UI", 12, "bold")).pack(anchor="w", pady=(22, 10))
        self.settings_widgets = []
        def field(label, variable, values=None):
            ttk.Label(left, text=label).pack(anchor="w", pady=(7, 4))
            widget = ttk.Combobox(left, textvariable=variable, values=values, state="readonly") if values else ttk.Entry(left, textvariable=variable)
            widget.pack(fill="x")
            self.settings_widgets.append(widget)
            if variable is self.unit:
                widget.bind("<<ComboboxSelected>>", lambda _: self.draw())
        field("STL-Einheit", self.unit, ["Millimeter", "Zentimeter", "Zoll"])
        field("Erlaubte Näherung in mm", self.tolerance)
        ttk.Label(left, text="0,15 mm als Startwert. Größer erlaubt gröbere Flächen.",
                  style="Muted.TLabel", wraplength=278).pack(anchor="w", pady=(5, 0))
        field("Verfahren", self.mode, ["Automatisch erkennen", "Gekrümmte Flächen", "Planare Näherung", "Originalfacetten"])
        ttk.Label(left, text="Automatisch: Flächenbereiche, Profile, gekrümmte Flächen, planare Näherung und bei Bedarf Facetten.",
                  style="Muted.TLabel", wraplength=278).pack(anchor="w", pady=(5, 0))
        field("Rundungen", self.rounds, ["Kreise und Kreisbögen erhalten", "Gerade / Fasenabschnitte"])
        field("Ziel-Dreiecke bei planarer Näherung", self.target, ["200", "500", "1500", "5000"])
        ttk.Label(left, text="Die Toleranzprüfung kann ein feineres Ergebnis erfordern.",
                  style="Muted.TLabel", wraplength=278).pack(anchor="w", pady=(5, 0))
        self.repair_check = ttk.Checkbutton(left, text="Netz vor Konvertierung reparieren", variable=self.repair)
        self.repair_check.pack(anchor="w", pady=(14, 0))
        ttk.Label(left, text="Formänderungen werden gegen das Original geprüft. Eine reparierte STL wird mitgespeichert.",
                  style="Muted.TLabel", wraplength=278).pack(anchor="w", pady=(4, 0))
        self.fallback_check = ttk.Checkbutton(left, text="Originalfacetten als Rückfall erlauben", variable=self.fallback)
        self.fallback_check.pack(anchor="w", pady=(14, 0))
        self.convert_button = ttk.Button(actions, text="STEP erstellen …", style="Primary.TButton", command=self.start, state="disabled")
        self.convert_button.pack(fill="x", pady=(0, 7))
        self.cancel_button = ttk.Button(actions, text="Berechnung abbrechen", command=self.cancel, state="disabled")
        self.cancel_button.pack(fill="x")
        right = ttk.Frame(main, style="Panel.TFrame", padding=15)
        right.grid(row=0, column=1, sticky="nsew")
        right.rowconfigure(1, weight=1)
        right.columnconfigure(0, weight=1)
        preview_header = ttk.Frame(right, style="Panel.TFrame")
        preview_header.grid(row=0, column=0, sticky="ew")
        ttk.Label(preview_header, text="Formvergleich", font=("Segoe UI", 12, "bold")).pack(side="left")
        self.view_select = ttk.Combobox(preview_header, textvariable=self.view,
                        values=["Original"], state="readonly", width=14)
        self.view_select.pack(side="right")
        self.regions_button = ttk.Button(preview_header, text="Flächenliste", command=self.show_regions, state="disabled")
        self.regions_button.pack(side="right", padx=8)
        self.view_select.bind("<<ComboboxSelected>>", lambda _: self.draw())
        from matplotlib.figure import Figure
        from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
        self.figure = Figure(figsize=(6, 4), facecolor=PANEL)
        self.axes = self.figure.add_subplot(111, projection="3d")
        self.figure.subplots_adjust(left=0, right=1, bottom=0.04, top=0.97)
        self.canvas = FigureCanvasTkAgg(self.figure, right)
        self.canvas.get_tk_widget().configure(height=300, width=450)
        self.canvas.get_tk_widget().grid(row=1, column=0, sticky="nsew", pady=8)
        self.canvas.mpl_connect('button_press_event',self.region_press)
        self.canvas.mpl_connect('motion_notify_event',self.region_motion)
        self.canvas.mpl_connect('button_release_event',self.region_release)
        self.root.bind('<Control-z>',lambda _:self.region_editor.undo() if self.region_editor else None)
        self.root.bind('<Control-y>',lambda _:self.region_editor.redo() if self.region_editor else None)
        self.draw()
        ttk.Label(right, textvariable=self.preview_note, wraplength=450,
                  style="Muted.TLabel").grid(row=2, column=0, sticky="w")
        result = ttk.Frame(right, style="Panel.TFrame")
        result.grid(row=3, column=0, sticky="ew", pady=(15, 8))
        ttk.Label(result, textvariable=self.result_text, wraplength=450, justify="left").pack(anchor="w")
        buttons = ttk.Frame(right, style="Panel.TFrame")
        buttons.grid(row=4, column=0, sticky="ew")
        self.folder_button = ttk.Button(buttons, text="Ergebnisordner öffnen", command=self.open_folder, state="disabled")
        self.folder_button.pack(side="left")
        self.report_button = ttk.Button(buttons, text="Prüfbericht öffnen", command=self.open_report, state="disabled")
        self.report_button.pack(side="left", padx=8)
        footer = ttk.Frame(self.root, padding=(25, 0, 25, 17))
        footer.pack(fill="x")
        self.bar = ttk.Progressbar(footer, mode="indeterminate")
        self.bar.pack(fill="x", pady=(0, 8))
        ttk.Label(footer, textvariable=self.status, style="Sub.TLabel", wraplength=850).pack(anchor="w")
        self.measurement_note = ttk.Label(footer, text="Abweichungen werden in beiden Richtungen stichprobenartig geprüft. Komplexe Freiformen können facettiert bleiben.",
                  style="Sub.TLabel", wraplength=850)
        self.measurement_note.pack(anchor="w", pady=(5, 0))

    def choose(self):
        path = filedialog.askopenfilename(title="STL auswählen", filetypes=[("STL-Dateien", "*.stl"), ("Alle Dateien", "*.*")])
        if path:
            self.select_source(path)

    def select_source(self, path):
        self._invalidate_deviation()
        self._invalidate_regions()
        self.source = str(Path(path).resolve())
        self.report = None
        self.preview_result = None
        self.preview_source = None
        self.view_select.configure(values=["Original"])
        self.filename.set(Path(path).name)
        self.folder_button.configure(state="disabled")
        self.report_button.configure(state="disabled")
        self.convert_button.configure(state="normal")
        self.result_text.set("Noch kein Ergebnis. Das Original bleibt als Vergleich erhalten.")
        try:
            import trimesh
            self.preview_source = trimesh.load_mesh(path, process=False)
            self.view_select.configure(values=["Original", "Flächenarten"])
            self.view.set("Original")
            self.draw()
            self.status.set(f"{len(self.preview_source.faces):,} STL-Dreiecke · Eingabeeinheit wählen, dann STEP erstellen.")
        except Exception as exc:
            self.status.set(f"Vorschau konnte nicht geladen werden: {exc}")
            self.preview_source = None
            self.view.set("Original")
            self.draw()

    def settings(self):
        # Validation happens in the worker too, but reject invalid UI input early.
        tolerance = float(self.tolerance.get().strip().replace(",", "."))
        if not 0.0001 <= tolerance <= 100:
            raise ValueError("Toleranz zwischen 0,0001 und 100 mm wählen.")
        settings = {"tolerance": tolerance, "unit": {"Millimeter": 1.0, "Zentimeter": 10.0, "Zoll": 25.4}[self.unit.get()],
                "mode": {"Automatisch erkennen": "auto", "Gekrümmte Flächen": "smooth", "Planare Näherung": "planar", "Originalfacetten": "exact"}[self.mode.get()],
                "rounds": {"Kreise und Kreisbögen erhalten": "keep", "Gerade / Fasenabschnitte": "chamfer"}[self.rounds.get()],
                "target_faces": int(self.target.get()), "fallback": self.fallback.get(), "repair": self.repair.get()}
        return self.edit_settings(settings)

    def edit_settings(self,settings):
        settings = dict(settings)
        if self.region_edits is not None and self.region_edits.is_modified:
            key=(self.source,settings['unit'],settings['tolerance'])
            if self._edit_key!=key:
                raise ValueError('Regionskorrekturen passen nicht mehr zu Einheit und Budget. Neu analysieren oder Korrektur rückgängig machen.')
            if settings['mode']!='auto' or settings['rounds']!='keep':
                raise ValueError('Regionskorrekturen benötigen Automatisch erkennen und erhaltene Kreisbögen.')
            settings['region_edits']=self.region_edits.to_dict()
        return settings

    def start(self):
        if self.process or not self.source:
            return
        try:
            settings = self.settings()
        except ValueError as exc:
            messagebox.showerror("Einstellung prüfen", str(exc), parent=self.root)
            return
        destination = filedialog.asksaveasfilename(title="STEP speichern", defaultextension=".step",
                       initialdir=str(Path(self.source).parent), initialfile=Path(self.source).stem + "-cad.step",
                       filetypes=[("STEP-Dateien", "*.step"), ("STEP-Dateien", "*.stp")])
        if not destination:
            return
        companions = [Path(destination).with_suffix(".bericht.json"), Path(destination).with_suffix(".vorschau.stl")]
        if settings["repair"]:
            companions.append(Path(destination).with_suffix(".repariert.stl"))
            companions.append(Path(destination).with_suffix(".repariert.3mf"))
        if any(p.exists() for p in companions) and not messagebox.askyesno("Vorhandene Ausgaben", "Zum gewählten Namen existieren bereits Begleitdateien. Diese ebenfalls ersetzen?", parent=self.root):
            return
        self.begin_conversion(destination, settings)

    def begin_conversion(self, destination, settings):
        settings=self.edit_settings(settings)
        if self.region_editor is not None:
            self.region_editor.close()
        self._invalidate_deviation()
        self.report = None
        self.preview_result = None
        self.view.set("Original")
        self.view_select.configure(values=["Original"])
        self.folder_button.configure(state="disabled")
        self.report_button.configure(state="disabled")
        self.draw()
        context = mp.get_context("spawn")
        self.messages = context.Queue()
        self.process = context.Process(target=conversion_worker, args=(self.source, str(destination), settings, self.messages), daemon=True)
        self.process.start()
        self.set_busy(True)
        self.status.set("Starte CAD-Berechnung …")
        self.bar.start(15)
        self.root.after(120, self.poll)

    def set_busy(self, busy):
        self.choose_button.configure(state="disabled" if busy else "normal")
        self.convert_button.configure(state="disabled" if busy or not self.source else "normal")
        self.cancel_button.configure(state="normal" if busy else "disabled")
        self.fallback_check.configure(state="disabled" if busy else "normal")
        self.repair_check.configure(state="disabled" if busy else "normal")
        self.view_select.configure(state="disabled" if busy else "readonly")
        for widget in self.settings_widgets:
            normal = "readonly" if isinstance(widget, ttk.Combobox) else "normal"
            widget.configure(state="disabled" if busy else normal)

    def poll(self):
        if self.process is None:
            return
        finished = False
        try:
            while True:
                kind, payload = self.messages.get_nowait()
                if kind == "progress":
                    self.status.set(payload)
                elif kind == "done":
                    self.show_result(payload)
                    finished = True
                elif kind == "error":
                    self.status.set("Konvertierung konnte nicht abgeschlossen werden.")
                    self.result_text.set(payload)
                    finished = True
        except queue.Empty:
            pass
        if finished:
            self.cleanup_process()
        elif not self.process.is_alive():
            # Queue feeder can arrive just after the child exits. Drain once more.
            self.root.after(200, self.final_poll)
        else:
            self.root.after(120, self.poll)

    def final_poll(self):
        if self.process is None:
            return
        try:
            while True:
                kind, payload = self.messages.get_nowait()
                if kind == "done":
                    self.show_result(payload)
                    self.cleanup_process()
                    return
                if kind == "error":
                    self.result_text.set(payload)
                    self.status.set("Konvertierung fehlgeschlagen.")
                    self.cleanup_process()
                    return
        except queue.Empty:
            self.status.set(f"CAD-Prozess wurde unerwartet beendet (Code {self.process.exitcode}).")
            self.cleanup_process()

    def show_result(self, report):
        self._invalidate_deviation()
        self.report = report
        methods = ", ".join(dict.fromkeys(b["method"] for b in report["bodies"]))
        maximum = report["deviation"]["sampled_max_mm"]
        repair_info = "Netz repariert · " if report.get("repairs", {}).get("changed") else ""
        self.result_text.set(f"{report['input_triangles']:,} Dreiecke → {report['output_faces']:,} CAD-Flächen\n"
                             f"{report['solids']} gültige Körper · gemessene Abweichung: {maximum:.4f} mm\n"
                             f"{repair_info}{methods}\nSTEP geschrieben und erfolgreich zurückgelesen.")
        self.status.set(f"Gespeichert: {Path(report['output']).name} · {report['elapsed_seconds']:.1f} Sekunden")
        self.folder_button.configure(state="normal")
        self.report_button.configure(state="normal")
        try:
            import trimesh
            self.preview_result = trimesh.load_mesh(report["preview"], process=True)
            self.view_select.configure(values=["Original", "Flächenarten", "Ergebnis", "Überlagert", "Abweichung"])
            self.view.set("Überlagert")
            self.draw()
        except Exception as exc:
            self.status.set(f"STEP gespeichert. Vorschau nicht verfügbar: {exc}")

    def cleanup_process(self):
        if self.process:
            self.process.join(timeout=0.1)
            if self.process.is_alive():
                self.process.terminate()
                self.process.join(timeout=3)
            if self.process.is_alive():
                self.process.kill()
                self.process.join(timeout=3)
            if not self.process.is_alive():
                self.process.close()
        self.process = None
        if self.messages:
            self.messages.close()
        self.messages = None
        self.bar.stop()
        self.bar.configure(value=0)
        self.set_busy(False)

    def cancel(self):
        self._invalidate_deviation()
        self._invalidate_regions(reset_edits=False)
        if self.process:
            self.cleanup_process()
            self.status.set("Berechnung abgebrochen.")
        if self.view.get() in ("Abweichung", "Flächenarten"):
            self.view.set("Überlagert" if self.preview_result is not None else "Original")
            self.draw()

    def _invalidate_regions(self,reset_edits=True):
        self._region_generation += 1
        if self._region_cancel is not None:
            self._region_cancel.set()
        self._region_cancel = None
        self.region_analysis = None
        self.region_error = None
        self.selected_region = None
        self.selected_regions.clear()
        self.selected_faces.clear()
        self._selection_start=None
        if self._selection_patch is not None:
            self._selection_patch.remove();self._selection_patch=None
        if reset_edits:
            self.region_edits=None
            self.region_base_analysis=None
            self.region_mesh=None
            self._edit_key=None
        if self.region_dialog is not None:
            self.region_dialog.destroy()
            self.region_dialog = None
        self.region_editor=None
        self.region_pick_mode.set('Drehen')
        self.set_region_pick_mode()
        if hasattr(self, "regions_button"):
            self.regions_button.configure(state="disabled")
        if hasattr(self, "cancel_button") and self.process is None:
            self.cancel_button.configure(state="disabled")
        self.region_thread = None
        self._region_key = None

    def _start_regions(self):
        if self._closed or self.preview_source is None:
            return
        try:
            unit = {"Millimeter": 1., "Zentimeter": 10., "Zoll": 25.4}[self.unit.get()]
            tolerance = float(self.tolerance.get().replace(",", "."))
            import math
            if not math.isfinite(tolerance) or not .0001 <= tolerance <= 100:
                raise ValueError("Ungültiges Abweichungsbudget")
        except (ValueError, KeyError):
            self._invalidate_regions()
            self.region_error = "Bitte eine gültige Einheit und Toleranz einstellen."
            return
        key = (self.source, unit, tolerance)
        if self._region_key != key:
            self._invalidate_regions(reset_edits=self._edit_key!=key)
            self._region_key = key
        if self.region_analysis is None and self.region_edits is not None and self._edit_key==key:
            self.region_analysis=self.region_edits.view_analysis(self.region_base_analysis,self.region_mesh)
            self.regions_button.configure(state='normal')
            return
        if self.region_analysis is not None or self.region_thread is not None or self.region_error is not None:
            return
        generation = self._region_generation
        event = threading.Event()
        self._region_cancel = event
        source = self.preview_source.copy()
        messages = self._region_messages

        def calculate():
            from .local_regions import RegionCancelled
            from .connected_regions import analyse_connected_regions
            from .region_edits import normalise_edit_mesh
            try:
                prepared = normalise_edit_mesh(source,unit)
                result = analyse_connected_regions(prepared, tolerance, event)
                if not event.is_set():
                    messages.put((generation, "done", (result,prepared)))
            except RegionCancelled:
                pass
            except Exception as exc:
                if not event.is_set():
                    messages.put((generation, "error", str(exc)))

        self.region_thread = threading.Thread(target=calculate, name="STL region preview", daemon=True)
        self.region_thread.start()
        if self.process is None:
            self.cancel_button.configure(state="normal")
        if self._region_poll is None:
            self._region_poll = self.root.after(70, self._poll_regions)

    def _poll_regions(self):
        self._region_poll = None
        if self._closed:
            return
        try:
            while True:
                generation, kind, payload = self._region_messages.get_nowait()
                if generation != self._region_generation:
                    continue
                self.region_thread = None
                if kind == "done":
                    from .region_edits import RegionEditSession
                    self.region_base_analysis,self.region_mesh=payload
                    self.region_edits=RegionEditSession(self.region_mesh,self.region_base_analysis,self._region_key[2])
                    self._edit_key=self._region_key
                    self.region_analysis=self.region_edits.view_analysis(self.region_base_analysis,self.region_mesh)
                    self.regions_button.configure(state="normal")
                else:
                    self.region_error = payload
                if self.process is None:
                    self.cancel_button.configure(state="disabled")
                if self.view.get() == "Flächenarten":
                    self.draw()
        except queue.Empty:
            pass
        if self.region_thread is not None:
            self._region_poll = self.root.after(70, self._poll_regions)

    def show_regions(self):
        if self.region_analysis is None:
            return
        if self.region_dialog is not None:
            self.region_dialog.lift()
            return
        from .region_editor import RegionEditor
        self.region_editor=RegionEditor(self)

    def refresh_region_edits(self):
        self.region_analysis=self.region_edits.view_analysis(self.region_base_analysis,self.region_mesh)
        self.view.set('Flächenarten')
        if self.region_editor:self.region_editor.refresh()
        self.draw()

    def set_region_pick_mode(self):
        if not hasattr(self,'axes'):return
        if self.region_pick_mode.get()=='Drehen':self.axes.mouse_init()
        else:self.axes.disable_mouse_rotation()

    def region_press(self,event):
        if (self.process is not None or self.region_editor is None or self.region_analysis is None
                or self.view.get()!='Flächenarten' or self.region_pick_mode.get()=='Drehen'
                or event.inaxes is not self.axes or event.button!=1 or event.xdata is None):return
        self._selection_start=(event.xdata,event.ydata,event.x,event.y)
        if self.region_pick_mode.get()=='Dreiecke':
            from matplotlib.patches import Rectangle
            self._selection_patch=Rectangle((event.xdata,event.ydata),0,0,fill=False,edgecolor='#f5dc5a',
                                             linewidth=1.2,transform=self.axes.transData)
            self.figure.add_artist(self._selection_patch)

    def region_motion(self,event):
        if self._selection_start is None or self._selection_patch is None or event.xdata is None:return
        x,y,_,_=self._selection_start
        self._selection_patch.set_width(event.xdata-x)
        self._selection_patch.set_height(event.ydata-y)
        self.canvas.draw_idle()

    def region_release(self,event):
        start=self._selection_start;self._selection_start=None
        if self._selection_patch is not None:
            self._selection_patch.remove();self._selection_patch=None
        if start is None or event.xdata is None or self.region_edits is None:return
        import numpy as np
        from mpl_toolkits.mplot3d import proj3d
        triangles=self.region_mesh.triangles
        p=triangles.reshape(-1,3)
        x,y,z=proj3d.proj_transform(p[:,0],p[:,1],p[:,2],self.axes.get_proj())
        projected=np.column_stack((x,y,z)).reshape(-1,3,3)
        labels=np.asarray(self.region_edits.state.labels)
        rectangle=(event.x-start[2])**2+(event.y-start[3])**2>25 and self.region_pick_mode.get()=='Dreiecke'
        if rectangle:
            lower=np.minimum(start[:2],(event.xdata,event.ydata));upper=np.maximum(start[:2],(event.xdata,event.ydata))
            centres=projected[:,:,:2].mean(axis=1)
            mask=np.all((centres>=lower)&(centres<=upper),axis=1)
            if self.selected_regions:mask&=np.isin(labels,list(self.selected_regions))
            self.selected_faces.update(map(int,np.flatnonzero(mask)))
        else:
            a,b,c=projected[:,0,:2],projected[:,1,:2],projected[:,2,:2]
            v0,v1=c-a,b-a;v2=np.array([event.xdata,event.ydata])-a
            determinant=v0[:,0]*v1[:,1]-v1[:,0]*v0[:,1]
            valid=abs(determinant)>1e-14
            safe=np.where(valid,determinant,1.)
            u=(v2[:,0]*v1[:,1]-v1[:,0]*v2[:,1])/safe
            v=(v0[:,0]*v2[:,1]-v2[:,0]*v0[:,1])/safe
            candidates=np.flatnonzero(valid&(u>=-1e-7)&(v>=-1e-7)&(u+v<=1+1e-7))
            if not len(candidates):self.draw();return
            depths=projected[:,0,2]*(1-u-v)+projected[:,2,2]*u+projected[:,1,2]*v
            face=int(candidates[np.argmin(depths[candidates])]);label=int(labels[face])
            if self.region_pick_mode.get()=='Bereiche':
                if event.key and ('control' in event.key or 'shift' in event.key):
                    self.selected_regions.symmetric_difference_update({label})
                else:self.selected_regions={label}
            else:
                if self.selected_regions!={label}:
                    self.selected_regions={label};self.selected_faces.clear()
                self.selected_faces.symmetric_difference_update({face})
        if self.region_editor:
            self.region_editor.tree.selection_set([str(i) for i in sorted(self.selected_regions)])
            self.region_editor.update_details()
        self.selected_region=min(self.selected_regions) if self.selected_regions else None
        self.draw()

    def _invalidate_deviation(self):
        """Every new input/result and cancellation supersedes old preview work."""
        self._deviation_generation += 1
        if self._deviation_cancel is not None:
            self._deviation_cancel.set()
        self._deviation_cancel = None
        self.deviation_thread = None
        self.deviation_samples = None
        self.deviation_error = None

    def _start_deviation(self):
        if (self._closed or self.deviation_thread is not None or self.deviation_samples is not None
                or self.deviation_error is not None or not self.report or not self.report.get("valid")
                or self.preview_source is None or self.preview_result is None or self.process is not None):
            return
        generation = self._deviation_generation
        source, result = self.preview_source, self.preview_result
        unit = self.report["options"]["unit"]
        event = self._deviation_cancel = threading.Event()
        messages = self._deviation_messages

        def calculate():
            try:
                samples = measure_deviation(source, result, unit, event)
                messages.put((generation, "done", samples))
            except DeviationCancelled:
                messages.put((generation, "cancelled", None))
            except Exception as exc:
                messages.put((generation, "error", str(exc)))

        self.deviation_thread = threading.Thread(target=calculate, name="STL deviation preview", daemon=True)
        self.deviation_thread.start()
        if self._deviation_poll is None:
            self._deviation_poll = self.root.after(70, self._poll_deviation)

    def _poll_deviation(self):
        self._deviation_poll = None
        if self._closed:
            return
        changed = False
        try:
            while True:
                generation, kind, payload = self._deviation_messages.get_nowait()
                if generation != self._deviation_generation:
                    continue
                self.deviation_thread = None
                if kind == "done":
                    self.deviation_samples = payload
                elif kind == "error":
                    self.deviation_error = payload
                changed = True
        except queue.Empty:
            pass
        if changed and self.view.get() == "Abweichung":
            self.draw()
        if self.deviation_thread is not None:
            self._deviation_poll = self.root.after(70, self._poll_deviation)

    def _remove_deviation_colorbar(self):
        if self._deviation_colorbar is not None:
            self._deviation_colorbar.remove()
            self._deviation_colorbar = None
        self.axes.set_position([0, 0.04, 1, 0.93])

    def draw(self):
        import numpy as np
        from mpl_toolkits.mplot3d.art3d import Poly3DCollection
        ax = self.axes
        elevation, azimuth = ax.elev, ax.azim
        self._remove_deviation_colorbar()
        ax.clear()
        ax.set_facecolor(PANEL)
        ax.set_axis_off()
        selected = []
        deviation_view = self.view.get() == "Abweichung"
        region_view = self.view.get() == "Flächenarten"
        self.preview_note.set("Ziehen dreht die Ansicht. Grau: Original · Türkis: Ergebnis")
        if deviation_view:
            self._start_deviation()
            self.preview_note.set("Einseitige Stichprobe: ungerichteter Abstand Ergebnis → Original an angezeigten Dreieckszentren. Prüfbericht: beidseitige Prüfung.")
        if region_view:
            self._start_regions()
            self.preview_note.set("Blau: Ebenen · Orange: Zylinder · Grün: Kegel · Rosa: Freiform · Türkis: Drehflächen · Violett: Facetten. Erkennungsvorschläge; CAD wird geprüft.")
        unit = self.report["options"]["unit"] if self.report else {"Millimeter": 1.0, "Zentimeter": 10.0, "Zoll": 25.4}[self.unit.get()]
        if self.preview_source is not None and self.view.get() in ("Original", "Flächenarten", "Überlagert"):
            mesh=self.region_mesh if region_view and self.region_mesh is not None else self.preview_source
            selected.append((mesh, "#b4c3cc", 0.32 if self.view.get() == "Überlagert" else 1.0,
                             1. if mesh is self.region_mesh else unit))
        if self.preview_result is not None and self.view.get() in ("Ergebnis", "Überlagert"):
            selected.append((self.preview_result, ACCENT, 0.86, 1.0))
        if deviation_view and self.preview_result is not None and self.report and self.report.get("valid"):
            selected.append((self.preview_result, ACCENT, 1.0, 1.0))
        bounds = []
        for mesh, color, alpha, scale in selected:
            # Only the display is sampled; exported geometry is unaffected.
            indices = display_face_indices(len(mesh.faces))
            if not len(indices):
                continue
            heatmap = deviation_view and self.deviation_samples is not None and mesh is self.preview_result
            regional = region_view and self.region_analysis is not None and mesh is self.region_mesh
            if regional:
                from .local_regions import face_colours
                color = face_colours(self.region_analysis, indices)
                if self.region_edits is not None:
                    labels=np.asarray(self.region_edits.state.labels)
                    color[np.isin(labels[indices],list(self.selected_regions))]=(1.,.9,.2,1.)
                    color[np.isin(indices,list(self.selected_faces))]=(1.,.25,.6,1.)
                counts = self.region_analysis.report()["counts"]
                ax.text2D(.02, .98, f"{counts.get('PLANE', 0)} Ebenenbereiche · {counts.get('CYLINDER', 0)} Zylinderbereiche\n"
                          f"{counts.get('CONE', 0)} Kegelbänder · {counts.get('GRAPH', 0)} Freiformen · {counts.get('REVOLUTION', 0)} Drehflächen\n"
                          f"{counts.get('REST', 0)} Restfacetten · Erkennungsvorschläge",
                          transform=ax.transAxes, va="top", color=TEXT, fontsize=9)
            if heatmap:
                from matplotlib import colormaps
                from matplotlib.colors import Normalize
                from matplotlib.cm import ScalarMappable
                limit = colour_limit(self.report["options"]["tolerance"])
                norm = Normalize(vmin=0.0, vmax=limit, clip=True)
                colour_map = colormaps["turbo"]
                indices = self.deviation_samples.face_indices
                color = colour_map(norm(self.deviation_samples.distances_mm))
                ax.set_position([0, 0.04, 0.83, 0.93])
                colour_axes = self.figure.add_axes([0.87, 0.20, 0.025, 0.56])
                self._deviation_colorbar = self.figure.colorbar(ScalarMappable(norm=norm, cmap=colour_map),
                    cax=colour_axes, ticks=[0, limit / 2, limit], extend="max")
                self._deviation_colorbar.set_label("Abstand in mm", color=TEXT, fontsize=9)
                colour_axes.tick_params(colors=TEXT, labelsize=8)
                self._deviation_colorbar.outline.set_edgecolor(MUTED)
                colour_axes.set_facecolor(PANEL)
                maximum = float(self.deviation_samples.distances_mm.max())
                ax.text2D(0.02, 0.98, f"Vorschau-Maximum: {maximum:.5g} mm", transform=ax.transAxes,
                          va="top", color=TEXT, fontsize=9)
            poly = Poly3DCollection(mesh.triangles[indices] * scale, facecolors=color, alpha=alpha,
                                    # Shading cannot broadcast an empty RGBA
                                    # array from edgecolors="none" on large meshes.
                                    edgecolors="none" if heatmap or regional else "#263f49", linewidths=0.0 if heatmap or regional or len(mesh.faces) >= 1500 else 0.22,
                                    shade=not (heatmap or regional), lightsource=__import__("matplotlib.colors", fromlist=["LightSource"]).LightSource(azdeg=315, altdeg=45))
            ax.add_collection3d(poly)
            if regional:
                from mpl_toolkits.mplot3d.art3d import Line3DCollection
                edges = self.region_analysis.boundary_edges
                ax.add_collection3d(Line3DCollection(mesh.vertices[edges] * scale, colors="#344351", linewidths=.35, alpha=.7))
            bounds.append(mesh.bounds * scale)
        if bounds:
            lower = np.min([b[0] for b in bounds], axis=0)
            upper = np.max([b[1] for b in bounds], axis=0)
            centre = (lower + upper) / 2
            radius = max((upper - lower).max() * 0.6, 0.01)
            ax.set_xlim(centre[0] - radius, centre[0] + radius)
            ax.set_ylim(centre[1] - radius, centre[1] + radius)
            ax.set_zlim(centre[2] - radius, centre[2] + radius)
            if deviation_view and self.deviation_samples is None:
                note = f"Farbansicht nicht verfügbar: {self.deviation_error}" if self.deviation_error else "Abstände werden berechnet …"
                ax.text2D(0.02, 0.98, note, transform=ax.transAxes, va="top", color=TEXT, fontsize=9, wrap=True)
            if region_view and self.region_analysis is None:
                note = f"Flächenerkennung nicht verfügbar: {self.region_error}" if self.region_error else "Flächenbereiche werden erkannt …"
                ax.text2D(.02, .98, note, transform=ax.transAxes, va="top", color=TEXT, fontsize=9, wrap=True)
        else:
            ax.text2D(0.5, 0.5, "Dein Bauteil erscheint hier.", transform=ax.transAxes,
                      horizontalalignment="center", color=MUTED, fontsize=13)
        ax.set_box_aspect((1, 1, 1), zoom=1.35 if region_view else 1.0)
        ax.view_init(elevation, azimuth)
        self.set_region_pick_mode()
        self.canvas.draw_idle()

    def open_folder(self):
        if self.report:
            os.startfile(str(Path(self.report["output"]).parent))

    def open_report(self):
        if self.report:
            os.startfile(self.report["report"])

    def close(self):
        self._closed = True
        self._invalidate_deviation()
        self._invalidate_regions()
        if self._region_poll is not None:
            self.root.after_cancel(self._region_poll)
            self._region_poll = None
        if self._deviation_poll is not None:
            self.root.after_cancel(self._deviation_poll)
            self._deviation_poll = None
        if self.process:
            self.cleanup_process()
        self.root.destroy()


def main():
    mp.freeze_support()
    root = tk.Tk()
    App(root)
    root.mainloop()


if __name__ == "__main__":
    main()
