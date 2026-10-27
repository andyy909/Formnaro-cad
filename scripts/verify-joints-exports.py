"""Independent saved-joint/affine-pose/BRep/STEP/STL readback in FreeCAD."""
import os, pathlib, json, hashlib

if os.environ.get('FORMNARO_JOINT_PROOF'):
    folder=pathlib.Path(os.environ['FORMNARO_JOINT_PROOF'])
    try:
        import FreeCAD as App, Part, math, struct, re
        def load(name):return json.loads((folder/name).read_text(encoding='utf-8'))
        def record(name):
            raw=(folder/name).read_bytes();return dict(name=name,bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest())
        identity=[1.,0,0,0,0,1.,0,0,0,0,1.,0,0,0,0,1.]
        def multiply(a,b):return [sum(a[k*4+r]*b[c*4+k] for k in range(4)) for c in range(4) for r in range(4)]
        def inverse(m):
            rows=[[m[c*4+r] for c in range(4)]+[float(r==c) for c in range(4)] for r in range(4)]
            for col in range(4):
                pivot=max(range(col,4),key=lambda r:abs(rows[r][col]));rows[col],rows[pivot]=rows[pivot],rows[col]
                value=rows[col][col];assert abs(value)>1e-14;rows[col]=[x/value for x in rows[col]]
                for r in range(4):
                    if r!=col:
                        f=rows[r][col];rows[r]=[x-f*y for x,y in zip(rows[r],rows[col])]
            return [rows[r][4+c] for c in range(4) for r in range(4)]
        def close(a,b,tolerance=1e-7):assert len(a)==len(b) and max(abs(x-y) for x,y in zip(a,b))<tolerance,(a,b)
        def motion(kind,value):
            m=identity.copy()
            if kind=='prismatic':m[14]=value
            if kind=='revolute':
                a=math.radians(value);c,s=math.cos(a),math.sin(a);m[0],m[1],m[4],m[5]=c,s,-s,c
            return m
        def determinant(m):return m[0]*(m[5]*m[10]-m[9]*m[6])-m[4]*(m[1]*m[10]-m[9]*m[2])+m[8]*(m[1]*m[6]-m[5]*m[2])
        def bounds(shape):
            b=shape.BoundBox;return [[b.XMin,b.YMin,b.ZMin],[b.XMax,b.YMax,b.ZMax]]
        base,posed,final=load('joints-base.ocad'),load('joints-posed.ocad'),load('joints-final.ocad');expected=load('joints-expected.json');saved=load('Gelenke.ocad')
        assert posed==final and {k:v for k,v in saved.items() if k!='workspace'}==posed
        assert saved['workspace']['version'] in [2,3,4] and all(m['version']==16 for m in [base,posed,final])
        before={n['id']:n for n in base['nodes']};after={n['id']:n for n in posed['nodes']};assert before.keys()==after.keys()
        for ident,n in after.items():assert {k:v for k,v in n.items() if k!='transform'}=={k:v for k,v in before[ident].items() if k!='transform'},'body/source changed'
        assert after[expected['base']]==before[expected['base']] and after[expected['other']]==before[expected['other']]
        translate=identity.copy();translate[12]=-12;rotate=motion('revolute',30)
        close(after[expected['slide']]['transform'],multiply(translate,before[expected['slide']]['transform']))
        for ident in [expected['arm'],expected['tip']]:close(after[ident]['transform'],multiply(rotate,before[ident]['transform']))
        for model in [base,posed]:
            nodes={n['id']:n for n in model['nodes']};data=model['joints'];assert data['version']==1 and data['bases']==[expected['base']] and len(data['joints'])==3
            for j in data['joints']:
                parent=nodes[j['parentId']]['transform'];child=nodes[j['childId']]['transform'];world=multiply(parent,j['parentFrame']);predicted=multiply(multiply(world,motion(j['kind'],j['value'])),inverse(j['childFrame']));close(predicted,child)
                axes=[world[i*4:i*4+3] for i in range(3)]
                assert all(abs(sum(v*v for v in a)-1)<1e-7 for a in axes)
                assert all(abs(sum(x*y for x,y in zip(axes[i],axes[k])))<1e-7 for i in range(3) for k in range(i+1,3))
                if j['kind']!='fixed':assert j['limits']['min']<=j['value']<=j['limits']['max']
        outputs={}
        for role,volume in [('slide',1848),('arm',1200)]:
            n=after[expected[role]];local=Part.Shape();local.importBrepFromString(n['brep']['data']);assert local.isValid() and local.isClosed() and len(local.Solids)==1 and abs(local.Volume-1000)<1e-5
            m=n['transform'];assert determinant(m)<0 and abs(abs(determinant(m))*local.Volume-volume)<1e-5
            placed=local.transformGeometry(App.Matrix(*[m[c*4+r] for r in range(4) for c in range(4)]));assert placed.isValid() and placed.isClosed();box=bounds(placed)
            step=Part.read(str(folder/('joints-'+role+'.step')));assert step.isValid() and step.isClosed() and len(step.Solids)==1 and abs(step.Volume-volume)<1e-5
            for a,b in zip(bounds(step),box):close(a,b)
            raw=(folder/('joints-'+role+'.stl')).read_bytes();count=struct.unpack_from('<I',raw,80)[0] if len(raw)>=84 else -1
            if len(raw)==84+50*count:faces=[struct.unpack_from('<12fH',raw,84+i*50)[3:12] for i in range(count)]
            else:
                points=[[float(v) for v in text.split()] for text in re.findall(r'vertex\s+([^\r\n]+)',raw.decode('ascii'))];assert len(points)%3==0;faces=[sum(points[i:i+3],[]) for i in range(0,len(points),3)]
            assert faces;edges={};parents={};signed=0.;points=[]
            def find(p):
                parents.setdefault(p,p)
                while parents[p]!=p:parents[p]=parents[parents[p]];p=parents[p]
                return p
            origin=faces[0][:3]
            for face in faces:
                ps=[tuple(face[i:i+3]) for i in [0,3,6]];assert all(math.isfinite(x) for p in ps for x in p);points.extend(ps)
                a,b,c=[[p[k]-origin[k] for k in range(3)] for p in ps];signed+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6
                for a,b in zip(ps,ps[1:]+ps[:1]):edges.setdefault(tuple(sorted([a,b])),[]).append((a,b));parents[find(a)]=find(b)
            assert all(len(e)==2 and e[0]==e[1][::-1] for e in edges.values()) and len({find(p) for p in parents})==1
            assert abs(signed-volume)<2e-4,(role,signed,volume)
            stl_box=[[min(p[k] for p in points) for k in range(3)],[max(p[k] for p in points) for k in range(3)]]
            for a,b in zip(stl_box,box):close(a,b,2e-5)
            outputs[role]=dict(localVolume=local.Volume,worldVolume=volume,matrix=m,worldBounds=box,sourceBrepSha256=hashlib.sha256(n['brep']['data'].encode()).hexdigest(),step=dict(volume=step.Volume,valid=True,closed=True,solids=1),stl=dict(volume=signed,triangles=len(faces),closed=True,oriented=True,components=1))
        names=['joints-base.ocad','joints-posed.ocad','joints-final.ocad','Gelenke.ocad','joints-expected.json']+['joints-'+role+'.'+extension for role in ['slide','arm'] for extension in ['step','stl']]
        report=dict(ok=True,engine='FreeCAD '+'.'.join(App.Version()[:3]),occt=Part.OCC_VERSION,projectVersion=16,joints=3,poses=2,fullAffinePreserved=True,allSourceBodiesPreserved=True,finalExactlyRestored=True,outputs=outputs,files=[record(name) for name in names]);(folder/'independent-joints.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    except Exception:
        import traceback
        (folder/'independent-joints-error.txt').write_text(traceback.format_exc(),encoding='utf-8');raise
else:
    import argparse,subprocess
    parser=argparse.ArgumentParser();parser.add_argument('directory');parser.add_argument('--freecad',required=True);args=parser.parse_args();folder=pathlib.Path(args.directory).resolve();profile=folder/'independent-joints-profile';report=folder/'independent-joints.json'
    if report.exists():raise SystemExit('Use a fresh joint acceptance directory')
    for name in ['user','data','temp']:(profile/name).mkdir(parents=True,exist_ok=False)
    env={**os.environ,'FORMNARO_JOINT_PROOF':str(folder),'FREECAD_USER_HOME':str(profile/'user'),'FREECAD_USER_DATA':str(profile/'data'),'FREECAD_USER_TEMP':str(profile/'temp'),'PYTHONDONTWRITEBYTECODE':'1'}
    run=subprocess.run([str(pathlib.Path(args.freecad).resolve()),'--user-cfg',str(profile/'user.cfg'),'--system-cfg',str(profile/'system.cfg'),str(pathlib.Path(__file__).resolve())],env=env,cwd=profile,capture_output=True,timeout=180,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0);(folder/'independent-joints.log').write_bytes(run.stdout+run.stderr)
    if run.returncode or not report.exists():raise SystemExit('Independent joint verification failed; inspect '+str(folder))
    result=json.loads(report.read_text(encoding='utf-8'));assert result['ok'];print(json.dumps(result))
