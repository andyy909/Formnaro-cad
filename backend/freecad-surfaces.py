"""Versioned surface construction helpers archived with their FCStd documents."""
import json
import math
import FreeCAD as App
from FreeCAD import Base
import Part

TOL = 1e-6


def number(value, low, high, name):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError('Ungültiger Wert: ' + name)
    return value


def vector(value):
    if not isinstance(value, list) or len(value) != 3:
        raise ValueError('Drei Koordinaten erforderlich.')
    return App.Vector(*[number(v, -100000, 100000, 'Koordinate') for v in value])


def checked(shape):
    if shape.isNull() or not shape.isValid() or not shape.isClosed() or len(shape.Solids) != 1 or shape.Volume <= 1e-7:
        raise ValueError('Kein gültiger einzelner geschlossener Körper. Offene Flächen werden nicht als Körper übernommen.')
    shape.check(True)
    return shape


def selected_face(shapes, ref):
    if not isinstance(ref, dict) or set(ref) != {'source', 'point', 'normal'} or ref['source'] not in shapes:
        raise ValueError('Ungültiger Flächenbezug.')
    point, normal = vector(ref['point']), vector(ref['normal'])
    if abs(normal.Length-1) > .01:
        raise ValueError('Einheitsnormale erforderlich.')
    normal.normalize()
    found = []
    for index, face in enumerate(shapes[ref['source']].Faces):
        if face.distToShape(Part.Vertex(point))[0] > TOL:
            continue
        try:
            u, v = face.Surface.parameter(point)
            if face.normalAt(u, v).dot(normal) > 1-1e-5:
                found.append((index, face.copy()))
        except Exception:
            pass
    if len(found) != 1:
        raise ValueError('Fläche nicht eindeutig. Erneut im Inneren auswählen.')
    return found[0]


def seam_quality(surface, edges):
    # A bounded diagnostic, deliberately separate from native solid validity.
    gaps = []
    for edge in edges:
        for i in range(17):
            p = edge.valueAt(edge.FirstParameter+(edge.LastParameter-edge.FirstParameter)*i/16)
            gaps.append(surface.distToShape(Part.Vertex(p))[0])
    maximum = max(gaps, default=0)
    if maximum > 10*TOL:
        raise ValueError('Randanschluss überschreitet 0,00001 mm.')
    return {'position': 'G0', 'maxSampleGap': maximum, 'samples': len(gaps),
            'sampling': True, 'tangentContinuity': 'nicht zugesichert', 'curvatureContinuity': 'nicht zugesichert'}


def polygon_profile(loops):
    if not isinstance(loops, list) or not 1 <= len(loops) <= 16 or sum(len(loop) for loop in loops) > 128:
        raise ValueError('Eine Außenkontur und höchstens 15 Öffnungen, insgesamt höchstens 128 Punkte.')
    wires, clean = [], []
    for index, loop in enumerate(loops):
        if not isinstance(loop, list) or not 3 <= len(loop) <= 128:
            raise ValueError('Jede Kontur benötigt mindestens drei Punkte.')
        points = []
        for p in loop:
            if not isinstance(p, list) or len(p) != 2:
                raise ValueError('Zwei Profilkoordinaten erforderlich.')
            points.append([number(v, -10000, 10000, 'Profilkoordinate') for v in p])
        area = sum(a[0]*b[1]-b[0]*a[1] for a, b in zip(points, points[1:]+points[:1]))/2
        if abs(area) < 1e-6:
            raise ValueError('Die Konturfläche ist zu klein.')
        if (area > 0) != (index == 0):
            points.reverse()
        wire = Part.makePolygon([App.Vector(x, y, 0) for x, y in points+[points[0]]])
        if not wire.isClosed() or not wire.isValid():
            raise ValueError('Ungültige Profilkontur.')
        wires.append(wire); clean.append(points)
    face = Part.Face(wires)
    if not face.isValid() or face.Area < 1e-6 or len(face.Faces) != 1:
        raise ValueError('Konturen schneiden sich oder Öffnungen liegen nicht vollständig im Außenrand.')
    face.check(True)
    return face, clean


