"""Analytic regions with shared intersections, including cones and oblique trims.

Curved regions retain observed boundaries. Vertices are solved jointly against
their incident surfaces; curve branches must match the complete source chain.
No geometric sewing is used. The engine still checks the complete candidate.
"""
from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import replace
import math

import numpy as np
from scipy.optimize import least_squares

from .local_regions import (analyse_regions, _basis, _boundary_edges,
                            _shared_chains, _cancel, MAX_FACES)


def _neighbours(mesh, plane_ids):
    result = defaultdict(set)
    for a, b in mesh.face_adjacency:
        a, b = int(plane_ids[a]), int(plane_ids[b])
        if a != b:
            result[a].add(b)
            result[b].add(a)
    return result


def _tangent_cylinders(mesh, analysis, cancel_event=None):
    """Fit cylinders jointly with observed tangent planes, not nominal radii."""
    owners=defaultdict(list)
    for i,face in enumerate(mesh.faces):
        for a,b in zip(face,np.roll(face,-1)):owners[tuple(sorted((int(a),int(b))))].append(i)
    regions=[];numeric=analysis.numeric_mm
    for source in analysis.regions:
        _cancel(cancel_event)
        if source['type']!='CYLINDER':regions.append(source);continue
        model=dict(source);axis=np.asarray(model['axis']);origin=np.asarray(model['origin']);x,y=_basis(axis)
        ids=set(model['faces']);constraints={}
        for a,b in _boundary_edges(mesh,model['faces']):
            neighbours=[i for i in owners[tuple(sorted((int(a),int(b))))] if i not in ids]
            if len(neighbours)!=1:continue
            plane_id=int(analysis.plane_ids[neighbours[0]]);plane=analysis.planes[plane_id];n=plane['normal']
            if abs(np.dot(n,axis))>1e-6:continue
            p=(mesh.vertices[a]+mesh.vertices[b])/2-origin;p-=np.dot(p,axis)*axis
            if np.linalg.norm(p)<numeric:continue
            dot=float(np.dot(n,p/np.linalg.norm(p)))
            if abs(dot)<1-1e-8:continue
            constraints[plane_id]=([np.dot(n,x),np.dot(n,y),math.copysign(1,dot)],np.dot(n,plane['centre']-origin))
        if constraints:
            matrix=np.asarray([v[0] for v in constraints.values()]);rhs=np.asarray([v[1] for v in constraints.values()])
            base=np.linalg.lstsq(matrix,rhs,rcond=None)[0]
            _,singular,vt=np.linalg.svd(matrix,full_matrices=True);rank=int(np.sum(singular>1e-10));null=vt[rank:].T
            vertex_ids=np.unique(mesh.faces[model['faces']]);p=mesh.vertices[vertex_ids]-origin
            xy=np.column_stack((p@x,p@y))
            if null.shape[1]:
                start=np.linalg.lstsq(null,np.array([0.,0.,model['radius_mm']])-base,rcond=None)[0]
                def residual(parameters):
                    values=base+null@parameters
                    return np.linalg.norm(xy-values[:2],axis=1)-values[2]
                fitted=least_squares(residual,start,xtol=1e-13,ftol=1e-13,gtol=1e-13,max_nfev=100)
                values=base+null@fitted.x
            else:values=base
            error=float(np.max(np.abs(np.linalg.norm(xy-values[:2],axis=1)-values[2])))
            if values[2]>0 and error<numeric*8 and np.max(np.abs(matrix@values-rhs))<numeric:
                model.update(origin=(origin+values[0]*x+values[1]*y).tolist(),radius_mm=float(values[2]),
                             tangent_plane_groups=sorted(constraints),joint_fit_residual_mm=error)
        regions.append(model)
    return replace(analysis,regions=regions)


