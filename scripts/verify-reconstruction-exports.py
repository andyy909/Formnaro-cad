"""Independent native reader for the section-to-sketch reconstruction fixture."""
import json
import math
import os
from pathlib import Path
import sys
import uuid

if os.environ.get("FORMNARO_SECTION_READER"):
    import FreeCAD as App
    import Part
    import traceback
    folder = Path(os.environ["FORMNARO_SECTION_READER"])
    try:
        project = json.loads((folder/"section-reconstruction.ocad").read_text(encoding="utf-8"))
        nodes = [n for n in project["nodes"] if n["kind"] == "cad"]
        assert len(nodes) == 1 and len([n for n in project["nodes"] if n["kind"] == "mesh"]) == 1
        node = nodes[0]
        assert node["recipe"]["type"] == "sketch" and len(node["recipe"]["sketch"]["loops"]) == 2
        shape = Part.Shape()
        shape.importBrepFromString(node["brep"]["data"])
        assert shape.isValid() and shape.isClosed() and len(shape.Solids) == 1
        actual = Part.read(str(folder/"section-reconstruction.step"))
        expected = Part.makeCylinder(10, 8).cut(Part.makeCylinder(6.8, 8))
        difference = actual.cut(expected).Volume+expected.cut(actual).Volume
        volume = math.pi*(100-6.8**2)*8
        assert actual.isValid() and actual.isClosed() and len(actual.Solids) == 1
        assert abs(shape.Volume-volume) < .002 and abs(actual.Volume-volume) < .002 and difference < .002
        bb = actual.BoundBox
        bounds = [bb.XMin, bb.YMin, bb.ZMin, bb.XMax, bb.YMax, bb.ZMax]
        assert max(abs(a-b) for a,b in zip(bounds,[-10,-10,0,10,10,8])) < 2e-5
        (folder/"independent-section.json").write_text(json.dumps(dict(ok=True,runId=os.environ["FORMNARO_SECTION_RUN"],reader="FreeCAD "+".".join(App.Version()[:3]),occt=Part.OCC_VERSION,closed=True,solids=1,nativeSources=1,loops=2,volume=actual.Volume,expectedVolume=volume,symmetricDifferenceMm3=difference,bounds=bounds),indent=2),encoding="utf-8")
    except Exception:
        (folder/"independent-section-error.txt").write_text(traceback.format_exc(),encoding="utf-8")
        raise
else:
    import subprocess
    import hashlib
    import trimesh
    folder = Path(sys.argv[1]).resolve()
    root = Path(__file__).resolve().parents[1]
    run_id = uuid.uuid4().hex
    profile = folder/("section-reader-"+run_id)
    for name in ["user","data","temp"]:
        (profile/name).mkdir(parents=True)
    env = dict(os.environ,FORMNARO_SECTION_READER=str(folder),FORMNARO_SECTION_RUN=run_id,FREECAD_USER_HOME=str(profile/"user"),FREECAD_USER_DATA=str(profile/"data"),FREECAD_USER_TEMP=str(profile/"temp"),PYTHONDONTWRITEBYTECODE="1")
    binary = root/"work/cad-independent-step/freecad/FreeCAD_1.1.4-Windows-x86_64-py311/bin/FreeCADCmd.exe"
    p = subprocess.run([str(binary),"--user-cfg",str(profile/"user.cfg"),"--system-cfg",str(profile/"system.cfg"),str(Path(__file__).resolve())],env=env,cwd=profile,capture_output=True,timeout=180,creationflags=subprocess.CREATE_NO_WINDOW)
    (folder/"independent-section.log").write_bytes(p.stdout+p.stderr)
    assert p.returncode == 0
    result = json.loads((folder/"independent-section.json").read_text(encoding="utf-8"))
    assert result["ok"] and result["runId"] == run_id
    mesh = trimesh.load_mesh(folder/"section-reconstruction.stl",process=True)
    assert mesh.is_watertight and mesh.is_winding_consistent and mesh.volume > 0 and len(mesh.split()) == 1
    # The STEP is checked against analytic cylinders above. STL is separately
    # bounded by the fixture's display deflection over both cylindrical walls.
    allowed = 2*math.pi*(10+6.8)*.02*8
    assert abs(mesh.volume-result["expectedVolume"]) < allowed
    result["stl"] = dict(watertight=True,oriented=True,volume=mesh.volume,triangles=len(mesh.faces),allowedTessellationVolumeDifference=allowed)
    result["artifacts"] = [dict(file=str(folder/("section-reconstruction."+ext)),sha256=hashlib.sha256((folder/("section-reconstruction."+ext)).read_bytes()).hexdigest()) for ext in ["ocad","step","stl"]]
    (folder/"independent-section.json").write_text(json.dumps(result,indent=2),encoding="utf-8")
    print(json.dumps(dict(ok=True,volume=result["volume"],symmetricDifferenceMm3=result["symmetricDifferenceMm3"],artifacts=3)))
