"""Convenience helpers. The complete installed FreeCAD API stays available."""
import importlib
import FreeCAD as App
import Part

def inspect_shape(shape, topology=False):
    s=getattr(shape,'Shape',shape)
    b=s.BoundBox
    result=dict(valid=s.isValid(),closed=s.isClosed(),solids=len(s.Solids),faces=len(s.Faces),edges=len(s.Edges),volume=s.Volume,area=s.Area,bounds=[b.XMin,b.YMin,b.ZMin,b.XMax,b.YMax,b.ZMax])
    try:s.check(True);result['check']='passed'
    except Exception as e:result['check']=str(e)
    if topology:
        result['faceDetails']=[dict(index=i+1,area=f.Area,surface=type(f.Surface).__name__) for i,f in enumerate(s.Faces)]
        result['edgeDetails']=[dict(index=i+1,length=e.Length,curve=type(e.Curve).__name__) for i,e in enumerate(s.Edges)]
    return result

def sew_solid(faces):
    """Sew explicit measured faces and require a valid closed material solid."""
    shell=Part.makeShell([getattr(f,'Shape',f) for f in faces])
    shell.sewShape()
    solid=Part.makeSolid(shell)
    if solid.Volume<0:solid.reverse()
    solid.check(True)
    if not solid.isClosed() or not solid.Solids:raise ValueError('Faces do not enclose a closed solid')
    return solid

def inside(shape, points, tolerance=1e-7, boundary=True):
    """Exact native BRep point classification; no mesh or bounding-box guess."""
    shape=getattr(shape,'Shape',shape)
    return [bool(shape.isInside(App.Vector(*p),float(tolerance),bool(boundary))) for p in points]

def api(module='Part', search='', limit=80):
    """Discover installed module members and their native Python docstrings."""
    obj=importlib.import_module(module)
    names=[n for n in dir(obj) if not n.startswith('_') and search.lower() in n.lower()]
    return dict(module=module,total=len(names),members=[dict(name=n,doc=(getattr(getattr(obj,n),'__doc__','') or '')[:4000]) for n in names[:limit]])