def conical_regions(mesh, analysis, tolerance, cancel_event=None):
    """Grow locally supported cones from existing cylinder axes and neighbours."""
    planes = analysis.planes
    neighbours = _neighbours(mesh, analysis.plane_ids)
    used = {int(analysis.plane_ids[i]) for r in analysis.regions if r['type'] == 'CYLINDER' for i in r['faces']}
    numeric = analysis.numeric_mm
    proposals = []
    for cylinder in [r for r in analysis.regions if r['type'] == 'CYLINDER']:
        _cancel(cancel_event)
        groups = set(cylinder['plane_groups'])
        seeds = sorted(set().union(*(neighbours[i] for i in groups)) - used)
        axis = np.array(cylinder['axis'])
        origin = np.array(cylinder['origin'])
        local = np.asarray(mesh.vertices) - origin
        heights = local @ axis
        radius = np.linalg.norm(local - heights[:, None] * axis, axis=1)

        def fit(group_ids):
            ids = np.unique(np.concatenate([planes[i]['vertices'] for i in group_ids]))
            h, r = heights[ids], radius[ids]
            span = np.ptp(h)
            if span < numeric * 20:
                return None
            hmean = float(h.mean())
            slope = float(np.dot(h - hmean, r - r.mean()) / np.dot(h - hmean, h - hmean))
            intercept = float(r.mean() - slope * hmean)
            if not .005 < abs(slope) < 100:
                return None
            residual = float(np.max(np.abs(r - (intercept + slope * h))))
            if residual > numeric * 8 or np.min(intercept + slope * h) < -numeric:
                return None
            for i in group_ids:
                normal = planes[i]['normal']
                p = planes[i]['centre'] - origin
                height = np.dot(p, axis)
                radial = p - height * axis
                length = np.linalg.norm(radial)
                if length < numeric:
                    return None
                expected = radial / length - slope * axis
                expected /= np.linalg.norm(expected)
                if abs(np.dot(normal, expected)) < math.cos(math.radians(12)):
                    return None
            return ids, slope, intercept, residual

        # Follow supported conical bands beyond the first cylinder neighbour.
        # A rounded mesh corner can contain several distinct ruled bands; each
        # needs its own measured slope rather than a single extrapolated cone.
        pending_seeds = deque(seeds)
        queued_seeds = set(seeds)
        while pending_seeds:
            seed = pending_seeds.popleft()
            if seed in used:
                continue
            proposal = fit({seed})
            if proposal is None:
                continue
            found = {seed}
            changed = True
            while changed:
                _cancel(cancel_event)
                changed = False
                pending = sorted(set().union(*(neighbours[i] for i in found)) - found - used)
                for i in pending:
                    trial = fit(found | {i})
                    if trial is not None:
                        found.add(i)
                        proposal = trial
                        changed = True
            if len(found) < 4:
                continue
            ids, slope, intercept, residual = proposal
            faces = sorted(f for i in found for f in planes[i]['faces'])
            triangles = mesh.triangles[faces] - origin
            probes = np.vstack((triangles.mean(axis=1),
                                ((triangles + np.roll(triangles, 1, axis=1)) / 2).reshape(-1, 3)))
            h = probes @ axis
            r = np.linalg.norm(probes - h[:, None] * axis, axis=1)
            chord = float(np.max(np.abs(r - intercept - slope * h) / math.sqrt(1 + slope*slope)))
            if chord > tolerance * .45:
                continue
            centre = np.average(mesh.triangles_center[faces], axis=0, weights=mesh.area_faces[faces]) - origin
            radial = centre - np.dot(centre, axis) * axis
            # Full rings have a centre on the axis; use individual normals.
            pts = mesh.triangles_center[faces] - origin
            hv = pts @ axis
            rv = pts - hv[:, None] * axis
            rv /= np.maximum(np.linalg.norm(rv, axis=1)[:, None], 1e-30)
            expected = rv - slope * axis
            sign = float(np.sum(mesh.area_faces[faces] * np.einsum('ij,ij->i', mesh.face_normals[faces], expected)))
            proposals.append({'type': 'CONE', 'faces': faces, 'plane_groups': sorted(found),
                              'axis': axis.tolist(), 'origin': origin.tolist(),
                              'slope': slope, 'intercept_mm': intercept,
                              'height_min_mm': float(heights[ids].min()), 'height_max_mm': float(heights[ids].max()),
                              'vertex_residual_mm': residual, 'chord_probe_mm': chord, 'outward': sign > 0})
            used.update(found)
            for neighbour in sorted(set().union(*(neighbours[i] for i in found)) - used - queued_seeds):
                pending_seeds.append(neighbour)
                queued_seeds.add(neighbour)
    return proposals


def surface_distance(model, points):
    points = np.atleast_2d(points)
    if model['type'] == 'PLANE':
        return (points - model['centre']) @ model['normal']
    if model['type']=='GRAPH':
        from .freeform_regions import graph_distance
        return graph_distance(model,points)
    if model['type']=='REVOLUTION':
        from .meridian_regions import meridian_distance
        return meridian_distance(model,points)
    local = points - model['origin']
    axis = np.asarray(model['axis'])
    heights = local @ axis
    radial = np.linalg.norm(local - heights[:, None] * axis, axis=1)
    if model['type'] == 'CYLINDER':
        return radial - model['radius_mm']
    slope = model['slope']
    return (radial - model['intercept_mm'] - slope * heights) / math.sqrt(1+slope*slope)


def analyse_advanced_regions(mesh, tolerance, cancel_event=None):
    """Source-indexed cylinder/cone proposals, without claiming CAD acceptance."""
    analysis = _tangent_cylinders(mesh, analyse_regions(mesh,tolerance,cancel_event),cancel_event)
    cones = conical_regions(mesh,analysis,tolerance,cancel_event)
    cone_faces = {face for region in cones for face in region['faces']}
    regions,face_regions = [],np.full(len(mesh.faces),-1,dtype=int)
    for source in analysis.regions:
        _cancel(cancel_event)
        faces = [face for face in source['faces'] if face not in cone_faces]
        if not faces:
            continue
        model = {**source,'id':len(regions),'faces':faces}
        if model['type']=='CYLINDER':
            model['reason']='Zylinder belegt; gemeinsame Schnittkurven und CAD-Übernahme werden bei der Konvertierung geprüft'
        face_regions[faces]=model['id']
        regions.append(model)
    for source in cones:
        radii=[source['intercept_mm']+source['slope']*source[key] for key in ('height_min_mm','height_max_mm')]
        model={**source,'id':len(regions),'radius_min_mm':min(radii),'radius_max_mm':max(radii),
               'reconstructible':False,
               'reason':f"Kegelband belegt (Steigung {source['slope']:.6g}); native Ränder und Abweichung werden separat geprüft"}
        face_regions[model['faces']]=model['id']
        regions.append(model)
    adjacency=mesh.face_adjacency
    different=face_regions[adjacency[:,0]]!=face_regions[adjacency[:,1]]
    return replace(analysis,face_regions=face_regions,regions=regions,
                   boundary_edges=np.asarray(mesh.face_adjacency_edges)[different])


