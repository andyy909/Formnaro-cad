"""Source-bound segmentation edits and undo; geometric fitting stays separate.

An edited label or requested surface type is a proposal, not an accepted CAD
surface. Protection is attached to original face IDs so split/merge preserves it.
"""
from __future__ import annotations

from dataclasses import dataclass
from dataclasses import replace
from collections import defaultdict
from contextlib import contextmanager
import hashlib
import math

import numpy as np

SURFACE_TYPES = frozenset({'PLANE', 'CYLINDER', 'CONE', 'GRAPH', 'REVOLUTION', 'REST'})


class RegionEditError(ValueError):
    pass


@dataclass(frozen=True)
class EditState:
    labels: tuple[int, ...]
    base_types: tuple[tuple[int, str], ...]
    requested_types: tuple[tuple[int, str], ...]
    protected_faces: frozenset[int]
    next_id: int


def mesh_identity(mesh):
    digest = hashlib.sha256()
    for values, dtype in ((mesh.vertices, '<f8'), (mesh.faces, '<i8')):
        array = np.ascontiguousarray(values, dtype=dtype)
        digest.update(np.asarray(array.shape, dtype='<i8').tobytes())
        digest.update(array.tobytes())
    return digest.hexdigest()


def normalise_edit_mesh(mesh, unit=1.):
    """Match the converter's unchanged source preparation, before repairs."""
    result = mesh.copy()
    result.apply_scale(unit)
    result.merge_vertices(digits_vertex=10)
    result.update_faces(result.nondegenerate_faces(height=1e-10))
    result.update_faces(result.unique_faces())
    result.remove_unreferenced_vertices()
    result.fix_normals(multibody=True)
    return result


