"""Fit edited regions and retain protected original facets in a shared graph."""
from collections import defaultdict
from dataclasses import replace
import math

import numpy as np
from scipy.optimize import least_squares

from .local_regions import _basis, _circle, _cancel, _shared_chains
from .region_edits import RegionEditSession, RegionEditError, mesh_identity


def _fit_plane(mesh, faces, numeric):
    vertex_ids = np.unique(mesh.faces[faces])
    points = mesh.vertices[vertex_ids]
    centre = points.mean(axis=0)
    _, _, vectors = np.linalg.svd(points-centre, full_matrices=False)
    normal = vectors[-1]
    observed = np.average(mesh.face_normals[faces],axis=0,weights=mesh.area_faces[faces])
    if np.dot(normal,observed)<0:
        normal = -normal
    residual = float(np.max(np.abs((points-centre)@normal)))
    if residual>numeric*8 or np.min(mesh.face_normals[faces]@normal)<math.cos(math.radians(12)):
        raise RegionEditError('Die ausgewählten Dreiecke belegen keine gemeinsame Ebene.')
    return dict(faces=faces,vertices=vertex_ids,normal=normal,centre=centre,
                residual_mm=residual,area=float(mesh.area_faces[faces].sum()))


def _axes(mesh, faces, original):
    axes, origins = [], []
    indices = set(faces)
    for region in original.regions:
        if region['type'] in ('CYLINDER','CONE') and indices.intersection(region['faces']):
            axes.append(np.asarray(region['axis']))
            origins.append(np.asarray(region['origin']))
    normals = mesh.face_normals[faces]
    _, vectors = np.linalg.eigh(np.cov(normals.T,bias=True))
    axes.extend(vectors.T)
    axes.extend(p['normal'] for p in sorted(original.planes,key=lambda p:-p['area'])[:8])
    result = []
    for axis in axes:
        axis = np.asarray(axis,dtype=float).copy()
        length = np.linalg.norm(axis)
        if length<.5:
            continue
        axis /= length
        if axis[np.argmax(np.abs(axis))]<0:
            axis *= -1
        if all(abs(np.dot(axis,other))<1-1e-9 for other in result):
            result.append(axis)
    return result,origins


