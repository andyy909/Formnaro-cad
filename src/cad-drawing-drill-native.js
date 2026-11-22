import {
  cadDrawingDimension,
  cadDrawingProblems,
  cadDrawingSourceSignatures,
  updateCadDrawingProjection,
} from './cad-drawing-data.js';
import { cadDrawingUpdatedPosition } from './cad-drawing-layout.js';
import { CAD_DRAWING_BORE_ROLE, createCadDrawingNative } from './cad-drawing-native.js';

function projectView(project, view, drawingProjection) {
  return drawingProjection(project, { ids: view.sourceIds, view: view.kind });
}

function boreReference(curve, rootId, path) {
  const refs = curve?.sourceReferences;
  const reference = refs?.length === 1 && refs[0];
  return (
    curve?.kind === 'circle' &&
    !curve.hidden &&
    reference &&
    reference.role === CAD_DRAWING_BORE_ROLE &&
    reference.source.rootId === rootId &&
    reference.source.path.length === path.length &&
    reference.source.path.every((id, index) => id === path[index])
  );
}

// Restrict the first wrap to the proved drawing case. Only a current native
// single-body orthographic view may carry its resolved bore diameter forward.
export function prepareCadDrillDrawingRefresh(project, rootId, path, { oc, service, signal }) {
  const drawingProjection = createCadDrawingNative({ oc, service });
  const sourceSignatures = cadDrawingSourceSignatures(project, [rootId]);
  const plan = [];
  let dimensionCount = 0;
  for (const sheet of project.drawings?.sheets ?? []) {
    const views = sheet.views.filter(view => view.sourceIds.includes(rootId));
    if (!views.length) continue;
    const problems = cadDrawingProblems(sheet, { sourceSignatures });
    for (const view of views) {
      signal?.throwIfAborted();
      if (view.kind === 'section' || view.sourceIds.length !== 1 || problems.some(problem => problem.viewId === view.id))
        return null;
      const annotations = sheet.annotations.filter(annotation => annotation.viewId === view.id && annotation.kind !== 'label');
      const measures = [];
      if (annotations.length) {
        const native = projectView(project, view, drawingProjection);
        const proven = native.curves.filter(curve => boreReference(curve, rootId, path));
        if (proven.length !== 1) return null;
        const [circle] = proven;
        for (const annotation of annotations) {
          const measured = cadDrawingDimension(sheet, annotation);
          const [saved] = measured.curves;
          if (annotation.kind !== 'diameter' || saved.id !== circle.id || saved.kind !== 'circle' || saved.hidden ||
              saved.radius !== circle.radius || saved.center.some((coordinate, index) => coordinate !== circle.center[index]))
            return null;
          measures.push({ id: annotation.id, value: measured.value });
          dimensionCount++;
        }
      }
      plan.push({ sheetId: sheet.id, viewId: view.id, measures });
    }
  }
  return dimensionCount ? { rootId, drawingProjection, plans: plan } : null;
}

export function refreshCadDrillDrawings(project, { rootId, drawingProjection, plans }, path, signal) {
  const sourceSignatures = cadDrawingSourceSignatures(project, [rootId]);
  // Work on a separate copy so a failure cannot publish only some views.
  const drawings = structuredClone(project.drawings);
  for (const target of plans) {
    signal?.throwIfAborted();
    const sheetIndex = drawings.sheets.findIndex(sheet => sheet.id === target.sheetId);
    const sheet = drawings.sheets[sheetIndex];
    const view = sheet.views.find(view => view.id === target.viewId);
    const projection = projectView(project, view, drawingProjection),
      position = cadDrawingUpdatedPosition(view.position, view.projection, projection, sheet.scale);
    for (const measure of target.measures) {
      const annotation = sheet.annotations.find(annotation => annotation.id === measure.id);
      annotation.curveReferences = [{ sourceReferences: [{ source: { rootId, path: [...path] }, role: CAD_DRAWING_BORE_ROLE }] }];
    }
    const next = updateCadDrawingProjection(sheet, view.id, projection);
    next.views.find(candidate => candidate.id === view.id).position = position;
    if (cadDrawingProblems(next, { sourceSignatures }).some(problem => problem.viewId === view.id) ||
        target.measures.some(measure => {
          const annotation = next.annotations.find(annotation => annotation.id === measure.id);
          const current = cadDrawingDimension(next, annotation);
          return !boreReference(current.curves[0], rootId, path) || Math.abs(current.value - measure.value) > 1e-7;
        }))
      throw Object.assign(Error('Der Zeichnungsbezug auf den ursprünglichen Bohrungskreis konnte nicht eindeutig erhalten werden.'), {
        code: 'CAD_DRAWING_DRILL_REFERENCE_CHANGED',
      });
    drawings.sheets[sheetIndex] = next;
  }
  return drawings;
}
