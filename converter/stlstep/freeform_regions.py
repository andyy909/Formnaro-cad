"""Connected graph B-spline patches with observed junction constraints.

Each patch is a single-valued height graph with an exact positive Jacobian
along its frame normal. This establishes local orientation, not a global
deviation or self-intersection certificate. The complete CAD/STEP gates apply.
"""
from collections import defaultdict
from dataclasses import replace
import math

import numpy as np
from scipy.linalg import null_space

from .local_regions import _basis, _boundary_edges, _shared_chains, _cancel


def bernstein(values, degree):
    values=np.asarray(values,dtype=float)
    return np.column_stack([math.comb(degree,i)*values**i*(1-values)**(degree-i) for i in range(degree+1)])


def graph_values(model,points,gradient=False):
    points=np.atleast_2d(points)
    local=points-model['origin']
    x,y=np.asarray(model['basis_x']),np.asarray(model['basis_y'])
    bounds=np.asarray(model['xy_bounds'])
    span=bounds[1]-bounds[0]
    uv=(np.column_stack((local@x,local@y))-bounds[0])/span
    controls=np.asarray(model['height_controls'])
    degree=len(controls)-1
    bu,bv=bernstein(uv[:,0],degree),bernstein(uv[:,1],degree)
    height=np.einsum('ni,ij,nj->n',bu,controls,bv)
    if not gradient:return height
    du=np.einsum('ni,ij,nj->n',bernstein(uv[:,0],degree-1),degree*np.diff(controls,axis=0)/span[0],bv)
    dv=np.einsum('ni,ij,nj->n',bu,degree*np.diff(controls,axis=1)/span[1],bernstein(uv[:,1],degree-1))
    return height,du,dv


def graph_distance(model,points):
    points=np.atleast_2d(points)
    height,du,dv=graph_values(model,points,True)
    return ((points-model['origin'])@model['normal']-height)/np.sqrt(1+du*du+dv*dv)


def graph_normal(model,point):
    _,du,dv=graph_values(model,point,True)
    return np.asarray(model['normal'])-du[0]*np.asarray(model['basis_x'])-dv[0]*np.asarray(model['basis_y'])


def graph_surface(model):
    from OCP.Geom import Geom_BSplineSurface
    from OCP.TColgp import TColgp_Array2OfPnt
    from OCP.TColStd import TColStd_Array1OfReal,TColStd_Array1OfInteger
    from OCP.gp import gp_Pnt
    heights=np.asarray(model['height_controls']);degree=len(heights)-1
    bounds=np.asarray(model['xy_bounds']);origin=np.asarray(model['origin'])
    x,y,n=map(np.asarray,(model['basis_x'],model['basis_y'],model['normal']))
    poles=TColgp_Array2OfPnt(1,degree+1,1,degree+1)
    for i in range(degree+1):
        for j in range(degree+1):
            a=bounds[0,0]+(bounds[1,0]-bounds[0,0])*i/degree
            b=bounds[0,1]+(bounds[1,1]-bounds[0,1])*j/degree
            poles.SetValue(i+1,j+1,gp_Pnt(*(origin+x*a+y*b+n*heights[i,j])))
    knots=TColStd_Array1OfReal(1,2);knots.SetValue(1,0.);knots.SetValue(2,1.)
    multiplicities=TColStd_Array1OfInteger(1,2)
    multiplicities.SetValue(1,degree+1);multiplicities.SetValue(2,degree+1)
    return Geom_BSplineSurface(poles,knots,knots,multiplicities,multiplicities,degree,degree,False,False)


