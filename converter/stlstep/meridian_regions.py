"""Source-observed continuous meridians across multiple conical bands."""
from collections import defaultdict
from dataclasses import replace
import numpy as np
from scipy.interpolate import PchipInterpolator
from scipy.optimize import least_squares
from .local_regions import _circle
from .local_regions import _cancel


def _tangent_profile(lower,upper):
    c0,r0=np.asarray(lower[:2]),lower[2];c1,r1=np.asarray(upper[:2]),upper[2]
    delta=c1-c0;length=np.linalg.norm(delta)
    if length<=abs(r1-r0):raise ValueError('Meridiankreise haben keine gemeinsame äußere Tangente')
    along=delta/length;perpendicular=np.array([along[1],-along[0]])
    ratio=(r1-r0)/length
    normal=ratio*along+np.sqrt(1-ratio*ratio)*perpendicular
    if normal[0]<0:normal=ratio*along-np.sqrt(1-ratio*ratio)*perpendicular
    p0=c0-r0*normal;p1=c1-r1*normal
    return p0,p1,normal


def _circle_profile_distance(profile,points):
    # Points are (height,radius); circle coordinates are (radius,height).
    h,r=np.atleast_2d(points).T
    low=np.asarray(profile['lower']);high=np.asarray(profile['upper'])
    p0,p1,normal=_tangent_profile(low,high)
    xy=np.column_stack((r,h));distance=(xy-p0)@normal
    below=h<p0[1];above=h>p1[1]
    distance[below]=low[2]-np.linalg.norm(xy[below]-low[:2],axis=1)
    distance[above]=high[2]-np.linalg.norm(xy[above]-high[:2],axis=1)
    return distance


def _fit_circle_profile(nodes,numeric):
    intervals=np.diff(nodes[:,0]);long=int(np.argmax(intervals))
    if intervals[long]<np.median(intervals)*4 or long<3 or len(nodes)-long<4:return None
    low=_circle(nodes[:long+1,::-1]);high=_circle(nodes[long+1:,::-1])
    if low is None or high is None:return None
    lo=np.r_[low[0],low[1]];hi=np.r_[high[0],high[1]]
    if max(np.max(abs(np.linalg.norm(nodes[:long+1,::-1]-lo[:2],axis=1)-lo[2])),
           np.max(abs(np.linalg.norm(nodes[long+1:,::-1]-hi[:2],axis=1)-hi[2])))>numeric*8:return None
    # End rings fix height at the lower cylinder tangency and upper cap.
    # Fit the radii/centres to observations rather than nominal dimensions.
    h0,h1=nodes[0,0],nodes[-1,0];r0=nodes[0,1]
    def values(parameters):
        rl,ru,rc=parameters
        return dict(lower=[r0+rl,h0,rl],upper=[rc,h1-ru,ru],height_min=float(h0),height_max=float(h1))
    def residual(parameters):
        try:return _circle_profile_distance(values(parameters),nodes)
        except ValueError:return np.ones(len(nodes))*1e4
    fit=least_squares(residual,[lo[2],hi[2],hi[0]],bounds=([numeric*100,numeric*100,0],[1e4,1e4,1e5]),
                      xtol=1e-13,ftol=1e-13,gtol=1e-13,max_nfev=100)
    profile=values(fit.x)
    if np.max(abs(_circle_profile_distance(profile,nodes)))>numeric*8:return None
    return profile


def _circle_profile_curve(model):
    from OCP.Geom import Geom_Circle,Geom_Line,Geom_TrimmedCurve
    from OCP.GeomConvert import GeomConvert_CompCurveToBSplineCurve
    from OCP.gp import gp_Ax2,gp_Pnt,gp_Dir
    profile=model['circle_profile'];low=np.asarray(profile['lower']);high=np.asarray(profile['upper'])
    p0,p1,_=_tangent_profile(low,high)
    origin=np.asarray(model['origin']);x=np.asarray(model['x_direction']);axis=np.asarray(model['axis'])
    def world(point):return origin+x*point[0]+axis*point[1]
    def arc(circle,start,end):
        centre,radius=circle[:2],circle[2]
        curve=Geom_Circle(gp_Ax2(gp_Pnt(*world(centre)),gp_Dir(*np.cross(x,axis)),gp_Dir(*x)),float(radius))
        a=np.arctan2(*(start-centre)[::-1]);b=np.arctan2(*(end-centre)[::-1])
        return Geom_TrimmedCurve(curve,float(min(a,b)),float(max(a,b)),bool(b>a))
    first=arc(low,np.array([low[0]-low[2],low[1]]),p0)
    last=arc(high,p1,np.array([high[0],high[1]+high[2]]))
    direction=world(p1)-world(p0);length=np.linalg.norm(direction)
    line=Geom_TrimmedCurve(Geom_Line(gp_Pnt(*world(p0)),gp_Dir(*(direction/length))),0.,float(length))
    builder=GeomConvert_CompCurveToBSplineCurve(first)
    if not builder.Add(line,1e-7,True) or not builder.Add(last,1e-7,True):
        raise ValueError('Gemessene Meridianstücke lassen sich nicht kontinuierlich verbinden')
    return builder.BSplineCurve()


