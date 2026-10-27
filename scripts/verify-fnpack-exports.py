"""Independent indexed-package, source BRep and complete export readback."""
import os,pathlib,json,hashlib
if os.environ.get('FORMNARO_FNPACK_PROOF'):
 folder=pathlib.Path(os.environ['FORMNARO_FNPACK_PROOF'])
 try:
  import FreeCAD as App,Part,math,struct,re
  def load(name):return json.loads((folder/name).read_text(encoding='utf-8'))
  def record(name):
   data=(folder/name).read_bytes();return dict(name=name,bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
  def strip(value):
   if isinstance(value,list):return [strip(v)for v in value]
   if isinstance(value,dict):return {k:strip(v)for k,v in value.items()if k!='geometryIdentity'}
   return value
  def without_workspace(value):return {k:v for k,v in strip(value).items()if k not in ['workspace','version']}
  def read_pack(name):
   raw=(folder/name).read_bytes();assert raw[:8]==b'FNPACK\r\n' and struct.unpack_from('<I',raw,8)[0]==1 and raw[48:64]==bytes(16)
   size=struct.unpack_from('<I',raw,12)[0];assert 0<size<=16*1024*1024;index_raw=raw[64:64+size];assert hashlib.sha256(index_raw).digest()==raw[16:48]
   index=json.loads(index_raw.decode('utf-8'));assert set(index)=={'format','version','project','blocks'} and index['format']=='FormnaroPackage' and index['version']==1 and index['project']['version']==17
   end=0;blocks={};occurrences={}
   for block in index['blocks']:
    assert set(block)=={'sha256','kind','bytes','offset'} and block['offset']==end and block['bytes']>0 and block['sha256']not in blocks
    data=raw[64+size+end:64+size+end+block['bytes']];assert len(data)==block['bytes'] and hashlib.sha256(data).hexdigest()==block['sha256'];blocks[block['sha256']]=(block['kind'],data);end+=block['bytes']
   assert 64+size+end==len(raw)
   def hydrate(value):
    if isinstance(value,dict)and value.get('format')=='Formnaro-GeometryRef':
     kind,data=blocks[value['sha256']];assert kind==value['kind'] and len(data)==value['bytes'];occurrences[value['sha256']]=occurrences.get(value['sha256'],0)+1
     return dict(format='OpenCascade-BRep',triangulation=False,data=data.decode('utf-8'))if kind=='brep'else json.loads(data.decode('utf-8'))
    if isinstance(value,list):return [hydrate(v)for v in value]
    if isinstance(value,dict):
     assert value.get('format')!='OpenCascade-BRep' and not('verts'in value and 'triangles'in value),'geometry inline in index'
     return {k:hydrate(v)for k,v in value.items()}
    return value
   project=hydrate(index['project']);assert set(occurrences)==set(blocks) and max(occurrences.values())>=2
   return project,dict(name=name,blocks=len(blocks),references=sum(occurrences.values()),deduplicated=True,allBlockHashesVerified=True,indexSha256=hashlib.sha256(index_raw).hexdigest())
  expected=load('fnpack-expected.json');base=load('fnpack-base.ocad');final=load('fnpack-final-catalog.json');materialized=load('Fnpack-materialisiert.ocad')
  assert expected['sourceStepRemoved']and not(folder/'Original.step').exists();assert expected['sourceModelSha256']==record('fnpack-base.ocad')['sha256']
  assert len(base['nodes'])==7 and without_workspace(materialized)==without_workspace(base)
  packages=[]
  for name in ['Auswahl.fnpack','Eigenstaendig.fnpack','Beschaedigt.fnpack']:
   project,proof=read_pack(name);assert without_workspace(project)==without_workspace(base);assert project['workspace']['version']==5 and len(project['workspace']['loadSet'])==2;packages.append(proof)
  assert all(p['blocks']==expected['blocks']==6 for p in packages)
  assert record('Geschuetzte-Ausgabe.fnpack')['sha256']==expected['protectedOutputSha256']
  valid=(folder/'Beschaedigt.fnpack').read_bytes();corrupt=bytearray(valid);c=expected['corruption'];assert hashlib.sha256(valid).hexdigest()==c['validSha256']and valid[c['offset']]==c['originalByte'];corrupt[c['offset']]^=1;assert corrupt[c['offset']]==c['corruptedByte']and hashlib.sha256(corrupt).hexdigest()==c['corruptedSha256']
  assert without_workspace(read_pack('Eigenstaendig.fnpack')[0])==without_workspace(materialized)
  def determinant(m):return m[0]*(m[5]*m[10]-m[9]*m[6])-m[4]*(m[1]*m[10]-m[9]*m[2])+m[8]*(m[1]*m[6]-m[5]*m[2])
  def bounds(shape):
   b=shape.BoundBox;return [[b.XMin,b.YMin,b.ZMin],[b.XMax,b.YMax,b.ZMax]]
  native=[];roots=[]
  def read(node,source=False):
   if node['kind']=='cad':
    shape=Part.Shape();shape.importBrepFromString(node['brep']['data']);assert shape.isValid()and shape.isClosed()and len(shape.Solids)>0 and abs(shape.Volume-node['stats']['volume'])<1e-5
    native.append(dict(id=node['id'],source=source,valid=True,closed=True,volume=shape.Volume,solids=len(shape.Solids),sha256=hashlib.sha256(node['brep']['data'].encode()).hexdigest()))
    if not source:
     m=node['transform'];placed=shape.transformGeometry(App.Matrix(*[m[c*4+r]for r in range(4)for c in range(4)]));assert placed.isValid()and placed.isClosed();roots.append(dict(id=node['id'],volume=shape.Volume*abs(determinant(m)),bounds=bounds(placed)))
   for child in node.get('children',[]):read(child,True)
   for child in node.get('meshSource',{}).get('sources',[]):read(child,True)
  for node in base['nodes']:read(node)
  assert len(roots)==6 and abs(sum(r['volume']for r in roots)-2368)<1e-5
  step=Part.read(str(folder/'fnpack-full.step'));assert step.isValid()and step.isClosed()and len(step.Solids)==6 and abs(step.Volume-2368)<1e-5
  def stl_proof(file):
   raw=file.read_bytes();count=struct.unpack_from('<I',raw,80)[0]if len(raw)>=84 else -1
   if len(raw)==84+50*count:faces=[struct.unpack_from('<12fH',raw,84+i*50)[3:12]for i in range(count)]
   else:
    points=[[float(v)for v in text.split()]for text in re.findall(r'vertex\s+([^\r\n]+)',raw.decode('utf-8'))];assert len(points)%3==0;faces=[sum(points[i:i+3],[])for i in range(0,len(points),3)]
   edges={};parents={};signed=0.;points=[]
   def find(p):
    parents.setdefault(p,p)
    while parents[p]!=p:parents[p]=parents[parents[p]];p=parents[p]
    return p
   origin=faces[0][:3]
   for face in faces:
    ps=[tuple(face[i:i+3])for i in [0,3,6]];assert all(math.isfinite(x)for p in ps for x in p);points.extend(ps);a,b,c=[[p[k]-origin[k]for k in range(3)]for p in ps];signed+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6
    for a,b in zip(ps,ps[1:]+ps[:1]):edges.setdefault(tuple(sorted([a,b])),[]).append((a,b));parents[find(a)]=find(b)
   components=len({find(p)for p in parents});assert all(len(e)==2 and e[0]==e[1][::-1]for e in edges.values())and components==7 and abs(signed-2688)<2e-4
   return dict(closed=True,oriented=True,components=components,triangles=len(faces),volume=signed,bounds=[[min(p[k]for p in points)for k in range(3)],[max(p[k]for p in points)for k in range(3)]])
  stl=stl_proof(folder/'fnpack-full.stl')
  labels=[p['label']for p in expected['phases']];assert len(labels)>=20 and len(set(labels))==len(labels)
  open_phase=next(p for p in expected['phases']if p['label'].startswith('physical package reopen'));save_phase=next(p for p in expected['phases']if p['label'].startswith('normal Save'));assert sum(r['kind']=='geometry'for r in open_phase['reads'])==1 and not any(r['kind']=='geometry'for r in save_phase['reads'])and sum(r['kind']=='copy'for r in save_phase['reads'])==6
  library=load('Fnpack-Vorlage.oclibrary');assert library['format']=='FormnaroCADLibrary'and library['version']<=16 and len(library['items'])==1
  template=library['items'][0]['project'];template=json.loads(template)if isinstance(template,str)else template;assert len(template['nodes'])==1 and template['nodes'][0]==next(n for n in base['nodes']if n['name']=='Native 3')
  assert 'Formnaro-GeometryRef'not in json.dumps(library)and 'geometryIdentity'not in json.dumps(library)
  recovery=load('recovery-restart/recovery-materialized.ocad');assert without_workspace(recovery)==without_workspace(base)
  for name in ['recovery-restart/Daten/Paket-Autosicherung.fnpack','recovery-restart/Wiederhergestellt.fnpack']:
   project,proof=read_pack(name);assert without_workspace(project)==without_workspace(base)and len(project['workspace']['loadSet'])==2;packages.append(proof)
  recovery_events=load('recovery-restart/recovery-events.json');assert sum(e['kind']=='geometry'for e in recovery_events['startupReads'])==1 and not any(e['kind']=='copy'for e in recovery_events['startupReads'])
  restart_ui=load('recovery-restart/result.json');assert restart_ui['ok']and restart_ui['isolatedProfile']and len(restart_ui['checks'])==4 and not restart_ui['errors']and not restart_ui['external']
  recovery_step=Part.read(str(folder/'recovery-restart/recovery-full.step'));assert recovery_step.isValid()and recovery_step.isClosed()and len(recovery_step.Solids)==6 and abs(recovery_step.Volume-2368)<1e-5
  recovery_stl=stl_proof(folder/'recovery-restart/recovery-full.stl');assert recovery_stl==stl
  close_project,close_proof=read_pack('close-restart/Daten/Paket-Autosicherung.fnpack');close_base=json.loads(json.dumps(base));next(n for n in close_base['nodes']if n['id']=='step-original')['name']='Close checkpoint';assert without_workspace(close_project)==without_workspace(close_base);packages.append(close_proof)
  close_ui=load('close-restart/result.json');assert close_ui['ok']and close_ui['isolatedProfile']and len(close_ui['checks'])==3 and not close_ui['errors']and not close_ui['external'];close_events=load('close-restart/close-events.json');assert sum(e['kind']=='copy'for e in close_events)==6
  names=['fnpack-base.ocad','fnpack-final-catalog.json','fnpack-index.json','fnpack-expected.json','Auswahl.fnpack','Eigenstaendig.fnpack','Beschaedigt.fnpack','Geschuetzte-Ausgabe.fnpack','Fnpack-materialisiert.ocad','fnpack-full.step','fnpack-full.stl','Fnpack-Vorlage.oclibrary','recovery-restart/recovery-expected.json','recovery-restart/recovery-materialized.ocad','recovery-restart/Daten/Paket-Autosicherung.fnpack','recovery-restart/Wiederhergestellt.fnpack','recovery-restart/recovery-events.json','recovery-restart/result.json','recovery-restart/recovery-full.step','recovery-restart/recovery-full.stl','close-restart/Daten/Paket-Autosicherung.fnpack','close-restart/result.json','close-restart/close-events.json','close-restart/close-expected-catalog.json']
  report=dict(ok=True,engine='FreeCAD '+'.'.join(App.Version()[:3]),occt=Part.OCC_VERSION,projectVersion=17,workspaceVersion=5,roots=7,nativeRoots=6,loadedRoots=2,sourceStepRemoved=True,allSourceBodiesPreserved=True,unloadedSaveVerified=True,rangeReadsVerified=True,corruptedExportAborted=True,failedSaveProtected=True,independentRecoveryVerified=True,nativeCloseFlushVerified=True,libraryIndependent=True,packages=packages,nativeBodies=native,step=dict(valid=True,closed=True,solids=len(step.Solids),volume=step.Volume,bounds=bounds(step)),stl=stl,files=[record(n)for n in names]);(folder/'independent-fnpack.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
 except Exception:
  import traceback
  (folder/'independent-fnpack-error.txt').write_text(traceback.format_exc(),encoding='utf-8');raise
else:
 import argparse,subprocess
 parser=argparse.ArgumentParser();parser.add_argument('directory');parser.add_argument('--freecad',required=True);args=parser.parse_args();folder=pathlib.Path(args.directory).resolve();profile=folder/'independent-fnpack-profile';report=folder/'independent-fnpack.json'
 if report.exists():raise SystemExit('Use a fresh package acceptance directory')
 for name in ['user','data','temp']:(profile/name).mkdir(parents=True,exist_ok=False)
 env={**os.environ,'FORMNARO_FNPACK_PROOF':str(folder),'FREECAD_USER_HOME':str(profile/'user'),'FREECAD_USER_DATA':str(profile/'data'),'FREECAD_USER_TEMP':str(profile/'temp'),'PYTHONDONTWRITEBYTECODE':'1'}
 run=subprocess.run([str(pathlib.Path(args.freecad).resolve()),'--user-cfg',str(profile/'user.cfg'),'--system-cfg',str(profile/'system.cfg'),str(pathlib.Path(__file__).resolve())],env=env,cwd=profile,capture_output=True,timeout=180,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt'else 0);(folder/'independent-fnpack.log').write_bytes(run.stdout+run.stderr)
 if run.returncode or not report.exists():raise SystemExit('Independent package verification failed; inspect '+str(folder))
 result=json.loads(report.read_text(encoding='utf-8'));assert result['ok'];print(json.dumps(result))
