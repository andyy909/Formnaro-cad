"""Bounded file protocol for isolated conversion, source regions and editing."""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import sys

PROTOCOL = 2


def analysis(root, options, edits=None, commands=()):
    import numpy as np
    import trimesh
    from stlstep.connected_regions import analyse_connected_regions
    from stlstep.region_edits import normalise_edit_mesh, RegionEditSession
    from stlstep.local_regions import MAX_FACES, COLOURS
    mesh=normalise_edit_mesh(trimesh.load_mesh(root/'input.stl',process=False),options.unit)
    if not len(mesh.faces) or not np.isfinite(mesh.vertices).all():
        raise ValueError('STL enthält keine endliche Dreiecksoberfläche.')
    if len(mesh.faces)>MAX_FACES:
        raise ValueError('Flächenbearbeitung unterstützt bis 20.000 Dreiecke. Die Konvertierung ist separat möglich.')
    original=analyse_connected_regions(mesh,options.tolerance)
    session=RegionEditSession.from_dict(mesh,original,options.tolerance,edits) if edits is not None else RegionEditSession(mesh,original,options.tolerance)
    if not isinstance(commands,list) or len(commands)>20:
        raise ValueError('Ungültige Regionsbefehle.')
    with session.transaction():
        for command in commands:
            if not isinstance(command,dict):raise ValueError('Ungültiger Regionsbefehl.')
            op=command.get('op')
            allowed={'split':{'op','region','faces'},'merge':{'op','regions'},
                     'type':{'op','regions','type'},'protect':{'op','regions','enabled'}}
            if op not in allowed or set(command)!=allowed[op]:raise ValueError('Unbekannter Regionsbefehl.')
            if op=='split':session.split(command['region'],command['faces'])
            elif op=='merge':session.merge(command['regions'])
            elif op=='type':
                for label in command['regions']:session.set_type(label,command['type'])
            elif op=='protect':
                if type(command['enabled']) is not bool:raise ValueError('Ungültiger Schutzwert.')
                session.protect(command['regions'],command['enabled'])
    view=session.view_analysis(original,mesh)
    keys=('id','edit_id','type','faces','reason','protected_faces','radius_mm','radius_min_mm','radius_max_mm')
    return dict(state=session.to_dict(),modified=session.is_modified,
                vertices=np.asarray(mesh.vertices).tolist(),faces=np.asarray(mesh.faces).tolist(),
                regions=[{k:r[k] for k in keys if k in r} for r in view.regions],
                face_regions=view.face_regions.tolist(),colours=COLOURS,
                bounds_mm=mesh.bounds.tolist(),unit_mm=options.unit,tolerance_mm=options.tolerance)


def run(directory: str) -> int:
    root=Path(directory).resolve(strict=True);response=root/'response.json'
    try:
        request_path=root/'request.json'
        if request_path.stat().st_size>8*1024*1024:raise ValueError('Konverterauftrag überschreitet das Limit.')
        request=json.loads(request_path.read_text(encoding='utf-8'))
        if not isinstance(request,dict) or not {'version','options'}<=set(request) or set(request)-{'version','options','action','edits','commands'} or request['version']!=PROTOCOL:
            raise ValueError('Ungültiger Konverterauftrag.')
        from stlstep.engine import Options,convert
        from stlstep import __version__
        values=request['options'];allowed={'unit','tolerance','mode','rounds','repair','fallback','samples','target_faces','region_edits'}
        if not isinstance(values,dict) or not set(values)<=allowed:raise ValueError('Unbekannte Konverteroption.')
        settings=Options(**values);settings.validate()
        action=request.get('action','convert')
        if action not in ('convert','analyse'):raise ValueError('Unbekannte Konverteraktion.')
        def progress(message):
            with (root/'progress.txt').open('a',encoding='utf-8') as stream:
                stream.write(str(message).replace(str(root),'')[:1000]+'\n')
        if action=='analyse':
            progress('Erkenne zusammenhängende Flächenbereiche …')
            payload=dict(ok=True,version=PROTOCOL,engine=__version__,analysis=analysis(root,settings,request.get('edits'),request.get('commands',[])))
        else:
            if request.get('commands') or request.get('edits') is not None:raise ValueError('Regionskorrekturen über die Konverteroptionen übergeben.')
            report=convert(root/'input.stl',root/'result.step',settings,progress)
            from stlstep.deviation import measure_deviation
            import trimesh
            preview=trimesh.load_mesh(report['preview'],process=False)
            original=trimesh.load_mesh(root/'input.stl',process=False)
            progress('Berechne Abweichungsansicht am tatsächlichen STEP-Ergebnis …')
            measurements=measure_deviation(original,preview,settings.unit)
            artifacts={}
            for key,report_key in (('preview','preview'),('repaired_stl','repaired_mesh'),('repaired_3mf','repaired_3mf')):
                if report.get(report_key):
                    file=Path(report[report_key]);artifacts[key]=dict(file=file.name,size=file.stat().st_size,sha256=hashlib.sha256(file.read_bytes()).hexdigest())
            for key in ('input','output','preview','report','repaired_mesh','repaired_stl','repaired_3mf'):
                if report.get(key):report[key]=Path(report[key]).name
            payload=dict(ok=True,version=PROTOCOL,engine=__version__,report=report,
                         step_sha256=hashlib.sha256((root/'result.step').read_bytes()).hexdigest(),artifacts=artifacts,
                         deviation=dict(face_indices=measurements.face_indices.tolist(),distances_mm=measurements.distances_mm.tolist(),
                                        kind='unsigned_result_triangle_centres_to_original_surface',unit='mm'))
    except Exception as error:
        payload=dict(ok=False,version=PROTOCOL,error=str(error).replace(str(root),'')[:2000])
    temporary=response.with_suffix('.tmp')
    temporary.write_text(json.dumps(payload,ensure_ascii=False,allow_nan=False),encoding='utf-8');os.replace(temporary,response)
    return 0 if payload['ok'] else 2


if __name__=='__main__':
    if len(sys.argv)!=2:raise SystemExit(2)
    raise SystemExit(run(sys.argv[1]))
