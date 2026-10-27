"""Read the actual exported STL and saved project independently of Formnaro."""
import pathlib, sys, json, struct, re, math
folder = pathlib.Path(sys.argv[1])
receipt = json.loads((folder / 'result.json').read_text(encoding='utf8'))
project = json.loads((folder / 'Gemischt.ocad').read_text(encoding='utf8'))
source = next(n for n in project['nodes'] if n['id'] == receipt['sourceId'])
raw = (folder / 'exports' / 'Platzierung.stl').read_bytes()
if len(raw) >= 84 and len(raw) == 84 + 50 * struct.unpack_from('<I', raw, 80)[0]:
    tris = [[struct.unpack_from('<fff',raw,84+50*i+12+12*k) for k in range(3)] for i in range(struct.unpack_from('<I',raw,80)[0])]
else:
    points = [tuple(map(float,p)) for p in re.findall(r'vertex\s+(\S+)\s+(\S+)\s+(\S+)',raw.decode('ascii'))]
    tris = [points[i:i+3] for i in range(0,len(points),3)]
assert len(tris) == 4
points = {p for t in tris for p in t}
assert len(points) == 4 and all(math.isfinite(v) for p in points for v in p)
bounds = [[min(p[k] for p in points) for k in range(3)],[max(p[k] for p in points) for k in range(3)]]
expected = [[-20,-9,0],[20,9,70]]
assert max(abs(x-y) for a,b in zip(bounds,expected) for x,y in zip(a,b)) < 1e-5
verts = source['mesh']['verts']; matrix = source['transform']
assert min(verts[::3]) == 1800 and min(verts[1::3]) == -720 and min(verts[2::3]) == -350
placed = {tuple(sum(matrix[k*4+r]*verts[i+k] for k in range(3))+matrix[12+r] for r in range(3)) for i in range(0,len(verts),3)}
assert len(placed) == len(points) and all(min(math.dist(p,q) for q in points)<1e-5 for p in placed)
edges = {}
for t in tris:
    for i in range(3):
        a,b=t[i],t[(i+1)%3];edges.setdefault(tuple(sorted((a,b))),[]).append((a,b))
assert len(edges)==6 and all(len(v)==2 and v[0]==tuple(reversed(v[1])) for v in edges.values())
def triple(a,b,c): return a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0])
volume=sum(triple(*t)/6 for t in tris)
assert abs(volume-8400)<1e-5
result={'ok':True,'triangles':4,'points':4,'closedOrientedEdges':6,'volume':volume,'bounds':bounds,'originalFilePointsRetained':True,'savedPoseMatchesExport':True}
(folder/'independent-exports.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print(json.dumps(result))
