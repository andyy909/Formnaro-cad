"""Independent mesh evidence; never promotes finite samples to a global proof."""
import argparse
import json
from pathlib import Path
import sys
import numpy as np
import trimesh

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--source',required=True);parser.add_argument('--candidate',required=True)
    parser.add_argument('--output',required=True);parser.add_argument('--dependencies')
    args=parser.parse_args()
    if args.dependencies:sys.path.insert(0,args.dependencies)
    source=trimesh.load_mesh(args.source,process=True)
    data=json.loads(Path(args.candidate).read_text(encoding='utf-8'))
    target=trimesh.Trimesh(vertices=np.array(data['vertices']).reshape(-1,3),faces=np.array(data['triangles']).reshape(-1,3),process=True)
    directions=[]
    for name,a,b in [('STL-to-CAD-mesh',source,target),('CAD-mesh-to-STL',target,source)]:
        np.random.seed(20261012)
        vertices=a.vertices if len(a.vertices)<=15000 else a.vertices[np.linspace(0,len(a.vertices)-1,15000,dtype=int)]
        centroids=a.triangles_center if len(a.faces)<=15000 else a.triangles_center[np.linspace(0,len(a.faces)-1,15000,dtype=int)]
        samples=np.vstack([vertices,centroids,a.sample(5000)])
        distances=np.concatenate([trimesh.proximity.closest_point(b,batch)[1] for batch in np.array_split(samples,max(1,int(np.ceil(len(samples)/128))))])
        directions.append(dict(direction=name,samples=len(samples),max=float(distances.max()),p95=float(np.percentile(distances,95)),p99=float(np.percentile(distances,99))))
    report=dict(method='independent-vertices-centroids-seeded-surface-samples',globalProof=False,
                source=dict(faces=len(source.faces),watertight=source.is_watertight,euler=int(source.euler_number),volume=float(source.volume),bounds=source.bounds.tolist()),
                candidate=dict(faces=len(target.faces),watertight=target.is_watertight,euler=int(target.euler_number),volume=float(target.volume),bounds=target.bounds.tolist()),directions=directions)
    report['passed']=bool(target.is_watertight and source.euler_number==target.euler_number and max(d['max'] for d in directions)<=.25 and abs(target.volume/source.volume-1)<=.01)
    Path(args.output).write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps({k:report[k] for k in ['passed','directions']}),flush=True)
    if not report['passed']:raise SystemExit(1)

if __name__=='__main__':main()
