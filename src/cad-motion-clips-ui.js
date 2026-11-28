import { compileCadMotionClip } from './cad-motion-clips.js';

export function cadMotionClipsPanel({ project, view, beforePreview }) {
  const sources = (project.motionClips?.scenes ?? []).flatMap((scene) => scene.clips.map((clip) => ({ scene, clip })));
  if (!sources.length) return null;

  const panel = document.createElement('fieldset');
  panel.innerHTML =
    '<legend>Importierte Bewegungsclips</legend><label>Clip<select data-motion-clip></select></label><label>Zeit (s)<input data-motion-time type="range" min="0" step="any"><output data-motion-value></output></label><div><button data-motion-play>Abspielen</button><button data-motion-reset>Ausgangsstellung</button></div><p data-motion-status role="status"></p>';
  const select = panel.querySelector('[data-motion-clip]'),
    time = panel.querySelector('[data-motion-time]'),
    value = panel.querySelector('[data-motion-value]'),
    play = panel.querySelector('[data-motion-play]'),
    restore = panel.querySelector('[data-motion-reset]'),
    status = panel.querySelector('[data-motion-status]');
  for (const [i, { scene, clip }] of sources.entries())
    select.add(new Option(clip.name + ' · ' + scene.source, String(i)));

  let compiled,
    frame = null,
    active = false;
  function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    play.textContent = 'Abspielen';
  }
  function display(t) {
    time.value = String(t);
    value.textContent = t.toFixed(2) + ' / ' + Number(time.max).toFixed(2);
  }
  function reset() {
    stop();
    if (!active) return;
    active = false;
    view.clearJointPreview();
    display(0);
  }
  function pick() {
    reset();
    const { scene, clip } = sources[Number(select.value)];
    time.max = String(clip.duration);
    display(0);
    try {
      compiled = compileCadMotionClip(scene, clip, project.nodes);
      status.textContent = compiled.boundParts
        ? ''
        : 'Die zugehörigen Teile sind in diesem Projekt nicht mehr vorhanden.';
    } catch (error) {
      compiled = null;
      status.textContent = error.message;
    }
    play.disabled = time.disabled = !compiled?.boundParts;
  }
  function show(t) {
    try {
      if (!active) beforePreview();
      view.setJointPreview(compiled.placements(t));
      active = true;
      display(t);
      status.textContent = '';
      return true;
    } catch (error) {
      reset();
      status.textContent = error.message;
      return false;
    }
  }
  select.onchange = pick;
  restore.onclick = reset;
  time.oninput = () => {
    stop();
    show(Number(time.value));
  };
  play.onclick = () => {
    if (frame !== null) {
      stop();
      return;
    }
    const end = Number(time.max),
      offset = Number(time.value) >= end ? 0 : Number(time.value);
    if (!show(offset) || end === 0) return;
    const start = performance.now();
    play.textContent = 'Pause';
    const tick = (now) => {
      const elapsed = Math.min(end, offset + (now - start) / 1000);
      if (!show(elapsed) || elapsed >= end) stop();
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  };
  pick();
  return { panel, reset, dispose: stop };
}