def _fit_curved(mesh, faces, kind, original, tolerance):
    numeric = original.numeric_mm
    points = mesh.vertices[np.unique(mesh.faces[faces])]
    if len(faces)<4 or len(points)<6:
        raise RegionEditError('Für einen Zylinder-/Kegelfit fehlen unabhängige Stützpunkte.')
    axes,origins = _axes(mesh,faces,original)
    candidates = []
    centre = points.mean(axis=0)
    for axis in axes:
        x,y = _basis(axis)
        local = points-centre
        heights = local@axis
        if np.ptp(heights)<numeric*20:
            continue
        xy = np.column_stack((local@x,local@y))
        seeds = [np.array([np.dot(p-centre,x),np.dot(p-centre,y)]) for p in origins]
        rings = [np.ones(len(points),dtype=bool)] if kind=='CYLINDER' else [
            abs(heights-height)<=numeric*8 for height in (heights.min(),heights.max())]
        for ring in rings:
            circle = _circle(xy[ring])
            if circle is not None:
                seeds.append(circle[0])
        for seed in seeds:
            radial = np.linalg.norm(xy-seed,axis=1)
            if kind=='CYLINDER':
                values = np.r_[seed,radial.mean()]
                fit = least_squares(lambda p:np.linalg.norm(xy-p[:2],axis=1)-p[2],values,
                                    xtol=1e-12,ftol=1e-12,gtol=1e-12,max_nfev=80)
                offset,radius = fit.x[:2],float(fit.x[2])
                model = dict(type=kind,axis=axis.tolist(),origin=(centre+offset[0]*x+offset[1]*y).tolist(),radius_mm=radius)
                if radius<numeric*100 or radius>mesh.scale*5:
                    continue
            else:
                slope,intercept = np.polyfit(heights,radial,1)
                fit = least_squares(lambda p:np.linalg.norm(xy-p[:2],axis=1)-p[2]-p[3]*heights,
                                    np.r_[seed,intercept,slope],xtol=1e-12,ftol=1e-12,gtol=1e-12,max_nfev=100)
                offset,intercept,slope = fit.x[:2],float(fit.x[2]),float(fit.x[3])
                if not .005<abs(slope)<100 or np.min(intercept+slope*heights)<-numeric:
                    continue
                model = dict(type=kind,axis=axis.tolist(),origin=(centre+offset[0]*x+offset[1]*y).tolist(),
                             slope=slope,intercept_mm=intercept)
            from .advanced_regions import surface_distance
            residual = float(np.max(np.abs(surface_distance(model,points))))
            if residual>numeric*8:
                continue
            triangles = mesh.triangles[faces]
            probes = np.vstack((triangles.mean(axis=1),((triangles+np.roll(triangles,1,axis=1))/2).reshape(-1,3)))
            chord = float(np.max(np.abs(surface_distance(model,probes))))
            if chord>tolerance*.45:
                continue
            delta = mesh.triangles_center[faces]-model['origin']
            radial = delta-(delta@axis)[:,None]*axis
            radial /= np.maximum(np.linalg.norm(radial,axis=1)[:,None],1e-30)
            expected = radial-model.get('slope',0)*axis
            expected /= np.linalg.norm(expected,axis=1)[:,None]
            normal_dots = np.einsum('ij,ij->i',expected,mesh.face_normals[faces])
            limit = math.cos(math.radians(16))
            if not (np.min(normal_dots)>limit or np.max(normal_dots)<-limit):
                continue
            heights = (points-model['origin'])@axis
            model.update(faces=faces,height_min_mm=float(heights.min()),height_max_mm=float(heights.max()),
                         vertex_residual_mm=residual,chord_probe_mm=chord,outward=float(normal_dots.mean())>0)
            candidates.append(model)
    if not candidates:
        raise RegionEditError(f'Die ausgewählten Dreiecke belegen keinen gemeinsamen {"Zylinder" if kind=="CYLINDER" else "Kegel"} innerhalb des Budgets.')
    return min(candidates,key=lambda m:m['vertex_residual_mm'])