def transition_angles(result, supports):
    angles = []
    for support in supports:
        sides = [face for face in result.Faces if face.common(support).Area < TOL]
        for edge in support.Edges:
            for i in range(1, 16):
                point = edge.valueAt(edge.FirstParameter+(edge.LastParameter-edge.FirstParameter)*i/16)
                normal = support.normalAt(*support.Surface.parameter(point))
                candidates = [face for face in sides if face.distToShape(Part.Vertex(point))[0] < 10*TOL]
                if len(candidates) != 1:
                    raise ValueError('Anschlussnormale am Übergang nicht eindeutig messbar.')
                other = candidates[0].normalAt(*candidates[0].Surface.parameter(point))
                angles.append(math.degrees(math.acos(min(1, max(0, abs(normal.dot(other)))))))
    return {'maxSampleNormalAngleDegrees': max(angles), 'normalSamples': len(angles)}


def relief(source, face, reference, p):
    depth = number(p['depth'], .001, 1000, 'Tiefe')
    angle = math.radians(number(p['rotation'], -360, 360, 'Profildrehung'))
    if p['mode'] not in ['add', 'cut']:
        raise ValueError('Prägung oder Vertiefung auswählen.')
    profile, loops = polygon_profile(p['loops'])
    loops = [[[x*math.cos(angle)-y*math.sin(angle), x*math.sin(angle)+y*math.cos(angle)] for x, y in loop] for loop in loops]
    point = vector(reference['point'])
    u, v = face.Surface.parameter(point)
    normal = face.normalAt(u, v)
    overlap = min(.01, depth/10)
    cylindrical = isinstance(face.Surface, Part.Cylinder)
    if isinstance(face.Surface, Part.Plane):
        xdir = App.Vector(1, 0, 0)
        if abs(normal.dot(xdir)) > .99:
            xdir = App.Vector(0, 1, 0)
        xdir = xdir-normal*xdir.dot(normal); xdir.normalize()
        ydir = normal.cross(xdir)
        wires = [Part.makePolygon([point+xdir*x+ydir*y for x, y in loop+[loop[0]]]) for loop in loops]
        patch = Part.Face(wires)
        if patch.normalAt(*patch.Surface.parameter(point)).dot(normal) < 0:
            patch.reverse()
        tool = patch.copy()
        tool.translate(normal*(-overlap if p['mode'] == 'add' else -depth))
        tool = tool.extrude(normal*(depth+overlap))
        mapping = 'Ebene, exakte Polygonkontur'
    elif cylindrical:
        cylinder = face.Surface
        if cylinder.normal(u, v).dot(normal) < .99:
            raise ValueError('Zunächst nur äußere Zylinderflächen verwenden.')
        radius = cylinder.Radius
        if depth >= radius/2:
            raise ValueError('Tiefe muss kleiner als der halbe Zylinderradius sein.')
        xs = [x for loop in loops for x, y in loop]
        if max(xs)-min(xs) >= math.pi*radius:
            raise ValueError('Zylinderprofil muss schmaler als ein halber Umfang sein.')
        for loop in loops:
            if any(abs(a[0]-b[0]) > TOL and abs(a[1]-b[1]) > TOL for a, b in zip(loop, loop[1:]+loop[:1])):
                raise ValueError('Zunächst nur orthogonale Zylinderkonturen: Kanten entlang Bogenrichtung oder Achse, Profildrehung in 90°-Schritten. Schräge UV-Kanten bestehen die STEP-Rückleseprüfung noch nicht zuverlässig.')

        def mapped(r):
            surface = cylinder.copy(); surface.Radius = r
            wires = []
            for loop in loops:
                uv = [(u+x/radius, v+y) for x, y in loop]
                edges = [Part.Geom2d.Line2dSegment(Base.Vector2d(*a), Base.Vector2d(*b)).toShape(surface) for a, b in zip(uv, uv[1:]+uv[:1])]
                wires.append(Part.Wire(edges))
            outer = Part.Face(surface, wires[0])
            for hole in wires[1:]:
                outer = outer.cut(Part.Face(surface, hole))
            if len(outer.Faces) != 1:
                raise ValueError('Zylinderkontur ergibt keine einzelne Fläche.')
            return outer.Faces[0]

        patch = mapped(radius)
        bottom = radius-overlap if p['mode'] == 'add' else radius-depth
        tool = mapped(bottom).makeOffsetShape(depth+overlap, TOL, fill=True)
        mapping = 'Zylinder, exakte UV-Linien; X ist Bogenlänge am Ausgangsradius, Y entlang der Achse'
    else:
        raise ValueError('Zunächst nur Ebenen und äußere Zylinderflächen; andere gekrümmte Flächen sind nicht freigegeben.')
    if not patch.isValid() or not tool.isValid():
        raise ValueError('Profil ergibt keine gültige Fläche oder Werkzeuggeometrie.')
    inside = patch.common(face)
    if abs(inside.Area-patch.Area) > max(1e-6, patch.Area*1e-7):
        raise ValueError('Das gesamte Profil muss innerhalb der ausgewählten Fläche liegen, einschließlich Öffnungen und Beschnitt.')
    result = source.fuse(tool) if p['mode'] == 'add' else source.cut(tool)
    result = checked(result.removeSplitter())
    delta = result.Volume-source.Volume
    if (delta if p['mode'] == 'add' else -delta) <= 1e-6:
        raise ValueError('Das Profil verändert das Material nicht in der gewählten Richtung.')
    return result, {'mapping': mapping, 'profileArea': profile.Area, 'materialChange': delta,
                    'connection': {'position': 'Kontakt mit Ausgangsfläche geprüft', 'tangentContinuity': 'nicht zugesichert'}}


