import { cadDrawingProblems, cadDrawingSourceSignatures } from './cad-drawing-data.js';
import { cadDrawingSvg } from './cad-drawing-export.js';

async function drawingThumbnail(svg) {
  const source = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = Math.round((canvas.width * image.naturalHeight) / image.naturalWidth);
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/webp', 0.87);
  } finally {
    URL.revokeObjectURL(source);
  }
}

export async function showLabProject(
  runtime,
  cad,
  { project = cad.snapshot(), role = 'target', model = true, drawings = false, ids = null, sheetNames } = {},
) {
  if (!runtime.showReference || typeof document === 'undefined' || runtime.signal?.aborted) return;
  const pictures = [];
  const label = role === 'result' ? 'Ergebnis' : role === 'start' ? 'Ausgang' : 'Soll';
  if (model && project.nodes.length) {
    try {
      const { renderAIPreviewImages } = await import('./cad-ai-preview-images.js');
      const display = await cad.display(project, undefined, { ids });
      const { images } = renderAIPreviewImages(project, display, { benchmarkThumbnail: true });
      if (images[0]?.dataUrl) pictures.push({ kind: 'model', caption: label + 'modell', dataUrl: images[0].dataUrl });
    } catch {
      /* The visual evidence is optional for native verification. */
    }
  }
  if (drawings && !runtime.signal?.aborted) {
    const signatures = cadDrawingSourceSignatures(project);
    for (const sheet of (project.drawings?.sheets ?? [])
      .filter((item) => !sheetNames || sheetNames.includes(item.name))
      .slice(0, 3)) {
      const options = { sourceSignatures: signatures };
      if (cadDrawingProblems(sheet, options).length) continue;
      try {
        const dataUrl = await drawingThumbnail(cadDrawingSvg(sheet, options));
        pictures.push({ kind: 'drawing', caption: label + 'zeichnung · ' + sheet.name, dataUrl });
      } catch {
        /* An unrenderable sheet must not change the benchmark result. */
      }
    }
  }
  if (pictures.length && !runtime.signal?.aborted) runtime.showReference({ pictures, role });
}

export async function showLabProposal(runtime, cad, create, options) {
  if (!runtime.showReference || typeof document === 'undefined' || runtime.signal?.aborted) return;
  let proposal;
  try {
    proposal = await create();
    await showLabProject(runtime, cad, { ...options, project: proposal.project });
  } catch {
    // A reference image must not fail a native benchmark.
  } finally {
    if (proposal) cad.discard(proposal.previewId);
  }
}
