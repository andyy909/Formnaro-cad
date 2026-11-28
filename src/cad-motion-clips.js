import { Matrix4, Quaternion, Vector3 } from 'three';

export const CAD_MOTION_LIMITS = Object.freeze({
  scenes: 32,
  nodes: 10000,
  depth: 48,
  clips: 64,
  tracks: 1024,
  keys: 200000,
  seconds: 3600,
});

const basis = new Matrix4().set(1000, 0, 0, 0, 0, 0, -1000, 0, 0, 1000, 0, 0, 0, 0, 0, 1);
const translate = [0, 0, 0];
const rotate = [0, 0, 0, 1];
const scale = [1, 1, 1];
const error = (message) => {
  throw Error('Bewegungsclip: ' + message);
};
const name = (value) => typeof value === 'string' && value.length <= 200 && value.trim().length > 0;
const index = (value) => Number.isSafeInteger(value) && value >= 0;
const numbers = (value, length) => Array.isArray(value) && value.length === length && value.every(Number.isFinite);
const quaternion = (value) => Math.abs(value.reduce((sum, x) => sum + x * x, 0) - 1) <= 1e-4;
const shape = (value, fields) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).every((key) => fields.includes(key));

function localMatrix(node, values = {}) {
  if (node.matrix) return new Matrix4().fromArray(node.matrix);
  const rotation = new Quaternion(...(values.rotation ?? node.rotation));
  if (values.rotation) rotation.normalize();
  return new Matrix4().compose(
    new Vector3(...(values.translation ?? node.translation)),
    rotation,
    new Vector3(...(values.scale ?? node.scale)),
  );
}

