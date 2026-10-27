"""Real region-editor UI and spawn acceptance with synthetic fixtures."""
from pathlib import Path
import time,json,hashlib
from unittest.mock import patch
import tkinter as tk
import numpy as np
import cadquery as cq
from matplotlib.backend_bases import MouseEvent
from mpl_toolkits.mplot3d import proj3d
from . import __version__
from .gui import App
from .region_verification import _capture
from .hybrid_verification import _identity


def run(directory):
    started=time.monotonic()
    ROOT=Path(directory).resolve()
    ROOT.mkdir(parents=True,exist_ok=True)
    source=ROOT/'editor-box.stl'
    cq.Workplane('XY').box(4,5,6).val().exportStl(str(source),parallel=False)
    pin=hashlib.sha256(source.read_bytes()).hexdigest()
    root=tk.Tk();root.withdraw();app=App(root)
    app.tolerance.set('.1');app.select_source(source);app.view.set('Flächenarten');app.draw()
    checks={};errors=[]
    identity=_identity()
    root.report_callback_exception=lambda kind,error,tb:errors.append(str(error))
    def wait_analysis():
        start=time.monotonic()
        while app.region_thread is not None and time.monotonic()-start<60:
            root.update();time.sleep(.01)
        root.update()
        assert app.region_edits is not None,app.region_error
    def click(point):
        x,y,_=proj3d.proj_transform(*point,app.axes.get_proj())
        px,py=app.axes.transData.transform((x,y))
        for name in ('button_press_event','button_release_event'):
            event=MouseEvent(name,app.canvas,px,py,button=1)
            app.canvas.callbacks.process(name,event)
        root.update()
    try:
        wait_analysis();app.show_regions();editor=app.region_editor
        root.update();app.axes.view_init(elev=90,azim=-90);app.canvas.draw()
        top_face=int(np.flatnonzero(abs(app.region_mesh.triangles_center[:,2]-3)<1e-7)[0])
        top_region=app.region_edits.state.labels[top_face]
        point=app.region_mesh.triangles_center[top_face]
        app.region_pick_mode.set('Bereiche');app.set_region_pick_mode();click(point)
        checks['model_click_selects_front_region']=app.selected_region==top_region
        app.region_pick_mode.set('Dreiecke');app.set_region_pick_mode();click(point)
        checks['model_click_marks_original_triangle']=app.selected_faces=={top_face}
        colours=np.asarray(app.axes.collections[0].get_facecolor())
        checks['marked_triangle_is_pink']=np.any(np.all(np.isclose(colours,(1,.25,.6,1)),axis=1))
        app.selected_faces.clear();app.draw();app.canvas.draw()
        x,y,_=proj3d.proj_transform(*point,app.axes.get_proj())
        px,py=app.axes.transData.transform((x,y))
        for name,dx,dy in [('button_press_event',-7,-7),('motion_notify_event',7,7),('button_release_event',7,7)]:
            event=MouseEvent(name,app.canvas,px+dx,py+dy,button=1)
            app.canvas.callbacks.process(name,event);root.update()
        checks['rectangle_marks_source_triangle']=app.selected_faces=={top_face}
        checks['rectangle_overlay_removed']=app._selection_patch is None
        original=app.region_edits.state
        editor.split();root.update()
        split=app.region_edits.state
        checks['split_button_changes_regions']=len(set(split.labels))==7
        checks['split_native_selection_stable']=len(app.selected_regions)==2
        editor.merge();root.update()
        merged=app.region_edits.state
        checks['merge_button_changes_regions']=len(set(merged.labels))==6
        editor.undo();root.update()
        checks['undo_button_exact_split']=app.region_edits.state==split
        editor.redo();root.update()
        checks['redo_button_exact_merge']=app.region_edits.state==merged
        app.selected_regions={top_region};editor.refresh();root.update()
        editor.type.set('Facetten');editor.set_type();root.update()
        checks['type_button_stores_request']=dict(app.region_edits.state.requested_types).get(top_region)=='REST'
        editor.undo();root.update()
        checks['type_undo_restores_original']=top_region not in dict(app.region_edits.state.requested_types)
        editor.protect(True);root.update()
        saved=app.region_edits.state
        checks['protect_button_marks_source_faces']=len(saved.protected_faces)==2
        correction=ROOT/'saved.regionen.json'
        with patch('stlstep.region_editor.filedialog.asksaveasfilename',return_value=str(correction)):
            editor.save()
        editor.protect(False);root.update()
        with patch('stlstep.region_editor.filedialog.askopenfilename',return_value=str(correction)):
            editor.load()
        root.update()
        checks['save_load_buttons_restore_state']=app.region_edits.state==saved
        settings=app.settings();settings['samples']=500
        checks['settings_carry_source_bound_edits']=settings['region_edits']['mesh_sha256']==app.region_edits.mesh_sha256
        root.deiconify();root.update();_capture(root,ROOT/'editor-main.png');_capture(editor.window,ROOT/'editor-controls.png')
        app.begin_conversion(ROOT/'editor-result.step',settings)
        start=time.monotonic();heartbeats=0
        while app.process is not None and time.monotonic()-start<180:
            root.update();time.sleep(.01);heartbeats+=1
        root.update()
        assert app.report is not None,app.result_text.get()
        checks['real_worker_manual_stage']=app.report['bodies'][0]['stage']=='manual'
        details=app.report['bodies'][0]['details']['manual_regions']
        checks['actual_step_protected_faces']=details['step_protection_proof']['triangles']==2 and details['step_protection_proof']['max_vertex_error_mm']<=1e-7
        checks['responsive_during_worker']=heartbeats>10
        after=app.region_edits.state
        app.cancel()
        checks['cancel_preserves_edit_history']=app.region_edits.state==after and app.region_edits.can_undo
        app.view.set('Flächenarten');app.draw();root.update()
        checks['reopen_restores_edit_overlay']=app.region_analysis is not None and app.region_edits.state==after
        app.unit.set('Zentimeter');app.draw();wait_analysis()
        checks['unit_change_discards_incompatible_edits']=not app.region_edits.is_modified and app.region_edits.tolerance==.1
        checks['source_file_unchanged']=hashlib.sha256(source.read_bytes()).hexdigest()==pin
    except Exception as exc:
        import traceback
        errors.append(traceback.format_exc())
    finally:app.close()
    checks['tested_code_unchanged']=_identity()==identity
    checks['worker_stopped']=app.process is None
    result=dict(passed=bool(checks) and all(checks.values()) and not errors,
                checks={k:bool(v) for k,v in checks.items()},errors=errors,version=__version__,seconds=time.monotonic()-started,**identity)
    (ROOT/'gui-edits-checks.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(result,indent=2),flush=True)
    return result