def _graph_groups(mesh,exclude):
    normals=np.asarray(mesh.face_normals)
    directions=np.argmax(abs(normals),axis=1)*2+(normals[np.arange(len(normals)),np.argmax(abs(normals),axis=1)]<0)
    parent=np.arange(len(mesh.faces))
    def root(i):
        while parent[i]!=i:
            parent[i]=parent[parent[i]];i=parent[i]
        return i
    for a,b in mesh.face_adjacency:
        if a in exclude or b in exclude:continue
        if directions[a]==directions[b] and np.dot(normals[a],normals[b])>math.cos(math.radians(35)):
            parent[root(b)]=root(a)
    groups=defaultdict(list)
    for face in range(len(mesh.faces)):
        if face not in exclude:groups[root(face)].append(face)
    return [(faces,np.eye(3)[int(directions[faces[0]])//2]*(-1 if directions[faces[0]]%2 else 1))
            for faces in groups.values()]


def fit_graph(mesh,faces,normal,tolerance,numeric,anchors=(),cancel_event=None):
    from shapely.geometry import Polygon
    from shapely.ops import unary_union
    vertex_ids=np.unique(mesh.faces[faces]);points=mesh.vertices[vertex_ids]
    origin=points.mean(axis=0);x,y=_basis(normal)
    local=points-origin;xy=np.column_stack((local@x,local@y))
    lower,upper=xy.min(axis=0),xy.max(axis=0);span=upper-lower
    if np.min(span)<numeric*20:raise ValueError('Freiformbereich hat keine stabile zweidimensionale Parametrisierung')
    projected=mesh.triangles[faces]-origin
    projected=np.stack((projected@x,projected@y),axis=2)
    polygons=[Polygon(triangle) for triangle in projected]
    total=sum(p.area for p in polygons);union=unary_union(polygons)
    if abs(total-union.area)>max(numeric*mesh.scale,total*1e-8):
        raise ValueError('Freiformprojektion überlappt sich; keine eindeutige Graphparametrisierung')
    # Margin keeps trim intersections away from the natural B-spline boundary.
    bounds=np.vstack((lower-span*.08,upper+span*.08));span=bounds[1]-bounds[0]
    triangles=mesh.triangles[faces]
    probes=np.vstack((points,triangles.mean(axis=1),((triangles+np.roll(triangles,1,axis=1))/2).reshape(-1,3)))
    uv=(np.column_stack(((probes-origin)@x,(probes-origin)@y))-bounds[0])/span
    heights=(probes-origin)@normal
    selected=sorted(set(map(int,anchors))&set(map(int,vertex_ids)))
    anchor_points=mesh.vertices[selected]
    anchor_uv=(np.column_stack(((anchor_points-origin)@x,(anchor_points-origin)@y))-bounds[0])/span
    anchor_height=(anchor_points-origin)@normal
    for degree in (2,3,4,5,6,7):
        _cancel(cancel_event)
        matrix=np.einsum('ni,nj->nij',bernstein(uv[:,0],degree),bernstein(uv[:,1],degree)).reshape(len(uv),-1)
        constraints=np.einsum('ni,nj->nij',bernstein(anchor_uv[:,0],degree),bernstein(anchor_uv[:,1],degree)).reshape(len(selected),(degree+1)**2)
        if len(selected):
            base=np.linalg.lstsq(constraints,anchor_height,rcond=1e-11)[0]
            if np.max(abs(constraints@base-anchor_height))>numeric*.1:continue
            null=null_space(constraints,rcond=1e-11)
        else:base=np.zeros((degree+1)**2);null=np.eye((degree+1)**2)
        if null.shape[1]:
            # A small coefficient penalty controls unconstrained extrapolation.
            a=matrix@null;rhs=heights-matrix@base
            parameters=np.linalg.lstsq(np.vstack((a,np.eye(a.shape[1])*1e-7)),np.r_[rhs,np.zeros(a.shape[1])],rcond=1e-11)[0]
            controls=base+null@parameters
        else:controls=base
        error=float(np.max(abs(matrix@controls-heights)))
        if error>tolerance*.08:continue
        model=dict(type='GRAPH',faces=list(map(int,faces)),origin=origin.tolist(),normal=normal.tolist(),
                   basis_x=x.tolist(),basis_y=y.tolist(),xy_bounds=bounds.tolist(),
                   height_controls=controls.reshape(degree+1,degree+1).tolist(),degree=degree,
                   fit_probe_max_mm=error,anchor_vertices=selected,projection_area_mm2=float(union.area),
                   local_orientation='positive_graph_jacobian_along_frame_normal')
        predicted=np.array([graph_normal(model,p) for p in mesh.triangles_center[faces]])
        predicted/=np.linalg.norm(predicted,axis=1)[:,None]
        if np.min(np.einsum('ij,ij->i',predicted,mesh.face_normals[faces]))<math.cos(math.radians(30)):
            continue
        return model
    raise ValueError('Zusammenhängender B-Spline-Fit überschreitet sein lokales Budget')


def graph_analysis(mesh,analysis,tolerance,cancel_event=None):
    from .edited_regions import _fit_plane
    retained=[r for r in analysis.regions if r['type'] in ('CYLINDER','CONE','REVOLUTION')]
    exclude={face for region in retained for face in region['faces']}
    groups=_graph_groups(mesh,exclude)
    ownership=np.empty(len(mesh.faces),dtype=int)
    for index,(faces,_) in enumerate(groups):ownership[faces]=index
    for index,region in enumerate(retained,len(groups)):ownership[region['faces']]=index
    chains=_shared_chains(mesh,ownership)
    anchors={node for chain in chains for node in (chain['nodes'][0],chain['nodes'][-1])}
    new=[];replaced=set()
    for faces,normal in groups:
        _cancel(cancel_event)
        try:
            plane=_fit_plane(mesh,faces,analysis.numeric_mm)
        except ValueError:
            plane=None
        if plane is not None:
            continue
        if len(faces)<6:
            continue
        try:
            patch=fit_graph(mesh,faces,normal,tolerance,analysis.numeric_mm,anchors,cancel_event)
        except ValueError:
            _cancel(cancel_event)
            continue  # Unfitted neighbours retain their measured analytic/facet regions.
        patch.update(reconstructible=True,reason='Zusammenhängender Graph-Fit; native Rand-/STEP-Prüfung folgt')
        new.append(patch);replaced.update(faces)
    if not new:return None
    regions=[dict(region,faces=[f for f in region['faces'] if f not in replaced])
             for region in analysis.regions if any(f not in replaced for f in region['faces'])]+new
    assignments=np.empty(len(mesh.faces),dtype=int)
    for i,region in enumerate(regions):
        region['id']=i;assignments[region['faces']]=i
    adjacent=mesh.face_adjacency
    boundary=mesh.face_adjacency_edges[assignments[adjacent[:,0]]!=assignments[adjacent[:,1]]]
    return replace(analysis,regions=regions,face_regions=assignments,boundary_edges=boundary)


def large_graph_shape(mesh,tolerance,progress=None,*,cancel_event=None):
    from .advanced_regions import analyse_advanced_regions,advanced_region_shape
    analysis=analyse_advanced_regions(mesh,tolerance,cancel_event)
    fitted=graph_analysis(mesh,analysis,tolerance,cancel_event)
    if fitted is None:return None
    shape,details=advanced_region_shape(mesh,tolerance,progress,analysis=fitted,cancel_event=cancel_event)
    details.update(kind='connected_graph_BSpline_patches',graph_patches=sum(r['type']=='GRAPH' for r in fitted.regions),
                   graph_regions=[r for r in fitted.regions if r['type']=='GRAPH'])
    return shape,details
