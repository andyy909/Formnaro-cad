"""Independently inspect every actual example STEP and mesh STL export."""
import json, os, pathlib, subprocess
if os.environ.get('FORMNARO_TEMPLATE_PROOF'):
 folder=pathlib.Path(os.environ['FORMNARO_TEMPLATE_PROOF'])
 try:
  import FreeCAD as App
  import Part,math,re,struct
  expected=json.loads((folder/'templates-expected.json').read_text(encoding='utf-8'));items=[]
  for entry in expected:
   id=entry['id'];volume=entry['volume'];shape=Part.read(str(folder/('template-native-'+id+'.step')))
   assert shape.isValid() and len(shape.Solids)==1 and shape.isClosed();assert abs(shape.Volume-volume)<1e-5
   data=(folder/('template-mesh-'+id+'.stl')).read_bytes();count=struct.unpack_from('<I',data,80)[0] if len(data)>=84 else -1
   if len(data)==84+50*count:faces=[struct.unpack_from('<12fH',data,84+i*50)[3:12] for i in range(count)]
   else:
    points=[[float(v) for v in row.split()] for row in re.findall(r'vertex\s+([^\r\n]+)',data.decode('utf-8'))];assert len(points)%3==0;faces=[sum(points[i:i+3],[]) for i in range(0,len(points),3)]
   assert faces;origin=faces[0][:3];edges={};parents={};mesh_volume=0
   def find(p):
    parents.setdefault(p,p)
    while parents[p]!=p:parents[p]=parents[parents[p]];p=parents[p]
    return p
   for row in faces:
    ps=[tuple(row[i:i+3]) for i in [0,3,6]];assert all(math.isfinite(v) for p in ps for v in p)
    a,b,c=[tuple(p[k]-origin[k] for k in range(3)) for p in ps];u=tuple(b[k]-a[k] for k in range(3));v=tuple(c[k]-a[k] for k in range(3));normal=(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]);assert sum(v*v for v in normal)>0
    mesh_volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6
    for a,b in zip(ps,ps[1:]+ps[:1]):edges.setdefault(tuple(sorted([a,b])),[]).append((a,b));parents[find(a)]=find(b)
   assert all(len(e)==2 and e[0]==e[1][::-1] for e in edges.values());assert len({find(p) for p in parents})==1
   assert mesh_volume>0 and abs(mesh_volume-volume)<max(1,volume*.003)
   items.append(dict(id=id,nativeVolume=shape.Volume,meshVolume=mesh_volume,meshTriangles=len(faces),closed=True,oriented=True,materialSolids=1))
  project=json.loads((folder/'templates-native.ocad').read_text(encoding='utf-8'));assert project['version']==10 and len(project['nodes'])==4
  assert all(n['recipe']['sketch']['version']==2 and n['recipe']['sketch']['variables'] for n in project['nodes'])
  result=dict(ok=True,engine='FreeCAD '+'.'.join(App.Version()[:3]),occt=Part.OCC_VERSION,examples=items,projectVersion=10)
  (folder/'independent-templates.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
 except Exception:
  import traceback
  (folder/'independent-templates-error.txt').write_text(traceback.format_exc(),encoding='utf-8');raise
else:
 import argparse
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('directory');parser.add_argument('--freecad',required=True);args=parser.parse_args();folder=pathlib.Path(args.directory).resolve();profile=folder/'independent-template-profile'
 for name in ['user','data','temp']:(profile/name).mkdir(parents=True,exist_ok=False)
 env=dict(os.environ,FORMNARO_TEMPLATE_PROOF=str(folder),FREECAD_USER_HOME=str(profile/'user'),FREECAD_USER_DATA=str(profile/'data'),FREECAD_USER_TEMP=str(profile/'temp'),PYTHONDONTWRITEBYTECODE='1')
 run=subprocess.run([str(pathlib.Path(args.freecad).resolve()),'--user-cfg',str(profile/'user.cfg'),'--system-cfg',str(profile/'system.cfg'),str(pathlib.Path(__file__).resolve())],env=env,cwd=profile,capture_output=True,timeout=180,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
 (folder/'independent-templates.log').write_bytes(run.stdout+run.stderr);assert run.returncode==0,run.stderr.decode(errors='replace')
 if (folder/'independent-templates-error.txt').exists():raise AssertionError((folder/'independent-templates-error.txt').read_text(encoding='utf-8'))
 result=json.loads((folder/'independent-templates.json').read_text(encoding='utf-8'));assert result['ok'];print(json.dumps(result))
