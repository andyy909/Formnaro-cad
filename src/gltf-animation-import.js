// Opt-in glTF 2.0 animation import for the exchange reader.
//
// This module only describes motion; it never changes the imported world-space
// meshes. The CAD renderer keeps receiving independent world meshes in
// millimetres with Z up. Tracks stay in their original glTF local space:
//
//   - `times` are non-negative seconds in strictly increasing order.
//   - `translation` uses metres on glTF's Y-up axes. `scale` is dimensionless.
//   - `rotation` values are XYZW quaternions in the target node's parent space.
//   - `values` are flat, one keyframe after another, exactly as stored in the
//     glTF accessor: SCALAR times plus VEC3 (translation/scale) or VEC4
//     (rotation) key values.
//
// A track addresses the original node by `nodeIndex`. Every imported part also
// carries that index, and the stable Formnaro part ID from the node extras when
// the exporter wrote one, so a clip can be bound without relying on names.
import { CAD_GLTF_PART_ID_KEY } from './cad-gltf-node-identity.js';

export const GLTF_ANIMATION_LIMITS = Object.freeze({
  animations: 64,
  channels: 1024,
  keyframes: 200000,
  seconds: 3600,
});

const fail = (message) => {
  throw Error(message);
};

/** Copies one scene node without changing its local TRS/matrix or hierarchy. */
export function gltfNodeRecord(node, index, parent) {
  const partId = node?.extras?.[CAD_GLTF_PART_ID_KEY];
  return {
    index,
    name: typeof node?.name === 'string' ? node.name : null,
    mesh: node?.mesh ?? null,
    parent,
    children: [...(node?.children ?? [])],
    matrix: Array.isArray(node?.matrix) ? [...node.matrix] : null,
    translation: Array.isArray(node?.translation) ? [...node.translation] : null,
    rotation: Array.isArray(node?.rotation) ? [...node.rotation] : null,
    scale: Array.isArray(node?.scale) ? [...node.scale] : null,
    partId: typeof partId === 'string' && partId ? partId : null,
  };
}

/** Adds the traceable node binding to one emitted part. */
export function bindGltfPartToNode(part, record) {
  part.nodeIndex = record.index;
  if (record.partId) part.partId = record.partId;
  return part;
}

/**
 * Reads and validates all animation clips. `accessor(index, size, {animation})`
 * is the reader's already validated accessor; it rejects non-Float32 data.
 */
export function gltfAnimationClips(document, accessor, hierarchy) {
  const animations = document.animations ?? [];
  if (!Array.isArray(animations)) fail('Ungültige glTF-Animationsliste.');
  if (animations.length > GLTF_ANIMATION_LIMITS.animations)
    fail(`glTF enthält zu viele Animationen (maximal ${GLTF_ANIMATION_LIMITS.animations}).`);
  const clips = [];
  let channelCount = 0,
    keyframeCount = 0;
  animations.forEach((animation, animationIndex) => {
    if (!animation || typeof animation !== 'object' || Array.isArray(animation)) fail('Ungültige glTF-Animation.');
    const channels = animation.channels,
      samplers = animation.samplers;
    if (!Array.isArray(channels) || !channels.length) fail('glTF-Animation ohne Kanäle.');
    if (!Array.isArray(samplers) || !samplers.length) fail('glTF-Animation ohne Sampler.');
    channelCount += channels.length;
    if (channelCount > GLTF_ANIMATION_LIMITS.channels)
      fail(`glTF enthält zu viele Animationskanäle (maximal ${GLTF_ANIMATION_LIMITS.channels}).`);
    const name =
      typeof animation.name === 'string' && animation.name.trim()
        ? animation.name.replace(/[\x00-\x1f]/g, ' ').slice(0, 200)
        : 'Animation ' + (animationIndex + 1);
    const seen = new Set(),
      tracks = [];
    for (const channel of channels) {
      const target = channel?.target;
      if (!target || typeof target !== 'object') fail('glTF-Animationskanal ohne Ziel.');
      if (!['translation', 'rotation', 'scale'].includes(target.path))
        fail('Nicht unterstützter glTF-Animationspfad: ' + String(target.path) + '.');
      const nodeIndex = target.node;
      if (!Number.isSafeInteger(nodeIndex) || nodeIndex < 0 || nodeIndex >= (document.nodes?.length ?? 0))
        fail('glTF-Animationsziel verweist auf keinen gültigen Knoten.');
      const node = hierarchy.byIndex.get(nodeIndex);
      if (!node) continue;
      if (node.matrix) fail('Animierte glTF-Knoten benötigen getrennte Lage, Drehung und Skalierung.');
      const key = nodeIndex + ':' + target.path;
      if (seen.has(key)) fail('Doppelter glTF-Animationskanal für denselben Knoten und Pfad.');
      seen.add(key);
      const sampler = Number.isSafeInteger(channel.sampler) && channel.sampler >= 0 ? samplers[channel.sampler] : null;
      if (!sampler || typeof sampler !== 'object' || Array.isArray(sampler)) fail('glTF-Animationssampler fehlt.');
      const interpolation = sampler.interpolation ?? 'LINEAR';
      if (!['LINEAR', 'STEP'].includes(interpolation))
        fail('Nicht unterstützte glTF-Interpolation: ' + String(interpolation) + '.');
      const times = accessor(sampler.input, 1, { animation: true });
      if (!times.length) fail('glTF-Animationsspur benötigt mindestens einen Zeitpunkt.');
      const components = target.path === 'rotation' ? 4 : 3,
        values = accessor(sampler.output, components, { animation: true });
      if (values.length !== times.length * components) fail('glTF-Animationswerte passen nicht zu den Zeitpunkten.');
      let previous = -Infinity;
      for (const time of times) {
        if (!(time >= 0)) fail('glTF-Animationszeiten dürfen nicht negativ sein.');
        if (!(time > previous)) fail('glTF-Animationszeiten müssen streng aufsteigend sein.');
        previous = time;
      }
      if (previous > GLTF_ANIMATION_LIMITS.seconds)
        fail(`glTF-Animationsdauer überschreitet das Zeitbudget von ${GLTF_ANIMATION_LIMITS.seconds} Sekunden.`);
      keyframeCount += times.length;
      if (keyframeCount > GLTF_ANIMATION_LIMITS.keyframes)
        fail(`glTF enthält zu viele Animationsschlüssel (maximal ${GLTF_ANIMATION_LIMITS.keyframes}).`);
      tracks.push({ nodeIndex, path: target.path, interpolation, times, values });
    }
    if (tracks.length)
      clips.push({
        name,
        duration: Math.max(...tracks.map((track) => track.times[track.times.length - 1])),
        tracks,
      });
  });
  return clips;
}