export function validateCadMotionClips(value) {
  const limits = CAD_MOTION_LIMITS;
  if (
    !shape(value, ['version', 'scenes']) ||
    value.version !== 1 ||
    !Array.isArray(value.scenes) ||
    !value.scenes.length ||
    value.scenes.length > limits.scenes
  )
    error('Ungültige Clip-Sammlung.');
  let nodeCount = 0,
    clipCount = 0,
    trackCount = 0,
    keyCount = 0;
  const rootIds = new Set();
  for (const scene of value.scenes) {
    if (
      !shape(scene, ['source', 'nodes', 'bindings', 'clips']) ||
      !name(scene.source) ||
      !Array.isArray(scene.nodes) ||
      !scene.nodes.length ||
      !Array.isArray(scene.bindings) ||
      !scene.bindings.length ||
      scene.bindings.length > 500 ||
      !Array.isArray(scene.clips) ||
      !scene.clips.length
    )
      error('Ungültige Szene.');
    nodeCount += scene.nodes.length;
    clipCount += scene.clips.length;
    if (nodeCount > limits.nodes || clipCount > limits.clips) error('Zu viele Szenenknoten oder Clips.');
    const depths = new Map(),
      matrices = new Set();
    for (const node of scene.nodes) {
      if (
        !shape(node, ['index', 'parent', 'matrix', 'translation', 'rotation', 'scale']) ||
        !index(node.index) ||
        depths.has(node.index) ||
        (node.parent !== null && !depths.has(node.parent))
      )
        error('Ungültige Knotenhierarchie.');
      const depth = node.parent === null ? 1 : depths.get(node.parent) + 1;
      if (depth > limits.depth) error('Knotenhierarchie ist zu tief.');
      depths.set(node.index, depth);
      if (node.matrix !== undefined) {
        const m = node.matrix;
        if (
          !numbers(m, 16) ||
          m[3] ||
          m[7] ||
          m[11] ||
          m[15] !== 1 ||
          node.translation !== undefined ||
          node.rotation !== undefined ||
          node.scale !== undefined
        )
          error('Ungültige lokale Matrix.');
        matrices.add(node.index);
      } else if (
        !numbers(node.translation, 3) ||
        !numbers(node.rotation, 4) ||
        !quaternion(node.rotation) ||
        !numbers(node.scale, 3)
      )
        error('Ungültige lokale Transformation.');
      const determinant = localMatrix(node).determinant();
      if (!Number.isFinite(determinant) || determinant === 0) error('Lokale Transformation ist nicht umkehrbar.');
    }
    for (const binding of scene.bindings) {
      if (
        !shape(binding, ['nodeIndex', 'rootId']) ||
        !depths.has(binding.nodeIndex) ||
        !name(binding.rootId) ||
        rootIds.has(binding.rootId)
      )
        error('Ungültige Teilezuordnung.');
      rootIds.add(binding.rootId);
    }
    for (const clip of scene.clips) {
      if (
        !shape(clip, ['name', 'duration', 'tracks']) ||
        !name(clip.name) ||
        !Array.isArray(clip.tracks) ||
        !clip.tracks.length
      )
        error('Ungültiger Clip.');
      trackCount += clip.tracks.length;
      if (trackCount > limits.tracks) error('Zu viele Animationsspuren.');
      const seen = new Set();
      let duration = 0;
      for (const track of clip.tracks) {
        if (
          !shape(track, ['nodeIndex', 'path', 'interpolation', 'times', 'values']) ||
          !depths.has(track.nodeIndex) ||
          matrices.has(track.nodeIndex) ||
          !['translation', 'rotation', 'scale'].includes(track.path) ||
          !['LINEAR', 'STEP'].includes(track.interpolation) ||
          !Array.isArray(track.times) ||
          !track.times.length
        )
          error('Ungültige Animationsspur.');
        const key = track.nodeIndex + ':' + track.path;
        if (seen.has(key)) error('Doppelte Animationsspur.');
        seen.add(key);
        keyCount += track.times.length;
        if (keyCount > limits.keys) error('Zu viele Animationsschlüssel.');
        const size = track.path === 'rotation' ? 4 : 3;
        if (!numbers(track.values, size * track.times.length)) error('Ungültige Animationswerte.');
        let previous = -Infinity;
        for (let i = 0; i < track.times.length; i++) {
          const time = track.times[i];
          if (!Number.isFinite(time) || time < 0 || time <= previous || time > limits.seconds)
            error('Ungültige Zeitachse.');
          previous = time;
          const offset = size * i;
          if (track.path === 'rotation' && !quaternion(track.values.slice(offset, offset + size)))
            error('Ungültiges Rotationsquaternion.');
          if (
            track.path === 'scale' &&
            track.values
              .slice(offset, offset + 3)
              .some(
                (x, j) =>
                  x === 0 ||
                  (i > 0 &&
                    track.interpolation === 'LINEAR' &&
                    Math.sign(x) !== Math.sign(track.values[offset - 3 + j])),
              )
          )
            error('Die Skalierung würde ein Teil auf null verkleinern.');
        }
        duration = Math.max(duration, previous);
      }
      if (clip.duration !== duration) error('Clip-Dauer passt nicht zur Zeitachse.');
    }
  }
  return structuredClone(value);
}

export function cadMotionScene(exchange, rootIds, source) {
  const byIndex = new Map(exchange.nodes.map((node) => [node.index, node]));
  const ordered = new Map();
  function add(index) {
    if (ordered.has(index)) return;
    const node = byIndex.get(index);
    if (node.parent !== null) add(node.parent);
    const { parent, matrix, translation, rotation, scale: nodeScale } = node;
    ordered.set(
      index,
      matrix
        ? { index, parent, matrix }
        : {
            index,
            parent,
            translation: translation ?? translate,
            rotation: rotation ?? rotate,
            scale: nodeScale ?? scale,
          },
    );
  }
  const bindings = exchange.parts.map((part, i) => ({ nodeIndex: part.nodeIndex, rootId: rootIds[i] }));
  for (const { nodeIndex } of bindings) add(nodeIndex);
  const clips = exchange.clips.flatMap((clip) => {
    const tracks = clip.tracks
      .filter((track) => ordered.has(track.nodeIndex))
      .map((track) => ({
        ...track,
        times: Array.from(track.times),
        values: Array.from(track.values),
      }));
    return tracks.length ? [{ ...clip, duration: Math.max(...tracks.map((track) => track.times.at(-1))), tracks }] : [];
  });
  return clips.length ? { source: source.trim().slice(0, 200), nodes: [...ordered.values()], bindings, clips } : null;
}