def profile_values(model,heights):
    heights=np.atleast_1d(heights).astype(float)
    nodes=np.asarray(model['profile_nodes']);slopes=np.asarray(model['profile_slopes'])
    index=np.clip(np.searchsorted(nodes[:,0],heights,side='right')-1,0,len(nodes)-2)
    low,high=nodes[index],nodes[index+1];span=high[:,0]-low[:,0]
    t=(heights-low[:,0])/span
    segment_slopes=np.asarray(model.get('segment_slopes',np.column_stack((slopes[:-1],slopes[1:]))))
    m0,m1=segment_slopes[index,0],segment_slopes[index,1]
    radius=(2*t**3-3*t*t+1)*low[:,1]+(t**3-2*t*t+t)*span*m0+(-2*t**3+3*t*t)*high[:,1]+(t**3-t*t)*span*m1
    derivative=((6*t*t-6*t)*low[:,1]+(3*t*t-4*t+1)*span*m0+(-6*t*t+6*t)*high[:,1]+(3*t*t-2*t)*span*m1)/span
    return radius,derivative


def meridian_distance(model,points):
    points=np.atleast_2d(points);delta=points-model['origin'];axis=np.asarray(model['axis'])
    height=delta@axis;radial=np.linalg.norm(delta-height[:,None]*axis,axis=1)
    if model.get('circle_profile'):
        return _circle_profile_distance(model['circle_profile'],np.column_stack((height,radial)))
    radius,slope=profile_values(model,height)
    return (radial-radius)/np.sqrt(1+slope*slope)


def meridian_normal(model,point):
    delta=np.asarray(point)-model['origin'];axis=np.asarray(model['axis']);height=np.dot(delta,axis)
    radial=delta-height*axis;radial/=np.linalg.norm(radial)
    if model.get('circle_profile'):
        profile=model['circle_profile'];p0,p1,normal=_tangent_profile(profile['lower'],profile['upper'])
        if height<p0[1] or height>p1[1]:
            circle=np.asarray(profile['lower'] if height<p0[1] else profile['upper'])
            radius=np.linalg.norm(delta-height*axis);d=np.array([radius,height])-circle[:2]
            normal=-d/np.linalg.norm(d)
        result=normal[0]*radial+normal[1]*axis
        return result if model['outward'] else -result
    _,slope=profile_values(model,[height])
    result=radial-slope[0]*axis
    return result if model['outward'] else -result


