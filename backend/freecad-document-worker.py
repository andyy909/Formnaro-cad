"""Read and recompute archived native documents inside the CAD AppContainer."""
import base64, hashlib, importlib, io, json, math, re, sys, traceback, zipfile
from pathlib import Path, PurePosixPath
import FreeCAD as App
import Part
from formnaro_freecad import inspect_shape

job = Path(__file__).resolve().parent
sys.path.insert(0, str(job))
request = json.loads((job / 'input.json').read_text(encoding='utf-8'))['documentJob']
NUMBER_TYPES = {'App::PropertyLength', 'App::PropertyDistance', 'App::PropertyAngle',
                'App::PropertyFloat', 'App::PropertyFloatConstraint', 'App::PropertyQuantity',
                'App::PropertyInteger', 'App::PropertyIntegerConstraint', 'App::PropertyPercent'}
INTEGER_TYPES = {'App::PropertyInteger', 'App::PropertyIntegerConstraint'}
BLOCKED = {'ReadOnly', 'Hidden', 'Output', 'Immutable', 'NoModify'}
LINK_TYPES = {'App::PropertyLink', 'App::PropertyXLink', 'App::PropertyLinkList', 'App::PropertyXLinkList',
              'App::PropertyLinkSub', 'App::PropertyXLinkSub', 'App::PropertyLinkSubList', 'App::PropertyXLinkSubList'}


def fail(message, code='FREECAD_DOCUMENT_FAILED'):
    error = ValueError(message)
    error.code = code
    raise error


def digest(data):
    return hashlib.sha256(data).hexdigest()


def geometry_digest(shape):
    text = shape.cleaned().exportBrepToString()
    header = re.search(r'\nTShapes (\d+)\n', text)
    if not header:
        fail('Unbekannte native BRep-Serialisierung.')
    # OCCT TopTools_ShapeSet::Write stores Free, Modified, Checked,
    # Orientable, Closed, Infinite, Convex. Only Checked is a volatile proof
    # cache: GUI recomputation can reset it on unchanged shared faces.
    # Keep every geometry byte and every other topology flag unchanged.
    tail, count = re.subn(r'(?m)(^\n)([01]{2})[01]([01]{4})(?=\n(?:[+\-ie]\d+ \d+|\*))',
                          lambda m: m[1] + m[2] + '0' + m[3], text[header.end():])
    if count != int(header[1]):
        fail('Native BRep-Prüfflags konnten nicht vollständig zugeordnet werden.')
    return digest((text[:header.end()] + tail).encode('utf-8'))


def shape_of(obj):
    shape = getattr(obj, 'Shape', None)
    return shape if shape is not None and not shape.isNull() else None