def fit_edit_analysis(mesh, original, session, tolerance, cancel_event=None, *, facet_labels=()):
    if session.mesh_sha256!=mesh_identity(mesh) or session.tolerance!=tolerance:
        raise RegionEditError('Korrektur passt nicht zum geprüften Originalnetz und Budget.')
    groups = defaultdict(list)
    for face,label in enumerate(session.state.labels):
        groups[label].append(face)
    types,requested = dict(session.state.base_types),dict(session.state.requested_types)
    facet_labels=set(facet_labels)
    affected=session.affected_faces()
    if any(label not in groups or label in requested or types[label]!='GRAPH'
           or affected.intersection(groups[label]) for label in facet_labels):
        raise RegionEditError('Nur unberührte automatische Freiformvorschläge dürfen auf Facetten zurückfallen.')
    protected = set(session.state.protected_faces)
    frozen = protected.copy()
    for label,faces in groups.items():
        if requested.get(label)=='REST':
            frozen.update(faces)
    fixed_vertices = set(np.unique(mesh.faces[sorted(frozen)])) if frozen else set()
    planes,plane_ids,regions = [],np.full(len(mesh.faces),-1,dtype=int),[]
    junctions={node for chain in _shared_chains(mesh,np.asarray(session.state.labels))
               for node in (chain['nodes'][0],chain['nodes'][-1])}
    curved_types=('CYLINDER','CONE','GRAPH','REVOLUTION')
    statuses = []
    for label,faces in sorted(groups.items()):
        _cancel(cancel_event)
        kind = requested.get(label,types[label])
        model = None
        if kind in curved_types:
            source = original.regions[int(original.face_regions[faces[0]])]
            if source['type']==kind and set(faces)<=set(source['faces']):
                model = dict(source)
                from .advanced_regions import surface_distance
                vertices = mesh.vertices[np.unique(mesh.faces[faces])]
                residual = float(np.max(np.abs(surface_distance(model,vertices))))
                probes = np.vstack((mesh.triangles[faces].mean(axis=1),
                    ((mesh.triangles[faces]+np.roll(mesh.triangles[faces],1,axis=1))/2).reshape(-1,3)))
                chord = float(np.max(np.abs(surface_distance(model,probes))))
                residual_budget=tolerance*.08 if kind=='GRAPH' else original.numeric_mm*8
                if residual>residual_budget or chord>tolerance*.45:
                    raise RegionEditError('Der geerbte Flächentyp passt nicht zu den ausgewählten Stützpunkten.')
                model.update(faces=faces,vertex_residual_mm=residual,chord_probe_mm=chord)
                if kind!='GRAPH':
                    heights = (vertices-model['origin'])@np.asarray(model['axis'])
                    model.update(height_min_mm=float(heights.min()),height_max_mm=float(heights.max()))
            else:
                if kind=='GRAPH':
                    from .freeform_regions import fit_graph
                    normal=np.average(mesh.face_normals[faces],axis=0,weights=mesh.area_faces[faces])
                    normal/=max(np.linalg.norm(normal),1e-30)
                    model=fit_graph(mesh,faces,normal,tolerance,original.numeric_mm,junctions,cancel_event)
                elif kind=='REVOLUTION':
                    raise RegionEditError('Drehflächen benötigen einen gemeinsam belegten Meridianbereich. Unterschiedliche Drehachsen können nicht zusammengeführt werden.')
                else:
                    model = _fit_curved(mesh,faces,kind,original,tolerance)
        elif kind=='PLANE':
            model = _fit_plane(mesh,faces,original.numeric_mm)
        native_curved = kind in curved_types and label not in facet_labels and not fixed_vertices.intersection(np.unique(mesh.faces[faces]))
        chunks = [faces] if kind=='PLANE' and not protected.intersection(faces) else [[face] for face in faces]
        if label in facet_labels:
            # Retain the pre-fit measured planar groups. This automatic
            # fallback is not a user protection command: existing joint
            # analytic vertices may still move within their checked reserve.
            chunks=[[f for f in faces if int(original.plane_ids[f])==plane_id]
                    for plane_id in sorted(set(map(int,original.plane_ids[faces])))]
        for chunk in chunks:
            plane = _fit_plane(mesh,chunk,original.numeric_mm)
            plane_ids[chunk] = len(planes)
            planes.append(plane)
        if native_curved:
            region = {**model,'plane_groups':sorted(set(map(int,plane_ids[faces])))}
        elif kind=='PLANE':
            region = dict(type='PLANE',normal=model['normal'].tolist(),centre=model['centre'].tolist(),
                          residual_mm=model['residual_mm'])
        else:
            region = dict(type='REST')
        region.update(id=len(regions),edit_id=label,faces=faces,reconstructible=bool(native_curved),
                      reason='Manuell korrigierter Fit; native Prüfung folgt')
        regions.append(region)
        statuses.append(dict(edit_id=label,requested_type=requested.get(label),source_type=types[label],
                             fitted_type=kind,triangles=len(faces),protected_triangles=len(protected.intersection(faces)),
                             native_curved_proposal=bool(native_curved),
                             fit_residual_mm=model.get('vertex_residual_mm',model.get('residual_mm')) if model else 0.,
                             reason='Originalfacetten wegen Schutz/Restvorgabe' if kind in curved_types and not native_curved else 'Fit geprüft; native Rand-/STEP-Prüfung folgt'))
    # Plane ownership is explicit, so splitting and merging plane regions also
    # changes native face boundaries. Curved proposals replace their facets.
    assignments = np.empty(len(mesh.faces),dtype=int)
    for index,region in enumerate(regions):
        assignments[region['faces']] = index
    adjacent = mesh.face_adjacency
    boundary = mesh.face_adjacency_edges[assignments[adjacent[:,0]]!=assignments[adjacent[:,1]]]
    return replace(original,planes=planes,plane_ids=plane_ids,regions=regions,
                   face_regions=assignments,boundary_edges=boundary,
                   edits=dict(kind='source_bound_manual_regions',mesh_sha256=session.mesh_sha256,
                              unmodified_graph_facet_fallback=sorted(facet_labels),
                              protected_faces=sorted(protected),frozen_faces=sorted(frozen),regions=statuses,
                              protected_triangles_mm=mesh.triangles[sorted(protected)].tolist()))


