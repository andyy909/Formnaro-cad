import * as THREE from 'three';
import { meshDisplayGeometry } from './mesh-display-geometry.js';

// These are display buffers only. Bounds use the same Float32 positions as the
// raycast, so their broad-phase rejection does not alter native CAD geometry.
export function cadDisplayGeometry(mesh, reference = false) {
  const vertices = reference ? mesh.verts : mesh.vertices,
    triangles = mesh.triangles;
  if (!Array.isArray(vertices) || !Array.isArray(triangles)) throw Error('CAD-Anzeigepuffer fehlen.');
  let geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(triangles);
  if (!reference) {
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.normals, 3));
    geometry.userData.cadFaceGroups = [...mesh.faceGroups];
  } else {
    const indexed = geometry;
    geometry = meshDisplayGeometry(indexed);
    indexed.dispose();
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// Three.js raycasts invisible meshes too. Filter before the expensive triangle
// tests, retaining source-first ordering for coincident source/body displays.
function visibleIntersections(raycaster, sources, bodies) {
  return raycaster.intersectObjects(
    [...sources, ...bodies].filter((mesh) => mesh.visible),
    false,
  );
}

export function cadVisibleRayHit(raycaster, sources, bodies) {
  return visibleIntersections(raycaster, sources, bodies)[0];
}

export function cadVisibleRayTargets(raycaster, sources, bodies) {
  const targets = new Map();
  for (const { object, distance } of visibleIntersections(raycaster, sources, bodies)) {
    const { rootId, sourceTarget, simplified } = object.userData;
    if (!rootId) continue;
    const target = sourceTarget ?? { rootId, path: [] };
    const key = JSON.stringify([target.rootId, target.path]);
    if (targets.has(key)) continue;
    targets.set(key, { target, distance, simplified: !!simplified });
  }
  return [...targets.values()];
}
