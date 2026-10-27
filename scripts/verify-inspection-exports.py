"""Independent STL topology/volume and saved-source checks; standard library only."""
import sys, json, math, re, struct, collections, pathlib

folder = pathlib.Path(sys.argv[1])
project = json.loads((folder / 'Inspektion.ocad').read_text(encoding='utf8'))
raw = (folder / 'Inspektion.stl').read_bytes()
if len(raw) >= 84 and len(raw) == 84 + 50 * struct.unpack_from('<I', raw, 80)[0]:
    triangles = [[struct.unpack_from('<fff', raw, 84 + 50*i + 12 + 12*k) for k in range(3)] for i in range(struct.unpack_from('<I',raw,80)[0])]
else:
    vertices = [tuple(map(float,m)) for m in re.findall(r'vertex\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)', raw.decode('ascii'))]
    assert len(vertices) % 3 == 0
    triangles = [vertices[i:i+3] for i in range(0,len(vertices),3)]
assert triangles
def sub(a,b): return tuple(x-y for x,y in zip(a,b))
def cross(a,b): return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def dot(a,b): return sum(x*y for x,y in zip(a,b))
def volume(tris): return sum(dot(a,cross(b,c))/6 for a,b,c in tris)
def place(m,p): return tuple(sum(m[k*4+r]*p[k] for k in range(3))+m[12+r] for r in range(3))
edges=collections.defaultdict(list); ids={}; parent=list(range(len(triangles)))
def find(i):
    while parent[i]!=i: parent[i]=parent[parent[i]];i=parent[i]
    return i
for f,tri in enumerate(triangles):
    assert all(math.isfinite(x) for p in tri for x in p)
    vertices=[ids.setdefault(tuple(p),len(ids)) for p in tri]
    assert len(set(vertices))==3
    for k in range(3):
        a,b=vertices[k],vertices[(k+1)%3];edges[tuple(sorted((a,b)))].append((f,a,b))
for pair in edges.values():
    assert len(pair)==2 and pair[0][1:]==tuple(reversed(pair[1][1:])), pair
    parent[find(pair[0][0])]=find(pair[1][0])
components=collections.defaultdict(list)
for i,t in enumerate(triangles):components[find(i)].append(t)
assert len(components)==3
component_volumes=sorted(volume(v) for v in components.values())
assert all(v>0 for v in component_volumes)
native=[n for n in project['nodes'] if n['kind']=='cad']; mesh=[n for n in project['nodes'] if n['kind']=='mesh']
assert len(native)==2 and len(mesh)==1
assert project['workspace']['section']['ids'] and len(project['workspace']['section']['ids'])==3
source=mesh[0];m=source['transform'];verts=[place(m,source['mesh']['verts'][i:i+3]) for i in range(0,len(source['mesh']['verts']),3)];indices=source['mesh']['triangles'];mesh_triangles=[[verts[i] for i in indices[j:j+3]] for j in range(0,len(indices),3)]
source_volume=abs(volume(mesh_triangles));assert abs(component_volumes[0]-source_volume)<1e-4
expected=source_volume+sum(n['stats']['volume'] for n in native)
surface=sum(math.sqrt(dot(cross(sub(b,a),sub(c,a)),cross(sub(b,a),sub(c,a))))/2 for a,b,c in triangles)
actual=sum(component_volumes)
assert abs(actual-expected)<surface*.011  # requested CAD export deflection 0.01 mm
for n in native:
    b=n['stats']['bounds'];verts.extend(place(n['transform'],[b['max'][k] if i&(1<<k) else b['min'][k] for k in range(3)]) for i in range(8))
actual_bounds=[[min(p[k] for tri in triangles for p in tri) for k in range(3)],[max(p[k] for tri in triangles for p in tri) for k in range(3)]]
expected_bounds=[[min(p[k] for p in verts) for k in range(3)],[max(p[k] for p in verts) for k in range(3)]]
assert max(abs(a-b) for row1,row2 in zip(actual_bounds,expected_bounds) for a,b in zip(row1,row2))<.011
result={'ok':True,'triangles':len(triangles),'points':len(ids),'closedOrientedEdges':len(edges),'components':len(components),'componentVolumes':component_volumes,'volume':actual,'nativeExactPlusMeshVolume':expected,'exportDeflection':.01,'bounds':actual_bounds,'savedSourceTriangles':len(mesh_triangles),'savedSectionIsViewOnly':True}
(folder/'independent-exports.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print(json.dumps(result))
