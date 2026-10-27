"""Independent saved assembly/load-set/BRep and full STEP/STL readback."""
import os,pathlib,json,hashlib
if os.environ.get('FORMNARO_ASSEMBLY_PROOF'):
 folder=pathlib.Path(os.environ['FORMNARO_ASSEMBLY_PROOF'])
 try:
  import FreeCAD as App,Part,math,struct,re
  def load(name):return json.loads((folder/name).read_text(encoding='utf-8'))
  def record(name):
   raw=(folder/name).read_bytes();return dict(name=name,bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest())
  def determinant(m):return m[0]*(m[5]*m[10]-m[9]*m[6])-m[4]*(m[1]*m[10]-m[9]*m[2])+m[8]*(m[1]*m[6]-m[5]*m[2])
  def bounds(shape):
   b=shape.BoundBox;return [[b.XMin,b.YMin,b.ZMin],[b.XMax,b.YMax,b.ZMax]]
  def close(a,b,tol=1e-6):assert len(a)==len(b) and all(abs(x-y)<tol for x,y in zip(a,b)),(a,b)
  base,final,saved,expected=load('assembly-base.ocad'),load('assembly-final.ocad'),load('Baugruppenanzeige.ocad'),load('assembly-expected.json')
  assert base==final and {k:v for k,v in saved.items() if k!='workspace'}==base,'source/model changed'
  assert len(base['nodes'])==12 and expected['roots']==12 and base['version']==8
  workspace=saved['workspace'];assert workspace['version']==5 and workspace['loadSet']==[expected['target']]
  assert workspace==load('assembly-workspace.json'),'saved workspace differs from actual source capture'
  assert expected['loadSet']==[expected['target']]
  native=[];roots=[]
  def read(node,path):
   if node['kind']!='cad':return
   shape=Part.Shape();shape.importBrepFromString(node['brep']['data']);assert shape.isValid() and shape.isClosed() and len(shape.Solids)>0
   assert abs(shape.Volume-node['stats']['volume'])<1e-5
   native.append(dict(id=node['id'],path=path,valid=True,closed=True,volume=shape.Volume,solids=len(shape.Solids),sha256=hashlib.sha256(node['brep']['data'].encode()).hexdigest()))
   if not path:
    m=node['transform'];placed=shape.transformGeometry(App.Matrix(*[m[c*4+r]for r in range(4)for c in range(4)]));assert placed.isValid() and placed.isClosed()
    roots.append(dict(id=node['id'],volume=shape.Volume*abs(determinant(m)),solids=len(shape.Solids),bounds=bounds(placed)))
   for child in node.get('children',[]):read(child,path+[child['id']])
  for n in base['nodes']:read(n,[])
  assert len(native)==13 and len(roots)==11 and sum(r['solids']for r in roots)==12
  volume=sum(r['volume']for r in roots);assert abs(volume-4111.36)<1e-5
  root_bounds=[[min(r['bounds'][0][k]for r in roots)for k in range(3)],[max(r['bounds'][1][k]for r in roots)for k in range(3)]]
  step=Part.read(str(folder/'assembly-full.step'));assert step.isValid() and step.isClosed() and len(step.Solids)==12
  assert abs(step.Volume-volume)<1e-5
  for a,b in zip(bounds(step),root_bounds):close(a,b)
  mesh=next(n for n in base['nodes']if n['id']=='assembly-mesh');assert mesh['kind']=='mesh' and mesh['metadata']['sourceReference']
  m=mesh['transform'];v=mesh['mesh']['verts'];t=mesh['mesh']['triangles'];ps=[[sum(m[c*4+r]*v[i+c]for c in range(3))+m[12+r]for r in range(3)]for i in range(0,len(v),3)]
  mesh_volume=0.
  for i in range(0,len(t),3):
   a,b,c=[ps[j]for j in t[i:i+3]];mesh_volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6
  assert abs(mesh_volume-320)<1e-5
  stl_expected=volume+mesh_volume;box=[[min(root_bounds[0][k],min(p[k]for p in ps))for k in range(3)],[max(root_bounds[1][k],max(p[k]for p in ps))for k in range(3)]]
  raw=(folder/'assembly-full.stl').read_bytes();count=struct.unpack_from('<I',raw,80)[0]if len(raw)>=84 else -1
  if len(raw)==84+50*count:faces=[struct.unpack_from('<12fH',raw,84+i*50)[3:12]for i in range(count)]
  else:
   points=[[float(v)for v in text.split()]for text in re.findall(r'vertex\s+([^\r\n]+)',raw.decode('utf-8'))];assert len(points)%3==0;faces=[sum(points[i:i+3],[])for i in range(0,len(points),3)]
  assert len(faces)==156;edges={};parents={};signed=0.;points=[]
  def find(p):
   parents.setdefault(p,p)
   while parents[p]!=p:parents[p]=parents[parents[p]];p=parents[p]
   return p
  origin=faces[0][:3]
  for face in faces:
   ps=[tuple(face[i:i+3])for i in [0,3,6]];assert all(math.isfinite(x)for p in ps for x in p);points.extend(ps)
   a,b,c=[[p[k]-origin[k]for k in range(3)]for p in ps];signed+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6
   for a,b in zip(ps,ps[1:]+ps[:1]):edges.setdefault(tuple(sorted([a,b])),[]).append((a,b));parents[find(a)]=find(b)
  components=len({find(p)for p in parents});assert all(len(e)==2 and e[0]==e[1][::-1]for e in edges.values())and components==13
  assert abs(signed-stl_expected)<2e-4,(signed,stl_expected)
  stl_bounds=[[min(p[k]for p in points)for k in range(3)],[max(p[k]for p in points)for k in range(3)]]
  for a,b in zip(stl_bounds,box):close(a,b,2e-5)
  legacy=load('CAD5-Original.ocad');upgraded=load('CAD5-Baugruppenanzeige.ocad');assert legacy['version']==5 and hashlib.sha256((folder/'CAD5-Original.ocad').read_bytes()).hexdigest()==expected['legacyOriginalSha256'];assert upgraded['version']==8 and upgraded['workspace']['version']==5 and len(upgraded['workspace']['loadSet'])==1;stripped={k:v for k,v in upgraded.items()if k!='workspace'};stripped['version']=5;assert stripped==legacy,'plain source changed during view upgrade'
  names=['assembly-base.ocad','assembly-final.ocad','Baugruppenanzeige.ocad','assembly-expected.json','assembly-workspace.json','assembly-full.step','assembly-full.stl','CAD5-Original.ocad','CAD5-Baugruppenanzeige.ocad']
  exports=list((folder/'exports').iterdir());assert len(exports)==2
  for extension in ['step','stl']:
   originals=[p for p in exports if p.suffix=='.'+extension];assert len(originals)==1 and originals[0].read_bytes()==(folder/('assembly-full.'+extension)).read_bytes()
  report=dict(ok=True,legacyPlainCadPreserved=True,legacyUpgradeVersion=8,engine='FreeCAD '+'.'.join(App.Version()[:3]),occt=Part.OCC_VERSION,projectVersion=8,workspaceVersion=5,roots=12,nativeBodies=native,loadedRoots=1,allSourceBodiesPreserved=True,finalExactlyRestored=True,fullExportsIndependentOfLoadSet=True,workspaceSha256=hashlib.sha256(json.dumps(workspace,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest(),step=dict(valid=True,closed=True,solids=len(step.Solids),volume=step.Volume,bounds=bounds(step)),stl=dict(closed=True,oriented=True,components=components,triangles=len(faces),volume=signed,bounds=stl_bounds),files=[record(name)for name in names]);(folder/'independent-assembly.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
 except Exception:
  import traceback
  (folder/'independent-assembly-error.txt').write_text(traceback.format_exc(),encoding='utf-8');raise
else:
    import argparse,subprocess
    parser=argparse.ArgumentParser();parser.add_argument('directory');parser.add_argument('--freecad',required=True);args=parser.parse_args();folder=pathlib.Path(args.directory).resolve();profile=folder/'independent-assembly-profile';report=folder/'independent-assembly.json'
    if report.exists():raise SystemExit('Use a fresh assembly acceptance directory')
    for name in ['user','data','temp']:(profile/name).mkdir(parents=True,exist_ok=False)
    env={**os.environ,'FORMNARO_ASSEMBLY_PROOF':str(folder),'FREECAD_USER_HOME':str(profile/'user'),'FREECAD_USER_DATA':str(profile/'data'),'FREECAD_USER_TEMP':str(profile/'temp'),'PYTHONDONTWRITEBYTECODE':'1'}
    run=subprocess.run([str(pathlib.Path(args.freecad).resolve()),'--user-cfg',str(profile/'user.cfg'),'--system-cfg',str(profile/'system.cfg'),str(pathlib.Path(__file__).resolve())],env=env,cwd=profile,capture_output=True,timeout=180,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0);(folder/'independent-assembly.log').write_bytes(run.stdout+run.stderr)
    if run.returncode or not report.exists():raise SystemExit('Independent assembly verification failed; inspect '+str(folder))
    result=json.loads(report.read_text(encoding='utf-8'));assert result['ok'];print(json.dumps(result))
