import { Matrix3, Matrix4, Quaternion, Vector3 } from 'three';

/** The body's local face anchor is authoritative; resolve its current world pose. */
export function cadAttachedSketchFrame(workplane, transform) {
  const { point, normal, tangent } = workplane.reference.topology.anchor;
  const matrix = new Matrix4().fromArray(transform), linear = new Matrix3().setFromMatrix4(matrix);
  const origin = new Vector3(...point).applyMatrix4(matrix);
  const z = new Vector3(...normal).applyMatrix3(new Matrix3().getNormalMatrix(matrix)).normalize();
  const x = new Vector3(...tangent).applyMatrix3(linear);
  x.addScaledVector(z, -x.dot(z));
  if (z.lengthSq() < 0.5 || x.lengthSq() < 1e-20) throw Error('Skizzenbezug hat keine eindeutige Fläche.');
  x.normalize();
  const y = new Vector3().crossVectors(z, x);
  const orientation = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z)).normalize();
  return { ...workplane, origin: origin.toArray(), orientation: orientation.toArray() };
}