def _partition(mesh, analysis, curved):
    """Split periodic regions on observed generators, preserving source IDs."""
    ids = analysis.plane_ids.copy()
    models = {i: {'type': 'PLANE', 'normal': p['normal'], 'centre': p['centre'], 'faces': p['faces']}
              for i, p in enumerate(analysis.planes)}
    next_id = len(models)
    for region in curved:
        if region['type']=='GRAPH':
            ids[region['faces']]=next_id
            models[next_id]=dict(region)
            next_id+=1
            continue
        axis = np.asarray(region['axis'])
        origin = np.asarray(region['origin'])
        x, y = _basis(axis)
        face_ids = np.array(region['faces'])
        points = mesh.vertices[np.unique(mesh.faces[face_ids])] - origin
        angles = np.mod(np.arctan2(points @ y, points @ x), 2*math.pi)
        ordered = np.sort(angles)
        gaps = np.diff(np.r_[ordered, ordered[0]+2*math.pi])
        span = 2*math.pi - float(gaps.max())
        pieces = [face_ids]
        if span > math.pi * 1.8:
            # Both cuts coincide with source radial generators. Surface halves
            # then have ordinary non-periodic wires rather than missing seams.
            begin = float(ordered[(int(np.argmax(gaps))+1) % len(ordered)])
            radial_angles = np.mod(angles - begin, 2*math.pi)
            cut = float(radial_angles[np.argmin(np.abs(radial_angles-math.pi))])
            centres = mesh.triangles_center[face_ids] - origin
            centre_angles = np.mod(np.arctan2(centres @ y, centres @ x)-begin, 2*math.pi)
            pieces = [face_ids[centre_angles < cut], face_ids[centre_angles >= cut]]
            if any(len(piece) == 0 for piece in pieces):
                raise ValueError('Periodische Region lässt sich nicht auf vorhandenen Nähten teilen')
        for piece in pieces:
            ids[piece] = next_id
            model = {**region, 'faces': piece.tolist()}
            points = mesh.vertices[np.unique(mesh.faces[piece])] - origin
            a = np.arctan2(points @ y, points @ x)
            vector = np.array([np.cos(a).mean(), np.sin(a).mean()])
            angle = math.atan2(vector[1], vector[0])
            # Place the parametric seam opposite the supported patch.
            model['x_direction'] = (-math.cos(angle)*x-math.sin(angle)*y).tolist()
            models[next_id] = model
            next_id += 1
    active = set(map(int, np.unique(ids)))
    return ids, {i: m for i, m in models.items() if i in active}


def _surface(model):
    from OCP.Geom import Geom_Plane, Geom_CylindricalSurface, Geom_ConicalSurface
    from OCP.gp import gp_Ax3, gp_Pnt, gp_Dir, gp_Pln
    if model['type'] == 'PLANE':
        return Geom_Plane(gp_Pln(gp_Pnt(*model['centre']), gp_Dir(*model['normal'])))
    if model['type']=='GRAPH':
        from .freeform_regions import graph_surface
        return graph_surface(model)
    if model['type']=='REVOLUTION':
        from .meridian_regions import meridian_surface
        return meridian_surface(model)
    axis, origin = np.array(model['axis']), np.array(model['origin'])
    x = model['x_direction']
    if model['type'] == 'CYLINDER':
        return Geom_CylindricalSurface(gp_Ax3(gp_Pnt(*origin), gp_Dir(*axis), gp_Dir(*x)), model['radius_mm'])
    h = model['height_min_mm']
    radius = model['intercept_mm'] + model['slope']*h
    return Geom_ConicalSurface(gp_Ax3(gp_Pnt(*(origin+axis*h)), gp_Dir(*axis), gp_Dir(*x)),
                              math.atan(model['slope']), max(0., radius))