def construct(shapes, p):
    kind = p['kind']
    report = {'kind': kind, 'staticInputs': bool(shapes), 'solidValidity': 'nativ geprüft'}
    if kind == 'surface-fill':
        curves = p['boundary']
        if not isinstance(curves, list) or len(curves) != 4:
            raise ValueError('Vier kubische Randkurven erforderlich.')
        poles = [[vector(v) for v in curve] if isinstance(curve, list) and len(curve) == 4 else [] for curve in curves]
        if any(len(curve) != 4 for curve in poles):
            raise ValueError('Jede Randkurve benötigt vier Kontrollpunkte.')
        if any((curve[-1]-poles[(i+1)%len(poles)][0]).Length > TOL for i, curve in enumerate(poles)):
            raise ValueError('Randkurven müssen in ihrer Reihenfolge einen geschlossenen Rand bilden.')
        edges = []
        for curve in poles:
            bezier = Part.BezierCurve(); bezier.setPoles(curve); edges.append(bezier.toShape())
        wire = Part.Wire(edges)
        if not wire.isClosed():
            raise ValueError('Der Rand ist offen.')
        # Exact bicubic Coons patch. Generic filling can introduce C0 internal
        # knots whose offset/extrusion fails the full BOP check in OCCT.
        bottom, right, top, left = poles[0], poles[1], list(reversed(poles[2])), list(reversed(poles[3]))
        net = []
        for i in range(4):
            row = []
            a = i/3
            for j in range(4):
                b = j/3
                bilinear = bottom[0]*((1-a)*(1-b))+bottom[3]*(a*(1-b))+top[0]*((1-a)*b)+top[3]*(a*b)
                row.append(bottom[i]*(1-b)+top[i]*b+left[j]*(1-a)+right[j]*a-bilinear)
            net.append(row)
        patch = Part.BezierSurface(); patch.increase(3, 3)
        for i in range(4):
            for j in range(4):
                patch.setPole(i+1, j+1, net[i][j])
        surface = patch.toShape()
        if not surface.isValid():
            raise ValueError('Keine gültige Randkurvenfläche; Rand auf Selbstschnitte prüfen.')
        report['connection'] = seam_quality(surface, wire.Edges)
        thickness = number(p['thickness'], .001, 1000, 'Dicke')
        direction = vector(p.get('direction', [0, 0, 1]))
        if direction.Length < 1e-8:
            raise ValueError('Materialrichtung darf nicht null sein.')
        direction.normalize()
        cap = surface.copy(); cap.translate(direction*thickness)
        sides = []
        for edge in surface.OuterWire.Edges:
            upper = edge.copy(); upper.translate(direction*thickness)
            sides.append(Part.makeRuledSurface(edge, upper))
        shell = Part.makeShell([surface, cap]+sides); shell.sewShape()
        result = Part.makeSolid(shell)
        if result.Volume < 0:
            result.reverse()
        report['thicknessMode'] = 'Materialhöhe entlang expliziter Richtung, keine normale Wandstärke'
        report['surfaceArea'] = surface.Area; report['thickness'] = thickness
    else:
        refs = p['faces']
        if not isinstance(refs, list) or not 1 <= len(refs) <= 32:
            raise ValueError('Eine bis 32 Flächen auswählen.')
        resolved = [(ref, *selected_face(shapes, ref)) for ref in refs]
        if len({(ref['source'], index) for ref, index, face in resolved}) != len(resolved):
            raise ValueError('Eine Fläche wurde mehrfach ausgewählt.')
        faces = [face for ref, index, face in resolved]
        if kind == 'surface-transition':
            if len(faces) != 2 or any(len(face.Wires) != 1 for face in faces):
                raise ValueError('Zwei Profilflächen ohne Öffnungen auswählen.')
            if faces[0].distToShape(faces[1])[0] < .001:
                raise ValueError('Profilflächen müssen räumlich getrennt sein.')
            if type(p.get('ruled')) is not bool:
                raise ValueError('Übergangsart auswählen.')
            result = Part.makeLoft([face.OuterWire for face in faces], True, p['ruled'])
            report['connection'] = seam_quality(result, [edge for face in faces for edge in face.Edges])
            report['connection'].update(transition_angles(result, faces))
            report['connection']['tangentContinuity'] = 'nicht zugesichert; G0-Übergang'
        elif kind == 'surface-sew':
            shell = Part.makeShell(faces)
            shell.sewShape()
            free_edges = sum(1 for edge in shell.Edges if sum(edge.isSame(member) for face in shell.Faces for member in face.Edges) == 1)
            report['freeEdges'] = free_edges
            if not shell.isClosed() or len(shell.Shells) != 1 or free_edges:
                raise ValueError('Flächenhülle ist offen oder nicht zusammenhängend: '+str(free_edges)+' freie Randkanten. Keine Körperübernahme.')
            result = Part.makeSolid(shell)
            if result.Volume < 0:
                result.reverse()
            report['connection'] = {'position': 'geschlossene vernähte Hülle', 'freeEdges': free_edges,
                                    'tangentContinuity': 'nicht zugesichert', 'curvatureContinuity': 'nicht zugesichert'}
        elif kind == 'surface-relief':
            if len(faces) != 1:
                raise ValueError('Eine Trägerfläche auswählen.')
            result, extra = relief(checked(shapes[refs[0]['source']].copy()), faces[0], refs[0], p)
            report.update(extra)
        else:
            raise ValueError('Unbekanntes Flächenwerkzeug.')
    result = checked(result)
    report['volume'] = result.Volume
    return result, report


