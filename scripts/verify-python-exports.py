"""Read actual Python-authored project/BRep/STEP/STL files independently."""
import json
import os
from pathlib import Path
import sys
import uuid

if os.environ.get("FORMNARO_PYTHON_PROOF_DIR"):
    import FreeCAD as App
    import Part
    import math
    import traceback
    folder = Path(os.environ["FORMNARO_PYTHON_PROOF_DIR"])
    run_id = os.environ["FORMNARO_PYTHON_PROOF_RUN"]
    try:
        rows = []
        for stem, volume, count in [("python-plate", 14400-2*math.pi*6.25*6, 4), ("python-loft", 3000, 3)]:
            project = json.loads((folder/(stem+".ocad")).read_text(encoding="utf-8"))
            assert len(project["nodes"]) == 1
            root = project["nodes"][0]
            checked = []
            def visit(node):
                assert node["source"] in ("native", "group", "modeling")
                shape = Part.Shape()
                shape.importBrepFromString(node["brep"]["data"])
                assert shape.isValid() and shape.isClosed() and len(shape.Solids) == 1
                assert abs(shape.Volume-node["stats"]["volume"]) < .02
                checked.append(dict(id=node["id"],source=node["source"],volume=shape.Volume))
                for child in node.get("children", []):
                    visit(child)
            visit(root)
            assert len(checked) == count
            actual = Part.read(str(folder/(stem+".step")))
            assert actual.isValid() and actual.isClosed() and len(actual.Solids) == 1
            assert abs(actual.Volume-volume) < .02
            if stem == "python-plate":
                assert root["source"] == "group" and len(root["children"]) == 3
                assert len([n for n in root["children"] if not n["solid"]]) == 2
                expected_bounds = [-30,-20,0,30,20,6]
            else:
                assert project["version"] == 11 and root["modeling"]["kind"] == "loft"
                assert len(root["children"]) == 2 and all(n["recipe"]["type"] == "sketch" for n in root["children"])
                expected_bounds = [-10,-5,0,10,5,20]
            bb = actual.BoundBox
            bounds = [bb.XMin,bb.YMin,bb.ZMin,bb.XMax,bb.YMax,bb.ZMax]
            assert max(abs(a-b) for a,b in zip(bounds,expected_bounds)) < 1e-5
            rows.append(dict(stem=stem,stepVolume=actual.Volume,expectedVolume=volume,bounds=bounds,bodies=checked,closed=True,solids=1))
        (folder/"independent-python.json").write_text(json.dumps(dict(ok=True,runId=run_id,reader="FreeCAD "+".".join(App.Version()[:3]),occt=Part.OCC_VERSION,examples=rows),indent=2),encoding="utf-8")
    except Exception:
        (folder/("independent-python-error-"+run_id+".txt")).write_text(traceback.format_exc(),encoding="utf-8")
        raise
else:
    import argparse
    import hashlib
    import subprocess
    import math
    import trimesh
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory")
    args=parser.parse_args()
    folder=Path(args.directory).resolve()
    root=Path(__file__).resolve().parents[1]
    run_id=uuid.uuid4().hex
    profile=folder/("python-reader-profile-"+run_id)
    for name in ("user","data","temp"):
        (profile/name).mkdir(parents=True)
    binary=root/"work/cad-independent-step/freecad/FreeCAD_1.1.4-Windows-x86_64-py311/bin/FreeCADCmd.exe"
    env=dict(os.environ,FORMNARO_PYTHON_PROOF_DIR=str(folder),FORMNARO_PYTHON_PROOF_RUN=run_id,FREECAD_USER_HOME=str(profile/"user"),FREECAD_USER_DATA=str(profile/"data"),FREECAD_USER_TEMP=str(profile/"temp"),PYTHONDONTWRITEBYTECODE="1")
    run=subprocess.run([str(binary),"--user-cfg",str(profile/"user.cfg"),"--system-cfg",str(profile/"system.cfg"),str(Path(__file__).resolve())],env=env,cwd=profile,capture_output=True,timeout=180,creationflags=subprocess.CREATE_NO_WINDOW)
    (folder/"independent-python.log").write_bytes(run.stdout+run.stderr)
    error=folder/("independent-python-error-"+run_id+".txt")
    if error.exists():
        raise AssertionError(error.read_text(encoding="utf-8"))
    assert run.returncode==0
    result=json.loads((folder/"independent-python.json").read_text(encoding="utf-8"))
    assert result["ok"] and result["runId"]==run_id
    artifacts=[]
    for row in result["examples"]:
        stem=row["stem"]
        mesh=trimesh.load_mesh(folder/(stem+".stl"),process=True)
        assert mesh.is_watertight and mesh.is_winding_consistent and mesh.volume>0 and len(mesh.split())==1
        allowed=2*2*math.pi*2.5*.01*6 if stem=="python-plate" else .001
        assert abs(mesh.volume-row["expectedVolume"])<=allowed
        row["stl"]={"volume":mesh.volume,"allowedTessellationVolumeDifference":allowed,"watertight":True,"oriented":True,"triangles":len(mesh.faces)}
        for ext in ("ocad","step","stl"):
            file=folder/(stem+"."+ext)
            artifacts.append(dict(file=str(file),bytes=file.stat().st_size,sha256=hashlib.sha256(file.read_bytes()).hexdigest()))
    result["artifacts"]=artifacts
    (folder/"independent-python.json").write_text(json.dumps(result,indent=2),encoding="utf-8")
    print(json.dumps(dict(ok=True,examples=len(result["examples"]),bodies=sum(len(r["bodies"]) for r in result["examples"]),artifacts=len(artifacts))))