def _solved_vertices(mesh, chains, models, numeric, tolerance, fixed_nodes=()):
    import cadquery as cq
    from OCP.BRep import BRep_Builder
    incident = defaultdict(set)
    generator_constraints=defaultdict(list)
    for chain in chains:
        for node in (chain['nodes'][0], chain['nodes'][-1]):
            incident[node].update(chain['pair'])
        a,b=chain['pair']
        for owner,other in ((a,b),(b,a)):
            if models[owner]['type']!='REVOLUTION' or models[other]['type']!='CYLINDER':continue
            model=models[owner];axis=np.asarray(model['axis']);x=np.asarray(model['x_direction']);y=np.cross(axis,x)
            points=mesh.vertices[chain['nodes']];local=points-model['origin']
            angles=np.unwrap(np.arctan2(local@y,local@x));radius=np.linalg.norm(local-(local@axis)[:,None]*axis,axis=1)
            if np.ptp(angles)>numeric*16/max(radius.min(),numeric):continue
            angle=float(angles.mean());curve=_surface(model).UIso(angle)
            parameters,errors=_projection(curve,points)
            sample=np.array([curve.Value(float(p)).Coord() for p in np.linspace(parameters.min(),parameters.max(),25)])
            if max(np.max(abs(surface_distance(models[j],sample))) for j in (owner,other))>numeric*8:continue
            normal=-np.sin(angle)*x+np.cos(angle)*y
            for node in (chain['nodes'][0],chain['nodes'][-1]):generator_constraints[node].append((owner,other,normal,angle))
    vertices, max_move, max_residual = {}, 0., 0.
    builder = BRep_Builder()
    for node, owners in incident.items():
        point = np.asarray(mesh.vertices[node])
        owners = sorted(owners)
        observed_error=max(abs(float(surface_distance(models[i],point)[0])) for i in owners)
        supported_meridian=any(models[i]['type']=='REVOLUTION' for i in owners) and observed_error<=numeric*8 and not generator_constraints[node]
        if node in fixed_nodes or supported_meridian or all(models[i]['type'] == 'PLANE' for i in owners):
            result = point
        elif generator_constraints[node]:
            owner,other,normal,angle=generator_constraints[node][0]
            curve=_surface(models[owner]).UIso(angle)
            parameters,_=_projection(curve,[point]);start=float(parameters[0])
            cones_at_node=[i for i in owners if models[i]['type']=='CONE']
            if cones_at_node:
                def curve_residual(parameter):
                    p=np.array(curve.Value(float(parameter[0])).Coord())
                    return [float(surface_distance(models[i],p)[0]) for i in cones_at_node]
                fit=least_squares(curve_residual,[start],bounds=([curve.FirstParameter()],[curve.LastParameter()]),
                                  xtol=1e-13,ftol=1e-13,gtol=1e-13,max_nfev=80)
                start=float(fit.x[0])
            result=np.asarray(curve.Value(start).Coord())
        else:
            # Work relative to the observation so position offsets and thin
            # dimensions do not defeat the optimizer's numerical derivative.
            def residual(offset):
                soft={other for _,other,_,_ in generator_constraints[node]}
                values = [float(surface_distance(models[i], point+offset)[0])*(1e-4 if i in soft else 1.) for i in owners]
                values.extend(float(np.dot(point+offset-models[owner]['origin'],normal)) for owner,_,normal,_ in generator_constraints[node])
                return np.r_[values, offset*1e-5]
            fit = least_squares(residual, np.zeros(3), xtol=1e-13, ftol=1e-13, gtol=1e-13, max_nfev=80)
            result = point + fit.x
        deviation = float(np.linalg.norm(result-point))
        error = max(abs(float(surface_distance(models[i], result)[0])) for i in owners)
        # Tangential intersections amplify float32 fitting noise geometrically.
        # Bound actual point movement separately; native tolerances stay small.
        if deviation > max(numeric*16,tolerance*.1) or error > numeric*8:
            raise ValueError(f'Gemeinsamer Eckpunkt außerhalb Bewegungs-/Fitreserve: {deviation:g}/{error:g} mm')
        vertex = cq.Vertex.makeVertex(*result)
        builder.UpdateVertex(vertex.wrapped, max(1e-7, error*2))
        vertices[node] = vertex
        max_move, max_residual = max(max_move,deviation), max(max_residual,error)
    return vertices, max_move, max_residual


def _projection(curve, points):
    from OCP.GeomAPI import GeomAPI_ProjectPointOnCurve
    from OCP.gp import gp_Pnt
    parameters, distances = [], []
    for point in points:
        project = GeomAPI_ProjectPointOnCurve(gp_Pnt(*point), curve)
        choices=[]
        if project.NbPoints():
            choices.append((project.LowerDistance(),project.LowerDistanceParameter()))
        # Extrema projection can omit the constrained minimum at a finite
        # B-spline endpoint. Include endpoints explicitly before choosing.
        for parameter in (curve.FirstParameter(),curve.LastParameter()):
            if abs(parameter)<1e50:
                distance=curve.Value(parameter).Distance(gp_Pnt(*point))
                choices.append((distance,parameter))
        if not choices:
            raise ValueError('Randpunkt kann nicht auf Schnittkurve projiziert werden')
        distance,parameter=min(choices)
        parameters.append(parameter)
        distances.append(distance)
    return np.array(parameters), np.array(distances)