def component_edit_payload(source_mesh, component, payload):
    """Remap observed triangles exactly; never silently drop edits after repair."""
    def key(triangle):
        return tuple(sorted(tuple(map(float,point)) for point in triangle))
    source_keys = {key(triangle):i for i,triangle in enumerate(source_mesh.triangles)}
    try:
        source_ids = [source_keys[key(triangle)] for triangle in component.triangles]
    except KeyError as exc:
        raise RegionEditError('Netzreparatur verändert korrigierte Dreiecke. Das reparierte Netz zuerst öffnen und neu analysieren.') from exc
    if len(set(source_ids))!=len(source_ids):
        raise RegionEditError('Reparierte Dreiecksidentitäten sind nicht eindeutig.')
    labels = [payload['labels'][i] for i in source_ids]
    active = set(labels)
    protected = set(payload['protected_faces'])
    return dict(payload,mesh_sha256=mesh_identity(component),labels=labels,
                base_types={i:kind for i,kind in payload['base_types'].items() if int(i) in active},
                requested_types={i:kind for i,kind in payload['requested_types'].items() if int(i) in active},
                protected_faces=[i for i,original in enumerate(source_ids) if original in protected]),source_ids


def verify_protected_faces(shape, triangles):
    """Check original triangle faces in the actual STEP, including their edges."""
    from scipy.spatial import cKDTree
    import cadquery as cq
    triangles = np.asarray(triangles,dtype=float)
    if not len(triangles):
        return dict(triangles=0,max_vertex_error_mm=0.)
    faces = [f for f in shape.Faces() if f.geomType()=='PLANE' and len(f.Vertices())==3
             and len(f.Edges())==3 and all(e.geomType()=='LINE' for e in f.Edges())]
    if not faces:
        raise RegionEditError('Geschützte Originalflächen fehlen im CAD-Körper.')
    centres = np.asarray([f.Center().toTuple() for f in faces])
    tree = cKDTree(centres)
    maximum = 0.
    for triangle in triangles:
        matches = tree.query_ball_point(triangle.mean(axis=0),1e-7)
        errors = []
        normal = np.cross(triangle[1]-triangle[0],triangle[2]-triangle[0])
        normal /= np.linalg.norm(normal)
        for index in matches:
            if np.dot(normal,faces[index].normalAt(cq.Vector(*triangle.mean(axis=0))).toTuple())<1-1e-8:
                continue
            vertices = np.asarray([v.toTuple() for v in faces[index].Vertices()])
            distance = np.linalg.norm(triangle[:,None,:]-vertices[None,:,:],axis=2)
            errors.append(max(float(distance.min(axis=0).max()),float(distance.min(axis=1).max())))
        if not errors or min(errors)>1e-7:
            raise RegionEditError('Das CAD-/STEP-Ergebnis hat eine geschützte Originalfläche verändert.')
        maximum = max(maximum,min(errors))
    return dict(triangles=len(triangles),max_vertex_error_mm=maximum,checked_actual_native_faces=True,
                checked_surface_orientation=True)
