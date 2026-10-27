"""Trusted interpreter for validated data plans, launched in a private job directory."""
import json, os, traceback
from pathlib import Path
import FreeCAD as App
import Part

job = Path(os.environ['FORMNARO_FREECAD_JOB'])
data = json.loads((job / 'input.json').read_text(encoding='utf-8'))
plan = data['plan']
params = plan.get('parameters', {})
shapes, objects, reports = {}, {}, []
doc = App.newDocument('Formnaro')
def num(v): return params[v['param']] if isinstance(v, dict) else v
def vec(v): return App.Vector(*[num(x) for x in v])
def bounds(s):
    b = s.BoundBox
    return [b.XMin, b.YMin, b.ZMin, b.XMax, b.YMax, b.ZMax]
def inspect(s, topology=False):
    r = dict(valid=s.isValid(), closed=s.isClosed(), solids=len(s.Solids), faces=len(s.Faces), edges=len(s.Edges), volume=s.Volume, area=s.Area, bounds=bounds(s))
    try: s.check(True); r['check'] = 'passed'
    except Exception as e: r['check'] = str(e)
    r['invalidFaces'] = [{'index': i+1, 'bounds': bounds(f)} for i,f in enumerate(s.Faces) if not f.isValid()]
    if topology:
        r['edgeDetails'] = [{'index':i+1,'length':e.Length,'bounds':bounds(e)} for i,e in enumerate(s.Edges[:256])]
        r['faceDetails'] = [{'index':i+1,'area':f.Area,'bounds':bounds(f),'surface':type(f.Surface).__name__} for i,f in enumerate(s.Faces[:256])]
        r['topologyReturned'] = min(256, len(s.Edges)), min(256, len(s.Faces))
    return r
def add(name, shape, step=None):
    if shape.isNull(): raise ValueError('Leere Geometrie: '+name)
    obj = doc.addObject('Part::Feature', name)
    obj.Shape = shape
    if step:
        obj.addProperty('App::PropertyString','ConstructionJSON','Formnaro'); obj.ConstructionJSON=json.dumps(step)
        dependencies=[objects[x] for k in ('source','tool','path') if (x:=step.get(k)) in objects]
        dependencies += [objects[x] for x in step.get('sources', [])]
        if dependencies: obj.addProperty('App::PropertyLinkList','Sources','Formnaro'); obj.Sources=dependencies
    shapes[name], objects[name] = shape, obj