def _same_primitive(a,b,numeric):
    if a['type']!=b['type'] or a['type']=='PLANE':return False
    if a['type']=='GRAPH':return all(a[k]==b[k] for k in ('height_controls','origin','normal','basis_x','basis_y','xy_bounds'))
    if np.dot(a['axis'],b['axis'])<1-1e-10:return False
    delta=np.array(a['origin'])-b['origin'];axis=np.array(a['axis'])
    if np.linalg.norm(delta-np.dot(delta,axis)*axis)>numeric:return False
    if a['type']=='REVOLUTION':return all(a.get(k)==b.get(k) for k in ('profile_nodes','profile_slopes','segment_slopes','circle_profile'))
    if a['type']=='CYLINDER':return abs(a['radius_mm']-b['radius_mm'])<numeric
    return abs(a['slope']-b['slope'])<1e-10 and abs(a['intercept_mm']-b['intercept_mm'])<numeric


def _seam_edge(points,surface,other_surface,first,last):
    """A source-supported UV seam shared by two halves of the same surface."""
    import cadquery as cq
    from OCP.GeomAPI import GeomAPI_ProjectPointOnSurf
    from OCP.Geom2d import Geom2d_BSplineCurve
    from OCP.TColgp import TColgp_Array1OfPnt2d
    from OCP.TColStd import TColStd_Array1OfReal,TColStd_Array1OfInteger
    from OCP.gp import gp_Pnt,gp_Pnt2d,gp_Vec2d
    from OCP.BRep import BRep_Builder
    from OCP.TopLoc import TopLoc_Location
    from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeEdge
    from OCP.BRepLib import BRepLib
    pts=np.asarray(points).copy();pts[0]=first.toTuple();pts[-1]=last.toTuple()
    uv=[]
    for p in pts:
        projection=GeomAPI_ProjectPointOnSurf(gp_Pnt(*p),surface)
        uv.append(projection.LowerDistanceParameters())
    uv=np.asarray(uv);uv[:,0]=np.unwrap(uv[:,0])
    keep=np.r_[True,np.linalg.norm(np.diff(uv,axis=0),axis=1)>1e-10];uv=uv[keep]
    n=len(uv)
    poles=TColgp_Array1OfPnt2d(1,n);knots=TColStd_Array1OfReal(1,n);mult=TColStd_Array1OfInteger(1,n)
    for i,p in enumerate(uv,1):
        poles.SetValue(i,gp_Pnt2d(*p));knots.SetValue(i,float(i-1));mult.SetValue(i,2 if i in (1,n) else 1)
    curve=Geom2d_BSplineCurve(poles,knots,mult,1,False)
    maker=BRepBuilderAPI_MakeEdge(curve,surface,first.wrapped,last.wrapped,0.,float(n-1))
    if not maker.IsDone():raise ValueError('Geteilte UV-Naht konnte nicht erzeugt werden')
    edge=cq.Edge(maker.Edge())
    # Both halves use the same primitive in rotated UV frames. An independent
    # projection of the piecewise seam can smooth its UV corners and cause
    # SameParameter to inflate the native tolerance. Translate the exact UV
    # curve instead, preserving every knot and its parameter correspondence.
    initial=curve.Value(0.)
    other_uv=GeomAPI_ProjectPointOnSurf(surface.Value(*initial.Coord()),other_surface).LowerDistanceParameters()
    other_curve=curve.Copy()
    other_curve.Translate(gp_Vec2d(other_uv[0]-initial.X(),other_uv[1]-initial.Y()))
    for parameter in np.linspace(0.,float(n-1),max(9,n*2)):
        a=curve.Value(float(parameter));b=other_curve.Value(float(parameter))
        if surface.Value(*a.Coord()).Distance(other_surface.Value(*b.Coord()))>1e-7:
            raise ValueError('Nahtparameter passen nicht zu beiden analytischen Flächen')
    BRep_Builder().UpdateEdge(edge.wrapped,other_curve,other_surface,TopLoc_Location(),1e-7)
    if not BRepLib.BuildCurve3d_s(edge.wrapped,1e-7):raise ValueError('Geteilte UV-Naht hat keine 3D-Kurve')
    return edge


