import json,sys
from pathlib import Path
import trimesh
p=Path('work/v09/exports');expected=json.loads((p/'expected.json').read_text())
report={}
for suffix,scale in [('3mf',1),('gltf',1000)]:
    scene=trimesh.load_scene(p/('Farbgruppe.'+suffix),process=False)
    mesh=scene.to_geometry()
    volume=float(mesh.volume)*scale**3
    assert abs(volume-expected['volume'])<0.1,(suffix,volume,expected)
    assert len(mesh.faces)==expected['triangles']
    assert all(g.is_watertight for g in scene.geometry.values())
    report[suffix]={'reader':'trimesh '+trimesh.__version__,'parts':len(scene.geometry),'triangles':len(mesh.faces),'volumeMm3':volume,'watertight':True}
(p/'independent-readers.json').write_text(json.dumps({'ok':True,**report},indent=2))
print(json.dumps(report,indent=2))
