"""Real Tk/Spawn/STEP acceptance for connected freeform faces and protection."""
from pathlib import Path
import time
import json
import numpy as np
import trimesh


def roof_mesh(kind='sinusoidal',segments=16):
    x=np.linspace(-5,5,segments+1);y=np.linspace(-4,4,segments+1)
    xx,yy=np.meshgrid(x,y,indexing='ij')
    if kind=='polynomial':height=4+.03*xx*xx+.02*yy*yy+.02*xx*yy
    else:height=4+.4*np.sin(xx*.35)*np.cos(yy*.3)+.01*xx*yy
    vertices=np.column_stack((np.tile(xx.ravel(),2),np.tile(yy.ravel(),2),np.r_[height.ravel(),np.zeros(xx.size)]))
    count=xx.size
    node=lambda i,j:i*(segments+1)+j
    faces=[]
    for i in range(segments):
        for j in range(segments):
            a,b,c,d=node(i,j),node(i+1,j),node(i+1,j+1),node(i,j+1)
            faces.extend([[a,b,c],[a,c,d],[a+count,c+count,b+count],[a+count,d+count,c+count]])
    border=([node(i,0) for i in range(segments+1)]+[node(segments,j) for j in range(1,segments+1)]+
            [node(i,segments) for i in range(segments-1,-1,-1)]+[node(0,j) for j in range(segments-1,0,-1)])
    for a,b in zip(border,np.roll(border,-1)):faces.extend([[a,a+count,b+count],[a,b+count,b]])
    mesh=trimesh.Trimesh(vertices,faces,process=False);mesh.fix_normals()
    return mesh


def run(directory):
    import tkinter as tk
    import cadquery as cq
    from . import __version__
    from .gui import App
    from .region_verification import _capture
    from .hybrid_verification import _identity,_sha256
    from .local_regions import face_colours
    from .engine import check_candidate,Options
    from .edited_regions import verify_protected_faces
    from .region_editor import TYPE_NAMES

    started=time.monotonic();identity=_identity()
    output=Path(directory).resolve();output.mkdir(parents=True,exist_ok=True)
    source=output/'sinusoidal-roof.stl';roof_mesh(segments=8).export(source)
    pin=_sha256(source)
    root=tk.Tk();app=App(root);checks={};errors=[];results={}
    root.report_callback_exception=lambda kind,error,tb:errors.append(str(error))
    def wait_analysis():
        start=time.monotonic()
        while app.region_thread is not None and time.monotonic()-start<90:
            root.update();time.sleep(.01)
        root.update();assert app.region_edits is not None,app.region_error
    def convert(name):
        settings=app.settings();settings['samples']=500
        app.begin_conversion(output/name,settings)
        checks[name+'.real_spawn_started']=app.process is not None
        start=time.monotonic();heartbeats=0
        while app.process is not None and time.monotonic()-start<180:
            root.update();time.sleep(.01);heartbeats+=1
        root.update();assert app.process is None,'Freiform-Worker überschreitet Zeitlimit'
        assert app.report is not None,app.result_text.get()
        report=app.report
        checks[name+'.tk_responsive']=heartbeats>10
        checks[name+'.actual_step_valid_closed']=report['valid'] and report['solids']==1
        checks[name+'.budget_including_reserve']=report['deviation']['sampled_max_mm']+report['tessellation_allowance_mm']<=.2
        saved=json.loads((output/name).with_suffix('.bericht.json').read_text(encoding='utf-8'))
        checks[name+'.saved_report_matches']=saved==report
        return report
    try:
        app.tolerance.set('.2');app.select_source(source);app.view.set('Flächenarten');app.draw()
        wait_analysis();analysis=app.region_analysis
        graph=next(r for r in analysis.regions if r['type']=='GRAPH')
        checks['one_connected_graph_proposal']=len(graph['faces'])==128
        colours=face_colours(analysis,np.arange(len(app.region_mesh.faces)))
        from matplotlib.colors import to_rgba
        checks['graph_colour_applied']=np.allclose(colours[graph['faces']],to_rgba('#e980bd'))
        checks['single_preview_axes']=len(app.figure.axes)==1
        app.show_regions();editor=app.region_editor;root.update()
        label=graph['edit_id'];app.selected_regions={label};editor.refresh();root.update()
        checks['editor_displays_freeform']=editor.tree.item(str(label),'values')[0]==TYPE_NAMES['GRAPH']
        initial=app.region_edits.state
        app.selected_faces={f for f in graph['faces'] if app.region_mesh.triangles_center[f][0]<0}
        editor.split();root.update()
        checks['split_connected_graph']=len(set(app.region_edits.state.labels))==7
        editor.undo();root.update()
        checks['undo_exact_graph_state']=app.region_edits.state==initial
        app.selected_regions.clear();editor.refresh();root.update();app.draw()
        _capture(root,output/'freeform-main.png');_capture(editor.window,output/'freeform-editor.png')
        report=convert('roof.step')
        checks['worker_selected_connected_patches']=report['bodies'][0]['stage']=='patches'
        checks['six_faces_one_bspline']=report['output_faces']==6 and report['surface_types'].get('BSPLINE')==1
        shape=cq.importers.importStep(str(output/'roof.step')).val()
        checks['every_native_edge_has_two_neighbours']=all(
            sum(any(e.isSame(other) for other in f.Edges()) for f in shape.Faces())==2 for e in shape.Edges())
        checks['actual_step_global_gate']=check_candidate(shape,app.region_mesh,Options(tolerance=.2,samples=500),
                                                          'freeform',stage='patches') is not None
        results['automatic']=dict(faces=report['output_faces'],types=report['surface_types'],deviation=report['deviation'])
        app.view.set('Flächenarten');app.draw();wait_analysis();app.show_regions();editor=app.region_editor
        app.selected_regions={label};editor.refresh();editor.protect(True);root.update()
        checks['freeform_protection_stored']=len(app.region_edits.state.protected_faces)==128
        report=convert('protected.step')
        checks['protected_worker_manual_stage']=report['bodies'][0]['stage']=='manual'
        shape=cq.importers.importStep(str(output/'protected.step')).val()
        proof=verify_protected_faces(shape,app.region_mesh.triangles[graph['faces']])
        checks['all_original_freeform_triangles_preserved']=proof['triangles']==128 and proof['max_vertex_error_mm']<=1e-7
        results['protected']=dict(faces=report['output_faces'],proof=proof)
        after=app.region_edits.state;app.cancel()
        checks['cancel_keeps_freeform_edits']=app.region_edits.state==after
        checks['source_file_unchanged']=_sha256(source)==pin
    except Exception:
        import traceback
        errors.append(traceback.format_exc())
    finally:
        app.close()
    checks['tested_code_unchanged']=_identity()==identity
    checks['worker_stopped']=app.process is None
    result=dict(passed=bool(checks) and all(checks.values()) and not errors,
                checks={k:bool(v) for k,v in checks.items()},errors=errors,results=results,
                version=__version__,seconds=time.monotonic()-started,**identity)
    (output/'freeform-check.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(result,indent=2),flush=True)
    return result