def _intersection_edge(mesh, chain, models, surfaces, vertices, numeric, tolerance):
    import cadquery as cq
    from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeEdge
    from OCP.GeomAPI import GeomAPI_IntSS
    from OCP.Geom import Geom_Line
    from OCP.gp import gp_Pnt, gp_Dir
    nodes = chain['nodes']
    points = np.asarray(mesh.vertices[nodes])
    first, last = vertices[nodes[0]], vertices[nodes[-1]]
    a, b = chain['pair']
    straight = points[-1]-points[0]
    length = np.linalg.norm(straight)
    # Planar rest regions and seam generators retain one shared straight edge.
    if length > numeric and np.max(np.linalg.norm(np.cross(points-points[0], straight/length),axis=1)) < numeric*4:
        sample = np.linspace(np.array(first.toTuple()), np.array(last.toTuple()), 9)
        if max(np.max(np.abs(surface_distance(models[i],sample))) for i in (a,b)) < numeric*16:
            maker = BRepBuilderAPI_MakeEdge(first.wrapped,last.wrapped)
            if maker.IsDone():
                return cq.Edge(maker.Edge())
    if _same_primitive(models[a],models[b],numeric):
        return _seam_edge(points,surfaces[a],surfaces[b],first,last)
    choices = []
    for owner in (a,b):
        if models[owner]['type']!='REVOLUTION':continue
        model=models[owner];axis=np.asarray(model['axis']);x=np.asarray(model['x_direction']);y=np.cross(axis,x)
        local=points-model['origin'];angles=np.unwrap(np.arctan2(local@y,local@x))
        if np.ptp(angles)>numeric*16/max(np.linalg.norm(local-(local@axis)[:,None]*axis,axis=1).min(),numeric):continue
        curve=surfaces[owner].UIso(float(angles.mean()))
        parameters,distances=_projection(curve,points)
        if np.max(distances)>numeric*16:continue
        sample=np.array([curve.Value(float(p)).Coord() for p in np.linspace(parameters.min(),parameters.max(),25)])
        if max(np.max(abs(surface_distance(models[j],sample))) for j in (a,b))>numeric*8:continue
        choices.append((float(distances.max()),curve,parameters))
    intersection=None
    if not choices:
        intersection = GeomAPI_IntSS(surfaces[a],surfaces[b],max(1e-7,numeric*.05))
        if not intersection.IsDone():
            raise ValueError('Analytische Schnittkurve konnte nicht bestimmt werden')
    for i in range(1,(intersection.NbLines() if intersection else 0)+1):
        curve = intersection.Line(i)
        try:
            parameters, distances = _projection(curve,points)
            if np.max(distances) <= max(numeric*16,tolerance*.1):
                choices.append((float(distances.max()),curve,parameters))
        except ValueError:
            continue
    if not choices:
        raise ValueError(f'Keine Schnittkurve passt zum vollständigen Rand {a}/{b}')
    _,curve,parameters = min(choices,key=lambda item:item[0])
    if curve.IsPeriodic():
        period = curve.Period()
        parameters = np.unwrap(parameters,period=period)
    delta = np.diff(parameters)
    if np.any(delta>1e-7) and np.any(delta<-1e-7):
        raise ValueError('Randkette wechselt die Richtung auf der Schnittkurve')
    endpoint_parameters,endpoint_errors = _projection(curve,[first.toTuple(),last.toTuple()])
    if np.max(endpoint_errors)>numeric*16:
        raise ValueError(f'Eckpunkt/Schnittkurve widersprechen sich: {endpoint_errors.max():g} mm')
    from OCP.BRep import BRep_Builder,BRep_Tool
    builder=BRep_Builder()
    for vertex,error in zip((first,last),endpoint_errors):
        builder.UpdateVertex(vertex.wrapped,max(BRep_Tool.Tolerance_s(vertex.wrapped),float(error)*1.01+1e-7))
    for i in (0,1):
        if curve.IsPeriodic():
            endpoint_parameters[i] += round((parameters[[0,-1][i]]-endpoint_parameters[i])/curve.Period())*curve.Period()
    p0,p1 = map(float,endpoint_parameters)
    if abs(p1-p0) < 1e-10:
        raise ValueError('Nicht aufgelöste Schnittkurvenkante')
    if p1<p0:
        first,last,p0,p1 = last,first,p1,p0
    maker = BRepBuilderAPI_MakeEdge(curve,first.wrapped,last.wrapped,p0,p1)
    if not maker.IsDone():
        raise ValueError(f'Geteilte analytische Kante nicht erzeugbar: {maker.Error()}')
    edge = cq.Edge(maker.Edge())
    # The chord cost belongs to the approximation budget, not native sewing.
    midpoints=(points[:-1]+points[1:])/2
    _,errors = _projection(curve,midpoints)
    if np.max(errors)>tolerance*.45:
        raise ValueError('Randkurve überschreitet das Sehnenbudget')
    return edge


def _loops(mesh, indices):
    next_vertex={}
    for a,b in _boundary_edges(mesh,indices):
        if int(a) in next_vertex:
            raise ValueError('Verzweigter Regionsrand')
        next_vertex[int(a)] = int(b)
    loops=[]
    while next_vertex:
        start=min(next_vertex)
        nodes=[start]
        while nodes[-1] in next_vertex:
            nodes.append(next_vertex.pop(nodes[-1]))
            if nodes[-1]==start:break
        if nodes[-1]!=start:raise ValueError('Offener Regionsrand')
        loops.append(nodes)
    return loops