try:
    for item in data['inputs']:
        filename = str(job / item['file'])
        if item['format'] == 'step': s=Part.read(filename)
        else:
            import Mesh
            m=Mesh.Mesh(filename); s=Part.Shape(); s.makeShapeFromMesh(m.Topology, 0.01)
        add(item['name'], s)
    for index, step in enumerate(plan['steps']):
        op, name = step['op'], step['id']
        source = shapes.get(step.get('source'))
        origin=vec(step.get('origin',[0,0,0])); axis=vec(step.get('axis',[0,0,1]))
        if op=='box': s=Part.makeBox(*[num(x) for x in step['size']], origin)
        elif op=='cylinder': s=Part.makeCylinder(num(step['radius']),num(step['height']),origin,axis)
        elif op=='cone': s=Part.makeCone(num(step['radius']),num(step['radius2']),num(step['height']),origin,axis)
        elif op=='sphere': s=Part.makeSphere(num(step['radius']),origin)
        elif op=='torus': s=Part.makeTorus(num(step['radius']),num(step['radius2']),origin,axis)
        elif op=='polygon':
            points=[vec(v) for v in step['points']]
            if (points[0]-points[-1]).Length>1e-9: points.append(points[0])
            s=Part.Face(Part.makePolygon(points))
        elif op=='wire':
            points=[vec(v) for v in step['points']]
            if step.get('closed',False) and (points[0]-points[-1]).Length>1e-9: points.append(points[0])
            s=Part.makePolygon(points)
        elif op=='sketch':
            import Sketcher
            sketch=doc.addObject('Sketcher::SketchObject',name+'_Sketch')
            def p2(p): return App.Vector(num(p[0]),num(p[1]),0)
            for e in step['elements']:
                if e['type']=='line': geometry=Part.LineSegment(p2(e['start']),p2(e['end']))
                elif e['type']=='arc': geometry=Part.Arc(p2(e['start']),p2(e['mid']),p2(e['end']))
                else: geometry=Part.Circle(p2(e['center']),App.Vector(0,0,1),num(e['radius']))
                sketch.addGeometry(geometry,False)
            for c in step.get('constraints',[]): sketch.addConstraint(Sketcher.Constraint(c['type'],*[num(a) for a in c['args']]))
            sketch.Placement=App.Placement(origin,App.Rotation(App.Vector(0,0,1),axis));doc.recompute()
            if sketch.solve()!=0: raise ValueError('Skizzenbedingungen widersprüchlich oder nicht lösbar')
            wires=sketch.Shape.Wires
            if not wires: raise ValueError('Skizze enthält keinen zusammenhängenden Pfad')
            s=Part.Face(wires[0]) if len(wires)==1 and wires[0].isClosed() else sketch.Shape.copy()
        elif op=='circle': s=Part.Face(Part.Wire(Part.makeCircle(num(step['radius']),origin,axis)))
        elif op=='extrude': s=source.extrude(vec(step['vector']))
        elif op=='revolve': s=source.revolve(origin,axis,num(step['angle']))
        elif op=='loft': s=Part.makeLoft([shapes[x].Wires[0] for x in step['sources']],step.get('solid',True),step.get('ruled',False))
        elif op=='sweep': s=shapes[step['path']].Wires[0].makePipeShell([source.Wires[0]],step.get('solid',True),step.get('frenet',False))
        elif op in ('fuse','common'):
            inputs=[shapes[x] for x in step['sources']]; s=inputs[0]
            for other in inputs[1:]: s=getattr(s,op)(other)
        elif op=='cut': s=source.cut(shapes[step['tool']])
        elif op in ('fillet','chamfer'): s=getattr(source,'makeFillet' if op=='fillet' else 'makeChamfer')(num(step['radius']),[source.Edges[i-1] for i in step['edges']])
        elif op=='shell': s=source.makeThickness([source.Faces[i-1] for i in step['faces']],num(step['thickness']),num(step.get('tolerance',0.001)))
        elif op=='offset': s=source.makeOffsetShape(num(step['distance']),num(step.get('tolerance',0.001)))
        elif op=='refine': s=source.removeSplitter()
        elif op=='repair': s=source.copy(); t=num(step.get('tolerance',0.001)); s.fix(t,t,t)
        elif op=='solid': s=Part.makeSolid(Part.makeShell(source.Faces))
        elif op=='section': s=source.section(shapes[step['tool']])
        elif op=='transform':
            s=source.copy()
            if 'angle' in step: s.rotate(origin,axis,num(step['angle']))
            if 'translation' in step: s.translate(vec(step['translation']))
        elif op=='inspect': reports.append(dict(id=name,source=step['source'],**inspect(source,True))); continue
        elif op=='distance':
            distance, points, info=source.distToShape(shapes[step['tool']]); reports.append(dict(id=name,distance=distance,points=[[[p.x,p.y,p.z] for p in pair] for pair in points[:32]],totalPairs=len(points))); continue
        else: raise ValueError('Unbekannte Operation')
        add(name,s,step)
    result=shapes[plan['output']]; proof=inspect(result,True)
    if not data.get('inspectOnly') and (not proof['valid'] or not proof['closed'] or not proof['solids'] or proof['check']!='passed'):
        # Separate imported-source failures from failures introduced by the last
        # operation. Large topology lists otherwise hide this in provider feedback.
        last=next((s for s in plan['steps'] if s['id']==plan['output']),{})
        operands=list(dict.fromkeys([last[k] for k in ('source','tool') if k in last]+last.get('sources',[])))
        proof['operandChecks']=[dict(name=n,**inspect(shapes[n])) for n in operands]
        proof['inputChecks']=[dict(name=i['name'],**inspect(shapes[i['name']])) for i in data['inputs']]
        summary={k:proof[k] for k in ('valid','closed','solids','check')}
        raise ValueError('Das FreeCAD-Ergebnis ist kein gültiger geschlossener Volumenkörper: '+json.dumps(summary))
    if not data.get('inspectOnly'):
        result.exportStep(str(job/'result.step'))
        readback=inspect(Part.read(str(job/'result.step')),True)
        if not readback['valid'] or not readback['closed'] or not readback['solids'] or readback['check']!='passed' or readback['solids']!=proof['solids'] or abs(readback['volume']-proof['volume'])>max(1e-6,abs(proof['volume'])*1e-8):
            raise ValueError('STEP-Rückleseprüfung stimmt nicht mit dem nativen CAD-Programm überein.')
        obj=objects[plan['output']]; obj.addProperty('App::PropertyString','FormnaroPlan','Formnaro'); obj.FormnaroPlan=json.dumps(plan)
        doc.recompute(); doc.saveAs(str(job/'result.FCStd'))
    output=dict(ok=True,engineVersion='.'.join(App.Version()[:3]),occt=Part.OCC_VERSION,report=proof,measurements=reports,**(dict(stepReadback=readback,resultObject=obj.Name) if not data.get('inspectOnly') else {}))
except Exception as e:
    output=dict(ok=False,error=str(e)[:16000],step=locals().get('index',-1)+1,operation=locals().get('op'),diagnostics=locals().get('proof'))
(job/'result.json').write_text(json.dumps(output),encoding='utf-8')
App.closeDocument(doc.Name)
