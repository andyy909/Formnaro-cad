// Drawing edits own no geometry. Compare every other persisted field before
// reusing a native proof; the caller cannot smuggle an unbuilt body into it.
export function drawingModelKey(project) {
  return JSON.stringify(
    Object.fromEntries(Object.entries(project).filter(([key]) => !['drawings', 'version'].includes(key))),
  );
}
export function parameterModelKey(project) {
  return JSON.stringify(
    Object.fromEntries(Object.entries(project).filter(([key]) => !['projectParameters', 'version'].includes(key))),
  );
}
export function contourModelKey(project) {
  return JSON.stringify(
    Object.fromEntries(Object.entries(project).filter(([key]) => !['contourLinks', 'version'].includes(key))),
  );
}
export function mergeDrawingUpdateReports(before, after) {
  if (!before) return after;
  if (!after) return before;
  const out = { ...before, ...after };
  for (const key of [
    'affectedIds',
    'stateChangedIds',
    'rebuiltIds',
    'constructedIds',
    'updatedLinkIds',
    'removedLinkIds',
    'updatedSheetIds',
    'updatedViewIds',
  ])
    if (before[key] || after[key]) out[key] = [...new Set([...(before[key] ?? []), ...(after[key] ?? [])])];
  if (before.counts || after.counts)
    out.counts = Object.fromEntries(
      [...new Set([...Object.keys(before.counts ?? {}), ...Object.keys(after.counts ?? {})])].map((id) => [
        id,
        (before.counts?.[id] ?? 0) + (after.counts?.[id] ?? 0),
      ]),
    );
  if (before.metadataOnly !== undefined || after.metadataOnly !== undefined)
    out.metadataOnly = before.metadataOnly === true && after.metadataOnly === true;
  return out;
}
