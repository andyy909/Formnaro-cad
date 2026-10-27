import json,os,sys,subprocess,uuid,math
from pathlib import Path
root=Path(__file__).resolve().parents[1]
if os.environ.get('FORMNARO_ASSISTANCE_READER'):
 import FreeCAD as App,Part
 directory=Path(os.environ['FORMNARO_ASSISTANCE_READER']);p=json.loads((directory/'python-assistance.ocad').read_text(encoding='utf8'));leaves=[];sources=[]
 identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
 def mm(a,b):return [sum(a[k*4+r]*b[c*4+k]for k in range(4))for c in range(4)for r in range(4)]
 def point(m,p):return [m[12+k]+sum(m[j*4+k]*p[j]for j in range(3))for k in range(3)]
 def visit(n,parent):
  matrix=mm(parent,n['transform']);s=Part.Shape();s.importBrepFromString(n['brep']['data']);assert s.isValid() and s.isClosed();sources.append(n['id'])
  if not n.get('children'):
   bb=s.BoundBox;center=point(matrix,[(bb.XMin+bb.XMax)/2,(bb.YMin+bb.YMax)/2,(bb.ZMin+bb.ZMax)/2]);corners=[point(matrix,[x,y,z])for x in [bb.XMin,bb.XMax]for y in [bb.YMin,bb.YMax]for z in [bb.ZMin,bb.ZMax]];size=[max(p[k]for p in corners)-min(p[k]for p in corners)for k in range(3)];leaves.append({'solid':n['solid'],'type':n['recipe']['type'],'center':center,'size':size})
  for c in n.get('children',[]):visit(c,matrix)
 assert len(p['nodes'])==1;visit(p['nodes'][0],identity);assert len(sources)==6 and len(leaves)==4
 expected=[(True,'box',[30,20,3],[60,40,6]),(True,'box',[30,3,18],[60,6,24]),(True,'box',[30,37,18],[60,6,24]),(False,'cylinder',[30,20,18],[10,43,10])]
 for solid,kind,center,size in expected:assert any(n['solid']==solid and n['type']==kind and max(abs(a-b)for a,b in zip(n['center'],center))<1e-5 and max(abs(a-b)for a,b in zip(n['size'],size))<1e-5 for n in leaves)
 raw=Part.read(str(directory/'python-assistance.step'));body=raw.Solids[0].fuse(raw.Solids[1:]).removeSplitter() if len(raw.Solids)>1 else raw;assert body.isValid() and body.isClosed() and len(body.Solids)==1
 vv=[]
 for tol in [.001,.0005]:
  vertices,triangles=body.tessellate(tol);vv.append(sum(vertices[i].dot(vertices[j].cross(vertices[k]))/6 for i,j,k in triangles))
 expected_volume=31680-300*math.pi;assert abs(vv[-1]-vv[-2])<.02 and abs(vv[-1]-expected_volume)<.05
 bb=body.BoundBox;bounds=[bb.XMin,bb.YMin,bb.ZMin,bb.XMax,bb.YMax,bb.ZMax];assert max(abs(a-b)for a,b in zip(bounds,[0,0,0,60,40,30]))<1e-5
 (directory/'independent-assistance.json').write_text(json.dumps({'ok':True,'reader':'FreeCAD '+'.'.join(App.Version()[:3]),'occt':Part.OCC_VERSION,'sources':len(sources),'leaves':leaves,'valid':True,'closed':True,'solids':1,'expectedVolume':expected_volume,'rawStepVolume':body.Volume,'denseStepVolumes':vv,'deflections':[.001,.0005],'bounds':bounds},indent=2),encoding='utf8')
else:
 directory=Path(sys.argv[1]).resolve();profile=root/'work/ai-simple-model-eval'/('assistance-reader-'+uuid.uuid4().hex)
 for x in ['user','data','temp']:(profile/x).mkdir(parents=True)
 env=dict(os.environ,FORMNARO_ASSISTANCE_READER=str(directory),FREECAD_USER_HOME=str(profile/'user'),FREECAD_USER_DATA=str(profile/'data'),FREECAD_USER_TEMP=str(profile/'temp'),PYTHONDONTWRITEBYTECODE='1')
 exe=root/'work/cad-independent-step/freecad/FreeCAD_1.1.4-Windows-x86_64-py311/bin/FreeCADCmd.exe';run=subprocess.run([str(exe),'--user-cfg',str(profile/'user.cfg'),'--system-cfg',str(profile/'system.cfg'),str(Path(__file__).resolve())],env=env,cwd=directory,capture_output=True,timeout=180,creationflags=subprocess.CREATE_NO_WINDOW);(profile/'reader.log').write_bytes(run.stdout+run.stderr);assert run.returncode==0 and (directory/'independent-assistance.json').exists(),(run.stdout+run.stderr).decode(errors='replace');print((directory/'independent-assistance.json').read_text())
