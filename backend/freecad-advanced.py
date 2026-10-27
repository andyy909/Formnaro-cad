"""Versioned P6 construction helpers, archived with each generated FCStd."""
import math
import FreeCAD as App
import Part


def capabilities(doc):
    found = {}
    for key, kind in [('draft', 'PartDesign::Draft'), ('revolution', 'Part::Revolution'),
                      ('helix', 'Part::Helix'), ('sweep', 'Part::Sweep')]:
        obj = None
        try:
            obj = doc.addObject(kind, 'CapabilityProbe')
            found[key] = True
        except Exception:
            found[key] = False
        finally:
            if obj:
                doc.removeObject(obj.Name)
    found['defeature'] = callable(getattr(Part.Shape(), 'defeaturing', None))
    return {'version': '.'.join(App.Version()[:3]), 'features': found}


def number(p, key, low, high):
    x = p[key]
    if isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x) or not low <= x <= high:
        raise ValueError('Ungültiger Parameter: ' + key)
    return x


def vector(values):
    if not isinstance(values, list) or len(values) != 3 or any(isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x) or abs(x) > 100000 for x in values):
        raise ValueError('Drei endliche Koordinaten erforderlich.')
    return App.Vector(*values)


def face_index(shape, reference):
    """STEP export can reorder faces: identify the clicked interior point uniquely."""
    point, normal = vector(reference['point']), vector(reference['normal'])
    if normal.Length < .9:
        raise ValueError('Ungültige Flächennormale.')
    normal.normalize()
    matches = []
    for index, face in enumerate(shape.Faces):
        if face.distToShape(Part.Vertex(point))[0] > 1e-5:
            continue
        try:
            u, v = face.Surface.parameter(point)
            if face.normalAt(u, v).dot(normal) > 1 - 1e-5:
                matches.append(index)
        except Exception:
            pass
    if len(matches) != 1:
        raise ValueError('Flächenbezug nicht eindeutig. Die Fläche erneut im Inneren anklicken.')
    return matches[0]


def checked(shape):
    if shape.isNull() or not shape.isValid() or not shape.isClosed() or len(shape.Solids) != 1 or shape.Volume <= 1e-7:
        raise ValueError('Das Merkmal ergibt keinen gültigen einzelnen geschlossenen Körper.')
    return shape


class HelixProfile:
    def __init__(self, obj, helix, radius):
        obj.addProperty('App::PropertyLink', 'Helix', 'Profil'); obj.Helix = helix
        obj.addProperty('App::PropertyLength', 'WireRadius', 'Profil'); obj.WireRadius = radius
        obj.Proxy = self

    def execute(self, obj):
        # Clear before validation: a failed recompute must never reuse an old coil.
        obj.Shape = Part.Shape()
        h, r = obj.Helix, float(obj.WireRadius)
        if not h or r <= 0 or float(h.Radius) <= r or float(h.Pitch) <= 2*r or float(h.Height) <= 0 or float(h.Height)/float(h.Pitch) > 200 or abs(float(h.Angle)) > 1e-9:
            raise ValueError('Helix benötigt Radius > Drahtradius, Steigung > Drahtdurchmesser und höchstens 200 Windungen; Kegelwinkel 0°.')
        edge = h.Shape.Edges[0]
        obj.Shape = Part.Wire(Part.makeCircle(r, edge.valueAt(edge.FirstParameter), edge.tangentAt(edge.FirstParameter)))

    def dumps(self):
        return {'version': 1}

    def loads(self, state):
        pass