class RegionEditSession:
    """Immutable states with bounded history and deterministic face identities."""
    def __init__(self, mesh, analysis, tolerance, *, history_limit=100):
        if not math.isfinite(tolerance) or tolerance <= 0:
            raise RegionEditError('Ungültiges Abweichungsbudget.')
        if not isinstance(history_limit, int) or isinstance(history_limit, bool) or history_limit < 1:
            raise RegionEditError('Ungültige Historiengrenze.')
        labels = tuple(map(int, analysis.face_regions))
        if len(labels) != len(mesh.faces) or any(label < 0 for label in labels):
            raise RegionEditError('Regionsanalyse passt nicht zum Originalnetz.')
        types = {int(region['id']): region['type'] for region in analysis.regions}
        if set(labels) != set(types) or not set(types.values()) <= SURFACE_TYPES:
            raise RegionEditError('Regionsanalyse enthält ungültige Typen oder Indizes.')
        groups = defaultdict(set)
        for face, label in enumerate(labels):
            groups[label].add(face)
        for region in analysis.regions:
            if set(region['faces']) != groups[region['id']]:
                raise RegionEditError('Regionsanalyse enthält widersprüchliche Flächenzuordnungen.')
        self.mesh_sha256 = mesh_identity(mesh)
        self.tolerance = float(tolerance)
        self.history_limit = history_limit
        self._adjacency = [set() for _ in mesh.faces]
        for a, b in mesh.face_adjacency:
            self._adjacency[int(a)].add(int(b))
            self._adjacency[int(b)].add(int(a))
        self.state = EditState(labels, tuple(sorted(types.items())), (), frozenset(), max(labels) + 1)
        self.initial_state = self.state
        self._undo, self._redo = [], []

    def faces(self, region_id):
        if not isinstance(region_id, (int, np.integer)) or isinstance(region_id, (bool, np.bool_)) or region_id < 0:
            raise RegionEditError('Ungültige Regions-ID.')
        result = frozenset(i for i, label in enumerate(self.state.labels) if label == region_id)
        if not result:
            raise RegionEditError('Der Flächenbereich existiert nicht mehr.')
        return result

    def _components(self, face_ids):
        remaining, result = set(face_ids), []
        while remaining:
            first = min(remaining)
            remaining.remove(first)
            found, pending = {first}, [first]
            while pending:
                for neighbour in self._adjacency[pending.pop()] & remaining:
                    remaining.remove(neighbour)
                    found.add(neighbour)
                    pending.append(neighbour)
            result.append(frozenset(found))
        return result

    def _commit(self, labels, types, requested, protected, next_id):
        active = set(labels)
        state = EditState(tuple(labels), tuple(sorted((i, value) for i, value in types.items() if i in active)),
                          tuple(sorted((i, value) for i, value in requested.items() if i in active)),
                          frozenset(protected), next_id)
        if state == self.state:
            return False
        self._undo.append(self.state)
        self._undo = self._undo[-self.history_limit:]
        self._redo.clear()
        self.state = state
        return True

    def split(self, region_id, selected_faces):
        original = self.faces(region_id)
        selected = frozenset(selected_faces)
        if any(not isinstance(i, (int, np.integer)) or isinstance(i, (bool, np.bool_)) for i in selected):
            raise RegionEditError('Ungültige Dreiecksindizes.')
        if not selected or not selected < original:
            raise RegionEditError('Zum Teilen eine echte Teilmenge dieses Bereichs auswählen.')
        pieces = self._components(original - selected) + self._components(selected)
        labels = list(self.state.labels)
        types, requested = dict(self.state.base_types), dict(self.state.requested_types)
        next_id, result = self.state.next_id, []
        for index, piece in enumerate(pieces):
            new_id = region_id if index == 0 else next_id
            if index:
                next_id += 1
                types[new_id] = types[region_id]
                if region_id in requested:
                    requested[new_id] = requested[region_id]
            for face in piece:
                labels[face] = new_id
            result.append(new_id)
        self._commit(labels, types, requested, self.state.protected_faces, next_id)
        return tuple(result)

    def merge(self, region_ids):
        ids = sorted(set(region_ids))
        if len(ids) < 2:
            raise RegionEditError('Mindestens zwei Bereiche zum Zusammenführen auswählen.')
        faces = frozenset().union(*(self.faces(i) for i in ids))
        if len(self._components(faces)) != 1:
            raise RegionEditError('Nur kantenverbundene Bereiche zusammenführen.')
        types, requested = dict(self.state.base_types), dict(self.state.requested_types)
        base = {types[i] for i in ids}
        target = ids[0]
        types[target] = next(iter(base)) if len(base) == 1 else 'REST'
        overrides = {requested.get(i) for i in ids}
        if len(overrides) == 1 and None not in overrides:
            requested[target] = next(iter(overrides))
        else:
            requested.pop(target, None)
        labels = [target if label in ids else label for label in self.state.labels]
        self._commit(labels, types, requested, self.state.protected_faces, self.state.next_id)
        return target

    def set_type(self, region_id, surface_type):
        self.faces(region_id)
        if not isinstance(surface_type, str) or surface_type not in SURFACE_TYPES | {'AUTO'}:
            raise RegionEditError('Unbekannter Flächentyp.')
        requested = dict(self.state.requested_types)
        if surface_type == 'AUTO':
            requested.pop(region_id, None)
        else:
            requested[region_id] = surface_type
        return self._commit(self.state.labels, dict(self.state.base_types), requested,
                            self.state.protected_faces, self.state.next_id)

    def protect(self, region_ids, enabled=True):
        if not isinstance(enabled, bool):
            raise RegionEditError('Ungültiger Schutzstatus.')
        faces = frozenset().union(*(self.faces(i) for i in region_ids))
        protected = self.state.protected_faces | faces if enabled else self.state.protected_faces - faces
        return self._commit(self.state.labels, dict(self.state.base_types), dict(self.state.requested_types),
                            protected, self.state.next_id)

    def undo(self):
        if not self._undo:
            return False
        self._redo.append(self.state)
        self.state = self._undo.pop()
        return True

    def redo(self):
        if not self._redo:
            return False
        self._undo.append(self.state)
        self.state = self._redo.pop()
        return True

    @contextmanager
    def transaction(self):
        """One UI command affecting several regions is one undo operation."""
        before, undo, redo = self.state, self._undo.copy(), self._redo.copy()
        try:
            yield self
        except Exception:
            self.state, self._undo, self._redo = before, undo, redo
            raise
        else:
            if self.state != before:
                self._undo = (undo+[before])[-self.history_limit:]
                self._redo = []


    @property
    def can_undo(self):
        return bool(self._undo)

    @property
    def can_redo(self):
        return bool(self._redo)

    @property
    def is_modified(self):
        return self.state != self.initial_state

    def affected_faces(self):
        initial, current = defaultdict(set), defaultdict(set)
        for face,label in enumerate(self.initial_state.labels):initial[label].add(face)
        for face,label in enumerate(self.state.labels):current[label].add(face)
        affected = set(self.state.protected_faces)
        requested = dict(self.state.requested_types)
        types,original_types = dict(self.state.base_types),dict(self.initial_state.base_types)
        for label,faces in current.items():
            if (label in requested or any(initial[self.initial_state.labels[face]]!=faces for face in faces)
                    or any(types[label]!=original_types[self.initial_state.labels[face]] for face in faces)):
                affected.update(faces)
        return frozenset(affected)

    def view_analysis(self, original, mesh):
        """Compact display indices with stable edit IDs; no native acceptance."""
        groups = defaultdict(list)
        for face, label in enumerate(self.state.labels):
            groups[label].append(face)
        types, requested = dict(self.state.base_types), dict(self.state.requested_types)
        regions, assignments = [], np.empty(len(self.state.labels), dtype=int)
        for edit_id, faces in sorted(groups.items()):
            source = original.regions[int(original.face_regions[faces[0]])]
            kind = requested.get(edit_id, types[edit_id])
            model = dict(source) if source['type'] == kind else {}
            count = len(set(faces) & self.state.protected_faces)
            reason = ('Typvorgabe; geometrische und native Prüfung folgt' if edit_id in requested else
                      source['reason'] if set(faces) == set(source['faces']) else 'Bereich manuell geändert; erneute Prüfung folgt')
            if count:
                reason = f'{count}/{len(faces)} Dreiecke geschützt; Originalfacetten haben Vorrang. ' + reason
            model.update(id=len(regions), edit_id=edit_id, type=kind, faces=faces,
                         protected_faces=count, reason=reason, reconstructible=False)
            assignments[faces] = len(regions)
            regions.append(model)
        adjacent = mesh.face_adjacency
        different = assignments[adjacent[:,0]] != assignments[adjacent[:,1]]
        return replace(original, regions=regions, face_regions=assignments,
                       boundary_edges=np.asarray(mesh.face_adjacency_edges)[different])

    def to_dict(self):
        return dict(schema=1, kind='surface_region_edit_proposals_not_CAD_acceptance',
                    mesh_sha256=self.mesh_sha256, tolerance_mm=self.tolerance,
                    labels=list(self.state.labels), base_types={str(i):kind for i,kind in self.state.base_types},
                    requested_types={str(i):kind for i,kind in self.state.requested_types},
                    protected_faces=sorted(self.state.protected_faces), next_id=self.state.next_id)

    @classmethod
    def from_dict(cls, mesh, analysis, tolerance, value):
        session = cls(mesh, analysis, tolerance)
        if (not isinstance(value, dict) or type(value.get('schema')) is not int or value.get('schema') != 1
                or value.get('mesh_sha256') != session.mesh_sha256 or value.get('tolerance_mm') != session.tolerance
                or value.get('kind') != 'surface_region_edit_proposals_not_CAD_acceptance'):
            raise RegionEditError('Gespeicherte Korrektur passt nicht zu Originalnetz und Toleranz.')
        labels, protected = value.get('labels'), value.get('protected_faces')
        def integer(i):
            return isinstance(i, int) and not isinstance(i, bool) and 0 <= i < 2**31
        if (not isinstance(labels, list) or len(labels) != len(mesh.faces) or not all(map(integer, labels))
                or not isinstance(protected, list) or not all(integer(i) and i < len(labels) for i in protected)
                or len(set(protected)) != len(protected)
                or not integer(value.get('next_id')) or value['next_id'] <= max(labels)):
            raise RegionEditError('Gespeicherte Korrektur enthält ungültige Flächenindizes.')
        def type_map(raw):
            if not isinstance(raw, dict):
                raise RegionEditError('Ungültige gespeicherte Flächentypen.')
            result = {}
            for key, surface_type in raw.items():
                if not (integer(key) or isinstance(key, str) and key.isascii() and key.isdecimal()):
                    raise RegionEditError('Ungültige gespeicherte Regions-ID.')
                index = int(key)
                if not integer(index) or index in result or not isinstance(surface_type, str) or surface_type not in SURFACE_TYPES:
                    raise RegionEditError('Ungültige gespeicherte Flächentypen.')
                result[index] = surface_type
            return result
        types = type_map(value.get('base_types'))
        requested = type_map(value.get('requested_types'))
        if set(labels) != set(types) or not set(requested) <= set(types):
            raise RegionEditError('Gespeicherte Regionszuordnung ist unvollständig.')
        groups = defaultdict(set)
        for face, label in enumerate(labels):
            groups[label].add(face)
        if any(len(session._components(faces)) != 1 for faces in groups.values()):
            raise RegionEditError('Gespeicherte Bereiche sind nicht kantenverbunden.')
        session.state = EditState(tuple(labels), tuple(sorted(types.items())), tuple(sorted(requested.items())),
                                  frozenset(protected), value['next_id'])
        return session