def _fix_freeform_trims(shape, numeric):
    """Harmonize native trim curves without sewing or changing topology.

    Near-tangent projected pcurves can overlap within the measured vertex
    tolerance. ShapeFix repairs their parameterization; it must retain every
    surface type and native face/edge/vertex count and stay in the same small
    numerical reserve. The complete mesh and STEP gates still follow.
    """
    from collections import Counter
    from OCP.ShapeFix import ShapeFix_Shape
    from OCP.BRep import BRep_Tool
    import cadquery as cq

    def topology(value):
        return (len(value.Faces()), len(value.Edges()), len(value.Vertices()),
                len(value.Shells()), len(value.Solids()),
                Counter(f.geomType() for f in value.Faces()))

    before = topology(shape)
    fixer = ShapeFix_Shape(shape.copy().wrapped)
    fixer.SetPrecision(1e-7)
    fixer.SetMinTolerance(1e-7)
    fixer.SetMaxTolerance(numeric*16)
    fixer.Perform()
    result = cq.Shape.cast(fixer.Shape())
    edge_tolerance = max(BRep_Tool.Tolerance_s(e.wrapped) for e in result.Edges())
    vertex_tolerance = max(BRep_Tool.Tolerance_s(v.wrapped) for v in result.Vertices())
    if (not result.isValid() or topology(result) != before or result.Volume() <= 0
            or max(edge_tolerance, vertex_tolerance) > numeric*16):
        raise ValueError('Freiform-Trimreparatur verletzt Gültigkeit, Topologie oder numerische Reserve')
    return result, dict(kind='bounded_native_pcurve_harmonization', sewing_used=False,
                        topology_counts_preserved=True, surface_types_preserved=True,
                        max_edge_tolerance_mm=edge_tolerance,
                        max_vertex_tolerance_mm=vertex_tolerance)