def scalar(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        if not math.isfinite(value):
            fail('Eine native Eigenschaft ist nicht endlich.')
        return value
    if hasattr(value, 'Value') and isinstance(value.Value, (int, float)):
        return scalar(value.Value)
    if isinstance(value, str):
        return value[:512]
    return None


def static_shape(obj):
    return obj.TypeId in ('Part::Feature', 'PartDesign::Feature') and not getattr(obj, 'Proxy', None)


def missing_proxy(obj):
    return ('Proxy' in obj.PropertiesList and
            obj.getTypeIdOfProperty('Proxy') == 'App::PropertyPythonObject' and
            getattr(obj, 'Proxy', None) is None)


def readable_value(value, kind):
    if kind in ('App::PropertyLink', 'App::PropertyXLink'):
        return {'object': value.Name} if value is not None else None
    if kind in ('App::PropertyLinkList', 'App::PropertyXLinkList'):
        return [{'object': o.Name} for o in value]
    if kind in ('App::PropertyLinkSub', 'App::PropertyXLinkSub'):
        if value is None:
            return None
        return {'object': value[0].Name if value[0] else None, 'subelements': list(value[1])}
    if kind in ('App::PropertyLinkSubList', 'App::PropertyXLinkSubList'):
        return [{'object': o.Name if o else None, 'subelements': list(parts)} for o, parts in value]
    if kind in ('App::PropertyVector', 'App::PropertyPosition', 'App::PropertyDirection'):
        return [scalar(value.x), scalar(value.y), scalar(value.z)]
    if kind == 'App::PropertyPlacement':
        return {'position': [scalar(v) for v in value.Base], 'rotation': list(value.Rotation.Q)}
    if kind == 'App::PropertyExpressionEngine':
        return [{'property': prop, 'expression': text} for prop, text in value]
    if kind == 'Part::PropertyPartShape':
        return {'shapeType': value.ShapeType, 'solids': len(value.Solids), 'volume': scalar(value.Volume)} if not value.isNull() else None
    if kind == 'Materials::PropertyMaterial':
        return {'name': value.Name, 'uuid': str(value.UUID)}
    plain = scalar(value)
    return plain if plain is not None else kind


def property_info(obj, name):
    kind = obj.getTypeIdOfProperty(name)
    flags = sorted(set(map(str, obj.getTypeOfProperty(name))) | set(map(str, obj.getPropertyStatus(name))))
    mode = obj.getEditorMode(name)
    if isinstance(mode, int):
        if mode & 1:
            flags.append('ReadOnly')
        if mode & 2:
            flags.append('Hidden')
    else:
        flags = sorted(set(flags) | set(map(str, mode)))
    expressions = dict(getattr(obj, 'ExpressionEngine', []))
    expression = expressions.get(name)
    driven = any(p == name or p.startswith(name + '.') or p.startswith(name + '[') for p in expressions)
    value = getattr(obj, name)
    result = dict(name=name, type=kind, group=obj.getGroupOfProperty(name), flags=flags,
                  editable=False, kind='read-only')
    if name in ('FormnaroPython', 'FormnaroPlan'):
        result.update(value='Gespeicherter Konstruktionsquelltext', reason='source-archive')
        return result
    if kind in NUMBER_TYPES:
        unit = 'mm' if kind in ('App::PropertyLength', 'App::PropertyDistance') else 'deg' if kind == 'App::PropertyAngle' else '%' if kind == 'App::PropertyPercent' else str(getattr(value, 'Unit', ''))
        result.update(kind='number', value=scalar(value), unit=unit,
                      integer=kind in INTEGER_TYPES)
    elif kind == 'App::PropertyBool':
        result.update(kind='boolean', value=bool(value))
    elif kind == 'App::PropertyEnumeration':
        result.update(kind='enum', value=str(value), choices=list(obj.getEnumerationsOfProperty(name)))
    elif kind in LINK_TYPES:
        result.update(kind='link', value=readable_value(value, kind), multiple=kind.endswith('List'), subelements='Sub' in kind)
    else:
        result['value'] = readable_value(value, kind)
    if expression is not None:
        result['expression'] = expression
    # SubShapeBinder's Support table is marked ReadOnly in the property grid,
    # while native Python source assignment is its supported construction API
    # (the same assignment used to author this feature). Expose only this
    # explicit source-rebind operation; retain the native property flags.
    binder_support = (obj.TypeId == 'PartDesign::SubShapeBinder' and name == 'Support' and
                      kind == 'App::PropertyXLinkSubList' and BLOCKED.intersection(flags) == {'ReadOnly'})
    if driven:
        result['reason'] = 'expression'
    elif BLOCKED.intersection(flags) and not binder_support:
        result['reason'] = 'native-read-only'
    elif missing_proxy(obj):
        result['reason'] = 'missing-python-proxy'
    elif static_shape(obj):
        result['reason'] = 'static-shape'
    elif result['kind'] == 'read-only':
        result['reason'] = 'unsupported-property-type'
    else:
        result['editable'] = True
    return result


def object_info(obj):
    if len(obj.PropertiesList) > 1024:
        fail('Das Objekt hat mehr als 1024 Eigenschaften.', 'FREECAD_DOCUMENT_LIMIT')
    shape = shape_of(obj)
    return dict(name=obj.Name, label=obj.Label, type=obj.TypeId,
                dependsOn=sorted(set(o.Name for o in obj.OutList)),
                usedBy=sorted(set(o.Name for o in obj.InList)),
                children=[o.Name for o in getattr(obj, 'Group', [])],
                state=list(map(str, obj.State)), staticShape=static_shape(obj), missingProxy=missing_proxy(obj), hasShape=shape is not None,
                topology=dict(faces=len(shape.Faces), edges=len(shape.Edges), vertices=len(shape.Vertexes)) if shape else dict(faces=0, edges=0, vertices=0),
                properties=[property_info(obj, n) for n in obj.PropertiesList])


def snapshot(doc):
    result = {}
    for obj in doc.Objects:
        info = object_info(obj)
        info.pop('state', None)  # Native scheduling state is not authored data.
        # Opaque Python wrapper reprs contain fresh memory addresses. Preserve
        # their actual native serialized content instead of comparing reprs.
        for prop in info['properties']:
            if prop['kind'] == 'read-only' and prop['type'] != 'Part::PropertyPartShape':
                raw = bytes(obj.dumpPropertyContent(prop['name'], 0))
                if zipfile.is_zipfile(io.BytesIO(raw)):
                    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
                        entries = [(n, digest(archive.read(n))) for n in sorted(archive.namelist())]
                    prop['contentDigest'] = digest(json.dumps(entries).encode('utf-8'))
                else:
                    prop['contentDigest'] = digest(raw)
        shape = shape_of(obj)
        # The offscreen GUI may mesh unchanged shared source faces. Display
        # triangulations are caches, not the preserved analytic construction.
        info['brepDigest'] = geometry_digest(shape) if shape else None
        result[obj.Name] = info
    return result


def choose_result(doc):
    candidates = [o.Name for o in doc.Objects if shape_of(o) is not None and
                  any(n in o.PropertiesList for n in ('FormnaroPython', 'FormnaroPlan'))]
    selected = request.get('resultObject')
    if selected is not None:
        obj = doc.getObject(selected)
        if obj is None or request['action'] == 'export' and shape_of(obj) is None:
            fail('Die gespeicherte FreeCAD-Ergebniskennung fehlt oder hat keinen Körper.', 'FREECAD_DOCUMENT_STALE')
        return obj, candidates
    return (doc.getObject(candidates[0]) if len(candidates) == 1 else None), candidates


def catalog(doc, selected, candidates):
    return dict(version=1, objects=[object_info(o) for o in doc.Objects],
                resultObject=selected.Name if selected else None, resultCandidates=candidates,
                resultProblem=None if selected else 'Ergebniskörper ausdrücklich auswählen; keine eindeutige gespeicherte Zuordnung.')


def native_link_value(doc, info, value):
    """Explicit document-local identities; no nearest object or surface search."""
    def entry(item):
        target = doc.getObject(item['object']) if item['object'] else None
        if target is None:
            fail('Die gewählte neue Konstruktionsquelle fehlt.', 'FREECAD_DOCUMENT_REFERENCE_LOST')
        if target.Document != doc:
            fail('Eine Quelle aus demselben gespeicherten Dokument wählen.')
        if not info['subelements']:
            return target
        parts = item['subelements']
        shape = shape_of(target)
        for part in parts:
            if not re.fullmatch(r'(?:Face|Edge|Vertex)[1-9][0-9]{0,5}', part) or shape is None:
                fail('Eine ausdrücklich gewählte vorhandene Fläche, Kante oder Ecke verwenden.', 'FREECAD_DOCUMENT_REFERENCE_LOST')
            try:
                element = shape.getElement(part)
                if element.isNull():
                    raise ValueError('null')
            except Exception:
                fail('Das gewählte native Quellelement fehlt: ' + target.Name + '.' + part, 'FREECAD_DOCUMENT_REFERENCE_LOST')
        if len(set(parts)) != len(parts):
            fail('Jedes native Quellelement nur einmal wählen.')
        return (target, parts)
    if info['multiple']:
        return [entry(item) for item in value]
    return entry(value) if value is not None else None


def link_objects(value):
    if isinstance(value, list):
        return {item['object'] for item in value if item.get('object')}
    return {value['object']} if isinstance(value, dict) and value.get('object') else set()


def check_collected_link_cycles(doc, edits):
    # Some native setters react to cycles immediately, before recompute.
    # Validate the complete proposed graph before assigning any of its links.
    graph = {obj.Name: {item.Name for item in obj.OutList} for obj in doc.Objects}
    owners, replacements = set(), {}
    for edit in edits:
        obj = doc.getObject(edit['object'])
        if obj is None or edit['property'] not in obj.PropertiesList:
            fail('Eine gewählte Konstruktionsquelle oder Eigenschaft fehlt.', 'FREECAD_DOCUMENT_STALE')
        info = property_info(obj, edit['property'])
        if info['kind'] != 'link':
            continue
        old, new = link_objects(info['value']), link_objects(edit['value'])
        if any(name not in graph for name in new):
            fail('Die gewählte neue Konstruktionsquelle fehlt.', 'FREECAD_DOCUMENT_REFERENCE_LOST')
        # Retain edges also owned by unedited link properties.
        others = set()
        edited = {item['property'] for item in edits if item['object'] == obj.Name}
        for prop in obj.PropertiesList:
            if prop not in edited and obj.getTypeIdOfProperty(prop) in LINK_TYPES:
                others.update(link_objects(readable_value(getattr(obj, prop), obj.getTypeIdOfProperty(prop))))
        replacement = replacements.setdefault(obj.Name, dict(remove=set(), add=set(), retain=others))
        replacement['remove'].update(old)
        replacement['add'].update(new)
        owners.add(obj.Name)
    for owner, replacement in replacements.items():
        graph[owner].difference_update(replacement['remove'] - replacement['retain'])
        graph[owner].update(replacement['add'])
    for owner in owners:
        pending, seen = list(graph[owner]), set()
        while pending:
            name = pending.pop()
            if name == owner:
                fail('Die Quellenzuordnung erzeugt einen Abhängigkeitskreis.', 'FREECAD_DOCUMENT_REFERENCE_CYCLE')
            if name not in seen:
                seen.add(name)
                pending.extend(graph[name])


output = {}
try:
    archive = base64.b64decode(request['documentBase64'], validate=True)
    if digest(archive) != request['sourceDigest']:
        fail('FCStd-Quelle stimmt nicht mit der gewählten Revision überein.', 'FREECAD_DOCUMENT_STALE')
    with zipfile.ZipFile(io.BytesIO(archive)) as source:
        entries = source.infolist()
        if len(entries) > 4096 or sum(e.file_size for e in entries) > 256 * 1024 * 1024:
            fail('FCStd-Archiv überschreitet das lokale Entpacklimit.', 'FREECAD_DOCUMENT_LIMIT')
        names = [e.filename for e in entries]
        if len(names) != len(set(names)) or 'Document.xml' not in names or any(
                PurePosixPath(n).is_absolute() or '..' in PurePosixPath(n).parts or '\\' in n or ':' in n for n in names):
            fail('Ungültige Dateieinträge im FCStd-Archiv.', 'FREECAD_DOCUMENT_INPUT')
    (job / 'source.FCStd').write_bytes(archive)
    # Explicitly supplied archived helpers are the only extra modules staged in
    # this isolated job. Restoring their classes must never rerun the main script.
    for filename in request.get('modules', {}):
        importlib.import_module(filename[:-3])
    doc = App.openDocument(str(job / 'source.FCStd'))
    if len(doc.Objects) > 4096:
        fail('Das FCStd-Dokument hat mehr als 4096 Objekte.', 'FREECAD_DOCUMENT_LIMIT')
    selected, candidates = choose_result(doc)
    output.update(ok=True, sourceDigest=request['sourceDigest'], engineVersion='.'.join(App.Version()[:3]),
                  occt=Part.OCC_VERSION, isolation='windows-appcontainer', tree=catalog(doc, selected, candidates))
    if request['action'] == 'export':
        if selected is None:
            fail('Einen Ergebniskörper für den Import wählen.')
        geometry = inspect_shape(selected.Shape, True)
        if not geometry['valid'] or not geometry['closed'] or not geometry['solids'] or geometry['check'] != 'passed':
            fail('Der gewählte FCStd-Körper ist nicht nativ gültig und geschlossen.')
        selected.Shape.exportStep(str(job / 'result.step'))
        readback = inspect_shape(Part.read(str(job / 'result.step')), True)
        if not readback['valid'] or not readback['closed'] or readback['check'] != 'passed' or readback['solids'] != geometry['solids'] or abs(readback['volume'] - geometry['volume']) > max(1e-6, abs(geometry['volume']) * 1e-8):
            fail('STEP-Rückleseprüfung stimmt nicht mit dem gewählten FCStd-Körper überein.')
        # Preserve the supplied FCStd bytes. Import exports a selected saved
        # body; it never rewrites the user's original native document.
        output.update(report=geometry, stepReadback=readback)
    if request['action'] == 'edit':
        missing = [o.Name for o in doc.Objects if missing_proxy(o)]
        if missing:
            fail('Python-Konstruktion nicht vollständig wiederhergestellt. Helfermodul fehlt: ' + ', '.join(missing), 'FREECAD_DOCUMENT_PROXY_MISSING')
        if selected is None:
            fail('Einen eindeutigen Ergebniskörper wählen.')
        before = snapshot(doc)
        check_collected_link_cycles(doc, request['edits'])
        affected, pending = set(), [e['object'] for e in request['edits']]
        while pending:
            name = pending.pop()
            if name in affected:
                continue
            obj = doc.getObject(name)
            if obj is None:
                fail('Eine gewählte Konstruktionsquelle fehlt.', 'FREECAD_DOCUMENT_STALE')
            affected.add(name)
            pending.extend(o.Name for o in obj.InList)
        changes, allowed_edges, link_targets, link_owners = [], set(), set(), set()
        for edit in request['edits']:
            obj = doc.getObject(edit['object'])
            if edit['property'] not in obj.PropertiesList:
                fail('Die gewählte Eigenschaft fehlt.', 'FREECAD_DOCUMENT_STALE')
            info = property_info(obj, edit['property'])
            if not info['editable']:
                fail('Eigenschaft ist nicht direkt editierbar: ' + obj.Name + '.' + edit['property'], 'FREECAD_DOCUMENT_READ_ONLY')
            if info['type'] != edit['expectedType'] or info['value'] != edit['expectedValue'] or isinstance(info['value'], bool) != isinstance(edit['expectedValue'], bool):
                fail('Eigenschaftswert oder Typ ist veraltet. Baum erneut lesen.', 'FREECAD_DOCUMENT_STALE')
            value = edit['value']
            if info['kind'] == 'number':
                if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                    fail('Eine endliche Zahl in der angegebenen nativen Einheit eingeben.')
                if info.get('integer') and (int(value) != value or abs(value) > 9007199254740991):
                    fail('Eine sichere ganze Zahl eingeben.')
            elif info['kind'] == 'boolean' and not isinstance(value, bool):
                fail('Ein boolescher Wert ist erforderlich.')
            elif info['kind'] == 'enum' and value not in info['choices']:
                fail('Eine vorhandene native Auswahl verwenden.')
            if info['kind'] == 'link':
                targets = link_objects(info['value']) | link_objects(value)
                allowed_edges.update((obj.Name, target) for target in targets)
                link_targets.update(targets)
                link_owners.add(obj.Name)
            setattr(obj, edit['property'], native_link_value(doc, info, value) if info['kind'] == 'link' else value)
            if property_info(obj, edit['property'])['value'] != value:
                fail('FreeCAD hat den Wert begrenzt oder verändert; Änderung nicht übernehmen.')
            changes.append(dict(object=obj.Name, property=edit['property'], type=info['type'],
                                before=info['value'], value=value, unit=info.get('unit', '')))
        # Validate the final collected link graph before asking FreeCAD to
        # recompute; transient assignments are never a published document.
        for name in link_owners:
            pending, seen = list(doc.getObject(name).OutList), set()
            while pending:
                dependency = pending.pop()
                if dependency.Name == name:
                    fail('Die Quellenzuordnung erzeugt einen Abhängigkeitskreis.', 'FREECAD_DOCUMENT_REFERENCE_CYCLE')
                if dependency.Name not in seen:
                    seen.add(dependency.Name)
                    pending.extend(dependency.OutList)
        pending, visited = [e['object'] for e in request['edits']], set()
        while pending:
            name = pending.pop()
            if name in visited:
                continue
            visited.add(name)
            affected.add(name)
            pending.extend(o.Name for o in doc.getObject(name).InList)
        doc.recompute()
        for edit in request['edits']:
            actual = property_info(doc.getObject(edit['object']), edit['property'])
            if actual['type'] != edit['expectedType'] or actual['value'] != edit['value'] or isinstance(actual['value'], bool) != isinstance(edit['value'], bool):
                fail('Neu berechneter Wert entspricht nicht der beauftragten Eigenschaft: ' + edit['object'] + '.' + edit['property'])
        for obj in doc.Objects:
            if 'Invalid' in obj.State or 'Error' in obj.State:
                fail('FreeCAD konnte das Merkmal nicht neu berechnen: ' + obj.Name)
        after = snapshot(doc)
        explicit = {(e['object'], e['property']) for e in request['edits']}
        dependent_changes = []
        if set(before) != set(after):
            fail('Neuberechnung hat Objekte hinzugefügt oder entfernt.')
        for name in before:
            for field in ('type', 'label', 'children'):
                if before[name][field] != after[name][field]:
                    fail('Neuberechnung hat eine geschützte Objektzuordnung geändert: ' + name)
            for target in set(before[name]['dependsOn']) ^ set(after[name]['dependsOn']):
                if (name, target) not in allowed_edges:
                    fail('Eine nicht beauftragte Quellenverknüpfung wurde geändert: ' + name)
            for owner in set(before[name]['usedBy']) ^ set(after[name]['usedBy']):
                if (owner, name) not in allowed_edges:
                    fail('Eine nicht beauftragte Quellennutzung wurde geändert: ' + name)
            old = {p['name']: p for p in before[name]['properties']}
            new = {p['name']: p for p in after[name]['properties']}
            if before[name]['type'] == 'PartDesign::SubShapeBinder' and (name, 'Support') in explicit:
                # FreeCAD replaces its hidden per-source placement matrix
                # cache along with the explicitly selected Support endpoints.
                endpoints = link_objects(old['Support']['value']) | link_objects(new['Support']['value'])
                for target in endpoints:
                    cache = 'Cache_' + target
                    for properties in (old, new):
                        p = properties.get(cache)
                        if p and p['type'] == 'App::PropertyMatrix' and p['group'] == 'Cache' and 'Hidden' in p['flags']:
                            del properties[cache]
            if set(old) != set(new) or any(old[n].get('expression') != new[n].get('expression') for n in old):
                fail('Neuberechnung hat Eigenschaften oder Formeln geändert: ' + name)
            if any(old[n] != new[n] for n in old if old[n]['type'] in LINK_TYPES and (name, n) not in explicit):
                fail('Neuberechnung hat eine geschützte native Objektverknüpfung geändert: ' + name)
            # The old/new source's incoming-use list changes by the explicit
            # edge only. Its authored properties and geometry remain exact.
            independent_before = {k: v for k, v in before[name].items() if k != 'usedBy'}
            independent_after = {k: v for k, v in after[name].items() if k != 'usedBy'}
            if name not in affected and independent_before != independent_after:
                changed = [k for k in before[name] if before[name][k] != after[name][k]]
                properties = [n for n in old if old[n] != new[n]]
                fail('Eine unabhängige FreeCAD-Quelle wurde verändert: ' + name + ' ' + repr(changed) + ' ' + repr(properties))
            for prop in old:
                if (name, prop) not in explicit and old[prop]['kind'] in ('number', 'boolean', 'enum') and old[prop].get('value') != new[prop].get('value'):
                    dependent_changes.append(dict(object=name, property=prop, type=new[prop]['type'],
                                                  before=old[prop].get('value'), value=new[prop].get('value'),
                                                  expression=new[prop].get('expression'), unit=new[prop].get('unit', '')))
        geometry = inspect_shape(selected.Shape, True)
        if not geometry['valid'] or not geometry['closed'] or not geometry['solids'] or geometry['check'] != 'passed':
            fail('Neuberechneter Ergebniskörper ist nicht nativ gültig und geschlossen.')
        selected.Shape.exportStep(str(job / 'result.step'))
        readback = inspect_shape(Part.read(str(job / 'result.step')), True)
        if not readback['valid'] or not readback['closed'] or readback['check'] != 'passed' or readback['solids'] != geometry['solids'] or abs(readback['volume'] - geometry['volume']) > max(1e-6, abs(geometry['volume']) * 1e-8):
            fail('STEP-Rückleseprüfung stimmt nicht mit dem nativen Körper überein.')
        doc.saveAs(str(job / 'result.FCStd'))
        output.update(tree=catalog(doc, selected, candidates), report=geometry, stepReadback=readback,
                      changes=changes, dependentChanges=dependent_changes, affectedObjects=sorted(affected),
                      independentObjectsExact=sorted(n for n in before if n not in affected and before[n] == after[n]),
                      reassignedSources=sorted(link_targets),
                      changedObjects=sorted(n for n in before if before[n] != after[n]))
except BaseException as error:
    output = dict(ok=False, error=str(error)[:16000], code=getattr(error, 'code', 'FREECAD_DOCUMENT_FAILED'),
                  traceback=traceback.format_exc()[-24000:])
finally:
    for name in list(App.listDocuments()):
        App.closeDocument(name)
(job / 'result.json').write_text(json.dumps(output, allow_nan=False), encoding='utf-8')
