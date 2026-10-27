"""Independently read actual rich-sketch STEP/STL and its saved project."""
import json, os, pathlib, subprocess

if os.environ.get('FORMNARO_SKETCH_PROOF'):
    folder=pathlib.Path(os.environ['FORMNARO_SKETCH_PROOF'])
    try:
        import FreeCAD as App
        import Part, math, struct, re
        expected=json.loads((folder/'profile-expected.json').read_text(encoding='utf-8'))
        shape=Part.read(str(folder/'profile.step'))
        assert shape.isValid() and len(shape.Solids)==1 and shape.Solids[0].isClosed()
        dims=[shape.BoundBox.XLength,shape.BoundBox.YLength,shape.BoundBox.ZLength]
        assert max(abs(a-b) for a,b in zip(dims,expected['dimensions']))<1e-6,dims
        assert abs(shape.Volume-expected['volume'])<1e-5,shape.Volume
        circles=[f.Surface.Radius*2 for f in shape.Faces if isinstance(f.Surface,Part.Cylinder)]
        assert sum(abs(d-expected['circleDiameter'])<1e-6 for d in circles)>=4,circles
        data=(folder/'profile.stl').read_bytes();count=struct.unpack_from('<I',data,80)[0] if len(data)>=84 else -1
        if len(data)==84+50*count:
            tris=[struct.unpack_from('<12fH',data,84+i*50)[3:12] for i in range(count)]
        else:
            points=[[float(n) for n in v.split()] for v in re.findall(r'vertex\s+([^\r\n]+)',data.decode('ascii'))]
            assert len(points)%3==0
            tris=[sum(points[i:i+3],[]) for i in range(0,len(points),3)]
        edges,volume={},0.;origin=tris[0][:3]
        for t in tris:
            ps=[tuple(t[i:i+3]) for i in [0,3,6]]
            assert all(all(math.isfinite(v) for v in p) for p in ps)
            for a,b in zip(ps,ps[1:]+ps[:1]):edges.setdefault(tuple(sorted([a,b])),[]).append((a,b))
            a,b,c=[tuple(p[k]-origin[k] for k in range(3)) for p in ps]
            volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6
        assert all(len(e)==2 and e[0]==e[1][::-1] for e in edges.values()),'STL boundary/orientation'
        assert abs(volume-expected['volume'])/expected['volume']<.001,volume
        project=json.loads((folder/'Skizzen-Profil.ocad').read_text(encoding='utf-8'))
        assert project['version']==10 and project['workspace']['version'] in [2,3,4]
        s=project['nodes'][0]['recipe']['sketch'];assert s['version']==2
        assert len([l for l in s['loops'] if l['role']=='hole'])==5
        offset_result=None
        if (folder/'tools-offset.step').exists():
            ring=Part.Shape();ring.read(str(folder/'tools-offset.step'))
            assert ring.isValid() and ring.isClosed() and len(ring.Solids)==1
            assert abs(ring.Volume-1152)<1e-6,ring.Volume
            assert all(abs(a-b)<1e-6 for a,b in zip([ring.BoundBox.XLength,ring.BoundBox.YLength,ring.BoundBox.ZLength],[60,40,3]))
            offset_result=dict(volume=ring.Volume,dimensions=[60,40,3],valid=True,closed=True)
        attachments=None
        if (folder/'attachment-expected.json').exists():
            ae=json.loads((folder/'attachment-expected.json').read_text(encoding='utf-8'))
            native=Part.read(str(folder/'attachment-cad.step'))
            assert native.isValid() and native.isClosed() and len(native.Solids)>=1
            assert all(s.isValid() and s.isClosed() for s in native.Solids)
            # Existing STEP export preserves color regions as touching solids.
            # Independently prove that these regions form one connected material
            # body, without double-counted or missing material.
            joined=native.Solids[0]
            for other in native.Solids[1:]:joined=joined.fuse(other)
            joined=joined.removeSplitter()
            assert joined.isValid() and joined.isClosed() and len(joined.Solids)==1
            assert abs(joined.Volume-native.Volume)<1e-5
            assert abs(joined.Volume-ae['cadVolume'])<1e-5,(joined.Volume,ae)
            assert all(abs(a-b)<1e-6 for a,b in zip([joined.BoundBox.XLength,joined.BoundBox.YLength,joined.BoundBox.ZLength],[60,40,8]))
            def independent_stl(file):
                raw=file.read_bytes();count=struct.unpack_from('<I',raw,80)[0] if len(raw)>=84 else -1
                if len(raw)==84+50*count:
                    faces=[struct.unpack_from('<12fH',raw,84+i*50)[3:12] for i in range(count)]
                else:
                    vp=[[float(v) for v in line.split()] for line in re.findall(r'vertex\s+([^\r\n]+)',raw.decode('utf-8'))]
                    assert len(vp)%3==0
                    faces=[sum(vp[i:i+3],[]) for i in range(0,len(vp),3)]
                assert faces,'empty STL'
                edges,parents,vol={}, {},0.;origin=faces[0][:3]
                def find(p):
                    parents.setdefault(p,p)
                    while parents[p]!=p:
                        parents[p]=parents[parents[p]];p=parents[p]
                    return p
                for f in faces:
                    ps=[tuple(f[i:i+3]) for i in [0,3,6]]
                    assert all(all(math.isfinite(v) for v in p) for p in ps)
                    a,b,c=[tuple(p[k]-origin[k] for k in range(3)) for p in ps]
                    u,v=[tuple(p[k]-a[k] for k in range(3)) for p in [b,c]]
                    normal=(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])
                    assert sum(n*n for n in normal)>0,'degenerate STL triangle'
                    vol+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6
                    for a,b in zip(ps,ps[1:]+ps[:1]):
                        edges.setdefault(tuple(sorted([a,b])),[]).append((a,b));parents[find(a)]=find(b)
                assert all(len(e)==2 and e[0]==e[1][::-1] for e in edges.values()),'STL incidence/orientation'
                components=len({find(p) for p in parents});assert components==1,(file.name,components)
                assert vol>0
                return dict(triangles=len(faces),volume=vol,components=components,closed=True,oriented=True)
            cad_stl=independent_stl(folder/'attachment-cad.stl')
            before_mesh=independent_stl(folder/'attachment-mesh-before.stl')
            after_mesh=independent_stl(folder/'attachment-mesh.stl')
            assert abs(cad_stl['volume']-ae['cadVolume'])<.4,(cad_stl,ae)
            assert abs(after_mesh['volume']-before_mesh['volume']-ae['meshDelta'])<.4,(after_mesh,before_mesh,ae)
            attachments=dict(nativeVolume=joined.Volume,stepColorParts=len(native.Solids),joinedMaterialSolids=1,nativeSTL=cad_stl,meshBefore=before_mesh,meshAfter=after_mesh,expectedMeshDelta=ae['meshDelta'])
        result=dict(ok=True,engine='FreeCAD '+'.'.join(App.Version()[:3]),occt=Part.OCC_VERSION,dimensions=dims,volume=shape.Volume,cylindricalDiameters=circles,stl=dict(triangles=len(tris),closed=True,oriented=True,volume=volume),projectVersion=10,offset=offset_result,attachments=attachments)
        (folder/'independent-sketch.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    except Exception:
        import traceback
        (folder/'independent-sketch-error.txt').write_text(traceback.format_exc(),encoding='utf-8');raise
else:
    import argparse
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('directory');parser.add_argument('--freecad',required=True);args=parser.parse_args()
    folder=pathlib.Path(args.directory).resolve();profile=folder/'independent-sketch-profile'
    for name in ['user','data','temp']:(profile/name).mkdir(parents=True,exist_ok=False)
    env=dict(os.environ,FORMNARO_SKETCH_PROOF=str(folder),FREECAD_USER_HOME=str(profile/'user'),FREECAD_USER_DATA=str(profile/'data'),FREECAD_USER_TEMP=str(profile/'temp'),PYTHONDONTWRITEBYTECODE='1')
    run=subprocess.run([str(pathlib.Path(args.freecad).resolve()),'--user-cfg',str(profile/'user.cfg'),'--system-cfg',str(profile/'system.cfg'),str(pathlib.Path(__file__).resolve())],env=env,cwd=profile,capture_output=True,timeout=180,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    (folder/'independent-sketch.log').write_bytes(run.stdout+run.stderr)
    assert run.returncode==0,run.stderr.decode(errors='replace')
    if (folder/'independent-sketch-error.txt').exists():raise AssertionError((folder/'independent-sketch-error.txt').read_text(encoding='utf-8'))
    result=json.loads((folder/'independent-sketch.json').read_text(encoding='utf-8'));assert result['ok'];print(json.dumps(result))