def advanced_region_shape(mesh, tolerance, progress=None, analysis=None, *, cancel_event=None):
    import cadquery as cq
    from OCP.BRep import BRep_Builder,BRep_Tool
    from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeFace
    from OCP.BRepCheck import BRepCheck_Shell,BRepCheck_NoError
    from OCP.BRepLib import BRepLib
    from OCP.ShapeFix import ShapeFix_Face,ShapeFix_Edge
    from OCP.TopoDS import TopoDS,TopoDS_Shell,TopoDS_Solid
    from .repair import manifold_vertex_links
    if (len(mesh.faces)>MAX_FACES or not mesh.is_watertight or not mesh.is_winding_consistent
            or np.any(mesh.area_faces<=0) or mesh.metadata.get('preserve_vertex_identity')
            or not manifold_vertex_links(mesh)['closed_single_cycle']):
        return None
    _cancel(cancel_event)
    analysis = _tangent_cylinders(mesh,analysis or analyse_regions(mesh,tolerance,cancel_event),cancel_event)
    cylinders = [r for r in analysis.regions if r['type']=='CYLINDER']
    cones = [r for r in analysis.regions if r['type']=='CONE']
    graphs = [r for r in analysis.regions if r['type']=='GRAPH']
    revolutions = [r for r in analysis.regions if r['type']=='REVOLUTION']
    if not cylinders and not cones and not graphs and not revolutions and not analysis.edits:return None
    if not cones and not graphs and not revolutions and not analysis.edits:
        cones = conical_regions(mesh,analysis,tolerance,cancel_event)
    curved = cylinders+cones+graphs+revolutions
    ids,models = _partition(mesh,analysis,curved)
    numeric = analysis.numeric_mm
    chains = _shared_chains(mesh,ids)
    surfaces = {i:_surface(model) for i,model in models.items()}
    frozen_faces = analysis.edits.get('frozen_faces',[]) if analysis.edits else []
    fixed_nodes = set(map(int,np.unique(mesh.faces[frozen_faces]))) if frozen_faces else set()
    vertices,max_move,max_residual = _solved_vertices(mesh,chains,models,numeric,tolerance,fixed_nodes)
    chain_edges={}
    for i,chain in enumerate(chains):
        _cancel(cancel_event)
        if progress and i%100==0:progress(f'Bestimme gemeinsame analytische Ränder {i+1}/{len(chains)} …')
        if all(models[j]['type']=='PLANE' for j in chain['pair']):
            nodes=chain['nodes']
            pts=np.array([vertices.get(j,cq.Vertex.makeVertex(*mesh.vertices[j])).toTuple() for j in nodes])
            d=pts[-1]-pts[0];length=np.linalg.norm(d)
            if length>numeric and np.max(np.linalg.norm(np.cross(pts-pts[0],d/length),axis=1))<=numeric:
                chain_edges[i]=[cq.Edge.makeLine(cq.Vector(*pts[0]),cq.Vector(*pts[-1]))]
                # Rebuild with the global vertices, not new geometric copies.
                from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeEdge
                chain_edges[i]=[cq.Edge(BRepBuilderAPI_MakeEdge(vertices[nodes[0]].wrapped,vertices[nodes[-1]].wrapped).Edge())]
            else:
                from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeEdge
                result=[]
                for a,b in zip(nodes,nodes[1:]):
                    for j in (a,b):
                        if j not in vertices:vertices[j]=cq.Vertex.makeVertex(*mesh.vertices[j])
                    result.append(cq.Edge(BRepBuilderAPI_MakeEdge(vertices[a].wrapped,vertices[b].wrapped).Edge()))
                chain_edges[i]=result
        else:
            chain_edges[i]=[_intersection_edge(mesh,chain,models,surfaces,vertices,numeric,tolerance)]
    raw_to_chain={tuple(sorted((a,b))):i for i,c in enumerate(chains) for a,b in zip(c['nodes'],c['nodes'][1:])}
    faces=[]
    for owner,model in models.items():
        _cancel(cancel_event)
        indices=np.where(ids==owner)[0]
        wires=[]
        for nodes in _loops(mesh,indices):
            used=[]
            for a,b in zip(nodes,nodes[1:]):
                i=raw_to_chain[tuple(sorted((a,b)))]
                if i not in used:used.append(i)
            wire=cq.Wire.assembleEdges(e for i in used for e in chain_edges[i])
            if not wire.IsClosed():raise ValueError('Native analytische Regionsgrenze offen')
            # Use an unwrapped local parameter domain for outer/inner loops.
            pts=mesh.vertices[nodes[:-1]]
            if model['type']=='PLANE':
                x,y=_basis(model['normal']);p=pts-model['centre'];uv=np.column_stack((p@x,p@y))
            elif model['type']=='GRAPH':
                p=pts-model['origin'];uv=np.column_stack((p@model['basis_x'],p@model['basis_y']))
            else:
                axis=np.array(model['axis']);x=np.array(model['x_direction']);y=np.cross(axis,x)
                p=pts-model['origin'];uv=np.column_stack((np.unwrap(np.arctan2(p@y,p@x)),p@axis))
            area=abs(float(np.sum(uv[:,0]*np.roll(uv[:,1],-1)-uv[:,1]*np.roll(uv[:,0],-1))))
            wires.append((area,wire))
        wires.sort(key=lambda item:-item[0])
        maker=BRepBuilderAPI_MakeFace(surfaces[owner],wires[0][1].wrapped,True)
        for _,wire in wires[1:]:maker.Add(wire.wrapped)
        if not maker.IsDone():raise ValueError('Analytische Fläche nicht erzeugbar')
        face=cq.Face(maker.Face())
        edge_fix=ShapeFix_Edge()
        for edge in face.Edges():edge_fix.FixAddPCurve(edge.wrapped,face.wrapped,False,1e-7)
        fixer=ShapeFix_Face(face.wrapped);fixer.FixOrientation()
        face=cq.Face(fixer.Face())
        point=np.asarray(mesh.triangles_center[indices[0]])
        if model['type']=='PLANE':expected=np.asarray(model['normal'])
        elif model['type']=='GRAPH':
            from .freeform_regions import graph_normal
            expected=graph_normal(model,point)
        elif model['type']=='REVOLUTION':
            from .meridian_regions import meridian_normal
            expected=meridian_normal(model,point)
        else:
            p=point-model['origin'];axis=np.array(model['axis']);rad=p-np.dot(p,axis)*axis
            expected=rad/np.linalg.norm(rad)-(model.get('slope',0))*axis
            if not model['outward']:expected*=-1
        if np.dot(face.normalAt(cq.Vector(*point)).toTuple(),expected)<0:
            face=cq.Face(TopoDS.Face_s(face.wrapped.Reversed()))
        faces.append(face)
    builder=BRep_Builder();shell=TopoDS_Shell();builder.MakeShell(shell)
    for face in faces:builder.Add(shell,face.wrapped)
    if BRepCheck_Shell(shell).Closed()!=BRepCheck_NoError:raise ValueError('Analytischer Randgraph ist nicht geschlossen')
    shell.Closed(True);solid=TopoDS_Solid();builder.MakeSolid(solid);builder.Add(solid,shell)
    shape=cq.Shape.cast(solid)
    for face in faces:
        if face.geomType()=='PLANE':
            for edge in face.Edges():BRepLib.BuildPCurveForEdgeOnPlane_s(edge.wrapped,face.wrapped)
    BRepLib.SameParameter_s(shape.wrapped,1e-7,True)
    max_tol=max(BRep_Tool.Tolerance_s(e.wrapped) for e in shape.Edges())
    if max_tol>numeric*16:raise ValueError(f'Analytische Randtoleranz zu groß: {max_tol:g}')
    trim_repair = None
    if not shape.isValid() and (graphs or revolutions):
        shape, trim_repair = _fix_freeform_trims(shape, numeric)
        max_tol = max(BRep_Tool.Tolerance_s(e.wrapped) for e in shape.Edges())
    if not shape.isValid() or shape.Volume()<=0:raise ValueError('Analytischer Randgraph ergibt keinen gültigen Körper')
    # Keep the explicit periodic seams. Same-domain unification can remove a
    # needed pcurve seam while leaving a natively valid but unmeshable face.
    details={'kind':'shared_analytic_intersection_boundaries','cylinders':len(cylinders),'cones':len(cones),
             'faces_before':len(mesh.faces),'faces_after':len(shape.Faces()),'shared_boundary_chains':len(chains),
             'max_vertex_move_mm':max_move,'max_vertex_surface_residual_mm':max_residual,
             'vertex_movement_allowance_mm':max(numeric*16,tolerance*.1),
             'max_native_edge_tolerance_mm':max_tol,'sewing_used':False,'native_closed':True,
             'conical_regions':cones}
    if trim_repair:
        details['native_trim_repair'] = trim_repair
    if analysis.edits:
        from .edited_regions import verify_protected_faces
        details['manual_regions'] = dict(analysis.edits)
        details['manual_regions']['native_protection_proof'] = verify_protected_faces(shape,analysis.edits['protected_triangles_mm'])
    return shape,details