export function remapCadMotionClips(motion, ids) {
  return (
    motion?.scenes.flatMap((scene) => {
      const bindings = scene.bindings.flatMap(({ nodeIndex, rootId }) =>
        ids.has(rootId) ? [{ nodeIndex, rootId: ids.get(rootId) }] : [],
      );
      return bindings.length ? [{ ...scene, bindings }] : [];
    }) ?? []
  );
}

function sample({ times, values, path, interpolation }, t) {
  let lo = 0,
    hi = times.length - 1;
  const size = path === 'rotation' ? 4 : 3;
  if (t <= times[lo]) return values.slice(0, size);
  if (t >= times[hi]) return values.slice(hi * size, (hi + 1) * size);
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (times[mid] > t) hi = mid;
    else lo = mid;
  }
  const before = values.slice(lo * size, (lo + 1) * size);
  if (interpolation === 'STEP') return before;
  const after = values.slice(hi * size, (hi + 1) * size);
  const u = (t - times[lo]) / (times[hi] - times[lo]);
  if (path === 'rotation')
    return new Quaternion(...before)
      .normalize()
      .slerp(new Quaternion(...after).normalize(), u)
      .toArray();
  return before.map((value, i) => value * (1 - u) + after[i] * u);
}

export function compileCadMotionClip(scene, clip, projectNodes) {
  const projectById = new Map(projectNodes.map((node) => [node.id, node]));
  const tracks = new Map();
  for (const track of clip.tracks) {
    if (!tracks.has(track.nodeIndex)) tracks.set(track.nodeIndex, []);
    tracks.get(track.nodeIndex).push(track);
  }
  const base = new Map(),
    affected = new Set();
  for (const node of scene.nodes) {
    const local = localMatrix(node);
    base.set(node.index, node.parent === null ? local : base.get(node.parent).clone().multiply(local));
    if (tracks.has(node.index) || affected.has(node.parent)) affected.add(node.index);
  }
  const bindings = scene.bindings
    .filter(({ nodeIndex, rootId }) => affected.has(nodeIndex) && projectById.has(rootId))
    .map(({ nodeIndex, rootId }) => {
      const current = new Matrix4().fromArray(projectById.get(rootId).transform).multiply(basis);
      const rest = base.get(nodeIndex).clone();
      if (!Number.isFinite(rest.determinant()) || rest.determinant() === 0) error('Szenenlage ist nicht umkehrbar.');
      // The imported mesh is already in CAD world space. Undo the glTF rest
      // transform, then apply the animated pose inside the current CAD placement.
      return { nodeIndex, rootId, current, inverse: rest.invert().multiply(current.clone().invert()) };
    });
  return {
    boundParts: bindings.length,
    placements(t) {
      if (!Number.isFinite(t)) error('Ungültige Wiedergabezeit.');
      const world = new Map();
      for (const node of scene.nodes) {
        if (!affected.has(node.index)) continue;
        const values = {};
        for (const track of tracks.get(node.index) ?? []) values[track.path] = sample(track, t);
        const local = localMatrix(node, values);
        const parent = world.get(node.parent) ?? base.get(node.parent);
        world.set(node.index, parent ? parent.clone().multiply(local) : local);
      }
      return bindings.map(({ nodeIndex, rootId, current, inverse }) => {
        const delta = current.clone().multiply(world.get(nodeIndex)).multiply(inverse).toArray();
        delta[15] = 1; // Every factor is affine. Remove roundoff from the homogeneous entry.
        return { rootId, delta };
      });
    },
  };
}
