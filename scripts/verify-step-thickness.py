"""Independent FreeCAD STEP and binary-STL readback in an isolated profile."""
import json, math, os, pathlib, struct, subprocess, sys

if os.environ.get('FORMNARO_STEP_PROOF_WORKER'):
    try:
        import FreeCAD as App
        import Part
        folder = pathlib.Path(os.environ['FORMNARO_STEP_PROOF_WORKER'])
        records = {}
        for name, volume, dimensions, count in [
            ('fixture.step', 400 + 64 * math.pi, [59, 17, 8], 3),
            ('selected.step', 400, [20, 10, 2], 1),
            ('during-map.step', 400, [20, 10, 2], 1),
        ]:
            shape = Part.read(str(folder / name))
            box = shape.BoundBox
            size = [box.XLength, box.YLength, box.ZLength]
            assert shape.isValid() and len(shape.Solids) == count, name
            assert all(s.isClosed() for s in shape.Solids), (name,"not closed")
            assert abs(shape.Volume - volume) < 1e-5, (name, shape.Volume, volume)
            assert max(abs(a-b) for a,b in zip(size,dimensions)) < 1e-5, (name,size)
            records[name] = dict(valid=True, closed=True, solids=count, volume=shape.Volume, dimensions=size)
        data = (folder / 'during-map.stl').read_bytes()
        count = struct.unpack_from('<I', data, 80)[0] if len(data)>=84 else -1
        if len(data) == 84 + 50 * count:
            triangles = [struct.unpack_from('<12fH', data, 84 + i * 50)[3:12] for i in range(count)]
        else:
            import re
            numbers = [[float(v) for v in line.split()] for line in re.findall(r'vertex\s+([^\r\n]+)',data.decode('ascii'))]
            assert len(numbers)%3==0 and all(len(p)==3 and all(math.isfinite(v) for v in p) for p in numbers), 'ASCII STL vertices'
            triangles = [sum(numbers[i:i+3],[]) for i in range(0,len(numbers),3)]; count=len(triangles)
        points = [tuple(t[k:k+3]) for t in triangles for k in [0,3,6]]
        edges, signed = {}, 0
        origin = points[0]
        for t in triangles:
            p = [tuple(t[k:k+3]) for k in [0,3,6]]
            for a,b in zip(p,p[1:]+p[:1]):
                key = tuple(sorted([a,b])); edges.setdefault(key,[]).append((a,b))
            a,b,c = [tuple(v[k]-origin[k] for k in range(3)) for v in p]
            signed += (a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6
        assert all(len(v)==2 and v[0]==v[1][::-1] for v in edges.values()), 'STL topology'
        assert abs(signed-400) < 1e-4, ("STL volume",signed)
        records['during-map.stl'] = dict(triangles=count, closed=True, oriented=True, volume=signed)
        project = json.loads((folder / 'assembly.ocad').read_text(encoding='utf-8'))
        assert len(project['nodes']) == 3 and len(project['folders']) == 3
        assert {'Prüfbaugruppe','Unterbau links'}.issubset({f['name'] for f in project['folders']})
        plate = next(n for n in project['nodes'] if n['name']=='Boden')
        assert plate['color']=='#1266cc' and abs(plate['opacity']-.7)<1e-6
        assert any(f['color']=='#ffcc22' for f in plate['metadata']['stepFaceColors'])
        result = dict(ok=True, engine='FreeCAD '+'.'.join(App.Version()[:3]), occt=Part.OCC_VERSION, records=records)
        (folder / 'independent-step-thickness.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    except Exception:
        import traceback
        pathlib.Path(os.environ['FORMNARO_STEP_PROOF_WORKER'],'independent-error.txt').write_text(traceback.format_exc(),encoding='utf-8')
        raise

else:
    import argparse
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory');parser.add_argument('--freecad',required=True)
    args=parser.parse_args();folder=pathlib.Path(args.directory).resolve();profile=folder/'independent-profile'
    for name in ['user','data','temp']:(profile/name).mkdir(parents=True,exist_ok=False)
    env=dict(os.environ,FORMNARO_STEP_PROOF_WORKER=str(folder),FREECAD_USER_HOME=str(profile/'user'),FREECAD_USER_DATA=str(profile/'data'),FREECAD_USER_TEMP=str(profile/'temp'),PYTHONDONTWRITEBYTECODE='1')
    run=subprocess.run([str(pathlib.Path(args.freecad).resolve()),'--user-cfg',str(profile/'user.cfg'),'--system-cfg',str(profile/'system.cfg'),str(pathlib.Path(__file__).resolve())],env=env,cwd=profile,capture_output=True,timeout=180,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    (folder/'independent.log').write_bytes(run.stdout+run.stderr)
    assert run.returncode==0, run.stderr.decode(errors='replace')
    result=json.loads((folder/'independent-step-thickness.json').read_text(encoding='utf-8'));assert result['ok'];print(json.dumps(result))