def build(doc, inputs, p):
    kind = p['kind']
    if kind == 'helix':
        radius = number(p, 'radius', .01, 10000)
        pitch = number(p, 'pitch', .01, 10000)
        height = number(p, 'height', .01, 10000)
        wire = number(p, 'wireRadius', .001, 1000)
        if radius <= wire or pitch <= 2*wire or height/pitch > 200:
            raise ValueError('Helixabstände sind zu klein oder zu viele Windungen.')
        axis = vector(p['axis'])
        if axis.Length < 1e-8:
            raise ValueError('Die Achse darf nicht null sein.')
        helix = doc.addObject('Part::Helix', 'Helix')
        helix.Radius = radius; helix.Pitch = pitch; helix.Height = height
        helix.LocalCoord = 'Left-handed' if p.get('leftHanded', False) else 'Right-handed'
        helix.Placement = App.Placement(vector(p['origin']), App.Rotation(App.Vector(0, 0, 1), axis))
        doc.recompute()
        profile = doc.addObject('Part::FeaturePython', 'HelixProfile')
        profile.Label = 'Verknüpftes Kreisprofil'
        HelixProfile(profile, helix, wire)
        doc.recompute()
        result = doc.addObject('Part::Sweep', 'HelixSweep')
        result.Sections = [profile]; result.Spine = (helix, [])
        result.Solid = True; result.Frenet = True
    else:
        source = checked(inputs['original'].copy())
        refs = p['faces']
        if not isinstance(refs, list) or not 1 <= len(refs) <= 16:
            raise ValueError('Eine bis 16 Flächen auswählen.')
        indices = [face_index(source, ref) for ref in refs]
        if len(set(indices)) != len(indices):
            raise ValueError('Eine Fläche wurde mehrfach ausgewählt.')
        if kind == 'draft':
            neutral = face_index(source, p['neutral'])
            if neutral in indices or not isinstance(source.Faces[neutral].Surface, Part.Plane):
                raise ValueError('Eine andere ebene Fläche als Neutralebene auswählen.')
            body = doc.addObject('PartDesign::Body', 'DraftBody')
            base = body.newObject('PartDesign::Feature', 'StaticBase')
            base.Label = 'Übernommener Körper (statische Basis)'; base.Shape = source
            result = body.newObject('PartDesign::Draft', 'Draft')
            result.Base = (base, ['Face'+str(i+1) for i in indices])
            result.NeutralPlane = (base, ['Face'+str(neutral+1)])
            result.Angle = number(p, 'angle', .1, 45)
            result.Reversed = p.get('reversed', False)
            body.Tip = result
        elif kind == 'defeature':
            result = doc.addObject('Part::Feature', 'Defeatured')
            result.Label = 'Merkmale entfernt (statisches Ergebnis)'
            result.Shape = source.defeaturing([source.Faces[i] for i in indices])
            checked(result.Shape)
            if abs(result.Shape.Volume-source.Volume) <= max(1e-7, source.Volume*1e-9):
                raise ValueError('Keine geeignete Merkmalentfernung möglich; Körper unverändert.')
        elif kind == 'revolution':
            if len(indices) != 1 or not isinstance(source.Faces[indices[0]].Surface, Part.Plane):
                raise ValueError('Eine ebene Profilfläche auswählen.')
            profile = doc.addObject('Part::Feature', 'StaticProfile')
            profile.Label = 'Übernommene Profilfläche (statisch)'; profile.Shape = source.Faces[indices[0]].copy()
            axis = vector(p['axis'])
            if axis.Length < 1e-8:
                raise ValueError('Die Achse darf nicht null sein.')
            result = doc.addObject('Part::Revolution', 'Revolution')
            result.Source = profile; result.Base = vector(p['origin']); result.Axis = axis
            result.Angle = number(p, 'angle', .1, 360); result.Solid = True
        else:
            raise ValueError('Unbekanntes FreeCAD-Merkmal.')
    doc.recompute()
    checked(result.Shape)
    if any('Invalid' in str(state) or 'Error' in str(state) for state in result.State):
        raise ValueError('FreeCAD konnte das Merkmal nicht neu berechnen.')
    return result, {'kind': kind, 'volume': result.Shape.Volume, 'staticInput': kind != 'helix', 'staticResult': kind == 'defeature'}
