"""Independent FreeCAD/OCCT readback of actual version-3 UI artifacts."""
import os, pathlib, json, hashlib, sys

if os.environ.get('FORMNARO_CONSTRAINT_PROOF'):
    folder=pathlib.Path(os.environ['FORMNARO_CONSTRAINT_PROOF'])
    try:
        import FreeCAD as App, Part, math, re, struct
        record=lambda name:dict(name=name,bytes=(folder/name).stat().st_size,sha256=hashlib.sha256((folder/name).read_bytes()).hexdigest())
        model=json.loads((folder/'conditions.ocad').read_text(encoding='utf-8'))
        final=json.loads((folder/'conditions-final.ocad').read_text(encoding='utf-8'))
        assert model==final, 'Final confirmed model differs after cancel/AI/mesh checks'
        assert model['version']==15 and len(model['nodes'])==1
        node=model['nodes'][0];sketch=node['recipe']['sketch']
        assert sketch['version']==3 and len(sketch['constraints'])==11
        assert next(v['value'] for v in sketch['variables'] if v['name']=='breite')=='30'
        assert sketch['dimensions']['height']=='3'
        elements={e['id']:e for e in sketch['elements']}
        for e in elements.values():
            assert e['type']=='line'
            for field in ['start','end']:e[field]=[float(x) for x in e[field]]
        for c in sketch['constraints']:
            refs=c['refs'];a=elements[refs[0]['element']]
            if c['type']=='coincident':
                b=elements[refs[1]['element']]
                assert math.dist(a[refs[0]['point']],b[refs[1]['point']])<1e-7
            elif c['type']=='horizontal':assert abs(a['start'][1]-a['end'][1])<1e-7
            elif c['type']=='vertical':assert abs(a['start'][0]-a['end'][0])<1e-7
            elif c['type']=='fixed':assert math.dist(a[refs[0]['point']],c['value'])<1e-7
            elif c['type']=='length':
                expected=30 if c['value']=='breite' else float(c['value'])
                assert abs(math.dist(a['start'],a['end'])-expected)<1e-7
            else:raise AssertionError('Unexpected fixture condition '+c['type'])
        assert sum(c['value']=='breite' for c in sketch['constraints'] if c['type']=='length')==1
        native=Part.Shape();native.importBrepFromString(node['brep']['data'])
        step=Part.read(str(folder/'conditions.step'))
        shapes={}
        for name,shape in [('native',native),('step',step)]:
            assert shape.isValid() and shape.isClosed() and len(shape.Solids)==1
            dims=[shape.BoundBox.XLength,shape.BoundBox.YLength,shape.BoundBox.ZLength]
            assert max(abs(a-b) for a,b in zip(dims,[30,10,3]))<1e-6,dims
            assert abs(shape.Volume-900)<1e-5,shape.Volume
            shapes[name]=dict(volume=shape.Volume,dimensions=dims,valid=True,closed=True,solids=1)
        raw=(folder/'conditions.stl').read_bytes();count=struct.unpack_from('<I',raw,80)[0] if len(raw)>=84 else -1
        if len(raw)==84+50*count:faces=[struct.unpack_from('<12fH',raw,84+i*50)[3:12] for i in range(count)]
        else:
            points=[[float(v) for v in text.split()] for text in re.findall(r'vertex\s+([^\r\n]+)',raw.decode('ascii'))]
            assert len(points)%3==0
            faces=[sum(points[i:i+3],[]) for i in range(0,len(points),3)]
        assert faces
        edges,volume,parents={},0.,{}
        def find(p):
            parents.setdefault(p,p)
            while parents[p]!=p:parents[p]=parents[parents[p]];p=parents[p]
            return p
        for face in faces:
            ps=[tuple(face[i:i+3]) for i in [0,3,6]]
            assert all(math.isfinite(x) for p in ps for x in p)
            a,b,c=ps;volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6
            for a,b in zip(ps,ps[1:]+ps[:1]):edges.setdefault(tuple(sorted([a,b])),[]).append((a,b));parents[find(a)]=find(b)
        assert all(len(e)==2 and e[0]==e[1][::-1] for e in edges.values())
        assert len({find(p) for p in parents})==1 and abs(volume-900)<1e-4
        result=dict(ok=True,engine='FreeCAD '+'.'.join(App.Version()[:3]),occt=Part.OCC_VERSION,projectVersion=15,sketchVersion=3,constraints=11,formula='breite',native=shapes['native'],step=shapes['step'],stl=dict(triangles=len(faces),volume=volume,closed=True,oriented=True,components=1),files=[record(name) for name in ['conditions.ocad','conditions-final.ocad','conditions.step','conditions.stl']])
        (folder/'independent-sketch-constraints.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    except Exception:
        import traceback
        (folder/'independent-sketch-constraints-error.txt').write_text(traceback.format_exc(),encoding='utf-8');raise
else:
    import argparse,subprocess
    parser=argparse.ArgumentParser();parser.add_argument('directory');parser.add_argument('--freecad',required=True);args=parser.parse_args()
    folder=pathlib.Path(args.directory).resolve();report=folder/'independent-sketch-constraints.json'
    if report.exists():raise SystemExit('Independent report already exists; use a fresh acceptance directory')
    profile=folder/'independent-conditions-profile'
    for name in ['user','data','temp']:(profile/name).mkdir(parents=True,exist_ok=False)
    env={**os.environ,'FORMNARO_CONSTRAINT_PROOF':str(folder),'FREECAD_USER_HOME':str(profile/'user'),'FREECAD_USER_DATA':str(profile/'data'),'FREECAD_USER_TEMP':str(profile/'temp'),'PYTHONDONTWRITEBYTECODE':'1'}
    run=subprocess.run([str(pathlib.Path(args.freecad).resolve()),'--user-cfg',str(profile/'user.cfg'),'--system-cfg',str(profile/'system.cfg'),str(pathlib.Path(__file__).resolve())],env=env,cwd=profile,capture_output=True,text=True,timeout=180,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    (folder/'independent-sketch-constraints.log').write_text(run.stdout+'\n'+run.stderr,encoding='utf-8')
    if run.returncode or not report.exists():raise SystemExit('Independent condition artifact verification failed; see '+str(folder))
    result=json.loads(report.read_text(encoding='utf-8'));assert result['ok'];print(json.dumps(result))
