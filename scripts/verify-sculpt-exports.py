"""Independent standard-library reader for the synthetic brush release exports."""
import sys,json,struct,math,zipfile,hashlib
from pathlib import Path
from collections import defaultdict,Counter

def world(node):
    m=node['transform'];v=node['mesh']['verts']
    return [tuple(sum(m[k+4*j]*v[i+j] for j in range(3))+m[k+12] for k in range(3)) for i in range(0,len(v),3)]
def signed_volume(faces):
    origin=faces[0][0];volume=0
    for f in faces:
        a,b,c=[tuple(p[k]-origin[k] for k in range(3)) for p in f]
        volume+=sum(a[k]*(b[(k+1)%3]*c[(k+2)%3]-b[(k+2)%3]*c[(k+1)%3]) for k in range(3))/6
    return volume
def stl(path):
    data=path.read_bytes()
    n=struct.unpack_from('<I',data,80)[0] if len(data)>=84 else 0
    if len(data)==84+n*50:
        return [tuple(tuple(struct.unpack_from('<3f',data,84+i*50+12+j*12)) for j in range(3)) for i in range(n)]
    v=[tuple(map(float,line.split()[1:])) for line in data.decode('ascii').splitlines() if line.strip().startswith('vertex ')]
    assert len(v)%3==0 and v
    return [tuple(v[i:i+3]) for i in range(0,len(v),3)]
def verify(directory):
    root=Path(directory);expected=json.loads((root/'expected.json').read_text(encoding='utf-8'))
    source,node=expected['source'],expected['result'];project=json.loads((root/'Pinselplatte.ocad').read_text(encoding='utf-8'))
    assert next(n for n in project['nodes'] if n['id']==node['id'])==node
    assert node['meshSource']['sources'][0]==source and node['meshSource']['operation']['type']=='sculpt'
    regions=source.get('metadata',{}).get('meshProtection',{}).get('regions',[])
    for region in regions:
        for f in region['triangleIds']:
            for v in source['mesh']['triangles'][3*f:3*f+3]:
                assert node['mesh']['verts'][3*v:3*v+3]==source['mesh']['verts'][3*v:3*v+3]
    file=root/'exports/Pinsel-Pruefprojekt.stl';faces=stl(file)
    assert len(faces)==len(node['mesh']['triangles'])//3
    edges=Counter();directed=Counter();vertices=set();neighbors=defaultdict(set)
    for f in faces:
        assert len(f)==3 and all(len(p)==3 and all(math.isfinite(v) for v in p) for p in f)
        a,b,c=f;u=[b[k]-a[k] for k in range(3)];v=[c[k]-a[k] for k in range(3)]
        assert sum((u[(k+1)%3]*v[(k+2)%3]-u[(k+2)%3]*v[(k+1)%3])**2 for k in range(3))>0
        vertices.update(f)
        for a,b in zip(f,f[1:]+f[:1]):
            key=tuple(sorted((a,b)));edges[key]+=1;directed[key]+=1 if a<b else -1;neighbors[a].add(b);neighbors[b].add(a)
    assert set(edges.values())=={2} and set(directed.values())=={0}
    reached=set();todo=[next(iter(vertices))]
    while todo:
        p=todo.pop()
        if p not in reached: reached.add(p);todo.extend(neighbors[p]-reached)
    assert reached==vertices
    ideal=world(node);indices=node['mesh']['triangles'];ideal_faces=[tuple(ideal[v] for v in indices[i:i+3]) for i in range(0,len(indices),3)]
    maximum=max(min(math.dist(p,q) for q in ideal) for p in vertices)
    assert maximum<2e-5,maximum
    volume=signed_volume(faces);expected_volume=signed_volume(ideal_faces)
    assert volume>0 and abs(volume-expected_volume)<max(1e-6,abs(expected_volume)*1e-6)
    with zipfile.ZipFile(root/'exports/Pinsel-Pruefprojekt.zip') as archive:
        assert archive.testzip() is None
        text=archive.read('model.obj').decode('utf-8');obj=[tuple(map(float,line.split()[1:4])) for line in text.splitlines() if line.startswith('v ')]
        assert obj and max(min(math.dist(p,q) for q in ideal) for p in obj)<2e-5
    result={'ok':True,'triangles':len(faces),'vertices':len(vertices),'closedOrientedComponents':1,'volume':volume,'expectedVolume':expected_volume,'maximumExportVertexError':maximum,'protectedRegionsExact':len(regions),'originalSourceExact':True,'stlSha256':hashlib.sha256(file.read_bytes()).hexdigest()}
    (root/'independent.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(result))
if __name__=='__main__': verify(sys.argv[1])