def meridian_surface(model):
    from OCP.Geom import Geom_BSplineCurve,Geom_SurfaceOfRevolution
    from OCP.gp import gp_Pnt,gp_Ax1,gp_Dir
    from OCP.TColgp import TColgp_Array1OfPnt
    from OCP.TColStd import TColStd_Array1OfReal,TColStd_Array1OfInteger
    if model.get('circle_profile'):
        curve=_circle_profile_curve(model)
        return Geom_SurfaceOfRevolution(curve,gp_Ax1(gp_Pnt(*model['origin']),gp_Dir(*model['axis'])))
    nodes=np.asarray(model['profile_nodes']);slopes=np.asarray(model['profile_slopes'])
    segment_slopes=np.asarray(model.get('segment_slopes',np.column_stack((slopes[:-1],slopes[1:]))))
    # Shared trims may bow slightly beyond the observed end ring, as they do
    # on an infinite cone. Extend only the already linear boundary generators;
    # the resulting faces are still trimmed by the source boundary graph.
    left=(nodes[1,0]-nodes[0,0])*2;right=(nodes[-1,0]-nodes[-2,0])*2
    left_slope=segment_slopes[0,0];right_slope=segment_slopes[-1,1]
    nodes=np.vstack((nodes[0]-[left,left_slope*left],nodes,nodes[-1]+[right,right_slope*right]))
    segment_slopes=np.vstack(([left_slope,left_slope],segment_slopes,[right_slope,right_slope]))
    axis=np.asarray(model['axis']);x=np.asarray(model['x_direction']);origin=np.asarray(model['origin'])
    controls=[]
    for i,(a,b) in enumerate(zip(nodes,nodes[1:])):
        dh=b[0]-a[0]
        segment=[a,a+[dh/3,segment_slopes[i,0]*dh/3],b-[dh/3,segment_slopes[i,1]*dh/3],b]
        controls.extend(segment if i==0 else segment[1:])
    poles=TColgp_Array1OfPnt(1,len(controls))
    for i,(height,radius) in enumerate(controls,1):poles.SetValue(i,gp_Pnt(*(origin+axis*height+x*radius)))
    knots=TColStd_Array1OfReal(1,len(nodes));mult=TColStd_Array1OfInteger(1,len(nodes))
    for i,node in enumerate(nodes,1):
        knots.SetValue(i,float(node[0]));mult.SetValue(i,4 if i in (1,len(nodes)) else 3)
    curve=Geom_BSplineCurve(poles,knots,mult,3,False)
    for index in range(len(nodes)-1,1,-1):curve.RemoveKnot(index,2,1e-10)
    return Geom_SurfaceOfRevolution(curve,gp_Ax1(gp_Pnt(*origin),gp_Dir(*axis)))


