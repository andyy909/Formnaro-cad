import { projectCadPlanarFaceNative } from './cad-topology-native.js';

export function cadSketchFaceHit(oc, service, support, point, normal) {
  // Display buffers hold Float32 coordinates, while the BRep uses doubles.
  const tolerance = Math.min(0.005, Math.max(1e-4, Math.hypot(...point) * 2e-7));
  const shape = service.worldShape(support);
  try {
    const matches = projectCadPlanarFaceNative(oc, shape, point, { normal, tolerance });
    if (matches.length !== 1) {
      const message = matches.length ? 'Mehrere ebene Flächen getroffen. Tippe ins Innere der gewünschten Fläche.'
        : 'Keine ebene CAD-Fläche getroffen. Wähle eine ebene Fläche.';
      throw Object.assign(Error(message), { code: matches.length ? 'AMBIGUOUS_CAD_FACE' : 'CAD_PLANAR_FACE_REQUIRED' });
    }
    return matches[0];
  } finally {
    shape.delete();
  }
}