class SurfaceFeature:
    def __init__(self, obj, bases, definition):
        obj.addProperty('App::PropertyLinkList', 'Bases', 'Flächen'); obj.Bases = bases
        obj.addProperty('App::PropertyString', 'Definition', 'Flächen'); obj.Definition = json.dumps(definition)
        obj.setEditorMode('Definition', 1)
        if 'depth' in definition:
            obj.addProperty('App::PropertyLength', 'Depth', 'Flächen'); obj.Depth = definition['depth']
        if 'thickness' in definition:
            obj.addProperty('App::PropertyLength', 'Thickness', 'Flächen'); obj.Thickness = definition['thickness']
        obj.addProperty('App::PropertyString', 'SurfaceReport', 'Prüfung'); obj.setEditorMode('SurfaceReport', 1)
        obj.Proxy = self

    def execute(self, obj):
        obj.Shape = Part.Shape()
        obj.SurfaceReport = ''
        p = json.loads(obj.Definition)
        if 'depth' in p:
            p['depth'] = float(obj.Depth)
        if 'thickness' in p:
            p['thickness'] = float(obj.Thickness)
        obj.Shape, report = construct({base.InputName: base.Shape for base in obj.Bases}, p)
        obj.SurfaceReport = json.dumps(report, allow_nan=False)

    def dumps(self):
        return {'version': 1}

    def loads(self, state):
        pass


def capabilities(doc):
    return {'version': '.'.join(App.Version()[:3]), 'features': {
        'surface-fill': callable(getattr(Part, 'BezierSurface', None)),
        'surface-transition': callable(getattr(Part, 'makeLoft', None)),
        'surface-sew': callable(getattr(Part.Shape(), 'sewShape', None)),
        'surface-relief': hasattr(Part, 'Geom2d')}}


def build(doc, inputs, p):
    bases = []
    for name, shape in inputs.items():
        obj = doc.addObject('Part::Feature', 'SurfaceBase')
        obj.Label = name; obj.Shape = checked(shape.copy())
        obj.addProperty('App::PropertyString', 'InputName', 'Formnaro'); obj.InputName = name
        obj.setEditorMode('InputName', 2); bases.append(obj)
    obj = doc.addObject('Part::FeaturePython', 'SurfaceResult')
    obj.Label = {'surface-fill': 'Randkurvenfläche mit Dicke', 'surface-transition': 'Flächenübergang (G0)',
                 'surface-sew': 'Vernähter Körper', 'surface-relief': 'Prägung / Vertiefung'}[p['kind']]
    SurfaceFeature(obj, bases, p)
    # Execute explicitly so failures cannot be swallowed by FreeCAD recompute.
    obj.Proxy.execute(obj)
    doc.recompute()
    checked(obj.Shape)
    return obj, json.loads(obj.SurfaceReport)