def meridian_analysis(mesh,analysis,tolerance,cancel_event=None):
    blocked={face for region in analysis.regions if region['type'] in ('CYLINDER','CONE') for face in region['faces']}
    adjacency=defaultdict(set)
    for a,b in mesh.face_adjacency:adjacency[int(a)].add(int(b));adjacency[int(b)].add(int(a))
    groups=defaultdict(list)
    for region in analysis.regions:
        if region['type']!='CONE':continue
        axis=np.asarray(region['axis']);origin=np.asarray(region['origin'])
        perpendicular=origin-np.dot(origin,axis)*axis
        key=tuple(np.round(np.r_[axis,perpendicular],4))
        groups[key].append(region)
    replaced=set();new=[]
    for regions in groups.values():
        _cancel(cancel_event)
        if len(regions)<3:continue
        all_regions=regions.copy()
        # End bands carry interfaces to non-axisymmetric fillets and planar
        # fringe details. Keep those measured trims while merging the interior.
        ordered=sorted(regions,key=lambda r:r['height_min_mm'])
        if len(ordered)>=6:regions=ordered[1:-1]
        faces=sorted({face for region in regions for face in region['faces']})
        first=regions[0];axis=np.asarray(first['axis']);origin=np.asarray(first['origin'])
        points=mesh.vertices[np.unique(mesh.faces[faces])]-origin
        heights=points@axis;radial=np.linalg.norm(points-heights[:,None]*axis,axis=1)
        # Rings may contain float32 noise. Aggregate only within the numerical
        # resolution; never collapse a meaningful observed profile interval.
        order=np.argsort(heights);buckets=[]
        for index in order:
            if not buckets or heights[index]-heights[buckets[-1][0]]>analysis.numeric_mm*8:buckets.append([])
            buckets[-1].append(int(index))
        nodes=np.asarray([[float(np.median(heights[b])),float(np.median(radial[b]))] for b in buckets])
        if len(nodes)<4 or np.any(np.diff(nodes[:,0])<=analysis.numeric_mm*20):continue
        interpolator=PchipInterpolator(nodes[:,0],nodes[:,1]);slopes=interpolator.derivative()(nodes[:,0])
        intervals=np.diff(nodes[:,0]);secants=np.diff(nodes[:,1])/intervals
        straight=np.flatnonzero(intervals>np.median(intervals)*4)
        for interval in straight:slopes[interval:interval+2]=secants[interval]
        segment_slopes=np.column_stack((slopes[:-1],slopes[1:]))
        # Boundary bands keep their observed generator. Smoothing these bands
        # can split a legitimate neighbouring trim into disconnected branches.
        for interval in (0,len(intervals)-1):segment_slopes[interval]=secants[interval]
        model=dict(type='REVOLUTION',axis=axis.tolist(),origin=origin.tolist(),faces=faces,
                   profile_nodes=nodes.tolist(),profile_slopes=slopes.tolist(),segment_slopes=segment_slopes.tolist(),outward=first['outward'],
                   conical_bands_replaced=len(regions),plane_groups=sorted({i for r in regions for i in r['plane_groups']}))
        full_faces=sorted({f for r in all_regions for f in r['faces']})
        full=mesh.vertices[np.unique(mesh.faces[full_faces])]-origin
        fh=full@axis;fr=np.linalg.norm(full-fh[:,None]*axis,axis=1)
        rings=defaultdict(list)
        for i,height in enumerate(fh):rings[round(float(height),5)].append(i)
        all_nodes=np.asarray(sorted([[float(np.median(fh[indices])),float(np.median(fr[indices]))] for indices in rings.values()]))
        circles=_fit_circle_profile(all_nodes,analysis.numeric_mm)
        if circles:model['circle_profile']=circles
        residual=float(np.max(abs(meridian_distance(model,mesh.vertices[np.unique(mesh.faces[faces])]))))
        triangles=mesh.triangles[faces]
        probes=np.vstack((triangles.mean(axis=1),((triangles+np.roll(triangles,1,axis=1))/2).reshape(-1,3)))
        chord=float(np.max(abs(meridian_distance(model,probes))))
        if residual>analysis.numeric_mm*8 or chord>tolerance*.45:continue
        # Some float32 fringe triangles are on the same observed meridian but
        # did not form a conical seed. Retain true caps (zero height span) and
        # grow only across supported, consistently oriented surface samples.
        support=set(faces);pending=set().union(*(adjacency[f] for f in support))-support-blocked
        while pending:
            face=pending.pop();triangle=mesh.triangles[face]
            height=(triangle-origin)@axis
            if np.ptp(height)<analysis.numeric_mm*20 or height.min()<nodes[0,0]-analysis.numeric_mm*8 or height.max()>nodes[-1,0]+analysis.numeric_mm*8:continue
            if np.max(abs(meridian_distance(model,triangle)))>analysis.numeric_mm*8:continue
            expected=meridian_normal(model,mesh.triangles_center[face]);expected/=np.linalg.norm(expected)
            if np.dot(expected,mesh.face_normals[face])<.97:continue
            probes=np.vstack((triangle.mean(axis=0),(triangle+np.roll(triangle,1,axis=0))/2))
            if np.max(abs(meridian_distance(model,probes)))>tolerance*.45:continue
            support.add(face);pending.update(adjacency[face]-support-blocked)
        model['faces']=sorted(support)
        model['fringe_triangles_added']=len(support)-len(faces)
        model.update(vertex_residual_mm=residual,chord_probe_mm=chord)
        model.update(reconstructible=True,reason='Zusammenhängender Meridian-Fit; native Rand-/STEP-Prüfung folgt')
        new.append(model);replaced.update(support)
    if not new:return None
    regions=[dict(region,faces=[face for face in region['faces'] if face not in replaced])
             for region in analysis.regions if any(face not in replaced for face in region['faces'])]+new
    assignments=np.empty(len(mesh.faces),dtype=int)
    for i,region in enumerate(regions):region['id']=i;assignments[region['faces']]=i
    adjacent=mesh.face_adjacency
    boundary=mesh.face_adjacency_edges[assignments[adjacent[:,0]]!=assignments[adjacent[:,1]]]
    return replace(analysis,regions=regions,face_regions=assignments,boundary_edges=boundary)


def large_meridian_shape(mesh,tolerance,progress=None,*,cancel_event=None):
    from .advanced_regions import analyse_advanced_regions,advanced_region_shape
    original=analyse_advanced_regions(mesh,tolerance,cancel_event)
    fitted=meridian_analysis(mesh,original,tolerance,cancel_event)
    if fitted is None:return None
    result=advanced_region_shape(mesh,tolerance,progress,analysis=fitted,cancel_event=cancel_event)
    if result is None:return None
    shape,details=result
    details.update(kind='connected_BSpline_meridian_regions',
                   meridian_regions=[r for r in fitted.regions if r['type']=='REVOLUTION'])
    return shape,details
