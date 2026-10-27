"""Independent reader for actual curved-reduction STL exports and retained sources."""
import argparse, json, math, pathlib, re, struct
p=argparse.ArgumentParser(description=__doc__);p.add_argument('directory');args=p.parse_args();folder=pathlib.Path(args.directory)
def read_stl(file):
 data=file.read_bytes();count=struct.unpack_from('<I',data,80)[0] if len(data)>=84 else -1
 if len(data)==84+50*count:faces=[struct.unpack_from('<12fH',data,84+i*50)[3:12] for i in range(count)]
 else:
  points=[[float(v) for v in row.split()] for row in re.findall(r'vertex\s+([^\r\n]+)',data.decode('utf-8'))];assert len(points)%3==0
  faces=[sum(points[i:i+3],[]) for i in range(0,len(points),3)]
 assert faces;origin=faces[0][:3];edges={};parents={};volume=0;keys=set()
 def find(p):
  parents.setdefault(p,p)
  while parents[p]!=p:parents[p]=parents[parents[p]];p=parents[p]
  return p
 for row in faces:
  ps=[tuple(row[i:i+3]) for i in [0,3,6]];assert all(math.isfinite(v) for p in ps for v in p)
  keys.add(tuple(sorted(ps)))
  a,b,c=[tuple(p[k]-origin[k] for k in range(3)) for p in ps];u=tuple(b[k]-a[k] for k in range(3));v=tuple(c[k]-a[k] for k in range(3));normal=(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]);assert sum(v*v for v in normal)>0
  volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6
  for a,b in zip(ps,ps[1:]+ps[:1]):edges.setdefault(tuple(sorted([a,b])),[]).append((a,b));parents[find(a)]=find(b)
 assert all(len(uses)==2 and uses[0]==uses[1][::-1] for uses in edges.values()),'STL boundary/orientation'
 components=len({find(p) for p in parents});assert components==1 and volume>0
 return dict(triangles=len(faces),volume=volume,components=components,closed=True,oriented=True),keys
before,bkeys=read_stl(folder/'curved-before.stl');after,akeys=read_stl(folder/'curved-after.stl');change=abs(after['volume']-before['volume'])/before['volume'];assert change<=.01;assert after['triangles']<before['triangles']
project=json.loads((folder/'curved-result.ocad').read_text(encoding='utf-8'));assert project['version']==10
node=next(n for n in project['nodes'] if n['id']=='curved-sphere');source=node['meshSource']['sources'][0];assert node['meshSource']['operation']['options']['method']=='curved-v1'
report=json.loads((folder/'curved-expected.json').read_text(encoding='utf-8'));assert abs(report['volumeBefore']-before['volume'])<1e-3 and abs(report['volumeAfter']-after['volume'])<1e-3
assert report['beforeTriangles']==before['triangles'] and report['afterTriangles']==after['triangles']
def face(n,id):return [n['mesh']['verts'][v*3:v*3+3] for v in n['mesh']['triangles'][id*3:id*3+3]]
for old,new in zip(source['metadata']['meshProtection']['regions'][0]['triangleIds'],node['metadata']['meshProtection']['regions'][0]['triangleIds']):
 assert face(source,old)==face(node,new),'protected source coordinates changed'
 key=tuple(sorted(tuple(struct.unpack('<f',struct.pack('<f',x))[0] for x in p) for p in face(node,new)));assert key in bkeys and key in akeys,'protected surface missing in real export'
result=dict(ok=True,before=before,after=after,volumePercentChange=change*100,projectVersion=10,protectedFaces=20,sourcePreserved=True,limits='Independent incidence, orientation, component, volume and protected-coordinate checks. No global self-intersection or Hausdorff proof.')
(folder/'independent-curved.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result))
